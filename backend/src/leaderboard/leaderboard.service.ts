import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LeaderboardCategory, Prisma, Role } from '@prisma/client';
import { APP_ENV } from '../config/app-env.module';
import type { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { PERIOD_DAYS, addDays, computeSubscription } from '../subscription/subscription.logic';
import { NotificationService } from '../telegram/notification.service';
import { routeKm } from '../trust/geo';

const logger = new Logger('Leaderboard');
/** Oylik reyting O'zbekiston vaqti (UTC+5, yozgi vaqt yo'q) bo'yicha: oy 1-sana 00:00 da almashadi */
const TZ_OFFSET_MS = 5 * 3600_000;
export const TOP_N = 3;
export const REWARD_PROVIDER = 'leaderboard-reward';

export const monthKey = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 7);
/** Keyingi oyning 1-sanasi 00:00 (Toshkent vaqti) — UTC instant */
export const nextRollover = (d: Date) => {
  const t = new Date(d.getTime() + TZ_OFFSET_MS);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1) - TZ_OFFSET_MS);
};
const round = (n: number, p = 3) => Math.round(n * 10 ** p) / 10 ** p;

interface Row { userId: string; name: string; org: string | null; value: number; orders: number; verified: boolean }
export interface DeliveryStats { km: number; tons: number; driverMonthlyKm: number }

