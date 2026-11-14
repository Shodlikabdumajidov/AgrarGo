import { daySlots, hhmm, isDateStr, isOnGrid, localDate, localDayStart, minuteOfDay, overlaps, parseHHMM, slotLabel } from './dock-time';

const H = { slotMinutes: 60, dockOpenMin: 360, dockCloseMin: 1200 };
const OFF = 300; // UTC+5

describe('dock-time', () => {
  it('mahalliy kun boshi va sana UTC siljishi bilan to\'g\'ri', () => {
    expect(localDayStart('2026-10-21', OFF).toISOString()).toBe('2026-10-20T19:00:00.000Z');
    expect(localDate(new Date('2026-10-20T19:30:00Z'), OFF)).toBe('2026-10-21');
    expect(localDate(new Date('2026-10-20T18:59:00Z'), OFF)).toBe('2026-10-20');
    expect(minuteOfDay(new Date('2026-10-21T05:00:00Z'), OFF)).toBe(600);
  });

  it('slotLabel: 10:00-11:00 (mahalliy)', () => {
    const s = new Date('2026-10-21T05:00:00Z');
    expect(slotLabel(s, new Date(s.getTime() + 3600_000), OFF)).toBe('10:00-11:00');
    expect(hhmm(1440)).toBe('00:00');
  });

  it('daySlots: ish vaqti ichida, qadam bo\'yicha; oxirgi slot yopilishdan oshmaydi', () => {
    const s = daySlots('2026-10-21', H, OFF);
    expect(s).toHaveLength(14); // 06:00 .. 19:00 boshlanadigan 14 ta soatlik slot
    expect(slotLabel(s[0].startsAt, s[0].endsAt, OFF)).toBe('06:00-07:00');
    const last = s[s.length - 1];
    expect(slotLabel(last.startsAt, last.endsAt, OFF)).toBe('19:00-20:00');
    expect(daySlots('2026-10-21', { slotMinutes: 45, dockOpenMin: 360, dockCloseMin: 480 }, OFF)).toHaveLength(2);
  });

  it('isOnGrid: faqat to\'r nuqtalari', () => {
    const at = (hh: number, mm = 0) => new Date(localDayStart('2026-10-21', OFF).getTime() + (hh * 60 + mm) * 60_000);
    expect(isOnGrid(at(10), H, OFF)).toBe(true);
    expect(isOnGrid(at(10, 30), H, OFF)).toBe(false);
    expect(isOnGrid(at(5), H, OFF)).toBe(false); // ochilishdan oldin
    expect(isOnGrid(at(20), H, OFF)).toBe(false); // yopilish vaqtida boshlanmaydi
    expect(isOnGrid(at(19), H, OFF)).toBe(true);
    expect(isOnGrid(new Date(at(10).getTime() + 1000), H, OFF)).toBe(false); // soniya bor
  });

  it('overlaps: chegaralar kesishmaydi', () => {
    const t = (h: number) => new Date(h * 3600_000);
    expect(overlaps(t(1), t(2), t(2), t(3))).toBe(false);
    expect(overlaps(t(1), t(3), t(2), t(4))).toBe(true);
    expect(overlaps(t(2), t(3), t(1), t(5))).toBe(true);
  });

  it('parseHHMM va isDateStr', () => {
    expect(parseHHMM('06:00')).toBe(360);
    expect(parseHHMM('24:00')).toBe(1440);
    expect(parseHHMM('25:00')).toBeNull();
    expect(parseHHMM('6:7')).toBeNull();
    expect(isDateStr('2026-02-30')).toBe(false);
    expect(isDateStr('2026-10-21')).toBe(true);
  });
});
