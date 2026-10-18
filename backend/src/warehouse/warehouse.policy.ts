import { StorageType, WarehouseZone } from '@prisma/client';

// ===== Omborxona qoidalari (sof funksiyalar: bazaga bog'liq emas, alohida test qilinadi) =====

export const WAREHOUSE_CATEGORIES = ['Sabzavot', 'Meva', 'Poliz', 'Don', "Urug'lik", 'Qadoqlangan', 'Boshqa'] as const;

// Ildizmeva va piyoz-sarimsoq: sovitkichda emas, ventilyatsiyali omborda saqlanadi (nomi bo'yicha aniqlanadi)
const VENTILATED_KEYWORDS = ['kartoshka', 'картошка', 'piyoz', 'sabzi', 'lavlagi', 'sarimsoq', 'turp', 'qovoq'];

export function recommendStorage(category: string, name: string): StorageType {
  const n = name.toLowerCase();
  if (VENTILATED_KEYWORDS.some((k) => n.includes(k))) return StorageType.VENTILATED;
  switch (category) {
    case 'Poliz': return StorageType.VENTILATED;
    case 'Meva':
    case 'Sabzavot': return StorageType.COLD;
    default: return StorageType.DRY;
  }
}

/** Mahsulot talab qiladigan turdagi yoki undan "sovuqroq" joyga qo'yish mumkin; sovuq talab qiladigan mahsulotni quruq omborga qo'yib bo'lmaydi. */
export function isStorageAcceptable(required: StorageType, unitType: StorageType): boolean {
  if (required === unitType) return true;
  if (required === StorageType.VENTILATED) return unitType === StorageType.COLD;
  if (required === StorageType.DRY) return true; // quruq mahsulotni istalgan joyda saqlash mumkin (namlik talabi bo'yicha dispetcher hal qiladi)
  return false;
}

export interface Climate {
  tempMinC: number;
  tempMaxC: number;
  humidityMin: number;
  humidityMax: number;
}

export const DEFAULT_CLIMATE: Record<StorageType, Climate> = {
  DRY: { tempMinC: 5, tempMaxC: 25, humidityMin: 40, humidityMax: 65 },
  COLD: { tempMinC: 0, tempMaxC: 8, humidityMin: 85, humidityMax: 95 },
  VENTILATED: { tempMinC: 2, tempMaxC: 10, humidityMin: 80, humidityMax: 90 },
};

// Saqlash muddati (kun): sovitkichli kamera tez buziladigan mahsulot muddatini bir necha barobar uzaytiradi
const SHELF_LIFE_DAYS: Record<string, Record<StorageType, number>> = {
  Meva: { DRY: 4, COLD: 30, VENTILATED: 12 },
  Sabzavot: { DRY: 5, COLD: 21, VENTILATED: 14 },
  Poliz: { DRY: 30, COLD: 90, VENTILATED: 120 },
  Don: { DRY: 365, COLD: 365, VENTILATED: 300 },
  "Urug'lik": { DRY: 365, COLD: 540, VENTILATED: 300 },
  Qadoqlangan: { DRY: 180, COLD: 270, VENTILATED: 180 },
  Boshqa: { DRY: 30, COLD: 60, VENTILATED: 45 },
};

export function shelfLifeDays(category: string, unitType: StorageType): number {
  return (SHELF_LIFE_DAYS[category] ?? SHELF_LIFE_DAYS.Boshqa)[unitType];
}

export type ClimateStatus = 'OK' | 'WARN' | 'ALARM' | 'NO_DATA';

export const READING_STALE_MS = 30 * 60_000; // 30 daqiqadan eski ko'rsatkich ishonchsiz: datchik ishlamayapti
const TEMP_MARGIN = 2; // °C
const HUMIDITY_MARGIN = 5; // %

/** Harorat/namlik me'yorda (OK), chegaraga yaqin (WARN) yoki chegaradan chiqqan (ALARM). */
export function climateStatus(
  c: Climate,
  reading: { tempC: number | null; humidity: number | null; at: Date | null },
  now = Date.now(),
): ClimateStatus {
  if (reading.tempC === null || reading.humidity === null || !reading.at) return 'NO_DATA';
  if (now - reading.at.getTime() > READING_STALE_MS) return 'NO_DATA';
  const tDev = Math.max(c.tempMinC - reading.tempC, reading.tempC - c.tempMaxC, 0);
  const hDev = Math.max(c.humidityMin - reading.humidity, reading.humidity - c.humidityMax, 0);
  if (tDev > TEMP_MARGIN || hDev > HUMIDITY_MARGIN) return 'ALARM';
  if (tDev > 0 || hDev > 0) return 'WARN';
  return 'OK';
}

// Zonalar orasidagi ruxsat etilgan o'tishlar
const TRANSITIONS: Record<WarehouseZone, WarehouseZone[]> = {
  INBOUND: ['STORAGE', 'SORTING'],
  STORAGE: ['SORTING', 'OUTBOUND'],
  SORTING: ['STORAGE', 'OUTBOUND'],
  OUTBOUND: ['STORAGE', 'SORTING'],
};

export const canMove = (from: WarehouseZone, to: WarehouseZone) => TRANSITIONS[from].includes(to);

/** Shtrix-kod: AG-YYMMDD-XXXXXXXX (8 ta o'qilishi oson belgi; tasodifiy qism chaqiruvchi beradi). */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 0/O, 1/I/L qo'shilmagan
export function formatCode(date: Date, random8: string): string {
  const y = String(date.getUTCFullYear()).slice(2);
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `AG-${y}${m}${d}-${random8}`;
}
