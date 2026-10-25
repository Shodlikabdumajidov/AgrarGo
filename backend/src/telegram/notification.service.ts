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

  /** Dispetcher/administrator yukni haydovchiga biriktirdi */
  shipmentAssigned(shipmentId: string) {
    this.run(async () => {
      const s = await this.prisma.shipment.findUnique({
        where: { id: shipmentId },
        select: { cargoName: true, weightKg: true, originRegion: true, originDistrict: true, destRegion: true, destDistrict: true, driver: { select: { userId: true } } },
      });
      if (!s?.driver) return;
      const lines = [
        `📦 <b>Sizga yuk biriktirildi</b>`,
        `• Mahsulot: <b>${h(s.cargoName)}</b>`,
        `• Hajmi: <b>${num(s.weightKg)} kg</b>`,
        `• Qayerdan: ${h(s.originRegion)}, ${h(s.originDistrict)}`,
        `• Qayerga: ${h(s.destRegion)}, ${h(s.destDistrict)}`,
        `Manzil va aloqa ma'lumotlari kabinetdagi «Mening zakazlarim» bo'limida.`,
      ];
      await this.sendTo([s.driver.userId], lines.join('\n'));
    });
  }

  // ---------- Haydovchiga yuk taklifi ----------

  driverOffer(offerId: string) {
    this.run(async () => {
      const o = await this.prisma.driverOffer.findUnique({
        where: { id: offerId },
        select: {
          pickupAt: true, note: true,
          post: { select: { routes: true, driver: { select: { userId: true } } } },
          fromUser: { select: { fullName: true, farmer: { select: { farmName: true } }, market: { select: { companyName: true } } } },
          shipment: {
            select: {
              cargoName: true, weightKg: true, originRegion: true, originDistrict: true, destRegion: true, destDistrict: true,
              booking: { select: { payment: { select: { deliveryFee: true } } } }, warehouseOrder: { select: { payment: { select: { deliveryFee: true } } } },
            },
          },
        },
      });
      if (!o) return;
      const s = o.shipment, fee = s.booking?.payment?.deliveryFee ?? s.warehouseOrder?.payment?.deliveryFee;
      const from = o.fromUser.farmer?.farmName ?? o.fromUser.market?.companyName ?? o.fromUser.fullName;
      const when = o.pickupAt ? o.pickupAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : null;
      const lines = [
        `📦 <b>Sizga yuk taklif qilindi</b>`,
        `${h(from)} «${h(o.post.routes[0] ?? "e'loningiz")}» e'loningiz bo'yicha taklif yubordi:`,
        `• Mahsulot: <b>${h(s.cargoName)}</b>`,
        `• Hajmi: <b>${num(s.weightKg)} kg</b>`,
        `• Qayerdan: ${h(s.originRegion)}, ${h(s.originDistrict)}`,
        `• Qayerga: ${h(s.destRegion)}, ${h(s.destDistrict)}`,
        when ? `• Olish vaqti: ${when}` : null,
        fee ? `• Yo'l haqi: <b>${som(fee)}</b>` : null,
        o.note ? `• Izoh: ${h(o.note)}` : null,
        `Aniq manzil yukni biriktirgandan keyin ochiladi. Kabinetda «Mavjud yuklar» bo'limidan oling.`,
      ].filter(Boolean);
      await this.sendTo([o.post.driver.userId], lines.join('\n'));
    });
  }

  // ---------- Chakana (Hub) buyurtmalari ----------

  localOrder(orderId: string, event: 'CREATED' | 'PACKING' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED') {
    this.run(async () => {
      const o = await this.prisma.localOrder.findUnique({
        where: { id: orderId },
        select: {
          quantityKg: true, productAmount: true, totalPrice: true, deliveryCode: true, deliveryDistrict: true, cancelReason: true, hubId: true,
          product: { select: { name: true, farmer: { select: { userId: true } } } }, hub: { select: { name: true } },
          consumer: { select: { userId: true } }, courier: { select: { user: { select: { fullName: true, phone: true } } } },
        },
      });
      if (!o) return;
      const what = `«${h(o.product.name)}» — ${num(o.quantityKg)} kg`;
      const staff = async () => (await this.prisma.user.findMany({ where: { role: { in: [Role.DISPATCHER] }, isActive: true, telegramChatId: { not: null }, OR: [{ hubId: o.hubId }, { hubId: null }] }, select: { id: true } })).map((u) => u.id);
      if (event === 'CREATED') {
        await this.sendTo([o.consumer.userId], `🛒 <b>Buyurtma qabul qilindi</b>
${what}. To'lov ${som(o.totalPrice)} escrow'da saqlanmoqda.
Topshirish kodi: <b>${o.deliveryCode}</b> — buni faqat kuryer yetkazganda ayting.`);
        await this.sendTo([o.product.farmer.userId], `🧺 <b>Mahsulotingiz chakana sotildi</b>
${what}. Yetkazilgach hisobingizga ${som(o.productAmount)} o'tadi.`);
        await this.sendTo(await staff(), `📦 <b>Yangi chakana buyurtma</b> (${h(o.hub.name)})
${what}, ${h(o.deliveryDistrict)}. Qadoqlashni boshlang.`);
      } else if (event === 'PACKING') {
        await this.sendTo([o.consumer.userId], `📦 <b>Buyurtmangiz qadoqlanmoqda</b>
${what}. Tez orada kuryer olib chiqadi.`);
      } else if (event === 'DELIVERING') {
        const c = o.courier ? `
Kuryer: ${h(o.courier.user.fullName)}, ${h(o.courier.user.phone)}` : '';
        await this.sendTo([o.consumer.userId], `🛵 <b>Kuryer yo'lga chiqdi</b>
${what}.${c}
Kod: <b>${o.deliveryCode}</b>`);
      } else if (event === 'COMPLETED') {
        await this.sendTo([o.consumer.userId], `✅ <b>Buyurtma yetkazildi</b>
${what}. Rahmat!`);
        await this.sendTo([o.product.farmer.userId], `💰 <b>Chakana savdo yakunlandi</b>
${what}: hisobingizga ${som(o.productAmount)} o'tkazildi.`);
      } else {
        await this.sendTo([o.consumer.userId], `↩️ <b>Buyurtma bekor qilindi</b>
${what}. Jami ${som(o.totalPrice)} to'liq qaytarildi.${o.cancelReason ? `
Sabab: ${h(o.cancelReason)}` : ''}`);
        await this.sendTo([o.product.farmer.userId], `ℹ️ Chakana buyurtma bekor qilindi (${what}). Qoldiq Hub omborida saqlanmoqda.`);
      }
    });
  }
}
