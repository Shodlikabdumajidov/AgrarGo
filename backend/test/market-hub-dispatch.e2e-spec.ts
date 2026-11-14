import { PAYMENT_PROVIDER } from '../src/payment/provider/payment-provider';
import { approve, bearer, book, bootApp, createAdmin, createProduct, pay, registerConsumer, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

describe('Market Hub zaxirasidan buyuradi + Dispetcher paneli API (e2e)', () => {
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

  const send = (m: 'get' | 'post' | 'patch', who: any, path: string, body?: any) => (who ? t.http()[m](path).set('Authorization', bearer(who)) : t.http()[m](path)).send(body);

  async function hubWorld() {
    const admin = await createAdmin(t, 'ADMIN'), staff = await createAdmin(t, 'DISPATCHER');
    const hub = (await send('post', admin, '/hubs', { name: 'Samarqand Hub', region: 'Samarqand', district: 'Siyob', address: 'Sanoat 5' })).body;
    await send('post', admin, `/hubs/${hub.id}/staff`, { userId: staff.user.id });
    const farmer = await registerFarmer(t.http, { region: 'Qashqadaryo' });
    const product = await createProduct(t.http, farmer, { name: 'Kartoshka', category: 'Sabzavot', quantityKg: 1000, pricePerKg: 3000 });
    const intake = (await send('post', farmer, '/hub/intakes', { productId: product.id, hubId: hub.id, declaredKg: 1000, retailPricePerKg: 4500, minOrderKg: 10 })).body;
    expect((await send('post', staff, `/hub/intakes/${intake.id}/receive`, { receivedKg: 980 })).status).toBe(201);
    const market = await registerMarket(t.http, { region: 'Samarqand', district: 'Siyob' });
    return { admin, staff, hub, farmer, product, market };
  }

  it("Market Hub zaxirasidan buyurtma beradi: to'lov escrow'da, qoldiq zaxiralanadi; o'z buyurtmasini ko'radi, begona market ko'rmaydi", async () => {
    const w = await hubWorld();
    const r = await send('post', w.market, '/local/orders', { productId: w.product.id, quantityKg: 50, district: 'Siyob', address: 'Bunyodkor 12' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'PENDING', quantityKg: 50 });
    const st = await t.prisma.hubStock.findFirstOrThrow({ where: { hubId: w.hub.id, productId: w.product.id } });
    expect(Number(st.reservedKg)).toBe(50);
    const pay0 = await t.prisma.payment.findFirstOrThrow({ where: { localOrderId: r.body.id } });
    expect(pay0.status).toBe('HELD');
    // profil Market ma'lumotlaridan ochilgan
    const c = await t.prisma.consumer.findUniqueOrThrow({ where: { userId: w.market.user.id } });
    expect(c).toMatchObject({ region: 'Samarqand', district: 'Siyob' });
    // ro'yxat va bitta buyurtma
    const mine = (await send('get', w.market, '/local/orders/mine')).body;
    expect(mine).toHaveLength(1);
    expect((await send('get', w.market, `/local/orders/${r.body.id}`)).status).toBe(200);
    const other = await registerMarket(t.http);
    expect((await send('get', other, `/local/orders/${r.body.id}`)).status).toBe(404);
    expect((await send('get', other, '/local/orders/mine')).body).toHaveLength(0);
    // Market bekor qila oladi (faqat PENDING)
    const c2 = await send('post', w.market, `/local/orders/${r.body.id}/cancel`, {});
    expect(c2.status).toBe(201);
    expect(Number((await t.prisma.hubStock.findFirstOrThrow({ where: { id: st.id } })).reservedKg)).toBe(0);
    // savat (bulk checkout) ham ishlaydi
    const bulk = await send('post', w.market, '/local/orders/checkout-bulk', { items: [{ productId: w.product.id, quantityKg: 20 }], district: 'Siyob', address: 'Bunyodkor 12' });
    expect(bulk.status).toBe(201);
  });

  it("Hub buyurtmasi rol cheklovlari: fermer/haydovchi buyurtma bera olmaydi; Market tasdiqlash/pack kabi xodim amallarini bajara olmaydi", async () => {
    const w = await hubWorld();
    const driver = await registerDriver(t.http);
    const body = { productId: w.product.id, quantityKg: 20, district: 'Siyob', address: 'Bunyodkor 12' };
    expect((await send('post', w.farmer, '/local/orders', body)).status).toBe(403);
    expect((await send('post', driver, '/local/orders', body)).status).toBe(403);
    expect((await send('post', null, '/local/orders', body)).status).toBe(401);
    const o = (await send('post', w.market, '/local/orders', body)).body;
    expect((await send('post', w.market, `/local/orders/${o.id}/pack-start`)).status).toBe(403);
    expect((await send('post', w.market, `/local/orders/${o.id}/accept`, {})).status).toBe(403);
    expect((await send('get', w.market, '/local/hub/orders')).status).toBe(403);
    // boshqa viloyatga yetkazish rad etiladi
    expect((await send('post', w.market, '/local/orders', { ...body, region: 'Buxoro' })).status).toBe(400);
    // Consumer oldingidek ishlaydi
    const consumer = await registerConsumer(t.http);
    expect((await send('post', consumer, '/local/orders', body)).status).toBe(201);
  });

  async function openShipments() {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http);
    const product = await createProduct(t.http, farmer, { quantityKg: 60000, pricePerKg: 1000, name: 'Pomidor' });
    const mk = async (kg: number, paid = true) => {
      const bk = (await book(t.http, market, product.id, kg)).body;
      await approve(t.http, farmer, bk.id);
      if (paid) await pay(t.http, market, bk.id);
      return { bk, id: (await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } })).id };
    };
    return { farmer, market, mk };
  }

  it("GET /shipments/unassigned va /drivers/available: faqat dispetcher/admin; band va sig'maydigan haydovchilar chiqmaydi", async () => {
    const w = await openShipments();
    const a = await w.mk(3000), unpaid = await w.mk(500, false);
    const free = await registerDriver(t.http, { capacityKg: 5000 }), small = await registerDriver(t.http, { capacityKg: 1000 }), busy = await registerDriver(t.http, { capacityKg: 20000 });
    const taken = await w.mk(800);
    await send('post', busy, `/shipments/${taken.id}/accept`);
    const staff = await createAdmin(t, 'DISPATCHER'), admin = await createAdmin(t, 'ADMIN');
    for (const who of [staff, admin]) {
      const list = (await send('get', who, '/shipments/unassigned')).body;
      expect(list.map((s: any) => s.id).sort()).toEqual([a.id, unpaid.id].sort());
      const s = list.find((x: any) => x.id === a.id);
      expect(s).toMatchObject({ status: 'OPEN', paymentStatus: 'HELD', cargoName: 'Pomidor' });
      expect(s.farmer.phone).toBeTruthy();
      expect(s.market.phone).toBeTruthy();
    }
    const ids = async (q = '') => (await send('get', staff, `/drivers/available${q}`)).body.map((d: any) => d.id);
    const fid = free.user.driver?.id ?? (await t.prisma.driver.findFirstOrThrow({ where: { userId: free.user.id } })).id;
    const sid = (await t.prisma.driver.findFirstOrThrow({ where: { userId: small.user.id } })).id;
    const bid = (await t.prisma.driver.findFirstOrThrow({ where: { userId: busy.user.id } })).id;
    expect(await ids()).toEqual(expect.arrayContaining([fid, sid]));
    expect(await ids()).not.toContain(bid); // faol yuki bor
    expect(await ids('?weightKg=3000')).toContain(fid);
    expect(await ids('?weightKg=3000')).not.toContain(sid); // sig'maydi
    expect(await ids('?region=Buxoro')).toHaveLength(0);
    // rol cheklovlari
    for (const who of [w.farmer, w.market, free]) {
      expect((await send('get', who, '/shipments/unassigned')).status).toBe(403);
      expect((await send('get', who, '/drivers/available')).status).toBe(403);
    }
    expect((await send('get', null, '/drivers/available')).status).toBe(401);
  });

  it("POST /shipments/:id/assign-driver: dispetcher biriktiradi (LOADING), haydovchi davom ettiradi; qoidalar buzilsa 409/404/403", async () => {
    const w = await openShipments();
    const a = await w.mk(3000), unpaid = await w.mk(500, false);
    const driver = await registerDriver(t.http, { capacityKg: 5000 }), small = await registerDriver(t.http, { capacityKg: 1000 });
    const did = (await t.prisma.driver.findFirstOrThrow({ where: { userId: driver.user.id } })).id;
    const sid = (await t.prisma.driver.findFirstOrThrow({ where: { userId: small.user.id } })).id;
    const staff = await createAdmin(t, 'DISPATCHER');
    const assign = (who: any, id: string, driverId: string) => send('post', who, `/shipments/${id}/assign-driver`, { driverId });
    // ruxsat
    expect((await assign(w.farmer, a.id, did)).status).toBe(403);
    expect((await assign(driver, a.id, did)).status).toBe(403);
    expect((await assign(staff, a.id, 'x')).status).toBe(400);
    expect((await assign(staff, a.id, '11111111-1111-4111-8111-111111111111')).status).toBe(404);
    // sig'maydigan va to'lanmagan yuk
    expect((await assign(staff, a.id, sid)).status).toBe(409);
    expect((await assign(staff, unpaid.id, did)).status).toBe(409);
    // muvaffaqiyat
    const ok = await assign(staff, a.id, did);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: a.id, status: 'LOADING', driver: { plateNumber: expect.any(String) } });
    expect((await send('get', driver, '/shipments/mine')).body.map((s: any) => s.id)).toEqual([a.id]);
    expect((await send('get', staff, '/shipments/unassigned')).body.map((s: any) => s.id)).toEqual([unpaid.id]);
    // takror biriktirish va band haydovchi
    expect((await assign(staff, a.id, did)).status).toBe(409);
    await t.prisma.payment.updateMany({ where: { bookingId: (await w.mk(100)).bk.id }, data: {} });
    const b = await w.mk(200);
    expect((await assign(staff, b.id, did)).status).toBe(409); // haydovchida faol yuk bor
    // haydovchi yukni davom ettiradi
    expect((await send('patch', driver, `/shipments/${a.id}/advance`)).body.status).toBe('IN_TRANSIT');
    // admin ham biriktira oladi
    const admin = await createAdmin(t, 'ADMIN');
    const other = await registerDriver(t.http, { capacityKg: 5000 });
    const oid = (await t.prisma.driver.findFirstOrThrow({ where: { userId: other.user.id } })).id;
    expect((await assign(admin, b.id, oid)).status).toBe(200);
  });
});
