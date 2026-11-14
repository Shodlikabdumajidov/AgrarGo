import { Account, approve, bearer, book, bootApp, createAdmin, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

describe('Haydovchi narx taklifi (bidding), nizo (dispute), yo\'l haqi kalkulyatori va komissiya (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp({ PIN_ENFORCE: 'true' }); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });
  const auth = (r: any, who: Account | string) => r.set('Authorization', bearer(who));

  async function load(opts: { payer?: 'BUYER' | 'FARMER'; kg?: number; price?: number } = {}) {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http, { capacityKg: 30000 });
    const product = await createProduct(t.http, farmer, { name: 'Pomidor', category: 'Sabzavot', quantityKg: 20000, pricePerKg: opts.price ?? 3000, ...(opts.payer && { deliveryPayer: opts.payer }) });
    const bk = (await book(t.http, market, product.id, opts.kg ?? 2000)).body; await approve(t.http, farmer, bk.id); await pay(t.http, market, bk.id);
    const ship = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } });
    const payment = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: bk.id } });
    return { farmer, market, driver, bk, ship, payment };
  }

  it("komissiya: fermerdan 0%, xaridordan 1.5% (bitim summasi katta bo'lsa 300 000 so'mdan oshmaydi)", async () => {
    const small = await load({ kg: 1000, price: 3000 });
    const p1 = small.payment;
    const base1 = Number(p1.amount) + Number(p1.deliveryFee);
    expect(Number(p1.serviceFee)).toBe(Math.round((base1 * 0.015) / 100) * 100);
    expect(Number(p1.amount)).toBe(3_000_000); // fermer to'liq summani oladi
    const big = await load({ kg: 15000, price: 4000 }); // 60 000 000 so'm: 1.5% = 900 000 -> cap
    expect(Number(big.payment.serviceFee)).toBe(300_000);
    expect(Number(big.payment.amount)).toBe(60_000_000);
  });

  it("yo'l haqi kalkulyatori: yoqilg'i (metan/propan/dizel) va yuk turi (x1.0 / x1.15 / x1.30) bo'yicha tavsiya oralig'i", async () => {
    const m = await registerMarket(t.http);
    const get = (q: string) => auth(t.http().get(`/pricing/road-fee?originRegion=Samarqand&destRegion=${encodeURIComponent('Toshkent shahri')}&weightKg=5000${q}`), m);
    const std = (await get('&fuel=PROPANE&cargo=STANDARD')).body;
    expect(std).toMatchObject({ fuel: 'PROPANE', cargo: 'STANDARD', fuelFactor: 1, cargoFactor: 1 });
    expect(std.recommended).toBe(std.baseFee);
    expect(std.min).toBeLessThan(std.recommended);
    expect(std.max).toBeGreaterThan(std.recommended);
    const frag = (await get('&fuel=PROPANE&cargo=FRAGILE')).body, ref = (await get('&fuel=PROPANE&cargo=REFRIGERATED')).body;
    expect(frag.recommended).toBeGreaterThan(std.recommended);
    expect(ref.recommended).toBeGreaterThan(frag.recommended);
    expect(Math.abs(ref.recommended - std.baseFee * 1.3)).toBeLessThanOrEqual(1000);
    const met = (await get('&fuel=METHANE')).body, dsl = (await get('&fuel=DIESEL')).body;
    expect(met.recommended).toBeLessThan(std.recommended);
    expect(dsl.recommended).toBeGreaterThan(std.recommended);
    expect((await get('&fuel=COAL')).status).toBe(400);
    expect((await get('&cargo=GOLD')).status).toBe(400);
    expect((await t.http().get('/pricing/road-fee?originRegion=A&destRegion=B&weightKg=1')).status).toBe(401);
  });

  it("haydovchi narx taklif qiladi (oraliq: escrow yo'l haqining 70%..100%), yuk egasi qabul qiladi: haydovchi biriktiriladi, farq xaridorga qaytadi", async () => {
    const w = await load();
    const fee = Number(w.payment.deliveryFee);
    const bid = (price: number, who: Account = w.driver) => auth(t.http().post(`/shipments/${w.ship.id}/bids`).send({ price }), who);
    expect((await bid(fee + 1000)).status).toBe(400); // escrow'dan yuqori
    expect((await bid(Math.floor(fee * 0.5))).status).toBe(400); // juda past
    expect((await bid(fee, w.market as any)).status).toBe(403); // faqat haydovchi
    const target = Math.ceil((fee * 0.85) / 1000) * 1000;
    const placed = await bid(target);
    expect(placed.status).toBe(200);
    expect(placed.body).toMatchObject({ price: target, status: 'PENDING' });
    // yangi taklif eskisini yangilaydi (bitta haydovchi — bitta taklif)
    expect((await bid(target - 1000)).body.price).toBe(target - 1000);
    const mine = await auth(t.http().get(`/shipments/${w.ship.id}/bids`), w.driver);
    expect(mine.body.bids).toHaveLength(1);
    // begona haydovchi ko'rmaydi, egasi ko'radi
    const other = await registerDriver(t.http, { capacityKg: 30000 });
    expect((await auth(t.http().get(`/shipments/${w.ship.id}/bids`), other)).body.bids).toHaveLength(0);
    const owner = await auth(t.http().get(`/shipments/${w.ship.id}/bids`), w.farmer);
    expect(owner.body.bids[0]).toMatchObject({ price: target - 1000, status: 'PENDING', driver: { vehicleType: expect.any(String) } });
    expect(owner.body.escrowDeliveryFee).toBe(fee);
    // haydovchi o'zi qabul qila olmaydi
    const bidId = owner.body.bids[0].id;
    expect((await auth(t.http().post(`/shipments/${w.ship.id}/bids/${bidId}/accept`).send({}), w.driver)).status).toBe(403);
    expect((await auth(t.http().post(`/shipments/${w.ship.id}/bids/${bidId}/accept`).send({}), other)).status).toBe(403);
    const acc = await auth(t.http().post(`/shipments/${w.ship.id}/bids/${bidId}/accept`).send({}), w.farmer);
    expect(acc.status).toBe(200);
    expect(acc.body.bids[0].status).toBe('ACCEPTED');
    const ship = await t.prisma.shipment.findUniqueOrThrow({ where: { id: w.ship.id } });
    expect(ship.status).toBe('LOADING');
    expect(Number(ship.agreedDeliveryFee)).toBe(target - 1000);
    const pay1 = await t.prisma.payment.findUniqueOrThrow({ where: { id: w.payment.id } });
    expect(Number(pay1.deliveryFee)).toBe(target - 1000);
    expect(Number(pay1.refundedAmount)).toBe(fee - (target - 1000)); // xaridorga qaytgan farq
    // ikkinchi marta qabul qilib bo'lmaydi
    expect((await auth(t.http().post(`/shipments/${w.ship.id}/bids/${bidId}/accept`).send({}), w.farmer)).status).toBe(409);
    expect((await bid(fee)).status).toBe(409); // yuk band
  });

  it("yetkazish FERMER hisobidan bo'lsa: kamaygan yo'l haqi fermer sof summasiga qo'shiladi (xaridorga qaytarilmaydi)", async () => {
    const w = await load({ payer: 'FARMER', price: 5000 });
    const fee = Number(w.payment.deliveryFee), amount0 = Number(w.payment.amount);
    const price = Math.ceil((fee * 0.8) / 1000) * 1000;
    await auth(t.http().post(`/shipments/${w.ship.id}/bids`).send({ price }), w.driver);
    const bidId = (await auth(t.http().get(`/shipments/${w.ship.id}/bids`), w.farmer)).body.bids[0].id;
    const disp = await createAdmin(t, 'DISPATCHER');
    expect((await auth(t.http().post(`/shipments/${w.ship.id}/bids/${bidId}/accept`).send({}), disp)).status).toBe(200);
    const p = await t.prisma.payment.findUniqueOrThrow({ where: { id: w.payment.id } });
    expect(Number(p.deliveryFee)).toBe(price);
    expect(Number(p.amount)).toBe(amount0 + (fee - price));
    expect(Number(p.refundedAmount)).toBe(0);
    expect(Number(p.amount) + Number(p.deliveryFee)).toBe(amount0 + fee); // market jami o'zgarmagan
  });

  it("nizo (Dispute): haydovchi/market ochadi, nizo vaqtida PIN topshirish bloklanadi, dispetcher yopgach davom etadi", async () => {
    const w = await load();
    await auth(t.http().post(`/shipments/${w.ship.id}/accept`).send({}), w.driver);
    const pin0 = await t.prisma.shipment.findUniqueOrThrow({ where: { id: w.ship.id } });
    await auth(t.http().post(`/shipments/${w.ship.id}/confirm-pickup`).send({ pin: pin0.pickupPin }), w.farmer);
    const reason = { reason: 'Mahsulot sifatsiz: 30% chirigan' };
    expect((await auth(t.http().post(`/shipments/${w.ship.id}/dispute`).send({ reason: 'x' }), w.driver)).status).toBe(400);
    expect((await auth(t.http().post(`/shipments/${w.ship.id}/dispute`).send(reason), w.farmer)).status).toBe(403);
    const opened = await auth(t.http().post(`/shipments/${w.ship.id}/dispute`).send(reason), w.driver);
    expect(opened.status).toBe(200);
    expect(opened.body.dispute).toMatchObject({ reason: reason.reason, by: 'DRIVER' });
    expect((await auth(t.http().post(`/shipments/${w.ship.id}/dispute`).send(reason), w.market)).status).toBe(409); // allaqachon ochiq
    const s1 = await t.prisma.shipment.findUniqueOrThrow({ where: { id: w.ship.id } });
    const blocked = await auth(t.http().post(`/shipments/${w.ship.id}/deliver`).send({ pin: s1.deliveryPin }), w.driver);
    expect(blocked.status).toBe(409);
    expect(JSON.stringify(blocked.body)).toMatch(/nizo/i);
    expect((await t.prisma.payment.findUniqueOrThrow({ where: { id: w.payment.id } })).status).toBe('HELD'); // escrow saqlanadi
    expect((await auth(t.http().post(`/shipments/${w.ship.id}/dispute/resolve`).send({}), w.market)).status).toBe(403);
    const disp = await createAdmin(t, 'DISPATCHER');
    const open = await auth(t.http().get('/shipments/disputes'), disp);
    expect(open.status).toBe(200);
    expect(open.body.map((x: any) => x.id)).toContain(w.ship.id);
    expect((await auth(t.http().get('/shipments/disputes'), w.market)).status).toBe(403);
    expect((await auth(t.http().post(`/shipments/${w.ship.id}/dispute/resolve`).send({}), disp)).body.dispute).toBeNull();
    expect((await auth(t.http().get('/shipments/disputes'), disp)).body.map((x: any) => x.id)).not.toContain(w.ship.id);
    expect((await auth(t.http().post(`/shipments/${w.ship.id}/deliver`).send({ pin: s1.deliveryPin }), w.driver)).status).toBe(200);
  });

  it("market ham nizo ochadi; topshirilmagan (OPEN) yukka nizo ochib bo'lmaydi", async () => {
    const w = await load();
    expect((await auth(t.http().post(`/shipments/${w.ship.id}/dispute`).send({ reason: 'Sifatsiz yuk keldi' }), w.market)).status).toBe(409);
    await auth(t.http().post(`/shipments/${w.ship.id}/accept`).send({}), w.driver);
    const pin0 = await t.prisma.shipment.findUniqueOrThrow({ where: { id: w.ship.id } });
    await auth(t.http().post(`/shipments/${w.ship.id}/confirm-pickup`).send({ pin: pin0.pickupPin }), w.farmer);
    const r = await auth(t.http().post(`/shipments/${w.ship.id}/dispute`).send({ reason: 'Sifatsiz yuk keldi' }), w.market);
    expect(r.status).toBe(200);
    expect(r.body.dispute.by).toBe('MARKET');
  });
});