@Injectable()
export class LeaderboardService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private activeKey: string | null = null;

  constructor(private readonly prisma: PrismaService, private readonly notify: NotificationService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  async onModuleInit() {
    if (this.env.NODE_ENV === 'test') return; // testlarda taymer ishlamaydi (ensureCurrentPeriod qo'lda chaqiriladi)
    await this.ensureCurrentPeriod().catch((e) => logger.error(`Davrni tekshirib bo'lmadi: ${(e as Error).message}`));
    this.schedule();
  }
  onModuleDestroy() { if (this.timer) clearTimeout(this.timer); }

  /** Keyingi oy boshiga (1-sana 00:00) taymer o'rnatadi; ishga tushganda davr almashtiriladi va keyingisiga qayta o'rnatiladi */
  private schedule() {
    const wait = Math.min(nextRollover(new Date()).getTime() - Date.now() + 1000, 2 ** 31 - 1);
    this.timer = setTimeout(async () => {
      await this.ensureCurrentPeriod().catch((e) => logger.error(`Oy yakuni bajarilmadi: ${(e as Error).message}`));
      this.schedule();
    }, wait);
    this.timer.unref?.();
  }

  /**
   * Faol davr joriy oy bo'lmasa: avvalgi oy yopiladi (TOP-3 ga 1 oylik bepul PRO), ko'rsatkichlar 0 dan boshlanadi.
   * Takroriy chaqiruv va parallel nusxalar xavfsiz: davr almashtirish yagona shartli yangilash (claim) bilan bajariladi.
   */
  async ensureCurrentPeriod(now = new Date()): Promise<{ closed: string | null }> {
    const key = monthKey(now);
    if (this.activeKey === key) return { closed: null };
    const state = await this.prisma.leaderboardState.upsert({ where: { id: 1 }, create: { id: 1, activeMonth: key }, update: {} });
    if (state.activeMonth === key) { this.activeKey = key; return { closed: null }; }
    let winners: { userId: string; category: LeaderboardCategory; rank: number; proUntil: Date }[] = [];
    const closed = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.leaderboardState.updateMany({ where: { id: 1, activeMonth: state.activeMonth }, data: { activeMonth: key } });
      if (claim.count === 0) return null; // boshqa nusxa allaqachon yopdi
      winners = await this.closeMonth(tx, state.activeMonth, now);
      return state.activeMonth;
    });
    this.activeKey = key;
    for (const w of winners) this.notify.leaderboardWinner(w.userId, w.category, w.rank, closed!, w.proUntil);
    return { closed };
  }

  private async closeMonth(tx: Prisma.TransactionClient, month: string, now: Date) {
    const out: { userId: string; category: LeaderboardCategory; rank: number; proUntil: Date }[] = [];
    const tops = await Promise.all([this.topRows(tx, 'DRIVER'), this.topRows(tx, 'FARMER'), this.topRows(tx, 'MARKET')]);
    const cats: LeaderboardCategory[] = ['DRIVER', 'FARMER', 'MARKET'];
    for (let c = 0; c < cats.length; c++) {
      for (let i = 0; i < tops[c].length; i++) {
        const r = tops[c][i];
        const proUntil = await this.grantPro(tx, r.userId, now);
        await tx.leaderboardWinner.create({ data: { month, category: cats[c], rank: i + 1, userId: r.userId, name: r.org ?? r.name, value: r.value, orders: r.orders, proUntil } });
        out.push({ userId: r.userId, category: cats[c], rank: i + 1, proUntil });
      }
    }
    // Yangi oy — hamma ko'rsatkichlar 0 dan
    await tx.driver.updateMany({ where: { monthlyKm: { not: 0 } }, data: { monthlyKm: 0 } });
    await tx.farmer.updateMany({ where: { monthlySotuvTons: { not: 0 } }, data: { monthlySotuvTons: 0 } });
    await tx.market.updateMany({ where: { OR: [{ monthlyXaridTons: { not: 0 } }, { monthlyOrders: { not: 0 } }] }, data: { monthlyXaridTons: 0, monthlyOrders: 0 } });
    return out;
  }

  /** 1 oylik bepul PRO: obuna muddati joriy kirish muddatidan keyin 30 kunga uzayadi (mavjud vaqt yo'qolmaydi) va tarixga 0 so'mlik yozuv qo'shiladi */
  private async grantPro(tx: Prisma.TransactionClient, userId: string, now: Date) {
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, trialEndsAt: true, subscriptionEndsAt: true } });
    const info = computeSubscription(u, now);
    const start = info.accessEndsAt && info.accessEndsAt > now ? info.accessEndsAt : now;
    const end = addDays(start, PERIOD_DAYS);
    await tx.user.update({ where: { id: userId }, data: { subscriptionEndsAt: end, proUntil: end } });
    await tx.subscriptionPayment.create({ data: { userId, role: u.role as Role, months: 1, amount: 0, provider: REWARD_PROVIDER, providerRef: `lb-${userId}-${now.getTime()}`, periodStart: start, periodEnd: end } });
    return end;
  }

  // ---------- Statistika yig'ish ----------

  /**
   * Yuk yetkazilganda (PIN tasdiqlangan yoki yetkazildi bosilgan) bir marta chaqiriladi: yo'nalish masofasi (km) haydovchiga,
   * yuk hajmi (tonna) fermer (sotilgan) va marketga (xarid qilingan, +1 zakaz) qo'shiladi.
   */
  async recordDelivery(shipmentId: string): Promise<DeliveryStats | null> {
    await this.ensureCurrentPeriod();
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.shipment.updateMany({ where: { id: shipmentId, status: 'DELIVERED', statsCounted: false }, data: { statsCounted: true } });
      if (claimed.count === 0) return null; // allaqachon hisoblangan yoki yetkazilmagan
      const s = await tx.shipment.findUniqueOrThrow({
        where: { id: shipmentId },
        select: {
          weightKg: true, driverId: true, farmerId: true, marketId: true, originRegion: true, destRegion: true,
          booking: { select: { payment: { select: { distanceKm: true } } } }, warehouseOrder: { select: { payment: { select: { distanceKm: true } } } },
        },
      });
      const stored = s.booking?.payment?.distanceKm ?? s.warehouseOrder?.payment?.distanceKm ?? 0;
      const km = stored > 0 ? stored : routeKm(s.originRegion, s.destRegion);
      const tons = round(Number(s.weightKg) / 1000);
      let driverMonthlyKm = 0;
      if (s.driverId) driverMonthlyKm = (await tx.driver.update({ where: { id: s.driverId }, data: { monthlyKm: { increment: km } }, select: { monthlyKm: true } })).monthlyKm;
      await tx.farmer.update({ where: { id: s.farmerId }, data: { monthlySotuvTons: { increment: tons } } });
      await tx.market.update({ where: { id: s.marketId }, data: { monthlyXaridTons: { increment: tons }, monthlyOrders: { increment: 1 } } });
      return { km, tons, driverMonthlyKm };
    });
  }

  // ---------- Reyting ----------

  private async topRows(db: Prisma.TransactionClient | PrismaService, category: LeaderboardCategory, take = TOP_N): Promise<Row[]> {
    const active = { user: { isActive: true } };
    if (category === 'DRIVER') {
      const rows = await db.driver.findMany({ where: { monthlyKm: { gt: 0 }, ...active }, orderBy: [{ monthlyKm: 'desc' }, { createdAt: 'asc' }], take, include: { user: { select: { id: true, fullName: true, isVerified: true } } } });
      return rows.map((d) => ({ userId: d.user.id, name: d.user.fullName, org: null, value: round(d.monthlyKm, 1), orders: 0, verified: d.user.isVerified }));
    }
    if (category === 'FARMER') {
      const rows = await db.farmer.findMany({ where: { monthlySotuvTons: { gt: 0 }, ...active }, orderBy: [{ monthlySotuvTons: 'desc' }, { createdAt: 'asc' }], take, include: { user: { select: { id: true, fullName: true, isVerified: true } } } });
      return rows.map((f) => ({ userId: f.user.id, name: f.user.fullName, org: f.farmName, value: round(f.monthlySotuvTons), orders: 0, verified: f.user.isVerified }));
    }
    const rows = await db.market.findMany({ where: { monthlyXaridTons: { gt: 0 }, ...active }, orderBy: [{ monthlyXaridTons: 'desc' }, { monthlyOrders: 'desc' }, { createdAt: 'asc' }], take, include: { user: { select: { id: true, fullName: true, isVerified: true } } } });
    return rows.map((m) => ({ userId: m.user.id, name: m.user.fullName, org: m.companyName, value: round(m.monthlyXaridTons), orders: m.monthlyOrders, verified: m.user.isVerified }));
  }

  private present(rows: Row[]) {
    return rows.map((r, i) => ({ rank: i + 1, name: r.org ?? r.name, owner: r.org ? r.name : null, value: r.value, orders: r.orders, verified: r.verified }));
  }

  /** Bosh sahifa uchun ochiq reyting: har toifada TOP-3 + oy yakuniga qolgan vaqt + o'tgan oy g'oliblari */
  async top(now = new Date()) {
    await this.ensureCurrentPeriod(now);
    const [drivers, farmers, markets] = await Promise.all([this.topRows(this.prisma, 'DRIVER'), this.topRows(this.prisma, 'FARMER'), this.topRows(this.prisma, 'MARKET')]);
    const endsAt = nextRollover(now);
    const last = await this.prisma.leaderboardWinner.findFirst({ orderBy: { month: 'desc' }, select: { month: true } });
    const winners = last ? await this.prisma.leaderboardWinner.findMany({ where: { month: last.month }, orderBy: [{ category: 'asc' }, { rank: 'asc' }] }) : [];
    return {
      month: monthKey(now), endsAt, daysLeft: Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000)),
      reward: { proMonths: 1 },
      drivers: this.present(drivers), farmers: this.present(farmers), markets: this.present(markets),
      lastMonth: last ? { month: last.month, winners: winners.map((w) => ({ category: w.category, rank: w.rank, name: w.name, value: w.value })) } : null,
    };
  }

  /** Foydalanuvchining o'z oylik ko'rsatkichi va o'rni ("Reytingim") */
  async me(user: { id: string; role: Role; driver?: { id: string } | null; farmer?: { id: string } | null; market?: { id: string } | null }, now = new Date()) {
    await this.ensureCurrentPeriod(now);
    const endsAt = nextRollover(now);
    const base = { month: monthKey(now), endsAt, daysLeft: Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000)) };
    if (user.role === 'DRIVER' && user.driver) {
      const d = await this.prisma.driver.findUniqueOrThrow({ where: { id: user.driver.id }, select: { monthlyKm: true } });
      const ahead = await this.prisma.driver.count({ where: { monthlyKm: { gt: d.monthlyKm }, user: { isActive: true } } });
      const total = await this.prisma.driver.count({ where: { monthlyKm: { gt: 0 } } });
      return { ...base, category: 'DRIVER' as const, unit: 'km', value: round(d.monthlyKm, 1), orders: 0, rank: d.monthlyKm > 0 ? ahead + 1 : null, total };
    }
    if (user.role === 'FARMER' && user.farmer) {
      const f = await this.prisma.farmer.findUniqueOrThrow({ where: { id: user.farmer.id }, select: { monthlySotuvTons: true } });
      const ahead = await this.prisma.farmer.count({ where: { monthlySotuvTons: { gt: f.monthlySotuvTons }, user: { isActive: true } } });
      const total = await this.prisma.farmer.count({ where: { monthlySotuvTons: { gt: 0 } } });
      return { ...base, category: 'FARMER' as const, unit: 't', value: round(f.monthlySotuvTons), orders: 0, rank: f.monthlySotuvTons > 0 ? ahead + 1 : null, total };
    }
    if (user.role === 'MARKET' && user.market) {
      const m = await this.prisma.market.findUniqueOrThrow({ where: { id: user.market.id }, select: { monthlyXaridTons: true, monthlyOrders: true } });
      const ahead = await this.prisma.market.count({ where: { monthlyXaridTons: { gt: m.monthlyXaridTons }, user: { isActive: true } } });
      const total = await this.prisma.market.count({ where: { monthlyXaridTons: { gt: 0 } } });
      return { ...base, category: 'MARKET' as const, unit: 't', value: round(m.monthlyXaridTons), orders: m.monthlyOrders, rank: m.monthlyXaridTons > 0 ? ahead + 1 : null, total };
    }
    return { ...base, category: null, unit: null, value: 0, orders: 0, rank: null, total: 0 };
  }
}
