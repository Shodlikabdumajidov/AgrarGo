import { haversineKm } from './geo';

// ELD hisob-kitob qoidalari (sozlanadigan konstantalar)
export const GAP_MS = 5 * 60_000; // bundan uzoq signalsiz oraliq "aloqa yo'q" hisoblanadi va hech qaysi vaqtga qo'shilmaydi
export const MOVING_KMH = 5; // shundan past tezlik = to'xtagan
export const STOP_MIN_MS = 3 * 60_000; // shundan qisqa to'xtash "to'xtash" deb yozilmaydi (svetofor, tirbandlik)
export const DAILY_DRIVING_LIMIT_MIN = 9 * 60; // kunlik haydash chegarasi (ogohlantirish uchun)
export const TASHKENT_OFFSET_MS = 5 * 3600_000; // O'zbekiston UTC+5, yoz/qish vaqti yo'q

export interface LogPoint {
  shipmentId: string;
  lat: number;
  lng: number;
  recordedAt: Date;
}

export interface Stop {
  shipmentId: string;
  startedAt: Date;
  endedAt: Date;
  durationMin: number;
  lat: number;
  lng: number;
}

export interface DaySummary {
  date: string; // YYYY-MM-DD (Toshkent vaqti)
  drivingMin: number;
  stoppedMin: number;
  distanceKm: number;
  maxSpeedKmh: number;
  avgMovingSpeedKmh: number;
  firstPingAt: Date | null;
  lastPingAt: Date | null;
  stops: Stop[];
  overLimit: boolean;
}

export const tashkentDate = (d: Date) => new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Nuqtalar jurnalidan kunlik harakat xulosasi. Har bir oraliq (ikki ketma-ket nuqta) boshlangan kuniga yoziladi.
 * Faqat bir yukning nuqtalari orasidagi, GAP_MS dan qisqa oraliqlar sanaladi: signal yo'qolgan davr "bilmaymiz" hisoblanadi.
 */
export function summarizeDays(points: LogPoint[]): DaySummary[] {
  const byShipment = new Map<string, LogPoint[]>();
  for (const p of points) {
    const list = byShipment.get(p.shipmentId) ?? [];
    list.push(p);
    byShipment.set(p.shipmentId, list);
  }

  const days = new Map<string, DaySummary & { movingKmSum: number; movingMsSum: number }>();
  const dayOf = (key: string, at: Date) => {
    let d = days.get(key);
    if (!d) {
      d = {
        date: key, drivingMin: 0, stoppedMin: 0, distanceKm: 0, maxSpeedKmh: 0, avgMovingSpeedKmh: 0,
        firstPingAt: null, lastPingAt: null, stops: [], overLimit: false, movingKmSum: 0, movingMsSum: 0,
      };
      days.set(key, d);
    }
    if (!d.firstPingAt || at < d.firstPingAt) d.firstPingAt = at;
    if (!d.lastPingAt || at > d.lastPingAt) d.lastPingAt = at;
    return d;
  };

  const drivingMs = new Map<string, number>();
  const stoppedMs = new Map<string, number>();

  for (const list of byShipment.values()) {
    list.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    let stopStart: LogPoint | null = null;
    let stopEnd: LogPoint | null = null;
    const closeStop = () => {
      if (stopStart && stopEnd) {
        const ms = stopEnd.recordedAt.getTime() - stopStart.recordedAt.getTime();
        if (ms >= STOP_MIN_MS) {
          dayOf(tashkentDate(stopStart.recordedAt), stopStart.recordedAt).stops.push({
            shipmentId: stopStart.shipmentId, startedAt: stopStart.recordedAt, endedAt: stopEnd.recordedAt,
            durationMin: Math.round(ms / 60_000), lat: stopStart.lat, lng: stopStart.lng,
          });
        }
      }
      stopStart = null;
      stopEnd = null;
    };

    if (list.length) dayOf(tashkentDate(list[0].recordedAt), list[0].recordedAt);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      const ms = b.recordedAt.getTime() - a.recordedAt.getTime();
      const key = tashkentDate(a.recordedAt);
      const day = dayOf(key, a.recordedAt);
      dayOf(tashkentDate(b.recordedAt), b.recordedAt);
      if (ms <= 0 || ms > GAP_MS) { closeStop(); continue; }

      const km = haversineKm(a, b);
      const kmh = km / (ms / 3_600_000);
      day.distanceKm += km;
      if (kmh >= MOVING_KMH) {
        closeStop();
        drivingMs.set(key, (drivingMs.get(key) ?? 0) + ms);
        day.movingKmSum += km;
        day.movingMsSum += ms;
        day.maxSpeedKmh = Math.max(day.maxSpeedKmh, kmh);
      } else {
        stoppedMs.set(key, (stoppedMs.get(key) ?? 0) + ms);
        if (!stopStart) stopStart = a;
        stopEnd = b;
      }
    }
    closeStop();
  }

  return [...days.values()]
    .map(({ movingKmSum, movingMsSum, ...d }) => {
      const dm = Math.round((drivingMs.get(d.date) ?? 0) / 60_000);
      return {
        ...d,
        drivingMin: dm,
        stoppedMin: Math.round((stoppedMs.get(d.date) ?? 0) / 60_000),
        distanceKm: Math.round(d.distanceKm * 10) / 10,
        maxSpeedKmh: Math.round(d.maxSpeedKmh),
        avgMovingSpeedKmh: movingMsSum ? Math.round(movingKmSum / (movingMsSum / 3_600_000)) : 0,
        stops: d.stops.sort((x, y) => x.startedAt.getTime() - y.startedAt.getTime()),
        overLimit: dm > DAILY_DRIVING_LIMIT_MIN,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // yangi kun birinchi
}
