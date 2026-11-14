import { Prisma } from '@prisma/client';
import { routeKm } from '../trust/geo';

export interface PricingConfig {
  /** Yetkazib berishning boshlang'ich (qat'iy) haqi, so'm */
  deliveryBase: number;
  /** Har km uchun, so'm */
  deliveryPerKm: number;
  /** Har tonna x km uchun qo'shimcha (og'ir yuk qimmatroq), so'm */
  deliveryPerTonKm: number;
  /** Platforma xizmat haqi: (mahsulot + yetkazib berish) summasining foizi */
  servicePercent: number;
  /** Xizmat haqining yuqori chegarasi, so'm (bitim summasi qancha katta bo'lmasin, komissiya shundan oshmaydi). Berilmasa — cheklovsiz */
  serviceCap?: number;
}

/** To'lov tarkibi: mijozdan summa qabul qilinmaydi, hammasi serverda hisoblanadi. */
export interface PaymentBreakdown {
  /** Fermerga tegishli mahsulot summasi (miqdor x narx) */
  productPrice: number;
  /** Haydovchiga tegishli yetkazib berish haqi */
  deliveryFee: number;
  /** Platforma xizmat haqi (komissiya) */
  serviceFee: number;
  /** Market to'laydigan umumiy summa = productPrice + deliveryFee + serviceFee */
  totalPrice: number;
  currency: string;
  distanceKm: number;
}

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const roundUp = (v: Prisma.Decimal, step: number) => v.div(step).ceil().mul(step);

/** Yetkazib berish haqi: boshlang'ich + km x tarif + tonna x km x tarif; 1000 so'mgacha yuqoriga yaxlitlanadi. */
export function computeDeliveryFee(cfg: PricingConfig, km: number, weightKg: Prisma.Decimal.Value): Prisma.Decimal {
  const tons = D(weightKg).div(1000);
  const raw = D(cfg.deliveryBase).add(D(cfg.deliveryPerKm).mul(km)).add(tons.mul(km).mul(cfg.deliveryPerTonKm));
  return roundUp(raw, 1000);
}

/**
 * Xizmat haqi (faqat xaridordan; fermerdan komissiya 0%): (mahsulot + yetkazib berish)ning foizi, 100 so'mgacha yaxlitlanadi
 * va `serviceCap` (standart 300 000 so'm) dan oshmaydi.
 */
export function computeServiceFee(cfg: PricingConfig, product: Prisma.Decimal.Value, delivery: Prisma.Decimal.Value): Prisma.Decimal {
  const fee = D(product).add(delivery).mul(cfg.servicePercent).div(100).div(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).mul(100);
  return cfg.serviceCap !== undefined ? Prisma.Decimal.min(fee, D(cfg.serviceCap)) : fee;
}

// ---------- Yo'l haqi kalkulyatori: yoqilg'i va yuk turi bo'yicha tavsiya etilgan narx oralig'i ----------

export const FUEL_TYPES = ['METHANE', 'PROPANE', 'DIESEL'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];
/** Yoqilg'i turi koeffitsienti: metan eng arzon, dizel eng qimmat (standart — propan x1.0) */
export const FUEL_FACTOR: Record<FuelType, number> = { METHANE: 0.9, PROPANE: 1.0, DIESEL: 1.1 };

export const CARGO_CLASSES = ['STANDARD', 'FRAGILE', 'REFRIGERATED'] as const;
export type CargoClass = (typeof CARGO_CLASSES)[number];
/** Yuk turi koeffitsienti: standart x1.0, nozik x1.15, refrijerator x1.30 */
export const CARGO_FACTOR: Record<CargoClass, number> = { STANDARD: 1.0, FRAGILE: 1.15, REFRIGERATED: 1.3 };

/** Haydovchi taklifi tavsiya narxdan qancha farq qilishi mumkin (tavsiya oralig'i: ±10%) */
export const RANGE_SPREAD = 0.1;

export interface RoadFeeRange { baseFee: number; fuelFactor: number; cargoFactor: number; recommended: number; min: number; max: number }

