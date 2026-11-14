import { monthKey, nextRollover } from './leaderboard.service';

describe('oylik reyting davri (Toshkent vaqti, UTC+5)', () => {
  it("oy kaliti Toshkent vaqti bo'yicha: 31-sana 19:00 UTC allaqachon keyingi oy", () => {
    expect(monthKey(new Date('2026-10-31T18:59:59Z'))).toBe('2026-10');
    expect(monthKey(new Date('2026-10-31T19:00:00Z'))).toBe('2026-11');
    expect(monthKey(new Date('2026-12-31T19:00:00Z'))).toBe('2027-01');
  });
  it("keyingi almashuv — keyingi oy 1-sanasi 00:00 Toshkent (= oldingi kun 19:00 UTC)", () => {
    expect(nextRollover(new Date('2026-10-15T10:00:00Z')).toISOString()).toBe('2026-10-31T19:00:00.000Z');
    expect(nextRollover(new Date('2026-12-31T20:00:00Z')).toISOString()).toBe('2027-01-31T19:00:00.000Z');
    expect(nextRollover(new Date('2026-02-10T00:00:00Z')).toISOString()).toBe('2026-02-28T19:00:00.000Z');
  });
});
