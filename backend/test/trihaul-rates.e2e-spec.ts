import { RatesService } from '../src/rates/rates.service';
import { approve, bearer, book, bootApp, createAdmin, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

describe('TriHaul va dinamik narx indikatori (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); t.app.get(RatesService).clearCache(); });

  const send = (m: 'get' | 'post' | 'patch', who: any, path: string, body?: any) => t.http()[m](path).set('Authorization', bearer(who)).send(body);

  /** fRegion -> mRegion yo'nalishida to'lovi kafolatlangan (HELD) ochiq yuk */
  async function load(fRegion: string, mRegion: string, kg = 5000, price = 1000) {
    const farmer = await registerFarmer(t.http, { region: fRegion, district: 'Markaz' });
    const market = await registerMarket(t.http, { region: mRegion, district: 'Markaz' });
    const product = await createProduct(t.http, farmer, { quantityKg: 60000, pricePerKg: price });
    const bk = (await book(t.http, market, product.id, kg)).body;
    await approve(t.http, farmer, bk.id);
    await pay(t.http, market, bk.id);
    return { id: (await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } })).id, farmer, market };
  }
  const fee = async (id: string) => Number((await t.prisma.payment.findFirstOrThrow({ where: { booking: { shipment: { id } } } })).deliveryFee);

  it("TriHaul: A→B yuki uchun B→C yuki tavsiya qilinadi; foyda yig'indisi hisoblanadi; to'g'ridan-to'g'ri qaytish yuki bo'lsa tavsiya yo'q", async () => {
    const driver = await registerDriver(t.http, { capacityKg: 20000 });
    const l1 = await load('Samarqand', 'Toshkent shahri'), l2 = await load('Toshkent shahri', 'Jizzax', 2000);
    const r = (await send('get', driver, `/shipments/${l1.id}/trihaul`)).body;
    expect(r.eligible).toBe(true);
    expect(r.options[0]).toMatchObject({ loadId: l2.id, via: 'Jizzax' });
    const [f1, f2] = [await fee(l1.id), await fee(l2.id)];
    expect(r.options[0].totalFee).toBe(f1 + f2);
    expect(r.options[0].boostPercent).toBe(Math.round((f2 / f1) * 100));
    expect(r.options[0].totalKm).toBe(r.options[0].loadedKm + r.options[0].emptyKm);
    expect(r.options[0].legs.at(-1)).toMatchObject({ kind: 'EMPTY', to: 'Samarqand' });
    const batch = (await send('get', driver, '/shipments/trihaul')).body;
    expect(batch.items[l1.id].loadId).toBe(l2.id);
    // sig'maydigan yuk tavsiya qilinmaydi
    const small = await registerDriver(t.http, { capacityKg: 1000 });
    expect((await send('get', small, `/shipments/${l1.id}/trihaul`)).body.eligible).toBe(false);
    // B→A to'g'ridan-to'g'ri qaytish yuki paydo bo'ldi
    await load('Toshkent shahri', 'Samarqand', 3000);
    const after = (await send('get', driver, `/shipments/${l1.id}/trihaul`)).body;
    expect(after).toMatchObject({ eligible: false, directReturn: true });
    expect((await send('get', driver, '/shipments/trihaul')).body.items[l1.id]).toBeUndefined();
    // faqat haydovchilar
    expect((await send('get', l1.farmer, `/shipments/${l1.id}/trihaul`)).status).toBe(403);
  });

  it("zanjirli bron: ikkala yuk birdan biriktiriladi; ikkinchi yuk birinchisi yetkazilmaguncha yo'lga chiqmaydi; mos kelmagan juft rad etiladi", async () => {
    const driver = await registerDriver(t.http, { capacityKg: 20000 });
    const l1 = await load('Samarqand', 'Toshkent shahri'), l2 = await load('Toshkent shahri', 'Jizzax', 2000), bad = await load('Buxoro', 'Navoiy', 1000);
    expect((await send('post', driver, '/shipments/chain-accept', { firstId: l1.id, secondId: bad.id })).status).toBe(400);
    expect((await send('post', driver, '/shipments/chain-accept', { firstId: l1.id, secondId: l1.id })).status).toBe(400);
    expect((await send('post', driver, '/shipments/chain-accept', { firstId: 'x', secondId: l2.id })).status).toBe(400);
    const ok = await send('post', driver, '/shipments/chain-accept', { firstId: l1.id, secondId: l2.id });
    expect(ok.status).toBe(201);
    expect(ok.body.first).toMatchObject({ id: l1.id, status: 'LOADING', chainSeq: 1 });
    expect(ok.body.second).toMatchObject({ id: l2.id, status: 'LOADING', chainSeq: 2, chainId: ok.body.chainId });
    // ikkinchi yuk oldin yo'lga chiqolmaydi
    expect((await send('patch', driver, `/shipments/${l2.id}/advance`)).status).toBe(409);
    await send('patch', driver, `/shipments/${l1.id}/advance`);
    expect((await send('patch', driver, `/shipments/${l2.id}/advance`)).status).toBe(409);
    await send('patch', driver, `/shipments/${l1.id}/advance`); // yetkazildi
    expect((await send('patch', driver, `/shipments/${l2.id}/advance`)).status).toBe(200);
    // endi bu yuklar uchun TriHaul qayta taklif qilinmaydi
    expect((await send('get', driver, `/shipments/${l1.id}/trihaul`)).body.eligible).toBe(false);
  });

  it("zanjirdagi birinchi yuk qaytarilsa zanjir buziladi; oddiy (FTL) haydovchi zanjirsiz ikkinchi yuk ola olmaydi", async () => {
    const driver = await registerDriver(t.http, { capacityKg: 20000 });
    const l1 = await load('Samarqand', 'Toshkent shahri'), l2 = await load('Toshkent shahri', 'Jizzax', 2000);
    await send('post', driver, '/shipments/chain-accept', { firstId: l1.id, secondId: l2.id });
    expect((await send('post', driver, `/shipments/${l1.id}/release`)).status).toBe(201);
    const second = await t.prisma.shipment.findUniqueOrThrow({ where: { id: l2.id } });
    expect(second.chainId).toBeNull();
    expect((await send('patch', driver, `/shipments/${l2.id}/advance`)).status).toBe(200); // endi mustaqil
    const l3 = await load('Samarqand', 'Toshkent shahri', 1000);
    expect((await send('post', driver, `/shipments/${l3.id}/accept`)).status).toBe(409);
  });

  /** n ta yuk yetkaziladi: bozor stavkasi statistikasi shundan hosil bo'ladi */
  async function deliver(n: number, f = 'Samarqand', m = 'Toshkent shahri') {
    for (let i = 0; i < n; i++) {
      const driver = await registerDriver(t.http, { capacityKg: 20000 });
      const l = await load(f, m, 2000 + i * 100);
      await send('post', driver, `/shipments/${l.id}/accept`);
      await send('patch', driver, `/shipments/${l.id}/advance`);
      await send('patch', driver, `/shipments/${l.id}/advance`);
    }
  }

  it("bozor stavkasi: yakunlangan yuklar bo'yicha so'm/km o'rtachasi; yo'nalish yo'nalishga bog'liq emas; kam namuna bo'lsa solishtirilmaydi", async () => {
    const viewer = await registerFarmer(t.http);
    await deliver(3);
    const idx = (await send('get', viewer, '/rates/routes?days=30')).body;
    const route = idx.routes.find((r: any) => r.origin === 'Samarqand');
    expect(route.samples).toBe(3);
    const rows = await t.prisma.payment.findMany({ where: { status: 'HELD' } });
    expect(route.ratePerKm).toBe(Math.round(rows.reduce((a, p) => a + Number(p.deliveryFee), 0) / rows.reduce((a, p) => a + p.distanceKm, 0)));
    expect(idx.global.samples).toBe(3);
    expect(idx.tariffPerKm).toBeGreaterThan(0);
    const cmp = (q: string) => send('get', viewer, `/rates/compare?${q}`);
    const avg = route.ratePerKm;
    const hot = (await cmp(`route=${encodeURIComponent('Toshkent ↔ Samarqand')}&ratePerKm=${Math.round(avg * 1.2)}`)).body.compare;
    expect(hot).toMatchObject({ verdict: 'HOT', scope: 'route', samples: 3, avgRatePerKm: avg });
    expect(hot.diffPercent).toBeGreaterThan(15);
    expect((await cmp(`origin=Samarqand&dest=${encodeURIComponent('Toshkent shahri')}&ratePerKm=${Math.round(avg * 0.9)}`)).body.compare.verdict).toBe('LOW');
    expect((await cmp(`route=Samarqand%20Toshkent&ratePerKm=${avg}`)).body.compare.verdict).toBe('FAIR');
    // boshqa yo'nalish: namuna yetarli emas -> solishtirilmaydi
    expect((await cmp(`route=Buxoro%20Navoiy&ratePerKm=${avg}`)).body.compare).toBeNull();
    expect((await cmp('ratePerKm=100')).status).toBe(400);
    expect((await send('get', viewer, '/rates/routes?days=45')).status).toBe(400);
    expect((await t.http().get('/rates/routes')).status).toBe(401);
  });

  it("indeks yuk va e'lon kartochkalarida: haydovchi ko'rgan yuk, e'lon va bron taxmini bozor bilan solishtiriladi", async () => {
    await deliver(3);
    const driver = await registerDriver(t.http, { capacityKg: 20000 });
    const open = await load('Samarqand', 'Toshkent shahri', 2000);
    const card = (await send('get', driver, '/shipments/available')).body.find((s: any) => s.id === open.id);
    expect(card.marketRate).toMatchObject({ scope: 'route', samples: 3 });
    expect(['HOT', 'FAIR', 'LOW']).toContain(card.marketRate.verdict);
    const avg = card.marketRate.avgRatePerKm;
    const post = (await send('post', driver, '/driver-posts', { status: 'AVAILABLE', trailerType: 'DRY_VAN', capacityKg: 10000, routes: ['Samarqand ↔ Toshkent'], currentLocation: 'Samarqand sh.', pricePerKm: Math.round(avg * 1.25) })).body;
    expect(post.marketRate).toMatchObject({ verdict: 'HOT', scope: 'route' });
    const cheap = (await send('post', driver, '/driver-posts', { status: 'AVAILABLE', trailerType: 'DRY_VAN', capacityKg: 10000, routes: ['Samarqand ↔ Toshkent'], currentLocation: 'Samarqand sh.', pricePerKm: Math.round(avg * 0.8) })).body;
    expect(cheap.marketRate.verdict).toBe('LOW');
    expect((await send('post', driver, '/driver-posts', { status: 'AVAILABLE', trailerType: 'DRY_VAN', capacityKg: 10000, routes: ['Samarqand ↔ Toshkent'], currentLocation: 'Samarqand sh.' })).body.marketRate).toBeNull();
    // market bron oldidan taxmin
    const farmer = await registerFarmer(t.http, { region: 'Samarqand' }), market = await registerMarket(t.http, { region: 'Toshkent shahri' });
    const product = await createProduct(t.http, farmer, { quantityKg: 5000, pricePerKg: 1000 });
    const est = (await send('get', market, `/pricing/estimate?productId=${product.id}&quantityKg=2000`)).body;
    expect(est.marketRate).toMatchObject({ scope: 'route' });
    // mahsulot narxi bozor narxi bilan
    const admin = await createAdmin(t, 'DISPATCHER');
    await t.http().post('/market-prices').set('Authorization', bearer(admin)).field('marketName', 'Toshkent Food City').field('productName', 'Kartoshka').field('priceToday', '5000');
    const pr = (await send('get', farmer, '/rates/product?name=kartoshka&pricePerKg=5500')).body;
    expect(pr).toMatchObject({ avgPricePerKg: 5000, markets: 1, diffPercent: 10 });
    expect((await send('get', farmer, '/rates/product?name=yoq-mahsulot')).body.avgPricePerKg).toBeNull();
  });
});
