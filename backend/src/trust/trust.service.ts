import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, Role, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BadgeState, Metrics, driverRank, evaluateBadges, trustStatus } from './badges';
import { normRegion, routeKm } from './geo';

const DAY = 86_400_000, HOUR = 3_600_000;
const TASHKENT_OFFSET_H = 5;
const CACHE_MS = 60_000;

export interface TrustSummary {
  verified: boolean;
  status: 'NEW' | 'REGULAR' | 'VETERAN';
  rank: 'LEGENDARY' | 'MASTER' | 'ROOKIE' | null;
  unlocked: number;
  total: number;
  topBadges: string[];
  rating: { avg: number; count: number };
  deals: number;
}
export interface TrustFull extends TrustSummary { badges: BadgeState[]; ageDays: number }

@Injectable()
export class TrustService {
  private cache = new Map<string, { at: number; v: TrustFull }>();
  constructor(private readonly prisma: PrismaService) {}

  invalidate(...userIds: string[]) { userIds.forEach((id) => this.cache.delete(id)); }

  /** Yetkazilgan yuk uchun taxminiy yo'l vaqti (soat): masofa / 50 km/s + 1 soat yuklash-tushirish */
  private static allowedHours(km: number) { return km / 50 + 1; }

  private async metrics(userId: string): Promise<Metrics> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { farmer: true, driver: true, market: true, consumer: true } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    const now = Date.now();
    const ratings = await this.prisma.shipmentRating.findMany({ where: { targetId: userId }, select: { stars: true, friendly: true, damaged: true } });
    const avg = ratings.length ? ratings.reduce((a, r) => a + r.stars, 0) / ratings.length : 0;
    const m: Metrics = {
      role: user.role, ageDays: Math.floor((now - user.createdAt.getTime()) / DAY), verified: user.isVerified, deals: 0,
      rating: { avg: Math.round(avg * 100) / 100, count: ratings.length },
      driver: { delivered: 0, onTime: 0, damageReports: ratings.filter((r) => r.damaged).length, nightLong: 0, reefer: 0, ecoReturn: 0, fiveStars: ratings.filter((r) => r.stars === 5).length, friendly: ratings.filter((r) => r.friendly).length, km: 0, eldStreak: 0, urgent: 0, paidMonths: 0, subActive: false },
      farmer: { weightKg: 0, fastApprovals: 0, decided: 0, rejected: 0 },
      market: { paidPayments: 0, refunded: 0, weightKg: 0 },
    };

