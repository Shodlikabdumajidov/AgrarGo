import { approve, bearer, book, bootApp, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

const base = { status: 'AVAILABLE', trailerType: 'DRY_VAN', capacityKg: 20000, routes: ['Samarqand ↔ Toshkent'], currentLocation: 'Samarqand sh.', loadMode: 'LTL' };

describe("LTL (qisman yuklar) va radiusli qidiruv (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const send = (m: 'get' | 'post' | 'patch', who: any, path: string, body?: any) => t.http()[m](path).set('Authorization', bearer(who)).send(body);

  async function world() {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http);
    const product = await createProduct(t.http, farmer, { quantityKg: 60000, pricePerKg: 1000 });
    /** To'lovi kafolatlangan (HELD) ochiq yuk */
    const load = async (kg: number) => {
      const bk = (await book(t.http, market, product.id, kg)).body;
      await approve(t.http, farmer, bk.id);
      await pay(t.http, market, bk.id);
      return (await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } })).id;
    };
    const accept = (id: string) => send('post', driver, `/shipments/${id}/accept`);
    const post = async (extra: any = {}) => (await send('post', driver, '/driver-posts', { ...base, ...extra })).body;
    const avail = async (id: string) => (await t.prisma.driverPost.findUniqueOrThrow({ where: { id } })).availableCapacityKg;
    return { farmer, market, driver, load, accept, post, avail };
  }

  it("LTL e'lon: max/available saqlanadi; bir reysda bir nechta yuk, bo'sh joy kamayadi va yetkazilgach tiklanadi", async () => {
    const w = await world();
    const p = await w.post();
    expect(p).toMatchObject({ loadMode: 'LTL', maxCapacityKg: 20000, availableCapacityKg: 20000, usedCapacityKg: 0 });
    const [a, b, c] = [await w.load(3000), await w.load(5000), await w.load(15000)];
    const r1 = await w.accept(a);
    expect(r1.status).toBe(201);
    expect(r1.body.ltl).toMatchObject({ postId: p.id, availableCapacityKg: 17000, usedCapacityKg: 3000 });
    expect((await w.accept(b)).status).toBe(201); // ikkinchi yuk: MAX_ACTIVE_SHIPMENTS=1 LTL uchun to'siq emas
    expect(await w.avail(p.id)).toBe(12000);
    const over = await w.accept(c);
    expect(over.status).toBe(409);
    expect(over.body.message).toContain("bo'sh joy");
    expect(await w.avail(p.id)).toBe(12000); // rad etilgan yuk joy olmaydi
    // mavjud yuklar ro'yxatida "sig'adimi" belgisi bo'sh joyga qarab
    const open = (await send('get', w.driver, '/shipments/available')).body.find((s: any) => s.id === c);
    expect(open.fitsCapacity).toBe(false);
    // yo'lga chiqish va yetkazish
    await send('patch', w.driver, `/shipments/${a}/advance`);
    const done = await send('patch', w.driver, `/shipments/${a}/advance`);
    expect(done.status).toBe(200);
    expect(await w.avail(p.id)).toBe(15000);
    expect((await send('patch', w.driver, `/shipments/${a}/advance`)).status).toBe(409);
    expect(await w.avail(p.id)).toBe(15000); // ikki marta tiklanmaydi
    expect((await w.accept(c)).status).toBe(201); // endi 15000 sig'adi
    expect(await w.avail(p.id)).toBe(0);
  });

  it("qaytarilgan yuk (release) joyni tiklaydi; parallel qabul bo'sh joydan oshmaydi", async () => {
    const w = await world();
    const p = await w.post({ capacityKg: 10000 });
    const ids = await Promise.all([w.load(4000), w.load(4000), w.load(4000)]);
    const res = await Promise.all(ids.map((id) => w.accept(id)));
    expect(res.filter((r) => r.status === 201)).toHaveLength(2);
    expect(await w.avail(p.id)).toBe(2000);
    const okId = ids[res.findIndex((r) => r.status === 201)];
    expect((await send('post', w.driver, `/shipments/${okId}/release`)).status).toBe(201);
    expect(await w.avail(p.id)).toBe(6000);
  });

  it("FTL (yoki e'lonsiz) haydovchi avvalgidek bitta yuk oladi", async () => {
    const w = await world();
    await w.post({ loadMode: 'FTL' });
    const [a, b] = [await w.load(100), await w.load(100)];
    expect((await w.accept(a)).status).toBe(201);
    expect((await w.accept(b)).status).toBe(409);
  });

  it("smart-taklif: qolgan joyga sig'adigan, shu yo'nalishdagi, to'lovi kafolatlangan yuklar", async () => {
    const w = await world();
    const p = await w.post({ capacityKg: 10000 });
    const first = await w.load(3000);
    const small = await w.load(2000), big = await w.load(9000);
    // to'lovsiz yuk taklif qilinmaydi
    const bk = (await book(t.http, w.market, (await t.prisma.product.findFirstOrThrow()).id, 1000)).body;
    await approve(t.http, w.farmer, bk.id);
    await w.accept(first);
    const s = await send('get', w.driver, `/shipments/${first}/ltl-suggestions`);
    expect(s.status).toBe(200);
    expect(s.body.remainingKg).toBe(7000);
    expect(s.body.ltl.postId).toBe(p.id);
    const ids = s.body.suggestions.map((x: any) => x.id);
    expect(ids).toContain(small);
    expect(ids).not.toContain(big); // 9000 > 7000
    expect(ids).toHaveLength(1); // to'lanmagan 1000 kg yuk yo'q
    // begona haydovchi so'ray olmaydi
    const other = await registerDriver(t.http);
    expect((await send('get', other, `/shipments/${first}/ltl-suggestions`)).status).toBe(404);
  });

  it("sig'imni tahrirlash bo'sh joyni moslaydi; max dan oshib bo'lmaydi", async () => {
    const w = await world();
    const p = await w.post({ capacityKg: 10000, availableCapacityKg: 6000 });
    expect(p.availableCapacityKg).toBe(6000);
    const up = await send('patch', w.driver, `/driver-posts/${p.id}`, { capacityKg: 12000 });
    expect(up.body).toMatchObject({ maxCapacityKg: 12000, availableCapacityKg: 8000, usedCapacityKg: 4000 });
    const cl = await send('patch', w.driver, `/driver-posts/${p.id}`, { availableCapacityKg: 99999 });
    expect(cl.status).toBe(400);
    const lim = await send('patch', w.driver, `/driver-posts/${p.id}`, { availableCapacityKg: 12000, capacityKg: 9000 });
    expect(lim.body).toMatchObject({ maxCapacityKg: 9000, availableCapacityKg: 9000 });
  });

  it("radius: haydovchi e'lonlari Haversine bilan saralanadi, masofa qaytadi, parametrlar tekshiriladi", async () => {
    const d1 = await registerDriver(t.http), d2 = await registerDriver(t.http), viewer = await registerFarmer(t.http);
    await send('post', d1, '/driver-posts', { ...base, lat: 39.66, lng: 66.97 });
    await send('post', d2, '/driver-posts', { ...base, currentLocation: 'Toshkent sh.', lat: 41.31, lng: 69.24 });
    const q = (lat: number, lng: number, r: number) => send('get', viewer, `/driver-posts?lat=${lat}&lng=${lng}&radiusKm=${r}`);
    const near = await q(39.65, 66.96, 10);
    expect(near.status).toBe(200);
    expect(near.body).toHaveLength(1);
    expect(near.body[0].distanceKm).toBeLessThan(5);
    expect(near.body[0].lat).toBeCloseTo(39.65, 1);
    const wide = await q(39.65, 66.96, 500);
    expect(wide.body.map((p: any) => p.distanceKm)).toEqual([...wide.body.map((p: any) => p.distanceKm)].sort((a, b) => a - b));
    expect(wide.body).toHaveLength(2);
    expect((await q(41.31, 69.24, 50)).body).toHaveLength(1);
    expect((await send('get', viewer, '/driver-posts?lat=41&lng=69')).status).toBe(400);
    expect((await send('get', viewer, '/driver-posts?lat=95&lng=69&radiusKm=10')).status).toBe(400);
    expect((await send('get', viewer, '/driver-posts?lat=41&lng=69&radiusKm=9999')).status).toBe(400);
    expect((await send('get', viewer, '/driver-posts?loadMode=LTL')).body).toHaveLength(2);
  });

  it("Yuk radari: ochiq yuklar olib ketish nuqtasi bo'yicha radiusda filtrlanadi; koordinata yuk yaratilganda yoziladi", async () => {
    const w = await world();
    const id = await w.load(500);
    const row = await t.prisma.shipment.findUniqueOrThrow({ where: { id } });
    expect(row.originLat).not.toBeNull();
    const q = (lat: number, lng: number, r: number) => send('get', w.driver, `/shipments/available?lat=${lat}&lng=${lng}&radiusKm=${r}`);
    const near = await q(row.originLat!, row.originLng!, 10);
    expect(near.body.map((s: any) => s.id)).toContain(id);
    expect(near.body[0]).toMatchObject({ distanceKm: 0 });
    expect(near.body[0].origin.address).toBeNull(); // aniq manzil yashirin
    expect((await q(41.31, 69.24, 50)).body.map((s: any) => s.id)).not.toContain(id);
    expect((await send('get', w.driver, '/shipments/available?lat=40')).status).toBe(400);
  });
});
