import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeSubscription } from '../subscription/subscription.logic';
import { MAX_ROWS, addSheet, newWorkbook, summarySheet, toBuffer } from './xlsx';

const PAY_UZ: Record<string, string> = { PENDING: 'Kutilmoqda', HELD: "Escrow'da", RELEASED: "Fermerga o'tkazilgan", REFUNDED: 'Qaytarilgan', CANCELLED: 'Bekor qilingan' };
const BOOK_UZ: Record<string, string> = { PENDING: 'Kutilmoqda', APPROVED: 'Tasdiqlangan', REJECTED: 'Rad etilgan', CANCELLED: 'Bekor qilingan' };
const WH_UZ: Record<string, string> = { PENDING: 'Kutilmoqda', PICKING: "Yig'ilmoqda", PICKED: 'Yig\'ildi', DISPATCHED: "Yo'lda", DELIVERED: 'Yetkazilgan', CANCELLED: 'Bekor qilingan' };
const ROLE_UZ: Record<string, string> = { FARMER: 'Fermer', DRIVER: 'Haydovchi', MARKET: 'Market', ADMIN: 'Admin', DISPATCHER: 'Dispetcher' };
const SUB_UZ: Record<string, string> = { TRIAL: 'Sinov', ACTIVE: 'Faol', EXPIRED: 'Tugagan', EXEMPT: 'Ozod' };
const n = (v: unknown) => Number(v ?? 0);

