import { CashbackService } from '../cashback/cashback.service';
import { BadGatewayException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AdjustmentKind, BookingStatus, PaymentStatus, Prisma, Role, ShipmentStatus, SplitStatus } from '@prisma/client';
import { LocalQuote, localSplits } from '../local/local-pricing';
import { restoreStock } from '../booking/stock';
import { computeAmount } from './payment.factory';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { NotificationService } from '../telegram/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListPaymentsQuery } from './dto/payment.dto';
import { PricingService } from '../pricing/pricing.service';
import { breakdownOf, paymentBreakdown } from '../pricing/pricing';
import {
  Decision, PaymentActor, PolicyContext, payDecision, refundDecision, releaseDecision,
} from './payment.policy';
import { PAYMENT_PROVIDER, PaymentProvider } from './provider/payment-provider';
import { DeliveryPolicy, damageRefund, packagingDeductions } from './escrow-math';
import { moneyTx } from './money-tx';

const PAYMENT_INCLUDE = {
  events: { orderBy: { createdAt: Prisma.SortOrder.asc } },
  booking: {
    select: {
      id: true,
      marketId: true,
      quantityKg: true,
      pricePerKg: true,
      status: true,
      productId: true,
      product: { select: { name: true, category: true, farmerId: true, farmer: { select: { farmName: true, region: true } } } },
      market: { select: { companyName: true, region: true } },
      shipment: { select: { id: true, status: true, deliveredAt: true, driverId: true } },
    },
  },
  splits: { orderBy: { party: Prisma.SortOrder.asc } },
  localOrder: {
    select: {
      id: true, status: true, consumerId: true, farmerId: true, hubId: true, courierId: true, quantityKg: true, pricePerKg: true, deliveredAt: true,
      product: { select: { name: true, category: true, farmer: { select: { farmName: true, region: true } } } },
      hub: { select: { name: true, region: true } },
      consumer: { select: { user: { select: { fullName: true } } } },
    },
  },
  warehouseOrder: {
    select: {
      id: true,
      status: true,
      marketId: true,
      quantityKg: true,
      pricePerKg: true,
      item: { select: { name: true, category: true, farmerId: true, farmer: { select: { farmName: true, region: true } } } },
      market: { select: { companyName: true, region: true } },
      shipment: { select: { id: true, status: true, deliveredAt: true, driverId: true } },
    },
  },
} satisfies Prisma.PaymentInclude;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

const logger = new Logger('Payments');

