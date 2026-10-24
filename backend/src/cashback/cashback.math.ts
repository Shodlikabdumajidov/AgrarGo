import { Prisma } from '@prisma/client';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** Keshbek miqdori: asos × foiz, tiyingacha PASTGA yaxlitlanadi (platforma ortiqcha to'lamasligi uchun) */
export function cashbackAmount(base: Prisma.Decimal.Value, percent: number): Prisma.Decimal {
  if (percent <= 0) return D(0);
  return D(base).mul(percent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

/**
 * Ishlatish mumkin bo'lgan keshbek: balans bilan platforma xizmat haqining maxPercent foizi orasidagi kichigi.
 * Keshbek FAQAT platformaning o'z haqini qoplaydi: fermer/Hub/kuryer ulushlari hech qachon kamaymaydi.
 */
export function maxSpendable(balance: Prisma.Decimal.Value, serviceFee: Prisma.Decimal.Value, maxPercent: number): Prisma.Decimal {
  const cap = D(serviceFee).mul(maxPercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  return Prisma.Decimal.min(D(balance).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN), cap).clamp(0, cap);
}

/**
 * Bir nechta buyurtmaga (har birining xizmat haqi `caps`) keshbekni taqsimlash: xizmat haqiga mutanosib, tiyingacha,
 * qoldiq sig'imi borlarga. Yig'indi aynan `total` (yoki sig'im yetmasa — sig'im yig'indisi); hech bir qism o'z sig'imidan oshmaydi.
 */
export function allocateCashback(total: Prisma.Decimal.Value, caps: Prisma.Decimal.Value[]): Prisma.Decimal[] {
  const capD = caps.map(D);
  const capSum = capD.reduce((a, c) => a.add(c), D(0));
  const want = Prisma.Decimal.min(D(total), capSum);
  if (want.lte(0) || capSum.lte(0)) return capD.map(() => D(0));
  const parts = capD.map((c) => want.mul(c).div(capSum).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN));
  let rest = want.sub(parts.reduce((a, p) => a.add(p), D(0)));
  for (let i = 0; i < parts.length && rest.gt(0); i++) {
    const room = capD[i].sub(parts[i]);
    const add = Prisma.Decimal.min(room, rest);
    if (add.gt(0)) { parts[i] = parts[i].add(add); rest = rest.sub(add); }
  }
  return parts;
}
