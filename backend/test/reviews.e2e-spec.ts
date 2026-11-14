import { bearer, bootApp, createAdmin, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

describe('Reviews (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const post = (who: any, body: object) => t.http().post('/reviews').set('Authorization', bearer(who)).send(body);
  const GOOD = { rating: 5, comment: "AgrarGo orqali mahsulotimni to'g'ridan-to'g'ri do'konlarga sotyapman." };

  it("tokensiz ro'yxat ochiq; bo'sh baza: nol statistika", async () => {
    const res = await t.http().get('/reviews');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], stats: { count: 0, average: 0 } });
    expect(res.body.stats.byRole.FARMER).toMatchObject({ count: 0, average: 0 });
  });

  it("sharh qoldirish: faqat tizimga kirganlar; ochiq ko'rinishda faqat ism bosh harfi, rol, viloyat", async () => {
    expect((await t.http().post('/reviews').send(GOOD)).status).toBe(401);
    const farmer = await registerFarmer(t.http, { fullName: 'Shavkat Rahimov', region: 'Samarqand' });
    const res = await post(farmer, GOOD);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Shavkat R.', role: 'FARMER', region: 'Samarqand', rating: 5, comment: GOOD.comment });

    const list = (await t.http().get('/reviews')).body;
    expect(list.items).toHaveLength(1);
    const json = JSON.stringify(list);
    expect(json).not.toContain(farmer.phone);
    expect(json).not.toContain(farmer.user.id);
    expect(json).not.toContain('Rahimov');
    expect(list.stats).toMatchObject({ count: 1, average: 5 });
    expect(list.stats.byRole.FARMER).toMatchObject({ count: 1, average: 5 });
    expect(list.stats.byRole.FARMER.distribution.find((d: any) => d.rating === 5).count).toBe(1);
  });

  it("bitta foydalanuvchi — bitta sharh: qayta yuborsa yangilanadi; o'zinikini ko'radi va o'chiradi", async () => {
    const m = await registerMarket(t.http);
    expect((await t.http().get('/reviews/mine').set('Authorization', bearer(m))).body.review).toBeNull();
    await post(m, { rating: 3, comment: 'Yaxshi, lekin yaxshilash mumkin bo\'lgan joylar bor.' });
    await post(m, { rating: 4, comment: "Yangilandi: endi ancha yaxshi ishlayapti, rahmat." });
    expect(await t.prisma.review.count()).toBe(1);
    const mine = (await t.http().get('/reviews/mine').set('Authorization', bearer(m))).body.review;
    expect(mine).toMatchObject({ rating: 4, isApproved: true });
    expect((await t.http().delete('/reviews/mine').set('Authorization', bearer(m)))).toMatchObject({ status: 200 });
    expect(await t.prisma.review.count()).toBe(0);
  });

  it("tekshiruv: baho 1..5, izoh 10..500, havolalar va takrorlanuvchi belgilar rad etiladi; dispetcher/admin yoza olmaydi", async () => {
    const d = await registerDriver(t.http);
    for (const rating of [0, 6, 2.5, 'x', null]) expect((await post(d, { ...GOOD, rating })).status).toBe(400);
    expect((await post(d, { rating: 5, comment: 'qisqa' })).status).toBe(400);
    expect((await post(d, { rating: 5, comment: 'a'.repeat(501) })).status).toBe(400);
    expect((await post(d, { rating: 5, comment: '   ' + ' '.repeat(20) })).status).toBe(400);
    for (const bad of ['Ajoyib! Bizga qarang https://spam.example', 'Yozing @spam_account va pul oling', 'Sayt: kazino-top.com ga kiring', 'aaaaaaaaaaaaaaaaaaaa', 't.me/joinchat orqali kiring']) {
      expect((await post(d, { rating: 5, comment: bad })).status).toBe(400);
    }
    expect((await post(d, { rating: 5 })).status).toBe(400);
    expect(await t.prisma.review.count()).toBe(0);
    const disp = await createAdmin(t, 'DISPATCHER');
    expect((await post(disp, GOOD)).status).toBe(403);
  });

  it("XSS: matn o'zgartirilmaydi, lekin API faqat JSON qaytaradi (frontend textContent bilan chizadi); boshqaruv belgilari olib tashlanadi", async () => {
    const f = await registerFarmer(t.http);
    const res = await post(f, { rating: 5, comment: "<img src=x onerror=alert(1)> juda zo'r\u0000‮ xizmat" });
    expect(res.status).toBe(201);
    expect(res.body.comment).toBe("<img src=x onerror=alert(1)> juda zo'r xizmat");
    expect((await t.http().get('/reviews')).headers['content-type']).toMatch(/json/);
  });

  it("boshqa foydalanuvchining aynan shu matnini takrorlash rad etiladi (ommaviy spam)", async () => {
    const a = await registerFarmer(t.http), b = await registerFarmer(t.http);
    expect((await post(a, GOOD)).status).toBe(201);
    expect((await post(b, GOOD)).status).toBe(409);
    expect((await post(a, GOOD)).status).toBe(201); // o'zi qayta yuborsa mumkin
  });

  it("ro'yxat: yangilari birinchi, rol bo'yicha filtr, limit; statistika taqsimoti", async () => {
    const f = await registerFarmer(t.http), m = await registerMarket(t.http), d = await registerDriver(t.http);
    await post(f, { rating: 5, comment: 'Fermer uchun juda qulay platforma ekan.' });
    await new Promise((r) => setTimeout(r, 15));
    await post(m, { rating: 4, comment: "Market sifatida yangi mahsulotni tez topdik." });
    await new Promise((r) => setTimeout(r, 15));
    await post(d, { rating: 2, comment: 'Haydovchi sifatida xarita ba\'zan sekin ishladi.' });
    const all = (await t.http().get('/reviews')).body;
    expect(all.items.map((i: any) => i.role)).toEqual(['DRIVER', 'MARKET', 'FARMER']);
    expect(all.stats).toMatchObject({ count: 3, average: 3.7 });
    expect(all.stats.distribution.find((x: any) => x.rating === 5).count).toBe(1);
    expect(all.stats.byRole.DRIVER).toMatchObject({ count: 1, average: 2 });
    expect(all.stats.byRole.DRIVER.distribution.find((x: any) => x.rating === 2).count).toBe(1);
    expect(all.stats.byRole.DRIVER.distribution.find((x: any) => x.rating === 5).count).toBe(0);
    expect((await t.http().get('/reviews?role=MARKET')).body.items).toHaveLength(1);
    expect((await t.http().get('/reviews?limit=2')).body.items).toHaveLength(2);
    expect((await t.http().get('/reviews?role=ADMIN')).status).toBe(400);
    expect((await t.http().get('/reviews?limit=999')).status).toBe(400);
  });

  it("moderatsiya: admin yashirsa ochiq ro'yxatdan va statistikadan chiqadi; o'chirsa yo'qoladi; faqat ADMIN", async () => {
    const f = await registerFarmer(t.http);
    const id = (await post(f, GOOD)).body.id;
    const admin = await createAdmin(t, 'ADMIN');
    const disp = await createAdmin(t, 'DISPATCHER');
    const adm = (m: 'get' | 'patch' | 'delete', who: any, path: string, body?: object) => { const r = t.http()[m](path).set('Authorization', bearer(who)); return body ? r.send(body) : r; };
    expect((await adm('get', disp, '/admin/reviews')).status).toBe(403);
    expect((await adm('get', f, '/admin/reviews')).status).toBe(403);
    const listed = (await adm('get', admin, '/admin/reviews')).body;
    expect(listed.items[0]).toMatchObject({ id, author: { phone: f.phone } });

    expect((await adm('patch', admin, `/admin/reviews/${id}`, { isApproved: false })).status).toBe(200);
    expect((await t.http().get('/reviews')).body).toMatchObject({ items: [], stats: { count: 0 } });
    expect((await adm('get', admin, '/admin/reviews?state=hidden')).body.total).toBe(1);
    expect((await t.http().get('/reviews/mine').set('Authorization', bearer(f))).body.review.isApproved).toBe(false);
    expect((await adm('patch', admin, `/admin/reviews/${id}`, { isApproved: true })).status).toBe(200);
    expect((await t.http().get('/reviews')).body.items).toHaveLength(1);
    expect((await adm('delete', admin, `/admin/reviews/${id}`)).status).toBe(200);
    expect((await adm('delete', admin, `/admin/reviews/${id}`)).status).toBe(404);
    expect(await t.prisma.auditLog.count({ where: { entity: 'review' } })).toBe(3);
  });

  it("REVIEWS_AUTO_APPROVE=false: yangi sharh admin tasdiqlaguncha ko'rinmaydi", async () => {
    const strict = await bootApp({ REVIEWS_AUTO_APPROVE: 'false' });
    try {
      const f = await registerFarmer(strict.http);
      const r = await strict.http().post('/reviews').set('Authorization', bearer(f)).send(GOOD);
      expect(r.status).toBe(201);
      expect(r.body.isApproved).toBe(false);
      expect((await strict.http().get('/reviews')).body.items).toHaveLength(0);
    } finally { await strict.close(); }
  });

  it("rate-limit: yozish foydalanuvchi bo'yicha, o'qish IP bo'yicha", async () => {
    const limited = await bootApp({ THROTTLE_REVIEW_LIMIT: '2', THROTTLE_REVIEW_READ_LIMIT: '3' });
    try {
      const f = await registerFarmer(limited.http);
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await limited.http().post('/reviews').set('Authorization', bearer(f)).send({ ...GOOD, comment: GOOD.comment + ' ' + i })).status);
      expect(codes).toEqual([201, 201, 429]);
      const reads: number[] = [];
      for (let i = 0; i < 4; i++) reads.push((await limited.http().get('/reviews')).status);
      expect(reads).toEqual([200, 200, 200, 429]);
    } finally { await limited.close(); }
  });

  it("bazaviy cheklovlar: baho va izoh uzunligi bazada ham tekshiriladi", async () => {
    const f = await registerFarmer(t.http);
    await expect(t.prisma.review.create({ data: { userId: f.user.id, role: 'FARMER', rating: 9, comment: 'yetarlicha uzun izoh matni' } })).rejects.toThrow();
    await expect(t.prisma.review.create({ data: { userId: f.user.id, role: 'FARMER', rating: 5, comment: 'qisqa' } })).rejects.toThrow();
  });
});
