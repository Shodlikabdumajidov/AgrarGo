import { computeDeliveryFee, computeServiceFee, quote, breakdownOf, paymentBreakdown, PricingConfig } from './pricing';

const cfg: PricingConfig = { deliveryBase: 20000, deliveryPerKm: 400, deliveryPerTonKm: 150, servicePercent: 1 };

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