/** Tavsiya etilgan narx = baza yo'l haqi x yoqilg'i x yuk koeffitsienti (1000 so'mgacha yaxlitlanadi); oraliq: ±10% */
export function recommendedRange(baseFee: Prisma.Decimal.Value, fuel: FuelType = 'PROPANE', cargo: CargoClass = 'STANDARD'): RoadFeeRange {
  const base = D(baseFee);
  const fuelFactor = FUEL_FACTOR[fuel], cargoFactor = CARGO_FACTOR[cargo];
  const rec = roundUp(base.mul(fuelFactor).mul(cargoFactor), 1000);
  const min = rec.mul(1 - RANGE_SPREAD).div(1000).floor().mul(1000);
  const max = roundUp(rec.mul(1 + RANGE_SPREAD), 1000);
  return { baseFee: base.toNumber(), fuelFactor, cargoFactor, recommended: rec.toNumber(), min: min.toNumber(), max: max.toNumber() };
}

export interface Quote { productPrice: Prisma.Decimal; deliveryFee: Prisma.Decimal; serviceFee: Prisma.Decimal; distanceKm: number }

export function quote(cfg: PricingConfig, originRegion: string, destRegion: string, productPrice: Prisma.Decimal.Value, weightKg: Prisma.Decimal.Value): Quote {
  const distanceKm = routeKm(originRegion, destRegion);
  const deliveryFee = computeDeliveryFee(cfg, distanceKm, weightKg);
  return { productPrice: D(productPrice), deliveryFee, serviceFee: computeServiceFee(cfg, productPrice, deliveryFee), distanceKm };
}

/** Saqlangan (yoki hisoblangan) qiymatlardan javob tarkibi */
export function breakdownOf(row: { productPrice: Prisma.Decimal.Value; deliveryFee: Prisma.Decimal.Value; serviceFee: Prisma.Decimal.Value; distanceKm: number; currency?: string }): PaymentBreakdown {
  const productPrice = Number(row.productPrice), deliveryFee = Number(row.deliveryFee), serviceFee = Number(row.serviceFee);
  return { productPrice, deliveryFee, serviceFee, totalPrice: productPrice + deliveryFee + serviceFee, currency: row.currency ?? 'UZS', distanceKm: row.distanceKm };
}

/**
 * To'lov tarkibi (Incoterms): FERMER yetkazishni to'lasa Payment.amount = mahsulot narxi - yo'l haqi (fermer oladigan sof summa),
 * market jami = amount + deliveryFee + serviceFee o'zgarmaydi. Ko'rsatishda mahsulot narxi (gross) qaytariladi va yo'l haqi "fermer hisobidan" deb belgilanadi.
 */
export function paymentBreakdown(row: { productPrice: Prisma.Decimal.Value; deliveryFee: Prisma.Decimal.Value; serviceFee: Prisma.Decimal.Value; distanceKm: number; currency?: string; deliveryPayer?: 'BUYER' | 'FARMER' | null }) {
  const b = breakdownOf(row);
  if (row.deliveryPayer !== 'FARMER') return { ...b, deliveryPayer: 'BUYER' as const };
  return { ...b, productPrice: b.productPrice + b.deliveryFee, farmerNet: b.productPrice, deliveryPayer: 'FARMER' as const };
}

/** Yetkazib berish haqi qanday hisoblangani (foydalanuvchiga tushuntirish uchun): baza + masofa + og'irlik (+ yaxlitlash) */
export interface DeliveryFormula {
  base: number;
  perKm: number; distanceKm: number; distanceCost: number;
  perTonKm: number; weightTons: number; weightCost: number;
  /** Yaxlitlash yoki tarif o'zgarishi hisobiga farq (saqlangan haq bilan nazariy yig'indi orasida) */
  adjustment: number;
  total: number;
}

export function deliveryFormula(cfg: PricingConfig, km: number, weightKg: Prisma.Decimal.Value, storedFee?: Prisma.Decimal.Value): DeliveryFormula {
  const tons = D(weightKg).div(1000);
  const distanceCost = Math.round(D(cfg.deliveryPerKm).mul(km).toNumber());
  const weightCost = Math.round(tons.mul(km).mul(cfg.deliveryPerTonKm).toNumber());
  const total = storedFee !== undefined ? Number(storedFee) : computeDeliveryFee(cfg, km, weightKg).toNumber();
  return {
    base: cfg.deliveryBase, perKm: cfg.deliveryPerKm, distanceKm: km, distanceCost,
    perTonKm: cfg.deliveryPerTonKm, weightTons: Math.round(tons.toNumber() * 1000) / 1000, weightCost,
    adjustment: total - (cfg.deliveryBase + distanceCost + weightCost), total,
  };
}
