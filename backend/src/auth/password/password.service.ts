import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { APP_ENV } from '../../config/app-env.module';
import { AppEnv } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../../sms/sms-provider';
import { AuthService } from '../auth.service';
import { ChangePasswordDto } from '../dto/password.dto';
import { generateOtp, generateResetToken, hashOtp, hashResetToken, safeEqualHex } from './otp';

const logger = new Logger('Password');

// Kod noto'g'ri, muddati o'tgan, urinishlar tugagan yoki raqam mavjud emas: hammasida bir xil xabar
const INVALID_CODE = "Kod noto'g'ri yoki muddati o'tgan. Yangi kod so'rang";
const INVALID_TOKEN = "Tiklash sessiyasi yaroqsiz yoki muddati o'tgan. Jarayonni qaytadan boshlang";
const DUMMY_HASH = '0'.repeat(64);

@Injectable()
export class PasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  // ---------- Parolni o'zgartirish (tizimga kirgan foydalanuvchi) ----------

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, phone: true, role: true, passwordHash: true },
    });
    // 400 (401 emas): frontend 401 ni "sessiya tugagan" deb talqin qilib chiqarib yubormasligi uchun
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException("Joriy parol noto'g'ri");
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('Yangi parol joriy paroldan farq qilishi kerak');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      // tokenVersion oshadi: barcha eski tokenlar (boshqa qurilmalar, o'g'irlangan token) darhol yaroqsiz bo'ladi
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10), tokenVersion: { increment: 1 } },
      select: { id: true, role: true, tokenVersion: true },
    });
    this.notify(user.phone, "AgrarGo: parolingiz o'zgartirildi. Bu siz bo'lmasangiz, darhol parolni tiklang.");
    return {
      accessToken: this.auth.signAccessToken(updated), // joriy qurilma tizimda qoladi
      message: "Parol yangilandi. Boshqa qurilmalardagi sessiyalar yopildi.",
    };
  }

  // ---------- 1-qadam: SMS kod so'rash ----------

  /**
   * Raqam ro'yxatdan o'tgan yoki o'tmaganidan qat'i nazar javob bir xil (akkaunt mavjudligi oshkor bo'lmaydi).
   * SMS javobni kutmasdan yuboriladi, shuning uchun javob vaqti ham farq qilmaydi.
   */
  async forgotPassword(phone: string) {
    const generic = {
      message: "Agar raqam ro'yxatdan o'tgan bo'lsa, tasdiqlash kodi SMS orqali yuborildi",
      expiresInSeconds: this.env.OTP_TTL_SECONDS,
      resendAfterSeconds: this.env.OTP_RESEND_COOLDOWN_SECONDS,
    };
    const code = generateOtp();
    const codeHash = hashOtp(this.env.JWT_SECRET, phone, code); // mavjud bo'lmagan raqam uchun ham xuddi shu ish bajariladi

    const user = await this.prisma.user.findUnique({ where: { phone }, select: { id: true, isActive: true } });
    if (!user || !user.isActive) return generic;

    const now = new Date();
    await this.prisma.$transaction([
      // Eski faol kodlar bekor qilinadi: bir vaqtda faqat bitta kod yaroqli
      this.prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null, OR: [{ expiresAt: { gt: now } }, { resetTokenExpiresAt: { gt: now } }] },
        data: { usedAt: now },
      }),
      this.prisma.passwordReset.create({
        data: { userId: user.id, codeHash, expiresAt: new Date(now.getTime() + this.env.OTP_TTL_SECONDS * 1000) },
      }),
      // Eskirgan yozuvlarni tozalash
      this.prisma.passwordReset.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } } }),
    ]);

    this.notify(phone, `AgrarGo: tasdiqlash kodi ${code}. Hech kimga bermang. ${Math.round(this.env.OTP_TTL_SECONDS / 60)} daqiqa amal qiladi.`);
    // Faqat development/test'da: SMS yuborilmaydigan simulyatsiya rejimida kodni olish uchun. Production'da hech qachon.
    return this.env.NODE_ENV !== 'production' ? { ...generic, devCode: code } : generic;
  }

  // ---------- 2-qadam: kodni tasdiqlash ----------

  async verifyResetCode(phone: string, code: string) {
    const expected = hashOtp(this.env.JWT_SECRET, phone, code);
    const user = await this.prisma.user.findUnique({ where: { phone }, select: { id: true, isActive: true } });
    if (!user || !user.isActive) {
      safeEqualHex(expected, DUMMY_HASH); // vaqt farqini kamaytirish
      throw new BadRequestException(INVALID_CODE);
    }

    const now = new Date();
    const row = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, verifiedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new BadRequestException(INVALID_CODE);

    // Urinish o'rni solishtirishdan OLDIN atomik band qilinadi: parallel so'rovlar bilan ham
    // bitta kodga ko'pi bilan OTP_MAX_ATTEMPTS ta taxmin qilish mumkin (to'g'ri javob ham bitta urinish hisoblanadi).
    const slot = await this.prisma.passwordReset.updateMany({
      where: { id: row.id, usedAt: null, verifiedAt: null, attempts: { lt: this.env.OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (slot.count === 0) throw new BadRequestException(INVALID_CODE);
    if (!safeEqualHex(row.codeHash, expected)) throw new BadRequestException(INVALID_CODE);

    const resetToken = generateResetToken();
    const ttl = this.env.RESET_TOKEN_TTL_SECONDS;
    const verified = await this.prisma.passwordReset.updateMany({
      where: { id: row.id, usedAt: null, verifiedAt: null, expiresAt: { gt: new Date() } },
      data: { verifiedAt: new Date(), resetTokenHash: hashResetToken(resetToken), resetTokenExpiresAt: new Date(Date.now() + ttl * 1000) },
    });
    if (verified.count === 0) throw new BadRequestException(INVALID_CODE);
    return { resetToken, expiresInSeconds: ttl };
  }

  // ---------- 3-qadam: yangi parol ----------

  async resetPassword(resetToken: string, newPassword: string) {
    const tokenHash = hashResetToken(resetToken);
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const phone = await this.prisma.$transaction(async (tx) => {
      // Bir martalik: atomik "egallash" (parallel ikkinchi so'rov o'tmaydi)
      const claimed = await tx.passwordReset.updateMany({
        where: { resetTokenHash: tokenHash, verifiedAt: { not: null }, usedAt: null, resetTokenExpiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw new BadRequestException(INVALID_TOKEN);

      const row = await tx.passwordReset.findUniqueOrThrow({ where: { resetTokenHash: tokenHash }, select: { userId: true } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: row.userId }, select: { id: true, phone: true, isActive: true } });
      if (!user.isActive) throw new BadRequestException(INVALID_TOKEN);

      await tx.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
      // Shu foydalanuvchining boshqa ochiq kod/tokenlari ham bekor qilinadi
      await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      return user.phone;
    });

    this.notify(phone, "AgrarGo: parolingiz tiklandi. Bu siz bo'lmasangiz, darhol qo'llab-quvvatlashga murojaat qiling.");
    return { message: "Parol yangilandi. Yangi parol bilan tizimga kiring." };
  }

  /** SMS javobni kutmasdan yuboriladi; xato foydalanuvchiga emas, jurnalga yoziladi. */
  private notify(phone: string, text: string) {
    void this.sms.send(phone, text).catch((e: Error) => logger.error(`SMS yuborilmadi (${phone.slice(0, 7)}***): ${e.message}`));
  }
}
