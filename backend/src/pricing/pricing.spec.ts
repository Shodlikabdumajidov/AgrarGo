import { CARGO_FACTOR, FUEL_FACTOR, computeDeliveryFee, computeServiceFee, quote, breakdownOf, paymentBreakdown, recommendedRange, PricingConfig } from './pricing';

const cfg: PricingConfig = { deliveryBase: 20000, deliveryPerKm: 400, deliveryPerTonKm: 150, servicePercent: 1 };

describe('xizmat haqi: faqat xaridordan 1.5%, maksimal 300 000 so\'m (cap)', () => {
  const c: PricingConfig = { ...cfg, servicePercent: 1.5, serviceCap: 300_000 };
  it("1.5% (100 so'mga yaxlitlanadi)", () => {
    expect(computeServiceFee(c, 890_400, 120_000).toNumber()).toBe(15_200); // 1 010 400 x 1.5% = 15 156 -> 15 200
  });
  it("bitim summasi qancha katta bo'lmasin, komissiya 300 000 dan oshmaydi", () => {
    expect(computeServiceFee(c, 100_000_000, 500_000).toNumber()).toBe(300_000); // 1.5% = 1 507 500 -> cap
    expect(computeServiceFee(c, 20_000_000, 0).toNumber()).toBe(300_000); // aynan chegarada
    expect(computeServiceFee(c, 19_000_000, 0).toNumber()).toBe(285_000); // chegaradan past: cap ta'sir qilmaydi
    expect(computeServiceFee(c, 5_000_000_000, 0).toNumber()).toBe(300_000);
  });
  it("cap berilmasa — cheklovsiz; 0% da 0", () => {
    expect(computeServiceFee({ ...cfg, servicePercent: 1.5 }, 100_000_000, 0).toNumber()).toBe(1_500_000);
    expect(computeServiceFee({ ...c, servicePercent: 0 }, 100_000_000, 0).toNumber()).toBe(0);
  });
});

describe('yo\'l haqi kalkulyatori: yoqilg\'i va yuk turi bo\'yicha tavsiya oralig\'i', () => {
  it("koeffitsientlar: yuk — standart x1.0, nozik x1.15, refrijerator x1.30; yoqilg'i — metan < propan < dizel", () => {
    expect(CARGO_FACTOR).toEqual({ STANDARD: 1.0, FRAGILE: 1.15, REFRIGERATED: 1.3 });
    expect(FUEL_FACTOR.METHANE).toBeLessThan(FUEL_FACTOR.PROPANE);
    expect(FUEL_FACTOR.PROPANE).toBeLessThan(FUEL_FACTOR.DIESEL);
  });
  it('tavsiya narx = baza x yoqilg\'i x yuk (1000 ga yaxlitlanadi); oraliq ±10%', () => {
    const std = recommendedRange(100_000, 'PROPANE', 'STANDARD');
    expect(std).toMatchObject({ recommended: 100_000, min: 90_000, max: 110_000, fuelFactor: 1, cargoFactor: 1 });
    expect(recommendedRange(100_000, 'PROPANE', 'FRAGILE').recommended).toBe(115_000);
    expect(recommendedRange(100_000, 'PROPANE', 'REFRIGERATED').recommended).toBe(130_000);
    expect(recommendedRange(100_000, 'DIESEL', 'REFRIGERATED').recommended).toBe(143_000);
    expect(recommendedRange(100_000, 'METHANE', 'STANDARD').recommended).toBe(90_000);
    const r = recommendedRange(250_000, 'DIESEL', 'FRAGILE');
    expect(r.min).toBeLessThan(r.recommended);
    expect(r.max).toBeGreaterThan(r.recommended);
  });
});

describe('pricing', () => {
  it("yetkazib berish haqi: boshlang'ich + km + og'irlik, 1000 ga yuqoriga yaxlitlanadi", () => {
    // 100 km, 1000 kg: 20000 + 40000 + 1*100*150 = 75000
    expect(computeDeliveryFee(cfg, 100, 1000).toNumber()).toBe(75000);
    // 270 km, 159 kg: 20000 + 108000 + 0.159*270*150 = 134440 -> 135000
    expect(computeDeliveryFee(cfg, 270, 159).toNumber()).toBe(135000);
    expect(computeDeliveryFee(cfg, 0, 0).toNumber()).toBe(20000);
  });
  it("xizmat haqi: (mahsulot + yetkazish) 1%, 100 ga yaxlitlanadi; 0% da 0", () => {
    expect(computeServiceFee(cfg, 890400, 120000).toNumber()).toBe(10100);
    expect(computeServiceFee({ ...cfg, servicePercent: 0 }, 890400, 120000).toNumber()).toBe(0);
  });
  it("quote va breakdown: total = mahsulot + yetkazish + xizmat", () => {
    const q = quote(cfg, 'Samarqand', 'Toshkent shahri', 890400, 159);
    expect(q.distanceKm).toBeGreaterThan(200);
    const b = breakdownOf({ productPrice: q.productPrice, deliveryFee: q.deliveryFee, serviceFee: q.serviceFee, distanceKm: q.distanceKm });
    expect(b.totalPrice).toBe(890400 + b.deliveryFee + b.serviceFee);
    expect(b.productPrice).toBe(890400);
  });
});

describe('paymentBreakdown (Incoterms)', () => {
  const row = { productPrice: 600_000, deliveryFee: 70_000, serviceFee: 9_700, distanceKm: 300 };
  it("XARIDOR to'lasa: logistika narxga qo'shiladi (jami = mahsulot + yo'l haqi + xizmat haqi)", () => {
    const b = paymentBreakdown({ ...row, deliveryPayer: 'BUYER' });
    expect(b).toMatchObject({ deliveryPayer: 'BUYER', productPrice: 600_000, totalPrice: 679_700 });
    expect((b as any).farmerNet).toBeUndefined();
  });
  it("FERMER to'lasa: saqlangan amount — sof summa; ko'rsatishda mahsulot narxi (gross), jami o'zgarmaydi", () => {
    // gross 670 000: fermer sof 600 000 oladi, yo'l haqi 70 000 ushlanadi, market 670 000 + 9 700 to'laydi
    const b = paymentBreakdown({ ...row, deliveryPayer: 'FARMER' });
    expect(b).toMatchObject({ deliveryPayer: 'FARMER', productPrice: 670_000, farmerNet: 600_000, deliveryFee: 70_000, totalPrice: 679_700 });
  });
  it("deliveryPayer yo'q bo'lsa (eski yozuvlar) — XARIDOR", () => {
    expect(paymentBreakdown(row).deliveryPayer).toBe('BUYER');
  });
});
