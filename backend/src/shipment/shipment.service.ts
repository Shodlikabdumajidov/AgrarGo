import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvailableShipmentsQuery, ListShipmentsQuery } from './dto/list-shipments.query';

// Haydovchi bir vaqtda nechta yakunlanmagan yukni olib yura oladi
export const MAX_ACTIVE_SHIPMENTS = 1;

const ACTIVE: ShipmentStatus[] = [ShipmentStatus.LOADING, ShipmentStatus.IN_TRANSIT];

const SHIPMENT_INCLUDE = {
  events: { orderBy: { createdAt: Prisma.SortOrder.asc } },
  driver: {
    select: { vehicleType: true, plateNumber: true, capacityKg: true, user: { select: { fullName: true, phone: true } } },
  },
  booking: {
    select: {
      id: true,
      product: { select: { farmer: { select: { farmName: true, user: { select: { fullName: true, phone: true } } } } } },
      market: { select: { companyName: true, user: { select: { fullName: true, phone: true } } } },
    },
  },
} satisfies Prisma.ShipmentInclude;

type ShipmentRow = Prisma.ShipmentGetPayload<{ include: typeof SHIPMENT_INCLUDE }>;
type Viewer = 'driver-open' | 'driver-own' | 'farmer' | 'market';

@Injectable()
export class ShipmentService {
  constructor(private readonly prisma: PrismaService) {}

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
    return rows.map((s) => this.shape(s, 'driver-open', driver.capacityKg));
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
    });
    return this.reload(id, 'driver-own');
  }

  /** Keyingi bosqichga o'tkazish: LOADING -> IN_TRANSIT -> DELIVERED */
  async advance(driverId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.shipment.findFirst({ where: { id, driverId }, select: { status: true } });
      if (!current) throw new NotFoundException('Yuk topilmadi');

      const next =
        current.status === ShipmentStatus.LOADING ? ShipmentStatus.IN_TRANSIT
        : current.status === ShipmentStatus.IN_TRANSIT ? ShipmentStatus.DELIVERED
        : null;
      if (!next) throw new ConflictException('Bu yuk allaqachon yetkazib berilgan');

      // Holat hali o'zgarmagan bo'lsagina o'tkazamiz (ikki marta bosish himoyasi)
      const moved = await tx.shipment.updateMany({
        where: { id, driverId, status: current.status },
        data: { status: next, ...(next === ShipmentStatus.DELIVERED && { deliveredAt: new Date() }) },
      });
      if (moved.count === 0) throw new ConflictException("Yuk holati allaqachon o'zgargan. Sahifani yangilang");
      await tx.shipmentEvent.create({ data: { shipmentId: id, status: next } });
    });
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
      return rows.map((s) => this.shape(s, 'driver-own'));
    }
    if (user.role === Role.FARMER && user.farmer) {
      const rows = await this.prisma.shipment.findMany({
        where: { booking: { product: { farmerId: user.farmer.id } }, ...statusFilter },
        orderBy: { updatedAt: 'desc' },
        include: SHIPMENT_INCLUDE,
      });
      return rows.map((s) => this.shape(s, 'farmer'));
    }
    if (user.role === Role.MARKET && user.market) {
      const rows = await this.prisma.shipment.findMany({
        where: { booking: { marketId: user.market.id }, ...statusFilter },
        orderBy: { updatedAt: 'desc' },
        include: SHIPMENT_INCLUDE,
      });
      return rows.map((s) => this.shape(s, 'market'));
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
    return this.shape(row, viewer);
  }

  /**
   * Ko'rinish qoidalari:
   *  - bo'sh yuk (driver-open): faqat viloyat/tuman va og'irlik; manzil va telefonlar yo'q
   *  - haydovchi (o'zining yuki): ikkala tomonning manzili va telefoni
   *  - fermer/market: o'z kontragentining telefoni (bron tasdiqlanganda ochilgan) + biriktirilgan haydovchi ma'lumoti
   */
  private shape(s: ShipmentRow, viewer: Viewer, capacityKg?: Prisma.Decimal) {
    const farmer = s.booking.product.farmer;
    const market = s.booking.market;
    const full = viewer !== 'driver-open';

    return {
      id: s.id,
      bookingId: s.booking.id,
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
