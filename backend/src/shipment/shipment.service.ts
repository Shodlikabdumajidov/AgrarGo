import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, Role, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationService } from '../telegram/notification.service';
import { AvailableShipmentsQuery, ListShipmentsQuery } from './dto/list-shipments.query';

// Haydovchi bir vaqtda nechta yakunlanmagan yukni olib yura oladi
export const MAX_ACTIVE_SHIPMENTS = 1;

const ACTIVE: ShipmentStatus[] = [ShipmentStatus.LOADING, ShipmentStatus.IN_TRANSIT];

const SHIPMENT_INCLUDE = {
  events: { orderBy: { createdAt: Prisma.SortOrder.asc } },
  driver: {
    select: { vehicleType: true, plateNumber: true, capacityKg: true, user: { select: { fullName: true, phone: true } } },
  },
  booking: { select: { id: true, payment: { select: { status: true } } } },
  warehouseOrder: { select: { id: true, status: true, payment: { select: { status: true } } } },
  farmer: { select: { farmName: true, user: { select: { fullName: true, phone: true } } } },
  market: { select: { companyName: true, user: { select: { fullName: true, phone: true } } } },
} satisfies Prisma.ShipmentInclude;

type ShipmentRow = Prisma.ShipmentGetPayload<{ include: typeof SHIPMENT_INCLUDE }>;
type Viewer = 'driver-open' | 'driver-own' | 'farmer' | 'market';

@Injectable()
export class ShipmentService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, private readonly notify: NotificationService) {}

  // ---------- Haydovchi ----------

  /** Bo'sh yuklar: marshrut (viloyat/tuman) va og'irlik ko'rinadi, aniq manzil va telefonlar yashirin. */
  async listAvailable(driver: { capacityKg: Prisma.Decimal }, query: AvailableShipmentsQuery) {
    const rows = await this.prisma.shipment.findMany({
      where: {
        status: ShipmentStatus.OPEN,
        driverId: null,
        ...(query.originRegion && { originRegion: { equals: query.originRegion, mode: 'insensitive' } }),
      },
      orderBy: { createdAt: 'desc' },
      include: SHIPMENT_INCLUDE,
    });
    const wh = await this.warehouseContact(rows);
    return rows.map((s) => this.shape(s, 'driver-open', driver.capacityKg, wh));
  }

  /** Yukni o'ziga biriktirish: OPEN -> LOADING */
  async accept(driver: { id: string; capacityKg: Prisma.Decimal }, id: string) {
    await this.prisma.$transaction(async (tx) => {
      // Bir haydovchining ikki parallel so'rovi cheklovni aylanib o'ta olmasligi uchun
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${driver.id}))`;

      const active = await tx.shipment.count({ where: { driverId: driver.id, status: { in: ACTIVE } } });
      if (active >= MAX_ACTIVE_SHIPMENTS) {
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
      if (shipment.weightKg.gt(driver.capacityKg)) {
        throw new ConflictException(
          `Yuk og'irligi (${shipment.weightKg} kg) transportingiz sig'imidan (${driver.capacityKg} kg) ko'p`,
        );
      }

      const claimed = await tx.shipment.updateMany({
        where: { id, status: ShipmentStatus.OPEN, driverId: null },
        data: { driverId: driver.id, status: ShipmentStatus.LOADING, assignedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException('Bu yuk allaqachon boshqa haydovchiga biriktirilgan');
      await tx.shipmentEvent.create({ data: { shipmentId: id, status: ShipmentStatus.LOADING } });
      if (shipment.warehouseOrderId) await tx.warehouseOrder.updateMany({ where: { id: shipment.warehouseOrderId }, data: { driverId: driver.id } });
    });
    return this.reload(id, 'driver-own');
  }

  /** Yo'lga chiqishdan oldin yukni qaytarish: LOADING -> OPEN */
  async release(driverId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const released = await tx.shipment.updateMany({
        where: { id, driverId, status: ShipmentStatus.LOADING },
        data: { driverId: null, status: ShipmentStatus.OPEN, assignedAt: null },
      });
      if (released.count === 0) await this.explainFailure(tx, id, driverId, "Yukni faqat yo'lga chiqishdan oldin qaytarish mumkin");
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
      const current = await tx.shipment.findFirst({ where: { id, driverId }, select: { status: true, warehouseOrderId: true } });
      if (!current) throw new NotFoundException('Yuk topilmadi');
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
      reached = next;
      if (next === ShipmentStatus.DELIVERED && current.warehouseOrderId) {
        // Ombor buyurtmasi yetkazildi (pul esa xaridor yoki dispetcher tasdiqlagach chiqariladi)
        const done = await tx.warehouseOrder.updateMany({
          where: { id: current.warehouseOrderId, status: 'DISPATCHED' }, data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
        if (done.count === 0) throw new ConflictException("Buyurtma holati mos kelmaydi. Dispetcherga murojaat qiling");
      }
    });
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
      return rows.map((s) => this.shape(s, 'driver-own', undefined, wh));
    }
    if (user.role === Role.FARMER && user.farmer) {
      const rows = await this.prisma.shipment.findMany({
        where: { farmerId: user.farmer.id, ...statusFilter },
        orderBy: { updatedAt: 'desc' },
        include: SHIPMENT_INCLUDE,
      });
      return rows.map((s) => this.shape(s, 'farmer', undefined, undefined));
    }
    if (user.role === Role.MARKET && user.market) {
      const rows = await this.prisma.shipment.findMany({
        where: { marketId: user.market.id, ...statusFilter },
        orderBy: { updatedAt: 'desc' },
        include: SHIPMENT_INCLUDE,
      });
      const wh = await this.warehouseContact(rows);
      return rows.map((s) => this.shape(s, 'market', undefined, wh));
    }
    throw new ForbiddenException("Bu rol uchun yuklar mavjud emas");
  }

  // ---------- Yordamchilar ----------

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
      cargoName: s.cargoName,
      category: s.category,
      weightKg: s.weightKg,
      origin: { region: s.originRegion, district: s.originDistrict, address: full ? s.originAddress : null },
      destination: { region: s.destRegion, district: s.destDistrict, address: full ? s.destAddress : null },
      createdAt: s.createdAt,
      assignedAt: s.assignedAt,
      deliveredAt: s.deliveredAt,
      events: s.events.map((e) => ({ status: e.status, createdAt: e.createdAt })),
      paymentStatus: s.booking?.payment?.status ?? s.warehouseOrder?.payment?.status ?? null, // haydovchi uchun: to'lov kafolatlanganmi
      ...(viewer === 'driver-open' && capacityKg ? { fitsCapacity: s.weightKg.lte(capacityKg) } : {}),
      farmer: viewer === 'driver-own' || viewer === 'market'
        ? { farmName: farmer.farmName, fullName: farmer.user.fullName, phone: farmer.user.phone }
        : null,
      market: viewer === 'driver-own' || viewer === 'farmer'
        ? { companyName: market.companyName, fullName: market.user.fullName, phone: market.user.phone }
        : null,
      driver: (viewer === 'farmer' || viewer === 'market') && s.driver
        ? {
            fullName: s.driver.user.fullName,
            phone: s.driver.user.phone,
            vehicleType: s.driver.vehicleType,
            plateNumber: s.driver.plateNumber,
          }
        : null,
    };
  }
}
