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
