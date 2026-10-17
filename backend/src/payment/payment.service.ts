import { BadGatewayException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Prisma, Role, ShipmentStatus } from '@prisma/client';
import { restoreStock } from '../booking/stock';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { ListPaymentsQuery } from './dto/payment.dto';
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
      shipment: { select: { id: true, status: true, deliveredAt: true } },
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
  ) {}

  // ---------- Amallar ----------

  /** Xaridor to'laydi: PENDING -> HELD (mablag' escrow'da). Takroriy so'rov xavfsiz: allaqachon HELD bo'lsa o'sha natija qaytadi. */
  async init(user: PaymentUser, bookingId: string) {
    const actor = this.actorOf(user);
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
      return row.id;
    });
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
      const res = await this.callProvider("Mablag' fermerga o'tkazilmadi", () => this.provider.payout(this.providerRequest(row)));
      await this.event(tx, row.id, PaymentStatus.RELEASED, actor, `Mablag' fermerga o'tkazildi (${res.ref})`);
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
        const shipment = row.booking.shipment;
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
        if (booking.count > 0) await restoreStock(tx, row.booking.productId, row.booking.quantityKg);
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
      actor === 'MARKET' ? { booking: { marketId: this.need(user.market, 'Market profili topilmadi').id } }
      : actor === 'FARMER' ? { booking: { product: { farmerId: this.need(user.farmer, 'Fermer profili topilmadi').id } } }
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
        (actor === 'MARKET' && row.booking.marketId === user.market?.id) ||
        (actor === 'FARMER' && row.booking.product.farmerId === user.farmer?.id));
    if (!row || !mine) throw new NotFoundException("To'lov topilmadi");
    return row;
  }

  private ctx(row: PaymentRow): PolicyContext {
    return {
      paymentStatus: row.status,
      shipmentStatus: row.booking.shipment?.status ?? null,
      deliveredAt: row.booking.shipment?.deliveredAt ?? null,
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

  private providerRequest(row: PaymentRow) {
    return { paymentId: row.id, amount: row.amount.toFixed(2), currency: row.currency };
  }

  private event(tx: Prisma.TransactionClient, paymentId: string, status: PaymentStatus, actor: string, note?: string) {
    return tx.paymentEvent.create({ data: { paymentId, status, actor, note } });
  }

  private async reload(id: string, user: PaymentUser) {
    const row = await this.prisma.payment.findUniqueOrThrow({ where: { id }, include: PAYMENT_INCLUDE });
    return this.view(row, user);
  }

  /** Javob: holat, summa, tarix va foydalanuvchi uchun mumkin bo'lgan amallar (frontend qoidalarni takrorlamaydi). */
  private view(row: PaymentRow, user: PaymentUser) {
    const actor = this.actorOf(user);
    const ctx = this.ctx(row);
    const open = row.status === PaymentStatus.PENDING || row.status === PaymentStatus.HELD;
    const pay = payDecision(actor, ctx);
    const release = releaseDecision(actor, ctx);
    const refund = refundDecision(actor, ctx);
    const farm = row.booking.product.farmer;
    const market = row.booking.market;

    return {
      id: row.id,
      bookingId: row.bookingId,
      amount: row.amount,
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
        productName: row.booking.product.name,
        category: row.booking.product.category,
        quantityKg: row.booking.quantityKg,
        pricePerKg: row.booking.pricePerKg,
        bookingStatus: row.booking.status,
      },
      shipmentStatus: row.booking.shipment?.status ?? null,
      deliveredAt: row.booking.shipment?.deliveredAt ?? null,
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
}
