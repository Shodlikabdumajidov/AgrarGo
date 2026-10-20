import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LocalOrderStatus, Prisma, ProductStatus, Role } from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { DockService } from '../hub/dock.service';
import { dispatchStock, releaseReserve, reserveStock, returnStock } from '../hub/hub-stock';
import { PaymentService } from '../payment/payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../telegram/notification.service';
import { normRegion } from '../trust/geo';
import { BulkCheckoutDto, CancelOrderDto, CartItemDto, CourierModeDto, CreateLocalOrderDto, ListLocalOrdersQuery, LocalMarketQuery } from './dto/local.dto';
import { LocalFeeConfig, LocalQuote, codesMatch, localQuote, splitCourierFee, withCourierFee } from './local-pricing';

export const MAX_ACTIVE_COURIER_ORDERS = 3;
export const MAX_CODE_ATTEMPTS = 5;
/** Bir rampa yozuvida (bir kelishda) olinadigan ko'pi bilan buyurtmalar soni */
const MAX_APPT_ORDERS = 10;
const ACTIVE: LocalOrderStatus[] = [LocalOrderStatus.PENDING, LocalOrderStatus.PACKING, LocalOrderStatus.DELIVERING];

export interface LocalUser {
  id: string; role: Role; phone: string; fullName?: string; hubId?: string | null;
  consumer?: { id: string; region: string; district: string; address: string | null } | null;
  farmer?: { id: string } | null;
  driver?: { id: string; region: string; courierMode: boolean; courierHubId: string | null } | null;
}

const ORDER_INCLUDE = {
  product: { select: { name: true, category: true, farmer: { select: { farmName: true } } } },
  hub: { select: { id: true, name: true, region: true, district: true, address: true } },
  consumer: { select: { user: { select: { fullName: true } } } },
  courier: { select: { id: true, vehicleType: true, plateNumber: true, user: { select: { fullName: true, phone: true } } } },
  payment: { select: { status: true, splits: { select: { party: true, amount: true, status: true } } } },
  pickupAppt: { select: { id: true, status: true, purpose: true, startsAt: true, endsAt: true, hub: { select: { name: true } }, dock: { select: { number: true, name: true } } } },
} satisfies Prisma.LocalOrderInclude;
type OrderRow = Prisma.LocalOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type Viewer = 'consumer' | 'staff' | 'farmer' | 'courier' | 'courier-open';

/** Bir Hub'dan bir nechta mahsulot bo'lsa kuryer haqi bitta: buyurtmalar o'rtasida teng bo'linadi (q lar joyida almashtiriladi) */
function shareCourierFee<T extends { hubId: string; q: LocalQuote }>(lines: T[]): T[] {
  const byHub = new Map<string, T[]>();
  lines.forEach((l) => byHub.set(l.hubId, [...(byHub.get(l.hubId) ?? []), l]));
  byHub.forEach((group) => {
    if (group.length < 2) return;
    const parts = splitCourierFee(group[0].q.courierFee, group.length);
    group.forEach((l, i) => { l.q = withCourierFee(l.q, parts[i]); });
  });
  return lines;
}

const n = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));

@Injectable()
export class LocalOrderService {
  private readonly fees: LocalFeeConfig;
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentService,
    private readonly notify: NotificationService,
    private readonly docks: DockService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {
    this.fees = { hubPercent: env.LOCAL_HUB_FEE_PERCENT, hubMin: env.LOCAL_HUB_FEE_MIN, courierFee: env.LOCAL_COURIER_FEE, servicePercent: env.LOCAL_SERVICE_FEE_PERCENT, serviceMin: env.LOCAL_SERVICE_FEE_MIN };
  }

  // ---------- Mahalliy bozor (ochiq katalog) ----------

  /** Hub omborida bor va chakana sotuvga qo'yilgan mahsulotlar (qoldiq = mavjud - zaxira) */
  async market(q: LocalMarketQuery) {
    const rows = await this.prisma.hubStock.findMany({
      where: {
        hub: { isActive: true, ...(q.hubId && { id: q.hubId }), ...(q.region && { region: { equals: q.region, mode: 'insensitive' } }) },
        product: { isRetail: true, status: { not: ProductStatus.ARCHIVED }, retailPricePerKg: { not: null }, ...(q.q && { name: { contains: q.q, mode: 'insensitive' } }) },
      },
      include: { hub: { select: { id: true, name: true, region: true, district: true } }, product: { select: { id: true, name: true, category: true, hubId: true, retailPricePerKg: true, minOrderKg: true, farmer: { select: { farmName: true, region: true } } } } },
      orderBy: { updatedAt: 'desc' }, take: 300,
    });
    return rows
      .filter((s) => s.product.hubId === s.hubId)
      .map((s) => {
        const available = Number(s.weightKg) - Number(s.reservedKg);
        const min = n(s.product.minOrderKg) ?? this.env.LOCAL_MIN_ORDER_KG;
        return { productId: s.product.id, name: s.product.name, category: s.product.category, farmName: s.product.farmer.farmName, farmRegion: s.product.farmer.region, pricePerKg: n(s.product.retailPricePerKg)!, minOrderKg: min, availableKg: available, maxOrderKg: Math.min(available, this.env.LOCAL_MAX_ORDER_KG), hub: s.hub };
      })
      .filter((x) => x.availableKg >= x.minOrderKg);
  }

