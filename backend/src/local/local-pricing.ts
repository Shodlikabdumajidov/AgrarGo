import { Prisma } from '@prisma/client';

export interface LocalFeeConfig {
  hubPercent: number;
  hubMin: number;
  courierFee: number;
  servicePercent: number;
  serviceMin: number;
}

/**
 * Chakana buyurtma narx tarkibi. Hammasi serverda hisoblanadi; xaridor jami = mahsulot + Hub + kuryer + platforma.
 *  - mahsulot: miqdor × chakana narx — to'liq fermerga o'tadi
 *  - Hub: saqlash va qadoqlash haqi (foiz, minimum bilan), 100 so'mgacha yuqoriga yaxlitlanadi
 *  - kuryer: shahar ichi yetkazib berish (qat'iy)
 *  - platforma: komissiya (foiz, minimum bilan), 100 so'mgacha yaxlitlanadi
 */
export interface LocalQuote {
  productAmount: Prisma.Decimal;
  hubFee: Prisma.Decimal;
  courierFee: Prisma.Decimal;
  serviceFee: Prisma.Decimal;
  total: Prisma.Decimal;
}

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const roundUp100 = (v: Prisma.Decimal) => v.div(100).ceil().mul(100);

export function localQuote(cfg: LocalFeeConfig, quantityKg: Prisma.Decimal.Value, pricePerKg: Prisma.Decimal.Value): LocalQuote {
  const productAmount = D(quantityKg).mul(pricePerKg).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const hubFee = roundUp100(Prisma.Decimal.max(D(cfg.hubMin), productAmount.mul(cfg.hubPercent).div(100)));
  const courierFee = D(cfg.courierFee);
  const serviceFee = roundUp100(Prisma.Decimal.max(D(cfg.serviceMin), productAmount.mul(cfg.servicePercent).div(100)));
  return { productAmount, hubFee, courierFee, serviceFee, total: productAmount.add(hubFee).add(courierFee).add(serviceFee) };
}

/** Escrow taqsimoti: kimga qancha (yig'indi = jami) */
export function localSplits(q: LocalQuote, cashbackUsed: Prisma.Decimal.Value = 0): { party: 'FARMER' | 'HUB' | 'COURIER' | 'PLATFORM'; amount: Prisma.Decimal }[] {
  return [
    { party: 'FARMER', amount: q.productAmount },
    { party: 'HUB', amount: q.hubFee },
    { party: 'COURIER', amount: q.courierFee },
    // Keshbek faqat platforma haqini qoplaydi: uchinchi tomon ulushlari o'zgarmaydi, yig'indi = xaridordan yechilgan summa
    { party: 'PLATFORM', amount: q.serviceFee.sub(cashbackUsed) },
  ];
}

/** Topshirish kodi: 4 xonali, kuryer yetkazganda xaridordan oladi */
export function codesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Bir kuryer bitta Hub'dan bir nechta mahsulotni birga olib borsa, yetkazish haqi bitta: n ta buyurtma o'rtasida teng bo'linadi
 * (tiyinlargacha; qoldiq birinchi buyurtmalarga). Yig'indi har doim to'liq haqqa teng. Biri bekor bo'lsa, faqat o'z ulushi qaytadi.
 */
export function splitCourierFee(fee: Prisma.Decimal.Value, n: number): Prisma.Decimal[] {
  const total = D(fee);
  if (n <= 1) return [total];
  const cents = total.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  const base = cents.div(n).floor();
  const rem = cents.minus(base.mul(n)).toNumber();
  return Array.from({ length: n }, (_, i) => base.plus(i < rem ? 1 : 0).div(100));
}

/** Buyurtma narxida kuryer haqini boshqa qiymatga almashtiradi (jami qayta hisoblanadi) */
export function withCourierFee(q: LocalQuote, courierFee: Prisma.Decimal): LocalQuote {
  return { ...q, courierFee, total: q.productAmount.add(q.hubFee).add(courierFee).add(q.serviceFee) };
}
