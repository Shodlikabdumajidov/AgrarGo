import { bearer, bootApp, createAdmin, createProduct, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

const DAY = 24 * 60 * 60 * 1000;

describe('Obuna va 1 oylik bepul sinov (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const expire = (id: string) => t.prisma.user.update({ where: { id }, data: { trialEndsAt: new Date(Date.now() - DAY), subscriptionEndsAt: null } });
  const status = (who: any) => t.http().get('/subscription').set('Authorization', bearer(who));

  it("ro'yxatdan o'tganda 30 kunlik sinov avtomatik beriladi (3 rol), tariflar to'g'ri", async () => {
    const rows = [
      [await registerFarmer(t.http), 49000], [await registerDriver(t.http), 79000], [await registerMarket(t.http), 149000],
    ] as const;
    for (const [who, price] of rows) {
      const r = await status(who);
      expect(r.status).toBe(200);
      expect(r.body.state).toBe('TRIAL');
      expect(r.body.hasAccess).toBe(true);
      expect(r.body.priceUzs).toBe(price);
      expect(r.body.daysLeft).toBeGreaterThanOrEqual(29);
      expect(r.body.daysLeft).toBeLessThanOrEqual(30);
      expect(r.body.plans.map((p: any) => p.monthlyUzs)).toEqual([49000, 79000, 149000]);
    }
    const u = await t.prisma.user.findUnique({ where: { id: rows[0][0].user.id } });
    expect(u!.trialEndsAt!.getTime() - Date.now()).toBeGreaterThan(29 * DAY);
    expect(u!.subscriptionEndsAt).toBeNull();
  });

  it("sinov tugagach: e'lon berish, bron qilish va yuk qabul qilish 402 SUBSCRIPTION_REQUIRED; o'qish ishlaydi", async () => {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http);
    const product = await createProduct(t.http, farmer);
    await Promise.all([farmer, market, driver].map((a) => expire(a.user.id)));

    const p = await t.http().post('/products').set('Authorization', bearer(farmer)).send({ name: 'Olma', category: 'Meva', quantityKg: 100, pricePerKg: 3000 });
    expect(p.status).toBe(402);
    expect(p.body.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(p.body.priceUzs).toBe(49000);

    const b = await t.http().post('/bookings').set('Authorization', bearer(market)).send({ productId: product.id, quantityKg: 10 });
    expect(b.status).toBe(402);

    const a = await t.http().post('/shipments/00000000-0000-4000-8000-000000000000/accept').set('Authorization', bearer(driver));
    expect(a.status).toBe(402);

    expect((await t.http().get('/products').set('Authorization', bearer(farmer))).status).toBe(200); // ko'rish bloklanmaydi
    expect((await status(farmer)).body.state).toBe('EXPIRED');
    // noto'g'ri rol baribir 403 (rol tekshiruvi oldin)
    expect((await t.http().post('/products').set('Authorization', bearer(market)).send({})).status).toBe(403);
  });

  it("to'lov obunani uzaytiradi, funksiyalar qaytadi; qolgan sinov kunlari yo'qolmaydi", async () => {
    const farmer = await registerFarmer(t.http);
    // tugamagan sinov ustiga to'lov: davr sinov tugagandan keyin boshlanadi
    const before = (await status(farmer)).body;
    const pay = await t.http().post('/subscription/pay').set('Authorization', bearer(farmer)).send({ months: 3 });
    expect(pay.status).toBe(200);
    expect(pay.body.payment.amountUzs).toBe(49000 * 3);
    expect(new Date(pay.body.payment.periodStart).getTime()).toBe(new Date(before.trialEndsAt).getTime());
    expect(pay.body.subscription.state).toBe('ACTIVE');
    expect(pay.body.subscription.daysLeft).toBeGreaterThanOrEqual(119);

    await expire(farmer.user.id); // hammasi tugadi
    expect((await t.http().post('/products').set('Authorization', bearer(farmer)).send({ name: 'Olma', category: 'Meva', quantityKg: 1, pricePerKg: 1 })).status).toBe(402);
    const pay2 = await t.http().post('/subscription/pay').set('Authorization', bearer(farmer)).send({});
    expect(pay2.body.payment.months).toBe(1);
    expect(pay2.body.subscription.state).toBe('ACTIVE');
    expect(pay2.body.subscription.daysLeft).toBe(30);
    expect((await t.http().post('/products').set('Authorization', bearer(farmer)).send({ name: 'Olma', category: 'Meva', quantityKg: 5, pricePerKg: 3000 })).status).toBe(201);

    const hist = await t.http().get('/subscription/history').set('Authorization', bearer(farmer));
    expect(hist.body).toHaveLength(2);
    expect(hist.body[0].amountUzs).toBe(49000);
  });

  it("noto'g'ri muddat va summa mijozdan qabul qilinmaydi; admin obunadan ozod", async () => {
    const market = await registerMarket(t.http);
    for (const months of [0, 2, 13, -1, 'x']) {
      expect((await t.http().post('/subscription/pay').set('Authorization', bearer(market)).send({ months })).status).toBe(400);
    }
    const r = await t.http().post('/subscription/pay').set('Authorization', bearer(market)).send({ months: 1, amount: 1 });
    expect(r.status).toBe(200);
    expect(r.body.payment.amountUzs).toBe(149000); // mijoz yuborgan amount e'tiborga olinmaydi
    const admin = await createAdmin(t);
    expect((await status(admin)).body.state).toBe('EXEMPT');
    expect((await t.http().post('/subscription/pay').set('Authorization', bearer(admin)).send({})).status).toBe(403);
    expect((await t.http().get('/subscription')).status).toBe(401);
  });
});
