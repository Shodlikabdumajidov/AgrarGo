import {
  approve, book, bearer, bootApp, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp,
} from './helpers';

describe('Shipment (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  /** Fermer, market, mahsulot va tasdiqlangan bron: yuk tayyor */
  async function setup(weights: number[] = [800], opts: { paid?: boolean } = {}) {
    const { paid = true } = opts;
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const product = await createProduct(t.http, farmer, { quantityKg: 10000 });
    for (const w of weights) {
      const b = (await book(t.http, market, product.id, w)).body;
      await approve(t.http, farmer, b.id);
      if (paid) expect((await pay(t.http, market, b.id)).status).toBe(200); // yuk faqat to'lov escrow'ga o'tgach olinadi
    }
    return { farmer, market, product };
  }

  const available = (driver: any, qs = '') => t.http().get(`/shipments/available${qs}`).set('Authorization', bearer(driver));
  const act = (m: 'post' | 'patch', driver: any, id: string, what: string) =>
    t.http()[m](`/shipments/${id}/${what}`).set('Authorization', bearer(driver));

  it("haydovchi uchun filtrlar: yo'nalish (qayerga), yuk turi va tonnaj (kg) bo'yicha", async () => {
    await setup([300, 800, 2500]);
    const driver = await registerDriver(t.http);
    const ids = async (qs: string) => (await available(driver, qs)).body.map((x: any) => Number(x.weightKg)).sort((a: number, b: number) => a - b);
    expect(await ids('')).toEqual([300, 800, 2500]);
    expect(await ids('?minKg=500&maxKg=1000')).toEqual([800]);
    expect(await ids('?minKg=1000')).toEqual([2500]);
    expect(await ids('?maxKg=1000')).toEqual([300, 800]);
    const first = (await available(driver)).body[0];
    expect(await ids(`?destRegion=${encodeURIComponent(first.destination.region)}`)).toEqual([300, 800, 2500]);
    expect(await ids('?destRegion=Xorazm')).toEqual([]);
    expect(await ids(`?category=${encodeURIComponent(first.category.toLowerCase())}`)).toEqual([300, 800, 2500]); // registrga befarq
    expect(await ids('?category=Meva-yo-q')).toEqual([]);
    expect((await available(driver, '?minKg=abc')).status).toBe(400);
    expect(await ids('?originRegion=&destRegion=&category=&minKg=&maxKg=')).toEqual([300, 800, 2500]); // bo'sh qiymatlar filtr emas
  });

  it("bron tasdiqlanganda yuk avtomatik yaratiladi (bir marta) va ma'lumotlar nusxalanadi", async () => {
    const { farmer, market, product } = await setup([]);
    const b = (await book(t.http, market, product.id, 300)).body;
    expect(await t.prisma.shipment.count()).toBe(0); // tasdiqlanmaguncha yuk yo'q

    await approve(t.http, farmer, b.id);
    await approve(t.http, farmer, b.id); // takroriy tasdiq yangi yuk yaratmaydi
    const shipments = await t.prisma.shipment.findMany({ include: { events: true } });
    expect(shipments).toHaveLength(1);
    expect(shipments[0]).toMatchObject({
      status: 'OPEN', driverId: null, cargoName: 'Pomidor', originRegion: 'Samarqand', destRegion: 'Toshkent shahri',
    });
    expect(shipments[0].weightKg.toString()).toBe('300');
    expect(shipments[0].events.map((e) => e.status)).toEqual(['OPEN']);
  });

  it("rad etilgan yoki bekor qilingan bronlar uchun yuk yaratilmaydi", async () => {
    const { farmer, market, product } = await setup([]);
    const b = (await book(t.http, market, product.id, 10)).body;
    await t.http().patch(`/bookings/${b.id}/reject`).set('Authorization', bearer(farmer));
    expect(await t.prisma.shipment.count()).toBe(0);
  });

  it("bo'sh yuklar: faqat haydovchi ko'radi; manzil va telefonlar yashirin", async () => {
    const { farmer, market } = await setup([800]);
    const driver = await registerDriver(t.http);

    expect((await available(farmer)).status).toBe(403);
    expect((await available(market)).status).toBe(403);
    expect((await t.http().get('/shipments/available')).status).toBe(401);

    const res = await available(driver);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      status: 'OPEN', weightKg: '800', fitsCapacity: true,
      origin: { region: 'Samarqand', district: 'Urgut', address: null },
      destination: { region: 'Toshkent shahri', address: null },
      farmer: null, market: null, driver: null,
    });
    const raw = JSON.stringify(res.body);
    for (const secret of [farmer.phone, market.phone, "Dehqon ko'chasi", 'Bunyodkor']) expect(raw).not.toContain(secret);
  });

  it("viloyat bo'yicha filtr ishlaydi", async () => {
    await setup([800]);
    const driver = await registerDriver(t.http);
    expect((await available(driver, '?originRegion=samarqand')).body).toHaveLength(1);
    expect((await available(driver, '?originRegion=Toshkent shahri')).body).toHaveLength(0);
  });

  it("sig'imdan og'ir yukni olib bo'lmaydi; fitsCapacity bayrog'i to'g'ri", async () => {
    await setup([800, 1500]);
    const small = await registerDriver(t.http, { capacityKg: 1000 });
    const list = (await available(small)).body;
    const heavy = list.find((s: any) => s.weightKg === '1500');
    expect(list.find((s: any) => s.weightKg === '800').fitsCapacity).toBe(true);
    expect(heavy.fitsCapacity).toBe(false);

    const res = await act('post', small, heavy.id, 'accept');
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/sig'imidan/);
  });

  it("to'liq oqim: accept → LOADING → IN_TRANSIT → DELIVERED, tarix yoziladi", async () => {
    await setup([800]);
    const driver = await registerDriver(t.http);
    const id = (await available(driver)).body[0].id;

    const accepted = await act('post', driver, id, 'accept');
    expect(accepted.status).toBe(201);
    expect(accepted.body.status).toBe('LOADING');
    expect(accepted.body.origin.address).toBe("Dehqon ko'chasi 5"); // biriktirgandan keyin manzil ochiladi
    expect(accepted.body.farmer.phone).toEqual(expect.stringMatching(/^\+998/));
    expect(accepted.body.market.phone).toEqual(expect.stringMatching(/^\+998/));

    const transit = await act('patch', driver, id, 'advance');
    expect(transit.body.status).toBe('IN_TRANSIT');

    const delivered = await act('patch', driver, id, 'advance');
    expect(delivered.body.status).toBe('DELIVERED');
    expect(delivered.body.deliveredAt).toEqual(expect.any(String));
    expect(delivered.body.events.map((e: any) => e.status)).toEqual(['OPEN', 'LOADING', 'IN_TRANSIT', 'DELIVERED']);

    expect((await act('patch', driver, id, 'advance')).status).toBe(409); // yetkazilgandan keyin o'zgarmaydi
    expect((await t.http().get('/shipments/mine?status=DELIVERED').set('Authorization', bearer(driver))).body).toHaveLength(1);
  });

  it("qaytarish (release): faqat yo'lga chiqishdan oldin; yuk yana bo'sh yuklarga qaytadi", async () => {
    await setup([800]);
    const driver = await registerDriver(t.http);
    const other = await registerDriver(t.http);
    const id = (await available(driver)).body[0].id;

    await act('post', driver, id, 'accept');
    expect((await available(other)).body).toHaveLength(0); // olingan yuk boshqalarga ko'rinmaydi

    expect((await act('post', other, id, 'release')).status).toBe(404); // begona haydovchi qaytara olmaydi
    const released = await act('post', driver, id, 'release');
    expect(released.body).toMatchObject({ status: 'OPEN' });
    expect((await available(other)).body).toHaveLength(1);

    await act('post', driver, id, 'accept');
    await act('patch', driver, id, 'advance');
    expect((await act('post', driver, id, 'release')).status).toBe(409); // yo'lda qaytarib bo'lmaydi
  });

  it("begona haydovchi yuk holatini o'zgartira olmaydi; fermer/market haydovchi amallarini bajara olmaydi", async () => {
    const { farmer, market } = await setup([800]);
    const driver = await registerDriver(t.http);
    const other = await registerDriver(t.http);
    const id = (await available(driver)).body[0].id;
    await act('post', driver, id, 'accept');

    expect((await act('patch', other, id, 'advance')).status).toBe(404);
    expect((await act('patch', farmer, id, 'advance')).status).toBe(403);
    expect((await act('post', market, id, 'accept')).status).toBe(403);
    expect((await t.http().get('/shipments/mine').set('Authorization', bearer(other))).body).toHaveLength(0);
  });

  it("bir vaqtda faqat bitta faol yuk: ikkinchisi rad etiladi, yetkazgandan keyin yana olish mumkin", async () => {
    await setup([300, 400]);
    const driver = await registerDriver(t.http);
    const [a, b] = (await available(driver)).body;

    expect((await act('post', driver, a.id, 'accept')).status).toBe(201);
    const second = await act('post', driver, b.id, 'accept');
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/yakunlanmagan/);

    await act('patch', driver, a.id, 'advance');
    await act('patch', driver, a.id, 'advance');
    expect((await act('post', driver, b.id, 'accept')).status).toBe(201);
  });

  it("poyga: bir yukka 3 ta so'rov — faqat bittasi oladi; bir haydovchi 2 yukka — faqat bittasini", async () => {
    await setup([300, 400]);
    const d1 = await registerDriver(t.http);
    const d2 = await registerDriver(t.http);
    const [a, b] = (await available(d1)).body;

    const race = await Promise.all([act('post', d1, a.id, 'accept'), act('post', d2, a.id, 'accept'), act('post', d2, a.id, 'accept')]);
    expect(race.filter((r) => r.status === 201)).toHaveLength(1);

    const d3 = await registerDriver(t.http);
    const mixed = await Promise.all([act('post', d3, b.id, 'accept'), act('post', d3, (await available(d3)).body[0]?.id ?? b.id, 'accept')]);
    expect(mixed.filter((r) => r.status === 201).length).toBeLessThanOrEqual(1);
    expect(await t.prisma.shipment.count({ where: { driverId: d3.user.driver.id, status: { in: ['LOADING', 'IN_TRANSIT'] } } })).toBeLessThanOrEqual(1);
  });

  it("fermer va market o'z yuklarini haydovchi ma'lumoti bilan ko'radi", async () => {
    const { farmer, market } = await setup([800]);
    const driver = await registerDriver(t.http);
    const id = (await available(driver)).body[0].id;

    const before = (await t.http().get('/shipments/mine').set('Authorization', bearer(farmer))).body[0];
    expect(before).toMatchObject({ status: 'OPEN', driver: null, market: { phone: market.phone } });

    await act('post', driver, id, 'accept');
    const f = (await t.http().get('/shipments/mine').set('Authorization', bearer(farmer))).body[0];
    expect(f).toMatchObject({ status: 'LOADING', driver: { phone: driver.phone, plateNumber: driver.user.driver.plateNumber }, farmer: null });
    const m = (await t.http().get('/shipments/mine').set('Authorization', bearer(market))).body[0];
    expect(m).toMatchObject({ driver: { phone: driver.phone }, farmer: { phone: farmer.phone }, market: null });
  });

  it("boshqa fermer/market begona yuklarni ko'rmaydi", async () => {
    await setup([800]);
    const strangerFarmer = await registerFarmer(t.http);
    const strangerMarket = await registerMarket(t.http, { companyName: 'Makro' });
    expect((await t.http().get('/shipments/mine').set('Authorization', bearer(strangerFarmer))).body).toHaveLength(0);
    expect((await t.http().get('/shipments/mine').set('Authorization', bearer(strangerMarket))).body).toHaveLength(0);
  });

  it("to'lov kafolatlanmaguncha yukni olib bo'lmaydi; to'langach olish mumkin", async () => {
    const { market } = await setup([300], { paid: false });
    const driver = await registerDriver(t.http);
    const [s] = (await available(driver)).body;
    expect(s.paymentStatus).toBe('PENDING');

    const blocked = await act('post', driver, s.id, 'accept');
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/to'lovi hali kafolatlanmagan/);

    const booking = await t.prisma.booking.findFirstOrThrow();
    await pay(t.http, market, booking.id);
    expect((await available(driver)).body[0].paymentStatus).toBe('HELD');
    expect((await act('post', driver, s.id, 'accept')).status).toBe(201);
  });

  it("noto'g'ri status filtri va identifikator 400", async () => {
    await setup([100]);
    const driver = await registerDriver(t.http);
    expect((await t.http().get('/shipments/mine?status=BAD').set('Authorization', bearer(driver))).status).toBe(400);
    expect((await act('post', driver, 'not-a-uuid', 'accept')).status).toBe(400);
  });
});
