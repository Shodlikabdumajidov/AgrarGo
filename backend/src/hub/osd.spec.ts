import { MASTER_QR_PATTERN, generateMasterQr, normalizeQr, osdSplit, packagingFee } from './osd';

describe('Master QR / OS&D hisob-kitoblari', () => {
  it('kod formati va noyobligi', () => {
    const set = new Set<string>();
    for (let i = 0; i < 500; i++) { const c = generateMasterQr(); expect(c).toMatch(/^MQ-[A-HJ-NP-Z2-9]{8}$/); expect(MASTER_QR_PATTERN.test(c)).toBe(true); set.add(c); }
    expect(set.size).toBe(500);
    expect(normalizeQr('  mq-ab cd2345 ')).toBe('MQ-ABCD2345');
  });

  it("50 ta qutidan 5 tasi yaroqsiz: 10% kamayadi, yig'indi saqlanadi", () => {
    expect(osdSplit(1000, 50, 5)).toEqual({ goodBoxes: 45, receivedKg: 900, damagedKg: 100 });
    expect(osdSplit(1000, 50, 0)).toEqual({ goodBoxes: 50, receivedKg: 1000, damagedKg: 0 });
  });

  it('yaxlitlashda kg yo\'qolmaydi', () => {
    for (const [kg, n, d] of [[100, 3, 1], [333.33, 7, 2], [1, 3, 2], [999.99, 11, 4]]) {
      const r = osdSplit(kg, n, d);
      expect(Math.round((r.receivedKg + r.damagedKg) * 100) / 100).toBe(kg);
      expect(r.receivedKg).toBeGreaterThan(0);
    }
  });

  it('qadoqlash narxi', () => { expect(packagingFee(200, 900)).toBe(180000); expect(packagingFee(150.5, 3)).toBe(451.5); });
});
