import { computeDeliveryFee, computeServiceFee, quote, breakdownOf, PricingConfig } from './pricing';

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
