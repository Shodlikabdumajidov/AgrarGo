import { findRegionNames, haversineKm, normRegion, regionCenter, routeKm } from '../trust/geo';

/** TriHaul: yuk A→B ga ketganda qaytishda bo'sh yurmaslik uchun B→C yuki va C dan A ga qaytish ("uchburchak") */
export interface TriLoad { id: string; cargoName?: string; originRegion: string; destRegion: string; weightKg: number; fee: number }
export interface TriLeg { from: string; to: string; km: number; kind: 'LOADED' | 'EMPTY'; fee: number }
export interface TriOption {
  loadId: string;
  via: string; // C
  legs: TriLeg[];
  loadedKm: number;
  emptyKm: number;
  totalKm: number;
  totalFee: number; // birinchi + ikkinchi yuk yig'indisi
  boostPercent: number; // ikkinchi yuk birinchisiga nisbatan qancha qo'shimcha daromad
  perKm: number; // jami daromad / jami km
  directPerKm: number; // faqat birinchi yuk + bo'sh qaytish bo'lganda daromad / km
  load: { id: string; cargoName: string | null; weightKg: number; originRegion: string; destRegion: string; fee: number };
}

/** B va B' bir joy hisoblanadi: bir viloyat yoki markazlari NEAR_KM ichida */
export const NEAR_KM = 80;
/** C nuqtasi uyga (A ga) B dan kamida shuncha marta yaqin bo'lishi kerak — aks holda "uchburchak" emas, oddiy aylanma yo'l */
export const HOMEWARD_RATIO = 0.7;

export function near(a: string, b: string): boolean {
  if (normRegion(a) === normRegion(b)) return true;
  const ca = regionCenter(a), cb = regionCenter(b);
  return !!ca && !!cb && haversineKm(ca[0], ca[1], cb[0], cb[1]) <= NEAR_KM;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** l1 (A→B) dan keyin l2 (B'→C) olinsa uchburchak hosil bo'ladimi; bo'lsa — hisob-kitob */
export function evaluate(l1: TriLoad, l2: TriLoad): TriOption | null {
  if (l1.id === l2.id || !(l1.fee > 0) || !(l2.fee > 0)) return null;
  const A = l1.originRegion, B = l1.destRegion, B2 = l2.originRegion, C = l2.destRegion;
  if (!near(B, B2)) return null;
  if (normRegion(C) === normRegion(A) || normRegion(C) === normRegion(B)) return null; // to'g'ridan-to'g'ri qaytish yoki joyida qolish
  const back = routeKm(C, A), direct = routeKm(B, A);
  if (!(back < direct * HOMEWARD_RATIO)) return null;
  const km1 = routeKm(A, B), empty1 = normRegion(B) === normRegion(B2) ? 0 : routeKm(B, B2), km2 = routeKm(B2, C);
  const legs: TriLeg[] = [{ from: A, to: B, km: km1, kind: 'LOADED', fee: l1.fee }];
  if (empty1 > 0) legs.push({ from: B, to: B2, km: empty1, kind: 'EMPTY', fee: 0 });
  legs.push({ from: B2, to: C, km: km2, kind: 'LOADED', fee: l2.fee }, { from: C, to: A, km: back, kind: 'EMPTY', fee: 0 });
  const loadedKm = km1 + km2, emptyKm = empty1 + back, totalKm = loadedKm + emptyKm, totalFee = l1.fee + l2.fee;
  return {
    loadId: l2.id, via: C, legs, loadedKm, emptyKm, totalKm, totalFee,
    boostPercent: Math.round((l2.fee / l1.fee) * 100),
    perKm: round1(totalFee / totalKm),
    directPerKm: round1(l1.fee / (km1 + direct)),
    load: { id: l2.id, cargoName: l2.cargoName ?? null, weightKg: l2.weightKg, originRegion: l2.originRegion, destRegion: l2.destRegion, fee: l2.fee },
  };
}

/** B dan A ga to'g'ridan-to'g'ri qaytish yuki bormi */
export const hasDirectReturn = (l1: TriLoad, pool: TriLoad[]) => pool.some((o) => o.id !== l1.id && near(l1.destRegion, o.originRegion) && normRegion(o.destRegion) === normRegion(l1.originRegion));

/** Eng foydali variantlar (so'm/km bo'yicha), to'g'ridan-to'g'ri qaytish yuki bo'lsa — bo'sh */
export function triOptions(l1: TriLoad, pool: TriLoad[], capacityKg: number, limit = 3): { directReturn: boolean; options: TriOption[] } {
  if (hasDirectReturn(l1, pool)) return { directReturn: true, options: [] };
  const options = pool
    .filter((o) => o.weightKg <= capacityKg)
    .map((o) => evaluate(l1, o))
    .filter((o): o is TriOption => !!o)
    .sort((a, b) => b.perKm - a.perKm || b.totalFee - a.totalFee)
    .slice(0, limit);
  return { directReturn: false, options };
}

export { findRegionNames };
