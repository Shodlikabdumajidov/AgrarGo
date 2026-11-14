import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { CashbackType, Prisma } from '@prisma/client';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { cashbackAmount, maxSpendable } from './cashback.math';

type Tx = Prisma.TransactionClient;
export interface CashbackSource { type: 'LOCAL_ORDER' | 'SHIPMENT' | 'WAREHOUSE_ORDER' | 'BOOKING'; id: string }

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * Keshbek: platforma o'z hisobidan beradi (escrow ulushlariga TEGMAYDI) va faqat platforma xizmat haqini qoplash uchun ishlatiladi.
 * Hamma amal buyurtma/to'lov tranzaksiyasi ichida bajariladi; jurnal (userId, type, sourceType, sourceId) bo'yicha UNIQUE — takroriy chaqiruv xavfsiz.
 */
@Injectable()
export class CashbackService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  get rates() {
    return { buyer: this.env.CASHBACK_BUYER_PERCENT, farmer: this.env.CASHBACK_FARMER_PERCENT, driver: this.env.CASHBACK_DRIVER_PERCENT, maxSpendPercent: this.env.CASHBACK_MAX_SPEND_PERCENT };
  }

  /** Ishlatish mumkin keshbek (balans va xizmat haqi bo'yicha) */
  async spendable(db: Tx | PrismaService, userId: string, serviceFee: Prisma.Decimal.Value): Promise<Prisma.Decimal> {
    const u = await db.user.findUnique({ where: { id: userId }, select: { cashbackBalance: true } });
    return maxSpendable(u?.cashbackBalance ?? 0, serviceFee, this.env.CASHBACK_MAX_SPEND_PERCENT);
  }

  private async credit(tx: Tx, userId: string, amount: Prisma.Decimal, type: CashbackType, source: CashbackSource, description: string): Promise<boolean> {
    if (amount.lte(0)) return false;
    // Avval jurnal (UNIQUE): takroriy chaqiruvda 0 qator — balans ikki marta oshmaydi
    const made = await tx.cashbackTransaction.createMany({ data: [{ userId, amount, type, sourceType: source.type, sourceId: source.id, description }], skipDuplicates: true });
    if (made.count === 0) return false;
    await tx.user.update({ where: { id: userId }, data: { cashbackBalance: { increment: amount } } });
    return true;
  }

  /** Yakunlangan buyurtmadan keshbek yozish (foiz asos summadan) */
  earn(tx: Tx, userId: string | null | undefined, base: Prisma.Decimal.Value, percent: number, source: CashbackSource, description: string) {
    if (!userId) return Promise.resolve(false);
    return this.credit(tx, userId, cashbackAmount(base, percent), CashbackType.EARNED, source, description);
  }

  /** Keshbek ishlatish: balansdan atomik ayriladi (yetmasa 409) */
  async spend(tx: Tx, userId: string, amount: Prisma.Decimal, source: CashbackSource, description: string) {
    if (amount.lte(0)) return;
    const made = await tx.cashbackTransaction.createMany({ data: [{ userId, amount, type: CashbackType.SPENT, sourceType: source.type, sourceId: source.id, description }], skipDuplicates: true });
    if (made.count === 0) return; // shu manba uchun allaqachon ishlatilgan
    const rows = await tx.$queryRaw<{ id: string }[]>`UPDATE "User" SET "cashbackBalance" = "cashbackBalance" - ${amount} WHERE "id" = ${userId} AND "cashbackBalance" >= ${amount} RETURNING "id"`;
    if (!rows.length) throw new ConflictException("Keshbek balansi yetarli emas. Sahifani yangilang");
  }

  /** Buyurtma bekor bo'lsa: ishlatilgan keshbek balansga qaytadi */
  async restore(tx: Tx, userId: string, source: CashbackSource) {
    const spent = await tx.cashbackTransaction.findUnique({ where: { userId_type_sourceType_sourceId: { userId, type: CashbackType.SPENT, sourceType: source.type, sourceId: source.id } } });
    if (!spent) return;
    await this.credit(tx, userId, spent.amount, CashbackType.REFUNDED, source, 'Bekor qilingan buyurtma: keshbek qaytdi');
  }

  /**
   * To'lov (escrow) yakunlanganda: xaridor, fermer va haydovchiga keshbek. Asoslar: xaridor — mahsulot summasi, fermer — sof sotuv, haydovchi — yo'l haqi.
   * Escrow taqsimotiga ta'sir qilmaydi (platforma o'z hisobidan beradi).
   */
  async earnForPayment(tx: Tx, paymentId: string) {
    const p = await tx.payment.findUnique({
      where: { id: paymentId },
      select: {
        amount: true, feeAmount: true, deliveryFee: true,
        booking: { select: { id: true, market: { select: { userId: true } }, product: { select: { farmer: { select: { userId: true } } } }, shipment: { select: { id: true, driver: { select: { userId: true } } } } } },
        warehouseOrder: { select: { id: true, market: { select: { userId: true } }, item: { select: { farmer: { select: { userId: true } } } }, driver: { select: { userId: true } } } },
        localOrder: { select: { id: true, farmerId: true, consumer: { select: { userId: true } }, courier: { select: { userId: true } } } },
      },
    });
    if (!p) return;
    let src: CashbackSource, buyer: string | undefined, farmer: string | undefined, driver: string | undefined;
    if (p.localOrder) {
      src = { type: 'LOCAL_ORDER', id: p.localOrder.id };
      buyer = p.localOrder.consumer.userId; driver = p.localOrder.courier?.userId;
      farmer = (await tx.farmer.findUnique({ where: { id: p.localOrder.farmerId }, select: { userId: true } }))?.userId;
    } else if (p.warehouseOrder) {
      src = { type: 'WAREHOUSE_ORDER', id: p.warehouseOrder.id };
      buyer = p.warehouseOrder.market.userId; farmer = p.warehouseOrder.item.farmer.userId; driver = p.warehouseOrder.driver?.userId;
    } else if (p.booking) {
      src = p.booking.shipment ? { type: 'SHIPMENT', id: p.booking.shipment.id } : { type: 'BOOKING', id: p.booking.id };
      buyer = p.booking.market.userId; farmer = p.booking.product.farmer.userId; driver = p.booking.shipment?.driver?.userId;
    } else return;
    const r = this.rates;
    await this.earn(tx, buyer, p.amount, r.buyer, src, 'Xarid uchun keshbek');
    await this.earn(tx, farmer, D(p.amount).sub(p.feeAmount), r.farmer, src, 'Sotuv uchun keshbek');
    await this.earn(tx, driver, p.deliveryFee, r.driver, src, "Yetkazib berish uchun keshbek");
  }

  /** Foydalanuvchi kabineti: balans, qoidalar va tarix */
  async summary(userId: string, page = 1, limit = 30) {
    const [u, items, total] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { cashbackBalance: true } }),
      this.prisma.cashbackTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.cashbackTransaction.count({ where: { userId } }),
    ]);
    const sums = await this.prisma.cashbackTransaction.groupBy({ by: ['type'], where: { userId }, _sum: { amount: true } });
    const sum = (t: CashbackType) => Number(sums.find((x) => x.type === t)?._sum.amount ?? 0);
    return {
      balance: Number(u.cashbackBalance), currency: 'UZS', rates: this.rates,
      totals: { earned: sum(CashbackType.EARNED), spent: sum(CashbackType.SPENT), refunded: sum(CashbackType.REFUNDED) },
      total, page, limit,
      items: items.map((t) => ({ id: t.id, type: t.type, amount: Number(t.amount), sourceType: t.sourceType, sourceId: t.sourceId, description: t.description, createdAt: t.createdAt })),
    };
  }
}