    if (user.driver) {
      const d = user.driver;
      const rows = await this.prisma.shipment.findMany({
        where: { driverId: d.id, status: ShipmentStatus.DELIVERED },
        select: { assignedAt: true, deliveredAt: true, originRegion: true, destRegion: true, urgent: true, events: { select: { status: true, createdAt: true } } },
        orderBy: { deliveredAt: 'asc' },
      });
      m.driver.delivered = m.deals = rows.length;
      const reefer = /ref|sovutg/i.test(d.vehicleType);
      const damagedShipments = await this.prisma.shipmentRating.count({ where: { targetId: userId, damaged: true } });
      rows.forEach((s, i) => {
        const km = routeKm(s.originRegion, s.destRegion);
        m.driver.km += km;
        const start = s.events.find((e) => e.status === ShipmentStatus.IN_TRANSIT)?.createdAt;
        const end = s.deliveredAt ?? s.events.find((e) => e.status === ShipmentStatus.DELIVERED)?.createdAt;
        if (start && end && (end.getTime() - start.getTime()) / HOUR <= TrustService.allowedHours(km)) m.driver.onTime++;
        if (start && km >= 200) {
          const h = new Date(start.getTime() + TASHKENT_OFFSET_H * HOUR).getUTCHours();
          if (h >= 22 || h < 6) m.driver.nightLong++;
        }
        if (s.urgent) m.driver.urgent++;
        // Bo'sh qaytish: oldingi yetkazib berish manzilidan olib, o'z viloyatiga qaytayotgan yuk (48 soat ichida)
        const prev = i > 0 ? rows[i - 1] : null;
        if (prev && prev.deliveredAt && s.assignedAt && s.assignedAt.getTime() - prev.deliveredAt.getTime() <= 48 * HOUR && s.assignedAt >= prev.deliveredAt
          && normRegion(s.originRegion) === normRegion(prev.destRegion) && normRegion(prev.destRegion) !== normRegion(d.region) && normRegion(s.destRegion) === normRegion(d.region)) m.driver.ecoReturn++;
      });
      // Sovutgichli tirkama bilan sifatli (zarar xabar qilinmagan) yetkazishlar
      if (reefer) m.driver.reefer = Math.max(0, rows.length - damagedShipments);
      // ELD: GPS jurnalida kunlik kamida 5 nuqta bo'lgan ketma-ket kunlar
      const days = await this.prisma.$queryRaw<{ d: Date }[]>(Prisma.sql`
        SELECT (date_trunc('day', "recordedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent'))::date AS d FROM "LocationLog" WHERE "driverId" = ${d.id}
        GROUP BY 1 HAVING count(*) >= 5 ORDER BY 1`);
      let run = 0, best = 0, last = 0;
      days.forEach((r) => { const t = Date.UTC(r.d.getUTCFullYear(), r.d.getUTCMonth(), r.d.getUTCDate()); run = last && t - last === DAY ? run + 1 : 1; last = t; best = Math.max(best, run); });
      m.driver.eldStreak = best;
      const subs = await this.prisma.subscriptionPayment.aggregate({ where: { userId }, _sum: { months: true } });
      m.driver.paidMonths = subs._sum.months ?? 0;
      m.driver.subActive = !!user.subscriptionEndsAt && user.subscriptionEndsAt.getTime() > now;
    } else if (user.farmer) {
      const f = user.farmer;
      const ship = await this.prisma.shipment.aggregate({ where: { farmerId: f.id, status: ShipmentStatus.DELIVERED }, _count: true, _sum: { weightKg: true } });
      m.deals = ship._count;
      m.farmer.weightKg = Number(ship._sum.weightKg ?? 0);
      const bks = await this.prisma.booking.findMany({ where: { product: { farmerId: f.id }, status: { in: ['APPROVED', 'REJECTED'] } }, select: { status: true, createdAt: true, decidedAt: true }, take: 5000 });
      m.farmer.decided = bks.length;
      m.farmer.rejected = bks.filter((b) => b.status === 'REJECTED').length;
      m.farmer.fastApprovals = bks.filter((b) => b.status === 'APPROVED' && b.decidedAt && b.decidedAt.getTime() - b.createdAt.getTime() <= 2 * HOUR).length;
    } else if (user.market) {
      const mk = user.market;
      const ship = await this.prisma.shipment.aggregate({ where: { marketId: mk.id, status: ShipmentStatus.DELIVERED }, _count: true, _sum: { weightKg: true } });
      m.deals = ship._count;
      m.market.weightKg = Number(ship._sum.weightKg ?? 0);
      const own: Prisma.PaymentWhereInput = { OR: [{ booking: { marketId: mk.id } }, { warehouseOrder: { marketId: mk.id } }] };
      m.market.paidPayments = await this.prisma.payment.count({ where: { AND: [own, { status: { in: [PaymentStatus.HELD, PaymentStatus.RELEASED] } }] } });
      m.market.refunded = await this.prisma.payment.count({ where: { AND: [own, { status: PaymentStatus.REFUNDED }] } });
    }
    return m;
  }

  async full(userId: string): Promise<TrustFull> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.v;
    const m = await this.metrics(userId);
    const badges = evaluateBadges(m);
    const unlocked = badges.filter((b) => b.unlocked);
    const v: TrustFull = {
      verified: m.verified, status: trustStatus(m), rank: m.role === Role.DRIVER ? driverRank(badges) : null,
      unlocked: unlocked.length, total: badges.length,
      topBadges: [...unlocked].sort((a, b) => b.weight - a.weight).slice(0, 3).map((b) => b.id),
      rating: m.rating, deals: m.deals, badges, ageDays: m.ageDays,
    };
    this.cache.set(userId, { at: Date.now(), v });
    return v;
  }

  /** Boshqa foydalanuvchilarga ko'rsatiladigan qisqa ma'lumot (badjlar ro'yxatisiz) */
  async summary(userId: string): Promise<TrustSummary> {
    const { badges, ageDays, ...s } = await this.full(userId);
    return s;
  }

  async summaries(userIds: string[]): Promise<Map<string, TrustSummary>> {
    const out = new Map<string, TrustSummary>();
    await Promise.all([...new Set(userIds)].map(async (id) => { try { out.set(id, await this.summary(id)); } catch { /* o'chirilgan foydalanuvchi */ } }));
    return out;
  }
}
