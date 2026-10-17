import { Injectable } from '@nestjs/common';
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
  createdAt: true,
  farmer: {
    select: {
      farmName: true,
      region: true,
      district: true,
      isVerified: true,
      user: { select: { fullName: true } },
    },
  },
} satisfies Prisma.ProductSelect;

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: MarketplaceQuery) {
    const { q, category, region, sort, page, limit } = query;

    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      quantityKg: { gt: 0 },
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

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: PUBLIC_PRODUCT_SELECT,
      }),
    ]);

    const items = rows.map(({ farmer, ...product }) => ({
      ...product,
      farmer: {
        fullName: farmer.user.fullName,
        farmName: farmer.farmName,
        region: farmer.region,
        district: farmer.district,
        isVerified: farmer.isVerified,
      },
    }));

    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}
