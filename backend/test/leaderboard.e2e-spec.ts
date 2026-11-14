import { LeaderboardService, monthKey } from '../src/leaderboard/leaderboard.service';
import { Account, approve, bearer, book, bootApp, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

describe('Oylik reyting (Leaderboard) va gamification (e2e)', () => {
  let t: TestApp;
  let svc: LeaderboardService;
  beforeAll(async () => { t = await bootApp({ PIN_ENFORCE: 'true' }); svc = t.app.get(LeaderboardService); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); (svc as any).activeKey = null; });
  const send = (m: 'get' | 'post' | 'patch', who: Account | null, path: string, body?: any) => (who ? t.http()[m](path).set('Authorization', bearer(who)) : t.http()[m](path)).send(body);

  /** bir yuk: fermer -> market, haydovchi PIN bilan topshiradi */
  async function deliver(o: { farmer?: Account; market?: Account; driver?: Account; kg?: number; farmerRegion?: string; marketRegion?: string } = {}) {
    const farmer = o.farmer ?? await registerFarmer(t.http, { region: o.farmerRegion ?? 'Samarqand' });
    const market = o.market ?? await registerMarket(t.http, { region: o.marketRegion ?? 'Toshkent shahri' });
    const driver = o.driver ?? await registerDriver(t.http, { capacityKg: 30000 });
    const product = await createProduct(t.http, farmer, { quantityKg: 40000, pricePerKg: 1000 });
    const bk = (await book(t.http, market, product.id, o.kg ?? 2000)).body;
    await approve(t.http, farmer, bk.id);
    await pay(t.http, market, bk.id);
    const sh = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } });
    await send('post', driver, `/shipments/${sh.id}/accept`);
    const pins = await t.prisma.shipment.findUniqueOrThrow({ where: { id: sh.id } });
    await send('post', farmer, `/shipments/${sh.id}/confirm-pickup`, { pin: pins.pickupPin });
    const res = await send('post', driver, `/shipments/${sh.id}/deliver`, { pin: pins.deliveryPin });
    return { farmer, market, driver, shipmentId: sh.id, bk, res };
  }
  const drv = (a: Account) => t.prisma.driver.findFirstOrThrow({ where: { userId: a.user.id } });
  const frm = (a: Account) => t.prisma.farmer.findFirstOrThrow({ where: { userId: a.user.id } });
  const mkt = (a: Account) => t.prisma.market.findFirstOrThrow({ where: { userId: a.user.id } });

  it("PIN bilan yetkazilganda masofa (km) haydovchiga, hajm (tonna) fermer va marketga qo'shiladi; javobda rewards", async () => {
    const w = await deliver({ kg: 2500 });
    expect(w.res.status).toBe(200);
    const pay0 = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: w.bk.id } });
    expect(pay0.distanceKm).toBeGreaterThan(0);
    expect(w.res.body.rewards).toMatchObject({ km: pay0.distanceKm, tons: 2.5, driverMonthlyKm: pay0.distanceKm });
    expect((await drv(w.driver)).monthlyKm).toBe(pay0.distanceKm);
    expect((await frm(w.farmer)).monthlySotuvTons).toBe(2.5);
    expect(await mkt(w.market)).toMatchObject({ monthlyXaridTons: 2.5, monthlyOrders: 1 });
    expect((await t.prisma.shipment.findUniqueOrThrow({ where: { id: w.shipmentId } })).statsCounted).toBe(true);
    // takroriy hisoblash bo'lmaydi
    expect(await svc.recordDelivery(w.shipmentId)).toBeNull();
    expect((await drv(w.driver)).monthlyKm).toBe(pay0.distanceKm);
  });

  it("PIN o'chiq (eski «Yetkazdim» tugmasi) bo'lganda ham reyting hisoblanadi; yetkazilmagan yuk hisoblanmaydi", async () => {
    const t2 = await bootApp({ PIN_ENFORCE: 'false' });
    try {
      await resetDb(t2.prisma);
      const farmer = await registerFarmer(t2.http), market = await registerMarket(t2.http), driver = await registerDriver(t2.http, { capacityKg: 30000 });
      const product = await createProduct(t2.http, farmer, { quantityKg: 5000, pricePerKg: 1000 });
      const bk = (await book(t2.http, market, product.id, 1000)).body;
      await approve(t2.http, farmer, bk.id); await pay(t2.http, market, bk.id);
      const sh = await t2.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } });
      const s2 = (m: 'post' | 'patch', who: Account, path: string) => t2.http()[m](path).set('Authorization', bearer(who)).send();
      await s2('post', driver, `/shipments/${sh.id}/accept`);
      expect((await t2.prisma.driver.findFirstOrThrow({ where: { userId: driver.user.id } })).monthlyKm).toBe(0); // hali yetkazilmagan
      await s2('patch', driver, `/shipments/${sh.id}/advance`);
      const done = await s2('patch', driver, `/shipments/${sh.id}/advance`);
      expect(done.body.status).toBe('DELIVERED');
      expect(done.body.rewards.tons).toBe(1);
      expect((await t2.prisma.driver.findFirstOrThrow({ where: { userId: driver.user.id } })).monthlyKm).toBeGreaterThan(0);
    } finally { await t2.close(); }
  });

  it("GET /leaderboard (ochiq): har toifada TOP-3 tartiblangan; /me — o'z o'rni; ban/yo'q ko'rsatkichlar chiqmaydi", async () => {
    const market = await registerMarket(t.http, { companyName: 'Katta Market' });
    const farmers: Account[] = [], drivers: Account[] = [];
    // 4 ta haydovchi turli masofa: ikkinchi yuk qo'shimcha km beradi
    const w1 = await deliver({ market, kg: 1000, farmerRegion: 'Samarqand' }); farmers.push(w1.farmer); drivers.push(w1.driver);
    const w2 = await deliver({ market, kg: 5000, farmerRegion: 'Samarqand' }); farmers.push(w2.farmer); drivers.push(w2.driver);
    const w3 = await deliver({ market, kg: 3000, farmerRegion: 'Buxoro' }); farmers.push(w3.farmer); drivers.push(w3.driver);
    const w4 = await deliver({ market, kg: 500, farmerRegion: 'Toshkent shahri', marketRegion: 'Toshkent shahri' }); farmers.push(w4.farmer); drivers.push(w4.driver);
    const lb = (await t.http().get('/leaderboard')).body;
    expect(lb).toMatchObject({ month: monthKey(new Date()), reward: { proMonths: 1 } });
    expect(lb.daysLeft).toBeGreaterThanOrEqual(0);
    expect(lb.drivers).toHaveLength(3); // 4 tadan TOP-3
    expect(lb.drivers.map((d: any) => d.value)).toEqual([...lb.drivers.map((d: any) => d.value)].sort((a: number, b: number) => b - a));
    expect(lb.farmers.map((f: any) => f.value)).toEqual([5, 3, 1]); // fermerlar sotilgan tonna bo'yicha
    expect(lb.farmers[0]).toMatchObject({ rank: 1, name: expect.any(String) });
    expect(lb.markets).toHaveLength(1);
    expect(lb.markets[0]).toMatchObject({ name: 'Katta Market', value: 9.5, orders: 4, rank: 1 });
    expect(JSON.stringify(lb)).not.toContain('phone');
    // /me
    const me = (await send('get', farmers[1], '/leaderboard/me')).body;
    expect(me).toMatchObject({ category: 'FARMER', unit: 't', value: 5, rank: 1, total: 4 });
    expect((await send('get', farmers[0], '/leaderboard/me')).body.rank).toBe(3);
    expect((await send('get', market, '/leaderboard/me')).body).toMatchObject({ category: 'MARKET', value: 9.5, orders: 4, rank: 1 });
    const fresh = await registerDriver(t.http);
    expect((await send('get', fresh, '/leaderboard/me')).body).toMatchObject({ category: 'DRIVER', value: 0, rank: null });
    expect((await t.http().get('/leaderboard/me')).status).toBe(401);
    // bloklangan (BAN) foydalanuvchi reytingda ko'rinmaydi
    await t.prisma.user.update({ where: { id: farmers[1].user.id }, data: { isActive: false } });
    expect((await t.http().get('/leaderboard')).body.farmers.map((f: any) => f.value)).toEqual([3, 1, 0.5]);
  });

  it("oy yakuni: TOP-3 ga 1 oylik bepul PRO, g'oliblar tarixi, ko'rsatkichlar 0 dan; takroriy chaqiruv xavfsiz", async () => {
    const ws = [];
    for (const kg of [1000, 4000, 2000, 500]) ws.push(await deliver({ kg }));
    // davrni "o'tgan oy" qilib qo'yamiz
    const prev = monthKey(new Date(Date.now() - 40 * 86_400_000));
    await t.prisma.leaderboardState.upsert({ where: { id: 1 }, create: { id: 1, activeMonth: prev }, update: { activeMonth: prev } });
    (svc as any).activeKey = null;
    const before = await Promise.all(ws.map((w) => t.prisma.user.findUniqueOrThrow({ where: { id: w.farmer.user.id } })));
    const r = await svc.ensureCurrentPeriod();
    expect(r.closed).toBe(prev);
    const winners = await t.prisma.leaderboardWinner.findMany({ where: { month: prev }, orderBy: [{ category: 'asc' }, { rank: 'asc' }] });
    expect(winners.filter((w) => w.category === 'FARMER').map((w) => [w.rank, w.value])).toEqual([[1, 4], [2, 2], [3, 1]]);
    expect(winners.filter((w) => w.category === 'DRIVER')).toHaveLength(3);
    expect(winners.filter((w) => w.category === 'MARKET')).toHaveLength(4 > 3 ? 3 : 4);
    // 4-o'rin (500 kg) PRO olmaydi, 1-o'rin oladi
    const after = await Promise.all(ws.map((w) => t.prisma.user.findUniqueOrThrow({ where: { id: w.farmer.user.id } })));
    expect(after[1].proUntil).not.toBeNull();
    expect(after[1].subscriptionEndsAt!.getTime()).toBeGreaterThan(before[1].subscriptionEndsAt?.getTime() ?? before[1].trialEndsAt!.getTime() + 25 * 86_400_000);
    expect(after[3].proUntil).toBeNull();
    const hist = await t.prisma.subscriptionPayment.findMany({ where: { userId: ws[1].farmer.user.id, provider: 'leaderboard-reward' } });
    expect(hist).toHaveLength(1);
    expect(Number(hist[0].amount)).toBe(0);
    // reset: hamma ko'rsatkichlar 0
    expect((await t.prisma.driver.aggregate({ _sum: { monthlyKm: true } }))._sum.monthlyKm).toBe(0);
    expect((await t.prisma.farmer.aggregate({ _sum: { monthlySotuvTons: true } }))._sum.monthlySotuvTons).toBe(0);
    expect((await t.prisma.market.aggregate({ _sum: { monthlyXaridTons: true, monthlyOrders: true } }))._sum).toEqual({ monthlyXaridTons: 0, monthlyOrders: 0 });
    expect((await t.prisma.leaderboardState.findUniqueOrThrow({ where: { id: 1 } })).activeMonth).toBe(monthKey(new Date()));
    // takroriy chaqiruv va parallel nusxa — qo'shimcha g'olib/PRO yo'q
    (svc as any).activeKey = null;
    expect((await svc.ensureCurrentPeriod()).closed).toBeNull();
    expect(await t.prisma.leaderboardWinner.count({ where: { month: prev } })).toBe(winners.length);
    // ochiq reyting bo'sh, o'tgan oy g'oliblari ko'rinadi
    const lb = (await t.http().get('/leaderboard')).body;
    expect(lb.farmers).toHaveLength(0);
    expect(lb.lastMonth.month).toBe(prev);
    expect(lb.lastMonth.winners.length).toBe(winners.length);
    // yangi oyda yana hisoblanadi
    await deliver({ kg: 1000 });
    expect((await t.http().get('/leaderboard')).body.farmers).toHaveLength(1);
  });
});
