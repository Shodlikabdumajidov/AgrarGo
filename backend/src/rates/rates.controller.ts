import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/roles.guard';
import { RatesService } from './rates.service';

const clean = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

class DaysQuery {
  @IsOptional() @Type(() => Number) @IsIn([30, 60]) days?: number;
}
class RouteCompareQuery extends DaysQuery {
  @IsOptional() @Transform(clean) @IsString() @Length(2, 120) route?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(2, 60) origin?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(2, 60) dest?: string;
  @Type(() => Number) @IsNumber() @Min(1) @Max(10_000_000) ratePerKm!: number;
}
class ProductCompareQuery {
  @Transform(clean) @IsString() @Length(2, 80) name!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(1_000_000_000) pricePerKg?: number;
}

/** Bozor stavkalari analitikasi: tizimga kirgan har bir foydalanuvchi uchun (shaxsiy ma'lumot yo'q, faqat agregat) */
@Controller('rates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RatesController {
  constructor(private readonly rates: RatesService, private readonly prisma: PrismaService) {}

  /** Yo'nalishlar bo'yicha o'rtacha stavka (so'm/km) */
  @Get('routes')
  routes(@Query() q: DaysQuery) {
    return this.rates.index(q.days);
  }

  /** Taklif qilingan stavkani yo'nalish o'rtachasi bilan solishtirish (foizda) */
  @Get('compare')
  async compare(@Query() q: RouteCompareQuery) {
    const days = q.days ?? 30;
    if (!q.route && !(q.origin && q.dest)) throw new BadRequestException('route yoki origin va dest yuboring');
    const cmp = q.origin && q.dest ? await this.rates.compare(q.origin, q.dest, q.ratePerKm, days) : await this.rates.compareText(q.route, q.ratePerKm, null, days);
    return { days, compare: cmp };
  }

  /** Mahsulot narxini (so'm/kg) bozorlardagi oxirgi o'rtacha narx bilan solishtirish */
  @Get('product')
  async product(@Query() q: ProductCompareQuery) {
    const like = `%${q.name.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = await this.prisma.$queryRaw<{ avg: number | null; n: number }[]>(Prisma.sql`
      SELECT AVG("priceToday")::float AS avg, COUNT(*)::int AS n FROM (
        SELECT DISTINCT ON ("marketName", lower("productName")) "priceToday"
        FROM "MarketPrice" WHERE "productName" ILIKE ${like}
        ORDER BY "marketName", lower("productName"), "createdAt" DESC) t`);
    const avg = rows[0]?.avg ? Math.round(rows[0].avg) : null;
    const diff = avg && q.pricePerKg ? Math.round(((q.pricePerKg - avg) / avg) * 1000) / 10 : null;
    return { name: q.name, avgPricePerKg: avg, markets: rows[0]?.n ?? 0, pricePerKg: q.pricePerKg ?? null, diffPercent: diff };
  }
}
