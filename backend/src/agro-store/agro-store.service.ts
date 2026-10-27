import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgroMode, AgroSupplierType, AgroVerification, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import { join } from 'path';
import { roleTakenMessage } from '../common/role-labels';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOADS_DIR, detectImageExt } from '../profile/profile.service';
import { AGRO_POSTS, AGRO_PRODUCTS, AgroProduct as MockProduct } from './agro-store.data';
import { CreateSupplierDto, ProductDto, SuppliersQuery, UpdateProductDto, UpdateSupplierProfileDto } from './agro-store.dto';

const BCRYPT_ROUNDS = 10;
export const AGRO_PRIVATE_DIR = join(process.cwd(), 'private', 'agro');
export const AGRO_PHOTO_DIR = join(UPLOADS_DIR, 'agro-store');
export const MAX_AGRO_FILE_BYTES = 5 * 1024 * 1024;
export type AgroDocType = 'license' | 'stir';
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

/** Fayl turini sarlavhasidan aniqlaydi: rasm yoki PDF */
function detectDocExt(buf: Buffer): string | null {
  if (buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return detectImageExt(buf);
}

const SUPPLIER_INCLUDE = { user: { select: { id: true, phone: true, fullName: true, isActive: true, createdAt: true } }, _count: { select: { products: true } } } as const;
type SupplierRow = Prisma.AgroSupplierGetPayload<{ include: typeof SUPPLIER_INCLUDE }>;

@Injectable()
export class AgroStoreService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Katalog (fermerlar uchun) ----------

  async catalog(mode: 'crop' | 'livestock') {
    const real = await this.prisma.agroProduct.findMany({
      where: { mode: mode === 'crop' ? AgroMode.CROP : AgroMode.LIVESTOCK, isActive: true, supplier: { verification: AgroVerification.VERIFIED, user: { isActive: true } } },
      orderBy: { createdAt: 'desc' }, take: 60, include: { supplier: { select: { orgName: true, type: true } } },
    });
    const mapped = real.map((p) => ({
      id: p.id, mode, source: 'SUPPLIER', category: p.category, price: Number(p.price), unit: p.unit, stockQty: Number(p.stockQty), imageUrl: p.imageUrl,
      cityDeliveryFee: null, partialFreight: true, supplier: { orgName: p.supplier.orgName, type: p.supplier.type },
      name: { uz: p.name, ru: p.name, en: p.name }, description: { uz: p.description, ru: p.description, en: p.description }, usage: { uz: p.usage, ru: p.usage, en: p.usage },
    }));
    return {
      status: 'COMING_SOON', orderingEnabled: false, mode, modes: ['crop', 'livestock'],
      products: [...mapped, ...AGRO_PRODUCTS.filter((x) => x.mode === mode).map((x: MockProduct) => ({ ...x, source: 'MOCK' }))],
      posts: AGRO_POSTS.filter((x) => x.mode === mode),
    };
  }

  // ---------- Xodimlar: sotuvchi yaratish / ko'rish / tasdiqlash ----------

  async createSupplier(dto: CreateSupplierDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone }, select: { role: true } });
    if (existing) throw new ConflictException(roleTakenMessage(existing.role));
    try {
      const u = await this.prisma.user.create({
        data: {
          phone: dto.phone, fullName: dto.contactName, role: Role.AGRO_SUPPLIER, passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
          agroSupplier: { create: { type: dto.type, orgName: dto.orgName, contactName: dto.contactName } },
        },
        select: { agroSupplier: { include: SUPPLIER_INCLUDE } },
      });
      return this.present(u.agroSupplier!);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException("Bu telefon raqam allaqachon ro'yxatdan o'tgan");
      throw e;
    }
  }

  async listSuppliers(q: SuppliersQuery) {
    const rows = await this.prisma.agroSupplier.findMany({
      where: { ...(q.status && { verification: q.status }), ...(q.type && { type: q.type }) },
      orderBy: { createdAt: 'desc' }, take: 200, include: SUPPLIER_INCLUDE,
    });
    return rows.map((r) => this.present(r));
  }

  private async supplierById(id: string) {
    const s = await this.prisma.agroSupplier.findUnique({ where: { id }, include: SUPPLIER_INCLUDE });
    if (!s) throw new NotFoundException('Sotuvchi topilmadi');
    return s;
  }

  /** Verifikatsiya talablari: Dorixona — litsenziya + STIR guvohnomasi; O'g'it sotuvchi — pasport/STIR ma'lumoti */
  requirements(s: { type: AgroSupplierType; licenseDoc: string | null; stirDoc: string | null; stir: string | null; passportInfo: string | null }) {
    if (s.type === AgroSupplierType.PHARMACY) {
      const missing = [...(s.licenseDoc ? [] : ['license']), ...(s.stirDoc ? [] : ['stir'])];
      return { required: ['license', 'stir'], missing };
    }
    return { required: ['stir|passportInfo'], missing: s.stir || s.passportInfo ? [] : ['stir|passportInfo'] };
  }

  async verify(id: string) {
    const s = await this.supplierById(id);
    const req = this.requirements(s);
    if (req.missing.length) throw new BadRequestException(s.type === AgroSupplierType.PHARMACY
      ? "Dorixona verifikatsiyasi uchun litsenziya va STIR guvohnomasi rasmlari yuklangan bo'lishi kerak"
      : "O'g'it sotuvchi verifikatsiyasi uchun STIR yoki pasport ma'lumoti kiritilgan bo'lishi kerak");
    const row = await this.prisma.agroSupplier.update({ where: { id }, data: { verification: AgroVerification.VERIFIED, verifiedAt: new Date(), rejectReason: null }, include: SUPPLIER_INCLUDE });
    return this.present(row);
  }

  async reject(id: string, reason: string) {
    await this.supplierById(id);
    const row = await this.prisma.agroSupplier.update({ where: { id }, data: { verification: AgroVerification.REJECTED, verifiedAt: null, rejectReason: reason }, include: SUPPLIER_INCLUDE });
    return this.present(row);
  }

  // ---------- Sotuvchi: o'z kabineti ----------

  private async mineRow(userId: string) {
    const s = await this.prisma.agroSupplier.findUnique({ where: { userId }, include: SUPPLIER_INCLUDE });
    if (!s) throw new ForbiddenException('Sotuvchi profili topilmadi');
    return s;
  }

  async me(userId: string) { return this.present(await this.mineRow(userId)); }

  async updateMe(userId: string, dto: UpdateSupplierProfileDto) {
    const s = await this.mineRow(userId);
    const row = await this.prisma.agroSupplier.update({
      where: { id: s.id },
      data: { ...dto, ...(s.verification === AgroVerification.REJECTED && { verification: AgroVerification.PENDING, rejectReason: null }) },
      include: SUPPLIER_INCLUDE,
    });
    return this.present(row);
  }

  parseDocType(raw: string): AgroDocType {
    if (raw !== 'license' && raw !== 'stir') throw new BadRequestException("Hujjat turi: license yoki stir");
    return raw;
  }

  async uploadDoc(userId: string, type: AgroDocType, file?: Express.Multer.File) {
    const s = await this.mineRow(userId);
    if (!file) throw new BadRequestException('Fayl yuboring (file maydoni)');
    if (file.size > MAX_AGRO_FILE_BYTES) throw new BadRequestException('Fayl hajmi 5 MB dan oshmasligi kerak');
    const ext = detectDocExt(file.buffer);
    if (!ext) throw new BadRequestException('Faqat PDF, JPG, PNG yoki WEBP yuklash mumkin');
    await fs.mkdir(join(AGRO_PRIVATE_DIR, s.id), { recursive: true });
    const rel = join(s.id, `${type}-${randomBytes(8).toString('hex')}.${ext}`);
    await fs.writeFile(join(AGRO_PRIVATE_DIR, rel), file.buffer);
    const old = type === 'license' ? s.licenseDoc : s.stirDoc;
    const row = await this.prisma.agroSupplier.update({
      where: { id: s.id },
      data: { ...(type === 'license' ? { licenseDoc: rel } : { stirDoc: rel }), ...(s.verification === AgroVerification.REJECTED && { verification: AgroVerification.PENDING, rejectReason: null }) },
      include: SUPPLIER_INCLUDE,
    });
    if (old) await fs.rm(join(AGRO_PRIVATE_DIR, old), { force: true });
    return this.present(row);
  }

  /** Hujjat oqimi: egasi yoki xodim (staffView) */
  async docFile(supplierId: string | null, userId: string | null, type: AgroDocType) {
    const s = supplierId ? await this.supplierById(supplierId) : await this.mineRow(userId!);
    const rel = type === 'license' ? s.licenseDoc : s.stirDoc;
    if (!rel) throw new NotFoundException('Hujjat topilmadi');
    const full = join(AGRO_PRIVATE_DIR, rel);
    if (!full.startsWith(AGRO_PRIVATE_DIR)) throw new ForbiddenException();
    return { stream: createReadStream(full), mime: MIME[full.split('.').pop()!] ?? 'application/octet-stream' };
  }

  // ---------- Sotuvchi: postlar (mahsulotlar) ----------

  private async ownedProduct(userId: string, id: string) {
    const s = await this.mineRow(userId);
    const p = await this.prisma.agroProduct.findUnique({ where: { id } });
    if (!p || p.supplierId !== s.id) throw new NotFoundException('Mahsulot topilmadi');
    return { s, p };
  }

  private presentProduct(p: Prisma.AgroProductGetPayload<object>, verified: boolean) {
    return { ...p, price: Number(p.price), stockQty: Number(p.stockQty), visible: verified && p.isActive };
  }

  async myProducts(userId: string) {
    const s = await this.mineRow(userId);
    const rows = await this.prisma.agroProduct.findMany({ where: { supplierId: s.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map((p) => this.presentProduct(p, s.verification === AgroVerification.VERIFIED));
  }

  async createProduct(userId: string, dto: ProductDto) {
    const s = await this.mineRow(userId);
    const p = await this.prisma.agroProduct.create({
      data: { supplierId: s.id, name: dto.name, category: dto.category, mode: dto.mode ?? AgroMode.CROP, description: dto.description ?? '', usage: dto.usage ?? '', price: dto.price, unit: dto.unit ?? 'kg', stockQty: dto.stockQty ?? 0 },
    });
    return this.presentProduct(p, s.verification === AgroVerification.VERIFIED);
  }

  async updateProduct(userId: string, id: string, dto: UpdateProductDto) {
    const { s } = await this.ownedProduct(userId, id);
    const p = await this.prisma.agroProduct.update({ where: { id }, data: { ...dto } });
    return this.presentProduct(p, s.verification === AgroVerification.VERIFIED);
  }

  async removeProduct(userId: string, id: string) {
    const { p } = await this.ownedProduct(userId, id);
    await this.prisma.agroProduct.delete({ where: { id } });
    if (p.imageUrl) await fs.rm(join(AGRO_PHOTO_DIR, p.imageUrl.split('/').pop()!), { force: true });
    return { deleted: true };
  }

  async setPhoto(userId: string, id: string, file?: Express.Multer.File) {
    const { s, p } = await this.ownedProduct(userId, id);
    if (!file) throw new BadRequestException('Rasm faylini yuboring (file maydoni)');
    if (file.size > MAX_AGRO_FILE_BYTES) throw new BadRequestException('Rasm hajmi 5 MB dan oshmasligi kerak');
    const ext = detectImageExt(file.buffer);
    if (!ext) throw new BadRequestException('Faqat JPG, PNG yoki WEBP rasm yuklash mumkin');
    await fs.mkdir(AGRO_PHOTO_DIR, { recursive: true });
    const name = `${randomBytes(12).toString('hex')}.${ext}`;
    await fs.writeFile(join(AGRO_PHOTO_DIR, name), file.buffer);
    const row = await this.prisma.agroProduct.update({ where: { id }, data: { imageUrl: `/uploads/agro-store/${name}` } });
    if (p.imageUrl) await fs.rm(join(AGRO_PHOTO_DIR, p.imageUrl.split('/').pop()!), { force: true });
    return this.presentProduct(row, s.verification === AgroVerification.VERIFIED);
  }

  // ---------- Ko'rinish ----------

  private present(s: SupplierRow) {
    const { licenseDoc, stirDoc, user, _count, ...rest } = s;
    return { ...rest, phone: user.phone, isActive: user.isActive, productCount: _count.products, hasLicense: !!licenseDoc, hasStirDoc: !!stirDoc, ...this.requirements(s) };
  }
}
