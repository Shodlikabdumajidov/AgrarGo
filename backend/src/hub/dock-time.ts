// Rampa vaqti hisob-kitoblari (toza funksiyalar). Hub mahalliy vaqti UTC'dan qat'iy siljish bilan (O'zbekistonda yozgi vaqt yo'q).

export interface DockHours { slotMinutes: number; dockOpenMin: number; dockCloseMin: number }

const DAY_MIN = 1440;
const MIN_MS = 60_000;

export const isDateStr = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s; // 2026-02-30 kabi sanalar rad etiladi
};

/** Mahalliy kun ('YYYY-MM-DD') boshining UTC vaqti */
export function localDayStart(date: string, offsetMin: number): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - offsetMin * MIN_MS);
}

/** UTC vaqtning mahalliy sanasi 'YYYY-MM-DD' */
export function localDate(d: Date, offsetMin: number): string {
  return new Date(d.getTime() + offsetMin * MIN_MS).toISOString().slice(0, 10);
}

/** Mahalliy kun boshidan o'tgan daqiqalar (0..1439) */
export function minuteOfDay(d: Date, offsetMin: number): number {
  return (((Math.floor(d.getTime() / MIN_MS) + offsetMin) % DAY_MIN) + DAY_MIN) % DAY_MIN;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

/** "10:00-11:00" ko'rinishidagi yorliq (mahalliy vaqt) */
export function slotLabel(startsAt: Date, endsAt: Date, offsetMin: number): string {
  const s = minuteOfDay(startsAt, offsetMin);
  const e = s + Math.round((endsAt.getTime() - startsAt.getTime()) / MIN_MS);
  return `${hhmm(s)}-${hhmm(e)}`;
}

/** Berilgan kunning barcha slotlari (ish vaqti ichida, qadam = slotMinutes) */
export function daySlots(date: string, h: DockHours, offsetMin: number): { startsAt: Date; endsAt: Date }[] {
  const base = localDayStart(date, offsetMin).getTime();
  const out: { startsAt: Date; endsAt: Date }[] = [];
  for (let m = h.dockOpenMin; m + h.slotMinutes <= h.dockCloseMin; m += h.slotMinutes) {
    out.push({ startsAt: new Date(base + m * MIN_MS), endsAt: new Date(base + (m + h.slotMinutes) * MIN_MS) });
  }
  return out;
}

/** Boshlanish vaqti slot to'riga to'g'ri keladimi (ish vaqti ichida, qadam bo'yicha, soniyasiz) */
export function isOnGrid(startsAt: Date, h: DockHours, offsetMin: number): boolean {
  if (startsAt.getTime() % MIN_MS !== 0) return false;
  const m = minuteOfDay(startsAt, offsetMin);
  return m >= h.dockOpenMin && m + h.slotMinutes <= h.dockCloseMin && (m - h.dockOpenMin) % h.slotMinutes === 0;
}

/** Ikki vaqt oralig'i kesishadimi (chegaralar kesishmaydi: [a1,a2) va [b1,b2)) */
export const overlaps = (a1: Date, a2: Date, b1: Date, b2: Date) => a1 < b2 && b1 < a2;

/** "HH:MM" -> daqiqa (xato bo'lsa null) */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h <= 24 && mi < 60 && h * 60 + mi <= DAY_MIN ? h * 60 + mi : null;
}
