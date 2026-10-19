import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, Role, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { TrustService } from '../trust/trust.service';
import { breakdownOf } from '../pricing/pricing';
import { PricingService } from '../pricing/pricing.service';
import { NotificationService } from '../telegram/notification.service';
import { idsWithinRadius, parseRadius } from '../common/geo-search';
import { haversineKm } from '../trust/geo';
import { RatesService } from '../rates/rates.service';
import { compareRate } from '../rates/rates';
import { randomUUID } from 'crypto';
import { reserveLtl, restoreLtl } from './ltl';
import { TriLoad, TriOption, evaluate, hasDirectReturn, triOptions } from './trihaul';
import { AvailableShipmentsQuery, ListShipmentsQuery } from './dto/list-shipments.query';

// Haydovchi bir vaqtda nechta yakunlanmagan yukni olib yura oladi
export const MAX_ACTIVE_SHIPMENTS = 1;

const ACTIVE: ShipmentStatus[] = [ShipmentStatus.LOADING, ShipmentStatus.IN_TRANSIT];

const SHIPMENT_INCLUDE = {
  events: { orderBy: { createdAt: Prisma.SortOrder.asc } },
  driver: {
    select: { userId: true, vehicleType: true, plateNumber: true, capacityKg: true, user: { select: { fullName: true, phone: true } } },
  },
  booking: { select: { id: true, payment: { select: { status: true, amount: true, feeAmount: true, deliveryFee: true, serviceFee: true, distanceKm: true, currency: true } } } },
  warehouseOrder: { select: { id: true, status: true, payment: { select: { status: true, amount: true, feeAmount: true, deliveryFee: true, serviceFee: true, distanceKm: true, currency: true } } } },
  farmer: { select: { farmName: true, user: { select: { fullName: true, phone: true } } } },
  market: { select: { companyName: true, user: { select: { fullName: true, phone: true } } } },
} satisfies Prisma.ShipmentInclude;

type ShipmentRow = Prisma.ShipmentGetPayload<{ include: typeof SHIPMENT_INCLUDE }>;
type Viewer = 'driver-open' | 'driver-own' | 'farmer' | 'market';