  /** Buyurtma qilish mumkinligi va qoidalar: ombor qoldig'i, eng kam/ko'p miqdor */
  private async orderable(productId: string, qty: number, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const p = await db.product.findUnique({ where: { id: productId }, include: { hub: true, hubStocks: true } });
    if (!p || !p.isRetail || !p.hub || !p.hub.isActive || p.status === ProductStatus.ARCHIVED || !p.retailPricePerKg) throw new NotFoundException("Mahsulot mahalliy bozorda sotilmaydi");
    const stock = p.hubStocks.find((s) => s.hubId === p.hubId);
    const available = stock ? Number(stock.weightKg) - Number(stock.reservedKg) : 0;
    const min = n(p.minOrderKg) ?? this.env.LOCAL_MIN_ORDER_KG;
    if (qty < min) throw new BadRequestException(`Eng kam buyurtma: ${min} kg`);
    if (qty > this.env.LOCAL_MAX_ORDER_KG) throw new BadRequestException(`Bitta buyurtmada ko'pi bilan ${this.env.LOCAL_MAX_ORDER_KG} kg`);
    if (qty > available) throw new ConflictException(`Hub omborida hozir ${available} kg mavjud`);
    return { product: p, hub: p.hub, price: p.retailPricePerKg, min, available };
  }

  async quote(productId: string, qty: number) {
    const o = await this.orderable(productId, qty);
    const q = localQuote(this.fees, qty, o.price);
    return { productId, name: o.product.name, quantityKg: qty, pricePerKg: Number(o.price), minOrderKg: o.min, availableKg: o.available, hub: { id: o.hub.id, name: o.hub.name, region: o.hub.region }, ...this.money(q) };
  }

  private money(q: { productAmount: Prisma.Decimal; hubFee: Prisma.Decimal; courierFee: Prisma.Decimal; serviceFee: Prisma.Decimal; total: Prisma.Decimal } | { productAmount: Prisma.Decimal; hubFee: Prisma.Decimal; courierFee: Prisma.Decimal; serviceFee: Prisma.Decimal; totalPrice: Prisma.Decimal }) {
    const total = 'total' in q ? q.total : q.totalPrice;
    return { productAmount: Number(q.productAmount), hubFee: Number(q.hubFee), courierFee: Number(q.courierFee), serviceFee: Number(q.serviceFee), totalPrice: Number(total), currency: 'UZS' };
  }

  // ---------- Xaridor ----------

  private consumer(user: LocalUser) {
    if (!user.consumer) throw new ForbiddenException('Xaridor profili topilmadi');
    return user.consumer;
  }

  /** Buyurtma: qoldiq zaxiralanadi + to'lov escrow'ga o'tadi + 4 ulushga bo'linadi — bitta tranzaksiyada */
  async create(user: LocalUser, dto: CreateLocalOrderDto) {
    const c = this.consumer(user);
    const o = await this.orderable(dto.productId, dto.quantityKg);
    const region = dto.region ?? c.region;
    if (normRegion(region) !== normRegion(o.hub.region)) throw new BadRequestException(`Bu Hub faqat ${o.hub.region} bo'yicha yetkazib beradi`);
    const q = localQuote(this.fees, dto.quantityKg, o.price);
    const code = String(randomInt(1000, 10000));
    const id = await this.prisma.$transaction(async (tx) => {
      const order = await tx.localOrder.create({
        data: {
          consumerId: c.id, productId: o.product.id, hubId: o.hub.id, farmerId: o.product.farmerId, quantityKg: dto.quantityKg, pricePerKg: o.price,
          productAmount: q.productAmount, hubFee: q.hubFee, courierFee: q.courierFee, serviceFee: q.serviceFee, totalPrice: q.total,
          deliveryRegion: o.hub.region, deliveryDistrict: dto.district, deliveryAddress: dto.address, contactPhone: dto.phone ?? user.phone, note: dto.note || null, deliveryCode: code,
        },
      });
      await reserveStock(tx, o.hub.id, o.product.id, dto.quantityKg, order.id);
      await this.payments.holdForLocalOrder(tx, { id: order.id, farmerId: o.product.farmerId, hubId: o.hub.id }, q);
      return order.id;
    });
    this.notify.localOrder(id, 'CREATED');
    return this.get(user, id);
  }

  // ---------- O'qish ----------

  private viewerOf(user: LocalUser, o: OrderRow): Viewer {
    if (user.role === Role.CONSUMER && user.consumer?.id === o.consumerId) return 'consumer';
    if (user.role === Role.ADMIN || (user.role === Role.DISPATCHER && (!user.hubId || user.hubId === o.hubId))) return 'staff';
    if (user.role === Role.FARMER && user.farmer?.id === o.farmerId) return 'farmer';
    if (user.role === Role.DRIVER && user.driver && o.courier?.id === user.driver.id) return 'courier';
    throw new NotFoundException('Buyurtma topilmadi');
  }

