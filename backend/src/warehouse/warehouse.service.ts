import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, StorageType, StockMovementType, WarehouseItemStatus, WarehouseZone } from '@prisma/client';
import { randomBytes, randomInt } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { detectImageExt, UPLOADS_DIR } from '../profile/profile.service';
import {
  AnnounceItemDto, CountDto, CreateUnitDto, FeedQuery, InspectDto, ItemsQuery, MoveDto, ReadingDto, ReceiveDto, SortDto,
} from './dto/warehouse.dto';
import {
  canMove, CODE_ALPHABET, DEFAULT_CLIMATE, formatCode, isStorageAcceptable, recommendStorage, shelfLifeDays,
} from './warehouse.policy';
import { ITEM_INCLUDE, ItemRow, shapeItem, unitStatus } from './warehouse.view';

const WAREHOUSE_DIR = join(UPLOADS_DIR, 'warehouse');
export const MAX_ITEM_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_ACTIVE_ANNOUNCEMENTS = 50; // bitta fermerning kutilayotgan e'lonlari (spamdan himoya)
const DAY = 86_400_000;
const D = (n: number | string) => new Prisma.Decimal(n);

type Actor = { id: string; role: Role; farmer?: { id: string } | null };

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Fermer: yuk yuborishni e'lon qilish ----------

  async announce(farmerId: string, dto: AnnounceItemDto) {
    const pending = await this.prisma.warehouseItem.count({ where: { farmerId, status: WarehouseItemStatus.ANNOUNCED } });
    if (pending >= MAX_ACTIVE_ANNOUNCEMENTS) {
      throw new ConflictException("Kutilayotgan e'lonlar juda ko'p. Avval mavjudlari qabul qilinishini kuting");
    }
    const row = await this.prisma.warehouseItem.create({
      data: {
        farmerId, name: dto.name, category: dto.category, description: dto.description || null,
        storageType: recommendStorage(dto.category, dto.name),
        declaredWeightKg: dto.declaredWeightKg, pricePerKg: dto.pricePerKg,
      },
      include: ITEM_INCLUDE,
    });
    return shapeItem(row, 'owner');
  }

  async cancelAnnouncement(farmerId: string, id: string) {
    const res = await this.prisma.warehouseItem.deleteMany({ where: { id, farmerId, status: WarehouseItemStatus.ANNOUNCED } });
    if (res.count === 0) {
      const exists = await this.prisma.warehouseItem.findFirst({ where: { id, farmerId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Yuk topilmadi');
      throw new ConflictException("Faqat hali qabul qilinmagan e'lonni bekor qilish mumkin");
    }
    return { deleted: true };
  }

  // ---------- Ro'yxatlar ----------

  async listMine(farmerId: string, q: ItemsQuery) {
    return this.page({ farmerId, ...this.itemFilters(q) }, q, 'owner');
  }

  async listAll(q: ItemsQuery) {
    return this.page(this.itemFilters(q), q, 'ops');
  }

  /** Marketlar uchun "post"lar: faqat jo'natish zonasidagi, tekshiruvdan o'tgan va mavjud miqdori bor yuklar. */
  async feed(q: FeedQuery) {
    const where: Prisma.WarehouseItemWhereInput = {
      zone: WarehouseZone.OUTBOUND,
      status: WarehouseItemStatus.ACTIVE,
      weightKg: { gt: this.prisma.warehouseItem.fields.reservedKg }, // mavjud = qoldiq - zaxira > 0
      ...(q.category && { category: q.category }),
      ...(q.storageType && { storageType: q.storageType }),
      ...(q.q && {
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { farmer: { farmName: { contains: q.q, mode: 'insensitive' } } },
        ],
      }),
    };
    return this.page(where, q, 'market');
  }

  async getOne(user: Actor, id: string) {
    const row = await this.prisma.warehouseItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
    const staff = this.isStaff(user);
    const own = user.role === Role.FARMER && row?.farmerId === user.farmer?.id;
    const marketVisible = user.role === Role.MARKET && row?.zone === WarehouseZone.OUTBOUND && row?.status === WarehouseItemStatus.ACTIVE;
    if (!row || !(staff || own || marketVisible)) throw new NotFoundException('Yuk topilmadi');

    const viewer = staff ? 'ops' : own ? 'owner' : 'market';
    const shaped = shapeItem(row, viewer);
    if (viewer === 'market') return shaped;
    const movements = await this.prisma.stockMovement.findMany({
      where: { itemId: id }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, type: true, deltaKg: true, fromZone: true, toZone: true, note: true, createdAt: true },
    });
    return { ...shaped, movements };
  }

  /** Shtrix-kod yoki RFID bo'yicha topish (skaner). */
  async scan(code: string) {
    const c = code.trim();
    if (!c || c.length > 80) throw new BadRequestException('Kod noto\'g\'ri');
    const row = await this.prisma.warehouseItem.findFirst({
      where: { OR: [{ code: c.toUpperCase() }, { rfidTag: c }] }, include: ITEM_INCLUDE,
    });
    if (!row) throw new NotFoundException('Bu kod bo\'yicha yuk topilmadi');
    return shapeItem(row, 'ops');
  }

  // ---------- 1) Qabul qilish zonasi ----------

  /** Yuk keldi: o'lchanadi, shtrix-kod beriladi (ixtiyoriy RFID). ANNOUNCED -> RECEIVED */
  async receive(actorId: string, id: string, dto: ReceiveDto) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const now = new Date();
          const claimed = await tx.warehouseItem.updateMany({
            where: { id, status: WarehouseItemStatus.ANNOUNCED },
            data: {
              status: WarehouseItemStatus.RECEIVED, zone: WarehouseZone.INBOUND, code: this.newCode(now),
              rfidTag: dto.rfidTag ?? null, receivedWeightKg: dto.measuredWeightKg, weightKg: dto.measuredWeightKg, receivedAt: now,
            },
          });
          if (claimed.count === 0) await this.explainMissing(tx, id, 'Bu yuk allaqachon qabul qilingan');
          await tx.stockMovement.create({
            data: { itemId: id, type: StockMovementType.RECEIVE, deltaKg: dto.measuredWeightKg, toZone: WarehouseZone.INBOUND, actorId, note: 'Qabul qilindi va tortildi' },
          });
        });
        return this.reload(id, 'ops');
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          if (String(e.meta?.target ?? '').includes('rfidTag')) throw new ConflictException('Bu RFID teg boshqa yukka biriktirilgan');
          continue; // shtrix-kod to'qnashuvi (juda kam): yangisini yaratib qayta urinamiz
        }
        throw e;
      }
    }
    throw new ConflictException('Shtrix-kod yaratib bo\'lmadi, qayta urinib ko\'ring');
  }

  /** Sifat tekshiruvi (Inspection): RECEIVED -> ACTIVE (baho bilan) yoki REJECTED */
  async inspect(actorId: string, id: string, dto: InspectDto) {
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.warehouseItem.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Yuk topilmadi');
      if (item.status !== WarehouseItemStatus.RECEIVED) {
        throw new ConflictException(item.status === WarehouseItemStatus.ANNOUNCED ? 'Yuk hali qabul qilinmagan' : 'Bu yuk allaqachon tekshirilgan');
      }
      const weight = item.weightKg;
      const rejected = dto.accept ? D(dto.rejectedKg ?? 0) : weight;
      if (rejected.gt(weight)) throw new BadRequestException("Yaroqsiz miqdor yuk og'irligidan ko'p bo'lishi mumkin emas");
      const fullyRejected = !dto.accept || rejected.eq(weight);
      if (dto.accept && !dto.grade && !fullyRejected) throw new BadRequestException('Sifat bahosini (A/B/C) tanlang');

      const left = weight.sub(rejected);
      const claimed = await tx.warehouseItem.updateMany({
        where: { id, status: WarehouseItemStatus.RECEIVED },
        data: {
          status: fullyRejected ? WarehouseItemStatus.REJECTED : WarehouseItemStatus.ACTIVE,
          grade: fullyRejected ? null : dto.grade, inspectionNotes: dto.notes || null, inspectedAt: new Date(),
          weightKg: left, rejectedKg: item.rejectedKg.add(rejected),
        },
      });
      if (claimed.count === 0) throw new ConflictException('Bu yuk allaqachon tekshirilgan');
      if (rejected.gt(0)) {
        await tx.stockMovement.create({
          data: { itemId: id, type: StockMovementType.INSPECT_REJECT, deltaKg: rejected.neg(), fromZone: WarehouseZone.INBOUND, actorId, note: dto.notes || 'Sifat tekshiruvidan o\'tmadi' },
        });
      }
    });
    return this.reload(id, 'ops');
  }

  // ---------- 2) Saqlash / 3) Saralash / 4) Jo'natish zonalari: zonalar orasida ko'chirish ----------

  async move(actorId: string, id: string, dto: MoveDto) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "WarehouseItem" WHERE id = ${id} FOR UPDATE`;
      const item = await tx.warehouseItem.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Yuk topilmadi');
      if (item.status !== WarehouseItemStatus.ACTIVE) {
        throw new ConflictException('Faqat sifat tekshiruvidan o\'tgan yukni zonalar orasida ko\'chirish mumkin');
      }
      if (!canMove(item.zone, dto.zone)) {
        throw new ConflictException(`"${item.zone}" zonasidan "${dto.zone}" zonasiga o'tib bo'lmaydi`);
      }
      if (item.zone === WarehouseZone.OUTBOUND && item.reservedKg.gt(0)) {
        throw new ConflictException("Buyurtmalar uchun zaxiralangan yukni jo'natish zonasidan chiqarib bo'lmaydi");
      }

      // Qaysi kamerada qoladi
      let unitId: string | null = null;
      if (dto.zone === WarehouseZone.STORAGE) {
        if (!dto.unitId) throw new BadRequestException('Saqlash uchun kamera/omborni tanlang (unitId)');
        unitId = dto.unitId;
      } else if (dto.zone === WarehouseZone.OUTBOUND) {
        unitId = dto.unitId ?? item.unitId; // saqlashdan kelgan yuk o'z kamerasida turadi
      }

      let expiresAt = item.expiresAt;
      if (unitId) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}))`;
        const unit = await tx.storageUnit.findUnique({ where: { id: unitId } });
        if (!unit) throw new NotFoundException('Kamera/ombor topilmadi');
        if (!isStorageAcceptable(item.storageType, unit.type) && !dto.override) {
          throw new ConflictException(
            `Bu mahsulot uchun "${item.storageType}" turidagi joy kerak, "${unit.name}" (${unit.type}) mos emas. Majburan joylash uchun override: true yuboring`,
          );
        }
        const used = await tx.warehouseItem.aggregate({
          _sum: { weightKg: true }, where: { unitId, id: { not: id }, status: WarehouseItemStatus.ACTIVE },
        });
        if ((used._sum.weightKg ?? D(0)).add(item.weightKg).gt(unit.capacityKg)) {
          throw new ConflictException(`"${unit.name}" sig'imi yetmaydi (sig'im: ${unit.capacityKg} kg)`);
        }
        if (!expiresAt) expiresAt = new Date(Date.now() + shelfLifeDays(item.category, unit.type) * DAY);
      }

      const moved = await tx.warehouseItem.updateMany({
        where: { id, zone: item.zone, status: WarehouseItemStatus.ACTIVE },
        data: { zone: dto.zone, unitId, expiresAt, ...(dto.zone === WarehouseZone.STORAGE && { storedAt: new Date() }) },
      });
      if (moved.count === 0) throw new ConflictException("Yuk holati o'zgargan. Sahifani yangilang");
      await tx.stockMovement.create({
        data: { itemId: id, type: StockMovementType.MOVE, deltaKg: 0, fromZone: item.zone, toZone: dto.zone, actorId, note: dto.override ? 'Majburiy joylash (override)' : null },
      });
    });
    return this.reload(id, 'ops');
  }

  /** Saralash va qadoqlash: o'lcham sinfi, yaroqsizlarini chiqarish, supermarket talabiga qadoqlash */
  async sort(actorId: string, id: string, dto: SortDto) {
    if (dto.sizeClass === undefined && dto.rejectedKg === undefined && dto.packagingType === undefined && dto.packageWeightKg === undefined) {
      throw new BadRequestException("Kamida bitta maydonni yuboring (sizeClass, rejectedKg, packagingType, packageWeightKg)");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "WarehouseItem" WHERE id = ${id} FOR UPDATE`;
      const item = await tx.warehouseItem.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Yuk topilmadi');
      if (item.status !== WarehouseItemStatus.ACTIVE || item.zone !== WarehouseZone.SORTING) {
        throw new ConflictException('Saralash faqat "Saralash va qadoqlash" zonasidagi yuk uchun');
      }
      const waste = D(dto.rejectedKg ?? 0);
      if (waste.gt(item.weightKg.sub(item.reservedKg))) throw new BadRequestException("Yaroqsiz miqdor mavjud qoldiqdan ko'p bo'lishi mumkin emas");
      const left = item.weightKg.sub(waste);
      await tx.warehouseItem.update({
        where: { id },
        data: {
          ...(dto.sizeClass && { sizeClass: dto.sizeClass }),
          ...(dto.packagingType && { packagingType: dto.packagingType }),
          ...(dto.packageWeightKg !== undefined && { packageWeightKg: dto.packageWeightKg }),
          weightKg: left, rejectedKg: item.rejectedKg.add(waste),
          ...(left.eq(0) && { status: WarehouseItemStatus.DEPLETED }),
        },
      });
      if (waste.gt(0)) {
        await tx.stockMovement.create({
          data: { itemId: id, type: StockMovementType.SORT_WASTE, deltaKg: waste.neg(), fromZone: WarehouseZone.SORTING, actorId, note: 'Saralashda yaroqsiz deb chiqarildi' },
        });
      }
    });
    return this.reload(id, 'ops');
  }

  // ---------- Inventarizatsiya ----------

  /** Haqiqiy sanoq natijasi bo'yicha qoldiqni tuzatish; zaxiralangan miqdordan kam bo'lishi mumkin emas. */
  async count(actorId: string, id: string, dto: CountDto) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "WarehouseItem" WHERE id = ${id} FOR UPDATE`;
      const item = await tx.warehouseItem.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Yuk topilmadi');
      if (item.status !== WarehouseItemStatus.ACTIVE) throw new ConflictException('Faqat omborda turgan (faol) yuk sanaladi');
      const counted = D(dto.countedKg);
      if (counted.lt(item.reservedKg)) {
        throw new ConflictException(`Sanalgan miqdor zaxiralangan miqdordan (${item.reservedKg} kg) kam bo'lishi mumkin emas. Avval buyurtmalarni bekor qiling`);
      }
      const delta = counted.sub(item.weightKg);
      if (delta.eq(0)) return;
      await tx.warehouseItem.update({
        where: { id }, data: { weightKg: counted, ...(counted.eq(0) && { status: WarehouseItemStatus.DEPLETED }) },
      });
      await tx.stockMovement.create({
        data: { itemId: id, type: StockMovementType.ADJUST, deltaKg: delta, fromZone: item.zone, toZone: item.zone, actorId, note: dto.note || 'Inventarizatsiya tuzatishi' },
      });
    });
    return this.reload(id, 'ops');
  }

  // ---------- Rasm ----------

  async setPhoto(user: Actor, id: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Rasm faylini yuboring (file maydoni)');
    const item = await this.prisma.warehouseItem.findUnique({ where: { id }, select: { farmerId: true, photoUrl: true, status: true } });
    const own = user.role === Role.FARMER && item?.farmerId === user.farmer?.id;
    if (!item || !(own || this.isStaff(user))) throw new NotFoundException('Yuk topilmadi');
    const ext = detectImageExt(file.buffer);
    if (!ext) throw new BadRequestException('Faqat JPG, PNG yoki WEBP rasm yuklash mumkin');

    await fs.mkdir(WAREHOUSE_DIR, { recursive: true });
    const filename = `${id}-${randomBytes(6).toString('hex')}.${ext}`;
    await fs.writeFile(join(WAREHOUSE_DIR, filename), file.buffer);
    await this.prisma.warehouseItem.update({ where: { id }, data: { photoUrl: `/uploads/warehouse/${filename}` } });
    await this.removePhoto(item.photoUrl);
    return this.reload(id, this.isStaff(user) ? 'ops' : 'owner');
  }

  private async removePhoto(url?: string | null) {
    if (!url || !url.startsWith('/uploads/warehouse/')) return;
    const name = url.slice('/uploads/warehouse/'.length);
    if (name.includes('/') || name.includes('..')) return;
    await fs.rm(join(WAREHOUSE_DIR, name), { force: true });
  }

  // ---------- Kameralar va harorat nazorati ----------

  async listUnits() {
    const [units, used] = await Promise.all([
      this.prisma.storageUnit.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      this.prisma.warehouseItem.groupBy({ by: ['unitId'], _sum: { weightKg: true }, _count: true, where: { unitId: { not: null }, status: WarehouseItemStatus.ACTIVE } }),
    ]);
    const usage = new Map(used.map((u) => [u.unitId, u]));
    return units.map((u) => ({
      id: u.id, name: u.name, type: u.type, capacityKg: u.capacityKg,
      usedKg: usage.get(u.id)?._sum.weightKg ?? D(0), itemCount: usage.get(u.id)?._count ?? 0,
      target: { tempMinC: u.tempMinC, tempMaxC: u.tempMaxC, humidityMin: u.humidityMin, humidityMax: u.humidityMax },
      tempC: u.currentTempC, humidity: u.currentHumidity, readingAt: u.readingAt, status: unitStatus(u),
    }));
  }

  async createUnit(dto: CreateUnitDto) {
    const def = DEFAULT_CLIMATE[dto.type];
    const c = {
      tempMinC: dto.tempMinC ?? def.tempMinC, tempMaxC: dto.tempMaxC ?? def.tempMaxC,
      humidityMin: dto.humidityMin ?? def.humidityMin, humidityMax: dto.humidityMax ?? def.humidityMax,
    };
    if (c.tempMinC >= c.tempMaxC) throw new BadRequestException("Minimal harorat maksimaldan kichik bo'lishi kerak");
    if (c.humidityMin >= c.humidityMax) throw new BadRequestException("Minimal namlik maksimaldan kichik bo'lishi kerak");
    try {
      const u = await this.prisma.storageUnit.create({ data: { name: dto.name, type: dto.type, capacityKg: dto.capacityKg, ...c } });
      return { id: u.id, name: u.name, type: u.type };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Bu nomdagi kamera/ombor allaqachon bor');
      throw e;
    }
  }

  /** Standart 4 ta joyni yaratadi (faqat hali birorta kamera bo'lmasa). */
  async createDefaultUnits() {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('warehouse-default-units'))`;
      if ((await tx.storageUnit.count()) > 0) throw new ConflictException('Kameralar allaqachon yaratilgan');
      const defs: [string, StorageType, number][] = [
        ['Quruq ombor A', StorageType.DRY, 50_000],
        ['Sovitkich kamera 1', StorageType.COLD, 20_000],
        ['Sovitkich kamera 2', StorageType.COLD, 20_000],
        ['Ventilyatsiyali ombor', StorageType.VENTILATED, 40_000],
      ];
      await tx.storageUnit.createMany({ data: defs.map(([name, type, capacityKg]) => ({ name, type, capacityKg, ...DEFAULT_CLIMATE[type] })) });
      return { created: defs.length };
    });
  }

  /** Datchik ko'rsatkichi (haqiqiy tizimda IoT qurilma yuboradi; hozircha dispetcher kiritadi). */
  async recordReading(id: string, dto: ReadingDto) {
    const res = await this.prisma.storageUnit.updateMany({ where: { id }, data: { currentTempC: dto.tempC, currentHumidity: dto.humidity, readingAt: new Date() } });
    if (res.count === 0) throw new NotFoundException('Kamera/ombor topilmadi');
    const u = await this.prisma.storageUnit.findUniqueOrThrow({ where: { id } });
    return { id: u.id, tempC: u.currentTempC, humidity: u.currentHumidity, readingAt: u.readingAt, status: unitStatus(u) };
  }

  // ---------- Inventarizatsiya hisoboti (WMS) ----------

  async inventory() {
    const active = { status: WarehouseItemStatus.ACTIVE };
    const [byZone, byCategory, byStorage, units, expiring, pendingInbound, orders] = await Promise.all([
      this.prisma.warehouseItem.groupBy({ by: ['zone'], _sum: { weightKg: true, reservedKg: true }, _count: true, where: active }),
      this.prisma.warehouseItem.groupBy({ by: ['category'], _sum: { weightKg: true }, _count: true, where: active }),
      this.prisma.warehouseItem.groupBy({ by: ['storageType'], _sum: { weightKg: true }, _count: true, where: active }),
      this.listUnits(),
      this.prisma.warehouseItem.findMany({
        where: { ...active, expiresAt: { lte: new Date(Date.now() + 3 * DAY) } }, orderBy: { expiresAt: 'asc' }, take: 20,
        select: { id: true, code: true, name: true, weightKg: true, expiresAt: true, zone: true },
      }),
      this.prisma.warehouseItem.groupBy({ by: ['status'], _count: true, where: { status: { in: [WarehouseItemStatus.ANNOUNCED, WarehouseItemStatus.RECEIVED] } } }),
      this.prisma.warehouseOrder.groupBy({ by: ['status'], _count: true, where: { status: { in: ['PENDING', 'PICKING', 'PICKED', 'DISPATCHED'] } } }),
    ]);
    const zero = D(0);
    const sum = (rows: { _sum: { weightKg: Prisma.Decimal | null } }[]) => rows.reduce((a, r) => a.add(r._sum.weightKg ?? zero), zero);
    return {
      totalKg: sum(byZone),
      byZone: Object.values(WarehouseZone).map((z) => {
        const r = byZone.find((x) => x.zone === z);
        return { zone: z, itemCount: r?._count ?? 0, weightKg: r?._sum.weightKg ?? zero, reservedKg: r?._sum.reservedKg ?? zero };
      }),
      byCategory: byCategory.map((r) => ({ category: r.category, itemCount: r._count, weightKg: r._sum.weightKg ?? zero })),
      byStorageType: byStorage.map((r) => ({ storageType: r.storageType, itemCount: r._count, weightKg: r._sum.weightKg ?? zero })),
      units,
      alarms: units.filter((u) => u.status === 'ALARM' || u.status === 'WARN').map((u) => ({ unitId: u.id, name: u.name, status: u.status, tempC: u.tempC, humidity: u.humidity })),
      expiringSoon: expiring,
      awaiting: Object.fromEntries(pendingInbound.map((r) => [r.status, r._count])),
      openOrders: Object.fromEntries(orders.map((r) => [r.status, r._count])),
    };
  }

  // ---------- Yordamchilar ----------

  private isStaff(user: { role: Role }) {
    return user.role === Role.DISPATCHER || user.role === Role.ADMIN;
  }

  private itemFilters(q: ItemsQuery): Prisma.WarehouseItemWhereInput {
    return {
      ...(q.zone && { zone: q.zone }),
      ...(q.status && { status: q.status }),
      ...(q.q && {
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { code: { contains: q.q.toUpperCase() } },
          { farmer: { farmName: { contains: q.q, mode: 'insensitive' } } },
        ],
      }),
    };
  }

  private async page(where: Prisma.WarehouseItemWhereInput, q: { page?: number; limit?: number }, viewer: 'ops' | 'owner' | 'market') {
    const limit = q.limit ?? 12;
    const page = q.page ?? 1;
    const [total, rows] = await Promise.all([
      this.prisma.warehouseItem.count({ where }),
      this.prisma.warehouseItem.findMany({
        where, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit, include: ITEM_INCLUDE,
      }),
    ]);
    return { items: rows.map((r) => shapeItem(r, viewer)), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  private async reload(id: string, viewer: 'ops' | 'owner') {
    const row = await this.prisma.warehouseItem.findUniqueOrThrow({ where: { id }, include: ITEM_INCLUDE });
    return shapeItem(row as ItemRow, viewer);
  }

  private async explainMissing(tx: Prisma.TransactionClient, id: string, conflictMsg: string): Promise<never> {
    const exists = await tx.warehouseItem.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Yuk topilmadi');
    throw new ConflictException(conflictMsg);
  }

  private newCode(now: Date) {
    let r = '';
    for (let i = 0; i < 8; i++) r += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return formatCode(now, r);
  }
}
