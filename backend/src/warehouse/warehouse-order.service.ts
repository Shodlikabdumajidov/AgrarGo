import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, StockMovementType, WarehouseItemStatus, WarehouseOrderStatus, WarehouseZone } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
} satisfies Prisma.WarehouseOrderInclude;

type OrderRow = Prisma.WarehouseOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type Viewer = 'ops' | 'market' | 'farmer' | 'driver';
type Actor = { id: string; role: Role; farmer?: { id: string } | null; market?: { id: string } | null; driver?: { id: string } | null };

@Injectable()
export class WarehouseOrderService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Market: buyurtma berish ----------

  /** Miqdor atomik zaxiralanadi: ikki xaridor oxirgi kilogrammni ikkalasi ham ola olmaydi. */
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
      return order.id;
    });
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

  /** Dispetcher yuklash uchun haydovchi tanlaydi */
  async drivers() {
    const rows = await this.prisma.driver.findMany({
      orderBy: { createdAt: 'asc' }, take: 200,
      select: { id: true, vehicleType: true, plateNumber: true, capacityKg: true, region: true, user: { select: { fullName: true, isActive: true } } },
    });
    return rows.filter((d) => d.user.isActive).map((d) => ({
      id: d.id, fullName: d.user.fullName, vehicleType: d.vehicleType, plateNumber: d.plateNumber, capacityKg: d.capacityKg, region: d.region,
    }));
  }

  // ---------- Dispetcher: yig'ish va jo'natish ----------

  startPicking(id: string) {
    return this.step(id, 'PENDING', 'PICKING', {}, 'Buyurtma allaqachon yig\'ilmoqda yoki yakunlangan');
  }

  picked(id: string) {
    return this.step(id, 'PICKING', 'PICKED', { pickedAt: new Date() }, "Avval buyurtma yig'ishni boshlang");
  }

  /** Haydovchiga yuklab jo'natish: qoldiq va zaxira birga kamayadi (atomik). */
  async dispatch(actorId: string, id: string, dto: DispatchDto) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.warehouseOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Buyurtma topilmadi');
      if (order.status !== 'PICKED') throw new ConflictException("Jo'natish uchun buyurtma avval to'liq yig'ilgan bo'lishi kerak");
      const driver = await tx.driver.findUnique({ where: { id: dto.driverId }, select: { capacityKg: true, user: { select: { isActive: true } } } });
      if (!driver || !driver.user.isActive) throw new NotFoundException('Haydovchi topilmadi');
      if (order.quantityKg.gt(driver.capacityKg)) {
        throw new ConflictException(`Buyurtma (${order.quantityKg} kg) haydovchining sig'imidan (${driver.capacityKg} kg) og'ir`);
      }

      const claimed = await tx.warehouseOrder.updateMany({
        where: { id, status: 'PICKED' }, data: { status: 'DISPATCHED', driverId: dto.driverId, dispatchedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("Buyurtma holati o'zgargan. Sahifani yangilang");

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
    return this.reload(id, 'ops');
  }

  // ---------- Bekor qilish va yetkazish ----------

  /** Market (yig'ish boshlanmagan yoki boshlangan, lekin hali jo'natilmagan) yoki dispetcher bekor qiladi; zaxira qaytariladi. */
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
      await tx.$executeRaw`UPDATE "WarehouseItem" SET "reservedKg" = "reservedKg" - ${order.quantityKg}::numeric, "updatedAt" = now() WHERE id = ${order.itemId}`;
    });
    return this.reload(id, staff ? 'ops' : 'market');
  }

  /** Yetkazildi: xaridor tasdiqlaydi (yoki biriktirilgan haydovchi / dispetcher belgilaydi). */
  async deliver(user: Actor, id: string) {
    const order = await this.prisma.warehouseOrder.findUnique({ where: { id }, select: { marketId: true, driverId: true } });
    const ok = order && (this.isStaff(user)
      || (user.role === Role.MARKET && order.marketId === user.market?.id)
      || (user.role === Role.DRIVER && order.driverId === user.driver?.id));
    if (!ok) throw new NotFoundException('Buyurtma topilmadi');
    const claimed = await this.prisma.warehouseOrder.updateMany({ where: { id, status: 'DISPATCHED' }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
    if (claimed.count === 0) throw new ConflictException('Buyurtma hali jo\'natilmagan yoki allaqachon yetkazilgan');
    return this.reload(id, this.viewerOf(user));
  }

  // ---------- Yordamchilar ----------

  private isStaff(user: { role: Role }) {
    return user.role === Role.DISPATCHER || user.role === Role.ADMIN;
  }

  private viewerOf(user: Actor): Viewer {
    return this.isStaff(user) ? 'ops' : user.role === Role.MARKET ? 'market' : user.role === Role.DRIVER ? 'driver' : 'farmer';
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
   */
  private shape(r: OrderRow, viewer: Viewer) {
    const f = r.item.farmer;
    return {
      id: r.id, status: r.status, quantityKg: r.quantityKg, pricePerKg: r.pricePerKg, totalPrice: r.totalPrice, note: r.note,
      createdAt: r.createdAt, pickedAt: r.pickedAt, dispatchedAt: r.dispatchedAt, deliveredAt: r.deliveredAt, cancelledAt: r.cancelledAt,
      item: {
        id: r.item.id, code: r.item.code, name: r.item.name, category: r.item.category, photoUrl: r.item.photoUrl,
        storageType: r.item.storageType, grade: r.item.grade, sizeClass: r.item.sizeClass, packagingType: r.item.packagingType,
      },
      farmer: viewer === 'ops'
        ? { farmName: f.farmName, fullName: f.user.fullName, phone: f.user.phone, region: f.region }
        : viewer === 'driver'
        ? { farmName: f.farmName, region: f.region }
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
