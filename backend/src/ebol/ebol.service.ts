import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms-provider';
import { EBolKind, contractFingerprint, generatePickupCode, hashPickupCode, maskPhone, pickupCodeMatches } from './ebol-otp';

export const EBOL_MAX_ATTEMPTS = 5;
export const EBOL_RESEND_COOLDOWN_SEC = 60;

type Tx = Prisma.TransactionClient;
const logger = new Logger('EBOL');

/**
 * e-BOL (elektron yuk xati): olish paytida fermer telefoniga 4 xonali kod yuboriladi, haydovchi uni kiritganda yuk imzolanadi.
 * Servis faqat kod va shartnomani boshqaradi; yuk holatini o'tkazish (Shipment/LocalOrder) chaqiruvchi tranzaksiyasida.
 */
@Injectable()
export class EBolService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  get enforced() { return this.env.EBOL_ENFORCE; }

  private table(kind: EBolKind, db: PrismaService | Tx = this.prisma): any {
    return kind === 'SHIPMENT' ? db.shipment : db.localOrder;
  }

  /** Yangi kod yaratadi, hash'ini saqlaydi va fermer telefoniga yuboradi (oldingi kod bekor bo'ladi). Kodning o'zi hech qayerga qaytarilmaydi. */
  async issue(kind: EBolKind, id: string, farmerPhone: string) {
    const ttlMs = this.env.EBOL_OTP_TTL_MIN * 60_000;
    const row = await this.table(kind).findUnique({ where: { id }, select: { isSigned: true, pickupOtpExpiresAt: true } });
    if (!row) throw new NotFoundException('Yuk topilmadi');
    if (row.isSigned) throw new ConflictException('Yuk allaqachon imzolangan');
    const now = Date.now();
    if (row.pickupOtpExpiresAt) {
      const wait = row.pickupOtpExpiresAt.getTime() - ttlMs + EBOL_RESEND_COOLDOWN_SEC * 1000 - now; // yuborilgan vaqt = tugash - TTL
      if (wait > 0) throw new HttpException(`Kod yaqinda yuborilgan. ${Math.ceil(wait / 1000)} soniyadan keyin qayta urinib ko'ring`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = generatePickupCode();
    const expiresAt = new Date(now + ttlMs);
    const saved = await this.table(kind).updateMany({
      where: { id, isSigned: false },
      data: { pickupOtp: hashPickupCode(this.env.JWT_SECRET, kind, id, code), pickupOtpExpiresAt: expiresAt, pickupOtpAttempts: 0 },
    });
    if (saved.count === 0) throw new ConflictException('Yuk allaqachon imzolangan');
    try {
      await this.sms.send(farmerPhone, `AgrarGo e-BOL: yukni topshirish kodi ${code}. Faqat haydovchi yukni olayotganda ayting. ${this.env.EBOL_OTP_TTL_MIN} daqiqa amal qiladi.`);
    } catch (e) {
      logger.error(`e-BOL SMS yuborilmadi (${kind} ${id}): ${(e as Error).message}`);
      await this.table(kind).updateMany({ where: { id }, data: { pickupOtp: null, pickupOtpExpiresAt: null } });
      throw new ServiceUnavailableException("SMS yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring");
    }
    return { sent: true, phone: maskPhone(farmerPhone), expiresAt, resendAfterSeconds: EBOL_RESEND_COOLDOWN_SEC };
  }

  /** Kodni tekshiradi (urinishlar cheklangan, taqqoslash doimiy vaqtda). Muvaffaqiyatli bo'lsa jim tugaydi, aks holda istisno. */
  async verify(kind: EBolKind, id: string, code: string) {
    const row = await this.table(kind).findUnique({ where: { id }, select: { isSigned: true, pickupOtp: true, pickupOtpExpiresAt: true } });
    if (!row) throw new NotFoundException('Yuk topilmadi');
    if (row.isSigned) throw new ConflictException('Yuk allaqachon imzolangan');
    if (!row.pickupOtp || !row.pickupOtpExpiresAt) throw new BadRequestException('Avval kodni yuborish kerak');
    if (row.pickupOtpExpiresAt.getTime() < Date.now()) throw new BadRequestException("Kod muddati tugagan. Yangi kod so'rang");
    // Urinishni oldindan band qilamiz: parallel so'rovlar bilan cheklovni aylanib o'tib bo'lmaydi
    const reserved = await this.table(kind).updateMany({ where: { id, isSigned: false, pickupOtpAttempts: { lt: EBOL_MAX_ATTEMPTS } }, data: { pickupOtpAttempts: { increment: 1 } } });
    if (reserved.count === 0) throw new HttpException("Urinishlar tugadi. Yangi kod so'rang", HttpStatus.TOO_MANY_REQUESTS);
    if (!pickupCodeMatches(this.env.JWT_SECRET, kind, id, code, row.pickupOtp)) throw new BadRequestException("Kod noto'g'ri");
  }

  /**
   * Imzoni yakunlaydi (chaqiruvchining tranzaksiyasida): isSigned=true, kod o'chadi, EBolContract yoziladi.
   * Parallel imzo ikkinchi marta o'tmaydi (isSigned shart bilan band qilinadi).
   */
  async finalize(tx: Tx, p: { kind: EBolKind; id: string; driverId: string; farmerId: string }) {
    const claimed = await this.table(p.kind, tx).updateMany({
      where: { id: p.id, isSigned: false },
      data: { isSigned: true, pickupOtp: null, pickupOtpExpiresAt: null, pickupOtpAttempts: 0 },
    });
    if (claimed.count === 0) throw new ConflictException('Yuk allaqachon imzolangan');
    const signedAt = new Date();
    return tx.eBolContract.create({
      data: {
        ...(p.kind === 'SHIPMENT' ? { shipmentId: p.id } : { localOrderId: p.id }),
        driverId: p.driverId, farmerId: p.farmerId, signedAt,
        contractHash: contractFingerprint({ kind: p.kind, refId: p.id, driverId: p.driverId, farmerId: p.farmerId, signedAt }),
      },
    });
  }
}
