import { Inject, Injectable, Logger } from '@nestjs/common';
import { Role, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { escapeHtml as h, TELEGRAM_API, TelegramApi, TelegramApiError } from './telegram-api';

const num = (n: unknown) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const som = (n: unknown) => `${num(n)} so'm`;

/**
 * Telegram xabarnomalari. Muhim: bu metodlar hech qachon xato tashlamaydi va asosiy amalni kutdirmaydi
 * (fire-and-forget). Chaqiruvchi ularni tranzaksiya TASDIQLANGANIDAN KEYIN chaqiradi, shuning uchun
 * bekor qilingan amal haqida xabar ketmaydi. Xabar yetkazilmasa amal buzilmaydi.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger('Notify');
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly prisma: PrismaService, @Inject(TELEGRAM_API) private readonly api: TelegramApi | null) {}

  /** Navbatdagi yuborishlar tugashini kutadi (testlar va to'xtatish uchun). */
  async flush() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  private run(job: () => Promise<void>) {
    if (!this.api) return;
    const p: Promise<void> = job()
      .catch((e) => this.logger.warn(`xabarnoma yuborilmadi: ${String(e?.message ?? e).slice(0, 200)}`))
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  /** Ulangan va faol foydalanuvchilarga (takrorlarsiz) yuboradi; bot bloklangan chat avtomatik uziladi. */
  private async sendTo(userIds: (string | null | undefined)[], text: string) {
    const ids = [...new Set(userIds.filter((x): x is string => !!x))];
    if (!ids.length) return;
    const users = await this.prisma.user.findMany({ where: { id: { in: ids }, isActive: true, telegramChatId: { not: null } }, select: { id: true, telegramChatId: true } });
    await Promise.allSettled(users.map(async (u) => {
      try {
        await this.api!.sendMessage(u.telegramChatId!, text);
      } catch (e) {
        if (e instanceof TelegramApiError && (e.code === 403 || (e.code === 400 && /chat not found/i.test(e.description)))) {
          await this.prisma.user.updateMany({ where: { id: u.id, telegramChatId: u.telegramChatId }, data: { telegramChatId: null, telegramLinkedAt: null } });
        } else throw e;
      }
    }));
  }

  private async dispatchers() {
    const rows = await this.prisma.user.findMany({ where: { role: Role.DISPATCHER, isActive: true, telegramChatId: { not: null } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  // ---------- Bronlar ----------

  bookingCreated(bookingId: string) {
    this.run(async () => {
      const b = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { quantityKg: true, pricePerKg: true, product: { select: { name: true, farmer: { select: { userId: true } } } }, market: { select: { companyName: true } } },
      });
      if (!b) return;
      await this.sendTo([b.product.farmer.userId],
        `🛒 <b>Yangi bron</b>\n${h(b.market.companyName)} «${h(b.product.name)}» e'loningizdan <b>${num(b.quantityKg)} kg</b> bron qildi (${som(b.quantityKg.mul(b.pricePerKg))}).\nKabinetda tasdiqlang yoki rad eting.`);
    });
  }

  bookingApproved(bookingId: string) {
    this.run(async () => {
      const b = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { quantityKg: true, pricePerKg: true, product: { select: { name: true, farmer: { select: { userId: true, farmName: true } } } }, market: { select: { userId: true, companyName: true } } },
      });
      if (!b) return;
      const total = som(b.quantityKg.mul(b.pricePerKg));
      const what = `«${h(b.product.name)}» — ${num(b.quantityKg)} kg, ${total}`;
      await this.sendTo([b.market.userId], `✅ <b>Bron tasdiqlandi</b>\n${h(b.product.farmer.farmName)} bronni tasdiqladi: ${what}.\nEndi to'lovni (Escrow) amalga oshiring: pul yuk yetkazilguncha xavfsiz saqlanadi.`);
      await this.sendTo([b.product.farmer.userId], `✅ <b>Bronni tasdiqladingiz</b>\n${h(b.market.companyName)}: ${what}.\nYuk tashish buyurtmasi yaratildi. Xaridor to'lovi kutilmoqda.`);
    });
  }

  /** Buyurtma bo'yicha mablag' escrow'ga muzlatildi (bron to'lovi yoki ombor buyurtmasi). */
  escrowHeld(source: { bookingId: string } | { warehouseOrderId: string }) {
    this.run(async () => {
      if ('bookingId' in source) {
        const p = await this.prisma.payment.findUnique({
          where: { bookingId: source.bookingId },
          select: { amount: true, booking: { select: { product: { select: { name: true, farmer: { select: { userId: true } } } }, market: { select: { userId: true, companyName: true } } } } },
        });
        if (!p?.booking) return;
        const b = p.booking;
        await this.sendTo([b.market.userId], `🔒 <b>Mablag' escrow'da</b>\n«${h(b.product.name)}» uchun ${som(p.amount)} xavfsiz muzlatildi. Yuk yetkazilgach fermerga o'tadi.`);
        await this.sendTo([b.product.farmer.userId], `🔒 <b>Xaridor to'lovi escrow'ga o'tdi</b>\n${h(b.market.companyName)} «${h(b.product.name)}» uchun ${som(p.amount)} muzlatdi. Yukni yetkazing — pul hisobingizga o'tadi.`);
        return;
      }
      const p = await this.prisma.payment.findUnique({
        where: { warehouseOrderId: source.warehouseOrderId },
        select: { amount: true, feeAmount: true, warehouseOrder: { select: { item: { select: { name: true, farmer: { select: { userId: true } } } }, market: { select: { userId: true, companyName: true } } } } },
      });
      if (!p?.warehouseOrder) return;
      const o = p.warehouseOrder;
      await this.sendTo([o.market.userId], `🔒 <b>Ombor buyurtmasi: mablag' escrow'da</b>\n«${h(o.item.name)}» uchun ${som(p.amount)} muzlatildi. Yetkazilib tasdiqlangach fermerga o'tadi.`);
      await this.sendTo([o.item.farmer.userId], `🔒 <b>Omboringizdagi mahsulotga buyurtma</b>\n${h(o.market.companyName)} «${h(o.item.name)}» uchun ${som(p.amount)} muzlatdi. Sizga o'tadigan summa: ${som(p.amount.sub(p.feeAmount))}.`);
    });
  }

  // ---------- Yuk holati ----------

  /** Yuk "Yo'lda" yoki "Yetkazildi" bo'lganda: fermer, market va (ombor yuki bo'lsa) dispetcherlarga. */
  shipmentStatus(shipmentId: string, status: ShipmentStatus) {
    if (status !== ShipmentStatus.IN_TRANSIT && status !== ShipmentStatus.DELIVERED) return;
    this.run(async () => {
      const s = await this.prisma.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          cargoName: true, weightKg: true, destRegion: true, warehouseOrderId: true,
          farmer: { select: { userId: true, farmName: true } }, market: { select: { userId: true, companyName: true } },
          driver: { select: { plateNumber: true, user: { select: { fullName: true } } } },
        },
      });
      if (!s) return;
      const cargo = `«${h(s.cargoName)}» — ${num(s.weightKg)} kg`;
      const drv = s.driver ? `\nHaydovchi: ${h(s.driver.user.fullName)} (${h(s.driver.plateNumber)})` : '';
      const wh = s.warehouseOrderId ? ' (omborxona buyurtmasi)' : '';
      const text = status === ShipmentStatus.IN_TRANSIT
        ? `🚚 <b>Yuk yo'lga chiqdi</b>${wh}\n${cargo}. Manzil: ${h(s.destRegion)}.${drv}\nJonli xaritani kabinetda kuzating.`
        : `📦 <b>Yuk yetkazildi</b>${wh}\n${cargo}.${drv}`;
      const dispatchers = s.warehouseOrderId ? await this.dispatchers() : [];
      await this.sendTo([s.farmer.userId, s.market.userId, ...dispatchers], text);
    });
  }
}
