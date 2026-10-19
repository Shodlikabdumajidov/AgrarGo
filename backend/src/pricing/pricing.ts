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

/** Xizmat haqi: (mahsulot + yetkazib berish)ning foizi, 100 so'mgacha yaxlitlanadi. */
export function computeServiceFee(cfg: PricingConfig, product: Prisma.Decimal.Value, delivery: Prisma.Decimal.Value): Prisma.Decimal {
  return D(product).add(delivery).mul(cfg.servicePercent).div(100).div(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).mul(100);
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
