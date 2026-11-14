import { PAYMENT_PROVIDER } from '../src/payment/provider/payment-provider';
import { approve, bearer, book, bootApp, createAdmin, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

const post = { status: 'AVAILABLE', trailerType: 'DRY_VAN', capacityKg: 10000, routes: ['Samarqand ↔ Toshkent'], currentLocation: 'Samarqand sh.', loadMode: 'LTL' };

describe('Market buyurtma zanjiri: bron -> biriktirish -> haydovchi qabul -> yo\'lda -> qabul qildim -> escrow bo\'linishi (e2e)', () => {
  let t: TestApp;
  let calls: { kind: string; paymentId: string; amount: string }[];
  beforeAll(async () => {
    t = await bootApp();
    const prov: any = t.app.get(PAYMENT_PROVIDER);
    for (const kind of ['charge', 'payout', 'refund']) {
      const orig = prov[kind].bind(prov);
      prov[kind] = async (req: any) => { calls.push({ kind, paymentId: req.paymentId, amount: req.amount }); return orig(req); };
    }
  });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); calls = []; });

  const send = (m: 'get' | 'post' | 'patch', who: any, path: string, body?: any) => t.http()[m](path).set('Authorization', bearer(who)).send(body);

  async function world(withAdminOrDispatcher?: 'DISPATCHER' | 'ADMIN') {
    const driver = await registerDriver(t.http, { capacityKg: 20000 }), farmer = await registerFarmer(t.http), market = await registerMarket(t.http);
    const p = (await send('post', driver, '/driver-posts', post)).body;
    const product = await createProduct(t.http, farmer, { quantityKg: 60000, pricePerKg: 1000, name: 'Pomidor' });
    const bk = (await book(t.http, market, product.id, 3000)).body;
    await approve(t.http, farmer, bk.id);
    await pay(t.http, market, bk.id);
    const ship = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } });
    const staff = withAdminOrDispatcher ? await createAdmin(t, withAdminOrDispatcher) : null;
    return { driver, farmer, market, p, bk, shipmentId: ship.id, staff };
  }

  it("fermer biriktiradi -> haydovchi «Mavjud yuklar»da qabul qiladi -> yo'lda -> market «Yukni qabul qildim» -> pul haydovchi va fermerga bo'linadi", async () => {
    const w = await world();
    // market yetkazib berishdan oldin pulni chiqara olmaydi
    expect((await send('post', w.market, '/payments/release', { bookingId: w.bk.id })).status).toBe(409);
    // b) fermer yukni haydovchiga biriktiradi (taklif)
    const offer = await send('post', w.farmer, `/driver-posts/${w.p.id}/offers`, { shipmentId: w.shipmentId, note: 'Ertalab tayyor' });
    expect(offer.status).toBe(201);
    // c) haydovchi taklifni ko'radi va qabul qiladi
    const mine = (await send('get', w.driver, '/driver-posts/offers/mine')).body;
    expect(mine[0]).toMatchObject({ open: true, note: 'Ertalab tayyor', shipment: { id: w.shipmentId, ready: true } });
    expect((await send('post', w.driver, `/shipments/${w.shipmentId}/accept`)).status).toBe(201);
    expect((await send('get', w.driver, '/driver-posts/offers/mine')).body[0].open).toBe(false);
    // yo'lda
    expect((await send('patch', w.driver, `/shipments/${w.shipmentId}/advance`)).body.status).toBe('IN_TRANSIT');
    // d) market yo'ldagi yukni kuzatadi
    const tracked = (await send('get', w.market, '/shipments/mine')).body.find((s: any) => s.id === w.shipmentId);
    expect(tracked).toMatchObject({ status: 'IN_TRANSIT', paymentStatus: 'HELD', bookingId: w.bk.id });
    expect(tracked.driver).toBeTruthy();
    // yetib keldi, lekin pul hali escrow'da
    expect((await send('patch', w.driver, `/shipments/${w.shipmentId}/advance`)).body.status).toBe('DELIVERED');
    const arrived = (await send('get', w.market, '/shipments/mine')).body.find((s: any) => s.id === w.shipmentId);
    expect(arrived).toMatchObject({ status: 'DELIVERED', paymentStatus: 'HELD' });
    expect(calls.filter((c) => c.kind === 'payout')).toHaveLength(0);
    // e) «Yukni qabul qildim» -> escrow avtomatik bo'linadi
    const rel = await send('post', w.market, '/payments/release', { bookingId: w.bk.id });
    expect(rel.status).toBe(200);
    expect(rel.body.status).toBe('RELEASED');
    const payouts = calls.filter((c) => c.kind === 'payout');
    expect(payouts.length).toBeGreaterThanOrEqual(2); // fermer + haydovchi
    const pay0 = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: w.bk.id } });
    expect(payouts.some((c) => c.paymentId.startsWith(pay0.id) && Number(c.amount) === Number(pay0.deliveryFee))).toBe(true); // haydovchi: yetkazish haqi
    expect(payouts.some((c) => Number(c.amount) === Number(pay0.amount))).toBe(true); // fermer: mahsulot puli
    // ikkinchi marta bosish pulni takror o'tkazmaydi
    const n = calls.length;
    expect((await send('post', w.market, '/payments/release', { bookingId: w.bk.id })).status).toBe(409);
    expect(calls.length).toBe(n);
  });

  it("dispetcher va admin ham ochiq yukni haydovchiga biriktira oladi; begona rollar (haydovchi) rad etiladi", async () => {
    for (const role of ['DISPATCHER', 'ADMIN'] as const) {
      await resetDb(t.prisma);
      const w = await world(role);
      const list = (await send('get', w.staff, `/driver-posts/offerable?postId=${w.p.id}`)).body;
      expect(list.map((x: any) => x.id)).toContain(w.shipmentId);
      expect((await send('post', w.staff, `/driver-posts/${w.p.id}/offers`, { shipmentId: w.shipmentId })).status).toBe(201);
      expect((await send('get', w.driver, '/driver-posts/offers/mine')).body[0].open).toBe(true);
      expect((await send('get', w.driver, '/driver-posts/offerable')).status).toBe(403);
    }
  });
});
