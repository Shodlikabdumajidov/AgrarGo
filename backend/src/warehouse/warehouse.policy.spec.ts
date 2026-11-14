import {
  canMove, climateStatus, DEFAULT_CLIMATE, formatCode, isStorageAcceptable, recommendStorage, shelfLifeDays,
} from './warehouse.policy';

describe('warehouse policy', () => {
  it("saqlash turi tavsiyasi: kartoshka/piyoz/sabzi ventilyatsiyali, meva-sabzavot sovitkichli, don quruq", () => {
    expect(recommendStorage('Sabzavot', 'Kartoshka (Sante)')).toBe('VENTILATED');
    expect(recommendStorage('Sabzavot', 'Qizil piyoz')).toBe('VENTILATED');
    expect(recommendStorage('Sabzavot', 'Sabzi')).toBe('VENTILATED');
    expect(recommendStorage('Sabzavot', 'Pomidor')).toBe('COLD');
    expect(recommendStorage('Meva', 'Olma')).toBe('COLD');
    expect(recommendStorage('Poliz', 'Qovun')).toBe('VENTILATED');
    expect(recommendStorage('Don', 'Bug\'doy')).toBe('DRY');
    expect(recommendStorage("Urug'lik", 'Paxta chigiti')).toBe('DRY');
  });

  it("sovuq talab qiladigan mahsulotni quruq omborga qo'yib bo'lmaydi; ventilyatsiyalini sovitkichga mumkin", () => {
    expect(isStorageAcceptable('COLD', 'DRY')).toBe(false);
    expect(isStorageAcceptable('COLD', 'VENTILATED')).toBe(false);
    expect(isStorageAcceptable('COLD', 'COLD')).toBe(true);
    expect(isStorageAcceptable('VENTILATED', 'COLD')).toBe(true);
    expect(isStorageAcceptable('VENTILATED', 'DRY')).toBe(false);
    expect(isStorageAcceptable('DRY', 'COLD')).toBe(true);
  });

  it("sovitkich saqlash muddatini uzaytiradi", () => {
    expect(shelfLifeDays('Meva', 'COLD')).toBeGreaterThan(shelfLifeDays('Meva', 'DRY') * 5);
    expect(shelfLifeDays('Noma\'lum', 'DRY')).toBe(shelfLifeDays('Boshqa', 'DRY'));
  });

  describe('climateStatus', () => {
    const now = Date.parse('2026-06-10T10:00:00Z');
    const c = DEFAULT_CLIMATE.COLD; // 0..8 °C, 85..95 %
    const at = new Date(now - 60_000);
    it('me\'yorda', () => expect(climateStatus(c, { tempC: 4, humidity: 90, at }, now)).toBe('OK'));
    it('chegara qiymatlari me\'yorda', () => {
      expect(climateStatus(c, { tempC: 8, humidity: 95, at }, now)).toBe('OK');
      expect(climateStatus(c, { tempC: 0, humidity: 85, at }, now)).toBe('OK');
    });
    it('chegaradan biroz chiqsa ogohlantirish', () => {
      expect(climateStatus(c, { tempC: 9.5, humidity: 90, at }, now)).toBe('WARN');
      expect(climateStatus(c, { tempC: 4, humidity: 82, at }, now)).toBe('WARN');
    });
    it('sezilarli chiqsa avariya', () => {
      expect(climateStatus(c, { tempC: 12, humidity: 90, at }, now)).toBe('ALARM');
      expect(climateStatus(c, { tempC: -3, humidity: 90, at }, now)).toBe('ALARM');
      expect(climateStatus(c, { tempC: 4, humidity: 60, at }, now)).toBe('ALARM');
    });
    it("ko'rsatkich yo'q yoki eskirgan bo'lsa NO_DATA", () => {
      expect(climateStatus(c, { tempC: null, humidity: null, at: null }, now)).toBe('NO_DATA');
      expect(climateStatus(c, { tempC: 4, humidity: 90, at: new Date(now - 31 * 60_000) }, now)).toBe('NO_DATA');
    });
  });

  it("zonalar orasidagi o'tishlar: qabul qilishdan to'g'ridan-to'g'ri jo'natishga o'tib bo'lmaydi", () => {
    expect(canMove('INBOUND', 'STORAGE')).toBe(true);
    expect(canMove('INBOUND', 'OUTBOUND')).toBe(false);
    expect(canMove('STORAGE', 'OUTBOUND')).toBe(true);
    expect(canMove('OUTBOUND', 'INBOUND')).toBe(false);
    expect(canMove('STORAGE', 'STORAGE')).toBe(false);
  });

  it('shtrix-kod formati', () => {
    expect(formatCode(new Date(Date.UTC(2026, 5, 9)), 'AB23CD45')).toBe('AG-260609-AB23CD45');
  });
});
