import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, ShipmentStatus, StockMovementType, WarehouseItemStatus, WarehouseOrderStatus, WarehouseZone } from '@prisma/client';
import { PaymentService } from '../payment/payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrustService } from '../trust/trust.service';
import { SettingsService } from '../settings/settings.service';
import { ShipmentService } from '../shipment/shipment.service';
import { createShipmentForWarehouseOrder } from '../shipment/shipment.factory';
import { NotificationService } from '../telegram/notification.service';
import { CreateOrderDto, DispatchDto, OrdersQuery } from './dto/warehouse.dto';

const OPEN: WarehouseOrderStatus[] = ['PENDING', 'PICKING', 'PICKED', 'DISPATCHED'];
export const MAX_OPEN_ORDERS_PER_MARKET = 20; // bitta market butun omborni zaxiralab qo'ymasligi uchun
const D = (n: number | string) => new Prisma.Decimal(n);

const ORDER_INCLUDE = {
  item: {
    select: {
      id: true, code: true, name: true, category: true, photoUrl: true, storageType: true, grade: true, sizeClass: true, packagingType: true,
      farmer: { select: { farmName: true, region: true, district: true, address: true, user: { select: { fullName: true, phone: true } } } },
    },
  },
  market: { select: { companyName: true, region: true, district: true, address: true, user: { select: { fullName: true, phone: true } } } },
  driver: { select: { id: true, vehicleType: true, plateNumber: true, capacityKg: true, user: { select: { fullName: true, phone: true } } } },
  payment: { select: { status: true, amount: true, feeAmount: true } },
  shipment: { select: { id: true, status: true, driverId: true, deliveredAt: true } },
} satisfies Prisma.WarehouseOrderInclude;

type OrderRow = Prisma.WarehouseOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type Viewer = 'ops' | 'market' | 'farmer' | 'driver';
type Actor = { id: string; role: Role; farmer?: { id: string } | null; market?: { id: string } | null; driver?: { id: string } | null };

