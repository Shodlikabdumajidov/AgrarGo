import { bearer, bootApp, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const base = { status: 'AVAILABLE', trailerType: 'REEFER', capacityKg: 20000, routes: ['Samarqand ↔ Toshkent', "Farg'ona vodiysi"], currentLocation: 'Samarqand sh.', pickupEtaMinutes: 30, pricePerKm: 4500, extras: ['LOADERS', 'TEMP_CONTROL'], workHours: '06:00–22:00' };

describe("Haydovchi e'lonlari katalogi (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const post = (who: any, path: string, body?: any) => t.http().post(path).set('Authorization', bearer(who)).send(body);
  const get = (who: any, path: string) => t.http().get(path).set('Authorization', bearer(who));

  it("haydovchi e'lon yaratadi; boshqa rollar yarata olmaydi; validatsiya", async () => {
    const driver = await registerDriver(t.http), farmer = await registerFarmer(t.http);
    expect((await post(farmer, '/driver-posts', base)).status).toBe(403);
    expect((await post(driver, '/driver-posts', { ...base, routes: [] })).status).toBe(400);
    expect((await post(driver, '/driver-posts', { ...base, trailerType: 'ROCKET' })).status).toBe(400);
    expect((await post(driver, '/driver-posts', { ...base, capacityKg: 5 })).status).toBe(400);
    const r = await post(driver, '/driver-posts', base);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'AVAILABLE', trailerType: 'REEFER', pricePerKm: 4500, extras: ['LOADERS', 'TEMP_CONTROL'] });
    expect(r.body.driver.phoneMasked).toMatch(/^\+998 90 \*\*\* \*\* \d\d$/);
    expect(JSON.stringify(r.body)).not.toContain(driver.phone);
    expect((await get(driver, '/driver-posts/mine')).body).toHaveLength(1);
  });

  it("ON_ROUTE: yetkazish va qaytish vaqti saqlanadi; qaytish vaqti oldin bo'lsa 400; AVAILABLE ga o'tganda tozalanadi", async () => {
    const driver = await registerDriver(t.http);
    const eta = new Date(Date.now() + 3 * 3600_000).toISOString(), early = new Date(Date.now() + 3600_000).toISOString(), ret = new Date(Date.now() + 6 * 3600_000).toISOString();
    expect((await post(driver, '/driver-posts', { ...base, status: 'ON_ROUTE', deliveryEtaAt: eta, returnPickupAt: early })).status).toBe(400);
    const r = await post(driver, '/driver-posts', { ...base, status: 'ON_ROUTE', deliveryEtaAt: eta, returnPickupAt: ret });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'ON_ROUTE', wantsBackhaul: true });
    expect(new Date(r.body.returnPickupAt).toISOString()).toBe(ret);
    const u = await t.http().patch(`/driver-posts/${r.body.id}`).set('Authorization', bearer(driver)).send({ status: 'AVAILABLE' });
    expect(u.status).toBe(200);
    expect(u.body).toMatchObject({ status: 'AVAILABLE', deliveryEtaAt: null, returnPickupAt: null, wantsBackhaul: false });
  });

  it("katalog: hamma rol ko'radi, filtrlar ishlaydi, telefon yashirin; contact faqat yuk egalari/xodimlar", async () => {
    const d1 = await registerDriver(t.http), d2 = await registerDriver(t.http), farmer = await registerFarmer(t.http), market = await registerMarket(t.http);
    const a = (await post(d1, '/driver-posts', base)).body;
    await post(d2, '/driver-posts', { ...base, trailerType: 'FLATBED', extras: ['LIFTGATE'], routes: ['Buxoro ↔ Navoiy'], currentLocation: 'Buxoro sh.', status: 'ON_ROUTE' });
    expect((await t.http().get('/driver-posts')).status).toBe(401);
    for (const who of [farmer, market, d1]) expect((await get(who, '/driver-posts')).body).toHaveLength(2);
    expect((await get(farmer, '/driver-posts?trailerType=REEFER')).body).toHaveLength(1);
    expect((await get(farmer, '/driver-posts?status=ON_ROUTE')).body).toHaveLength(1);
    expect((await get(farmer, '/driver-posts?extras=LIFTGATE')).body).toHaveLength(1);
    expect((await get(farmer, '/driver-posts?extras=LOADERS,TEMP_CONTROL')).body).toHaveLength(1);
    expect((await get(farmer, '/driver-posts?q=navoiy')).body).toHaveLength(1);
    expect((await get(farmer, '/driver-posts?region=buxoro')).body).toHaveLength(1);
    expect((await get(farmer, '/driver-posts?q=yoq-joy')).body).toHaveLength(0);
    expect((await get(d2, `/driver-posts/${a.id}/contact`)).status).toBe(403);
    const c = await get(market, `/driver-posts/${a.id}/contact`);
    expect(c.status).toBe(200);
    expect(c.body.phone).toBe(d1.phone);
  });

  it("faqat egasi tahrirlaydi/o'chiradi; 3 tadan ortiq faol e'lon yo'q; faolsiz e'lon katalogda ko'rinmaydi", async () => {
    const d1 = await registerDriver(t.http), d2 = await registerDriver(t.http);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await post(d1, '/driver-posts', base)).body.id);
    expect((await post(d1, '/driver-posts', base)).status).toBe(400);
    expect((await t.http().patch(`/driver-posts/${ids[0]}`).set('Authorization', bearer(d2)).send({ pricePerKm: 1 })).status).toBe(403);
    expect((await t.http().delete(`/driver-posts/${ids[0]}`).set('Authorization', bearer(d2))).status).toBe(403);
    await t.http().patch(`/driver-posts/${ids[0]}`).set('Authorization', bearer(d1)).send({ isActive: false });
    expect((await get(d2, '/driver-posts')).body).toHaveLength(2);
    expect((await t.http().delete(`/driver-posts/${ids[1]}`).set('Authorization', bearer(d1))).status).toBe(200);
    expect((await get(d1, '/driver-posts/mine')).body).toHaveLength(2);
  });

  it("rasm yuklash: faqat rasm, egasi, 6 tagacha; ommaviy URL ochiladi; o'chirish", async () => {
    const d1 = await registerDriver(t.http), d2 = await registerDriver(t.http);
    const p = (await post(d1, '/driver-posts', base)).body;
    const up = (who: any, buf: Buffer) => t.http().post(`/driver-posts/${p.id}/photos`).set('Authorization', bearer(who)).attach('file', buf, 'a.png');
    expect((await up(d2, PNG)).status).toBe(403);
    expect((await up(d1, Buffer.from('not an image'))).status).toBe(400);
    const ok = await up(d1, PNG);
    expect(ok.status).toBe(201);
    expect(ok.body.photos).toHaveLength(1);
    expect((await t.http().get(ok.body.photos[0])).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await up(d1, PNG)).status).toBe(201);
    expect((await up(d1, PNG)).status).toBe(400);
    const del = await t.http().delete(`/driver-posts/${p.id}/photos/0`).set('Authorization', bearer(d1));
    expect(del.status).toBe(200);
    expect(del.body.photos).toHaveLength(5);
    expect((await t.http().get(ok.body.photos[0])).status).toBe(404);
  });
});
