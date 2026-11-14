import { evaluate, hasDirectReturn, triOptions, TriLoad } from './trihaul';

const L = (id: string, o: string, d: string, fee: number, w = 5000): TriLoad => ({ id, originRegion: o, destRegion: d, fee, weightKg: w });

describe('TriHaul algoritmi', () => {
  // A = Samarqand, B = Toshkent shahri; C = Jizzax (Toshkentdan Samarqand tomon yo'lda)
  const l1 = L('l1', 'Samarqand', 'Toshkent shahri', 500_000);

  it('B→C yuki uyga yaqin C ga olib borsa uchburchak hosil bo\'ladi va daromad yig\'indisi hisoblanadi', () => {
    const o = evaluate(l1, L('l2', 'Toshkent shahri', 'Jizzax', 200_000))!;
    expect(o).toBeTruthy();
    expect(o.via).toBe('Jizzax');
    expect(o.totalFee).toBe(700_000);
    expect(o.boostPercent).toBe(40);
    expect(o.legs.map((x) => x.kind)).toEqual(['LOADED', 'LOADED', 'EMPTY']);
    expect(o.totalKm).toBe(o.loadedKm + o.emptyKm);
    expect(o.perKm).toBeGreaterThan(o.directPerKm); // bo'sh qaytishdan foydaliroq
  });

  it("to'g'ridan-to'g'ri qaytish yuki (B→A) bo'lsa TriHaul tavsiya qilinmaydi", () => {
    const pool = [L('r', 'Toshkent shahri', 'Samarqand', 450_000), L('l2', 'Toshkent shahri', 'Jizzax', 200_000)];
    expect(hasDirectReturn(l1, pool)).toBe(true);
    expect(triOptions(l1, pool, 20000)).toEqual({ directReturn: true, options: [] });
  });

  it("noto'g'ri yuklar rad etiladi: boshqa joydan, uyga yaqinlashtirmaydigan, o'zi, sig'maydigan", () => {
    expect(evaluate(l1, L('x', 'Buxoro', 'Jizzax', 200_000))).toBeNull(); // B dan emas
    expect(evaluate(l1, L('x', 'Toshkent shahri', 'Andijon', 200_000))).toBeNull(); // uydan uzoqlashadi
    expect(evaluate(l1, L('x', 'Toshkent shahri', 'Toshkent shahri', 200_000))).toBeNull(); // joyida
    expect(evaluate(l1, l1)).toBeNull();
    expect(triOptions(l1, [L('big', 'Toshkent shahri', 'Jizzax', 200_000, 30000)], 20000).options).toHaveLength(0);
  });

  it("variantlar so'm/km bo'yicha tartiblanadi va limitlanadi", () => {
    const pool = [L('a', 'Toshkent shahri', 'Jizzax', 100_000), L('b', 'Toshkent shahri', 'Jizzax', 400_000), L('c', 'Toshkent viloyati', 'Sirdaryo', 250_000)];
    const r = triOptions(l1, pool, 20000, 2);
    expect(r.options).toHaveLength(2);
    expect(r.options[0].loadId).toBe('b');
  });
});
