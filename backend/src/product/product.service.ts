import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { UPLOADS_DIR, detectImageExt } from '../profile/profile.service';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQuery } from './dto/list-products.query';
import { UpdateProductDto } from './dto/update-product.dto';

export const PRODUCT_PHOTO_DIR = join(UPLOADS_DIR, 'products');
export const MAX_PRODUCT_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_PRODUCT_PHOTOS = 5;
const PHOTO_URL_PREFIX = '/uploads/products/';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  create(farmerId: string, dto: CreateProductDto) {
    return this.prisma.product.create({ data: { ...this.toData(dto), farmerId } });
  }

  findAllByFarmer(farmerId: string, query: ListProductsQuery) {
    return this.prisma.product.findMany({
      where: { farmerId, ...(query.status && { status: query.status }) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneByFarmer(farmerId: string, id: string) {
    // Boshqa fermerning e'loni ham 404 qaytaradi (mavjudligini oshkor qilmaslik uchun)
    const product = await this.prisma.product.findFirst({ where: { id, farmerId } });
    if (!product) throw new NotFoundException("E'lon topilmadi");
    return product;
  }

  async update(farmerId: string, id: string, dto: UpdateProductDto) {
    await this.findOneByFarmer(farmerId, id);
    return this.prisma.product.update({ where: { id }, data: this.toData(dto) });
  }

  async remove(farmerId: string, id: string) {
    await this.findOneByFarmer(farmerId, id);
    // To'lov tarixi (moliyaviy yozuv) hech qachon e'lon bilan birga o'chirilmaydi
    const photos = (await this.findOneByFarmer(farmerId, id)).photos;
    const blocking = await this.prisma.booking.count({
      where: {
        productId: id,
        OR: [{ status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] } }, { payment: { isNot: null } }],
      },
    });
    if (blocking > 0) {
      throw new ConflictException("Bu e'londa faol bronlar yoki to'lov tarixi bor. Uni o'chirmasdan arxivlang");
    }
    // To'lovsiz tugallangan (rad etilgan/bekor qilingan) bronlar tarixi e'lon bilan birga o'chiriladi
    await this.prisma.$transaction([
      this.prisma.booking.deleteMany({ where: { productId: id } }),
      this.prisma.product.delete({ where: { id } }),
    ]);
    await Promise.all(photos.map((u) => this.removeFile(u)));
    return { deleted: true };
  }

  /** E'longa rasm qo'shish (1-5 ta; JPG/PNG/WEBP, magic-bytes tekshiruvi) */
  async addPhoto(farmerId: string, id: string, file: Express.Multer.File | undefined) {
    const cur = await this.findOneByFarmer(farmerId, id);
    if (!file) throw new BadRequestException('Rasm faylini yuboring (file maydoni)');
    if (cur.photos.length >= MAX_PRODUCT_PHOTOS) throw new BadRequestException(`Ko'pi bilan ${MAX_PRODUCT_PHOTOS} ta rasm yuklash mumkin`);
    const ext = detectImageExt(file.buffer);
    if (!ext) throw new BadRequestException('Faqat JPG, PNG yoki WEBP rasm yuklash mumkin');
    await fs.mkdir(PRODUCT_PHOTO_DIR, { recursive: true });
    const name = `${randomBytes(12).toString('hex')}.${ext}`;
    await fs.writeFile(join(PRODUCT_PHOTO_DIR, name), file.buffer);
    return this.prisma.product.update({ where: { id }, data: { photos: { push: `${PHOTO_URL_PREFIX}${name}` } } });
  }

  async removePhoto(farmerId: string, id: string, index: number) {
    const cur = await this.findOneByFarmer(farmerId, id);
    const url = cur.photos[index];
    if (!url) throw new NotFoundException('Rasm topilmadi');
    const row = await this.prisma.product.update({ where: { id }, data: { photos: cur.photos.filter((_, i) => i !== index) } });
    await this.removeFile(url);
    return row;
  }

  private async removeFile(url: string) {
    if (!url.startsWith(PHOTO_URL_PREFIX)) return;
    await fs.unlink(join(PRODUCT_PHOTO_DIR, url.slice(PHOTO_URL_PREFIX.length).replace(/[\\/]/g, ''))).catch(() => undefined);
  }

  // Prisma DateTime uchun "YYYY-MM-DD" ni Date'ga o'giramiz
  // PUT'da harvestDate: null yuborilsa sana tozalanadi
  private toData<T extends { harvestDate?: string | null }>(dto: T) {
    const { harvestDate, ...rest } = dto;
    if (harvestDate === null) return { ...rest, harvestDate: null };
    return harvestDate ? { ...rest, harvestDate: new Date(harvestDate) } : rest;
  }
}
