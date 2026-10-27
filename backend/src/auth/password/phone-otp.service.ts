import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../../config/app-env.module';
import { AppEnv } from '../../config/env.validation';
import { roleTakenMessage } from '../../common/role-labels';
import { PrismaService } from '../../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../../sms/sms-provider';
import { generateOtp, generateResetToken, hashOtp, hashResetToken, safeEqualHex } from './otp';

const logger = new Logger('PhoneOtp');
const INVALID_CODE = "Kod noto'g'ri yoki muddati o'tgan. Yangi kod so'rang";
export const OTP_REQUIRED_MESSAGE = "Telefon raqam SMS kod bilan tasdiqlanmagan. Avval «Kodni yuborish» orqali raqamni tasdiqlang";

/** Ro'yxatdan o'tishda telefonni SMS kod bilan tasdiqlash (akkaunt hali yo'q, shuning uchun raqam bo'yicha) */
@Injectable()
export class PhoneOtpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /** Kod yuboriladi. Raqam allaqachon ro'yxatdan o'tgan bo'lsa 409 (ro'yxatdan o'tishning o'zi ham shunday javob beradi). */
  async send(phone: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone }, select: { role: true } });
    if (existing) throw new ConflictException(roleTakenMessage(existing.role));

    const code = generateOtp(this.env.OTP_LENGTH);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.phoneVerification.updateMany({ where: { phone, usedAt: null }, data: { usedAt: now } }), // bir vaqtda bitta kod
      this.prisma.phoneVerification.create({
        data: { phone, codeHash: hashOtp(this.env.JWT_SECRET, phone, code), expiresAt: new Date(now.getTime() + this.env.OTP_TTL_SECONDS * 1000) },
      }),
      this.prisma.phoneVerification.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } } }),
    ]);
    void this.sms
      .send(phone, `AgrarGo: ro'yxatdan o'tish kodi ${code}. Hech kimga bermang. ${Math.round(this.env.OTP_TTL_SECONDS / 60)} daqiqa amal qiladi.`)
      .catch((e: Error) => logger.error(`SMS yuborilmadi (${phone.slice(0, 7)}***): ${e.message}`));
    const generic = {
      message: 'Tasdiqlash kodi SMS orqali yuborildi',
      expiresInSeconds: this.env.OTP_TTL_SECONDS,
      resendAfterSeconds: this.env.OTP_RESEND_COOLDOWN_SECONDS,
      otpLength: this.env.OTP_LENGTH,
    };
    // Simulyatsiya (haqiqiy SMS provayder yo'q) yoki development: kod javobda qaytariladi, interfeysda toast/modalda ko'rsatiladi
    const simulated = this.sms.name === 'simulated' || this.env.NODE_ENV !== 'production';
    return simulated ? { ...generic, simulated: true, devCode: code } : generic;
  }

  /** Kodni tasdiqlaydi va bir martalik otpToken beradi (ro'yxatdan o'tish so'roviga qo'shiladi) */
  async verify(phone: string, code: string) {
    const expected = hashOtp(this.env.JWT_SECRET, phone, code);
    const now = new Date();
    const row = await this.prisma.phoneVerification.findFirst({
      where: { phone, usedAt: null, verifiedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new BadRequestException(INVALID_CODE);
    // Urinish solishtirishdan oldin atomik band qilinadi (parallel so'rovlar bilan ham OTP_MAX_ATTEMPTS dan ortiq taxmin yo'q)
    const slot = await this.prisma.phoneVerification.updateMany({
      where: { id: row.id, usedAt: null, verifiedAt: null, attempts: { lt: this.env.OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (slot.count === 0 || !safeEqualHex(row.codeHash, expected)) throw new BadRequestException(INVALID_CODE);

    const otpToken = generateResetToken();
    const ttl = this.env.RESET_TOKEN_TTL_SECONDS;
    const ok = await this.prisma.phoneVerification.updateMany({
      where: { id: row.id, usedAt: null, verifiedAt: null, expiresAt: { gt: new Date() } },
      data: { verifiedAt: new Date(), tokenHash: hashResetToken(otpToken), tokenExpiresAt: new Date(Date.now() + ttl * 1000) },
    });
    if (ok.count === 0) throw new BadRequestException(INVALID_CODE);
    return { verified: true, otpToken, expiresInSeconds: ttl };
  }

  /** Token shu raqam uchun tasdiqlangan va hali ishlatilmaganmi (ishlatmasdan tekshiradi) */
  async isValid(phone: string, otpToken: string | undefined): Promise<boolean> {
    if (!otpToken) return false;
    const row = await this.prisma.phoneVerification.findUnique({ where: { tokenHash: hashResetToken(otpToken) } });
    return !!row && row.phone === phone && !!row.verifiedAt && !row.usedAt && !!row.tokenExpiresAt && row.tokenExpiresAt > new Date();
  }

  /** Token bir martalik: foydalanuvchi yaratilgach sarflanadi */
  async consume(otpToken: string | undefined) {
    if (!otpToken) return;
    await this.prisma.phoneVerification.updateMany({ where: { tokenHash: hashResetToken(otpToken), usedAt: null }, data: { usedAt: new Date() } });
  }
}
