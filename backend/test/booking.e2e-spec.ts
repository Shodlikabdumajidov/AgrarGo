import {
  approve, book, bearer, bootApp, createProduct, nextPhone, registerDriver, registerFarmer, registerMarket, resetDb, TestApp,
} from './helpers';

describe('Booking (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const productOf = (farmer: any, id: string) =>
    t.http().get(`/products/${id}`).set('Authorization', bearer(farmer)).then((r) => r.body);

  it("faqat MARKET bron qila oladi: fermer, haydovchi va tokensiz so'rov rad etiladi", async () => {
    const farmer = await registerFarmer(t.http);
    const driver = await registerDriver(t.http);
    const p = await createProduct(t.http, farmer);

    expect((await book(t.http, farmer, p.id, 10)).status).toBe(403);
    expect((await book(t.http, driver, p.id, 10)).status).toBe(403);
    expect((await t.http().post('/bookings').send({ productId: p.id, quantityKg: 10 })).status).toBe(401);
  });

  it("qisman miqdor: qoldiq kamayadi, narx bron paytida qotiriladi, telefon yashirin", async () => {
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const p = await createProduct(t.http, farmer, { quantityKg: 500, pricePerKg: 4500 });

    const res = await book(t.http, market, p.id, 150.5, 'Ertaga yetkazing');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING', quantityKg: '150.5', pricePerKg: '4500', totalPrice: '677250', message: 'Ertaga yetkazing' });
    expect(res.body.farmer.phone).toBeNull();

    expect((await productOf(farmer, p.id)).quantityKg).toBe('349.5');
    // narx keyin o'zgarsa ham bron narxi o'zgarmaydi
    await t.http().put(`/products/${p.id}`).set('Authorization', bearer(farmer)).send({ pricePerKg: 9999 });
    const mine = await t.http().get('/bookings/mine').set('Authorization', bearer(market));
    expect(mine.body[0].pricePerKg).toBe('4500');
  });

  it("qoldiqdan ko'p, 0 yoki manfiy miqdor rad etiladi; mavjud bo'lmagan e'lon 404", async () => {
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const p = await createProduct(t.http, farmer, { quantityKg: 100 });

    const tooMuch = await book(t.http, market, p.id, 100.01);
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.message).toMatch(/Mavjud: 100 kg/);
    expect((await book(t.http, market, p.id, 0)).status).toBe(400);
    expect((await book(t.http, market, p.id, -5)).status).toBe(400);
    expect((await book(t.http, market, '00000000-0000-4000-8000-000000000000', 1)).status).toBe(404);
    expect((await productOf(farmer, p.id)).quantityKg).toBe('100');
  });

  it("qoldiq tugasa e'lon BOOKED bo'ladi va bozordan chiqadi; rad etilsa qaytadi", async () => {
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const p = await createProduct(t.http, farmer, { name: 'Bodring', quantityKg: 100 });

    const b = (await book(t.http, market, p.id, 100)).body;
    expect(await productOf(farmer, p.id)).toMatchObject({ status: 'BOOKED', quantityKg: '0' });
    expect((await t.http().get('/marketplace?q=Bodring')).body.items).toHaveLength(0);

    const rejected = await t.http().patch(`/bookings/${b.id}/reject`).set('Authorization', bearer(farmer));
    expect(rejected.body.status).toBe('REJECTED');
    expect(await productOf(farmer, p.id)).toMatchObject({ status: 'ACTIVE', quantityKg: '100' });
    expect((await t.http().get('/marketplace?q=Bodring')).body.items).toHaveLength(1);
  });

  it("bekor qilish miqdorni qaytaradi; arxivlangan e'lon qayta faol bo'lib ketmaydi", async () => {
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const p = await createProduct(t.http, farmer, { quantityKg: 100 });
    const b = (await book(t.http, market, p.id, 40)).body;

    await t.http().put(`/products/${p.id}`).set('Authorization', bearer(farmer)).send({ status: 'ARCHIVED' });
    expect((await book(t.http, market, p.id, 10)).status).toBe(404); // arxivlangan e'lonni bron qilib bo'lmaydi

    const cancelled = await t.http().patch(`/bookings/${b.id}/cancel`).set('Authorization', bearer(market));
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(await productOf(farmer, p.id)).toMatchObject({ status: 'ARCHIVED', quantityKg: '100' });
  });

  it("telefon raqamlar faqat tasdiqlangandan keyin, ikkala tomonga ochiladi", async () => {
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const p = await createProduct(t.http, farmer);
    const b = (await book(t.http, market, p.id, 50)).body;

    const before = await t.http().get('/bookings/incoming').set('Authorization', bearer(farmer));
    expect(before.body[0].market.phone).toBeNull();

    const approved = await approve(t.http, farmer, b.id);
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', market: { phone: market.phone } });

    const mine = await t.http().get('/bookings/mine').set('Authorization', bearer(market));
    expect(mine.body[0].farmer.phone).toBe(farmer.phone);
  });

  it("qaror faqat bir marta: ikkinchi tasdiq/rad/bekor 409; tasdiqlangan bronni bekor qilib bo'lmaydi", async () => {
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const p = await createProduct(t.http, farmer);
    const b = (await book(t.http, market, p.id, 50)).body;

    await approve(t.http, farmer, b.id);
    expect((await approve(t.http, farmer, b.id)).status).toBe(409);
    expect((await t.http().patch(`/bookings/${b.id}/reject`).set('Authorization', bearer(farmer))).status).toBe(409);
    expect((await t.http().patch(`/bookings/${b.id}/cancel`).set('Authorization', bearer(market))).status).toBe(409);
    expect((await productOf(farmer, p.id)).quantityKg).toBe('450');
  });

  it("begona foydalanuvchilar bronga tegina olmaydi (404), rollar almashtirib bo'lmaydi (403)", async () => {
    const farmer = await registerFarmer(t.http);
    const otherFarmer = await registerFarmer(t.http, { phone: nextPhone() });
    const market = await registerMarket(t.http);
    const otherMarket = await registerMarket(t.http, { phone: nextPhone(), companyName: 'Makro' });
    const p = await createProduct(t.http, farmer);
    const b = (await book(t.http, market, p.id, 10)).body;

    expect((await approve(t.http, otherFarmer, b.id)).status).toBe(404);
    expect((await t.http().patch(`/bookings/${b.id}/cancel`).set('Authorization', bearer(otherMarket))).status).toBe(404);
    expect((await t.http().patch(`/bookings/${b.id}/approve`).set('Authorization', bearer(market))).status).toBe(403);
    expect((await t.http().get('/bookings/incoming').set('Authorization', bearer(market))).status).toBe(403);
    expect((await t.http().get('/bookings/mine').set('Authorization', bearer(otherMarket))).body).toHaveLength(0);
    expect((await t.http().get('/bookings/incoming').set('Authorization', bearer(otherFarmer))).body).toHaveLength(0);
  });

  it("parallel bronlar qoldiqni manfiyga tushirmaydi (10 ta so'rov, 30 kg x 10, qoldiq 100 kg)", async () => {
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const p = await createProduct(t.http, farmer, { quantityKg: 100 });

    const results = await Promise.all(Array.from({ length: 10 }, () => book(t.http, market, p.id, 30)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    expect((await productOf(farmer, p.id)).quantityKg).toBe('10');
  });

  it("faol bronli e'lonni o'chirib bo'lmaydi; tugallangan bronlar tarixi bilan o'chadi", async () => {
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const p = await createProduct(t.http, farmer);
    const b = (await book(t.http, market, p.id, 10)).body;

    expect((await t.http().delete(`/products/${p.id}`).set('Authorization', bearer(farmer))).status).toBe(409);
    await t.http().patch(`/bookings/${b.id}/reject`).set('Authorization', bearer(farmer));
    expect((await t.http().delete(`/products/${p.id}`).set('Authorization', bearer(farmer))).status).toBe(200);
    expect(await t.prisma.booking.count()).toBe(0);
  });

  it("ochiq bozor (marketplace) hech qachon telefon, manzil yoki STIR oshkor qilmaydi", async () => {
    const farmer = await registerFarmer(t.http, { stir: '123456789', address: "Maxfiy ko'cha 77" });
    await createProduct(t.http, farmer);

    const res = await t.http().get('/marketplace');
    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    for (const secret of [farmer.phone, '998', "Maxfiy ko'cha", '123456789', 'passwordHash', 'email']) {
      expect(raw).not.toContain(secret);
    }
    expect(res.body.items[0].farmer).toMatchObject({ farmName: 'Ali Agro', region: 'Samarqand' });
  });
});
