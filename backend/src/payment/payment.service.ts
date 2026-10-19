import { BadGatewayException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Prisma, Role, ShipmentStatus } from '@prisma/client';
import { restoreStock } from '../booking/stock';
import { computeAmount } from './payment.factory';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { NotificationService } from '../telegram/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListPaymentsQuery } from './dto/payment.dto';
import { PricingService } from '../pricing/pricing.service';
import { breakdownOf } from '../pricing/pricing';
import {
  Decision, PaymentActor, PolicyContext, payDecision, refundDecision, releaseDecision,
} from './payment.policy';
import { PAYMENT_PROVIDER, PaymentProvider } from './provider/payment-provider';

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
  ) {}

  // ---------- Ombor buyurtmalari (escrow) ----------
  // Bu amallar WarehouseOrderService'ning tranzaksiyasi ichida chaqiriladi: provayder xatosi butun amalni (zaxira ham) qaytaradi.

  /** Market to'laydigan jami summa: mahsulot + yetkazib berish + xizmat haqi (eski yozuvlarda faqat mahsulot) */
  private total(row: { amount: Prisma.Decimal; deliveryFee: Prisma.Decimal; serviceFee: Prisma.Decimal }) {
    return row.amount.add(row.deliveryFee).add(row.serviceFee);
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
  async init(user: PaymentUser, bookingId: string) {
    const actor = this.actorOf(user);
    let newlyHeld = false;
    const id = await this.prisma.$transaction(async (tx) => {
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
      const res = await this.callProvider("Mablag' yechilmadi", () => this.provider.charge(this.providerRequest(row)));
      await tx.payment.update({ where: { id: row.id }, data: { providerRef: res.ref, provider: this.provider.name } });
      await this.event(tx, row.id, PaymentStatus.HELD, actor, `Mablag' escrow'ga o'tkazildi (${res.ref})`);
      newlyHeld = true;
      return row.id;
    });
    if (newlyHeld) this.notify.escrowHeld({ bookingId });
    return this.reload(id, user);
  }

  /** Pulni fermerga chiqarish: HELD -> RELEASED (qoidalar payment.policy.ts da). */
  async release(user: PaymentUser, bookingId: string) {
    const actor = this.actorOf(user);
    const id = await this.prisma.$transaction(async (tx) => {
      const row = await this.load(tx, bookingId, user);
      this.ensure(releaseDecision(actor, this.ctx(row)));

      const claimed = await tx.payment.updateMany({
        where: { id: row.id, status: PaymentStatus.HELD },
        data: { status: PaymentStatus.RELEASED, releasedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("To'lov holati o'zgargan. Sahifani yangilang");
      const res = await this.callProvider("Mablag' fermerga o'tkazilmadi", () => this.provider.payout(this.providerRequest(row, row.amount)));
      const drv = await this.payDriver(row, this.bookingOf(row).shipment?.driverId);
      await this.event(tx, row.id, PaymentStatus.RELEASED, actor, `Mablag' fermerga o'tkazildi (${res.ref})` + (drv ? `; haydovchiga ${row.deliveryFee.toFixed(2)} o'tkazildi (${drv.ref})` : ''));
      return row.id;
    });
    return this.reload(id, user);
  }

  /**
   * Bekor qilish / qaytarish. To'lanmagan (PENDING) buyurtma pul harakatisiz CANCELLED bo'ladi,
   * escrow'dagi (HELD) mablag' xaridorga REFUNDED sifatida qaytadi. Yuk yo'lga chiqmagan bo'lsa buyurtma ham bekor qilinadi:
   * bron CANCELLED, yuk CANCELLED, miqdor e'longa qaytadi.
   */
  async refund(user: PaymentUser, bookingId: string, reason?: string) {
    const actor = this.actorOf(user);
    const id = await this.prisma.$transaction(async (tx) => {
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
        ? { OR: [{ booking: { product: { farmerId: this.need(user.farmer, 'Fermer profili topilmadi').id } } }, { warehouseOrder: { item: { farmerId: user.farmer!.id } } }] }
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
    const b = breakdownOf({ productPrice: row.amount, deliveryFee: row.deliveryFee, serviceFee: row.serviceFee, distanceKm: row.distanceKm, currency: row.currency });
    return { productPrice: b.productPrice, deliveryFee: b.deliveryFee, serviceFee: b.serviceFee, totalPrice: b.totalPrice, distanceKm: b.distanceKm, breakdown: { ...b, warehouseFee: Number(row.feeAmount), farmerShare: b.productPrice - Number(row.feeAmount), driverShare: b.deliveryFee, platformShare: b.serviceFee + Number(row.feeAmount) } };
  }

  /** Javob: holat, summa, tarix va foydalanuvchi uchun mumkin bo'lgan amallar (frontend qoidalarni takrorlamaydi). */
  private view(row: PaymentRow, user: PaymentUser) {
    const actor = this.actorOf(user);
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