  private shape(o: OrderRow, v: Viewer) {
    const money = this.money(o);
    const splits = (o.payment?.splits ?? []).map((s) => ({ party: s.party, amount: Number(s.amount), status: s.status }));
    const base = {
      id: o.id, status: o.status, packed: !!o.packedAt, createdAt: o.createdAt, packedAt: o.packedAt, pickedAt: o.pickedAt, deliveredAt: o.deliveredAt, cancelledAt: o.cancelledAt, cancelReason: o.cancelReason,
      productId: o.productId, productName: o.product.name, category: o.product.category, quantityKg: Number(o.quantityKg), pricePerKg: Number(o.pricePerKg),
      hub: v === 'farmer' ? { id: o.hub.id, name: o.hub.name, region: o.hub.region } : o.hub, paymentStatus: o.payment?.status ?? null,
      checkoutId: o.checkoutId, deliveryGroupId: o.deliveryGroupId,
      // Rampa va vaqt: kuryer va Hub xodimi uchun "Samarqand Hub, 2-rampa, 10:00-11:00"
      ...(v === 'staff' || v === 'courier' || v === 'courier-open' ? { dock: o.pickupAppt ? this.docks.brief(o.pickupAppt) : null } : {}),
    };
    if (v === 'consumer') {
      return {
        ...base, ...money, splits, deliveryAddress: `${o.deliveryRegion}, ${o.deliveryDistrict}, ${o.deliveryAddress}`, contactPhone: o.contactPhone, note: o.note,
        // Kod faqat xaridorga va faqat buyurtma faol paytida ko'rinadi
        deliveryCode: ACTIVE.includes(o.status) ? o.deliveryCode : null,
        courier: o.courier ? { name: o.courier.user.fullName, phone: o.courier.user.phone, vehicle: o.courier.vehicleType } : null,
        canCancel: o.status === LocalOrderStatus.PENDING, canConfirm: o.status === LocalOrderStatus.DELIVERING,
      };
    }
    if (v === 'staff') {
      return { ...base, ...money, splits, consumerName: o.consumer.user.fullName, deliveryAddress: `${o.deliveryRegion}, ${o.deliveryDistrict}, ${o.deliveryAddress}`, contactPhone: o.contactPhone, note: o.note, farmName: o.product.farmer.farmName, courier: o.courier ? { name: o.courier.user.fullName, phone: o.courier.user.phone } : null };
    }
    if (v === 'farmer') {
      // Fermer: o'z mahsuloti bo'yicha tushum va uning holati; xaridorning manzili/telefoni ko'rinmaydi
      return { ...base, farmerAmount: money.productAmount, totalPrice: money.totalPrice, splits, consumerName: o.consumer.user.fullName };
    }
    const open = v === 'courier-open';
    return {
      ...base, courierFee: money.courierFee, hubAddress: o.hub.address,
      // Manzil va telefon kuryer yukni olgandan keyin ochiladi
      deliveryRegion: o.deliveryRegion, deliveryDistrict: o.deliveryDistrict,
      ...(open ? {} : { deliveryAddress: o.deliveryAddress, contactPhone: o.contactPhone, note: o.note, consumerName: o.consumer.user.fullName }),
    };
  }