/** "YYYY-MM" -> [boshi, oxiri) (UTC). "all" yoki bo'sh -> cheklovsiz. */
export function monthRange(month?: string): { gte?: Date; lt?: Date; label: string } {
  if (!month || month === 'all') return { label: 'Barcha vaqt' };
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) throw new BadRequestException("month YYYY-MM ko'rinishida (yoki 'all') bo'lishi kerak");
  const y = Number(m[1]), mo = Number(m[2]);
  return { gte: new Date(Date.UTC(y, mo - 1, 1)), lt: new Date(Date.UTC(y, mo, 1)), label: month };
}
function dayRange(from?: string, to?: string): { gte?: Date; lt?: Date; label: string } {
  const parse = (s: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw new BadRequestException("Sana YYYY-MM-DD ko'rinishida bo'lishi kerak"); return new Date(s + 'T00:00:00Z'); };
  const gte = from ? parse(from) : undefined;
  const lt = to ? new Date(parse(to).getTime() + 86_400_000) : undefined;
  if (gte && lt && gte >= lt) throw new BadRequestException("'from' sanasi 'to' dan oldin bo'lishi kerak");
  return { gte, lt, label: `${from ?? '...'} — ${to ?? '...'}` };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Market hisoboti: oylik xaridlar, to'lovlar, escrow va ombor buyurtmalari */
  async market(user: { market?: { id: string; companyName: string } | null }, month?: string) {
    if (!user.market) throw new ForbiddenException('Market profili topilmadi');
    const mid = user.market.id;
    const r = monthRange(month);
    const createdAt: Prisma.DateTimeFilter | undefined = r.gte || r.lt ? { gte: r.gte, lt: r.lt } : undefined;

    const [bookings, payments, orders] = await Promise.all([
      this.prisma.booking.findMany({ where: { marketId: mid, createdAt }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS, include: { product: { select: { name: true, farmer: { select: { farmName: true } } } } } }),
      this.prisma.payment.findMany({
        where: { createdAt, OR: [{ booking: { marketId: mid } }, { warehouseOrder: { marketId: mid } }] }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS,
        include: {
          booking: { select: { quantityKg: true, pricePerKg: true, product: { select: { name: true, farmer: { select: { farmName: true } } } } } },
          warehouseOrder: { select: { quantityKg: true, pricePerKg: true, item: { select: { name: true, farmer: { select: { farmName: true } } } } } },
        },
      }),
      this.prisma.warehouseOrder.findMany({ where: { marketId: mid, createdAt }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS, include: { item: { select: { name: true, farmer: { select: { farmName: true } } } } } }),
    ]);

    const sum = (st: PaymentStatus[]) => payments.filter((p) => st.includes(p.status)).reduce((a, p) => a + n(p.amount), 0);
    const wb = newWorkbook();
    summarySheet(wb, `Market hisoboti: ${user.market.companyName}`, [
      ['Davr', r.label],
      ['Bronlar soni', bookings.length],
      ['Tasdiqlangan bronlar', bookings.filter((b) => b.status === 'APPROVED').length],
      ["Jami xarid summasi (bekor qilinmagan to'lovlar), so'm", sum([PaymentStatus.PENDING, PaymentStatus.HELD, PaymentStatus.RELEASED])],
      ["To'langan (Escrow + o'tkazilgan), so'm", sum([PaymentStatus.HELD, PaymentStatus.RELEASED])],
      ["Escrow'dagi mablag', so'm", sum([PaymentStatus.HELD])],
      ["Fermerga o'tkazilgan, so'm", sum([PaymentStatus.RELEASED])],
      ["Qaytarilgan, so'm", sum([PaymentStatus.REFUNDED])],
      ["Kutilayotgan to'lovlar, so'm", sum([PaymentStatus.PENDING])],
      ['Ombor buyurtmalari soni', orders.length],
      ["Ombor buyurtmalari summasi (bekor qilinmagan), so'm", orders.filter((o) => o.status !== 'CANCELLED').reduce((a, o) => a + n(o.totalPrice), 0)],
    ]);
    addSheet(wb, 'Bronlar', [
      { header: 'Sana', key: 'd', fmt: 'date', width: 18 }, { header: 'Mahsulot', key: 'p', width: 22 }, { header: 'Fermer', key: 'f', width: 24 },
      { header: 'Miqdor (kg)', key: 'q', fmt: 'kg' }, { header: "Narx (so'm/kg)", key: 'pr', fmt: 'money' }, { header: "Summa (so'm)", key: 's', fmt: 'money' }, { header: 'Holati', key: 'st', width: 16 },
    ], bookings.map((b) => ({ d: b.createdAt, p: b.product.name, f: b.product.farmer.farmName, q: n(b.quantityKg), pr: n(b.pricePerKg), s: n(b.quantityKg) * n(b.pricePerKg), st: BOOK_UZ[b.status] ?? b.status })));
    addSheet(wb, "To'lovlar", [
      { header: 'Sana', key: 'd', fmt: 'date', width: 18 }, { header: 'Manba', key: 'src', width: 14 }, { header: 'Mahsulot', key: 'p', width: 22 }, { header: 'Fermer', key: 'f', width: 24 },
      { header: 'Miqdor (kg)', key: 'q', fmt: 'kg' }, { header: "Narx (so'm/kg)", key: 'pr', fmt: 'money' }, { header: "Summa (so'm)", key: 's', fmt: 'money' }, { header: "Xizmat haqi (so'm)", key: 'fee', fmt: 'money' },
      { header: 'Holati', key: 'st', width: 22 }, { header: "Escrow'ga o'tgan", key: 'h', fmt: 'date' }, { header: "Fermerga o'tkazilgan", key: 'rl', fmt: 'date' },
    ], payments.map((p) => {
      const src = p.booking ?? p.warehouseOrder;
      const prod = p.booking?.product ?? p.warehouseOrder?.item;
      return { d: p.createdAt, src: p.booking ? 'Bron' : 'Ombor', p: prod?.name, f: prod?.farmer.farmName, q: n(src?.quantityKg), pr: n(src?.pricePerKg), s: n(p.amount), fee: n(p.feeAmount), st: PAY_UZ[p.status] ?? p.status, h: p.heldAt, rl: p.releasedAt };
    }));
    addSheet(wb, 'Ombor buyurtmalari', [
      { header: 'Sana', key: 'd', fmt: 'date', width: 18 }, { header: 'Mahsulot', key: 'p', width: 22 }, { header: 'Fermer', key: 'f', width: 24 },
      { header: 'Miqdor (kg)', key: 'q', fmt: 'kg' }, { header: "Narx (so'm/kg)", key: 'pr', fmt: 'money' }, { header: "Jami (so'm)", key: 't', fmt: 'money' }, { header: 'Holati', key: 'st', width: 16 }, { header: 'Yetkazilgan', key: 'dl', fmt: 'date' },
    ], orders.map((o) => ({ d: o.createdAt, p: o.item.name, f: o.item.farmer.farmName, q: n(o.quantityKg), pr: n(o.pricePerKg), t: n(o.totalPrice), st: WH_UZ[o.status] ?? o.status, dl: o.deliveredAt })));
    return toBuffer(wb);
  }

  /** Admin hisoboti: tranzaksiyalar tarixi, foydalanuvchilar va obuna to'lovlari */
  async admin(from?: string, to?: string) {
    const r = dayRange(from, to);
    const createdAt: Prisma.DateTimeFilter | undefined = r.gte || r.lt ? { gte: r.gte, lt: r.lt } : undefined;
    const [payments, users, subs] = await Promise.all([
      this.prisma.payment.findMany({
        where: { createdAt }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS,
        include: {
          events: { orderBy: { createdAt: 'asc' } },
          booking: { select: { quantityKg: true, market: { select: { companyName: true } }, product: { select: { name: true, farmer: { select: { farmName: true } } } } } },
          warehouseOrder: { select: { quantityKg: true, market: { select: { companyName: true } }, item: { select: { name: true, farmer: { select: { farmName: true } } } } } },
        },
      }),
      this.prisma.user.findMany({ where: { createdAt }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS, include: { farmer: { select: { region: true, farmName: true } }, market: { select: { region: true, companyName: true } }, driver: { select: { region: true, plateNumber: true } } } }),
      this.prisma.subscriptionPayment.findMany({ where: { createdAt }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS, include: { user: { select: { fullName: true, phone: true } } } }),
    ]);
    const total = (st: PaymentStatus[]) => payments.filter((p) => st.includes(p.status)).reduce((a, p) => a + n(p.amount), 0);
    const wb = newWorkbook();
    summarySheet(wb, 'AgrarGo: administrator hisoboti', [
      ['Davr', r.label],
      ['Tranzaksiyalar soni', payments.length],
      ["Escrow'dagi mablag', so'm", total([PaymentStatus.HELD])],
      ["Fermerlarga o'tkazilgan, so'm", total([PaymentStatus.RELEASED])],
      ["Qaytarilgan, so'm", total([PaymentStatus.REFUNDED])],
      ['Foydalanuvchilar soni', users.length],
      ['Obuna to\'lovlari soni', subs.length],
      ["Obuna to'lovlari summasi, so'm", subs.reduce((a, s) => a + n(s.amount), 0)],
    ]);
    addSheet(wb, 'Tranzaksiyalar', [
      { header: 'Sana', key: 'd', fmt: 'date', width: 18 }, { header: 'ID', key: 'id', width: 14 }, { header: 'Manba', key: 'src', width: 10 }, { header: 'Market', key: 'm', width: 24 }, { header: 'Fermer', key: 'f', width: 24 },
      { header: 'Mahsulot', key: 'p', width: 20 }, { header: 'Miqdor (kg)', key: 'q', fmt: 'kg' }, { header: "Summa (so'm)", key: 's', fmt: 'money' }, { header: "Xizmat haqi (so'm)", key: 'fee', fmt: 'money' },
      { header: 'Holati', key: 'st', width: 20 }, { header: 'Provayder', key: 'pv', width: 12 }, { header: "Escrow'ga o'tgan", key: 'h', fmt: 'date' }, { header: "Fermerga o'tkazilgan", key: 'rl', fmt: 'date' }, { header: 'Qaytarilgan', key: 'rf', fmt: 'date' },
    ], payments.map((p) => {
      const src = p.booking ?? p.warehouseOrder; const prod = p.booking?.product ?? p.warehouseOrder?.item;
      return { d: p.createdAt, id: p.id.slice(0, 8).toUpperCase(), src: p.booking ? 'Bron' : 'Ombor', m: src?.market.companyName, f: prod?.farmer.farmName, p: prod?.name, q: n(src?.quantityKg), s: n(p.amount), fee: n(p.feeAmount), st: PAY_UZ[p.status] ?? p.status, pv: p.provider, h: p.heldAt, rl: p.releasedAt, rf: p.refundedAt };
    }));
    addSheet(wb, 'Tranzaksiya tarixi', [
      { header: 'To\'lov ID', key: 'id', width: 14 }, { header: 'Sana', key: 'd', fmt: 'date', width: 18 }, { header: 'Holat', key: 'st', width: 20 }, { header: 'Kim', key: 'a', width: 12 }, { header: 'Izoh', key: 'n', width: 40 },
    ], payments.flatMap((p) => p.events.map((e) => ({ id: p.id.slice(0, 8).toUpperCase(), d: e.createdAt, st: PAY_UZ[e.status] ?? e.status, a: e.actor, n: e.note }))));
    addSheet(wb, 'Foydalanuvchilar', [
      { header: "Ro'yxatdan o'tgan", key: 'd', fmt: 'date', width: 18 }, { header: 'Ism', key: 'name', width: 24 }, { header: 'Telefon', key: 'ph', width: 16 }, { header: 'Rol', key: 'role', width: 12 },
      { header: 'Tashkilot', key: 'org', width: 24 }, { header: 'Hudud', key: 'reg', width: 18 }, { header: 'Faol', key: 'act', width: 8 },
      { header: 'Obuna holati', key: 'sub', width: 14 }, { header: 'Sinov tugashi', key: 'te', fmt: 'date' }, { header: 'Obuna tugashi', key: 'se', fmt: 'date' },
    ], users.map((u) => ({
      d: u.createdAt, name: u.fullName, ph: u.phone, role: ROLE_UZ[u.role] ?? u.role, org: u.farmer?.farmName ?? u.market?.companyName ?? u.driver?.plateNumber ?? '',
      reg: u.farmer?.region ?? u.market?.region ?? u.driver?.region ?? '', act: u.isActive ? 'Ha' : "Yo'q", sub: SUB_UZ[computeSubscription(u).state], te: u.trialEndsAt, se: u.subscriptionEndsAt,
    })));
    addSheet(wb, "Obuna to'lovlari", [
      { header: 'Sana', key: 'd', fmt: 'date', width: 18 }, { header: 'Foydalanuvchi', key: 'u', width: 24 }, { header: 'Telefon', key: 'ph', width: 16 }, { header: 'Rol', key: 'role', width: 12 },
      { header: 'Oylar', key: 'mo', fmt: 'int', width: 8 }, { header: "Summa (so'm)", key: 's', fmt: 'money' }, { header: 'Davr boshi', key: 'ps', fmt: 'date' }, { header: 'Davr oxiri', key: 'pe', fmt: 'date' }, { header: 'Provayder', key: 'pv', width: 12 },
    ], subs.map((s) => ({ d: s.createdAt, u: s.user.fullName, ph: s.user.phone, role: ROLE_UZ[s.role] ?? s.role, mo: s.months, s: n(s.amount), ps: s.periodStart, pe: s.periodEnd, pv: s.provider })));
    return toBuffer(wb);
  }
}
