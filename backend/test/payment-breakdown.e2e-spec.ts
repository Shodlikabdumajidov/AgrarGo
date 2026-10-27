import { SimulatedPaymentProvider } from '../src/payment/provider/payment-provider';
import { PricingService } from '../src/pricing/pricing.service';
import { approve, bearer, bootApp, book, createAdmin, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

describe("To'lov tarkibi: fermer / haydovchi / xizmat haqi (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const get = (path: string, who: any) => t.http().get(path).set('Authorization', bearer(who));

  async function setup(qty = 159, price = 5600) {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http);
    const product = await createProduct(t.http, farmer, { quantityKg: 1000, pricePerKg: price });
    const bk = (await book(t.http, market, product.id, qty)).body;
    return { farmer, market, driver, bk };
  }

  it("bron: tasdiqlashdan oldin taxminiy (estimated), keyin saqlangan tarkib; total = mahsulot + yetkazish + xizmat", async () => {
    const { farmer, market, bk } = await setup();
    expect(bk.breakdown).toMatchObject({ productPrice: 890400, estimated: true, currency: 'UZS' });
    expect(bk.totalPrice).toBe('890400'); // eski maydon: faqat mahsulot
    const q = t.app.get(PricingService).quote('Samarqand', 'Toshkent shahri', 890400, 159);
    expect(bk.breakdown.deliveryFee).toBe(q.deliveryFee.toNumber());
    expect(bk.breakdown.serviceFee).toBe(q.serviceFee.toNumber());
    expect(bk.breakdown.totalPrice).toBe(890400 + q.deliveryFee.toNumber() + q.serviceFee.toNumber());
    expect(bk.breakdown.deliveryFee % 1000).toBe(0);
    await approve(t.http, farmer, bk.id);
    const mine = (await get('/bookings/mine', market)).body[0];
    expect(mine.breakdown).toMatchObject({ estimated: false, productPrice: 890400, deliveryFee: q.deliveryFee.toNumber(), serviceFee: q.serviceFee.toNumber(), distanceKm: q.distanceKm });
    const inc = (await get('/bookings/incoming', farmer)).body[0];
    expect(inc.breakdown.totalPrice).toBe(mine.breakdown.totalPrice);
  });

  it("to'lovlar: market/fermer/admin ko'radi (productPrice, deliveryFee, serviceFee, totalPrice, ulushlar); DB'da saqlangan", async () => {
    const { farmer, market, bk } = await setup();
    await approve(t.http, farmer, bk.id);
    const row = await t.prisma.payment.findUniqueOrThrow({ where: { bookingId: bk.id } });
    expect(row.amount.toNumber()).toBe(890400); // amount = mahsulot (eski ma'no saqlangan)
    expect(row.deliveryFee.toNumber()).toBeGreaterThan(0);
    expect(row.serviceFee.toNumber()).toBeGreaterThan(0);
    const admin = await createAdmin(t);
    for (const who of [market, farmer, admin]) {
      const p = (await get('/payments', who)).body[0];
      expect(p).toMatchObject({ productPrice: 890400, deliveryFee: row.deliveryFee.toNumber(), serviceFee: row.serviceFee.toNumber(), amount: '890400' });
      expect(p.totalPrice).toBe(890400 + p.deliveryFee + p.serviceFee);
      expect(p.breakdown).toMatchObject({ farmerShare: 890400, driverShare: p.deliveryFee, platformShare: p.serviceFee, totalPrice: p.totalPrice });
    }
  });

  it("yuk: haydovchi faqat yo'l haqi va masofani ko'radi (mahsulot summasi yashirin); fermer/market to'liq taqsimot", async () => {
    const { farmer, market, driver, bk } = await setup();
    await approve(t.http, farmer, bk.id);
    const open = (await get('/shipments/available', driver)).body[0];
    expect(Object.keys(open.price).sort()).toEqual(['currency', 'deliveryFee', 'distanceKm', 'formula']);
    expect(open.price.deliveryFee).toBeGreaterThan(0);
    const f = open.price.formula;
    expect(f.base + f.distanceCost + f.weightCost + f.adjustment).toBe(open.price.deliveryFee);
    expect(f.total).toBe(open.price.deliveryFee);
    expect(f.distanceKm).toBe(open.price.distanceKm);
    expect(JSON.stringify(open)).not.toContain('890400');
    await pay(t.http, market, bk.id); // to'lov kafolatlangach haydovchi qabul qila oladi
    await t.http().post(`/shipments/${open.id}/accept`).set('Authorization', bearer(driver));
    const own = (await get('/shipments/mine', driver)).body[0];
    expect(own.price).toEqual(open.price);
    for (const who of [farmer, market]) {
      const s = (await get('/shipments/mine', who)).body[0];
      expect(s.price).toMatchObject({ productPrice: 890400, deliveryFee: open.price.deliveryFee, driverShare: open.price.deliveryFee });
      expect(s.price.totalPrice).toBe(s.price.productPrice + s.price.deliveryFee + s.price.serviceFee);
    }
  });

  it("/pricing/estimate: market uchun formula bilan taxmin; boshqa rol 403, noto'g'ri parametr 400", async () => {
    const { farmer, market, driver } = await setup();
    const product = (await t.prisma.product.findFirst())!;
    const ok = await get(`/pricing/estimate?productId=${product.id}&quantityKg=159`, market);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ estimated: true, productPrice: 890400 });
    const f = ok.body.formula;
    expect(f.base + f.distanceCost + f.weightCost + f.adjustment).toBe(ok.body.deliveryFee);
    expect((await get(`/pricing/estimate?productId=${product.id}&quantityKg=159`, driver)).status).toBe(403);
    expect((await get(`/pricing/estimate?productId=${product.id}&quantityKg=0`, market)).status).toBe(400);
    expect((await get('/pricing/estimate?productId=00000000-0000-0000-0000-000000000000&quantityKg=5', market)).status).toBe(404);
    void farmer;
  });

  it("escrow: market jami summani to'laydi; yetkazilgach fermerga mahsulot, haydovchiga yo'l haqi; qaytarishda jami qaytariladi", async () => {
    const { farmer, market, driver, bk } = await setup();
    await approve(t.http, farmer, bk.id);
    const row = await t.prisma.payment.findUniqueOrThrow({ where: { bookingId: bk.id } });
    const total = 890400 + row.deliveryFee.toNumber() + row.serviceFee.toNumber();
    const charge = jest.spyOn(SimulatedPaymentProvider.prototype, 'charge');
    const payout = jest.spyOn(SimulatedPaymentProvider.prototype, 'payout');
    try {
      expect((await pay(t.http, market, bk.id)).status).toBe(200);
      expect(Number((charge.mock.calls as any[][])[0][0].amount)).toBe(total);
      const s = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } });
      await t.http().post(`/shipments/${s.id}/accept`).set('Authorization', bearer(driver));
      await t.http().patch(`/shipments/${s.id}/advance`).set('Authorization', bearer(driver));
      await t.http().patch(`/shipments/${s.id}/advance`).set('Authorization', bearer(driver));
      const rel = await t.http().post('/payments/release').set('Authorization', bearer(market)).send({ bookingId: bk.id });
      expect(rel.body.status).toBe('RELEASED');
      expect((payout.mock.calls as any[][]).map((c) => Number(c[0].amount))).toEqual([890400, row.deliveryFee.toNumber()]);
      expect(rel.body.events.at(-1).note).toMatch(/haydovchiga/);
    } finally { charge.mockRestore(); payout.mockRestore(); }
    // qaytarish: alohida bron
    const b2 = (await book(t.http, market, (await t.prisma.product.findFirstOrThrow()).id, 10)).body;
    await approve(t.http, farmer, b2.id);
    await pay(t.http, market, b2.id);
    const refund = jest.spyOn(SimulatedPaymentProvider.prototype, 'refund');
    try {
      expect((await t.http().post('/payments/refund').set('Authorization', bearer(market)).send({ bookingId: b2.id })).status).toBe(200);
      const p2 = await t.prisma.payment.findUniqueOrThrow({ where: { bookingId: b2.id } });
      expect(Number((refund.mock.calls as any[][])[0][0].amount)).toBe(p2.amount.toNumber() + p2.deliveryFee.toNumber() + p2.serviceFee.toNumber());
    } finally { refund.mockRestore(); }
  });

  it("obuna to'lovi: breakdown to'liq platformaga (serviceFee)", async () => {
    const farmer = await registerFarmer(t.http);
    await t.http().post('/subscription/pay').set('Authorization', bearer(farmer)).send({ months: 1 });
    const h = (await get('/subscription/history', farmer)).body[0];
    expect(h.breakdown).toEqual({ productPrice: 0, deliveryFee: 0, serviceFee: 49000, totalPrice: 49000, currency: 'UZS' });
  });

  it("sozlanadigan tariflar: SERVICE_FEE_PERCENT=0 da xizmat haqi 0", async () => {
    const t2 = await bootApp({ SERVICE_FEE_PERCENT: '0', DELIVERY_BASE_FEE: '50000' });
    try {
      await resetDb(t2.prisma);
      const farmer = await registerFarmer(t2.http), market = await registerMarket(t2.http);
      const p = await createProduct(t2.http, farmer, { quantityKg: 100, pricePerKg: 1000 });
      const b = (await book(t2.http, market, p.id, 10)).body;
      expect(b.breakdown.serviceFee).toBe(0);
      expect(b.breakdown.deliveryFee).toBeGreaterThanOrEqual(50000);
    } finally { await t2.close(); }
  });
});