  private async load(id: string) {
    const o = await this.prisma.localOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!o) throw new NotFoundException('Buyurtma topilmadi');
    return o;
  }

  async get(user: LocalUser, id: string) {
    const o = await this.load(id);
    return this.shape(o, this.viewerOf(user, o));
  }

  async mine(user: LocalUser, q: ListLocalOrdersQuery) {
    const rows = await this.prisma.localOrder.findMany({ where: { consumerId: this.consumer(user).id, ...(q.status && { status: q.status }) }, orderBy: { createdAt: 'desc' }, take: 100, include: ORDER_INCLUDE });
    return rows.map((o) => this.shape(o, 'consumer'));
  }

  async farmerSales(user: LocalUser, q: ListLocalOrdersQuery) {
    if (!user.farmer) throw new ForbiddenException('Fermer profili topilmadi');
    const rows = await this.prisma.localOrder.findMany({ where: { farmerId: user.farmer.id, ...(q.status && { status: q.status }) }, orderBy: { createdAt: 'desc' }, take: 100, include: ORDER_INCLUDE });
    return rows.map((o) => this.shape(o, 'farmer'));
  }

  async hubOrders(user: LocalUser, q: ListLocalOrdersQuery) {
    const hubId = user.role === Role.DISPATCHER && user.hubId ? user.hubId : q.hubId;
    const rows = await this.prisma.localOrder.findMany({ where: { ...(hubId && { hubId }), ...(q.status && { status: q.status }) }, orderBy: { createdAt: 'desc' }, take: 150, include: ORDER_INCLUDE });
    return rows.map((o) => this.shape(o, 'staff'));
  }

  // ---------- Hub xodimi ----------

  private async staffOrder(user: LocalUser, id: string) {
    const o = await this.load(id);
    if (this.viewerOf(user, o) !== 'staff') throw new NotFoundException('Buyurtma topilmadi');
    return o;
  }

  async startPacking(user: LocalUser, id: string) {
    await this.staffOrder(user, id);
    const r = await this.prisma.localOrder.updateMany({ where: { id, status: LocalOrderStatus.PENDING }, data: { status: LocalOrderStatus.PACKING } });
    if (r.count === 0) throw new ConflictException('Buyurtma holati o\'zgargan. Sahifani yangilang');
    this.notify.localOrder(id, 'PACKING');
    return this.get(user, id);
  }

  async markPacked(user: LocalUser, id: string) {
    await this.staffOrder(user, id);
    const r = await this.prisma.localOrder.updateMany({ where: { id, status: LocalOrderStatus.PACKING, packedAt: null }, data: { packedAt: new Date() } });
    if (r.count === 0) throw new ConflictException('Buyurtma qadoqlash bosqichida emas yoki allaqachon tayyor');
    return this.get(user, id);
  }

  /**
   * Guruhni bitta bosishda qadoqlash: shu buyurtma bilan bir yetkazish guruhidagi (bir Hub, bir checkout) barcha faol buyurtmalar.
   * ready=false: kutayotganlarini qadoqlashga o'tkazadi; ready=true: hammasini tayyor (kuryerga) qiladi, kutayotganlarini ham qadoqlab.
   */
  async packGroup(user: LocalUser, id: string, ready: boolean) {
    const o = await this.staffOrder(user, id);
    const members = o.deliveryGroupId
      ? await this.prisma.localOrder.findMany({ where: { deliveryGroupId: o.deliveryGroupId, status: { in: [LocalOrderStatus.PENDING, LocalOrderStatus.PACKING] } }, select: { id: true } })
      : [{ id }];
    const ids = members.map((m) => m.id);
    const started = await this.prisma.$transaction(async (tx) => {
      const pend = await tx.localOrder.findMany({ where: { id: { in: ids }, status: LocalOrderStatus.PENDING }, select: { id: true } });
      const a = await tx.localOrder.updateMany({ where: { id: { in: ids }, status: LocalOrderStatus.PENDING }, data: { status: LocalOrderStatus.PACKING, ...(ready && { packedAt: new Date() }) } });
      const b = ready ? await tx.localOrder.updateMany({ where: { id: { in: ids }, status: LocalOrderStatus.PACKING, packedAt: null }, data: { packedAt: new Date() } }) : { count: 0 };
      if (a.count + b.count === 0) throw new ConflictException("Guruhdagi buyurtmalar holati o'zgargan yoki allaqachon tayyor. Sahifani yangilang");
      return pend.map((x) => x.id);
    });
    started.forEach((sid) => this.notify.localOrder(sid, 'PACKING'));
    return Promise.all(ids.map((x) => this.get(user, x)));
  }

  // ---------- Bekor qilish (xaridor / Hub / administrator) ----------

  async cancel(user: LocalUser, id: string, dto: CancelOrderDto) {
    const o = await this.load(id);
    const v = this.viewerOf(user, o);
    const allowed =
      (v === 'consumer' && o.status === LocalOrderStatus.PENDING) ||
      (v === 'staff' && (user.role === Role.ADMIN ? ACTIVE.includes(o.status) : (o.status === LocalOrderStatus.PENDING || o.status === LocalOrderStatus.PACKING)));
    if (!allowed) throw new ConflictException(v === 'consumer' ? "Buyurtma Hub tomonidan qabul qilingan: endi uni faqat Hub bekor qila oladi" : "Bu bosqichda buyurtmani bekor qilib bo'lmaydi");
    const actor = v === 'consumer' ? 'CONSUMER' : user.role === Role.ADMIN ? 'ADMIN' : 'HUB';
    const reason = dto.reason?.trim() || (v === 'consumer' ? 'Xaridor bekor qildi' : 'Hub bekor qildi');
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.localOrder.updateMany({ where: { id, status: o.status }, data: { status: LocalOrderStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason } });
      if (claimed.count === 0) throw new ConflictException("Buyurtma holati o'zgargan. Sahifani yangilang");
      // Qoldiq: kuryer olmagan bo'lsa zaxira bo'shaydi, yo'ldagi buyurtmada yuk omborga qaytadi
      if (o.status === LocalOrderStatus.DELIVERING) await returnStock(tx, o.hubId, o.productId, o.quantityKg, id, reason);
      else await releaseReserve(tx, o.hubId, o.productId, o.quantityKg, id, reason);
      await this.payments.refundForLocalOrder(tx, id, actor, reason);
    });
    this.notify.localOrder(id, 'CANCELLED');
    return this.get(user, id);
  }

  // ---------- Shahar ichi kuryeri ----------

  private driver(user: LocalUser) {
    if (!user.driver) throw new ForbiddenException('Haydovchi profili topilmadi');
    return user.driver;
  }

  async setCourierMode(user: LocalUser, dto: CourierModeDto) {
    const d = this.driver(user);
    if (!dto.enabled) {
      await this.prisma.driver.update({ where: { id: d.id }, data: { courierMode: false } });
      return this.courierMe(user.id);
    }
    const hubId = dto.hubId ?? d.courierHubId;
    const hub = hubId ? await this.prisma.hub.findUnique({ where: { id: hubId } }) : null;
    if (!hub || !hub.isActive) throw new BadRequestException('Kuryer rejimi uchun Hub tanlang');
    if (normRegion(hub.region) !== normRegion(d.region)) throw new BadRequestException(`Siz faoliyat yuritadigan viloyatdagi (${d.region}) Hub'ni tanlang`);
    await this.prisma.driver.update({ where: { id: d.id }, data: { courierMode: true, courierHubId: hub.id } });
    return this.courierMe(user.id);
  }

  async courierMe(userId: string) {
    const d = await this.prisma.driver.findUniqueOrThrow({ where: { userId }, include: { courierHub: { select: { id: true, name: true, region: true, district: true, address: true } } } });
    const active = await this.prisma.localOrder.count({ where: { courierId: d.id, status: LocalOrderStatus.DELIVERING } });
    const hubDock = d.courierHubId ? await this.prisma.hub.findUnique({ where: { id: d.courierHubId }, select: { requireDockBooking: true, _count: { select: { docks: { where: { isActive: true } } } } } }) : null;
    const appts = d.courierHubId ? await this.prisma.dockAppointment.findMany({ where: { bookedById: userId, hubId: d.courierHubId, purpose: 'PICKUP', status: { in: ['BOOKED', 'ARRIVED'] }, endsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' }, take: 10, include: { hub: { select: { name: true } }, dock: { select: { number: true, name: true } } } }) : [];
    return { courierMode: d.courierMode, hub: d.courierHub, activeOrders: active, maxActive: MAX_ACTIVE_COURIER_ORDERS, courierFee: this.env.LOCAL_COURIER_FEE, requireDock: !!hubDock?.requireDockBooking, dockCount: hubDock?._count.docks ?? 0, appointments: appts.map((a) => this.docks.brief(a)) };
  }

  /** Tayyor buyurtmalar. Bir guruhdagi (bir Hub, bir checkout) buyurtmalar bitta yetkazish sifatida chiqadi va faqat HAMMASI tayyor bo'lganda. */
  async courierAvailable(user: LocalUser) {
    const d = await this.prisma.driver.findUniqueOrThrow({ where: { id: this.driver(user).id } });
    if (!d.courierMode || !d.courierHubId) return [];
    const rows = await this.prisma.localOrder.findMany({ where: { hubId: d.courierHubId, status: LocalOrderStatus.PACKING, packedAt: { not: null }, courierId: null }, orderBy: { packedAt: 'asc' }, take: 50, include: ORDER_INCLUDE });
    const groupIds = [...new Set(rows.map((r) => r.deliveryGroupId).filter((x): x is string => !!x))];
    const pending = groupIds.length ? await this.prisma.localOrder.findMany({ where: { deliveryGroupId: { in: groupIds }, OR: [{ status: LocalOrderStatus.PENDING }, { status: LocalOrderStatus.PACKING, packedAt: null }] }, select: { deliveryGroupId: true } }) : [];
    const notReady = new Set(pending.map((x) => x.deliveryGroupId));
    const out: any[] = [];
    const seen = new Set<string>();
    for (const o of rows) {
      if (!o.deliveryGroupId) { out.push({ ...this.shape(o, 'courier-open'), items: [{ id: o.id, productName: o.product.name, quantityKg: Number(o.quantityKg) }] }); continue; }
      if (notReady.has(o.deliveryGroupId) || seen.has(o.deliveryGroupId)) continue;
      seen.add(o.deliveryGroupId);
      const members = rows.filter((r) => r.deliveryGroupId === o.deliveryGroupId);
      out.push({
        ...this.shape(o, 'courier-open'),
        courierFee: members.reduce((a, m) => a + Number(m.courierFee), 0),
        items: members.map((m) => ({ id: m.id, productName: m.product.name, quantityKg: Number(m.quantityKg) })),
      });
    }
    return out;
  }

  async courierMine(user: LocalUser, q: ListLocalOrdersQuery) {
    const rows = await this.prisma.localOrder.findMany({ where: { courierId: this.driver(user).id, ...(q.status && { status: q.status }) }, orderBy: { updatedAt: 'desc' }, take: 100, include: ORDER_INCLUDE });
    return rows.map((o) => this.shape(o, 'courier'));
  }

  /** Kuryer yukni oladi: faqat tayyor (qadoqlangan) buyurtma, o'z Hub'idan, bir vaqtda MAX tagacha. Ombordan jismonan chiqadi. */
  async courierAccept(user: LocalUser, id: string, appointmentId?: string) {
    const d = await this.prisma.driver.findUniqueOrThrow({ where: { id: this.driver(user).id } });
    if (!d.courierMode || !d.courierHubId) throw new ForbiddenException("Avval «Shahar ichi kuryeri» rejimini yoqing");
    const memberIds = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${d.id}))`;
      // Bir vaqtdagi yetkazishlar: guruhdagi buyurtmalar bitta yetkazish hisoblanadi
      const [{ n: active }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT COALESCE("deliveryGroupId", "id"))::bigint AS n FROM "LocalOrder" WHERE "courierId" = ${d.id} AND "status" = 'DELIVERING'`;
      if (Number(active) >= MAX_ACTIVE_COURIER_ORDERS) throw new ConflictException(`Bir vaqtda ${MAX_ACTIVE_COURIER_ORDERS} tadan ortiq yetkazish ola olmaysiz`);
      const o = await tx.localOrder.findUnique({ where: { id }, select: { hubId: true, deliveryGroupId: true } });
      if (!o || o.hubId !== d.courierHubId) throw new NotFoundException('Buyurtma topilmadi');
      // Guruh: shu xaridorning shu Hub'dagi hamma buyurtmasi birga olinadi
      const members = await tx.localOrder.findMany({
        where: o.deliveryGroupId ? { deliveryGroupId: o.deliveryGroupId, status: { in: [LocalOrderStatus.PENDING, LocalOrderStatus.PACKING] } } : { id },
        select: { id: true, productId: true, quantityKg: true, hubId: true, status: true, packedAt: true, courierId: true },
      });
      if (!members.length || !members.some((m) => m.id === id)) throw new ConflictException('Buyurtma tayyor emas yoki boshqa kuryer olgan');
      if (members.some((m) => m.status !== LocalOrderStatus.PACKING || !m.packedAt || m.courierId)) throw new ConflictException("Shu kuryer bilan olib boriladigan boshqa buyurtmalar hali tayyor emas. Hammasi tayyor bo'lgach oling");
      // Hub rampa jadvalini yuritsa: kuryer o'z rampa/vaqti bilan keladi (majburiy bo'lsa — shart)
      const apptId = await this.docks.attachPickup(tx, { userId: user.id, hubId: o.hubId, appointmentId, maxOrders: MAX_APPT_ORDERS, addCount: members.length });
      const claimed = await tx.localOrder.updateMany({ where: { id: { in: members.map((m) => m.id) }, status: LocalOrderStatus.PACKING, packedAt: { not: null }, courierId: null }, data: { courierId: d.id, status: LocalOrderStatus.DELIVERING, pickedAt: new Date(), pickupApptId: apptId } });
      if (claimed.count !== members.length) throw new ConflictException('Buyurtma tayyor emas yoki boshqa kuryer olgan');
      for (const m of members) await dispatchStock(tx, m.hubId, m.productId, m.quantityKg, m.id);
      return members.map((m) => m.id);
    });
    memberIds.forEach((mid) => this.notify.localOrder(mid, 'DELIVERING'));
    return this.get(user, id);
  }

  /** Shu buyurtma bilan birga yo'ldagi guruh a'zolari (guruh bo'lmasa — faqat o'zi) */
  private async deliveringGroup(id: string, groupId: string | null, courierId: string | null) {
    if (!groupId) return [id];
    const rows = await this.prisma.localOrder.findMany({ where: { deliveryGroupId: groupId, status: LocalOrderStatus.DELIVERING, ...(courierId && { courierId }) }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /** Yetkazish: kuryer xaridordan olgan 4 xonali kodni kiritadi (guruhga bitta kod). 5 ta xato urinishdan keyin kod bloklanadi. */
  async courierDeliver(user: LocalUser, id: string, code: string) {
    const o = await this.load(id);
    if (this.viewerOf(user, o) !== 'courier') throw new NotFoundException('Buyurtma topilmadi');
    if (o.status !== LocalOrderStatus.DELIVERING) throw new ConflictException('Buyurtma yo\'lda emas');
    const ids = await this.deliveringGroup(id, o.deliveryGroupId, o.courierId);
    const attempts = Math.max(...(await this.prisma.localOrder.findMany({ where: { id: { in: ids } }, select: { codeAttempts: true } })).map((r) => r.codeAttempts));
    if (attempts >= MAX_CODE_ATTEMPTS) throw new ConflictException("Juda ko'p noto'g'ri urinish. Xaridor yetkazilganini ilovada tasdiqlashi kerak");
    if (!codesMatch(o.deliveryCode, code)) {
      await this.prisma.localOrder.updateMany({ where: { id: { in: ids } }, data: { codeAttempts: { increment: 1 } } });
      throw new BadRequestException("Topshirish kodi noto'g'ri");
    }
    await this.complete(ids, 'COURIER');
    return this.get(user, id);
  }

  /** Xaridor yetkazilganini o'zi tasdiqlaydi (kod ishlatilmasa ham); guruhdagi hamma yo'ldagi buyurtma birga yakunlanadi */
  async consumerConfirm(user: LocalUser, id: string) {
    const o = await this.load(id);
    if (this.viewerOf(user, o) !== 'consumer') throw new NotFoundException('Buyurtma topilmadi');
    if (o.status !== LocalOrderStatus.DELIVERING) throw new ConflictException("Buyurtma hali yo'lda emas yoki allaqachon yakunlangan");
    await this.complete(await this.deliveringGroup(id, o.deliveryGroupId, o.courierId), 'CONSUMER');
    return this.get(user, id);
  }

  /** Yakunlash: holat + escrow taqsimoti (fermer / Hub / kuryer / platforma) bitta tranzaksiyada (guruhdagi barcha buyurtma uchun) */
  private async complete(ids: string[], actor: string) {
    await this.prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const claimed = await tx.localOrder.updateMany({ where: { id, status: LocalOrderStatus.DELIVERING }, data: { status: LocalOrderStatus.COMPLETED, deliveredAt: new Date() } });
        if (claimed.count === 0) throw new ConflictException("Buyurtma holati o'zgargan. Sahifani yangilang");
        const o = await tx.localOrder.findUniqueOrThrow({ where: { id }, select: { courierId: true } });
        await this.payments.releaseForLocalOrder(tx, id, actor, o.courierId);
      }
    });
    ids.forEach((id) => this.notify.localOrder(id, 'COMPLETED'));
  }

  // ---------- Savat: bir nechta mahsulot, bitta umumiy to'lov ----------

  /** Savat qatorlarini birlashtiradi (bir xil mahsulot — miqdori qo'shiladi) va deadlock bo'lmasligi uchun tartiblaydi */
  private mergeItems(items: CartItemDto[]) {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.productId, Math.round(((m.get(it.productId) ?? 0) + it.quantityKg) * 100) / 100);
    return [...m.entries()].map(([productId, quantityKg]) => ({ productId, quantityKg })).sort((a, b) => a.productId.localeCompare(b.productId));
  }

  /** Savatni narxlash: to'lovsiz. Muammoli qatorlar `error` bilan qaytadi (butun so'rov rad etilmaydi), jami faqat to'g'ri qatorlar bo'yicha. */
  async cartQuote(items: CartItemDto[]) {
    const ok: { it: { productId: string; quantityKg: number }; o: Awaited<ReturnType<LocalOrderService['orderable']>>; hubId: string; q: LocalQuote }[] = [];
    const lines: any[] = [];
    for (const it of this.mergeItems(items)) {
      try {
        const o = await this.orderable(it.productId, it.quantityKg);
        ok.push({ it, o, hubId: o.hub.id, q: localQuote(this.fees, it.quantityKg, o.price) });
      } catch (e: any) {
        lines.push({ productId: it.productId, quantityKg: it.quantityKg, ok: false, error: e?.response?.message ?? e?.message ?? 'Mahsulot sotib olinmaydi' });
      }
    }
    shareCourierFee(ok); // bir Hub'dan bir nechta mahsulot — bitta kuryer, bitta yetkazish haqi
    const size = new Map<string, number>();
    ok.forEach((l) => size.set(l.hubId, (size.get(l.hubId) ?? 0) + 1));
    let total = new Prisma.Decimal(0), product = new Prisma.Decimal(0);
    for (const { it, o, q } of ok) {
      total = total.add(q.total); product = product.add(q.productAmount);
      lines.push({ productId: it.productId, name: o.product.name, quantityKg: it.quantityKg, pricePerKg: Number(o.price), minOrderKg: o.min, availableKg: o.available, hub: { id: o.hub.id, name: o.hub.name, region: o.hub.region }, sharedCourier: (size.get(o.hub.id) ?? 1) > 1, ok: true, ...this.money(q) });
    }
    const hubs = new Set(ok.map((l) => l.hubId));
    return { lines, itemCount: lines.length, okCount: ok.length, hubCount: hubs.size, deliveryCount: hubs.size, productAmount: Number(product), totalPrice: Number(total), currency: 'UZS' };
  }

  /**
   * Savatni rasmiylashtirish: hammasi yoki hech narsa. Bitta tranzaksiyada: har bir qator uchun alohida LocalOrder (o'z Hub'i va fermeri bilan),
   * ombor zaxirasi, har bir buyurtmaning escrow ulushlari va xaridordan yechiladigan BITTA umumiy to'lov.
   * Biror qator (qoldiq tugagan, narx o'zgargan...) o'tmasa — hech narsa yozilmaydi va xaridor qaysi mahsulot to'sqinlik qilganini bilib oladi.
   */
  async checkoutBulk(user: LocalUser, dto: BulkCheckoutDto) {
    const c = this.consumer(user);
    if (dto.idempotencyKey) {
      const prior = await this.prisma.localCheckout.findUnique({ where: { consumerId_idempotencyKey: { consumerId: c.id, idempotencyKey: dto.idempotencyKey } }, select: { id: true } });
      if (prior) return this.checkoutView(user, prior.id);
    }
    const items = this.mergeItems(dto.items);
    const region = dto.region ?? c.region;
    let checkoutId: string;
    try {
      checkoutId = await this.prisma.$transaction(async (tx) => {
        const lines: { item: { productId: string; quantityKg: number }; o: Awaited<ReturnType<LocalOrderService['orderable']>>; hubId: string; q: LocalQuote }[] = [];
        for (const item of items) {
          let o;
          try { o = await this.orderable(item.productId, item.quantityKg, tx); }
          catch (e: any) { throw this.lineError(e, item.productId, (await tx.product.findUnique({ where: { id: item.productId }, select: { name: true } }))?.name); }
          if (normRegion(region) !== normRegion(o.hub.region)) throw new BadRequestException({ message: `«${o.product.name}»: bu Hub faqat ${o.hub.region} bo'yicha yetkazib beradi`, productId: item.productId });
          lines.push({ item, o, hubId: o.hub.id, q: localQuote(this.fees, item.quantityKg, o.price) });
        }
        shareCourierFee(lines);
        // Bir Hub'dan 2+ mahsulot: bitta yetkazish guruhi (umumiy kod, bitta kuryer)
        const groups = new Map<string, { id: string; code: string; n: number }>();
        lines.forEach((l) => { const g = groups.get(l.hubId); if (g) g.n++; else groups.set(l.hubId, { id: randomUUID(), code: String(randomInt(1000, 10000)), n: 1 }); });
        const total = lines.reduce((a, l) => a.add(l.q.total), new Prisma.Decimal(0));
        const checkout = await tx.localCheckout.create({ data: { consumerId: c.id, idempotencyKey: dto.idempotencyKey ?? null, totalPrice: total, itemCount: lines.length } });
        const created: { order: { id: string; farmerId: string; hubId: string }; q: (typeof lines)[number]['q'] }[] = [];
        for (const { item, o, q } of lines) {
          const grp = groups.get(o.hub.id)!;
          const order = await tx.localOrder.create({
            data: {
              consumerId: c.id, checkoutId: checkout.id, productId: o.product.id, hubId: o.hub.id, farmerId: o.product.farmerId, quantityKg: item.quantityKg, pricePerKg: o.price,
              productAmount: q.productAmount, hubFee: q.hubFee, courierFee: q.courierFee, serviceFee: q.serviceFee, totalPrice: q.total,
              deliveryRegion: o.hub.region, deliveryDistrict: dto.district, deliveryAddress: dto.address, contactPhone: dto.phone ?? user.phone, note: dto.note || null,
              deliveryCode: grp.n > 1 ? grp.code : String(randomInt(1000, 10000)), deliveryGroupId: grp.n > 1 ? grp.id : null,
            },
          });
          try { await reserveStock(tx, o.hub.id, o.product.id, item.quantityKg, order.id); }
          catch (e: any) { throw this.lineError(e, item.productId, o.product.name); }
          created.push({ order: { id: order.id, farmerId: o.product.farmerId, hubId: o.hub.id }, q });
        }
        await this.payments.holdForCheckout(tx, checkout.id, created);
        return checkout.id;
      });
    } catch (e) {
      // Bir vaqtda yuborilgan bir xil kalit: ikkinchisi birinchisining natijasini oladi
      if (dto.idempotencyKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const prior = await this.prisma.localCheckout.findUnique({ where: { consumerId_idempotencyKey: { consumerId: c.id, idempotencyKey: dto.idempotencyKey } }, select: { id: true } });
        if (prior) return this.checkoutView(user, prior.id);
      }
      throw e;
    }
    const orders = await this.prisma.localOrder.findMany({ where: { checkoutId }, select: { id: true } });
    orders.forEach((o) => this.notify.localOrder(o.id, 'CREATED'));
    return this.checkoutView(user, checkoutId);
  }

  /** Qator xatosini qaysi mahsulotga tegishli ekani bilan qaytaradi (UI shu qatorni belgilaydi) */
  private lineError(e: any, productId: string, name?: string) {
    const msg = e?.response?.message ?? e?.message ?? 'Mahsulot sotib olinmaydi';
    const text = Array.isArray(msg) ? msg.join(', ') : String(msg);
    const status = typeof e?.getStatus === 'function' ? e.getStatus() : 409;
    const body = { message: name ? `«${name}»: ${text}` : text, productId };
    return status === 404 ? new NotFoundException(body) : status === 400 ? new BadRequestException(body) : new ConflictException(body);
  }

  /** Xaridorning bitta chek ko'rinishi: umumiy summa + har bir buyurtma (kodlar, taqsimot) */
  async checkoutView(user: LocalUser, id: string) {
    const c = this.consumer(user);
    const co = await this.prisma.localCheckout.findFirst({ where: { id, consumerId: c.id }, include: { orders: { include: ORDER_INCLUDE, orderBy: { createdAt: 'asc' } } } });
    if (!co) throw new NotFoundException('Buyurtma topilmadi');
    const orders = co.orders.map((o) => this.shape(o, 'consumer'));
    const sum = (k: 'productAmount' | 'hubFee' | 'courierFee' | 'serviceFee') => orders.reduce((a, o: any) => a + o[k], 0);
    return {
      checkoutId: co.id, createdAt: co.createdAt, itemCount: co.itemCount, totalPrice: Number(co.totalPrice), currency: 'UZS',
      productAmount: sum('productAmount'), hubFee: sum('hubFee'), courierFee: sum('courierFee'), serviceFee: sum('serviceFee'),
      paymentRef: co.providerRef, orders,
    };
  }
}
