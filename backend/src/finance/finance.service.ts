import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdjustmentKind, PaymentStatus, Prisma, Role, ShipmentStatus } from '@prisma/client';
import { moneyTx } from '../payment/money-tx';
import { PaymentService } from '../payment/payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustmentsQuery, EscrowListQuery, PeriodQuery, ResolvePaymentDto } from './finance.dto';

const num = (d: Prisma.Decimal | number | bigint | null | undefined) => (d === null || d === undefined ? 0 : Number(d));

/** Xaridordan haqiqatda yechilgan jami (hozirgi, ziyon bo'yicha tuzatilgan): mahsulot + yo'l + komissiya + Hub haqi - keshbek */
const TOTAL_SQL = Prisma.sql`(p."amount" + p."deliveryFee" + p."serviceFee" + p."hubFee" - p."cashbackUsed")`;
const KIND_SQL = Prisma.sql`(CASE WHEN p."bookingId" IS NOT NULL THEN 'BOOKING' WHEN p."warehouseOrderId" IS NOT NULL THEN 'WAREHOUSE' ELSE 'LOCAL' END)`;

const LIST_INCLUDE = {
  booking: { select: { id: true, market: { select: { companyName: true } }, product: { select: { name: true, farmer: { select: { farmName: true } } } }, shipment: { select: { status: true } } } },
  warehouseOrder: { select: { id: true, market: { select: { companyName: true } }, item: { select: { name: true, farmer: { select: { farmName: true } } } }, shipment: { select: { status: true } } } },
  localOrder: { select: { id: true, status: true, consumer: { select: { user: { select: { fullName: true } } } }, product: { select: { name: true, farmer: { select: { farmName: true } } } } } },
  _count: { select: { adjustments: true } },
} satisfies Prisma.PaymentInclude;
type ListRow = Prisma.PaymentGetPayload<{ include: typeof LIST_INCLUDE }>;

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService, private readonly payments: PaymentService) {}

  private range(q: PeriodQuery, col: string) {
    const c = Prisma.raw(col);
    return Prisma.sql`${q.from ? Prisma.sql`AND ${c} >= ${new Date(q.from)}` : Prisma.empty} ${q.to ? Prisma.sql`AND ${c} <= ${new Date(q.to)}` : Prisma.empty}`;
  }

  // ---------- Umumiy ko'rsatkichlar ----------

  async summary(q: PeriodQuery) {
    const [escrow, profit, packaging, adj, cb, cbBalance] = await Promise.all([
      this.prisma.$queryRaw<{ status: PaymentStatus; kind: string; c: bigint; total: Prisma.Decimal; refunded: Prisma.Decimal }[]>(Prisma.sql`
        SELECT p."status", ${KIND_SQL} AS kind, count(*) AS c, COALESCE(sum(${TOTAL_SQL}), 0) AS total, COALESCE(sum(p."refundedAmount"), 0) AS refunded
        FROM "Payment" p WHERE true ${this.range(q, 'p."createdAt"')} GROUP BY 1, 2`),
      this.prisma.$queryRaw<{ commission: Prisma.Decimal; cashback: Prisma.Decimal; warehouse: Prisma.Decimal; hub: Prisma.Decimal; c: bigint }[]>(Prisma.sql`
        SELECT COALESCE(sum(p."serviceFee"), 0) AS commission, COALESCE(sum(p."cashbackUsed"), 0) AS cashback, COALESCE(sum(p."feeAmount"), 0) AS warehouse, COALESCE(sum(p."hubFee"), 0) AS hub, count(*) AS c
        FROM "Payment" p WHERE p."status" = 'RELEASED' ${this.range(q, 'p."releasedAt"')}`),
      this.prisma.$queryRaw<{ s: Prisma.Decimal; c: bigint }[]>(Prisma.sql`
        SELECT COALESCE(sum(a."transferAmount"), 0) AS s, count(*) AS c FROM "PaymentAdjustment" a WHERE a."kind" = 'PACKAGING' ${this.range(q, 'a."createdAt"')}`),
      this.prisma.$queryRaw<{ kind: AdjustmentKind; c: bigint; refund: Prisma.Decimal; goods: Prisma.Decimal }[]>(Prisma.sql`
        SELECT a."kind", count(*) AS c, COALESCE(sum(a."refundAmount"), 0) AS refund, COALESCE(sum(a."goodsAmount"), 0) AS goods
        FROM "PaymentAdjustment" a WHERE a."kind" <> 'PACKAGING' ${this.range(q, 'a."createdAt"')} GROUP BY 1`),
      this.prisma.$queryRaw<{ type: string; s: Prisma.Decimal; c: bigint }[]>(Prisma.sql`
        SELECT t."type", COALESCE(sum(t."amount"), 0) AS s, count(*) AS c FROM "CashbackTransaction" t WHERE true ${this.range(q, 't."createdAt"')} GROUP BY 1`),
      this.prisma.user.aggregate({ _sum: { cashbackBalance: true } }),
    ]);

    const byStatus: Record<string, { count: number; amount: number; refunded: number }> = {};
    const byKind: Record<string, { count: number; amount: number }> = {};
    for (const r of escrow) {
      const b = (byStatus[r.status] ??= { count: 0, amount: 0, refunded: 0 });
      b.count += Number(r.c); b.amount += num(r.total); b.refunded += num(r.refunded);
      if (r.status === PaymentStatus.HELD) { const k = (byKind[r.kind] ??= { count: 0, amount: 0 }); k.count += Number(r.c); k.amount += num(r.total); }
    }
    const pr = profit[0];
    const commissionGross = num(pr.commission), cashbackCovered = num(pr.cashback);
    const commissionNet = commissionGross - cashbackCovered; // keshbek platforma xarajati: xaridor kamroq to'laydi
    const warehouseFee = num(pr.warehouse), packagingFee = num(packaging[0].s);
    const cbBy = Object.fromEntries(cb.map((x) => [x.type, { amount: num(x.s), count: Number(x.c) }]));
    return {
      escrow: { byStatus, heldByKind: byKind, partialRefunds: Object.values(byStatus).reduce((a, x) => a + x.refunded, 0) },
      profit: {
        releasedPayments: Number(pr.c), commissionGross, cashbackCovered, commissionNet, warehouseFee, packagingFee, packagingCount: Number(packaging[0].c),
        hubFees: num(pr.hub), total: commissionNet + warehouseFee + packagingFee,
      },
      disputes: {
        refunded: adj.reduce((a, x) => a + num(x.refund), 0), count: adj.reduce((a, x) => a + Number(x.c), 0),
        byKind: Object.fromEntries(adj.map((x) => [x.kind, { count: Number(x.c), refund: num(x.refund), goods: num(x.goods) }])),
      },
      cashback: {
        earned: cbBy.EARNED?.amount ?? 0, spent: cbBy.SPENT?.amount ?? 0, restored: cbBy.REFUNDED?.amount ?? 0,
        turnover: (cbBy.EARNED?.amount ?? 0) + (cbBy.SPENT?.amount ?? 0), outstanding: num(cbBalance._sum.cashbackBalance),
        earnedCount: cbBy.EARNED?.count ?? 0, spentCount: cbBy.SPENT?.count ?? 0,
      },
    };
  }

  /** Cashback aylanmasi: oylar bo'yicha yozilgan / ishlatilgan / qaytgan (so'nggi 6 oy) */
  async cashbackMonthly() {
    const rows = await this.prisma.$queryRaw<{ m: string; type: string; s: Prisma.Decimal }[]>`
      SELECT to_char(date_trunc('month', t."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent'), 'YYYY-MM') AS m, t."type", COALESCE(sum(t."amount"), 0) AS s
      FROM "CashbackTransaction" t WHERE t."createdAt" >= now() - interval '6 months' GROUP BY 1, 2 ORDER BY 1`;
    const months = [...new Set(rows.map((r) => r.m))];
    return months.map((m) => ({ month: m, earned: num(rows.find((r) => r.m === m && r.type === 'EARNED')?.s), spent: num(rows.find((r) => r.m === m && r.type === 'SPENT')?.s), restored: num(rows.find((r) => r.m === m && r.type === 'REFUNDED')?.s) }));
  }

  // ---------- Escrow jadvali ----------

  async escrow(q: EscrowListQuery) {
    const where: Prisma.PaymentWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.kind === 'BOOKING' && { bookingId: { not: null } }),
      ...(q.kind === 'WAREHOUSE' && { warehouseOrderId: { not: null } }),
      ...(q.kind === 'LOCAL' && { localOrderId: { not: null } }),
      ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
    };
    const limit = q.limit ?? 20, page = q.page ?? 1;
    const [total, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: LIST_INCLUDE }),
    ]);
    return { items: rows.map((r) => this.row(r)), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  private kindOf(r: { bookingId: string | null; warehouseOrderId: string | null }) { return r.bookingId ? 'BOOKING' : r.warehouseOrderId ? 'WAREHOUSE' : 'LOCAL'; }

  private row(r: ListRow) {
    const kind = this.kindOf(r);
    const party = r.booking ? { buyer: r.booking.market.companyName, farm: r.booking.product.farmer.farmName, product: r.booking.product.name, ref: r.booking.id }
      : r.warehouseOrder ? { buyer: r.warehouseOrder.market.companyName, farm: r.warehouseOrder.item.farmer.farmName, product: r.warehouseOrder.item.name, ref: r.warehouseOrder.id }
      : { buyer: r.localOrder!.consumer.user.fullName, farm: r.localOrder!.product.farmer.farmName, product: r.localOrder!.product.name, ref: r.localOrder!.id };
    const total = r.amount.add(r.deliveryFee).add(r.serviceFee).add(r.hubFee).sub(r.cashbackUsed);
    const held = r.status === PaymentStatus.HELD;
    return {
      id: r.id, kind, status: r.status, ...party, total: num(total), amount: num(r.amount), deliveryFee: num(r.deliveryFee), serviceFee: num(r.serviceFee), hubFee: num(r.hubFee),
      cashbackUsed: num(r.cashbackUsed), refundedAmount: num(r.refundedAmount), adjustments: r._count.adjustments,
      heldAt: r.heldAt, releasedAt: r.releasedAt, refundedAt: r.refundedAt, createdAt: r.createdAt,
      // Qo'lda qaror: bron to'lovlari — hammasi; ombor — ziyon/foiz; chakana — ziyonni Hub xodimi qadoqlashda qayd etadi
      resolve: held ? (kind === 'BOOKING' ? ['DAMAGE', 'PERCENT', 'RELEASE', 'REFUND'] : kind === 'WAREHOUSE' ? ['DAMAGE', 'PERCENT'] : []) : [],
    };
  }

  async paymentDetail(id: string) {
    const r = await this.prisma.payment.findUnique({
      where: { id }, include: { ...LIST_INCLUDE, events: { orderBy: { createdAt: 'asc' } }, splits: true, adjustments: { orderBy: { seq: 'asc' } } },
    });
    if (!r) throw new NotFoundException("To'lov topilmadi");
    return {
      ...this.row(r),
      events: r.events.map((e) => ({ status: e.status, actor: e.actor, note: e.note, createdAt: e.createdAt })),
      splits: r.splits.map((s) => ({ party: s.party, amount: num(s.amount), status: s.status })),
      adjustmentList: r.adjustments.map((a) => this.adjView(a)),
    };
  }

  private adjView(a: Prisma.PaymentAdjustmentGetPayload<object>) {
    return {
      id: a.id, paymentId: a.paymentId, seq: a.seq, kind: a.kind, intakeId: a.intakeId, totalBoxes: a.totalBoxes, damagedBoxes: a.damagedBoxes, goodsAmount: num(a.goodsAmount), deliveryAmount: num(a.deliveryAmount),
      serviceAmount: num(a.serviceAmount), refundAmount: num(a.refundAmount), transferAmount: num(a.transferAmount), actor: a.actor, note: a.note, createdAt: a.createdAt,
    };
  }

  /** Qayta hisoblash jurnali: ziyon (xaridorga qaytarish), qadoqlash haqi ushlanmasi va nizo qarorlari */
  async adjustments(q: AdjustmentsQuery) {
    const where: Prisma.PaymentAdjustmentWhereInput = {
      ...(q.kind && { kind: q.kind }),
      ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
    };
    const limit = q.limit ?? 20, page = q.page ?? 1;
    const [total, rows] = await Promise.all([
      this.prisma.paymentAdjustment.count({ where }),
      this.prisma.paymentAdjustment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    return { items: rows.map((a) => this.adjView(a)), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  // ---------- Nizoni qo'lda hal qilish ----------

  async resolve(actor: { id: string }, paymentId: string, dto: ResolvePaymentDto) {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, bookingId: true, warehouseOrderId: true, localOrderId: true, booking: { select: { id: true, shipment: { select: { status: true } } } }, warehouseOrder: { select: { shipment: { select: { status: true } } } } },
    });
    if (!p) throw new NotFoundException("To'lov topilmadi");
    if (p.status !== PaymentStatus.HELD) throw new ConflictException("Faqat escrow'dagi (HELD) to'lovga qaror chiqariladi");
    if (p.localOrderId) throw new ConflictException("Chakana buyurtma ziyonini Hub xodimi qadoqlash bosqichida qayd etadi (ombor qoldig'i ham shunga bog'liq)");
    const admin = { id: actor.id, role: Role.ADMIN };

    if (dto.action === 'RELEASE' || dto.action === 'REFUND') {
      if (!p.booking) throw new ConflictException("Bu amal faqat bron to'lovlari uchun; ombor buyurtmasi to'lovi buyurtma orqali yopiladi");
      return dto.action === 'RELEASE' ? this.payments.release(admin, p.booking.id) : this.payments.refund(admin, p.booking.id, dto.reason);
    }

    let damaged: number, total: number;
    if (dto.action === 'DAMAGE') {
      if (!dto.damagedBoxes || !dto.totalBoxes) throw new BadRequestException('Yaroqsiz va jami qutilar sonini kiriting');
      damaged = dto.damagedBoxes; total = dto.totalBoxes;
    } else {
      if (!dto.percent) throw new BadRequestException('Qaytariladigan foizni kiriting (1-99)');
      damaged = dto.percent; total = 100;
    }
    // Yo'l haqi: yuk yo'lga chiqmagan bo'lsa nisbatan qirqiladi, yo'lda/yetkazilgan bo'lsa haydovchi to'liq oladi (administrator o'zgartira oladi)
    const shipStatus = (p.booking?.shipment ?? p.warehouseOrder?.shipment)?.status;
    const policy = dto.deliveryPolicy ?? (shipStatus === ShipmentStatus.IN_TRANSIT || shipStatus === ShipmentStatus.DELIVERED ? 'KEEP' : 'PRORATE');
    await moneyTx(this.prisma, (tx) => this.payments.adjustForDamage(tx, paymentId, {
      damagedBoxes: damaged, totalBoxes: total, deliveryPolicy: policy, actor: 'ADMIN', actorUserId: actor.id, kind: AdjustmentKind.DISPUTE,
      note: `${dto.action === 'PERCENT' ? `Nizo: mahsulot summasining ${dto.percent}% qaytarildi` : 'Nizo: ziyon'}. ${dto.reason}`,
    }), { serializable: true });
    return this.paymentDetail(paymentId);
  }

  // ---------- Yaxlitlik tekshiruvi ----------

  /** Hisob-kitob izchilligi: ulushlar yig'indisi, holatlar, qaytarishlar va ushlangan qadoqlash haqi jurnal bilan mos kelishi */
  async reconcile() {
    const [splits, status, refunds, packaging] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; total: Prisma.Decimal; sp: Prisma.Decimal }[]>(Prisma.sql`
        SELECT p.id, ${TOTAL_SQL} AS total, COALESCE(sum(s."amount"), 0) AS sp FROM "Payment" p LEFT JOIN "PaymentSplit" s ON s."paymentId" = p.id
        WHERE p."localOrderId" IS NOT NULL AND p."status" IN ('HELD', 'RELEASED') GROUP BY p.id HAVING ${TOTAL_SQL} <> COALESCE(sum(s."amount"), 0)`),
      this.prisma.$queryRaw<{ id: string; status: string; ss: string }[]>`
        SELECT p.id, p."status", s."status" AS ss FROM "Payment" p JOIN "PaymentSplit" s ON s."paymentId" = p.id
        WHERE (p."status" = 'HELD' AND s."status" <> 'HELD') OR (p."status" = 'RELEASED' AND s."status" <> 'PAID') OR (p."status" = 'REFUNDED' AND s."status" <> 'REFUNDED')
        GROUP BY p.id, p."status", s."status"`,
      this.prisma.$queryRaw<{ id: string; refunded: Prisma.Decimal; logged: Prisma.Decimal }[]>`
        SELECT p.id, p."refundedAmount" AS refunded, COALESCE(sum(a."refundAmount"), 0) AS logged FROM "Payment" p LEFT JOIN "PaymentAdjustment" a ON a."paymentId" = p.id AND a."kind" <> 'PACKAGING'
        WHERE p."status" IN ('HELD', 'RELEASED') GROUP BY p.id HAVING p."refundedAmount" <> COALESCE(sum(a."refundAmount"), 0)`,
      this.prisma.$queryRaw<{ id: string; paid: Prisma.Decimal; logged: Prisma.Decimal }[]>`
        SELECT i.id, i."packagingPaid" AS paid, COALESCE(sum(a."transferAmount"), 0) AS logged FROM "HubIntake" i LEFT JOIN "PaymentAdjustment" a ON a."intakeId" = i.id AND a."kind" = 'PACKAGING'
        WHERE i."usePackaging" = true GROUP BY i.id HAVING i."packagingPaid" <> COALESCE(sum(a."transferAmount"), 0)`,
    ]);
    const issues = [
      ...splits.map((r) => ({ type: 'SPLIT_SUM', paymentId: r.id, detail: `Ulushlar yig'indisi ${num(r.sp)} ≠ jami ${num(r.total)}` })),
      ...status.map((r) => ({ type: 'STATUS_MISMATCH', paymentId: r.id, detail: `To'lov ${r.status}, ulush ${r.ss}` })),
      ...refunds.map((r) => ({ type: 'REFUND_LOG', paymentId: r.id, detail: `Qaytarilgan ${num(r.refunded)} ≠ jurnal ${num(r.logged)}` })),
      ...packaging.map((r) => ({ type: 'PACKAGING_LOG', paymentId: null, detail: `Topshirish ${r.id}: ushlangan ${num(r.paid)} ≠ jurnal ${num(r.logged)}` })),
    ];
    return { ok: issues.length === 0, checkedAt: new Date(), issues };
  }
}
