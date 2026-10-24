import { summarizeDays, tashkentDate, LogPoint, DAILY_DRIVING_LIMIT_MIN } from './eld';
import { haversineKm, regionCenter } from './geo';

describe('geo', () => {
  it('Toshkent–Samarqand masofasi ~270 km (to\'g\'ri chiziq)', () => {
    const km = haversineKm(regionCenter('Toshkent shahri')!, regionCenter('Samarqand')!);
    expect(km).toBeGreaterThan(260);
    expect(km).toBeLessThan(285);
  });

  it('nol masofa; simmetriya', () => {
    const a = { lat: 41, lng: 69 };
    const b = { lat: 40, lng: 68 };
    expect(haversineKm(a, a)).toBe(0);
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });

  it("viloyat nomi harf kattaligi va apostrof turiga bog'liq emas; noma'lum viloyat null", () => {
    expect(regionCenter("FARG‘ONA")).toEqual(regionCenter("farg'ona"));
    expect(regionCenter("Qoraqalpog`iston")).not.toBeNull();
    expect(regionCenter('Atlantida')).toBeNull();
  });

  it('14 ta viloyatning hammasi topiladi', () => {
    const names = ['Toshkent shahri', 'Toshkent viloyati', 'Andijon', 'Buxoro', "Farg'ona", 'Jizzax', 'Namangan', 'Navoiy',
      'Qashqadaryo', "Qoraqalpog'iston", 'Samarqand', 'Sirdaryo', 'Surxondaryo', 'Xorazm'];
    for (const n of names) expect(regionCenter(n)).not.toBeNull();
  });
});

describe('ELD', () => {
  // 2026-06-10 08:00 Toshkent = 03:00 UTC
  const T0 = Date.UTC(2026, 5, 10, 3, 0, 0);
  const pt = (minute: number, lat: number, lng = 69, shipmentId = 's1'): LogPoint => ({
    shipmentId, lat, lng, recordedAt: new Date(T0 + minute * 60_000),
  });

  it('Toshkent sanasi: UTC 20:00 allaqachon ertangi kun', () => {
    expect(tashkentDate(new Date(Date.UTC(2026, 5, 10, 18, 59)))).toBe('2026-06-10');
    expect(tashkentDate(new Date(Date.UTC(2026, 5, 10, 19, 0)))).toBe('2026-06-11');
  });

  it("harakat va to'xtash vaqtlari ajratiladi; to'xtash 3 daqiqadan oshsa jurnalga yoziladi", () => {
    // 0-2 daq: ~66 km/soat (har daqiqada 0.0100 daraja ≈ 1.1 km), 2-8 daq: joyida turibdi, 8-10 daq: yana yuradi
    const pts = [
      pt(0, 41.00), pt(1, 41.01), pt(2, 41.02),
      pt(3, 41.02), pt(4, 41.02), pt(5, 41.02), pt(6, 41.02), pt(7, 41.02), pt(8, 41.02),
      pt(9, 41.03), pt(10, 41.04),
    ];
    const [day] = summarizeDays(pts);
    expect(day.date).toBe('2026-06-10');
    expect(day.drivingMin).toBe(4);
    expect(day.stoppedMin).toBe(6);
    expect(day.stops).toHaveLength(1);
    expect(day.stops[0]).toMatchObject({ durationMin: 6, lat: 41.02 });
    expect(day.distanceKm).toBeGreaterThan(4);
    expect(day.maxSpeedKmh).toBeGreaterThan(60);
    expect(day.overLimit).toBe(false);
  });

  it("qisqa to'xtash (svetofor) to'xtashlar ro'yxatiga kirmaydi, lekin to'xtagan vaqtga qo'shiladi", () => {
    const [day] = summarizeDays([pt(0, 41.0), pt(1, 41.01), pt(2, 41.01), pt(3, 41.01), pt(4, 41.02)]);
    expect(day.stops).toHaveLength(0);
    expect(day.stoppedMin).toBe(2);
    expect(day.drivingMin).toBe(2);
  });

  it("5 daqiqadan uzun signalsiz oraliq hech qaysi vaqtga qo'shilmaydi va to'xtashni uzadi", () => {
    const [day] = summarizeDays([pt(0, 41.0), pt(1, 41.01), pt(30, 41.5), pt(31, 41.51)]);
    expect(day.drivingMin).toBe(2); // 0-1 va 30-31
    expect(day.stoppedMin).toBe(0);
  });

  it('turli yuklar aralashmaydi va tartibsiz kelgan nuqtalar saralanadi', () => {
    const pts = [pt(2, 41.02), pt(0, 41.0), pt(1, 41.01), pt(0, 30, 60, 's2'), pt(1, 30.01, 60, 's2')];
    const [day] = summarizeDays(pts);
    expect(day.drivingMin).toBe(3);
  });

  it('kunlar Toshkent vaqti bo\'yicha bo\'linadi (yangi kun birinchi)', () => {
    const lateMin = 16 * 60 + 58; // 23:58 Toshkent
    const days = summarizeDays([pt(0, 41.0), pt(1, 41.01), pt(lateMin, 41.0), pt(lateMin + 1, 41.01), pt(lateMin + 5, 41.02)]);
    expect(days.map((d) => d.date)).toEqual(['2026-06-11', '2026-06-10']);
  });

  it('kunlik chegaradan oshganda overLimit', () => {
    const pts: LogPoint[] = [];
    for (let m = 0; m <= DAILY_DRIVING_LIMIT_MIN + 5; m++) pts.push(pt(m, 41 + m * 0.01));
    const [day] = summarizeDays(pts);
    expect(day.drivingMin).toBeGreaterThan(DAILY_DRIVING_LIMIT_MIN);
    expect(day.overLimit).toBe(true);
  });

  it("bo'sh jurnal bo'sh natija beradi", () => {
    expect(summarizeDays([])).toEqual([]);
  });
});