export interface PaymentUser {
  id: string;
  role: Role;
  market?: { id: string } | null;
  farmer?: { id: string } | null;
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly notify: NotificationService,
    private readonly pricing: PricingService,
    private readonly cashback: CashbackService,
  ) {}

  // ---------- Ombor buyurtmalari (escrow) ----------
  // Bu amallar WarehouseOrderService'ning tranzaksiyasi ichida chaqiriladi: provayder xatosi butun amalni (zaxira ham) qaytaradi.

  /** Market to'laydigan jami summa: mahsulot + yetkazib berish + xizmat haqi (eski yozuvlarda faqat mahsulot) */
  private total(row: { amount: Prisma.Decimal; deliveryFee: Prisma.Decimal; serviceFee: Prisma.Decimal; hubFee: Prisma.Decimal; cashbackUsed?: Prisma.Decimal }) {
    // Xaridordan haqiqatda yechiladigan (yoki qaytariladigan) summa: jami minus keshbek bilan qoplangan qism
    return row.amount.add(row.deliveryFee).add(row.serviceFee).add(row.hubFee).sub(row.cashbackUsed ?? 0);
  }

  // ---------- Chakana (Hub) buyurtmalari: escrow va taqsimot ----------
  // LocalOrderService tranzaksiyasi ichida chaqiriladi: provayder xatosi butun amalni (zaxira ham) qaytaradi.

  /**
   * Buyurtma berilganda xaridor mablag'i darhol escrow'ga o'tadi (HELD) va jami summa to'rt ulushga bo'linadi
   * (fermer / Hub / kuryer / platforma). Ulushlar yig'indisi jamiga teng — hech qanday summa "yo'qolmaydi".
   */
  async holdForLocalOrder(tx: Prisma.TransactionClient, order: { id: string; farmerId: string; hubId: string }, q: LocalQuote, cb: { userId: string; amount: Prisma.Decimal } | null = null) {
    const cashbackUsed = cb?.amount ?? new Prisma.Decimal(0);
    if (cb && cashbackUsed.gt(0)) await this.cashback.spend(tx, cb.userId, cashbackUsed, { type: 'LOCAL_ORDER', id: order.id }, 'Platforma xizmat haqi keshbek bilan qoplandi');
    const payment = await tx.payment.create({
      data: {
        localOrderId: order.id, amount: q.productAmount, hubFee: q.hubFee, deliveryFee: q.courierFee, serviceFee: q.serviceFee, cashbackUsed,
        distanceKm: 0, currency: 'UZS', status: PaymentStatus.HELD, heldAt: new Date(), provider: this.provider.name,
      },
    });
    const res = await this.callProvider("Mablag' yechilmadi", () => this.provider.charge({ paymentId: payment.id, amount: q.total.sub(cashbackUsed).toFixed(2), currency: payment.currency }));
    await tx.payment.update({ where: { id: payment.id }, data: { providerRef: res.ref } });
    const partyId = { FARMER: order.farmerId, HUB: order.hubId, COURIER: null, PLATFORM: null } as const;
    await tx.paymentSplit.createMany({ data: localSplits(q, cashbackUsed).map((x) => ({ paymentId: payment.id, party: x.party, partyId: partyId[x.party], amount: x.amount, status: SplitStatus.HELD })) });
    await this.event(tx, payment.id, PaymentStatus.HELD, 'CONSUMER', `Mablag' escrow'ga o'tkazildi: jami ${q.total.toFixed(2)}${cashbackUsed.gt(0) ? `, keshbek ${cashbackUsed.toFixed(2)}, to'landi ${q.total.sub(cashbackUsed).toFixed(2)}` : ''} (${res.ref})`);
    return payment;
  }

  /**
   * Savat (bir nechta buyurtma): xaridordan BITTA umumiy to'lov yechiladi (provider.charge — jami summaga, checkout identifikatori bilan),
   * har bir buyurtma esa o'z escrow yozuviga (HELD) va 4 ulushli taqsimotga ega bo'ladi. Shunda har bir buyurtma alohida yetkaziladi,
   * alohida taqsimlanadi yoki qaytariladi, jami esa doim chekdagi summaga teng.
   */
  async holdForCheckout(tx: Prisma.TransactionClient, checkoutId: string, lines: { order: { id: string; farmerId: string; hubId: string }; q: LocalQuote; cashback?: Prisma.Decimal }[], buyerUserId?: string) {
    const total = lines.reduce((a, l) => a.add(l.q.total).sub(l.cashback ?? 0), new Prisma.Decimal(0));
    const ids: string[] = [];
    for (const { order, q, cashback } of lines) {
      const cb = cashback ?? new Prisma.Decimal(0);
      if (cb.gt(0) && buyerUserId) await this.cashback.spend(tx, buyerUserId, cb, { type: 'LOCAL_ORDER', id: order.id }, 'Platforma xizmat haqi keshbek bilan qoplandi');
      const payment = await tx.payment.create({
        data: { localOrderId: order.id, cashbackUsed: cb, amount: q.productAmount, hubFee: q.hubFee, deliveryFee: q.courierFee, serviceFee: q.serviceFee, distanceKm: 0, currency: 'UZS', status: PaymentStatus.HELD, heldAt: new Date(), provider: this.provider.name },
      });
      const partyId = { FARMER: order.farmerId, HUB: order.hubId, COURIER: null, PLATFORM: null } as const;
      await tx.paymentSplit.createMany({ data: localSplits(q, cb).map((x) => ({ paymentId: payment.id, party: x.party, partyId: partyId[x.party], amount: x.amount, status: SplitStatus.HELD })) });
      ids.push(payment.id);
    }
    const res = await this.callProvider("Mablag' yechilmadi", () => this.provider.charge({ paymentId: checkoutId, amount: total.toFixed(2), currency: 'UZS' }));
    await tx.payment.updateMany({ where: { id: { in: ids } }, data: { providerRef: res.ref } });
    await tx.localCheckout.update({ where: { id: checkoutId }, data: { providerRef: res.ref } });
    for (const id of ids) await this.event(tx, id, PaymentStatus.HELD, 'CONSUMER', `Savat to'lovi: umumiy ${total.toFixed(2)} (${res.ref}), shu buyurtma ulushi escrow'ga o'tkazildi`);
    return { total, paymentIds: ids, ref: res.ref };
  }

  /**
   * Yetkazilgach: HELD -> RELEASED. Fermerga mahsulot summasi, Hub'ga saqlash haqi, kuryerga yetkazish haqi; platforma komissiyasi daromad sifatida qayd etiladi.
   * Fermer shu Hub'da qadoqlash xizmatidan foydalangan bo'lsa, hali to'lanmagan qadoqlash haqi fermer ulushidan ushlanib Hub ulushiga o'tkaziladi (PaaS).
   */
  async releaseForLocalOrder(tx: Prisma.TransactionClient, orderId: string, actor: string, courierId: string | null) {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE "localOrderId" = ${orderId} FOR UPDATE`;
    const row = await tx.payment.findUnique({ where: { localOrderId: orderId }, include: { splits: true } });
    if (!row) throw new NotFoundException("Buyurtma to'lovi topilmadi");
    const claimed = await tx.payment.updateMany({ where: { id: row.id, status: PaymentStatus.HELD }, data: { status: PaymentStatus.RELEASED, releasedAt: new Date() } });
    if (claimed.count === 0) throw new ConflictException("To'lov holati o'zgargan. Sahifani yangilang");
    await this.cashback.earnForPayment(tx, row.id);
    const amounts = new Map(row.splits.map((sp) => [sp.id, sp.amount]));
    const farmerSplit = row.splits.find((x) => x.party === 'FARMER'), hubSplit = row.splits.find((x) => x.party === 'HUB');
    const lo = await tx.localOrder.findUnique({ where: { id: orderId }, select: { farmerId: true, hubId: true } });
    let packaging = new Prisma.Decimal(0);
    if (farmerSplit && hubSplit && lo) {
      packaging = await this.settlePackaging(tx, row.id, lo.farmerId, lo.hubId, farmerSplit.amount, actor);
      if (packaging.gt(0)) { amounts.set(farmerSplit.id, farmerSplit.amount.sub(packaging)); amounts.set(hubSplit.id, hubSplit.amount.add(packaging)); }
    }
    const refs: string[] = [];
    for (const sp of row.splits) {
      const amount = amounts.get(sp.id)!;
      let ref: string | null = 'PLATFORM-INCOME';
      if (sp.party !== 'PLATFORM' && amount.gt(0)) {
        const res = await this.callProvider(`Mablag' ${sp.party} ulushiga o'tkazilmadi`, () => this.provider.payout({ paymentId: `${row.id}:${sp.party.toLowerCase()}`, amount: amount.toFixed(2), currency: row.currency }));
        ref = res.ref;
      } else if (sp.party !== 'PLATFORM') ref = null;
      await tx.paymentSplit.update({ where: { id: sp.id }, data: { status: SplitStatus.PAID, ref, settledAt: new Date(), ...(!amount.eq(sp.amount) && { amount }), ...(sp.party === 'COURIER' && { partyId: courierId }) } });
      refs.push(`${sp.party}=${amount.toFixed(2)}`);
    }
    await this.event(tx, row.id, PaymentStatus.RELEASED, actor, `Escrow taqsimlandi: ${refs.join(', ')}` + (packaging.gt(0) ? `; qadoqlash haqi ${packaging.toFixed(2)} fermer ulushidan Hub'ga o'tkazildi` : ''));
    return row.id;
  }

  /** Tartib raqami: to'lov qatori qulflangan bo'lgani uchun parallel so'rovlar bir xil raqam olmaydi (+ @@unique himoyasi) */
  private async nextSeq(tx: Prisma.TransactionClient, paymentId: string) {
    const a = await tx.paymentAdjustment.aggregate({ where: { paymentId }, _max: { seq: true } });
    return (a._max.seq ?? 0) + 1;
  }

  /**
   * Qadoqlash (PaaS) haqini ushlab qolish: shu fermerning shu Hub'dagi qadoqlangan, lekin hali to'liq to'lanmagan topshirishlari (eskisidan boshlab).
   * Topshirish qatorlari qulflanadi, shuning uchun ikki parallel yakunlash bitta qarzni ikki marta ushlamaydi.
   */
  private async settlePackaging(tx: Prisma.TransactionClient, paymentId: string, farmerId: string, hubId: string, farmerShare: Prisma.Decimal, actor: string) {
    const dues = await tx.$queryRaw<{ id: string; due: Prisma.Decimal }[]>`
      SELECT id, ("packagingFee" - "packagingPaid") AS due FROM "HubIntake"
      WHERE "farmerId" = ${farmerId} AND "hubId" = ${hubId} AND "usePackaging" = true AND "packagingStatus" = 'DONE' AND "packagingFee" > "packagingPaid"
      ORDER BY "packagedAt" ASC, id ASC FOR UPDATE`;
    const plan = packagingDeductions(farmerShare, dues);
    let seq = await this.nextSeq(tx, paymentId);
    for (const it of plan.items) {
      await tx.hubIntake.update({ where: { id: it.id }, data: { packagingPaid: { increment: it.take } } });
      await tx.paymentAdjustment.create({ data: { paymentId, seq: seq++, kind: AdjustmentKind.PACKAGING, intakeId: it.id, transferAmount: it.take, actor, note: "Qadoqlash xizmati haqi fermer ulushidan Hub ulushiga o'tkazildi" } });
    }
    return plan.total;
  }

  /**
   * Ziyon (OS&D): escrow'dagi (HELD) to'lovni qayta hisoblaydi. Xaridorga ziyon qiymati qaytariladi (Refund), fermerga qolgan qismi tushadi.
   * Chaqiruvchining tranzaksiyasi ichida ishlaydi: provayder xatosi yoki istalgan keyingi xato hammasini qaytaradi.
   */
  async adjustForDamage(
    tx: Prisma.TransactionClient, paymentId: string,
    p: { damagedBoxes: number; totalBoxes: number; deliveryPolicy: DeliveryPolicy; actor: string; actorUserId?: string; note?: string; kind?: AdjustmentKind; intakeId?: string },
  ) {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const row = await tx.payment.findUnique({ where: { id: paymentId }, include: { splits: true } });
    if (!row) throw new NotFoundException("To'lov topilmadi");
    if (row.status !== PaymentStatus.HELD) throw new ConflictException("Faqat escrow'dagi (HELD) to'lov qayta hisoblanadi");
    let calc: ReturnType<typeof damageRefund>;
    try { calc = damageRefund({ amount: row.amount, deliveryFee: row.deliveryFee, serviceFee: row.serviceFee, feeAmount: row.feeAmount, cashbackUsed: row.cashbackUsed, isLocal: !!row.localOrderId }, p.damagedBoxes, p.totalBoxes, p.deliveryPolicy); }
    catch (e) { throw new ConflictException((e as Error).message); }
    if (calc.goods.lte(0)) throw new ConflictException("Ziyon qiymati juda kichik: summa o'zgarmaydi");
    const seq = await this.nextSeq(tx, paymentId);
    await tx.payment.update({
      where: { id: paymentId },
      data: { amount: { decrement: calc.goods }, deliveryFee: { decrement: calc.delivery }, serviceFee: { decrement: calc.service }, feeAmount: { decrement: calc.fee }, refundedAmount: { increment: calc.refund } },
    });
    const farmerSplit = row.splits.find((x) => x.party === 'FARMER');
    if (row.localOrderId && farmerSplit) await tx.paymentSplit.update({ where: { id: farmerSplit.id }, data: { amount: { decrement: calc.goods } } });
    // Deterministik kalit: qayta urinishda provayder xuddi shu qaytarishni ikkinchi marta bajarmaydi
    const res = await this.callProvider("Mablag' qaytarilmadi", () => this.provider.refund({ paymentId: `${paymentId}:adj:${seq}`, amount: calc.refund.toFixed(2), currency: row.currency }));
    const adj = await tx.paymentAdjustment.create({
      data: {
        paymentId, seq, kind: p.kind ?? AdjustmentKind.DAMAGE, intakeId: p.intakeId, totalBoxes: p.totalBoxes, damagedBoxes: p.damagedBoxes,
        goodsAmount: calc.goods, deliveryAmount: calc.delivery, serviceAmount: calc.service, refundAmount: calc.refund, providerRef: res.ref, actor: p.actor, actorUserId: p.actorUserId, note: p.note?.trim() || null,
      },
    });
    await this.event(tx, paymentId, PaymentStatus.HELD, p.actor, `Ziyon: ${p.totalBoxes} qutidan ${p.damagedBoxes} tasi yaroqsiz. Xaridorga ${calc.refund.toFixed(2)} qaytarildi (mahsulot ${calc.goods.toFixed(2)}${calc.delivery.gt(0) ? `, yo'l haqi ${calc.delivery.toFixed(2)}` : ''}${calc.service.gt(0) ? `, komissiya ${calc.service.toFixed(2)}` : ''}), fermer ulushi kamaydi (${res.ref})${p.note ? `. ${p.note}` : ''}`);
    return { adjustmentId: adj.id, seq, goods: calc.goods, delivery: calc.delivery, service: calc.service, refund: calc.refund };
  }

  /** Bekor qilinganda hamma narsa xaridorga qaytadi (jami summa): HELD -> REFUNDED. */
  async refundForLocalOrder(tx: Prisma.TransactionClient, orderId: string, actor: string, reason?: string) {
    const row = await tx.payment.findUnique({ where: { localOrderId: orderId } });
    if (!row) throw new NotFoundException("Buyurtma to'lovi topilmadi");
    const claimed = await tx.payment.updateMany({ where: { id: row.id, status: PaymentStatus.HELD }, data: { status: PaymentStatus.REFUNDED, refundedAt: new Date() } });
    if (claimed.count === 0) throw new ConflictException("To'lov holati o'zgargan. Sahifani yangilang");
    const res = await this.callProvider("Mablag' qaytarilmadi", () => this.provider.refund({ paymentId: row.id, amount: this.total(row).toFixed(2), currency: row.currency }));
    if (row.cashbackUsed.gt(0)) {
      const buyer = await tx.localOrder.findUnique({ where: { id: orderId }, select: { consumer: { select: { userId: true } } } });
      if (buyer) await this.cashback.restore(tx, buyer.consumer.userId, { type: 'LOCAL_ORDER', id: orderId });
    }
    await tx.paymentSplit.updateMany({ where: { paymentId: row.id }, data: { status: SplitStatus.REFUNDED, settledAt: new Date(), ref: res.ref } });
    await this.event(tx, row.id, PaymentStatus.REFUNDED, actor, `${reason?.trim() || "Mablag' xaridorga qaytarildi"} (${res.ref})`);
    return row.id;
  }

  /** Haydovchiga yetkazib berish haqi o'tkaziladi (yuk yetkazilgach, fermer ulushi bilan birga) */
  private async payDriver(row: { id: string; deliveryFee: Prisma.Decimal; currency: string }, driverId: string | null | undefined) {
    if (!driverId || row.deliveryFee.lte(0)) return null;
    return this.callProvider("Mablag' haydovchiga o'tkazilmadi", () => this.provider.payout({ paymentId: `${row.id}:driver`, amount: row.deliveryFee.toFixed(2), currency: row.currency }));
  }

  /** Omborxona xizmat haqi: summaning WAREHOUSE_FEE_PERCENT foizi (tiyingacha yaxlitlanadi). */
  warehouseFee(amount: Prisma.Decimal): Prisma.Decimal {
    return amount.mul(this.env.WAREHOUSE_FEE_PERCENT).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  /** Buyurtma berilganda mablag' darhol muzlatiladi: to'g'ridan-to'g'ri HELD (xaridor to'lovni buyurtma bilan birga amalga oshiradi). */
  async holdForWarehouseOrder(tx: Prisma.TransactionClient, order: { id: string; quantityKg: Prisma.Decimal; pricePerKg: Prisma.Decimal }, route?: { originRegion: string; destRegion: string }) {
    const amount = computeAmount(order.quantityKg, order.pricePerKg);
    const fee = this.warehouseFee(amount);
    const q = route ? this.pricing.quote(route.originRegion, route.destRegion, amount, order.quantityKg) : null;
    const payment = await tx.payment.create({
      data: {
        warehouseOrderId: order.id, amount, feeAmount: fee, deliveryFee: q?.deliveryFee ?? 0, serviceFee: q?.serviceFee ?? 0, distanceKm: q?.distanceKm ?? 0, currency: 'UZS', status: PaymentStatus.HELD,
        heldAt: new Date(), provider: this.provider.name,
      },
    });
    const res = await this.callProvider("Mablag' yechilmadi", () => this.provider.charge({ paymentId: payment.id, amount: this.total(payment).toFixed(2), currency: payment.currency }));
    await tx.payment.update({ where: { id: payment.id }, data: { providerRef: res.ref } });
    await this.event(tx, payment.id, PaymentStatus.HELD, 'MARKET', `Mablag' escrow'ga o'tkazildi (${res.ref})`);
    return payment;
  }

  /** Yetkazilgach: HELD -> RELEASED. Fermerga summa - xizmat haqi, omborxona hisobiga xizmat haqi o'tadi. */
  async releaseForWarehouseOrder(tx: Prisma.TransactionClient, orderId: string, actor: string) {
    const row = await tx.payment.findUnique({ where: { warehouseOrderId: orderId } });
    if (!row) return null; // to'lov integratsiyasidan oldin yaratilgan eski buyurtma
    const claimed = await tx.payment.updateMany({ where: { id: row.id, status: PaymentStatus.HELD }, data: { status: PaymentStatus.RELEASED, releasedAt: new Date() } });
    if (claimed.count === 0) throw new ConflictException("To'lov holati o'zgargan. Sahifani yangilang");
    await this.cashback.earnForPayment(tx, row.id);
    const farmerNet = row.amount.sub(row.feeAmount);
    const res = await this.callProvider("Mablag' fermerga o'tkazilmadi", () => this.provider.payout({ paymentId: row.id, amount: farmerNet.toFixed(2), currency: row.currency }));
    const ship = await tx.shipment.findFirst({ where: { warehouseOrderId: orderId }, select: { driverId: true } });
    const drv = await this.payDriver(row, ship?.driverId);
    await this.event(tx, row.id, PaymentStatus.RELEASED, actor,
      `Mablag' fermerga (${farmerNet.toFixed(2)}) va omborxonaga (${row.feeAmount.toFixed(2)}) o'tkazildi (${res.ref})` + (drv ? `; haydovchiga ${row.deliveryFee.toFixed(2)} (${drv.ref})` : ''));
    return row.id;
  }

  /** Buyurtma bekor qilinganda escrow'dagi mablag' xaridorga qaytariladi: HELD -> REFUNDED. */
  async refundForWarehouseOrder(tx: Prisma.TransactionClient, orderId: string, actor: string, reason?: string) {
    const row = await tx.payment.findUnique({ where: { warehouseOrderId: orderId } });
    if (!row) return null; // to'lov integratsiyasidan oldin yaratilgan eski buyurtma
    const claimed = await tx.payment.updateMany({ where: { id: row.id, status: PaymentStatus.HELD }, data: { status: PaymentStatus.REFUNDED, refundedAt: new Date() } });
    if (claimed.count === 0) throw new ConflictException("To'lov holati o'zgargan. Sahifani yangilang");
    const res = await this.callProvider("Mablag' qaytarilmadi", () => this.provider.refund({ paymentId: row.id, amount: this.total(row).toFixed(2), currency: row.currency }));
    await this.event(tx, row.id, PaymentStatus.REFUNDED, actor, `${reason?.trim() || "Mablag' xaridorga qaytarildi"} (${res.ref})`);
    return row.id;
  }

  // ---------- Amallar ----------

  /** Xaridor to'laydi: PENDING -> HELD (mablag' escrow'da). Takroriy so'rov xavfsiz: allaqachon HELD bo'lsa o'sha natija qaytadi. */
  async init(user: PaymentUser, bookingId: string, useCashback = false) {
    const actor = this.actorOf(user);
    let newlyHeld = false;
    const id = await moneyTx(this.prisma, async (tx) => {
      const row = await this.load(tx, bookingId, user);
      if (row.status === PaymentStatus.HELD) return row.id; // idempotent

      this.ensure(payDecision(actor, this.ctx(row)));
      // Atomik "egallash": ikki parallel so'rovdan faqat biri o'tadi. Provayder xatosi bo'lsa tranzaksiya qaytariladi.
      const claimed = await tx.payment.updateMany({
        where: { id: row.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.HELD, heldAt: new Date() },
      });
      if (claimed.count === 0) {
        const fresh = await tx.payment.findUniqueOrThrow({ where: { id: row.id }, select: { status: true } });
        if (fresh.status === PaymentStatus.HELD) return row.id;
        throw new ConflictException("To'lov holati o'zgargan. Sahifani yangilang");
      }
      // Keshbek: faqat platformaning xizmat haqini qoplaydi (fermer va haydovchi ulushlari o'zgarmaydi)
      const cb = useCashback ? await this.cashback.spendable(tx, user.id, row.serviceFee) : new Prisma.Decimal(0);
      if (cb.gt(0)) await this.cashback.spend(tx, user.id, cb, { type: 'BOOKING', id: bookingId }, 'Platforma xizmat haqi keshbek bilan qoplandi');
      const res = await this.callProvider("Mablag' yechilmadi", () => this.provider.charge(this.providerRequest(row, this.total(row).sub(cb))));
      await tx.payment.update({ where: { id: row.id }, data: { providerRef: res.ref, provider: this.provider.name, cashbackUsed: cb } });
      await this.event(tx, row.id, PaymentStatus.HELD, actor, `Mablag' escrow'ga o'tkazildi${cb.gt(0) ? ` (keshbek ${cb.toFixed(2)})` : ''} (${res.ref})`);
      newlyHeld = true;
      return row.id;
    });
    if (newlyHeld) this.notify.escrowHeld({ bookingId });
    return this.reload(id, user);
  }

  /** Pulni fermerga chiqarish: HELD -> RELEASED (qoidalar payment.policy.ts da). */
  async release(user: PaymentUser, bookingId: string) {
    const actor = this.actorOf(user);
    const id = await moneyTx(this.prisma, async (tx) => {
      const row = await this.load(tx, bookingId, user);
      this.ensure(releaseDecision(actor, this.ctx(row)));
      return this.releaseRow(tx, row, actor);
    });
    return this.reload(id, user);
  }

  /**
   * Yetkazish PIN-kodi bilan tasdiqlangach (market kodi haydovchiga aytilgan = market yukni qabul qilgan) escrow avtomatik chiqariladi:
   * fermerga mahsulot puli (FERMER yetkazishni to'lasa — yo'l haqi ushlab qolingan), haydovchiga yetkazish haqi. Pul HELD bo'lmasa — hech narsa qilinmaydi.
   */
  async releaseOnDelivery(bookingId: string): Promise<boolean> {
    try {
      await moneyTx(this.prisma, async (tx) => {
        const row = await tx.payment.findUnique({ where: { bookingId }, include: PAYMENT_INCLUDE });
        if (!row || row.status !== PaymentStatus.HELD) return null;
        this.ensure(releaseDecision('MARKET', this.ctx(row)));
        return this.releaseRow(tx, row, 'MARKET');
      });
      return true;
    } catch (e) {
      logger.error(`PIN bilan yetkazilgach escrow chiqarilmadi (booking ${bookingId}): ${(e as Error).message}`);
      return false; // pul HELD qoladi: market «Yukni qabul qildim» orqali chiqarishi yoki administrator hal qilishi mumkin
    }
  }

  private async releaseRow(tx: Prisma.TransactionClient, row: PaymentRow, actor: PaymentActor) {
    {
      const claimed = await tx.payment.updateMany({
        where: { id: row.id, status: PaymentStatus.HELD },
        data: { status: PaymentStatus.RELEASED, releasedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("To'lov holati o'zgargan. Sahifani yangilang");
      await this.cashback.earnForPayment(tx, row.id);
      const res = await this.callProvider("Mablag' fermerga o'tkazilmadi", () => this.provider.payout(this.providerRequest(row, row.amount)));
      const drv = await this.payDriver(row, this.bookingOf(row).shipment?.driverId);
      await this.event(tx, row.id, PaymentStatus.RELEASED, actor, `Mablag' fermerga o'tkazildi (${res.ref})` + (drv ? `; haydovchiga ${row.deliveryFee.toFixed(2)} o'tkazildi (${drv.ref})` : ''));
      return row.id;
    }
  }

  /**
   * Bekor qilish / qaytarish. To'lanmagan (PENDING) buyurtma pul harakatisiz CANCELLED bo'ladi,
   * escrow'dagi (HELD) mablag' xaridorga REFUNDED sifatida qaytadi. Yuk yo'lga chiqmagan bo'lsa buyurtma ham bekor qilinadi:
   * bron CANCELLED, yuk CANCELLED, miqdor e'longa qaytadi.
   */
  async refund(user: PaymentUser, bookingId: string, reason?: string) {
    const actor = this.actorOf(user);
    const id = await moneyTx(this.prisma, async (tx) => {
      const row = await this.load(tx, bookingId, user);
      const decision = refundDecision(actor, this.ctx(row));
      if (!decision.allowed) throw new ConflictException(decision.reason);

      const bk = this.bookingOf(row);
      const wasHeld = row.status === PaymentStatus.HELD;
      const claimed = await tx.payment.updateMany({
        where: { id: row.id, status: row.status },
        data: { status: decision.target, ...(wasHeld && { refundedAt: new Date() }) },
      });
      if (claimed.count === 0) throw new ConflictException("To'lov holati o'zgargan. Sahifani yangilang");

      if (decision.effect === 'CANCEL_ORDER') {
        // Yuk faqat hali yo'lga chiqmagan holatda bekor qilinadi (xaridor: faqat OPEN; fermer/admin: OPEN yoki LOADING)
        const cancellable: ShipmentStatus[] =
          wasHeld && actor !== 'MARKET' ? [ShipmentStatus.OPEN, ShipmentStatus.LOADING] : [ShipmentStatus.OPEN];
        const shipment = bk.shipment;
        if (shipment) {
          const cancelled = await tx.shipment.updateMany({
            where: { id: shipment.id, status: { in: cancellable } },
            data: { status: ShipmentStatus.CANCELLED },
          });
          if (cancelled.count === 0) throw new ConflictException("Yuk holati o'zgargan (haydovchi biriktirilgan bo'lishi mumkin). Qayta urinib ko'ring");
          await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: ShipmentStatus.CANCELLED } });
        }
        const booking = await tx.booking.updateMany({
          where: { id: bookingId, status: BookingStatus.APPROVED },
          data: { status: BookingStatus.CANCELLED },
        });
        if (booking.count > 0) await restoreStock(tx, bk.productId, bk.quantityKg);
      }

      let note = reason?.trim() || (wasHeld ? 'Mablag\' xaridorga qaytarildi' : "To'lanmagan buyurtma bekor qilindi");
      if (wasHeld) {
        const res = await this.callProvider("Mablag' qaytarilmadi", () => this.provider.refund(this.providerRequest(row)));
        note += ` (${res.ref})`;
        if (row.cashbackUsed.gt(0)) {
          const mk = await tx.booking.findUnique({ where: { id: bookingId }, select: { market: { select: { userId: true } } } });
          if (mk) await this.cashback.restore(tx, mk.market.userId, { type: 'BOOKING', id: bookingId });
        }
      }
      if (decision.effect === 'MONEY_ONLY') note += ". Buyurtma o'zgarmadi";
      await this.event(tx, row.id, decision.target, actor, note);
      return row.id;
    });
    return this.reload(id, user);
  }

  // ---------- O'qish ----------

  async list(user: PaymentUser, query: ListPaymentsQuery) {
    const actor = this.actorOf(user);
    const scope: Prisma.PaymentWhereInput =
      actor === 'MARKET'
        ? { OR: [{ booking: { marketId: this.need(user.market, 'Market profili topilmadi').id } }, { warehouseOrder: { marketId: user.market!.id } }] }
      : actor === 'FARMER'
        ? { OR: [{ booking: { product: { farmerId: this.need(user.farmer, 'Fermer profili topilmadi').id } } }, { warehouseOrder: { item: { farmerId: user.farmer!.id } } }, { localOrder: { farmerId: user.farmer!.id } }] }
      : {};
    const rows = await this.prisma.payment.findMany({
      where: { ...scope, ...(query.status && { status: query.status }) },
      orderBy: { updatedAt: 'desc' },
      take: actor === 'ADMIN' ? 200 : undefined,
      include: PAYMENT_INCLUDE,
    });
    return rows.map((r) => this.view(r, user));
  }

  async getByBooking(user: PaymentUser, bookingId: string) {
    const row = await this.load(this.prisma, bookingId, user);
    return this.view(row, user);
  }

  // ---------- Yordamchilar ----------

  private actorOf(user: PaymentUser): PaymentActor {
    if (user.role === Role.MARKET || user.role === Role.FARMER || user.role === Role.ADMIN) return user.role;
    throw new ForbiddenException("Bu rol uchun to'lovlar mavjud emas");
  }

  private need<T>(value: T | null | undefined, message: string): T {
    if (!value) throw new ForbiddenException(message);
    return value;
  }

  /** To'lovni yuklaydi va foydalanuvchining unga huquqini tekshiradi: begona to'lov "topilmadi" (404) bo'ladi. */
  private async load(db: Prisma.TransactionClient | PrismaService, bookingId: string, user: PaymentUser): Promise<PaymentRow> {
    const row = await db.payment.findUnique({ where: { bookingId }, include: PAYMENT_INCLUDE });
    const actor = this.actorOf(user);
    const mine =
      !!row &&
      (actor === 'ADMIN' ||
        (actor === 'MARKET' && row.booking?.marketId === user.market?.id) ||
        (actor === 'FARMER' && row.booking?.product.farmerId === user.farmer?.id));
    if (!row || !mine) throw new NotFoundException("To'lov topilmadi");
    return row;
  }

  /** Bron to'lovlari uchun bron ma'lumoti; ombor buyurtmasi to'lovlari bu yo'l bilan boshqarilmaydi (ular ombor buyurtmasi orqali). */
  private bookingOf(row: PaymentRow): NonNullable<PaymentRow['booking']> {
    if (!row.booking) throw new ConflictException("Bu to'lov ombor buyurtmasiga tegishli: uni buyurtma orqali boshqaring");
    return row.booking;
  }

  private ctx(row: PaymentRow): PolicyContext {
    const bk = this.bookingOf(row);
    return {
      paymentStatus: row.status,
      shipmentStatus: bk.shipment?.status ?? null,
      deliveredAt: bk.shipment?.deliveredAt ?? null,
      now: new Date(),
      graceHours: this.env.PAYMENT_RELEASE_GRACE_HOURS,
    };
  }

  private ensure(decision: Decision) {
    if (!decision.allowed) throw new ConflictException(decision.reason);
  }

  /** Provayder xatosi tranzaksiyani qaytaradi (holat o'zgarmaydi), foydalanuvchiga ichki tafsilotsiz xabar beriladi. */
  private async callProvider<T>(what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      logger.error(`${what}: ${(e as Error).message}`);
      throw new BadGatewayException(`To'lov provayderi bilan bog'lanib bo'lmadi. ${what}, holat o'zgarmadi. Birozdan keyin qayta urinib ko'ring`);
    }
  }

  /** Provayderga so'rov: charge/refund — jami summa (market to'laydigan), farmer payout — mahsulot summasi */
  private providerRequest(row: PaymentRow, amount: Prisma.Decimal = this.total(row)) {
    return { paymentId: row.id, amount: amount.toFixed(2), currency: row.currency };
  }

  private event(tx: Prisma.TransactionClient, paymentId: string, status: PaymentStatus, actor: string, note?: string) {
    return tx.paymentEvent.create({ data: { paymentId, status, actor, note } });
  }

  private async reload(id: string, user: PaymentUser) {
    const row = await this.prisma.payment.findUniqueOrThrow({ where: { id }, include: PAYMENT_INCLUDE });
    return this.view(row, user);
  }

  /** To'lov tarkibi maydonlari: productPrice (fermer), deliveryFee (haydovchi), serviceFee (platforma), totalPrice (market jami) */
  private parts(row: PaymentRow) {
    const b = paymentBreakdown({ productPrice: row.amount, deliveryFee: row.deliveryFee, serviceFee: row.serviceFee, distanceKm: row.distanceKm, currency: row.currency, deliveryPayer: row.deliveryPayer });
    const hub = Number(row.hubFee); // chakana buyurtmada Hub haqi mahsulot summasidan tashqari (qo'shimcha) qator
    const totalPrice = b.totalPrice + hub;
    const cashbackUsed = Number(row.cashbackUsed);
    return { productPrice: b.productPrice, deliveryFee: b.deliveryFee, serviceFee: b.serviceFee, totalPrice, cashbackUsed, payableTotal: totalPrice - cashbackUsed, distanceKm: b.distanceKm, ...(hub > 0 && { hubFee: hub }), breakdown: { ...b, ...(hub > 0 && { hubFee: hub, hubShare: hub }), totalPrice, warehouseFee: Number(row.feeAmount), farmerShare: b.productPrice - Number(row.feeAmount), driverShare: b.deliveryFee, platformShare: b.serviceFee + Number(row.feeAmount) } };
  }

  /** Javob: holat, summa, tarix va foydalanuvchi uchun mumkin bo'lgan amallar (frontend qoidalarni takrorlamaydi). */
  private view(row: PaymentRow, user: PaymentUser) {
    const actor = this.actorOf(user);
    if (row.localOrder) return this.localView(row, row.localOrder, actor);
    if (row.warehouseOrder) return this.warehouseView(row, row.warehouseOrder, actor);
    const bk = this.bookingOf(row);
    const ctx = this.ctx(row);
    const open = row.status === PaymentStatus.PENDING || row.status === PaymentStatus.HELD;
    const pay = payDecision(actor, ctx);
    const release = releaseDecision(actor, ctx);
    const refund = refundDecision(actor, ctx);
    const farm = bk.product.farmer;
    const market = bk.market;

    return {
      id: row.id,
      source: 'BOOKING' as const,
      bookingId: row.bookingId,
      shipmentId: bk.shipment?.id ?? null,
      feeAmount: row.feeAmount,
      amount: row.amount,
      ...this.parts(row),
      currency: row.currency,
      status: row.status,
      provider: row.provider,
      heldAt: row.heldAt,
      releasedAt: row.releasedAt,
      refundedAt: row.refundedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      events: row.events.map((e) => ({ status: e.status, actor: e.actor, note: e.note, createdAt: e.createdAt })),
      order: {
        productName: bk.product.name,
        category: bk.product.category,
        quantityKg: bk.quantityKg,
        pricePerKg: bk.pricePerKg,
        bookingStatus: bk.status,
      },
      shipmentStatus: bk.shipment?.status ?? null,
      deliveredAt: bk.shipment?.deliveredAt ?? null,
      farmer: actor !== 'FARMER' ? { name: farm.farmName, region: farm.region } : null,
      market: actor !== 'MARKET' ? { name: market.companyName, region: market.region } : null,
      actions: {
        canPay: pay.allowed,
        canRelease: release.allowed,
        canRefund: refund.allowed,
        refundEffect: refund.allowed ? refund.effect : null,
        releaseBlockedReason: !release.allowed && open && row.status === PaymentStatus.HELD ? release.reason : null,
        refundBlockedReason: !refund.allowed && open ? refund.reason : null,
      },
    };
  }

  /** Chakana buyurtma to'lovi: amallar buyurtma orqali bajariladi; ulushlar (splits) ochiq ko'rsatiladi. */
  private localView(row: PaymentRow, lo: NonNullable<PaymentRow['localOrder']>, actor: PaymentActor) {
    return {
      id: row.id,
      source: 'LOCAL' as const,
      bookingId: null,
      shipmentId: null,
      localOrderId: lo.id,
      amount: row.amount,
      ...this.parts(row),
      currency: row.currency,
      status: row.status,
      provider: row.provider,
      heldAt: row.heldAt,
      releasedAt: row.releasedAt,
      refundedAt: row.refundedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      events: row.events.map((e) => ({ status: e.status, actor: e.actor, note: e.note, createdAt: e.createdAt })),
      splits: row.splits.map((x) => ({ party: x.party, amount: Number(x.amount), status: x.status })),
      order: { productName: lo.product.name, category: lo.product.category, quantityKg: lo.quantityKg, pricePerKg: lo.pricePerKg, bookingStatus: lo.status },
      shipmentStatus: lo.status,
      deliveredAt: lo.deliveredAt,
      farmer: actor !== 'FARMER' ? { name: lo.product.farmer.farmName, region: lo.product.farmer.region } : null,
      market: { name: `${lo.consumer.user.fullName} (xaridor)`, region: lo.hub.region },
      actions: { canPay: false, canRelease: false, canRefund: false, refundEffect: null, releaseBlockedReason: null, refundBlockedReason: null },
    };
  }

  /** Ombor buyurtmasi to'lovi: amallar buyurtma orqali bajariladi, shuning uchun bu yerda barcha "can*" bayroqlari yopiq. */
  private warehouseView(row: PaymentRow, wo: NonNullable<PaymentRow['warehouseOrder']>, actor: PaymentActor) {
    const farm = wo.item.farmer;
    return {
      id: row.id,
      source: 'WAREHOUSE' as const,
      bookingId: null,
      shipmentId: wo.shipment?.id ?? null,
      warehouseOrderId: wo.id,
      amount: row.amount,
      ...this.parts(row),
      // Market umumiy summani to'laydi; xizmat haqi va fermer ulushi fermer/dispetcher/admin uchun
      ...(actor === 'MARKET' ? {} : { feeAmount: row.feeAmount, farmerAmount: row.amount.sub(row.feeAmount) }),
      currency: row.currency,
      status: row.status,
      provider: row.provider,
      heldAt: row.heldAt,
      releasedAt: row.releasedAt,
      refundedAt: row.refundedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      events: row.events.map((e) => ({ status: e.status, actor: e.actor, note: e.note, createdAt: e.createdAt })),
      order: { productName: wo.item.name, category: wo.item.category, quantityKg: wo.quantityKg, pricePerKg: wo.pricePerKg, bookingStatus: wo.status },
      shipmentStatus: wo.shipment?.status ?? null,
      deliveredAt: wo.shipment?.deliveredAt ?? null,
      farmer: actor !== 'FARMER' ? { name: farm.farmName, region: farm.region } : null,
      market: actor !== 'MARKET' ? { name: wo.market.companyName, region: wo.market.region } : null,
      actions: { canPay: false, canRelease: false, canRefund: false, refundEffect: null, releaseBlockedReason: null, refundBlockedReason: null },
    };
  }
}
