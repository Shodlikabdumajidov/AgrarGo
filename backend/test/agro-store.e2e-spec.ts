import { bearer, bootApp, registerFarmer, registerMarket, registerDriver, resetDb, TestApp } from './helpers';

describe('Agro-Store (dori va o\'g\'itlar, «TEZ KUNDA») (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  it('fermer katalogni oladi: TEZ KUNDA holati, buyurtma yopiq, standart rejim — ekin dorilari va o\'g\'itlar', async () => {
    const farmer = await registerFarmer(t.http);
    const res = await t.http().get('/agro-store').set('Authorization', bearer(farmer));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'COMING_SOON', orderingEnabled: false, mode: 'crop' });
    expect(res.body.products.length).toBeGreaterThanOrEqual(4);
    for (const p of res.body.products) {
      expect(['FERTILIZER', 'PESTICIDE', 'SEED_CARE']).toContain(p.category);
      expect(p.mode).toBe('crop');
      expect(p.price).toBeGreaterThan(0);
      expect(p.cityDeliveryFee).toBeGreaterThan(0);
      expect(p.partialFreight).toBe(true);
      expect(['litr', 'kg']).toContain(p.unit);
      for (const f of ['name', 'description', 'usage']) for (const l of ['uz', 'ru', 'en']) expect(String(p[f][l]).length).toBeGreaterThan(3);
    }
    expect(res.body.products.some((p: any) => /1 gektar/.test(p.usage.uz))).toBe(true);
  });

  it('chorvachilik rejimi: kombikorm, silos, vitamin, briket va chorvador postlari', async () => {
    const farmer = await registerFarmer(t.http);
    const res = await t.http().get('/agro-store?mode=livestock').set('Authorization', bearer(farmer));
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('livestock');
    const cats = new Set(res.body.products.map((p: any) => p.category));
    for (const c of ['FEED', 'SILAGE', 'VITAMIN', 'BRIQUETTE']) expect(cats.has(c)).toBe(true);
    expect(res.body.products.every((p: any) => p.mode === 'livestock')).toBe(true);
    expect(res.body.posts.length).toBeGreaterThanOrEqual(2);
    expect(res.body.posts.every((p: any) => p.mode === 'livestock' && p.text.ru)).toBe(true);
  });

  it("noto'g'ri rejim 400; tokensiz 401; market va haydovchi 403", async () => {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http);
    expect((await t.http().get('/agro-store?mode=xyz').set('Authorization', bearer(farmer))).status).toBe(400);
    expect((await t.http().get('/agro-store')).status).toBe(401);
    expect((await t.http().get('/agro-store').set('Authorization', bearer(market))).status).toBe(403);
    expect((await t.http().get('/agro-store').set('Authorization', bearer(driver))).status).toBe(403);
  });
});
