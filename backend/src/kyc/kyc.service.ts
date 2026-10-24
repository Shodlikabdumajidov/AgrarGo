import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { KycDocType, KycStatus, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import { join } from 'path';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { detectImageExt } from '../profile/profile.service';
import { TrustService } from '../trust/trust.service';

/** KYC hujjatlari ommaviy /uploads'dan TASHQARIDA saqlanadi (faqat egasi va administrator oladi) */
export const KYC_DIR = join(process.cwd(), 'private', 'kyc');
export const MAX_KYC_BYTES = 5 * 1024 * 1024;
export const DRIVER_DOCS: KycDocType[] = [KycDocType.ID_CARD, KycDocType.DRIVER_LICENSE, KycDocType.TECH_PASSPORT, KycDocType.FACE];
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

@Injectable()
export class KycService {
  constructor(private readonly prisma: PrismaService, private readonly trust: TrustService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  parseType(raw: string): KycDocType {
    if (!(DRIVER_DOCS as string[]).includes(raw)) throw new BadRequestException("Hujjat turi noto'g'ri");
    return raw as KycDocType;
  }

  async status(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, isVerified: true, verifiedAt: true, kycStatus: true, kycRejectReason: true, kycDocuments: { select: { type: true, updatedAt: true } } } });
    if (!u) throw new NotFoundException('Foydalanuvchi topilmadi');
    const docs = Object.fromEntries(DRIVER_DOCS.map((t) => [t, u.kycDocuments.find((d) => d.type === t)?.updatedAt ?? null]));
    return {
      status: u.kycStatus, isVerified: u.isVerified, verifiedAt: u.verifiedAt, rejectReason: u.kycRejectReason,
      required: u.role === Role.DRIVER ? DRIVER_DOCS : [], docs, simulated: this.env.KYC_ALLOW_SIMULATION,
    };
  }

  /** Hujjat yuklash. To'rttalasi (ID, guvohnoma, tex-pasport, Face ID) bo'lgach ariza topshiriladi. */
  async upload(user: { id: string; role: Role }, type: KycDocType, file?: Express.Multer.File) {
    if (user.role !== Role.DRIVER) throw new ForbiddenException("Hujjat yuklash faqat haydovchilar uchun");
    if (!file) throw new BadRequestException('Rasm faylini yuboring');
    if (file.size > MAX_KYC_BYTES) throw new BadRequestException("Rasm hajmi 5 MB dan oshmasligi kerak");
    const ext = detectImageExt(file.buffer);
    if (!ext) throw new BadRequestException("Rasm JPG, PNG yoki WEBP bo'lishi kerak");
    const dir = join(KYC_DIR, user.id);
    await fs.mkdir(dir, { recursive: true });
    const rel = join(user.id, `${type}-${randomBytes(8).toString('hex')}.${ext}`);
    await fs.writeFile(join(KYC_DIR, rel), file.buffer);
    const old = await this.prisma.kycDocument.findUnique({ where: { userId_type: { userId: user.id, type } } });
    await this.prisma.kycDocument.upsert({ where: { userId_type: { userId: user.id, type } }, create: { userId: user.id, type, path: rel }, update: { path: rel } });
    if (old) await fs.rm(join(KYC_DIR, old.path), { force: true });

    const have = await this.prisma.kycDocument.findMany({ where: { userId: user.id }, select: { type: true } });
    if (DRIVER_DOCS.every((t) => have.some((h) => h.type === t))) {
      const auto = this.env.KYC_ALLOW_SIMULATION; // simulyatsiya: Face ID haqiqiy solishtirilmaydi
      await this.prisma.user.update({
        where: { id: user.id },
        data: auto ? { kycStatus: KycStatus.VERIFIED, isVerified: true, verifiedAt: new Date(), kycRejectReason: null } : { kycStatus: KycStatus.PENDING, isVerified: false, kycRejectReason: null },
      });
      this.trust.invalidate(user.id);
    }
    return this.status(user.id);
  }

  /** Hujjat faylini oqim sifatida qaytaradi (egasi yoki administrator) */
  async file(viewer: { id: string; role: Role }, ownerId: string, type: KycDocType) {
    if (viewer.role !== Role.ADMIN && viewer.id !== ownerId) throw new ForbiddenException("Bu hujjatga kirish huquqingiz yo'q");
    const d = await this.prisma.kycDocument.findUnique({ where: { userId_type: { userId: ownerId, type } } });
    if (!d) throw new NotFoundException('Hujjat topilmadi');
    const full = join(KYC_DIR, d.path);
    if (!full.startsWith(KYC_DIR)) throw new ForbiddenException();
    const ext = full.split('.').pop() as keyof typeof MIME;
    return { stream: createReadStream(full), mime: MIME[ext] ?? 'application/octet-stream' };
  }

  // ----- Administrator -----
  async pending() {
    const users = await this.prisma.user.findMany({
      where: { kycStatus: KycStatus.PENDING }, orderBy: { updatedAt: 'asc' }, take: 200,
      select: { id: true, fullName: true, phone: true, role: true, createdAt: true, kycDocuments: { select: { type: true } }, driver: { select: { plateNumber: true, vehicleType: true } } },
    });
    return users.map((u) => ({ id: u.id, fullName: u.fullName, phone: u.phone, role: u.role, createdAt: u.createdAt, docs: u.kycDocuments.map((d) => d.type), plateNumber: u.driver?.plateNumber ?? null, vehicleType: u.driver?.vehicleType ?? null }));
  }

  private async target(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, kycDocuments: { select: { type: true } } } });
    if (!u) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (u.role === Role.ADMIN || u.role === Role.DISPATCHER) throw new BadRequestException("Xodimlar uchun tasdiqlash talab qilinmaydi");
    return u;
  }

  /** Tasdiqlash. Haydovchida barcha 4 ta hujjat bo'lishi shart; fermer va marketda hujjat talab qilinmaydi (administrator tasdig'i). */
  async approve(userId: string) {
    const u = await this.target(userId);
    if (u.role === Role.DRIVER && !DRIVER_DOCS.every((t) => u.kycDocuments.some((d) => d.type === t))) throw new BadRequestException("Haydovchi hamma hujjatlarni yuklamagan");
    await this.prisma.user.update({ where: { id: userId }, data: { kycStatus: KycStatus.VERIFIED, isVerified: true, verifiedAt: new Date(), kycRejectReason: null } });
    this.trust.invalidate(userId);
    return this.status(userId);
  }

  async reject(userId: string, reason: string) {
    await this.target(userId);
    await this.prisma.user.update({ where: { id: userId }, data: { kycStatus: KycStatus.REJECTED, isVerified: false, verifiedAt: null, kycRejectReason: reason.trim().slice(0, 300) } });
    this.trust.invalidate(userId);
    return this.status(userId);
  }

  async revoke(userId: string) {
    await this.target(userId);
    await this.prisma.user.update({ where: { id: userId }, data: { kycStatus: KycStatus.NONE, isVerified: false, verifiedAt: null } });
    this.trust.invalidate(userId);
    return this.status(userId);
  }
}