@Injectable()
export class WarehouseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentService,
    private readonly shipments: ShipmentService,
    private readonly settings: SettingsService,
    private readonly notify: NotificationService,
    private readonly trust: TrustService,
  ) {}

  // ---------- Market: buyurtma berish ----------

  /**
   * Miqdor atomik zaxiralanadi (ikki xaridor oxirgi kilogrammni ikkalasi ham ola olmaydi) va mablag' darhol
   * escrow'ga muzlatiladi (HELD). Provayder xatosi bo'lsa buyurtma ham, zaxira ham qaytariladi.
   */
  async create(marketId: string, dto: CreateOrderDto) {
    const openCount = await this.prisma.warehouseOrder.count({ where: { marketId, status: { in: OPEN } } });
    if (openCount >= MAX_OPEN_ORDERS_PER_MARKET) {
      throw new ConflictException(`Ochiq buyurtmalar soni chegarasiga (${MAX_OPEN_ORDERS_PER_MARKET}) yetdingiz. Avval mavjudlari yakunlansin`);
    }
    const orderId = await this.prisma.$transaction(async (tx) => {
      const item = await tx.warehouseItem.findUnique({ where: { id: dto.itemId }, select: { pricePerKg: true, zone: true, status: true } });
      if (!item || item.zone !== WarehouseZone.OUTBOUND || item.status !== WarehouseItemStatus.ACTIVE) {
        throw new NotFoundException("Mahsulot topilmadi yoki jo'natishga tayyor emas");
      }
      const qty = D(dto.quantityKg);
      const reserved = await tx.$executeRaw`
        UPDATE "WarehouseItem" SET "reservedKg" = "reservedKg" + ${qty}::numeric, "updatedAt" = now()
        WHERE id = ${dto.itemId} AND zone = 'OUTBOUND'::"WarehouseZone" AND status = 'ACTIVE'::"WarehouseItemStatus"
          AND "weightKg" - "reservedKg" >= ${qty}::numeric`;
      if (reserved === 0) throw new ConflictException("Omborda yetarli miqdor yo'q. Mavjud miqdorni yangilab, qayta urinib ko'ring");
      const order = await tx.warehouseOrder.create({
        data: { itemId: dto.itemId, marketId, quantityKg: qty, pricePerKg: item.pricePerKg, totalPrice: item.pricePerKg.mul(qty), note: dto.note || null },
      });
      await this.payments.holdForWarehouseOrder(tx, order);
      return order.id;
    });
    this.notify.escrowHeld({ warehouseOrderId: orderId });
    return this.reload(orderId, 'market');
  }

  // ---------- Ro'yxatlar ----------

  async listMine(user: Actor, q: OrdersQuery) {
    const status = q.status ? { status: q.status } : {};
    if (user.role === Role.MARKET && user.market) return this.list({ marketId: user.market.id, ...status }, 'market');
    if (user.role === Role.FARMER && user.farmer) return this.list({ item: { farmerId: user.farmer.id }, ...status }, 'farmer');
    if (user.role === Role.DRIVER && user.driver) return this.list({ driverId: user.driver.id, ...status }, 'driver');
    throw new ForbiddenException('Bu rol uchun buyurtmalar mavjud emas');
  }

  async listAll(q: OrdersQuery) {
    return this.list(q.status ? { status: q.status } : {}, 'ops');
  }

  /** Dispetcher yuklash uchun haydovchi tanlashi mumkin (ixtiyoriy: haydovchi o'zi ham "Mavjud yuklar"dan qabul qila oladi) */
  async drivers() {
    const rows = await this.prisma.driver.findMany({
      orderBy: { createdAt: 'asc' }, take: 200,
      select: { id: true, userId: true, vehicleType: true, plateNumber: true, capacityKg: true, region: true, user: { select: { fullName: true, isActive: true } } },
    });
    const active = rows.filter((d) => d.user.isActive);
    const trust = await this.trust.summaries(active.map((d) => d.userId)); // dispetcher tanlayotganda: tasdiqlangan belgi, status, badjlar
    return active.map((d) => ({
      id: d.id, fullName: d.user.fullName, vehicleType: d.vehicleType, plateNumber: d.plateNumber, capacityKg: d.capacityKg, region: d.region, trust: trust.get(d.userId) ?? null,
    }));
  }

  // ---------- Dispetcher: yig'ish va jo'natish ----------

  startPicking(id: string) {
    return this.step(id, 'PENDING', 'PICKING', {}, "Buyurtma allaqachon yig'ilmoqda yoki yakunlangan");
  }

  /** Yig'ish tugadi: buyurtma uchun yuk (Shipment) yaratiladi va haydovchilarga "Mavjud yuklar"da ochiladi. */
  async picked(id: string) {
    const wh = await this.warehouseLocation();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.warehouseOrder.updateMany({ where: { id, status: 'PICKING' }, data: { status: 'PICKED', pickedAt: new Date() } });
      if (claimed.count === 0) {
        const exists = await tx.warehouseOrder.findUnique({ where: { id }, select: { id: true } });
        if (!exists) throw new NotFoundException('Buyurtma topilmadi');
        throw new ConflictException("Avval buyurtma yig'ishni boshlang");
      }
      await createShipmentForWarehouseOrder(tx, id, wh);
    });
    return this.reload(id, 'ops');
  }

  /** Dispetcher haydovchini o'zi biriktiradi (haydovchi qabul qilishi bilan bir xil qoidalar: sig'im, bitta faol yuk). */
  async assign(id: string, dto: DispatchDto) {
    const order = await this.prisma.warehouseOrder.findUnique({ where: { id }, select: { status: true, shipment: { select: { id: true, status: true } } } });
    if (!order) throw new NotFoundException('Buyurtma topilmadi');
    if (order.status !== 'PICKED' || !order.shipment || order.shipment.status !== ShipmentStatus.OPEN) {
      throw new ConflictException("Haydovchi biriktirish uchun buyurtma yig'ilgan va yuk bo'sh bo'lishi kerak");
    }
    const driver = await this.prisma.driver.findUnique({ where: { id: dto.driverId }, select: { id: true, capacityKg: true, user: { select: { isActive: true } } } });
    if (!driver || !driver.user.isActive) throw new NotFoundException('Haydovchi topilmadi');
    await this.shipments.accept(driver, order.shipment.id);
    return this.reload(id, 'ops');
  }

  /**
   * Yuklash tasdiqlandi, haydovchi yo'lga chiqadi: qoldiq va zaxira birga kamayadi, yuk YO'LDA bo'ladi (GPS kuzatuv boshlanadi).
   * Buning uchun haydovchi yukni qabul qilgan (yoki biriktirilgan) bo'lishi kerak.
   */
  async dispatch(actorId: string, id: string) {
    let shipmentId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.warehouseOrder.findUnique({ where: { id }, include: { shipment: { select: { id: true, status: true, driverId: true } } } });
      if (!order) throw new NotFoundException('Buyurtma topilmadi');
      if (order.status !== 'PICKED') throw new ConflictException("Jo'natish uchun buyurtma avval to'liq yig'ilgan bo'lishi kerak");
      const sh = order.shipment;
      if (!sh || sh.status !== ShipmentStatus.LOADING || !sh.driverId) {
        throw new ConflictException("Avval haydovchi yukni qabul qilishi yoki dispetcher haydovchi biriktirishi kerak");
      }

      const claimed = await tx.warehouseOrder.updateMany({
        where: { id, status: 'PICKED' }, data: { status: 'DISPATCHED', driverId: sh.driverId, dispatchedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("Buyurtma holati o'zgargan. Sahifani yangilang");
      const moved = await tx.shipment.updateMany({ where: { id: sh.id, status: ShipmentStatus.LOADING }, data: { status: ShipmentStatus.IN_TRANSIT } });
      if (moved.count === 0) throw new ConflictException("Yuk holati o'zgargan. Sahifani yangilang");
      await tx.shipmentEvent.create({ data: { shipmentId: sh.id, status: ShipmentStatus.IN_TRANSIT } });
      shipmentId = sh.id;

      // CHECK cheklovlari (qoldiq >= zaxira >= 0) bazada ham himoya qiladi
      await tx.$executeRaw`
        UPDATE "WarehouseItem"
        SET "weightKg" = "weightKg" - ${order.quantityKg}::numeric, "reservedKg" = "reservedKg" - ${order.quantityKg}::numeric, "updatedAt" = now()
        WHERE id = ${order.itemId}`;
      await tx.warehouseItem.updateMany({ where: { id: order.itemId, weightKg: 0, status: WarehouseItemStatus.ACTIVE }, data: { status: WarehouseItemStatus.DEPLETED } });
      await tx.stockMovement.create({
        data: { itemId: order.itemId, type: StockMovementType.DISPATCH, deltaKg: order.quantityKg.neg(), fromZone: WarehouseZone.OUTBOUND, actorId, note: `Buyurtma ${order.id.slice(0, 8)} haydovchiga yuklandi` },
      });
    });
    if (shipmentId) this.notify.shipmentStatus(shipmentId, ShipmentStatus.IN_TRANSIT);
    return this.reload(id, 'ops');
  }

  // ---------- Bekor qilish va yetkazish ----------

  /** Market (yig'ish tugamaguncha) yoki dispetcher (jo'natilgunga qadar) bekor qiladi: zaxira qaytadi, yuk bekor bo'ladi, mablag' xaridorga qaytariladi. */
  async cancel(user: Actor, id: string) {
    const staff = this.isStaff(user);
    const allowed: WarehouseOrderStatus[] = staff ? ['PENDING', 'PICKING', 'PICKED'] : ['PENDING', 'PICKING'];
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.warehouseOrder.findUnique({ where: { id } });
      if (!order || !(staff || (user.role === Role.MARKET && order.marketId === user.market?.id))) throw new NotFoundException('Buyurtma topilmadi');
      const claimed = await tx.warehouseOrder.updateMany({ where: { id, status: { in: allowed } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      if (claimed.count === 0) {
        throw new ConflictException(order.status === 'CANCELLED' ? 'Buyurtma allaqachon bekor qilingan' : "Bu bosqichda buyurtmani bekor qilib bo'lmaydi");
      }
      // Yuk hali yo'lga chiqmagan bo'lsa bekor qilinadi (haydovchi bo'shaydi)
      const sh = await tx.shipment.findUnique({ where: { warehouseOrderId: id }, select: { id: true } });
      if (sh) {
        const cancelled = await tx.shipment.updateMany({ where: { id: sh.id, status: { in: [ShipmentStatus.OPEN, ShipmentStatus.LOADING] } }, data: { status: ShipmentStatus.CANCELLED } });
        if (cancelled.count === 0) throw new ConflictException("Yuk allaqachon yo'lda: bekor qilib bo'lmaydi");
        await tx.shipmentEvent.create({ data: { shipmentId: sh.id, status: ShipmentStatus.CANCELLED } });
      }
      await tx.$executeRaw`UPDATE "WarehouseItem" SET "reservedKg" = "reservedKg" - ${order.quantityKg}::numeric, "updatedAt" = now() WHERE id = ${order.itemId}`;
      await this.payments.refundForWarehouseOrder(tx, id, staff ? user.role : 'MARKET', staff ? 'Buyurtma bekor qilindi (dispetcher)' : 'Buyurtma bekor qilindi');
    });
    return this.reload(id, staff ? 'ops' : 'market');
  }

  /**
   * Qabulni tasdiqlash va to'lovni chiqarish. Xaridor yoki dispetcher/admin tasdiqlaydi:
   *  - yuk yo'lda (DISPATCHED) bo'lsa — yetkazildi deb belgilanadi, so'ng pul chiqariladi;
   *  - haydovchi allaqachon yetkazgan (DELIVERED, pul hali escrow'da) bo'lsa — faqat pul chiqariladi.
   * Pul: fermerga (summa - omborxona xizmat haqi) va omborxona hisobiga.
   */
  async deliver(user: Actor, id: string) {
    const order = await this.prisma.warehouseOrder.findUnique({ where: { id }, select: { marketId: true } });
    const ok = order && (this.isStaff(user) || (user.role === Role.MARKET && order.marketId === user.market?.id));
    if (!ok) throw new NotFoundException('Buyurtma topilmadi');
    const actor = this.isStaff(user) ? user.role : 'MARKET';
    let deliveredShipmentId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const delivered = await tx.warehouseOrder.updateMany({ where: { id, status: 'DISPATCHED' }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
      if (delivered.count === 1) {
        const sh = await tx.shipment.findUnique({ where: { warehouseOrderId: id }, select: { id: true } });
        if (sh) {
          const done = await tx.shipment.updateMany({ where: { id: sh.id, status: ShipmentStatus.IN_TRANSIT }, data: { status: ShipmentStatus.DELIVERED, deliveredAt: new Date() } });
          if (done.count === 1) {
            await tx.shipmentEvent.create({ data: { shipmentId: sh.id, status: ShipmentStatus.DELIVERED } });
            deliveredShipmentId = sh.id;
          }
        }
      } else {
        const cur = await tx.warehouseOrder.findUnique({ where: { id }, select: { status: true } });
        if (cur?.status !== 'DELIVERED') throw new ConflictException("Buyurtma hali jo'natilmagan yoki bekor qilingan");
      }
      const pay = await tx.payment.findUnique({ where: { warehouseOrderId: id }, select: { status: true } });
      if (pay?.status === 'RELEASED') throw new ConflictException('Buyurtma allaqachon yetkazilgan va to\'lov chiqarilgan');
      await this.payments.releaseForWarehouseOrder(tx, id, actor);
    });
    if (deliveredShipmentId) this.notify.shipmentStatus(deliveredShipmentId, ShipmentStatus.DELIVERED);
    return this.reload(id, this.viewerOf(user));
  }

  // ---------- Yordamchilar ----------

  private isStaff(user: { role: Role }) {
    return user.role === Role.DISPATCHER || user.role === Role.ADMIN;
  }

  private viewerOf(user: Actor): Viewer {
    return this.isStaff(user) ? 'ops' : user.role === Role.MARKET ? 'market' : user.role === Role.DRIVER ? 'driver' : 'farmer';
  }

  /** Omborxonaning joylashuvi (admin sozlamalarida): yuk shu yerdan olib ketiladi. */
  private async warehouseLocation() {
    const st = await this.settings.getForAdmin();
    return { region: st.warehouseRegion, district: st.warehouseDistrict, address: st.warehouseAddress ?? null };
  }

  private async step(id: string, from: WarehouseOrderStatus, to: WarehouseOrderStatus, extra: Prisma.WarehouseOrderUpdateManyMutationInput, conflict: string) {
    const claimed = await this.prisma.warehouseOrder.updateMany({ where: { id, status: from }, data: { status: to, ...extra } });
    if (claimed.count === 0) {
      const exists = await this.prisma.warehouseOrder.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException('Buyurtma topilmadi');
      throw new ConflictException(conflict);
    }
    return this.reload(id, 'ops');
  }

  private async list(where: Prisma.WarehouseOrderWhereInput, viewer: Viewer) {
    const rows = await this.prisma.warehouseOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include: ORDER_INCLUDE });
    return rows.map((r) => this.shape(r, viewer));
  }

  private async reload(id: string, viewer: Viewer) {
    return this.shape(await this.prisma.warehouseOrder.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE }), viewer);
  }

  /**
   * Aloqa ma'lumotlari: fermer va market bir-birining telefonini ko'rmaydi (savdo platforma orqali);
   * haydovchi yetkazish uchun marketning manzili va telefonini oladi; dispetcher hammasini ko'radi.
   * To'lov: market umumiy summani, fermer o'ziga o'tadigan sof summani va xizmat haqini ko'radi.
   */
  private shape(r: OrderRow, viewer: Viewer) {
    const f = r.item.farmer;
    const pay = r.payment;
    const payment = pay
      ? {
          status: pay.status,
          amount: viewer === 'driver' ? undefined : pay.amount,
          feeAmount: viewer === 'market' || viewer === 'driver' ? undefined : pay.feeAmount,
          farmerAmount: viewer === 'market' || viewer === 'driver' ? undefined : pay.amount.sub(pay.feeAmount),
        }
      : null;
    return {
      id: r.id, status: r.status, quantityKg: r.quantityKg, pricePerKg: r.pricePerKg, totalPrice: r.totalPrice, note: r.note,
      createdAt: r.createdAt, pickedAt: r.pickedAt, dispatchedAt: r.dispatchedAt, deliveredAt: r.deliveredAt, cancelledAt: r.cancelledAt,
      item: {
        id: r.item.id, code: r.item.code, name: r.item.name, category: r.item.category, photoUrl: r.item.photoUrl,
        storageType: r.item.storageType, grade: r.item.grade, sizeClass: r.item.sizeClass, packagingType: r.item.packagingType,
      },
      payment,
      // Yuk (Shipment): haydovchi qabul qilgan, GPS kuzatuv va ELD shu orqali ishlaydi
      shipment: r.shipment ? { id: r.shipment.id, status: r.shipment.status, deliveredAt: r.shipment.deliveredAt } : null,
      awaitingConfirmation: r.status === 'DELIVERED' && pay?.status === 'HELD',
      farmer: viewer === 'ops'
        ? { farmName: f.farmName, fullName: f.user.fullName, phone: f.user.phone, region: f.region }
        : { farmName: f.farmName, region: f.region },
      market: viewer === 'ops' || viewer === 'driver'
        ? { companyName: r.market.companyName, fullName: r.market.user.fullName, phone: r.market.user.phone, region: r.market.region, district: r.market.district, address: r.market.address }
        : { companyName: r.market.companyName, region: r.market.region },
      driver: r.driver && viewer !== 'farmer'
        ? { id: r.driver.id, fullName: r.driver.user.fullName, phone: r.driver.user.phone, vehicleType: r.driver.vehicleType, plateNumber: r.driver.plateNumber }
        : null,
    };
  }
}
