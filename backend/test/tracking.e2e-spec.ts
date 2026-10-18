import {
  approve, book, bearer, bootApp, createAdmin, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp,
} from './helpers';

describe('GPS tracking & ELD (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();

  /** Fermer + market + haydovchi; yuk haydovchiga biriktirilgan (LOADING) yoki yo'lda (IN_TRANSIT) */
  async function setup(stage: 'LOADING' | 'IN_TRANSIT' | 'DELIVERED' = 'IN_TRANSIT') {
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const driver = await registerDriver(t.http);
    const product = await createProduct(t.http, farmer, { quantityKg: 10000 });
    const b = (await book(t.http, market, product.id, 500)).body;
    await approve(t.http, farmer, b.id);
    await pay(t.http, market, b.id);
    const id = (await t.http().get('/shipments/available').set('Authorization', bearer(driver))).body[0].id as string;
    await t.http().post(`/shipments/${id}/accept`).set('Authorization', bearer(driver));
    const adv = () => t.http().patch(`/shipments/${id}/advance`).set('Authorization', bearer(driver));
    if (stage !== 'LOADING') await adv();
    if (stage === 'DELIVERED') await adv();
    return { farmer, market, driver, id, adv };
  }

  const send = (who: any, id: string, body: Record<string, unknown>) =>
    t.http().post(`/shipments/${id}/location`).set('Authorization', bearer(who)).send(body);
  const get = (who: any, id: string) => t.http().get(`/shipments/${id}/location`).set('Authorization', bearer(who));

  describe('POST /shipments/:id/location', () => {
    it("yo'ldagi yuk uchun nuqta saqlanadi va oxirgi joylashuv yangilanadi", async () => {
      const { driver, id } = await setup();
      const res = await send(driver, id, { lat: 39.65, lng: 66.96, speedKmh: 55, accuracyM: 12, timestamp: iso(20_000) });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ accepted: true, latest: true });

      const s = await t.prisma.shipment.findUniqueOrThrow({ where: { id } });
      expect(s).toMatchObject({ lastLat: 39.65, lastLng: 66.96, lastSpeedKmh: 55, lastLocationSource: 'GPS' });
      const logs = await t.prisma.locationLog.findMany();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ lat: 39.65, lng: 66.96, accuracyM: 12, source: 'GPS' });
    });

    it('timestampsiz yuborilsa server vaqti olinadi', async () => {
      const { driver, id } = await setup();
      expect((await send(driver, id, { lat: 39.65, lng: 66.96 })).status).toBe(200);
      const log = await t.prisma.locationLog.findFirstOrThrow();
      expect(Math.abs(log.recordedAt.getTime() - Date.now())).toBeLessThan(5000);
    });

    it("faqat YO'LDA holatida: yuklanayotgan, yetkazilgan va bo'sh yukka yuborib bo'lmaydi", async () => {
      const loading = await setup('LOADING');
      const r1 = await send(loading.driver, loading.id, { lat: 39.65, lng: 66.96 });
      expect(r1.status).toBe(409);

      const done = await setup('DELIVERED');
      expect((await send(done.driver, done.id, { lat: 39.65, lng: 66.96 })).status).toBe(409);
      expect(await t.prisma.locationLog.count()).toBe(0);
    });

    it("begona haydovchi 404; fermer/market 403; tokensiz 401", async () => {
      const { farmer, market, id } = await setup();
      const other = await registerDriver(t.http);
      expect((await send(other, id, { lat: 39.65, lng: 66.96 })).status).toBe(404);
      expect((await send(farmer, id, { lat: 39.65, lng: 66.96 })).status).toBe(403);
      expect((await send(market, id, { lat: 39.65, lng: 66.96 })).status).toBe(403);
      expect((await t.http().post(`/shipments/${id}/location`).send({ lat: 1, lng: 1 })).status).toBe(401);
      expect(await t.prisma.locationLog.count()).toBe(0);
    });

    it("noto'g'ri qiymatlar rad etiladi", async () => {
      const { driver, id } = await setup();
      const bad: Record<string, unknown>[] = [
        {}, { lat: 91, lng: 10 }, { lat: -91, lng: 10 }, { lat: 10, lng: 181 }, { lat: 10, lng: -181 },
        { lat: '39.6', lng: 66.9 }, { lat: null, lng: 66.9 }, { lat: 39.6 }, { lat: 39.6, lng: 66.9, speedKmh: -1 },
        { lat: 39.6, lng: 66.9, speedKmh: 500 }, { lat: 39.6, lng: 66.9, accuracyM: -5 },
        { lat: 39.6, lng: 66.9, timestamp: 'kecha' }, { lat: 39.6, lng: 66.9, timestamp: 12345 },
        { lat: 39.6, lng: 66.9, source: 'MAGIC' },
        { lat: 39.6, lng: 66.9, timestamp: new Date(Date.now() + 5 * 60_000).toISOString() }, // kelajak
        { lat: 39.6, lng: 66.9, timestamp: new Date(Date.now() - 20 * 60_000).toISOString() }, // juda eski
      ];
      for (const body of bad) {
        const res = await send(driver, id, body);
        expect([400, 422]).toContain(res.status);
        expect(res.status).toBe(400);
      }
      expect(await t.prisma.locationLog.count()).toBe(0);
    });

    it("begona maydonlar (driverId, status, lastLat) e'tiborga olinmaydi", async () => {
      const { driver, id } = await setup();
      const other = await registerDriver(t.http);
      const res = await send(driver, id, { lat: 39.65, lng: 66.96, driverId: other.user.driver?.id ?? 'x', status: 'DELIVERED', lastLat: 1 });
      expect(res.status).toBe(200);
      const s = await t.prisma.shipment.findUniqueOrThrow({ where: { id } });
      expect(s.status).toBe('IN_TRANSIT');
      expect(s.lastLat).toBe(39.65);
    });

    it("eski nuqta jurnalga yoziladi, lekin oxirgi joylashuvni almashtirmaydi; takroriy nuqta xato emas", async () => {
      const { driver, id } = await setup();
      await send(driver, id, { lat: 39.652, lng: 66.96, timestamp: iso(10_000) });
      const older = await send(driver, id, { lat: 39.651, lng: 66.96, timestamp: iso(30_000) });
      expect(older.body).toMatchObject({ accepted: true, latest: false });

      const dup = await send(driver, id, { lat: 39.652, lng: 66.96, timestamp: iso(10_000) });
      // iso() har chaqirilganda boshqa millisekund bo'lishi mumkin: bir xil vaqtni qo'lda beramiz
      const ts = iso(8_000);
      await send(driver, id, { lat: 39.653, lng: 66.96, timestamp: ts });
      const again = await send(driver, id, { lat: 39.653, lng: 66.96, timestamp: ts });
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ accepted: false, reason: 'duplicate' });
      expect(dup.status).toBe(200);

      const s = await t.prisma.shipment.findUniqueOrThrow({ where: { id } });
      expect(s.lastLat).toBe(39.653);
      expect(await t.prisma.locationLog.count()).toBe(3 + (dup.body.accepted ? 1 : 0));
    });

    it("mantiqsiz sakrash (200 km/soatdan tez) 422 bilan rad etiladi va hech narsa o'zgarmaydi", async () => {
      const { driver, id } = await setup();
      expect((await send(driver, id, { lat: 39.65, lng: 66.96, timestamp: iso(30_000) })).status).toBe(200);
      // 30 soniyada Samarqanddan Toshkentga (~270 km)
      const jump = await send(driver, id, { lat: 41.3, lng: 69.24, timestamp: iso(0) });
      expect(jump.status).toBe(422);
      const s = await t.prisma.shipment.findUniqueOrThrow({ where: { id } });
      expect(s.lastLat).toBe(39.65);
      expect(await t.prisma.locationLog.count()).toBe(1);
      // oddiy harakat o'tadi
      expect((await send(driver, id, { lat: 39.66, lng: 66.96, timestamp: iso(0) })).status).toBe(200);
    });

    it("parallel yuborilgan nuqtalar: hammasi saqlanadi, oxirgisi eng yangisi", async () => {
      const { driver, id } = await setup();
      const base = Date.now() - 50_000;
      const pts = [0, 1, 2, 3, 4, 5].map((i) => ({ lat: 39.65 + i * 0.001, lng: 66.96, timestamp: new Date(base + i * 5000).toISOString() }));
      const results = await Promise.all(pts.map((p) => send(driver, id, p)));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
      expect(await t.prisma.locationLog.count()).toBe(6);
      const s = await t.prisma.shipment.findUniqueOrThrow({ where: { id } });
      expect(s.lastLat).toBeCloseTo(39.655, 6);
    });

    it("yetkazib berish bilan poyga: 500 xato bo'lmaydi; yetkazilgandan keyin joylashuv qabul qilinmaydi", async () => {
      const { driver, id, adv } = await setup();
      const sends = [0, 1, 2, 3].map((i) => send(driver, id, { lat: 39.65 + i * 0.0005, lng: 66.96, timestamp: iso(4000 - i * 1000) }));
      const [adv1, ...rest] = await Promise.all([adv(), ...sends]);
      expect(adv1.status).toBe(200);
      for (const r of rest) expect([200, 409]).toContain(r.status);
      const after = await send(driver, id, { lat: 39.66, lng: 66.96 });
      expect(after.status).toBe(409);
    });

    it("simulyatsiya (SIMULATED) manbasi belgilanadi; server o'chirgan bo'lsa 403", async () => {
      const { driver, id } = await setup();
      expect((await send(driver, id, { lat: 39.65, lng: 66.96, source: 'SIMULATED' })).status).toBe(200);
      expect((await get(driver, id)).body.location.source).toBe('SIMULATED');

      const strict = await bootApp({ LOCATION_ALLOW_SIMULATION: 'false' });
      try {
        const res = await strict.http().post(`/shipments/${id}/location`).set('Authorization', bearer(driver)).send({ lat: 39.651, lng: 66.96, source: 'SIMULATED' });
        expect(res.status).toBe(403);
        const ok = await strict.http().post(`/shipments/${id}/location`).set('Authorization', bearer(driver)).send({ lat: 39.65, lng: 66.96 });
        expect(ok.status).toBe(200);
        expect((await strict.http().get(`/shipments/${id}/location`).set('Authorization', bearer(driver))).body.simulationAllowed).toBe(false);
      } finally {
        await strict.close();
      }
    });

    it("rate-limit: haydovchi bo'yicha; boshqa haydovchiga ta'sir qilmaydi", async () => {
      const limited = await bootApp({ THROTTLE_LOCATION_LIMIT: '3' });
      try {
        const { driver, id } = await setup();
        const post = (who: any, i: number) =>
          limited.http().post(`/shipments/${id}/location`).set('Authorization', bearer(who)).send({ lat: 39.65 + i * 0.0001, lng: 66.96, timestamp: iso(1000 - i) });
        const statuses: number[] = [];
        for (let i = 0; i < 5; i++) statuses.push((await post(driver, i)).status);
        expect(statuses).toEqual([200, 200, 200, 429, 429]);
        // soxta token bilan boshqa foydalanuvchining hisobini to'ldirib bo'lmaydi
        const forged = await limited.http().post(`/shipments/${id}/location`).set('Authorization', 'Bearer abc.def.ghi').send({ lat: 1, lng: 1 });
        expect(forged.status).toBe(401);
        const stillLimited = await post(driver, 9);
        expect(stillLimited.status).toBe(429);
      } finally {
        await limited.close();
      }
    });
  });

  describe('GET /shipments/:id/location', () => {
    it("fermer, market, admin va haydovchi ko'ra oladi: joriy nuqta, marshrut va iz", async () => {
      const { farmer, market, driver, id } = await setup();
      await send(driver, id, { lat: 39.65, lng: 66.96, timestamp: iso(20_000) });
      await send(driver, id, { lat: 39.651, lng: 66.96, speedKmh: 40, timestamp: iso(8_000) });
      const admin = await createAdmin(t);

      for (const who of [farmer, market, admin, driver]) {
        const res = await get(who, id);
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body).toMatchObject({
          shipmentId: id, status: 'IN_TRANSIT', tracking: true,
          location: { lat: 39.651, lng: 66.96, speedKmh: 40, source: 'GPS' },
          route: {
            origin: { region: 'Samarqand', center: { lat: expect.any(Number), lng: expect.any(Number) } },
            destination: { region: 'Toshkent shahri', center: { lat: expect.any(Number), lng: expect.any(Number) } },
            approximate: true,
          },
        });
        expect(res.body.trail).toHaveLength(2);
        expect(res.body.trail[0].recordedAt < res.body.trail[1].recordedAt).toBe(true);
        expect(res.body.serverTime).toEqual(expect.any(String));
      }
      expect((await get(driver, id)).body.simulationAllowed).toBe(true);
      expect((await get(farmer, id)).body).not.toHaveProperty('simulationAllowed');
    });

    it("javobda telefon, manzil yoki shaxsiy ma'lumot yo'q", async () => {
      const { farmer, market, driver, id } = await setup();
      await send(driver, id, { lat: 39.65, lng: 66.96 });
      const raw = JSON.stringify((await get(market, id)).body);
      for (const secret of [farmer.phone, market.phone, driver.phone, "Dehqon ko'chasi", 'Bunyodkor']) expect(raw).not.toContain(secret);
    });

    it("begona fermer, begona market va begona haydovchi 404 oladi (mavjudligi sezdirilmaydi)", async () => {
      const { id } = await setup();
      const otherFarmer = await registerFarmer(t.http);
      const otherMarket = await registerMarket(t.http);
      const otherDriver = await registerDriver(t.http);
      for (const who of [otherFarmer, otherMarket, otherDriver]) expect((await get(who, id)).status).toBe(404);
      expect((await t.http().get(`/shipments/${id}/location`)).status).toBe(401);
      expect((await get(otherFarmer, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await get(otherFarmer, 'not-a-uuid')).status).toBe(400);
    });

    it("yo'lda bo'lmagan yuk uchun joylashuv ko'rsatilmaydi (yuklanmoqda, yetkazilgan)", async () => {
      const loading = await setup('LOADING');
      const r = await get(loading.farmer, loading.id);
      expect(r.body).toMatchObject({ status: 'LOADING', tracking: false, location: null, trail: [] });

      const s = await setup();
      await send(s.driver, s.id, { lat: 39.65, lng: 66.96 });
      await s.adv();
      const done = await get(s.market, s.id);
      expect(done.body).toMatchObject({ status: 'DELIVERED', tracking: false, location: null, trail: [] });
    });

    it("yo'lga chiqqan, lekin hali nuqta yubormagan yuk: tracking true, location null", async () => {
      const { farmer, id } = await setup();
      expect((await get(farmer, id)).body).toMatchObject({ tracking: true, location: null, trail: [] });
    });

    it("iz eng ko'pi bilan 200 ta nuqta va eng yangilari", async () => {
      const { farmer, driver, id } = await setup();
      const dId = (await t.prisma.driver.findFirstOrThrow()).id;
      const base = Date.now() - 250 * 1000;
      await t.prisma.locationLog.createMany({
        data: Array.from({ length: 250 }, (_, i) => ({
          shipmentId: id, driverId: dId, lat: 39 + i * 0.0001, lng: 66, recordedAt: new Date(base + i * 1000),
        })),
      });
      const trail = (await get(farmer, id)).body.trail;
      expect(trail).toHaveLength(200);
      expect(trail[199].lat).toBeCloseTo(39 + 249 * 0.0001, 6);
      expect(driver).toBeDefined();
    });
  });

  describe('GET /shipments/eld', () => {
    async function seedLogs(driverId: string, shipmentId: string) {
      // Bugun 3 soat oldin boshlangan: 20 daq yurish, 10 daq to'xtash, 10 daq yurish
      const start = Date.now() - 3 * 3600_000;
      const pts: { lat: number; min: number }[] = [];
      for (let m = 0; m <= 20; m++) pts.push({ lat: 41 + m * 0.01, min: m });
      for (let m = 21; m <= 30; m++) pts.push({ lat: 41.2, min: m });
      for (let m = 31; m <= 40; m++) pts.push({ lat: 41.2 + (m - 30) * 0.01, min: m });
      await t.prisma.locationLog.createMany({
        data: pts.map((p) => ({ shipmentId, driverId, lat: p.lat, lng: 69, recordedAt: new Date(start + p.min * 60_000) })),
      });
    }

    it("kunlik harakat, to'xtashlar va masofa hisoblanadi", async () => {
      const { driver, id } = await setup();
      const dId = (await t.prisma.driver.findFirstOrThrow()).id;
      await seedLogs(dId, id);
      const res = await t.http().get('/shipments/eld').set('Authorization', bearer(driver));
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({ timezone: 'Asia/Tashkent', dailyDrivingLimitMinutes: 540, truncated: false });
      expect(res.body.current).toMatchObject({ shipmentId: id });
      const total = res.body.days.reduce((a: number, d: any) => a + d.drivingMin, 0);
      const stopped = res.body.days.reduce((a: number, d: any) => a + d.stoppedMin, 0);
      expect(total).toBe(30);
      expect(stopped).toBe(10);
      expect(res.body.recentStops).toHaveLength(1);
      expect(res.body.recentStops[0]).toMatchObject({ durationMin: 10, shipmentId: id });
    });

    it("faqat o'z jurnali; boshqa haydovchi bo'sh natija oladi; fermer/market 403; days chegaralari", async () => {
      const { driver, id } = await setup();
      const dId = (await t.prisma.driver.findFirstOrThrow()).id;
      await seedLogs(dId, id);
      const other = await registerDriver(t.http);
      const mine = await t.http().get('/shipments/eld').set('Authorization', bearer(other));
      expect(mine.status).toBe(200);
      expect(mine.body).toMatchObject({ days: [], recentStops: [], current: null });

      const farmer = await registerFarmer(t.http);
      expect((await t.http().get('/shipments/eld').set('Authorization', bearer(farmer))).status).toBe(403);
      expect((await t.http().get('/shipments/eld')).status).toBe(401);
      for (const days of ['0', '8', 'abc', '1.5']) {
        expect((await t.http().get(`/shipments/eld?days=${days}`).set('Authorization', bearer(driver))).status).toBe(400);
      }
      expect((await t.http().get('/shipments/eld?days=1').set('Authorization', bearer(driver))).status).toBe(200);
    });

    it("days davridan eski nuqtalar kirmaydi", async () => {
      const { driver, id } = await setup();
      const dId = (await t.prisma.driver.findFirstOrThrow()).id;
      const old = Date.now() - 5 * 86_400_000;
      await t.prisma.locationLog.createMany({
        data: [0, 1, 2].map((m) => ({ shipmentId: id, driverId: dId, lat: 41 + m * 0.01, lng: 69, recordedAt: new Date(old + m * 60_000) })),
      });
      const one = await t.http().get('/shipments/eld?days=2').set('Authorization', bearer(driver));
      expect(one.body.days).toEqual([]);
      const seven = await t.http().get('/shipments/eld?days=7').set('Authorization', bearer(driver));
      expect(seven.body.days).toHaveLength(1);
      expect(seven.body.days[0].drivingMin).toBe(2);
    });
  });
});