@Injectable()
export class ShipmentService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, private readonly notify: NotificationService, private readonly trust: TrustService, private readonly pricing: PricingService, private readonly rates: RatesService) {}

  // ---------- Haydovchi ----------

  /** Bo'sh yuklar: marshrut (viloyat/tuman) va og'irlik ko'rinadi, aniq manzil va telefonlar yashirin. */
  async listAvailable(driver: { id?: string; capacityKg: Prisma.Decimal }, query: AvailableShipmentsQuery) {
    // Radiusli qidiruv ("Yuk radari"): olib ketish nuqtasi Haversine bo'yicha radius ichida bo'lgan ochiq yuklar
    const radius = parseRadius(query);
    let distances: Map<string, number> | undefined;
    let idFilter: Prisma.ShipmentWhereInput = {};
    if (radius) {
      const hits = await idsWithinRadius(this.prisma, 'Shipment', radius, 'originLat', 'originLng', Prisma.sql`status = 'OPEN' AND "driverId" IS NULL`);
      distances = new Map(hits.map((h) => [h.id, h.distanceKm]));
      idFilter = { id: { in: hits.map((h) => h.id) } };
    }
    const rows = await this.prisma.shipment.findMany({
      where: {
        status: ShipmentStatus.OPEN,
        driverId: null,
        ...idFilter,
        ...(query.originRegion && { originRegion: { equals: query.originRegion, mode: 'insensitive' } }),
      },
      orderBy: { createdAt: 'desc' },
      include: SHIPMENT_INCLUDE,
    });
    if (distances) rows.sort((a, b) => distances!.get(a.id)! - distances!.get(b.id)!);
    const wh = await this.warehouseContact(rows);
    // LTL e'loni bor haydovchi uchun "sig'adimi" belgisi mashinadagi bo'sh joyga qarab hisoblanadi
    let fit: Prisma.Decimal = driver.capacityKg;
    if (driver.id) {
      const ltl = await this.prisma.driverPost.aggregate({ where: { driverId: driver.id, isActive: true, loadMode: 'LTL' }, _max: { availableCapacityKg: true } });
      if (ltl._max.availableCapacityKg !== null) fit = new Prisma.Decimal(ltl._max.availableCapacityKg);
    }
    const out = rows.map((s) => ({ ...this.shape(s, 'driver-open', fit, wh), ...(distances && { distanceKm: distances.get(s.id) }) }));
    return this.withRate(out);
  }

  /** Yukni o'ziga biriktirish: OPEN -> LOADING */
  async accept(driver: { id: string; capacityKg: Prisma.Decimal }, id: string) {
    await this.prisma.$transaction((tx) => this.acceptTx(tx, driver, id));
    return { ...(await this.reload(id, 'driver-own')), ltl: await this.ltlInfo(id) };
  }

  /** accept ning tranzaksiya ichidagi qismi; skipLimit — zanjirli bronning ikkinchi yuki uchun (faol yuk chegarasi tekshirilmaydi) */
  private async acceptTx(tx: Prisma.TransactionClient, driver: { id: string; capacityKg: Prisma.Decimal }, id: string, skipLimit = false) {
    {
      // Bir haydovchining ikki parallel so'rovi cheklovni aylanib o'ta olmasligi uchun
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${driver.id}))`;

      // LTL e'loni bor haydovchi bir reysda bir nechta yuk oladi (jami og'irlik bo'sh joydan oshmaguncha); qolganlari — avvalgidek bitta
      const hasLtl = (await tx.driverPost.count({ where: { driverId: driver.id, isActive: true, loadMode: 'LTL' } })) > 0;
      const active = await tx.shipment.count({ where: { driverId: driver.id, status: { in: ACTIVE }, ...(hasLtl && { ltlKg: null }) } });
      if (!skipLimit && active >= MAX_ACTIVE_SHIPMENTS) {
        throw new ConflictException("Sizda yakunlanmagan yuk bor. Avval uni yetkazib bering yoki qaytarib bering");
      }

      const shipment = await tx.shipment.findUnique({ where: { id } });
      if (!shipment) throw new NotFoundException('Yuk topilmadi');
      if (shipment.status !== ShipmentStatus.OPEN || shipment.driverId) {
        throw new ConflictException('Bu yuk allaqachon boshqa haydovchiga biriktirilgan');
      }
      // Kafolatlangan to'lov: yuk faqat xaridor mablag'ni escrow'ga o'tkazgandan keyin olinadi
      const payment = await tx.payment.findFirst({
        where: shipment.bookingId ? { bookingId: shipment.bookingId } : { warehouseOrderId: shipment.warehouseOrderId },
        select: { status: true },
      });
      if (payment?.status !== PaymentStatus.HELD) {
        throw new ConflictException("Xaridor to'lovi hali kafolatlanmagan. To'lov escrow'ga o'tgandan keyin yukni olish mumkin");
      }
      if (!hasLtl && shipment.weightKg.gt(driver.capacityKg)) {
        throw new ConflictException(
          `Yuk og'irligi (${shipment.weightKg} kg) transportingiz sig'imidan (${driver.capacityKg} kg) ko'p`,
        );
      }

      const claimed = await tx.shipment.updateMany({
        where: { id, status: ShipmentStatus.OPEN, driverId: null },
        data: { driverId: driver.id, status: ShipmentStatus.LOADING, assignedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException('Bu yuk allaqachon boshqa haydovchiga biriktirilgan');
      if (hasLtl) await reserveLtl(tx, driver.id, shipment);
      await tx.shipmentEvent.create({ data: { shipmentId: id, status: ShipmentStatus.LOADING } });
      if (shipment.warehouseOrderId) await tx.warehouseOrder.updateMany({ where: { id: shipment.warehouseOrderId }, data: { driverId: driver.id } });
    }
  }

  /** Yo'lga chiqishdan oldin yukni qaytarish: LOADING -> OPEN */
  async release(driverId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const released = await tx.shipment.updateMany({
        where: { id, driverId, status: ShipmentStatus.LOADING },
        data: { driverId: null, status: ShipmentStatus.OPEN, assignedAt: null },
      });
      if (released.count === 0) await this.explainFailure(tx, id, driverId, "Yukni faqat yo'lga chiqishdan oldin qaytarish mumkin");
      await restoreLtl(tx, id); // LTL: band qilingan joy qaytadi
      await tx.$executeRaw`UPDATE "Shipment" SET "chainId" = NULL, "chainSeq" = NULL WHERE "chainId" = (SELECT "chainId" FROM "Shipment" WHERE id = ${id}) AND "chainId" IS NOT NULL`; // zanjir buziladi
      await tx.shipmentEvent.create({ data: { shipmentId: id, status: ShipmentStatus.OPEN } });
      const sh = await tx.shipment.findUnique({ where: { id }, select: { warehouseOrderId: true } });
      if (sh?.warehouseOrderId) await tx.warehouseOrder.updateMany({ where: { id: sh.warehouseOrderId }, data: { driverId: null } });
    });
    return this.reload(id, 'driver-own');
  }

  /** Keyingi bosqichga o'tkazish: LOADING -> IN_TRANSIT -> DELIVERED */
  async advance(driverId: string, id: string) {
    let reached = null as ShipmentStatus | null;
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.shipment.findFirst({ where: { id, driverId }, select: { status: true, warehouseOrderId: true, chainId: true, chainSeq: true } });
      if (!current) throw new NotFoundException('Yuk topilmadi');
      // Zanjirli bron: ikkinchi yuk birinchisi yetkazilmaguncha yo'lga chiqmaydi
      if (current.chainId && current.chainSeq === 2 && current.status === ShipmentStatus.LOADING) {
        const first = await tx.shipment.findFirst({ where: { chainId: current.chainId, chainSeq: 1 }, select: { status: true } });
        if (first && first.status !== ShipmentStatus.DELIVERED && first.status !== ShipmentStatus.CANCELLED) throw new ConflictException("Zanjirli bron: avval birinchi yukni yetkazing");
      }
      // Ombor yuki: omborxonadan chiqishni (qoldiq kamayishi bilan) dispetcher yuklab tasdiqlaydi, haydovchi emas
      if (current.warehouseOrderId && current.status === ShipmentStatus.LOADING) {
        throw new ConflictException("Ombor yukini dispetcher yuklab jo'natadi. Yuklash tasdiqlanishini kuting");
      }

      const next =
        current.status === ShipmentStatus.LOADING ? ShipmentStatus.IN_TRANSIT
        : current.status === ShipmentStatus.IN_TRANSIT ? ShipmentStatus.DELIVERED
        : null;
      if (!next) {
        throw new ConflictException(current.status === ShipmentStatus.CANCELLED ? 'Bu yuk bekor qilingan' : 'Bu yuk allaqachon yetkazib berilgan');
      }

      // Holat hali o'zgarmagan bo'lsagina o'tkazamiz (ikki marta bosish himoyasi)
      const moved = await tx.shipment.updateMany({
        where: { id, driverId, status: current.status },
        data: { status: next, ...(next === ShipmentStatus.DELIVERED && { deliveredAt: new Date() }) },
      });
      if (moved.count === 0) throw new ConflictException("Yuk holati allaqachon o'zgargan. Sahifani yangilang");
      await tx.shipmentEvent.create({ data: { shipmentId: id, status: next } });
      if (next === ShipmentStatus.DELIVERED) await restoreLtl(tx, id); // yetkazildi: bo'sh joy tiklanadi
      reached = next;
      if (next === ShipmentStatus.DELIVERED && current.warehouseOrderId) {
        // Ombor buyurtmasi yetkazildi (pul esa xaridor yoki dispetcher tasdiqlagach chiqariladi)
        const done = await tx.warehouseOrder.updateMany({
          where: { id: current.warehouseOrderId, status: 'DISPATCHED' }, data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
        if (done.count === 0) throw new ConflictException("Buyurtma holati mos kelmaydi. Dispetcherga murojaat qiling");
      }
    });
    if (reached === ShipmentStatus.DELIVERED) await this.invalidateTrust(id); // yangi bitim: status va badjlar qayta hisoblansin
    if (reached) this.notify.shipmentStatus(id, reached);
    return this.reload(id, 'driver-own');
  }

  // ---------- Barcha rollar: o'ziga tegishli yuklar ----------

  async listMine(user: any, query: ListShipmentsQuery) {
    const statusFilter = query.status ? { status: query.status } : {};
    if (user.role === Role.DRIVER && user.driver) {
      const rows = await this.prisma.shipment.findMany({
        where: { driverId: user.driver.id, ...statusFilter },
        orderBy: { updatedAt: 'desc' },
        include: SHIPMENT_INCLUDE,
      });
      const wh = await this.warehouseContact(rows);
      return this.withRate(rows.map((s) => this.shape(s, 'driver-own', undefined, wh)));
    }
    if (user.role === Role.FARMER && user.farmer) {
      const rows = await this.prisma.shipment.findMany({
        where: { farmerId: user.farmer.id, ...statusFilter },
        orderBy: { updatedAt: 'desc' },
        include: SHIPMENT_INCLUDE,
      });
      return this.withTrust(rows.map((s) => this.shape(s, 'farmer', undefined, undefined)));
    }
    if (user.role === Role.MARKET && user.market) {
      const rows = await this.prisma.shipment.findMany({
        where: { marketId: user.market.id, ...statusFilter },
        orderBy: { updatedAt: 'desc' },
        include: SHIPMENT_INCLUDE,
      });
      const wh = await this.warehouseContact(rows);
      return this.withTrust(rows.map((s) => this.shape(s, 'market', undefined, wh)));
    }
    throw new ForbiddenException("Bu rol uchun yuklar mavjud emas");
  }

  // ---------- Yordamchilar ----------

  private async invalidateTrust(shipmentId: string) {
    const s = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, select: { farmer: { select: { userId: true } }, market: { select: { userId: true } }, driver: { select: { userId: true } } } });
    if (s) this.trust.invalidate(s.farmer.userId, s.market.userId, ...(s.driver ? [s.driver.userId] : []));
  }

  /**
   * To'lov tarkibi. Haydovchi faqat o'z yetkazib berish haqi va masofani ko'radi (mahsulot summasi yashirin);
   * fermer va market mahsulot / yetkazib berish / xizmat haqi / jami taqsimotini ko'radi.
   */
  private priceOf(s: ShipmentRow, viewer: Viewer) {
    const p = s.booking?.payment ?? s.warehouseOrder?.payment;
    if (!p) return null;
    // Haq qanday hisoblangani: baza + masofa + og'irlik (qabul qilishdan oldin ham ko'rinadi)
    const formula = this.pricing.formula(p.distanceKm, s.weightKg, p.deliveryFee);
    const base = { deliveryFee: Number(p.deliveryFee), distanceKm: p.distanceKm, currency: p.currency, formula };
    if (viewer === 'driver-open' || viewer === 'driver-own') return base;
    const b = breakdownOf({ productPrice: p.amount, deliveryFee: p.deliveryFee, serviceFee: p.serviceFee, distanceKm: p.distanceKm, currency: p.currency });
    return { ...b, formula, warehouseFee: Number(p.feeAmount), farmerShare: b.productPrice - Number(p.feeAmount), driverShare: b.deliveryFee, platformShare: b.serviceFee + Number(p.feeAmount) };
  }

  /** Haydovchi kartochkasiga ommaviy ishonch ma'lumoti (tasdiqlangan belgi, status, top badjlar) qo'shadi */
  private async withTrust<T extends { driver: { userId: string } | null }>(items: T[]) {
    const map = await this.trust.summaries(items.flatMap((i) => (i.driver ? [i.driver.userId] : [])));
    return items.map((i) => (i.driver ? { ...i, driver: { ...i.driver, trust: map.get(i.driver.userId) ?? null } } : i));
  }

  private async explainFailure(tx: Prisma.TransactionClient, id: string, driverId: string, wrongStateMsg: string): Promise<never> {
    const s = await tx.shipment.findFirst({ where: { id, driverId }, select: { id: true } });
    if (!s) throw new NotFoundException('Yuk topilmadi');
    throw new ConflictException(wrongStateMsg);
  }

  private async reload(id: string, viewer: Viewer) {
    const row = await this.prisma.shipment.findUniqueOrThrow({ where: { id }, include: SHIPMENT_INCLUDE });
    return this.shape(row, viewer, undefined, await this.warehouseContact([row]));
  }

  /**
   * Ko'rinish qoidalari:
   *  - bo'sh yuk (driver-open): faqat viloyat/tuman va og'irlik; manzil va telefonlar yo'q
   *  - haydovchi (o'zining yuki): ikkala tomonning manzili va telefoni
   *  - fermer/market: o'z kontragentining telefoni (bron tasdiqlanganda ochilgan) + biriktirilgan haydovchi ma'lumoti
   */
  /** Ombor yuklarida jo'natuvchi — omborxona (call-center aloqasi): fermer va marketlar bir-birining telefonini olmaydi. */
  private async warehouseContact(rows: { warehouseOrderId: string | null }[]) {
    if (!rows.some((r) => r.warehouseOrderId)) return undefined;
    const st = await this.settings.getPublic();
    return { farmName: `${st.siteName} omborxonasi`, fullName: 'Dispetcher', phone: st.callCenterPhones[0] ?? '' };
  }

  // ---------- TriHaul (uchburchak marshrut) ----------

  private triLoad(s: ShipmentRow): TriLoad {
    const fee = Number(s.booking?.payment?.deliveryFee ?? s.warehouseOrder?.payment?.deliveryFee ?? 0);
    return { id: s.id, cargoName: s.cargoName, originRegion: s.originRegion, destRegion: s.destRegion, weightKg: Number(s.weightKg), fee };
  }

  /** To'lovi kafolatlangan (HELD) ochiq yuklar: ularni darhol olish mumkin */
  private async heldOpenLoads(): Promise<{ row: ShipmentRow; tri: TriLoad }[]> {
    const rows = await this.prisma.shipment.findMany({ where: { status: ShipmentStatus.OPEN, driverId: null }, orderBy: { createdAt: 'desc' }, take: 300, include: SHIPMENT_INCLUDE });
    return rows
      .filter((r) => (r.booking?.payment?.status ?? r.warehouseOrder?.payment?.status) === PaymentStatus.HELD)
      .map((row) => ({ row, tri: this.triLoad(row) }));
  }

  private async capacityOf(driver: { id: string; capacityKg: Prisma.Decimal }): Promise<number> {
    const ltl = await this.prisma.driverPost.aggregate({ where: { driverId: driver.id, isActive: true, loadMode: 'LTL' }, _max: { availableCapacityKg: true } });
    return ltl._max.availableCapacityKg ?? Number(driver.capacityKg);
  }

  /** Bitta yuk uchun TriHaul tavsiyasi (ochiq yuk yoki haydovchining o'z yuki) */
  async trihaul(driver: { id: string; capacityKg: Prisma.Decimal }, id: string) {
    const base = await this.prisma.shipment.findFirst({ where: { id, OR: [{ status: ShipmentStatus.OPEN, driverId: null }, { driverId: driver.id }] }, include: SHIPMENT_INCLUDE });
    if (!base) throw new NotFoundException('Yuk topilmadi');
    const l1 = this.triLoad(base);
    const empty = { eligible: false, directReturn: false, base: l1, options: [] as TriOption[] };
    if (base.status === ShipmentStatus.CANCELLED || base.status === ShipmentStatus.DELIVERED || base.chainId) return empty;
    const pool = (await this.heldOpenLoads()).map((x) => x.tri);
    const r = triOptions(l1, pool, await this.capacityOf(driver));
    return { eligible: r.options.length > 0, directReturn: r.directReturn, base: l1, options: r.options };
  }

  /** "Mavjud yuklar" ro'yxati uchun: har bir ochiq yukka eng yaxshi TriHaul varianti (bo'lsa) */
  async trihaulBatch(driver: { id: string; capacityKg: Prisma.Decimal }) {
    const held = await this.heldOpenLoads();
    const pool = held.map((x) => x.tri), cap = await this.capacityOf(driver);
    const items: Record<string, TriOption> = {};
    for (const l1 of pool.slice(0, 120)) {
      const best = triOptions(l1, pool, cap, 1).options[0];
      if (best) items[l1.id] = best;
    }
    return { items };
  }

  /** Zanjirli bron: ikkala yuk bitta tranzaksiyada biriktiriladi (birinchi — A→B, ikkinchi — B→C) */
  async acceptChain(driver: { id: string; capacityKg: Prisma.Decimal }, firstId: string, secondId: string) {
    if (firstId === secondId) throw new BadRequestException('Zanjir uchun ikkita turli yuk kerak');
    const held = await this.heldOpenLoads();
    const l1 = held.find((x) => x.tri.id === firstId)?.tri, l2 = held.find((x) => x.tri.id === secondId)?.tri;
    if (!l1 || !l2) throw new ConflictException("Yuklardan biri allaqachon band yoki to'lovi kafolatlanmagan");
    if (hasDirectReturn(l1, held.map((x) => x.tri)) || !evaluate(l1, l2)) throw new BadRequestException("Bu ikki yuk uchburchak (TriHaul) zanjirini hosil qilmaydi");
    const chainId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await this.acceptTx(tx, driver, firstId);
      await this.acceptTx(tx, driver, secondId, true);
      await tx.shipment.update({ where: { id: firstId }, data: { chainId, chainSeq: 1 } });
      await tx.shipment.update({ where: { id: secondId }, data: { chainId, chainSeq: 2 } });
    });
    const [a, b] = await Promise.all([this.reload(firstId, 'driver-own'), this.reload(secondId, 'driver-own')]);
    return { chainId, first: { ...a, ltl: await this.ltlInfo(firstId) }, second: { ...b, ltl: await this.ltlInfo(secondId) } };
  }

  /** Haydovchi uchun: yo'l haqi (so'm/km) bozor o'rtachasidan qancha farq qiladi (Hot Price / past narx) */
  async withRate<T extends { price: { deliveryFee?: number; distanceKm?: number } | null; origin: { region: string }; destination: { region: string } }>(list: T[]) {
    const idx = await this.rates.index();
    return list.map((s) => {
      const fee = Number(s.price?.deliveryFee ?? 0), km = Number(s.price?.distanceKm ?? 0);
      return { ...s, marketRate: km > 0 && fee > 0 ? compareRate(idx, fee / km, s.origin.region, s.destination.region) : null };
    });
  }

  /** Yuk qaysi LTL e'londan joy band qilgan bo'lsa, o'sha e'lonning joriy sig'imi */
  async ltlInfo(shipmentId: string) {
    const s = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, select: { ltlKg: true, ltlPost: { select: { id: true, routes: true, maxCapacityKg: true, availableCapacityKg: true } } } });
    if (!s?.ltlPost) return null;
    const p = s.ltlPost;
    return { postId: p.id, maxCapacityKg: p.maxCapacityKg, availableCapacityKg: p.availableCapacityKg, usedCapacityKg: p.maxCapacityKg - p.availableCapacityKg, reservedKg: s.ltlKg };
  }

  /**
   * Smart-taklif: haydovchi yuk olgach LTL e'lonida qolgan joyga sig'adigan, shu yo'nalishdagi
   * (bir xil manzil viloyati va yaqin olib ketish joyi) boshqa ochiq yuklar. Faqat to'lovi kafolatlangan (HELD) yuklar — ularni darhol olish mumkin.
   */
  async ltlSuggestions(driverId: string, shipmentId: string) {
    const base = await this.prisma.shipment.findFirst({ where: { id: shipmentId, driverId }, select: { ltlPostId: true, originRegion: true, destRegion: true, originLat: true, originLng: true } });
    if (!base) throw new NotFoundException('Yuk topilmadi');
    const info = await this.ltlInfo(shipmentId);
    if (!info || !base.ltlPostId) return { ltl: null, remainingKg: 0, suggestions: [] };
    const remaining = info.availableCapacityKg;
    if (remaining <= 0) return { ltl: info, remainingKg: 0, suggestions: [] };
    const open = await this.prisma.shipment.findMany({
      where: { status: ShipmentStatus.OPEN, driverId: null, id: { not: shipmentId }, destRegion: { equals: base.destRegion, mode: 'insensitive' }, weightKg: { lte: remaining } },
      orderBy: { createdAt: 'desc' }, take: 40, include: SHIPMENT_INCLUDE,
    });
    const near = open.filter((o) => {
      if (o.originRegion.toLowerCase() === base.originRegion.toLowerCase()) return true;
      return base.originLat != null && base.originLng != null && o.originLat != null && o.originLng != null && haversineKm(base.originLat, base.originLng, o.originLat, o.originLng) <= 80;
    });
    const held = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.HELD, OR: [{ bookingId: { in: near.map((o) => o.booking?.id).filter((x): x is string => !!x) } }, { warehouseOrderId: { in: near.map((o) => o.warehouseOrderId).filter((x): x is string => !!x) } }] },
      select: { bookingId: true, warehouseOrderId: true },
    });
    const ok = new Set(held.flatMap((h) => [h.bookingId, h.warehouseOrderId]).filter(Boolean));
    const list = near.filter((o) => ok.has(o.booking?.id ?? '') || ok.has(o.warehouseOrderId ?? '')).slice(0, 6);
    const wh = await this.warehouseContact(list);
    return { ltl: info, remainingKg: remaining, suggestions: list.map((s) => this.shape(s, 'driver-open', new Prisma.Decimal(remaining), wh)) };
  }

  private shape(s: ShipmentRow, viewer: Viewer, capacityKg?: Prisma.Decimal, wh?: { farmName: string; fullName: string; phone: string }) {
    const warehouse = !!s.warehouseOrderId;
    const farmer = warehouse && wh ? { farmName: wh.farmName, user: { fullName: wh.fullName, phone: wh.phone } } : s.farmer;
    const market = s.market;
    const full = viewer !== 'driver-open';

    return {
      id: s.id,
      source: warehouse ? ('WAREHOUSE' as const) : ('BOOKING' as const),
      bookingId: s.booking?.id ?? null,
      warehouseOrderId: s.warehouseOrderId,
      warehouseOrderStatus: s.warehouseOrder?.status ?? null,
      status: s.status,
      chainId: s.chainId,
      chainSeq: s.chainSeq,
      urgent: s.urgent,
      cargoName: s.cargoName,
      category: s.category,
      weightKg: s.weightKg,
      origin: { region: s.originRegion, district: s.originDistrict, address: full ? s.originAddress : null, lat: s.originLat, lng: s.originLng },
      destination: { region: s.destRegion, district: s.destDistrict, address: full ? s.destAddress : null },
      createdAt: s.createdAt,
      assignedAt: s.assignedAt,
      deliveredAt: s.deliveredAt,
      events: s.events.map((e) => ({ status: e.status, createdAt: e.createdAt })),
      paymentStatus: s.booking?.payment?.status ?? s.warehouseOrder?.payment?.status ?? null, // haydovchi uchun: to'lov kafolatlanganmi
      price: this.priceOf(s, viewer),
      ...(viewer === 'driver-open' && capacityKg ? { fitsCapacity: s.weightKg.lte(capacityKg) } : {}),
      farmer: viewer === 'driver-own' || viewer === 'market'
        ? { farmName: farmer.farmName, fullName: farmer.user.fullName, phone: farmer.user.phone }
        : null,
      market: viewer === 'driver-own' || viewer === 'farmer'
        ? { companyName: market.companyName, fullName: market.user.fullName, phone: market.user.phone }
        : null,
      driver: (viewer === 'farmer' || viewer === 'market') && s.driver
        ? {
            userId: s.driver.userId,
            fullName: s.driver.user.fullName,
            phone: s.driver.user.phone,
            vehicleType: s.driver.vehicleType,
            plateNumber: s.driver.plateNumber,
          }
        : null,
    };
  }
}
