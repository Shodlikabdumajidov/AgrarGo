import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQuery } from './dto/list-products.query';
import { UpdateProductDto } from './dto/update-product.dto';

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
    return { deleted: true };
  }

  // Prisma DateTime uchun "YYYY-MM-DD" ni Date'ga o'giramiz
  // PUT'da harvestDate: null yuborilsa sana tozalanadi
  private toData<T extends { harvestDate?: string | null }>(dto: T) {
    const { harvestDate, ...rest } = dto;
    if (harvestDate === null) return { ...rest, harvestDate: null };
    return harvestDate ? { ...rest, harvestDate: new Date(harvestDate) } : rest;
  }
}
