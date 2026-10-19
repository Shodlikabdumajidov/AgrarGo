import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { findRegionNames, normRegion } from '../trust/geo';
import { RateCompare, RateIndex, aggregateRoutes, compareRate } from './rates';

const CACHE_MS = 10 * 60_000;
export const RATE_WINDOWS = [30, 60] as const;

/**
 * Bozor stavkasi (so'm/km): oxirgi 30 yoki 60 kunda yakunlangan (DELIVERED) yuklarning yo'l haqi / masofa.
 * Dinamik kalkulyator: natija 10 daqiqa keshlanadi, shuning uchun har so'rovda og'ir SQL bajarilmaydi.
 */
@Injectable()
export class RatesService {
  private cache = new Map<number, { at: number; v: RateIndex }>();
  constructor(private readonly prisma: PrismaService, private readonly pricing: PricingService) {}

  clearCache() { this.cache.clear(); }

  async index(days: number = 30): Promise<RateIndex> {
    const d = days >= 60 ? 60 : 30;
    const hit = this.cache.get(d);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.v;
    const rows = await this.prisma.$queryRaw<{ origin: string; dest: string; fee: number; km: number; n: number }[]>`
      SELECT s."originRegion" AS origin, s."destRegion" AS dest, SUM(p."deliveryFee")::float AS fee, SUM(p."distanceKm")::float AS km, COUNT(*)::int AS n
      FROM "Shipment" s
      JOIN "Payment" p ON (p."bookingId" = s."bookingId" OR p."warehouseOrderId" = s."warehouseOrderId")
      WHERE s.status = 'DELIVERED' AND s."deliveredAt" >= now() - make_interval(days => ${d}::int)
        AND p.status IN ('HELD', 'RELEASED') AND p."deliveryFee" > 0 AND p."distanceKm" > 0
      GROUP BY 1, 2`;
    const agg = aggregateRoutes(rows);
    const v: RateIndex = { days: d, asOf: new Date().toISOString(), global: agg.global, routes: agg.routes, tariffPerKm: this.pricing.cfg.deliveryPerKm };
    this.cache.set(d, { at: Date.now(), v });
    return v;
  }

  /** Matndan ("Samarqand ↔ Toshkent") ikki viloyatni topib, shu yo'nalish uchun solishtiradi */
  async compareText(routeText: string | null | undefined, ratePerKm: number, fallbackRegion?: string | null, days = 30): Promise<RateCompare | null> {
    const names = findRegionNames(routeText ?? '');
    const [a, b] = names.length >= 2 ? [names[0], names[1]] : [fallbackRegion ?? names[0] ?? null, null];
    return compareRate(await this.index(days), ratePerKm, a, b);
  }

  async compare(origin: string, dest: string, ratePerKm: number, days = 30): Promise<RateCompare | null> {
    return compareRate(await this.index(days), ratePerKm, normRegion(origin), normRegion(dest));
  }
}
