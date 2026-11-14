import { Account, approve, bearer, book, bootApp, createAdmin, createProduct, pay, registerConsumer, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

const post = { status: 'AVAILABLE', trailerType: 'DRY_VAN', capacityKg: 20000, routes: ['Samarqand ↔ Toshkent'], currentLocation: 'Samarqand sh.', loadMode: 'FTL' };

describe('Shikoyat/Spam va qizil yulduzcha (penalty) tizimi (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });
  const send = (m: 'get' | 'post' | 'patch', who: Account | null, path: string, body?: any) => (who ? t.http()[m](path).set('Authorization', bearer(who)) : t.http()[m](path)).send(body);
  const points = async (a: Account) => (await t.prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).penaltyPoints;

  /** fermer + market + haydovchi o'rtasida zakazlar tarixi */
  async function world() {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http, { capacityKg: 30000 });
    const product = await createProduct(t.http, farmer, { quantityKg: 5000, pricePerKg: 1000 });
    const bk = (await book(t.http, market, product.id, 300)).body;
    await approve(t.http, farmer, bk.id);
    await pay(t.http, market, bk.id);
    const sh = (await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } })).id;
    await send('post', driver, `/shipments/${sh}/accept`);
    const dispatcher = await createAdmin(t, 'DISPATCHER'), admin = await createAdmin(t, 'ADMIN');
    return { farmer, market, driver, product, bk, sh, dispatcher, admin };
  }
  const file = (w: Account, accused: Account, reason = "Yukni asossiz bekor qildi va telefonga javob bermadi") => send('post', w, '/complaints', { accusedId: accused.user.id, reason });

  it("hamkorlar ro'yxati faqat zakazlar tarixidagilar; begona va o'ziga shikoyat qilib bo'lmaydi; faqat fermer/haydovchi/market", async () => {
    const w = await world();
    const mp = (await send('get', w.market, '/complaints/partners')).body;
    expect(mp.map((p: any) => p.userId).sort()).toEqual([w.farmer.user.id, w.driver.user.id].sort());
    expect(mp.find((p: any) => p.userId === w.farmer.user.id)).toMatchObject({ role: 'FARMER', orders: expect.any(Number), penaltyPoints: 0 });
    expect((await send('get', w.farmer, '/complaints/partners')).body.map((p: any) => p.userId).sort()).toEqual([w.market.user.id, w.driver.user.id].sort());
    expect((await send('get', w.driver, '/complaints/partners')).body).toHaveLength(2);
    const stranger = await registerMarket(t.http);
    expect((await file(stranger, w.farmer)).status).toBe(400); // tarixda yo'q
    expect((await file(w.market, w.market)).status).toBe(400);
    expect((await send('post', w.market, '/complaints', { accusedId: w.farmer.user.id, reason: 'qisqa' })).status).toBe(400);
    expect((await send('post', w.market, '/complaints', { accusedId: 'x', reason: 'yetarlicha uzun sabab matni' })).status).toBe(400);
    const consumer = await registerConsumer(t.http);
    expect((await send('get', consumer, '/complaints/partners')).status).toBe(403);
    expect((await send('get', w.dispatcher, '/complaints/partners')).status).toBe(403);
    expect((await file(consumer, w.farmer)).status).toBe(403);
    expect((await t.http().get('/complaints/mine')).status).toBe(401);
  });

  it("shikoyat yuborish: bildirishnoma matni, 'Mening shikoyatlarim' holati, takroriy ochiq shikoyat 409; kunlik limit", async () => {
    const w = await world();
    const r = await file(w.market, w.farmer);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'PENDING', message: "Shikoyatingiz qabul qilindi va 3 ish kuni ichida ko'rib chiqiladi", accused: { id: w.farmer.user.id }, canWithdraw: true });
    expect((await file(w.market, w.farmer)).status).toBe(409);
    expect((await file(w.market, w.driver)).status).toBe(201); // boshqa hamkorga mumkin
    const mine = (await send('get', w.market, '/complaints/mine')).body;
    expect(mine).toHaveLength(2);
    expect(mine.every((c: any) => c.status === 'PENDING')).toBe(true);
    expect((await send('get', w.farmer, '/complaints/mine')).body).toHaveLength(0); // aybdor shikoyat matnini ko'rmaydi
    // kunlik limit (5 ta)
    await t.prisma.complaint.createMany({ data: [1, 2, 3].map((i) => ({ reporterId: w.market.user.id, accusedId: w.driver.user.id, reason: 'eski shikoyat ' + i, status: 'REJECTED' as const })) });
    expect((await file(w.market, w.driver)).status).toBe(409);
  });

  it("Dispetcher/Super admin qarori: to'liq asosli +1, qisman +0.5, asossiz 0; qayta qaror 409; boshqa rollar kira olmaydi", async () => {
    const w = await world();
    for (const who of [w.farmer, w.market, w.driver]) expect((await send('get', who, '/complaints')).status).toBe(403);
    const mk = async () => (await file(w.market, w.farmer)).body.id as string;
    const c1 = await mk();
    const list = (await send('get', w.dispatcher, '/complaints?status=PENDING')).body;
    expect(list.pending).toBe(1);
    expect(list.items[0]).toMatchObject({ id: c1, status: 'PENDING', reporter: { id: w.market.user.id }, accused: { id: w.farmer.user.id, penaltyPoints: 0 } });
    expect((await send('post', w.dispatcher, `/complaints/${c1}/decide`, { decision: 'MAYBE' })).status).toBe(400);
    expect((await send('post', w.farmer, `/complaints/${c1}/decide`, { decision: 'UPHELD' })).status).toBe(403);
    const up = await send('post', w.dispatcher, `/complaints/${c1}/decide`, { decision: 'UPHELD', note: 'Dalil bor' });
    expect(up.status).toBe(200);
    expect(up.body).toMatchObject({ status: 'UPHELD', penalty: 1, decisionNote: 'Dalil bor', accusedBanned: false });
    expect(await points(w.farmer)).toBe(1);
    expect((await send('post', w.admin, `/complaints/${c1}/decide`, { decision: 'REJECTED' })).status).toBe(409); // allaqachon qaror qilingan
    const c2 = await mk();
    expect((await send('post', w.admin, `/complaints/${c2}/decide`, { decision: 'PARTIAL' })).body).toMatchObject({ status: 'PARTIAL', penalty: 0.5 });
    expect(await points(w.farmer)).toBe(1.5);
    const c3 = await mk();
    expect((await send('post', w.dispatcher, `/complaints/${c3}/decide`, { decision: 'REJECTED' })).body).toMatchObject({ status: 'REJECTED', penalty: 0 });
    expect(await points(w.farmer)).toBe(1.5);
    const mine = (await send('get', w.market, '/complaints/mine')).body;
    expect(mine.map((c: any) => c.status).sort()).toEqual(['PARTIAL', 'REJECTED', 'UPHELD']);
    expect(mine.find((c: any) => c.status === 'REJECTED').canWithdraw).toBe(false);
  });

  it("shikoyatni qaytarib olish: kutilayotgan — penalty yo'q; qaror qilingan — berilgan penalty ayriladi; rad etilgan/qayta olingan — 409", async () => {
    const w = await world();
    const pending = (await file(w.market, w.farmer)).body.id;
    expect((await send('post', w.farmer, `/complaints/${pending}/withdraw`)).status).toBe(404); // faqat shikoyatchi
    const wd = await send('post', w.market, `/complaints/${pending}/withdraw`);
    expect(wd.status).toBe(200);
    expect(wd.body.status).toBe('WITHDRAWN');
    expect(await points(w.farmer)).toBe(0);
    expect((await send('post', w.dispatcher, `/complaints/${pending}/decide`, { decision: 'UPHELD' })).status).toBe(409); // qaytarib olingan shikoyatga qaror yo'q
    // qaror qilinganidan keyin qaytarib olish
    const c = (await file(w.market, w.farmer)).body.id;
    await send('post', w.dispatcher, `/complaints/${c}/decide`, { decision: 'UPHELD' });
    expect(await points(w.farmer)).toBe(1);
    expect((await send('post', w.market, `/complaints/${c}/withdraw`)).body.status).toBe('WITHDRAWN');
    expect(await points(w.farmer)).toBe(0);
    expect((await send('post', w.market, `/complaints/${c}/withdraw`)).status).toBe(409);
    const r = (await file(w.market, w.farmer)).body.id;
    await send('post', w.dispatcher, `/complaints/${r}/decide`, { decision: 'REJECTED' });
    expect((await send('post', w.market, `/complaints/${r}/withdraw`)).status).toBe(409);
  });

  it("5.0 qizil yulduzda AVTOMATIK BAN: kirish va API taqiqlanadi, e'lonlar muzlatiladi; shikoyat qaytarilsa ban bekor bo'ladi", async () => {
    const w = await world();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = (await file(w.market, w.farmer, 'Yana bir asossiz bekor qilish holati ' + i)).body.id;
      ids.push(c);
      const d = await send('post', w.dispatcher, `/complaints/${c}/decide`, { decision: 'UPHELD' });
      expect(d.body.accusedBanned).toBe(i === 4);
      if (i < 4) expect((await send('get', w.farmer, '/profile')).status).toBe(200);
    }
    const u = await t.prisma.user.findUniqueOrThrow({ where: { id: w.farmer.user.id } });
    expect(u).toMatchObject({ penaltyPoints: 5, isActive: false, banReason: 'PENALTY' });
    expect(u.bannedAt).not.toBeNull();
    // API va kirish taqiqlangan
    expect((await send('get', w.farmer, '/profile')).status).toBe(401);
    expect((await send('get', w.farmer, '/products')).status).toBe(401);
    const login = await t.http().post('/auth/login').send({ phone: w.farmer.phone, password: 'parol1234' });
    expect(login.status).toBe(401);
    expect(login.body.message).toMatch(/BANNED/);
    expect((await t.http().post('/auth/login').send({ phone: w.farmer.phone, password: 'xato-parol1' })).body.message).not.toMatch(/BANNED/); // mavjudlik oshkor bo'lmaydi
    // e'lonlar muzlatilgan va katalogda ko'rinmaydi
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: w.product.id } })).status).toBe('FROZEN');
    expect((await t.http().get('/marketplace')).body.items.find((x: any) => x.id === w.product.id)).toBeUndefined();
    expect((await send('post', w.market, '/bookings', { productId: w.product.id, quantityKg: 10 })).status).toBe(404);
    // shikoyatlardan birini qaytarib olish: 4.0 — ban bekor
    expect((await send('post', w.market, `/complaints/${ids[4]}/withdraw`)).status).toBe(200);
    const back = await t.prisma.user.findUniqueOrThrow({ where: { id: w.farmer.user.id } });
    expect(back).toMatchObject({ penaltyPoints: 4, isActive: true, bannedAt: null });
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: w.product.id } })).status).toBe('ACTIVE');
    expect((await t.http().post('/auth/login').send({ phone: w.farmer.phone, password: 'parol1234' })).status).toBe(200);
  });

  it("haydovchi 5.0 ga yetsa e'lonlari yashiriladi; ochiq takliflar bekor qilinadi", async () => {
    const w = await world();
    const dp = (await send('post', w.driver, '/driver-posts', post)).body;
    await t.prisma.user.update({ where: { id: w.driver.user.id }, data: { penaltyPoints: 4.5 } });
    const c = (await file(w.market, w.driver)).body.id;
    await send('post', w.dispatcher, `/complaints/${c}/decide`, { decision: 'PARTIAL' });
    expect((await t.prisma.driverPost.findUniqueOrThrow({ where: { id: dp.id } })).isActive).toBe(false);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: w.driver.user.id } })).bannedAt).not.toBeNull();
  });

  it("qizil yulduz ballari hamkor ma'lumotlarida ko'rinadi (katalog, bron, taklif, yuk, haydovchi e'lonlari)", async () => {
    const w = await world();
    await t.prisma.user.updateMany({ where: { id: { in: [w.farmer.user.id, w.driver.user.id] } }, data: { penaltyPoints: 1.5 } });
    expect((await t.http().get('/marketplace')).body.items[0].farmer.penaltyPoints).toBe(1.5);
    expect((await send('get', w.market, '/bookings/mine')).body[0].farmer.penaltyPoints).toBe(1.5);
    const sh = (await send('get', w.market, '/shipments/mine')).body[0];
    expect(sh.penalty).toMatchObject({ farmer: 1.5, driver: 1.5, market: 0 });
    expect(sh.driver.penaltyPoints).toBe(1.5);
    await send('post', w.driver, '/driver-posts', post);
    expect((await send('get', w.market, '/driver-posts')).body[0].driver.penaltyPoints).toBe(1.5);
    expect((await send('get', w.farmer, '/profile')).body.penaltyPoints).toBe(1.5); // o'z profilida
  });

  it("2+ qizil yulduz: bron, taklif, yuk taklifi, biriktirish va yukni olishda DQQ ogohlantirishi tasdiqlanmaguncha 409 (RISK_WARNING)", async () => {
    const w = await world();
    const farmer2 = await registerFarmer(t.http), market2 = await registerMarket(t.http), driver2 = await registerDriver(t.http, { capacityKg: 30000 });
    const p2 = await createProduct(t.http, farmer2, { quantityKg: 1000, pricePerKg: 1000 });
    await t.prisma.user.updateMany({ where: { id: { in: [farmer2.user.id, driver2.user.id] } }, data: { penaltyPoints: 2 } });
    // bron
    const blocked = await send('post', market2, '/bookings', { productId: p2.id, quantityKg: 10 });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: 'RISK_WARNING', penaltyPoints: 2 });
    expect(blocked.body.message).toMatch(/DQQ OGOHLANTIRISHI.*red-flag \(2\/5 qizil daraja\)/);
    expect((await send('post', market2, '/bookings', { productId: p2.id, quantityKg: 10, acknowledgeRisk: true })).status).toBe(201);
    // 1.5 — hali ogohlantirishsiz
    await t.prisma.user.update({ where: { id: farmer2.user.id }, data: { penaltyPoints: 1.5 } });
    expect((await send('post', market2, '/bookings', { productId: p2.id, quantityKg: 10 })).status).toBe(201);
    await t.prisma.user.update({ where: { id: farmer2.user.id }, data: { penaltyPoints: 3 } });
    // narx taklifi
    const off = { productId: p2.id, quantityKg: 20, pricePerKg: 800 };
    expect((await send('post', market2, '/offers', off)).body.code).toBe('RISK_WARNING');
    expect((await send('post', market2, '/offers', { ...off, acknowledgeRisk: true })).status).toBe(201);
    // haydovchiga yuk taklifi (fermer -> riskli haydovchi)
    const dpost = (await send('post', driver2, '/driver-posts', post)).body;
    const sh = (await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: w.bk.id } })).id;
    const farmerOffer = (ack?: boolean) => send('post', w.farmer, `/driver-posts/${dpost.id}/offers`, { shipmentId: sh, ...(ack && { acknowledgeRisk: true }) });
    // yuk w.driver ga biriktirilgan (OPEN emas), shuning uchun yangi yuk
    const bk2 = (await book(t.http, w.market, w.product.id, 100)).body; await approve(t.http, w.farmer, bk2.id); await pay(t.http, w.market, bk2.id);
    const sh2 = (await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk2.id } })).id;
    const offerTo = (ack?: boolean) => send('post', w.farmer, `/driver-posts/${dpost.id}/offers`, { shipmentId: sh2, ...(ack && { acknowledgeRisk: true }) });
    expect((await offerTo()).body.code).toBe('RISK_WARNING');
    expect((await offerTo(true)).status).toBe(201);
    void farmerOffer;
    // dispetcher biriktirishi (riskli haydovchi)
    const assign = (ack?: boolean) => send('post', w.dispatcher, `/shipments/${sh2}/assign-driver`, { driverId: driver2.user.driver?.id ?? driver2.user.id, ...(ack && { acknowledgeRisk: true }) });
    const d2id = (await t.prisma.driver.findFirstOrThrow({ where: { userId: driver2.user.id } })).id;
    const asg = (ack?: boolean) => send('post', w.dispatcher, `/shipments/${sh2}/assign-driver`, { driverId: d2id, ...(ack && { acknowledgeRisk: true }) });
    void assign;
    expect((await asg()).body.code).toBe('RISK_WARNING');
    expect((await asg(true)).status).toBe(200);
    // haydovchi riskli fermer/marketning yukini olishda: yangi yuk (farmer2 ballari 3)
    const bk3 = (await book(t.http, market2, p2.id, 5, undefined)); expect(bk3.status).toBe(409);
    const bk4 = (await send('post', market2, '/bookings', { productId: p2.id, quantityKg: 5, acknowledgeRisk: true })).body; await approve(t.http, farmer2, bk4.id); await pay(t.http, market2, bk4.id);
    const sh4 = (await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk4.id } })).id;
    const d3 = await registerDriver(t.http, { capacityKg: 30000 });
    expect((await send('post', d3, `/shipments/${sh4}/accept`)).body.code).toBe('RISK_WARNING');
    expect((await send('post', d3, `/shipments/${sh4}/accept`, { acknowledgeRisk: true })).status).toBe(201);
  });
});
