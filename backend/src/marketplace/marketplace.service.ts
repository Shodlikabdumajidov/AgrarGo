import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketplaceQuery } from './dto/marketplace-query.dto';

// Ochiq endpoint: faqat shu maydonlar tashqariga chiqadi (whitelist).
// Telefon, email, aniq manzil, koordinata va STIR bu yerga qo'shilmaydi.
const PUBLIC_PRODUCT_SELECT = {
  id: true,
  name: true,
  category: true,
  quantityKg: true,
  pricePerKg: true,
  harvestDate: true,
  description: true,
  photos: true,
  deliveryPayer: true,
  createdAt: true,
  farmer: {
    select: {
      farmName: true,
      region: true,
      district: true,
      isVerified: true,
      user: { select: { fullName: true, penaltyPoints: true } },
    },
  },
} satisfies Prisma.ProductSelect;

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: MarketplaceQuery) {
    const { q, category, region, sort, page, limit, minPrice, maxPrice, minQty, maxQty } = query;
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) throw new BadRequestException("Minimal narx maksimal narxdan katta bo'lmasligi kerak");
    if (minQty !== undefined && maxQty !== undefined && minQty > maxQty) throw new BadRequestException("Minimal miqdor maksimal miqdordan katta bo'lmasligi kerak");

    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      quantityKg: { gt: 0, ...(minQty !== undefined && { gte: minQty }), ...(maxQty !== undefined && { lte: maxQty }) },
      ...((minPrice !== undefined || maxPrice !== undefined) && { pricePerKg: { ...(minPrice !== undefined && { gte: minPrice }), ...(maxPrice !== undefined && { lte: maxPrice }) } }),
      ...(category && { category: { equals: category, mode: 'insensitive' } }),
      ...(region && { farmer: { region: { equals: region, mode: 'insensitive' } } }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
          { farmer: { farmName: { contains: q, mode: 'insensitive' } } },
          { farmer: { user: { fullName: { contains: q, mode: 'insensitive' } } } },
        ],
      }),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      sort === 'price_asc' ? [{ pricePerKg: 'asc' }, { id: 'asc' }]
      : sort === 'price_desc' ? [{ pricePerKg: 'desc' }, { id: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'asc' }]; // id: sahifalashda barqaror tartib

    const [total, rows, bounds] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: PUBLIC_PRODUCT_SELECT,
      }),
      // Slayder chegaralari: barcha faol e'lonlar bo'yicha (filtrlar o'zgarganda slayder "sakramasligi" uchun)
      this.prisma.product.aggregate({
        where: { status: ProductStatus.ACTIVE, quantityKg: { gt: 0 } },
        _min: { pricePerKg: true, quantityKg: true },
        _max: { pricePerKg: true, quantityKg: true },
      }),
    ]);

    const items = rows.map(({ farmer, ...product }) => ({
      ...product,
      farmer: {
        fullName: farmer.user.fullName,
        penaltyPoints: farmer.user.penaltyPoints,
        farmName: farmer.farmName,
        region: farmer.region,
        district: farmer.district,
        isVerified: farmer.isVerified,
      },
    }));

    return {
      items,
      meta: {
        page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
        ranges: {
          price: { min: bounds._min.pricePerKg, max: bounds._max.pricePerKg },
          quantity: { min: bounds._min.quantityKg, max: bounds._max.quantityKg },
        },
      },
    };
  }
}
