import { bearer, bootApp, book, approve, createAdmin, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const TYPES = ['ID_CARD', 'DRIVER_LICENSE', 'TECH_PASSPORT', 'FACE'];

describe('KYC, ishonch statusi, badjlar va baholash (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const up = (who: any, type: string, buf: Buffer = PNG) => t.http().post(`/kyc/documents/${type}`).set('Authorization', bearer(who)).attach('file', buf, 'd.png');

  /** To'liq yuk aylanishi: bron -> tasdiq -> to'lov -> haydovchi oladi -> yo'lga -> yetkazadi */
  async function delivered(farmer: any, market: any, driver: any, opts: { urgent?: boolean } = {}) {
    const product = await createProduct(t.http, farmer, { quantityKg: 100000 });
    const b = (await t.http().post('/bookings').set('Authorization', bearer(market)).send({ productId: product.id, quantityKg: 100, urgent: opts.urgent })).body;
    await approve(t.http, farmer, b.id);
    await pay(t.http, market, b.id);
    const s = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: b.id } });
    await t.http().post(`/shipments/${s.id}/accept`).set('Authorization', bearer(driver));
    await t.http().patch(`/shipments/${s.id}/advance`).set('Authorization', bearer(driver));
    const d = await t.http().patch(`/shipments/${s.id}/advance`).set('Authorization', bearer(driver));
    expect(d.body.status).toBe('DELIVERED');
    return s.id as string;
  }

  describe('davlat raqami maskasi', () => {
    it("kichik harf KATTAga o'tadi; belgilar va noto'g'ri format rad etiladi", async () => {
      const ok = await registerDriver(t.http, { plateNumber: '01a777aa' });
      expect(ok.user.driver.plateNumber).toBe('01A777AA');
      const ok2 = await registerDriver(t.http, { plateNumber: '70-777-aaa' });
      expect(ok2.user.driver.plateNumber).toBe('70777AAA');
      for (const bad of ['0A777AAA', '01A77AA', '01A777A', '01А777АА' /* kirill */, '01A777A!', 'ABCDEFGH', '01A777AAA', '']) {
        const r = await t.http().post('/auth/driver/register').send({ phone: '+998901112233', password: 'parol1234', fullName: 'Test Driver', vehicleType: 'Isuzu', plateNumber: bad, capacityKg: 1000, region: 'Samarqand' });
        expect([400]).toContain(r.status);
      }
      const upd = await t.http().patch('/profile').set('Authorization', bearer(ok)).send({ plateNumber: '10b123cd' });
      expect(upd.body.driver.plateNumber).toBe('10B123CD');
      expect((await t.http().patch('/profile').set('Authorization', bearer(ok)).send({ plateNumber: 'bad plate' })).status).toBe(400);
    });
  });

  describe('KYC oqimi', () => {
    it("4 ta hujjat yuklangach (simulyatsiya) isVerified=true, verifiedAt; fayllar ommaviy emas, faqat egasi/admin ko'radi", async () => {
      const d = await registerDriver(t.http);
      for (const type of TYPES.slice(0, 3)) {
        const r = await up(d, type);
        expect(r.status).toBe(201);
        expect(r.body.isVerified).toBe(false);
      }
      const last = await up(d, 'FACE');
      expect(last.body).toMatchObject({ status: 'VERIFIED', isVerified: true });
      expect(last.body.verifiedAt).toBeTruthy();
      const u = await t.prisma.user.findUnique({ where: { id: d.user.id } });
      expect(u).toMatchObject({ isVerified: true, kycStatus: 'VERIFIED' });
      expect(u!.verifiedAt).toBeInstanceOf(Date);
      expect((await t.http().get('/kyc/documents/ID_CARD').set('Authorization', bearer(d))).status).toBe(200);
      const other = await registerDriver(t.http), admin = await createAdmin(t);
      expect((await t.http().get(`/kyc/${d.user.id}/documents/ID_CARD`).set('Authorization', bearer(other))).status).toBe(403);
      expect((await t.http().get(`/kyc/${d.user.id}/documents/ID_CARD`).set('Authorization', bearer(admin))).status).toBe(200);
      const doc = await t.prisma.kycDocument.findFirstOrThrow({ where: { userId: d.user.id } });
      expect((await t.http().get('/uploads/' + doc.path)).status).toBe(404); // ommaviy /uploads'da yo'q
    });

    it("soxta fayl, katta fayl, noto'g'ri tur va begona rollar rad etiladi", async () => {
      const d = await registerDriver(t.http), f = await registerFarmer(t.http);
      expect((await up(d, 'ID_CARD', Buffer.from('not image'))).status).toBe(400);
      expect((await up(d, 'ID_CARD', Buffer.concat([PNG, Buffer.alloc(5.2 * 1024 * 1024)]))).status).toBe(413);
      expect((await up(d, 'SELFIE')).status).toBe(400);
      expect((await up(f, 'ID_CARD')).status).toBe(403);
      expect((await t.http().post('/kyc/documents/ID_CARD').attach('file', PNG, 'x.png')).status).toBe(401);
    });

    it("production rejimi (simulyatsiyasiz): PENDING, administrator tasdiqlaydi yoki rad etadi", async () => {
      const t2 = await bootApp({ KYC_ALLOW_SIMULATION: 'false' });
      try {
        await resetDb(t2.prisma);
        const d = await registerDriver(t2.http), admin = await createAdmin(t2);
        for (const type of TYPES) await t2.http().post(`/kyc/documents/${type}`).set('Authorization', bearer(d)).attach('file', PNG, 'd.png');
        expect((await t2.http().get('/kyc').set('Authorization', bearer(d))).body).toMatchObject({ status: 'PENDING', isVerified: false });
        const pend = await t2.http().get('/kyc/pending').set('Authorization', bearer(admin));
        expect(pend.body.map((x: any) => x.id)).toEqual([d.user.id]);
        expect((await t2.http().get('/kyc/pending').set('Authorization', bearer(d))).status).toBe(403);
        const rej = await t2.http().post(`/kyc/${d.user.id}/reject`).set('Authorization', bearer(admin)).send({ reason: 'Rasm xira' });
        expect(rej.body).toMatchObject({ status: 'REJECTED', rejectReason: 'Rasm xira', isVerified: false });
        await t2.http().post('/kyc/documents/ID_CARD').set('Authorization', bearer(d)).attach('file', PNG, 'd.png'); // qayta yuklash -> PENDING
        expect((await t2.http().get('/kyc').set('Authorization', bearer(d))).body.status).toBe('PENDING');
        const ap = await t2.http().post(`/kyc/${d.user.id}/approve`).set('Authorization', bearer(admin));
        expect(ap.body).toMatchObject({ status: 'VERIFIED', isVerified: true });
        // fermer: hujjatsiz admin tasdig'i
        const farmer = await registerFarmer(t2.http);
        expect((await t2.http().post(`/kyc/${farmer.user.id}/approve`).set('Authorization', bearer(admin))).body.isVerified).toBe(true);
        expect((await t2.http().post(`/kyc/${farmer.user.id}/revoke`).set('Authorization', bearer(admin))).body.isVerified).toBe(false);
        // hujjatsiz haydovchini tasdiqlab bo'lmaydi
        const d2 = await registerDriver(t2.http);
        expect((await t2.http().post(`/kyc/${d2.user.id}/approve`).set('Authorization', bearer(admin))).status).toBe(400);
      } finally { await t2.close(); }
    });
  });

  describe('status va badjlar', () => {
    it("yangi foydalanuvchi: NEW, 15/4/3 ta badj, hammasi qulfda (tasdiqlashsiz)", async () => {
      for (const [who, total] of [[await registerDriver(t.http), 15], [await registerFarmer(t.http), 4], [await registerMarket(t.http), 3]] as const) {
        const r = await t.http().get('/trust/me').set('Authorization', bearer(who));
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ status: 'NEW', unlocked: 0, total, verified: false, rank: null });
        expect(r.body.badges).toHaveLength(total);
      }
    });

    it("tasdiqlangan haydovchi 'Tasdiqlangan haydovchi' badjini oladi; birinchi reys 'Boshlovchi' va daraja ROOKIE; ommaviy kartochka", async () => {
      const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http);
      for (const type of TYPES) await up(driver, type);
      await delivered(farmer, market, driver);
      const me = (await t.http().get('/trust/me').set('Authorization', bearer(driver))).body;
      const un = me.badges.filter((b: any) => b.unlocked).map((b: any) => b.id).sort();
      expect(un).toEqual(expect.arrayContaining(['rookie', 'verified_pro']));
      expect(me.rank).toBe('ROOKIE');
      expect(me.badges.find((b: any) => b.id === 'master_driver')).toMatchObject({ unlocked: false, current: 1, target: 25 });
      // ommaviy kartochka: fermer va market ko'radi
      const card = (await t.http().get(`/trust/user/${driver.user.id}`).set('Authorization', bearer(farmer))).body;
      expect(card).toMatchObject({ verified: true, rank: 'ROOKIE', total: 15 });
      expect(card.topBadges.length).toBeGreaterThanOrEqual(2);
      expect(card.badges).toBeUndefined();
      // yuk kartochkasida haydovchi bloki trust bilan keladi
      const ships = (await t.http().get('/shipments/mine').set('Authorization', bearer(farmer))).body;
      expect(ships[0].driver.trust).toMatchObject({ verified: true, status: 'NEW' });
      expect((await t.http().get('/shipments/mine').set('Authorization', bearer(market))).body[0].driver.trust.verified).toBe(true);
    });

    it("Doimiy: >30 kun, tasdiqlangan, 5+ bitim; Qadrdon: >180 kun, 30+ bitim, reyting 4.8+ (bazadagi sanalar siljitilib tekshiriladi)", async () => {
      const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http);
      for (const type of TYPES) await up(driver, type);
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) ids.push(await delivered(farmer, market, driver));
      const trust = t.app.get(require('../src/trust/trust.service').TrustService);
      expect((await t.http().get('/trust/me').set('Authorization', bearer(driver))).body.status).toBe('NEW'); // hali 30 kun o'tmagan
      await t.prisma.user.update({ where: { id: driver.user.id }, data: { createdAt: new Date(Date.now() - 40 * 86400000) } });
      trust.invalidate(driver.user.id);
      expect((await t.http().get('/trust/me').set('Authorization', bearer(driver))).body.status).toBe('REGULAR');
      // Qadrdon uchun: 180+ kun, 30 bitim, 5+ baho 4.8+
      await t.prisma.user.update({ where: { id: driver.user.id }, data: { createdAt: new Date(Date.now() - 200 * 86400000) } });
      for (let i = 0; i < 25; i++) ids.push(await delivered(farmer, market, driver));
      for (const id of ids.slice(0, 6)) await t.http().post('/ratings').set('Authorization', bearer(market)).send({ shipmentId: id, targetRole: 'DRIVER', stars: 5 });
      trust.invalidate(driver.user.id);
      const v = (await t.http().get('/trust/me').set('Authorization', bearer(driver))).body;
      expect(v).toMatchObject({ status: 'VETERAN', deals: 30 });
      expect(v.badges.find((b: any) => b.id === 'master_driver').unlocked).toBe(true);
      expect(v.rank).toBe('MASTER');
      expect(v.badges.find((b: any) => b.id === 'safe_hauler').unlocked).toBe(true);
    }, 120000);
  });

  describe('baholash', () => {
    it("faqat yetkazilgan yuk va ishtirokchi baholaydi; takroriy 409; teglar faqat haydovchiga; reyting hisobga olinadi", async () => {
      const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http), stranger = await registerMarket(t.http);
      const sid = await delivered(farmer, market, driver, { urgent: true });
      const rate = (who: any, body: any) => t.http().post('/ratings').set('Authorization', bearer(who)).send({ shipmentId: sid, ...body });
      expect((await rate(stranger, { targetRole: 'DRIVER', stars: 5 })).status).toBe(403);
      expect((await rate(market, { targetRole: 'MARKET', stars: 5 })).status).toBe(400);
      expect((await rate(market, { targetRole: 'DRIVER', stars: 6 })).status).toBe(400);
      expect((await rate(market, { targetRole: 'FARMER', stars: 5, friendly: true })).status).toBe(400);
      const ok = await rate(market, { targetRole: 'DRIVER', stars: 5, friendly: true });
      expect(ok.status).toBe(201);
      expect((await rate(market, { targetRole: 'DRIVER', stars: 4 })).status).toBe(409);
      expect((await rate(farmer, { targetRole: 'DRIVER', stars: 4, damaged: true })).status).toBe(201);
      expect((await rate(driver, { targetRole: 'FARMER', stars: 5 })).status).toBe(201);
      const mine = await t.http().get('/ratings/mine').set('Authorization', bearer(market));
      expect(mine.body).toEqual([{ shipmentId: sid, targetRole: 'DRIVER', stars: 5 }]);
      const dm = (await t.http().get('/trust/me').set('Authorization', bearer(driver))).body;
      expect(dm.rating).toEqual({ avg: 4.5, count: 2 });
      // yetkazilmagan yuk
      const p = await createProduct(t.http, farmer);
      const b = (await book(t.http, market, p.id, 10)).body; await approve(t.http, farmer, b.id);
      const open = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: b.id } });
      expect((await t.http().post('/ratings').set('Authorization', bearer(market)).send({ shipmentId: open.id, targetRole: 'DRIVER', stars: 5 })).status).toBe(400);
      // shoshilinch bron yukka o'tdi va 'Favqulodda yordamchi' hisoblanadi
      expect((await t.prisma.shipment.findUniqueOrThrow({ where: { id: sid } })).urgent).toBe(true);
      expect(dm.badges.find((b: any) => b.id === 'emergency')).toMatchObject({ current: 1, target: 5 });
    });
  });
});
