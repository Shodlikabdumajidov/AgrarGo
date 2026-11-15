import { bearer, bootApp, createAdmin, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

const NEWS = { titleUz: "Qamchiq dovonida qor va tuman kutilmoqda", summaryUz: "Yaqin 48 soat ichida dovonda qor va silliq yo'l ehtimoli bor, og'ir yuk transportiga ehtiyot bo'lish tavsiya etiladi.", category: 'ROADS', region: "Farg'ona" };

describe('Agro-yangiliklar va rolga mos AI xulosa (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const aiKeys = (o: any) => Object.keys(o).filter((k) => /^ai|insight/i.test(k));
  const get = (who?: any, qs = '') => { const r = t.http().get('/news' + qs); return who ? r.set('Authorization', bearer(who)) : r; };
  const post = (who: any, body: any) => t.http().post('/news').set('Authorization', bearer(who)).send(body);

  it("seed: jadval bo'sh bo'lsa 5 ta yangilik qo'shiladi, takror chaqirilsa o'zgarmaydi", async () => {
    const svc = t.app.get((await import('../src/news/news.service')).NewsService);
    expect(await svc.ensureSeed()).toBeGreaterThanOrEqual(4);
    expect(await svc.ensureSeed()).toBe(0);
    const r = await get();
    expect(r.status).toBe(200); expect(r.body.items.length).toBeGreaterThanOrEqual(4);
    expect(r.body.items[0].publishedAt >= r.body.items[1].publishedAt).toBe(true);
    expect(r.body.regions).toEqual(expect.arrayContaining(['Samarqand', "Farg'ona"]));
  });

  it("MEHMON: ai_insight maydonlari javobda umuman yo'q (yaroqsiz token ham mehmon hisoblanadi)", async () => {
    await (await import('../src/news/news.service')).NewsService && await t.app.get((await import('../src/news/news.service')).NewsService).ensureSeed();
    for (const res of [await get(), await t.http().get('/news').set('Authorization', 'Bearer yaroqsiz.token.qiymat'), await t.http().get('/api/news')]) {
      expect(res.status).toBe(200);
      for (const n of res.body.items) {
        expect(aiKeys(n)).toEqual([]);
        expect(n).toMatchObject({ titleUz: expect.any(String), titleRu: expect.any(String), titleEn: expect.any(String), summaryUz: expect.any(String), category: expect.any(String), region: expect.any(String) });
      }
      expect(JSON.stringify(res.body)).not.toMatch(/aiInsight|ai_insight|aiSource/);
    }
  });

  it("KIRGAN foydalanuvchi: faqat o'z roliga mos aiInsight (3 tilda); boshqa rol matni sizmaydi", async () => {
    const admin = await createAdmin(t);
    const created = (await post(admin, NEWS)).body;
    const farmer = await registerFarmer(t.http), driver = await registerDriver(t.http), market = await registerMarket(t.http);
    const row = await t.prisma.agroNews.findUniqueOrThrow({ where: { id: created.id } });
    const expectFor = async (who: any, role: 'Farmer' | 'Driver' | 'Market') => {
      const res = await get(who); expect(res.status).toBe(200);
      const n = res.body.items.find((x: any) => x.id === created.id);
      expect(n.aiInsight).toEqual({ role: role.toUpperCase(), uz: (row as any)[`aiInsight${role}Uz`], ru: (row as any)[`aiInsight${role}Ru`], en: (row as any)[`aiInsight${role}En`] });
      expect(n.aiInsights).toBeUndefined();
      for (const other of ['Farmer', 'Driver', 'Market'].filter((r) => r !== role)) for (const l of ['Uz', 'Ru', 'En']) expect(JSON.stringify(res.body)).not.toContain((row as any)[`aiInsight${other}${l}`]);
    };
    await expectFor(farmer, 'Farmer'); await expectFor(driver, 'Driver'); await expectFor(market, 'Market');
    // Admin uchala rolni ko'radi
    const a = (await get(admin)).body.items[0]; expect(Object.keys(a.aiInsights)).toEqual(['farmer', 'driver', 'market']); expect(a.aiInsights.driver.ru).toBe(row.aiInsightDriverRu);
  });

  it("yaratish: faqat Admin/Dispetcher; AI xulosa avtomatik (kalitsiz — shablon), uchala rol × 3 til, ru/en matn uz'ga qaytadi", async () => {
    const farmer = await registerFarmer(t.http);
    expect((await post(farmer, NEWS)).status).toBe(403);
    expect((await t.http().post('/news').send(NEWS)).status).toBe(401);
    for (const role of ['ADMIN', 'DISPATCHER'] as const) {
      const staff = await createAdmin(t, role);
      const r = await post(staff, { ...NEWS, titleUz: NEWS.titleUz + ' ' + role });
      expect(r.status).toBe(201);
      expect(r.body.aiSource).toBe('template');
      expect(r.body.titleRu).toBe(r.body.titleUz); // tarjima berilmasa uz matni
      for (const k of ['farmer', 'driver', 'market']) for (const l of ['uz', 'ru', 'en']) expect(r.body.aiInsights[k][l].length).toBeGreaterThan(40);
      expect(r.body.aiInsights.driver.uz).toMatch(/dovon|tezlik|zanjir|shina/i); // «qor/tuman/dovon» kalit so'zlari tufayli ob-havo maslahati
      expect(r.body.aiInsights.driver.uz).toContain("Farg'ona");
    }
    expect((await t.prisma.agroNews.count())).toBe(2);
  });

  it("validatsiya: noto'g'ri kategoriya, qisqa sarlavha, AI xulosani qo'lda yuborib bo'lmaydi", async () => {
    const admin = await createAdmin(t);
    expect((await post(admin, { ...NEWS, category: 'SPORT' })).status).toBe(400);
    expect((await post(admin, { ...NEWS, titleUz: 'abc' })).status).toBe(400);
    const forged = await post(admin, { ...NEWS, aiInsightFarmerUz: 'soxta matn' });
    if (forged.status === 201) expect((await t.prisma.agroNews.findUniqueOrThrow({ where: { id: forged.body.id } })).aiInsightFarmerUz).not.toBe('soxta matn'); // qo'lda yuborilgan xulosa e'tiborga olinmaydi
    else expect(forged.status).toBe(400);
  });

  it("filtr: kategoriya va hudud; faqat faol yangiliklar; admin includeInactive bilan hammasini ko'radi", async () => {
    const admin = await createAdmin(t);
    const a = (await post(admin, NEWS)).body;
    const b = (await post(admin, { ...NEWS, titleUz: 'Toshkent bozorida narx oshdi', category: 'MARKET', region: 'Toshkent' })).body;
    const c = (await post(admin, { ...NEWS, titleUz: 'Yashirin yangilik matni', category: 'AGRO', region: 'Samarqand', isActive: false })).body;
    expect((await get(undefined, '?category=MARKET')).body.items.map((x: any) => x.id)).toEqual([b.id]);
    expect((await get(undefined, '?region=' + encodeURIComponent("Farg'ona"))).body.items.map((x: any) => x.id)).toEqual([a.id]);
    expect((await get(undefined, '?category=AGRO')).body.items).toEqual([]); // faol emas
    expect((await get(undefined, '?category=XXX')).status).toBe(400);
    expect((await get(undefined, '?includeInactive=true')).body.items.length).toBe(2); // mehmon uchun e'tiborga olinmaydi
    expect((await get(admin, '?includeInactive=true')).body.items.length).toBe(3);
    const farmer = await registerFarmer(t.http); expect((await get(farmer, '?includeInactive=true')).body.items.length).toBe(2);
    expect(c.isActive).toBe(false);
  });

  it("tahrirlash: matn/kategoriya o'zgarsa AI xulosa qayta hosil bo'ladi; faollik o'zgarishi xulosani o'zgartirmaydi; o'chirish", async () => {
    const admin = await createAdmin(t); const farmer = await registerFarmer(t.http);
    const n = (await post(admin, NEWS)).body;
    const before = await t.prisma.agroNews.findUniqueOrThrow({ where: { id: n.id } });
    expect((await t.http().patch(`/news/${n.id}`).set('Authorization', bearer(farmer)).send({ isActive: false })).status).toBe(403);
    const off = await t.http().patch(`/news/${n.id}`).set('Authorization', bearer(admin)).send({ isActive: false });
    expect(off.status).toBe(200); expect((await t.prisma.agroNews.findUniqueOrThrow({ where: { id: n.id } })).aiInsightDriverUz).toBe(before.aiInsightDriverUz);
    expect((await get()).body.items).toEqual([]);
    await t.http().patch(`/news/${n.id}`).set('Authorization', bearer(admin)).send({ isActive: true });
    const ch = await t.http().patch(`/news/${n.id}`).set('Authorization', bearer(admin)).send({ category: 'MARKET', titleUz: "Toshkentda talab oshdi va narx ko'tarildi" });
    expect(ch.status).toBe(200); expect(ch.body.category).toBe('MARKET'); expect(ch.body.aiInsights.farmer.uz).not.toBe(before.aiInsightFarmerUz);
    expect((await t.http().patch('/news/00000000-0000-4000-8000-000000000000').set('Authorization', bearer(admin)).send({ isActive: false })).status).toBe(404);
    expect((await t.http().delete(`/news/${n.id}`).set('Authorization', bearer(farmer))).status).toBe(403);
    expect((await t.http().delete(`/news/${n.id}`).set('Authorization', bearer(admin))).status).toBe(200);
    expect((await t.http().delete(`/news/${n.id}`).set('Authorization', bearer(admin))).status).toBe(404);
  });

  it("staff harakatlari auditga yoziladi", async () => {
    const admin = await createAdmin(t); await post(admin, NEWS);
    expect(await t.prisma.auditLog.count()).toBeGreaterThan(0);
  });
});
