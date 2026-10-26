import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplaintStatus, Prisma, ProductStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BAN_POINTS } from './risk';
import { Decision } from './dto/complaint.dto';

/** Bir foydalanuvchi sutkasiga ko'pi bilan shuncha shikoyat yuboradi (spamga qarshi) */
export const MAX_COMPLAINTS_PER_DAY = 5;
const PENALTY: Record<Decision, number> = { UPHELD: 1, PARTIAL: 0.5, REJECTED: 0 };
const BAN_REASON = 'PENALTY';

const userSel = { id: true, fullName: true, role: true, phone: true, penaltyPoints: true, bannedAt: true, farmer: { select: { farmName: true } }, market: { select: { companyName: true } } } satisfies Prisma.UserSelect;
type U = Prisma.UserGetPayload<{ select: typeof userSel }>;
const orgOf = (u: U) => u.farmer?.farmName ?? u.market?.companyName ?? null;
const round = (n: number) => Math.round(n * 10) / 10;

export interface ComplaintActor { id: string; role: Role; farmer?: { id: string } | null; market?: { id: string } | null; driver?: { id: string } | null }

@Injectable()
export class ComplaintService {
  constructor(private readonly prisma: PrismaService) {}

  /** Foydalanuvchining zakazlar tarixidagi hamkorlari (bron va yuklar bo'yicha), takrorlanmasdan */
  async partners(user: ComplaintActor) {
    const found = new Map<string, { user: U; orders: number; last: Date }>();
    const add = (u: U | null | undefined, at: Date) => {
      if (!u || u.id === user.id) return;
      const cur = found.get(u.id);
      if (cur) { cur.orders++; if (at > cur.last) cur.last = at; } else found.set(u.id, { user: u, orders: 1, last: at });
    };
    const shipSel = { createdAt: true, farmer: { select: { user: { select: userSel } } }, market: { select: { user: { select: userSel } } }, driver: { select: { user: { select: userSel } } } } satisfies Prisma.ShipmentSelect;
    if (user.role === Role.FARMER && user.farmer) {
      for (const s of await this.prisma.shipment.findMany({ where: { farmerId: user.farmer.id }, select: shipSel, take: 500 })) { add(s.market.user, s.createdAt); add(s.driver?.user, s.createdAt); }
      for (const b of await this.prisma.booking.findMany({ where: { product: { farmerId: user.farmer.id } }, select: { createdAt: true, market: { select: { user: { select: userSel } } } }, take: 500 })) add(b.market.user, b.createdAt);
    } else if (user.role === Role.MARKET && user.market) {
      for (const s of await this.prisma.shipment.findMany({ where: { marketId: user.market.id }, select: shipSel, take: 500 })) { add(s.farmer.user, s.createdAt); add(s.driver?.user, s.createdAt); }
      for (const b of await this.prisma.booking.findMany({ where: { marketId: user.market.id }, select: { createdAt: true, product: { select: { farmer: { select: { user: { select: userSel } } } } } }, take: 500 })) add(b.product.farmer.user, b.createdAt);
    } else if (user.role === Role.DRIVER && user.driver) {
      for (const s of await this.prisma.shipment.findMany({ where: { driverId: user.driver.id }, select: shipSel, take: 500 })) { add(s.farmer.user, s.createdAt); add(s.market.user, s.createdAt); }
    } else throw new ForbiddenException('Shikoyat faqat fermer, haydovchi va market uchun');
    return [...found.values()].sort((a, b) => b.last.getTime() - a.last.getTime())
      .map((f) => ({ userId: f.user.id, fullName: f.user.fullName, role: f.user.role, org: orgOf(f.user), orders: f.orders, penaltyPoints: f.user.penaltyPoints }));
  }

