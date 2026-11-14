export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Ikki nuqta orasidagi masofa (km), katta doira bo'yicha. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Viloyat markazlari (taxminiy). Aniq tuman geokodlash yo'q: marshrut viloyat markazlari orasida ko'rsatiladi.
const REGION_CENTERS: Record<string, LatLng> = {
  "toshkent shahri": { lat: 41.2995, lng: 69.2401 },
  "toshkent viloyati": { lat: 41.0167, lng: 69.3667 },
  "andijon": { lat: 40.7821, lng: 72.3442 },
  "buxoro": { lat: 39.7747, lng: 64.4286 },
  "farg'ona": { lat: 40.3842, lng: 71.7843 },
  "jizzax": { lat: 40.1158, lng: 67.8422 },
  "namangan": { lat: 41.0011, lng: 71.6726 },
  "navoiy": { lat: 40.0844, lng: 65.3792 },
  "qashqadaryo": { lat: 38.8606, lng: 65.7891 },
  "qoraqalpog'iston": { lat: 42.4531, lng: 59.6103 },
  "samarqand": { lat: 39.6542, lng: 66.9597 },
  "sirdaryo": { lat: 40.4897, lng: 68.7842 },
  "surxondaryo": { lat: 37.2242, lng: 67.2783 },
  "xorazm": { lat: 41.55, lng: 60.6333 },
};

const normalizeRegion = (name: string) => name.trim().toLowerCase().replace(/[ʻʼ’‘`´]/g, "'");

/** Viloyat nomi bo'yicha markaz; topilmasa null (xaritada marshrut chizilmaydi). */
export function regionCenter(name: string): LatLng | null {
  return REGION_CENTERS[normalizeRegion(name)] ?? null;
}
