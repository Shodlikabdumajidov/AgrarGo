/** Viloyat markazlari (lat, lng): marshrut masofasini taxminiy hisoblash uchun (GPS bo'lmaganda ham ishlaydi) */
const CENTERS: Record<string, [number, number]> = {
  'toshkent shahri': [41.31, 69.24], 'toshkent viloyati': [41.47, 69.58], andijon: [40.78, 72.34], buxoro: [39.77, 64.42],
  "farg'ona": [40.38, 71.78], jizzax: [40.12, 67.83], namangan: [41.0, 71.67], navoiy: [40.1, 65.37], qashqadaryo: [38.86, 65.79],
  "qoraqalpog'iston": [42.46, 59.61], samarqand: [39.65, 66.96], sirdaryo: [40.49, 68.78], surxondaryo: [37.22, 67.28], xorazm: [41.55, 60.63],
};
export const normRegion = (r: string) => r.trim().toLowerCase().replace(/[‘’`ʻʼ]/g, "'");
const rad = (d: number) => (d * Math.PI) / 180;

/** Ikki viloyat markazi orasidagi taxminiy yo'l masofasi (km): to'g'ri chiziq x 1.25. Bir viloyat ichida 40 km, noma'lum bo'lsa 100 km. */
export function routeKm(from: string, to: string): number {
  const a = CENTERS[normRegion(from)], b = CENTERS[normRegion(to)];
  if (normRegion(from) === normRegion(to)) return 40;
  if (!a || !b) return 100;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 1.25);
}

/** Viloyat markazi [lat, lng]; noma'lum bo'lsa null */
export const regionCenter = (region: string): [number, number] | null => CENTERS[normRegion(region)] ?? null;
/** Matn ichidan viloyat nomini topadi ("Samarqand sh." -> samarqand markazi) */
export function findRegionCenter(...texts: (string | null | undefined)[]): [number, number] | null {
  for (const t of texts) {
    if (!t) continue;
    const n = normRegion(t);
    for (const [name, c] of Object.entries(CENTERS)) if (n.includes(name.replace(/ shahri| viloyati/g, ''))) return c;
  }
  return null;
}
/** Koordinatani gridga yaxlitlash: aniq joy sizib chiqmasin (step=0.05 ~ 5 km) */
export const roundCoord = (v: number, step = 0.05) => Math.round(v / step) * step;
export const snapPoint = (lat: number, lng: number, step = 0.05): [number, number] => [Number(roundCoord(lat, step).toFixed(4)), Number(roundCoord(lng, step).toFixed(4))];

/** Ikki nuqta orasidagi to'g'ri chiziq masofasi (km), Haversine */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
export function centersSqlCase(col: string, idx: 0 | 1): string {
  const whens = Object.entries(CENTERS).map(([k, v]) => `WHEN lower(${col}) = '${k.replace(/'/g, "''")}' THEN ${v[idx]}`);
  return `CASE ${whens.join(' ')} END`;
}
