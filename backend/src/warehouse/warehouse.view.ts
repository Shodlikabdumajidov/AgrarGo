import { Prisma } from '@prisma/client';
import { climateStatus, DEFAULT_CLIMATE, Climate } from './warehouse.policy';

export const ITEM_INCLUDE = {
  unit: true,
  farmer: { select: { id: true, farmName: true, region: true, district: true, user: { select: { fullName: true, phone: true } } } },
} satisfies Prisma.WarehouseItemInclude;

export type ItemRow = Prisma.WarehouseItemGetPayload<{ include: typeof ITEM_INCLUDE }>;
export type ItemViewer = 'ops' | 'owner' | 'market';

type UnitRow = Prisma.StorageUnitGetPayload<object>;

export const unitClimate = (u: UnitRow): Climate => ({
  tempMinC: u.tempMinC, tempMaxC: u.tempMaxC, humidityMin: u.humidityMin, humidityMax: u.humidityMax,
});

export const unitStatus = (u: UnitRow, now = Date.now()) =>
  climateStatus(unitClimate(u), { tempC: u.currentTempC, humidity: u.currentHumidity, at: u.readingAt }, now);

/**
 * Ko'rinish qoidalari:
 *  - market: faqat jo'natishga tayyor postlar; fermer nomi va viloyati (telefon yo'q), tekshiruv izohlari va zaxira miqdori yo'q
 *  - fermer (egasi): o'z yukining to'liq holati, lekin boshqa tomonlarning aloqa ma'lumotlarisiz
 *  - dispetcher/admin: hammasi, jumladan fermer telefoni, RFID, kamera
 */
export function shapeItem(r: ItemRow, viewer: ItemViewer, now = Date.now()) {
  const target: Climate = r.unit ? unitClimate(r.unit) : DEFAULT_CLIMATE[r.storageType];
  const available = r.weightKg.sub(r.reservedKg);
  const base = {
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category,
    description: r.description,
    photoUrl: r.photoUrl,
    storageType: r.storageType,
    zone: r.zone,
    status: r.status,
    weightKg: r.weightKg,
    availableKg: available,
    pricePerKg: r.pricePerKg,
    grade: r.grade,
    sizeClass: r.sizeClass,
    packagingType: r.packagingType,
    packageWeightKg: r.packageWeightKg,
    expiresAt: r.expiresAt,
    receivedAt: r.receivedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    climate: {
      target,
      unit: r.unit
        ? {
            name: r.unit.name,
            type: r.unit.type,
            tempC: r.unit.currentTempC,
            humidity: r.unit.currentHumidity,
            readingAt: r.unit.readingAt,
            status: unitStatus(r.unit, now),
          }
        : null,
    },
    farmer: viewer === 'ops'
      ? { id: r.farmer.id, farmName: r.farmer.farmName, fullName: r.farmer.user.fullName, phone: r.farmer.user.phone, region: r.farmer.region, district: r.farmer.district }
      : { farmName: r.farmer.farmName, region: r.farmer.region },
  };
  if (viewer === 'market') {
    // Zaxiralangan miqdor boshqa xaridorlar faoliyatini oshkor qiladi: faqat mavjud miqdor ko'rinadi
    const { weightKg: _w, ...rest } = base;
    return rest;
  }
  return {
    ...base,
    declaredWeightKg: r.declaredWeightKg,
    receivedWeightKg: r.receivedWeightKg,
    reservedKg: r.reservedKg,
    rejectedKg: r.rejectedKg,
    inspectionNotes: r.inspectionNotes,
    inspectedAt: r.inspectedAt,
    ...(viewer === 'ops' ? { rfidTag: r.rfidTag, unitId: r.unitId } : {}),
  };
}
