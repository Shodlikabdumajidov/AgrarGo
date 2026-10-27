import { Inject, Injectable, Logger } from '@nestjs/common';
import { Role, ShipmentStatus } from '@prisma/client';
import { APP_ENV } from '../config/app-env.module';
import type { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { escapeHtml as h, TELEGRAM_API, TelegramApi, TelegramApiError, TelegramKeyboard } from './telegram-api';

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

  constructor(private readonly prisma: PrismaService, @Inject(TELEGRAM_API) private readonly api: TelegramApi | null, @Inject(APP_ENV) private readonly env: AppEnv) {}

  /** «Kabinetni ochish» tugmasi: faqat https saytda (Telegram boshqa manzillarni rad etadi va xabar ketmay qolardi) */
  private web(label = '📲 Kabinetni ochish'): TelegramKeyboard {
    return /^https:\/\//.test(this.env.TELEGRAM_WEB_URL) ? [[{ text: label, url: this.env.TELEGRAM_WEB_URL }]] : [];
  }

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
  private async sendTo(userIds: (string | null | undefined)[], text: string, keyboard?: TelegramKeyboard) {
    const ids = [...new Set(userIds.filter((x): x is string => !!x))];
    if (!ids.length) return;
    const users = await this.prisma.user.findMany({ where: { id: { in: ids }, isActive: true, telegramChatId: { not: null } }, select: { id: true, telegramChatId: true } });
    await Promise.allSettled(users.map(async (u) => {
      try {
        await this.api!.sendMessage(u.telegramChatId!, text, keyboard?.length ? keyboard : undefined);
      } catch (e) {
        if (e instanceof TelegramApiError && (e.code === 403 || (e.code === 400 && /chat not found/i.test(e.description)))) {
          await this.prisma.user.updateMany({ where: { id: u.id, telegramChatId: u.telegramChatId }, data: { telegramChatId: null, telegramLinkedAt: null } });
        } else throw e;
      }
    }));
  }

  /** Dispetcherlar va shikoyat/xavfsizlik bilan shug'ullanuvchi adminlar (Super admin, Safety admin) */
  private async staff() {
    const rows = await this.prisma.user.findMany({
      where: { isActive: true, telegramChatId: { not: null }, OR: [{ role: Role.DISPATCHER }, { role: Role.ADMIN, adminRole: { in: ['SUPER_ADMIN', 'SAFETY_ADMIN'] } }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
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
        `🛒 <b>Yangi bron</b>\n${h(b.market.companyName)} «${h(b.product.name)}» e'loningizdan <b>${num(b.quantityKg)} kg</b> bron qildi (${som(b.quantityKg.mul(b.pricePerKg))}).\nShu yerning o'zida tasdiqlang yoki rad eting:`,
        [[{ text: '✅ Tasdiqlash', callback: `bk:a:${bookingId}` }, { text: '❌ Rad etish', callback: `bk:r:${bookingId}` }], ...this.web()]);
    });
  }

  /** Fermer bronni rad etdi (marketga) */
  bookingRejected(bookingId: string) {
    this.run(async () => {
      const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { quantityKg: true, product: { select: { name: true, farmer: { select: { farmName: true } } } }, market: { select: { userId: true } } } });
      if (!b) return;
      await this.sendTo([b.market.userId], `❌ <b>Bron rad etildi</b>\n${h(b.product.farmer.farmName)} «${h(b.product.name)}» (${num(b.quantityKg)} kg) bronini rad etdi. Katalogdan boshqa e'lon tanlashingiz mumkin.`, this.web('🛒 Katalogni ochish'));
    });
  }

  /** Savdolashish: yangi taklif (fermerga), qarshi taklif / qabul / rad (marketga) */
  priceOffer(offerId: string, event: 'CREATED' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED') {
    this.run(async () => {
      const o = await this.prisma.priceOffer.findUnique({
        where: { id: offerId },
        select: {
          quantityKg: true, pricePerKg: true, counterPricePerKg: true, counterQuantityKg: true,
          product: { select: { name: true, farmer: { select: { userId: true, farmName: true } } } }, market: { select: { userId: true, companyName: true } },
        },
      });
      if (!o) return;
      const what = `«${h(o.product.name)}» — ${num(o.quantityKg)} kg, ${som(o.pricePerKg)}/kg`;
      if (event === 'CREATED') await this.sendTo([o.product.farmer.userId], `💬 <b>Yangi narx taklifi</b>\n${h(o.market.companyName)}: ${what}.\nTasdiqlang, rad eting yoki kabinetda qarshi taklif yuboring:`,
        [[{ text: '✅ Tasdiqlash', callback: `of:a:${offerId}` }, { text: '❌ Rad etish', callback: `of:r:${offerId}` }], ...this.web('↔️ Qarshi taklif yuborish')]);
      else if (event === 'CANCELLED') await this.sendTo([o.product.farmer.userId], `↩️ <b>Taklif bekor qilindi</b>
${h(o.market.companyName)}: ${what}.`);
      else if (event === 'COUNTERED') await this.sendTo([o.market.userId], `💬 <b>Fermerdan qarshi taklif</b>
${h(o.product.farmer.farmName)} «${h(o.product.name)}» uchun ${num(o.counterQuantityKg ?? o.quantityKg)} kg, ${som(o.counterPricePerKg ?? o.pricePerKg)}/kg taklif qildi.
Qabul qiling yoki rad eting:`, [[{ text: '✅ Qabul qilish', callback: `oc:a:${offerId}` }, { text: '❌ Rad etish', callback: `oc:r:${offerId}` }], ...this.web()]);
      else if (event === 'ACCEPTED') await this.sendTo([o.market.userId, o.product.farmer.userId], `✅ <b>Narx kelishildi</b>
«${h(o.product.name)}»: bron tasdiqlandi. Xaridor to'lovni (Escrow) amalga oshirgach yuk tashish boshlanadi.`);
      else await this.sendTo([o.market.userId], `❌ <b>Taklif rad etildi</b>
${h(o.product.farmer.farmName)} «${h(o.product.name)}» bo'yicha taklifingizni rad etdi.`);
    });
  }

  /** Oylik reyting g'olibi: 1 oylik bepul PRO obuna berildi */
  leaderboardWinner(userId: string, category: string, rank: number, month: string, proUntil: Date) {
    this.run(async () => {
      const what = category === 'DRIVER' ? 'TOP Haydovchilar' : category === 'FARMER' ? 'TOP Fermerlar' : 'TOP Marketlar';
      await this.sendTo([userId], `🏆 <b>Oylik reyting g'olibi!</b>\n${h(month)} oyida «${what}» bo'yicha ${rank}-o'rin.\nSizga 1 oylik bepul PRO obuna berildi (${proUntil.toISOString().slice(0, 10)} gacha).`);
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

  /** Yuk "Yo'lda" yoki "Yetkazildi" bo'lganda: fermer, market (qabul PIN-kodi bilan) va (ombor yuki bo'lsa) dispetcherlarga. */
  shipmentStatus(shipmentId: string, status: ShipmentStatus) {
    if (status !== ShipmentStatus.IN_TRANSIT && status !== ShipmentStatus.DELIVERED) return;
    this.run(async () => {
      const s = await this.prisma.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          cargoName: true, weightKg: true, destRegion: true, destDistrict: true, warehouseOrderId: true, bookingId: true, deliveryPin: true,
          farmer: { select: { userId: true, farmName: true } }, market: { select: { userId: true, companyName: true } },
          driver: { select: { plateNumber: true, user: { select: { fullName: true } } } },
        },
      });
      if (!s) return;
      const cargo = `«${h(s.cargoName)}» — ${num(s.weightKg)} kg`;
      const drv = s.driver ? `\nHaydovchi: ${h(s.driver.user.fullName)} (${h(s.driver.plateNumber)})` : '';
      const wh = s.warehouseOrderId ? ' (omborxona buyurtmasi)' : '';
      const dispatchers = s.warehouseOrderId ? await this.dispatchers() : [];
      if (status === ShipmentStatus.IN_TRANSIT) {
        const base = `🚚 <b>Yuk yo'lga chiqdi</b>${wh}\n${cargo}. Manzil: ${h(s.destRegion)}.${drv}`;
        // Market: qabul PIN-kodi (yetib kelganda haydovchiga aytiladi) + xarita
        const pin = s.bookingId && s.deliveryPin ? `\n\n🔑 <b>Qabul PIN-kodingiz: ${s.deliveryPin}</b>\nYuk yetib kelganda shu kodni haydovchiga ayting. Boshqa hech kimga bermang.` : '';
        await this.sendTo([s.market.userId], `${base}${pin}\nJonli xaritani kabinetda kuzating.`, this.web('🗺 Xaritada kuzatish'));
        await this.sendTo([s.farmer.userId, ...dispatchers], `${base}\nJonli xaritani kabinetda kuzating.`);
      } else {
        await this.sendTo([s.market.userId], `📍 <b>Yuk manzilga yetib keldi</b>${wh}\n${cargo}. ${h(s.destRegion)}${s.destDistrict ? ', ' + h(s.destDistrict) : ''}.${drv}\nYuk yetkazildi: iltimos, qabul qiling; to'lov (Escrow) fermer va haydovchiga o'tkaziladi.`, this.web());
        await this.sendTo([s.farmer.userId, ...dispatchers], `📦 <b>Yuk yetkazildi</b>${wh}\n${cargo}.${drv}`);
      }
    });
  }

  /** Haydovchi yukka biriktirildi (o'zi oldi yoki dispetcher biriktirdi): market (qabul PIN-kodi) va fermerga */
  driverAssigned(shipmentId: string) {
    this.run(async () => {
      const s = await this.prisma.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          cargoName: true, weightKg: true, bookingId: true, deliveryPin: true,
          farmer: { select: { userId: true } }, market: { select: { userId: true } },
          driver: { select: { plateNumber: true, vehicleType: true, user: { select: { fullName: true } } } },
        },
      });
      if (!s?.driver) return;
      const cargo = `«${h(s.cargoName)}» — ${num(s.weightKg)} kg`;
      const drv = `${h(s.driver.user.fullName)} (${h(s.driver.vehicleType)}, ${h(s.driver.plateNumber)})`;
      const pin = s.bookingId && s.deliveryPin ? `\n\n🔑 <b>Qabul PIN-kodingiz: ${s.deliveryPin}</b>\nYuk yetib kelganda shu kodni haydovchiga ayting. Boshqa hech kimga bermang.` : '';
      await this.sendTo([s.market.userId], `🚛 <b>Yukingizga haydovchi biriktirildi</b>\n${cargo}\nHaydovchi: ${drv}.${pin}`, this.web());
      await this.sendTo([s.farmer.userId], `🚛 <b>Yukka haydovchi biriktirildi</b>\n${cargo}\nHaydovchi: ${drv}. U yetib kelgach sizga xabar beramiz.`, this.web());
    });
  }

  /** Haydovchi yuklash joyiga yetib keldi: fermerga (yuklashda haydovchining 4 xonali PIN-kodini so'rang) */
  driverArrived(shipmentId: string) {
    this.run(async () => {
      const s = await this.prisma.shipment.findUnique({
        where: { id: shipmentId },
        select: { cargoName: true, weightKg: true, farmer: { select: { userId: true } }, driver: { select: { plateNumber: true, user: { select: { fullName: true } } } } },
      });
      if (!s?.driver) return;
      await this.sendTo([s.farmer.userId],
        `📍 <b>Haydovchi yuklash uchun yetib keldi</b>\n«${h(s.cargoName)}» — ${num(s.weightKg)} kg.\nHaydovchi: ${h(s.driver.user.fullName)} (${h(s.driver.plateNumber)}).\n\n🔑 Yuklashdan oldin haydovchidan <b>4 xonali yuklash PIN-kodini</b> so'rang va kabinetdagi «Haydovchining PIN-kodi» maydoniga kiriting.`,
        this.web('🔑 PIN-kodni kiritish'));
    });
  }

  // ---------- Shikoyat / BAN (dispetcher va adminlarga) ----------

  complaintFiled(complaintId: string) {
    this.run(async () => {
      const c = await this.prisma.complaint.findUnique({
        where: { id: complaintId },
        select: { reason: true, reporter: { select: { fullName: true, role: true } }, accused: { select: { fullName: true, role: true, penaltyPoints: true } } },
      });
      if (!c) return;
      const reason = c.reason.length > 300 ? c.reason.slice(0, 300) + '…' : c.reason;
      await this.sendTo(await this.staff(),
        `🚩 <b>Yangi shikoyat / spam</b>\nShikoyatchi: ${h(c.reporter.fullName)} (${c.reporter.role})\nAybdor: <b>${h(c.accused.fullName)}</b> (${c.accused.role}), hozirgi qizil yulduz: ${c.accused.penaltyPoints}/5\n\n«${h(reason)}»\n\nQaror qabul qiling:`,
        [[{ text: "✅ To'liq asosli (+1★)", callback: `cp:u:${complaintId}` }], [{ text: '◐ Qisman asosli (+0.5★)', callback: `cp:p:${complaintId}` }, { text: '🚫 Asossiz', callback: `cp:r:${complaintId}` }], ...this.web('📋 Shikoyatlar paneli')]);
    });
  }

  /** Foydalanuvchi 5.0 qizil yulduzga yetib avtomatik BAN bo'ldi */
  userBanned(userId: string) {
    this.run(async () => {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, role: true, penaltyPoints: true, phone: true } });
      if (!u) return;
      await this.sendTo(await this.staff(), `🚫 <b>Avtomatik BAN</b>\n${h(u.fullName)} (${u.role}, ${h(u.phone)}) ${u.penaltyPoints}/5 qizil yulduzga yetdi.\nAkkaunt bloklandi, e'lonlari muzlatildi.`, this.web('📋 Shikoyatlar paneli'));
    });
  }

  /** Dispetcher/administrator yukni haydovchiga biriktirdi */
  shipmentAssigned(shipmentId: string) {
    this.run(async () => {
      const s = await this.prisma.shipment.findUnique({
        where: { id: shipmentId },
        select: { cargoName: true, weightKg: true, originRegion: true, originDistrict: true, destRegion: true, destDistrict: true, pickupPin: true, driver: { select: { userId: true } } },
      });
      if (!s?.driver) return;
      const lines = [
        `📦 <b>Sizga yuk biriktirildi</b>`,
        `• Mahsulot: <b>${h(s.cargoName)}</b>`,
        `• Hajmi: <b>${num(s.weightKg)} kg</b>`,
        `• Qayerdan: ${h(s.originRegion)}, ${h(s.originDistrict)}`,
        `• Qayerga: ${h(s.destRegion)}, ${h(s.destDistrict)}`,
        s.pickupPin ? `🔑 <b>Yuklash PIN-kodingiz: ${s.pickupPin}</b> — yuk ortilganda fermerga ayting.` : null,
        `Manzil va aloqa ma'lumotlari kabinetdagi «Mening zakazlarim» bo'limida.`,
      ].filter(Boolean);
      await this.sendTo([s.driver.userId], lines.join('\n'), this.web('📲 Kabinetni ochish'));
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
      await this.sendTo([o.post.driver.userId], lines.join('\n'), this.web('📦 Mavjud yuklarni ochish'));
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
