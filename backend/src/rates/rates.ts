import { normRegion } from '../trust/geo';

export type RateVerdict = 'HOT' | 'FAIR' | 'LOW';
export type RateScope = 'route';

/** Narx bozor o'rtachasidan shuncha foiz yuqori bo'lsa "qaynoq", shuncha past bo'lsa "past" hisoblanadi */
export const RATE_BAND_PERCENT = 3;
/** Yo'nalish bo'yicha statistika uchun kamida shuncha yakunlangan reys kerak */
export const ROUTE_MIN_SAMPLES = 3;

export interface RouteRate { origin: string; dest: string; ratePerKm: number; samples: number }
export interface RateIndex { days: number; asOf: string; global: { ratePerKm: number; samples: number } | null; routes: RouteRate[]; tariffPerKm: number }

/** Yo'nalish kaliti: yo'nalishga bog'liq emas (Samarqand ↔ Toshkent) */
export const routeKey = (a: string, b: string) => [normRegion(a), normRegion(b)].sort().join('|');

export interface RateCompare {
  ratePerKm: number;
  avgRatePerKm: number;
  diffPercent: number;
  verdict: RateVerdict;
  scope: RateScope;
  samples: number;
  days: number;
}

export function verdictOf(diffPercent: number): RateVerdict {
  return diffPercent >= RATE_BAND_PERCENT ? 'HOT' : diffPercent <= -RATE_BAND_PERCENT ? 'LOW' : 'FAIR';
}

/** Taklif qilinayotgan stavkani (so'm/km) bozor o'rtachasi bilan solishtiradi: yo'nalish -> umumiy -> tarif zaxirasi */
export function compareRate(idx: RateIndex, ratePerKm: number, origin?: string | null, dest?: string | null): RateCompare | null {
  if (!(ratePerKm > 0)) return null;
  let avg = 0, samples = 0;
  const scope: RateScope = 'route';
  const r = origin && dest ? idx.routes.find((x) => routeKey(x.origin, x.dest) === routeKey(origin, dest)) : undefined;
  if (r && r.samples >= ROUTE_MIN_SAMPLES) { avg = r.ratePerKm; samples = r.samples; }
  // Yo'nalish ma'lumoti yetarli bo'lmasa solishtirilmaydi: umumiy o'rtacha qisqa/uzoq reyslarni noto'g'ri baholaydi (baza tarif qisqa reysda so'm/km ni oshiradi)
  else return null;
  if (!(avg > 0)) return null;
  const diffPercent = Math.round(((ratePerKm - avg) / avg) * 1000) / 10;
  return { ratePerKm: Math.round(ratePerKm), avgRatePerKm: Math.round(avg), diffPercent, verdict: verdictOf(diffPercent), scope, samples, days: idx.days };
}

/** Xom (origin, dest) juftliklarini yo'nalishsiz kalit bo'yicha birlashtiradi: o'rtacha = jami to'lov / jami km */
export function aggregateRoutes(rows: { origin: string; dest: string; fee: number; km: number; n: number }[]): { routes: RouteRate[]; global: RateIndex['global'] } {
  const m = new Map<string, { origin: string; dest: string; fee: number; km: number; n: number }>();
  let fee = 0, km = 0, n = 0;
  for (const r of rows) {
    fee += r.fee; km += r.km; n += r.n;
    const k = routeKey(r.origin, r.dest);
    const cur = m.get(k);
    if (cur) { cur.fee += r.fee; cur.km += r.km; cur.n += r.n; } else m.set(k, { ...r });
  }
  const routes = [...m.values()].filter((x) => x.km > 0).map((x) => ({ origin: x.origin, dest: x.dest, ratePerKm: Math.round(x.fee / x.km), samples: x.n })).sort((a, b) => b.samples - a.samples);
  return { routes, global: km > 0 ? { ratePerKm: Math.round(fee / km), samples: n } : null };
}