  private mine(c: Prisma.ComplaintGetPayload<{ include: { accused: { select: typeof userSel } } }>) {
    return {
      id: c.id, status: c.status, reason: c.reason, createdAt: c.createdAt, decidedAt: c.decidedAt, decisionNote: c.decisionNote, penalty: c.penalty,
      accused: { id: c.accused.id, fullName: c.accused.fullName, role: c.accused.role, org: orgOf(c.accused) },
      canWithdraw: c.status !== ComplaintStatus.REJECTED && c.status !== ComplaintStatus.WITHDRAWN,
    };
  }

  async create(user: ComplaintActor, accusedId: string, reason: string) {
    if (accusedId === user.id) throw new BadRequestException("O'zingizga shikoyat qila olmaysiz");
    const partners = await this.partners(user);
    if (!partners.some((p) => p.userId === accusedId)) throw new BadRequestException("Shikoyat faqat zakazlar tarixingizdagi hamkorlarga yuboriladi");
    const open = await this.prisma.complaint.count({ where: { reporterId: user.id, accusedId, status: ComplaintStatus.PENDING } });
    if (open > 0) throw new ConflictException("Bu hamkor bo'yicha ko'rib chiqilayotgan shikoyatingiz bor");
    const today = await this.prisma.complaint.count({ where: { reporterId: user.id, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (today >= MAX_COMPLAINTS_PER_DAY) throw new ConflictException("Bir kunda juda ko'p shikoyat yubordingiz. Keyinroq urinib ko'ring");
    const c = await this.prisma.complaint.create({ data: { reporterId: user.id, accusedId, reason: reason.trim() }, include: { accused: { select: userSel } } });
    return { ...this.mine(c), message: "Shikoyatingiz qabul qilindi va 3 ish kuni ichida ko'rib chiqiladi" };
  }

  async listMine(user: ComplaintActor) {
    const rows = await this.prisma.complaint.findMany({ where: { reporterId: user.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { accused: { select: userSel } } });
    return rows.map((c) => this.mine(c));
  }

  /** Shikoyatchi istalgan vaqtda qaytarib oladi: berilgan penalty aybdordan ayriladi (ban sabab bo'lgan bo'lsa — ban ham bekor) */
  async withdraw(user: ComplaintActor, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.complaint.findFirst({ where: { id, reporterId: user.id } });
      if (!c) throw new NotFoundException('Shikoyat topilmadi');
      if (c.status === ComplaintStatus.WITHDRAWN || c.status === ComplaintStatus.REJECTED) throw new ConflictException("Bu shikoyat allaqachon yopilgan");
      const claimed = await tx.complaint.updateMany({ where: { id, status: c.status }, data: { status: ComplaintStatus.WITHDRAWN, decidedAt: c.decidedAt ?? new Date() } });
      if (claimed.count === 0) throw new ConflictException("Shikoyat holati o'zgargan. Sahifani yangilang");
      if (c.penalty > 0) await this.adjust(tx, c.accusedId, -c.penalty);
    });
    return this.listMine(user).then((l) => l.find((x) => x.id === id));
  }

  // ---------- Dispetcher / Super admin ----------

  async listAll(status?: ComplaintStatus) {
    const rows = await this.prisma.complaint.findMany({
      where: status ? { status } : {}, orderBy: [{ createdAt: 'desc' }], take: 200,
      include: { reporter: { select: userSel }, accused: { select: userSel } },
    });
    const pending = await this.prisma.complaint.count({ where: { status: ComplaintStatus.PENDING } });
    const view = (u: U) => ({ id: u.id, fullName: u.fullName, role: u.role, phone: u.phone, org: orgOf(u), penaltyPoints: u.penaltyPoints, banned: !!u.bannedAt });
    return {
      pending,
      items: rows.map((c) => ({
        id: c.id, status: c.status, reason: c.reason, createdAt: c.createdAt, decidedAt: c.decidedAt, decisionNote: c.decisionNote, penalty: c.penalty,
        reporter: view(c.reporter), accused: view(c.accused),
      })),
    };
  }

  /** Qaror: UPHELD +1, PARTIAL +0.5, REJECTED penalty yo'q. 5.0 ga yetsa aybdor avtomatik BANNED */
  async decide(staff: ComplaintActor, id: string, decision: Decision, note?: string) {
    const banned = await this.prisma.$transaction(async (tx) => {
      const c = await tx.complaint.findUnique({ where: { id } });
      if (!c) throw new NotFoundException('Shikoyat topilmadi');
      const penalty = PENALTY[decision];
      const status = decision === 'UPHELD' ? ComplaintStatus.UPHELD : decision === 'PARTIAL' ? ComplaintStatus.PARTIAL : ComplaintStatus.REJECTED;
      const claimed = await tx.complaint.updateMany({
        where: { id, status: ComplaintStatus.PENDING },
        data: { status, penalty, decisionNote: note?.trim() || null, decidedById: staff.id, decidedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("Bu shikoyat allaqachon ko'rib chiqilgan yoki qaytarib olingan");
      if (penalty > 0) await this.adjust(tx, c.accusedId, penalty);
      return (await tx.user.findUniqueOrThrow({ where: { id: c.accusedId }, select: { bannedAt: true } })).bannedAt !== null;
    });
    const all = await this.listAll();
    return { ...all.items.find((x) => x.id === id)!, accusedBanned: banned };
  }

  /** Ballni o'zgartiradi (0 dan past bo'lmaydi); 5.0 ga yetsa BAN, pasaysa (qaytarib olingan shikoyat) penalty-banni bekor qiladi */
  private async adjust(tx: Prisma.TransactionClient, userId: string, delta: number) {
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { penaltyPoints: true, bannedAt: true, banReason: true, role: true, farmer: { select: { id: true } }, driver: { select: { id: true } } } });
    const points = Math.max(0, round(u.penaltyPoints + delta));
    await tx.user.update({ where: { id: userId }, data: { penaltyPoints: points } });
    if (points >= BAN_POINTS && !u.bannedAt) await this.ban(tx, userId, u);
    else if (points < BAN_POINTS && u.bannedAt && u.banReason === BAN_REASON) await this.unban(tx, userId, u);
  }

  private async ban(tx: Prisma.TransactionClient, userId: string, u: { farmer: { id: string } | null; driver: { id: string } | null }) {
    // Akkaunt BANNED: kirish va API taqiqlanadi (tokenlar bekor), e'lonlar muzlatiladi, haydovchi e'lonlari yashiriladi, ochiq takliflar bekor qilinadi
    await tx.user.update({ where: { id: userId }, data: { isActive: false, bannedAt: new Date(), banReason: BAN_REASON, tokenVersion: { increment: 1 } } });
    if (u.farmer) {
      await tx.product.updateMany({ where: { farmerId: u.farmer.id, status: ProductStatus.ACTIVE }, data: { status: ProductStatus.FROZEN } });
      await tx.priceOffer.updateMany({ where: { product: { farmerId: u.farmer.id }, status: { in: ['PENDING', 'COUNTERED'] } }, data: { status: 'CANCELLED', decidedAt: new Date() } });
    }
    if (u.driver) await tx.driverPost.updateMany({ where: { driverId: u.driver.id, isActive: true }, data: { isActive: false } });
    await tx.priceOffer.updateMany({ where: { market: { userId }, status: { in: ['PENDING', 'COUNTERED'] } }, data: { status: 'CANCELLED', decidedAt: new Date() } });
  }

  private async unban(tx: Prisma.TransactionClient, userId: string, u: { farmer: { id: string } | null }) {
    await tx.user.update({ where: { id: userId }, data: { isActive: true, bannedAt: null, banReason: null } });
    if (u.farmer) await tx.product.updateMany({ where: { farmerId: u.farmer.id, status: ProductStatus.FROZEN }, data: { status: ProductStatus.ACTIVE } });
  }
}
