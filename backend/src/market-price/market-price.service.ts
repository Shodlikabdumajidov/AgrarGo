import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOADS_DIR, detectImageExt } from '../profile/profile.service';
import { CreateMarketPriceDto, ListMarketPricesQuery } from './dto/market-price.dto';
import { MARKET_GROUPS } from './market-names';

export const PRICE_DIR = join(UPLOADS_DIR, 'prices');
export const MAX_PRICE_IMAGE_BYTES = 3 * 1024 * 1024;

export function presentPrice(r: { id: string; marketName: string; productName: string; priceToday: number; priceYesterday: number; image: string | null; createdAt: Date }) {
  const diff = r.priceToday - r.priceYesterday;
  const percent = r.priceYesterday > 0 ? Math.round((diff / r.priceYesterday) * 1000) / 10 : 0;
  return { ...r, diff, changePercent: percent, trend: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
}

@Injectable()
export class MarketPriceService {
  constructor(private readonly prisma: PrismaService) {}

  markets() {
    return MARKET_GROUPS;
  }

  /** Har bir (bozor, mahsulot) juftligi uchun eng oxirgi kiritilgan narx. Qidiruv bozor yoki mahsulot nomi bo'yicha. */
  async list(query: ListMarketPricesQuery) {
    const q = (query.q ?? '').trim();
    const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
    const where = [
      like ? Prisma.sql`("marketName" ILIKE ${like} OR "productName" ILIKE ${like})` : Prisma.sql`TRUE`,
      query.market ? Prisma.sql`"marketName" = ${query.market}` : Prisma.sql`TRUE`,
    ];
    const rows = await this.prisma.$queryRaw<Parameters<typeof presentPrice>[0][]>(Prisma.sql`
      SELECT * FROM (
        SELECT DISTINCT ON ("marketName", lower("productName")) id, "marketName", "productName", "priceToday", "priceYesterday", image, "createdAt"
        FROM "MarketPrice" WHERE ${Prisma.join(where, ' AND ')}
        ORDER BY "marketName", lower("productName"), "createdAt" DESC
      ) t ORDER BY "createdAt" DESC LIMIT 300`);
    return rows.map(presentPrice);
  }

  /**
   * Yangi narx qo'shish: shu bozor va mahsulotning oxirgi narxi avtomatik `priceYesterday` ga yoziladi.
   * Birinchi marta kiritilsa kecha narxi = bugungi narx (o'zgarish yo'q). Rasm yuborilmasa oxirgi rasm saqlanadi.
   */
  async create(dto: CreateMarketPriceDto, file?: Express.Multer.File) {
    let image: string | undefined;
    if (file) {
      const ext = detectImageExt(file.buffer);
      if (!ext) throw new BadRequestException("Rasm JPG, PNG yoki WEBP bo'lishi kerak");
      if (file.size > MAX_PRICE_IMAGE_BYTES) throw new BadRequestException("Rasm 3 MB dan oshmasligi kerak");
      await fs.mkdir(PRICE_DIR, { recursive: true });
      const name = `${randomBytes(12).toString('hex')}.${ext}`;
      await fs.writeFile(join(PRICE_DIR, name), file.buffer);
      image = `/uploads/prices/${name}`;
    }
    const row = await this.prisma.$transaction(async (tx) => {
      // Bir mahsulotga bir vaqtda ikki narx kiritilsa ketma-ket bajarilsin (kecha narxi buzilmasin)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.marketName + '|' + dto.productName.toLowerCase()}))`;
      const last = await tx.marketPrice.findFirst({
        where: { marketName: dto.marketName, productName: { equals: dto.productName, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
      });
      return tx.marketPrice.create({
        data: {
          marketName: dto.marketName,
          productName: last?.productName ?? dto.productName,
          priceToday: dto.priceToday,
          priceYesterday: last ? last.priceToday : dto.priceToday,
          image: image ?? last?.image ?? null,
        },
      });
    });
    return presentPrice(row);
  }
}
