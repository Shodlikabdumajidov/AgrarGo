import { PAYMENT_PROVIDER } from '../src/payment/provider/payment-provider';
import { bearer, bootApp, createAdmin, createProduct, registerConsumer, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

describe('Hub ombori va chakana (B2C) savdo (e2e)', () => {
  let t: TestApp;
  let calls: { kind: string; paymentId: string; amount: string }[];
  beforeAll(async () => {
    t = await bootApp();
    const prov: any = t.app.get(PAYMENT_PROVIDER);
    for (const kind of ['charge', 'payout', 'refund']) {
      const orig = prov[kind].bind(prov);
      prov[kind] = async (req: any) => { calls.push({ kind, paymentId: req.paymentId, amount: req.amount }); return orig(req); };
    }
  });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); calls = []; });

  const send = (m: 'get' | 'post' | 'patch' | 'delete', who: any, path: string, body?: any) => (who ? t.http()[m](path).set('Authorization', bearer(who)) : t.http()[m](path)).send(body);

  /** Hub + xodim + fermer (1000 kg, hub'ga 980 kg qabul qilingan, chakana narx 4500) + xaridor + kuryer */
  async function world(opts: { received?: number } = {}) {
    const admin = await createAdmin(t, 'ADMIN'), staff = await createAdmin(t, 'DISPATCHER');
    const hub = (await send('post', admin, '/hubs', { name: 'Samarqand Hub', region: 'Samarqand', district: 'Siyob', address: 'Sanoat 5' })).body;
    await send('post', admin, `/hubs/${hub.id}/staff`, { userId: staff.user.id });
    const farmer = await registerFarmer(t.http, { region: 'Qashqadaryo' });
    const product = await createProduct(t.http, farmer, { name: 'Kartoshka', category: 'Sabzavot', quantityKg: 1000, pricePerKg: 3000 });
    const intake = (await send('post', farmer, '/hub/intakes', { productId: product.id, hubId: hub.id, declaredKg: 1000, retailPricePerKg: 4500, minOrderKg: 10 })).body;
    const recv = await send('post', staff, `/hub/intakes/${intake.id}/receive`, { receivedKg: opts.received ?? 980 });
    expect(recv.status).toBe(201);
    const consumer = await registerConsumer(t.http), courier = await registerDriver(t.http, { region: 'Samarqand' });
    const order = async (qty: number, extra: any = {}) => send('post', consumer, '/local/orders', { productId: product.id, quantityKg: qty, district: 'Siyob', address: "Registon ko'chasi 10, 5-uy", ...extra });
    const stock = async () => (await t.prisma.hubStock.findFirstOrThrow({ where: { hubId: hub.id, productId: product.id } }));
    return { admin, staff, hub, farmer, product, intake, consumer, courier, order, stock };
  }

  it("fermer Hub'ga topshiradi, Hub qabul qiladi: qoldiq Hub'ga o'tadi, e'londan ayriladi, mahalliy bozorda ko'rinadi", async () => {
    const w = await world();
    const st = await w.stock();
    expect(Number(st.weightKg)).toBe(980);
    expect(Number(st.reservedKg)).toBe(0);
    const p = await t.prisma.product.findUniqueOrThrow({ where: { id: w.product.id } });
    expect(Number(p.quantityKg)).toBe(20);
    expect(p).toMatchObject({ isRetail: true, hubId: w.hub.id });
    expect(Number(p.retailPricePerKg)).toBe(4500);
    const mv = await t.prisma.hubStockMovement.findMany({ where: { stockId: st.id } });
    expect(mv.map((m) => m.type)).toEqual(['INTAKE']);
    const market = (await send('get', null, '/local/market?region=Samarqand')).body;
    expect(market).toHaveLength(1);
    expect(market[0]).toMatchObject({ name: 'Kartoshka', pricePerKg: 4500, minOrderKg: 10, availableKg: 980, farmName: expect.any(String), hub: { name: 'Samarqand Hub' } });
    expect((await send('get', null, '/local/market?region=Buxoro')).body).toHaveLength(0);
    expect((await send('get', null, '/local/market?q=kartosh')).body).toHaveLength(1);
    // fermer paneli
    const ov = (await send('get', w.farmer, '/hub/retail')).body[0];
    expect(ov).toMatchObject({ isRetail: true, quantityKg: 20, hubStock: { weightKg: 980, availableKg: 980 } });
  });

  it("topshirish qoidalari: e'londan ko'p topshirib bo'lmaydi, vazn oshib ketmaydi, ikki marta qabul yo'q, rol cheklovlari", async () => {
    const admin = await createAdmin(t, 'ADMIN'), staff = await createAdmin(t, 'DISPATCHER'), otherStaff = await createAdmin(t, 'DISPATCHER');
    const hub = (await send('post', admin, '/hubs', { name: 'H1', region: 'Samarqand' })).body, hub2 = (await send('post', admin, '/hubs', { name: 'H2', region: 'Buxoro' })).body;
    expect((await send('post', admin, '/hubs', { name: 'H3', region: 'Atlantida' })).status).toBe(400);
    expect((await send('post', admin, '/hubs', { name: 'H1', region: 'Samarqand' })).status).toBe(409);
    await send('post', admin, `/hubs/${hub.id}/staff`, { userId: staff.user.id });
    await send('post', admin, `/hubs/${hub2.id}/staff`, { userId: otherStaff.user.id });
    const farmer = await registerFarmer(t.http), product = await createProduct(t.http, farmer, { quantityKg: 100, pricePerKg: 3000 });
    const ann = (b: any) => send('post', farmer, '/hub/intakes', { productId: product.id, hubId: hub.id, retailPricePerKg: 4000, ...b });
    expect((await ann({ declaredKg: 150 })).status).toBe(409);
    const ok = await ann({ declaredKg: 60 });
    expect(ok.status).toBe(201);
    expect((await ann({ declaredKg: 50 })).status).toBe(409); // 60 + 50 > 100
    expect((await send('post', staff, '/hub/intakes', { productId: product.id, hubId: hub.id, declaredKg: 1, retailPricePerKg: 1 })).status).toBe(403);
    expect((await send('post', farmer, `/hub/intakes/${ok.body.id}/receive`, { receivedKg: 10 })).status).toBe(403);
    expect((await send('post', otherStaff, `/hub/intakes/${ok.body.id}/receive`, { receivedKg: 10 })).status).toBe(403); // boshqa Hub xodimi
    expect((await send('post', staff, `/hub/intakes/${ok.body.id}/receive`, { receivedKg: 61 })).status).toBe(400);
    expect((await send('post', staff, `/hub/intakes/${ok.body.id}/receive`, { receivedKg: 58.5 })).status).toBe(201);
    expect((await send('post', staff, `/hub/intakes/${ok.body.id}/receive`, { receivedKg: 10 })).status).toBe(409);
    expect(Number((await t.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).quantityKg)).toBe(41.5);
    // rad etish va bekor qilish
    const a2 = (await ann({ declaredKg: 20 })).body, a3 = (await ann({ declaredKg: 10 })).body;
    expect((await send('post', staff, `/hub/intakes/${a2.id}/reject`, { note: 'x' })).status).toBe(400);
    expect((await send('post', staff, `/hub/intakes/${a2.id}/reject`, { note: 'Sifati past' })).body).toMatchObject({ status: 'REJECTED', note: 'Sifati past' });
    expect((await send('post', farmer, `/hub/intakes/${a3.id}/cancel`)).body.status).toBe('CANCELLED');
    expect(Number((await t.prisma.hubStock.findFirstOrThrow()).weightKg)).toBe(58.5);
    // xodim faqat o'z Hub'ining topshirishlarini ko'radi
    expect((await send('get', staff, '/hub/intakes')).body.length).toBe(3);
    expect((await send('get', otherStaff, '/hub/intakes')).body).toHaveLength(0);
    // chakana sotuvni qo'lda yoqish/o'chirish
    expect((await send('patch', farmer, `/hub/retail/${product.id}`, { isRetail: false })).body.isRetail).toBe(false);
    expect((await send('get', null, '/local/market')).body).toHaveLength(0);
    expect((await send('patch', farmer, `/hub/retail/${product.id}`, { isRetail: true, retailPricePerKg: 5000 })).body).toMatchObject({ isRetail: true, retailPricePerKg: 5000 });
  });

  it("buyurtma: narx tarkibi ochiq, zaxira avtomatik, escrow 4 ulushga bo'linadi (yig'indi = jami)", async () => {
    const w = await world();
    const q = (await send('get', null, `/local/quote?productId=${w.product.id}&quantityKg=10`)).body;
    expect(q).toMatchObject({ productAmount: 45000, hubFee: 2300, courierFee: 12000, serviceFee: 1400, totalPrice: 60700, availableKg: 980 });
    const r = await w.order(10);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'PENDING', productAmount: 45000, hubFee: 2300, courierFee: 12000, serviceFee: 1400, totalPrice: 60700, paymentStatus: 'HELD', canCancel: true });
    expect(r.body.deliveryCode).toMatch(/^\d{4}$/);
    expect(r.body.splits.map((s: any) => [s.party, s.amount, s.status])).toEqual([['FARMER', 45000, 'HELD'], ['HUB', 2300, 'HELD'], ['COURIER', 12000, 'HELD'], ['PLATFORM', 1400, 'HELD']]);
    expect(r.body.splits.reduce((a: number, s: any) => a + s.amount, 0)).toBe(r.body.totalPrice);
    expect(calls.find((c) => c.kind === 'charge')).toMatchObject({ amount: '60700.00' });
    // qoldiq: mavjud 980, zaxira 10
    const st = await w.stock();
    expect([Number(st.weightKg), Number(st.reservedKg)]).toEqual([980, 10]);
    expect((await send('get', null, '/local/market')).body[0].availableKg).toBe(970);
    const mv = await t.prisma.hubStockMovement.findMany({ where: { stockId: st.id }, orderBy: { createdAt: 'asc' } });
    expect(mv.map((m) => m.type)).toEqual(['INTAKE', 'RESERVE']);
    // DB'dagi yig'indi cheklovi
    const row = await t.prisma.localOrder.findFirstOrThrow();
    expect(Number(row.totalPrice)).toBe(Number(row.productAmount) + Number(row.hubFee) + Number(row.courierFee) + Number(row.serviceFee));
  });

  it("buyurtma qoidalari: eng kam/ko'p miqdor, qoldiq, viloyat, rol; ikki xaridor bir vaqtda oxirgi qoldiqni bo'lisha olmaydi", async () => {
    const w = await world({ received: 25 });
    expect((await w.order(5)).status).toBe(400); // min 10
    expect((await w.order(300)).status).toBe(400); // max 200
    expect((await w.order(30)).status).toBe(409); // 25 mavjud
    expect((await w.order(10, { region: 'Buxoro' })).status).toBe(400); // Hub boshqa viloyatda
    expect((await w.order(10, { address: 'x' })).status).toBe(400);
    expect((await send('post', null, '/local/orders', {})).status).toBe(401);
    // Market endi Hub zaxirasidan buyura oladi (market-hub-dispatch.e2e-spec.ts); fermer va haydovchi — yo'q
    expect((await send('post', w.farmer, '/local/orders', { productId: w.product.id, quantityKg: 10, district: 'x', address: 'abcdef' })).status).toBe(403);
    expect((await send('post', w.courier, '/local/orders', { productId: w.product.id, quantityKg: 10, district: 'x', address: 'abcdef' })).status).toBe(403);
    // parallel: 25 kg dan ikki marta 15 kg
    const c2 = await registerConsumer(t.http);
    const mk = (who: any) => send('post', who, '/local/orders', { productId: w.product.id, quantityKg: 15, district: 'Siyob', address: "Registon ko'chasi 10" });
    const res = await Promise.all([mk(w.consumer), mk(c2)]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    const st = await w.stock();
    expect(Number(st.reservedKg)).toBe(15);
    expect(await t.prisma.payment.count()).toBe(1); // rad etilgan buyurtma uchun to'lov yo'q
  });

  it("to'liq oqim: PENDING -> PACKING -> tayyor -> kuryer oladi -> kod bilan yetkaziladi; qoldiq kamayadi, escrow ulushlarga o'tadi", async () => {
    const w = await world();
    const o = (await w.order(10)).body;
    const id = o.id;
    // fermer va xodim ko'rinishi: kod yo'q, fermerga manzil ko'rinmaydi
    const farmerView = (await send('get', w.farmer, `/local/orders/${id}`)).body;
    expect(farmerView).toMatchObject({ farmerAmount: 45000, status: 'PENDING' });
    expect(farmerView.deliveryAddress).toBeUndefined();
    expect(farmerView.deliveryCode).toBeUndefined();
    const staffView = (await send('get', w.staff, `/local/orders/${id}`)).body;
    expect(staffView.deliveryCode).toBeUndefined();
    expect(staffView.deliveryAddress).toContain('Registon');
    // kuryer rejimisiz olib bo'lmaydi
    expect((await send('post', w.courier, `/local/orders/${id}/accept`)).status).toBe(403);
    expect((await send('post', w.staff, `/local/orders/${id}/packed`)).status).toBe(409); // qadoqlash boshlanmagan
    expect((await send('post', w.staff, `/local/orders/${id}/pack-start`)).body.status).toBe('PACKING');
    expect((await send('post', w.staff, `/local/orders/${id}/pack-start`)).status).toBe(409);
    // kuryer rejimi: Hub tanlanadi, viloyat mos bo'lishi shart
    const far = await registerDriver(t.http, { region: 'Buxoro' });
    expect((await send('patch', far, '/local/courier/mode', { enabled: true, hubId: w.hub.id })).status).toBe(400);
    expect((await send('patch', w.courier, '/local/courier/mode', { enabled: true })).status).toBe(400); // hub tanlanmagan
    const me = (await send('patch', w.courier, '/local/courier/mode', { enabled: true, hubId: w.hub.id })).body;
    expect(me).toMatchObject({ courierMode: true, hub: { name: 'Samarqand Hub' }, activeOrders: 0 });
    expect((await send('get', w.courier, '/local/courier/available')).body).toHaveLength(0); // hali tayyor emas
    expect((await send('post', w.courier, `/local/orders/${id}/accept`)).status).toBe(409);
    await send('post', w.staff, `/local/orders/${id}/packed`);
    const avail = (await send('get', w.courier, '/local/courier/available')).body;
    expect(avail).toHaveLength(1);
    expect(avail[0]).toMatchObject({ id, courierFee: 12000, deliveryDistrict: 'Siyob', productName: 'Kartoshka', quantityKg: 10 });
    expect(avail[0].deliveryAddress).toBeUndefined(); // olishdan oldin aniq manzil yashirin
    expect(avail[0].contactPhone).toBeUndefined();
    const acc = await send('post', w.courier, `/local/orders/${id}/accept`);
    expect(acc.status).toBe(201);
    expect(acc.body).toMatchObject({ status: 'DELIVERING', deliveryAddress: "Registon ko'chasi 10, 5-uy" });
    expect(acc.body.deliveryCode).toBeUndefined(); // kuryer kodni bilmaydi
    // ombordan jismonan chiqdi
    const st = await w.stock();
    expect([Number(st.weightKg), Number(st.reservedKg)]).toEqual([970, 0]);
    expect((await send('get', w.consumer, `/local/orders/${id}`)).body).toMatchObject({ status: 'DELIVERING', courier: { phone: w.courier.phone }, canCancel: false, canConfirm: true });
    expect((await send('post', w.consumer, `/local/orders/${id}/cancel`)).status).toBe(409);
    // noto'g'ri kod, so'ng to'g'ri kod
    const code = (await t.prisma.localOrder.findUniqueOrThrow({ where: { id } })).deliveryCode;
    const wrong = code === '1111' ? '2222' : '1111';
    expect((await send('post', w.courier, `/local/orders/${id}/deliver`, { code: wrong })).status).toBe(400);
    expect((await send('post', w.courier, `/local/orders/${id}/deliver`, { code: 'abcd' })).status).toBe(400);
    const done = await send('post', w.courier, `/local/orders/${id}/deliver`, { code });
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ status: 'COMPLETED', paymentStatus: 'RELEASED' });
    const cv = (await send('get', w.consumer, `/local/orders/${id}`)).body;
    expect(cv.splits.every((s: any) => s.status === 'PAID')).toBe(true);
    // escrow taqsimoti: har kimga o'z ulushi
    const payouts = calls.filter((c) => c.kind === 'payout').map((c) => [c.paymentId.split(':')[1], c.amount]).sort();
    expect(payouts).toEqual([['courier', '12000.00'], ['farmer', '45000.00'], ['hub', '2300.00']]);
    expect(calls.filter((c) => c.kind === 'refund')).toHaveLength(0);
    const split = await t.prisma.paymentSplit.findMany({ where: { payment: { localOrderId: id } } });
    expect(split.find((s) => s.party === 'COURIER')!.partyId).toBe(w.courier.user.driver?.id ?? (await t.prisma.driver.findFirstOrThrow({ where: { userId: w.courier.user.id } })).id);
    expect(split.reduce((a, s) => a + Number(s.amount), 0)).toBe(60700);
    // yakunlangach kod ko'rinmaydi; takroriy yakunlash yo'q
    expect((await send('get', w.consumer, `/local/orders/${id}`)).body.deliveryCode).toBeNull();
    expect((await send('post', w.courier, `/local/orders/${id}/deliver`, { code })).status).toBe(409);
    const mv = await t.prisma.hubStockMovement.findMany({ where: { refId: id }, orderBy: { createdAt: 'asc' } });
    expect(mv.map((m) => m.type)).toEqual(['RESERVE', 'DISPATCH']);
    // to'lovlar ro'yxati: fermer va administrator chakana to'lovni ko'radi (xato bermaydi)
    const fp = (await send('get', w.farmer, '/payments')).body.find((p: any) => p.source === 'LOCAL');
    expect(fp).toMatchObject({ source: 'LOCAL', productPrice: 45000, hubFee: 2300, deliveryFee: 12000, serviceFee: 1400, totalPrice: 60700, status: 'RELEASED' });
    expect(fp.splits).toHaveLength(4);
    expect((await send('get', w.admin, '/payments')).status).toBe(200);
  });

  it("xaridor yetkazilganini o'zi tasdiqlaydi; 5 ta xato koddan keyin kuryer kodi bloklanadi", async () => {
    const w = await world();
    const id = (await w.order(12)).body.id;
    await send('post', w.staff, `/local/orders/${id}/pack-start`); await send('post', w.staff, `/local/orders/${id}/packed`);
    await send('patch', w.courier, '/local/courier/mode', { enabled: true, hubId: w.hub.id });
    await send('post', w.courier, `/local/orders/${id}/accept`);
    const code = (await t.prisma.localOrder.findUniqueOrThrow({ where: { id } })).deliveryCode;
    const wrong = code === '0000' ? '9999' : '0000';
    for (let i = 0; i < 5; i++) expect((await send('post', w.courier, `/local/orders/${id}/deliver`, { code: wrong })).status).toBe(400);
    expect((await send('post', w.courier, `/local/orders/${id}/deliver`, { code })).status).toBe(409); // bloklangan: to'g'ri kod ham o'tmaydi
    const other = await registerConsumer(t.http);
    expect((await send('post', other, `/local/orders/${id}/confirm`)).status).toBe(404);
    const done = await send('post', w.consumer, `/local/orders/${id}/confirm`);
    expect(done.body).toMatchObject({ status: 'COMPLETED', paymentStatus: 'RELEASED' });
    expect(calls.filter((c) => c.kind === 'payout')).toHaveLength(3);
  });

  it("bekor qilish: xaridor (PENDING) — to'liq qaytim va zaxira bo'shaydi; Hub (PACKING); admin yo'ldagini — yuk omborga qaytadi", async () => {
    const w = await world();
    // 1) xaridor PENDING
    const a = (await w.order(10)).body.id;
    const c1 = await send('post', w.consumer, `/local/orders/${a}/cancel`, { reason: "Fikrim o'zgardi" });
    expect(c1.body).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED', cancelReason: "Fikrim o'zgardi" });
    expect(c1.body.splits.every((s: any) => s.status === 'REFUNDED')).toBe(true);
    expect(calls.find((c) => c.kind === 'refund')).toMatchObject({ amount: '60700.00' });
    expect(Number((await w.stock()).reservedKg)).toBe(0);
    expect((await send('post', w.consumer, `/local/orders/${a}/cancel`)).status).toBe(409); // ikki marta emas
    expect(calls.filter((c) => c.kind === 'payout')).toHaveLength(0);
    // 2) Hub PACKING paytida
    const b = (await w.order(20)).body.id;
    await send('post', w.staff, `/local/orders/${b}/pack-start`);
    expect((await send('post', w.consumer, `/local/orders/${b}/cancel`)).status).toBe(409);
    expect((await send('post', w.staff, `/local/orders/${b}/cancel`, { reason: 'Mahsulot sifatsiz' })).body).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
    expect(Number((await w.stock()).reservedKg)).toBe(0);
    // 3) admin yo'ldagi buyurtmani bekor qiladi: yuk omborga qaytadi
    const c = (await w.order(30)).body.id;
    await send('post', w.staff, `/local/orders/${c}/pack-start`); await send('post', w.staff, `/local/orders/${c}/packed`);
    await send('patch', w.courier, '/local/courier/mode', { enabled: true, hubId: w.hub.id });
    await send('post', w.courier, `/local/orders/${c}/accept`);
    expect(Number((await w.stock()).weightKg)).toBe(950);
    expect((await send('post', w.staff, `/local/orders/${c}/cancel`)).status).toBe(409); // Hub xodimi yo'ldagini bekor qila olmaydi
    expect((await send('post', w.admin, `/local/orders/${c}/cancel`, { reason: 'Kuryer yetkaza olmadi' })).body.status).toBe('CANCELLED');
    const st = await w.stock();
    expect([Number(st.weightKg), Number(st.reservedKg)]).toEqual([980, 0]);
    const mv = (await t.prisma.hubStockMovement.findMany({ where: { refId: c } })).map((m) => m.type).sort();
    expect(mv).toEqual(['DISPATCH', 'RESERVE', 'RETURN']);
    // jami: hech narsa to'lanmagan, uch marta to'liq qaytarilgan
    expect(calls.filter((x) => x.kind === 'refund')).toHaveLength(3);
    expect(calls.filter((x) => x.kind === 'payout')).toHaveLength(0);
  });

  it("kuryer cheklovlari: boshqa Hub buyurtmasini ololmaydi, bir vaqtda 3 tagacha; xodim faqat o'z Hub'ini boshqaradi; xaridor ma'lumoti yopiq", async () => {
    const w = await world();
    const hub2 = (await send('post', w.admin, '/hubs', { name: 'Samarqand Hub 2', region: 'Samarqand' })).body;
    const outsider = await registerDriver(t.http, { region: 'Samarqand' });
    await send('patch', outsider, '/local/courier/mode', { enabled: true, hubId: hub2.id });
    await send('patch', w.courier, '/local/courier/mode', { enabled: true, hubId: w.hub.id });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) { const id = (await w.order(10)).body.id; ids.push(id); await send('post', w.staff, `/local/orders/${id}/pack-start`); await send('post', w.staff, `/local/orders/${id}/packed`); }
    expect((await send('post', outsider, `/local/orders/${ids[0]}/accept`)).status).toBe(404); // boshqa Hub
    expect((await send('get', outsider, '/local/courier/available')).body).toHaveLength(0);
    for (let i = 0; i < 3; i++) expect((await send('post', w.courier, `/local/orders/${ids[i]}/accept`)).status).toBe(201);
    expect((await send('post', w.courier, `/local/orders/${ids[3]}/accept`)).status).toBe(409);
    // bir buyurtmani ikki kuryer olmaydi
    await send('patch', outsider, '/local/courier/mode', { enabled: true, hubId: w.hub.id });
    expect((await send('post', outsider, `/local/orders/${ids[0]}/accept`)).status).toBe(409);
    // boshqa Hub xodimi
    const staff2 = await createAdmin(t, 'DISPATCHER');
    await send('post', w.admin, `/hubs/${hub2.id}/staff`, { userId: staff2.user.id });
    expect((await send('get', staff2, `/local/orders/${ids[3]}`)).status).toBe(404);
    expect((await send('post', staff2, `/local/orders/${ids[3]}/cancel`)).status).toBe(404);
    expect((await send('get', staff2, '/local/hub/orders')).body).toHaveLength(0);
    expect((await send('get', w.staff, '/local/hub/orders')).body).toHaveLength(4);
    // begona xaridor va fermer buyurtmani ko'rmaydi
    const other = await registerConsumer(t.http), otherFarmer = await registerFarmer(t.http);
    expect((await send('get', other, `/local/orders/${ids[0]}`)).status).toBe(404);
    expect((await send('get', otherFarmer, `/local/orders/${ids[0]}`)).status).toBe(404);
    expect((await send('get', w.consumer, '/local/orders/mine')).body).toHaveLength(4);
    expect((await send('get', w.farmer, '/local/farmer/orders')).body).toHaveLength(4);
    expect((await send('get', other, '/local/orders/mine')).body).toHaveLength(0);
  });

  it("xaridor profili va B2B ajratilishi: ro'yxatdan o'tish, profilni yangilash, B2B endpointlar yopiq, obuna talab qilinmaydi", async () => {
    const c = await registerConsumer(t.http);
    expect(c.user.role).toBe('CONSUMER');
    expect(c.user.consumer).toMatchObject({ region: 'Samarqand', district: 'Siyob' });
    const up = await send('patch', c, '/profile', { district: 'Urgut', address: 'Yangi 5' });
    expect(up.status).toBe(200);
    expect(up.body.consumer).toMatchObject({ district: 'Urgut', address: 'Yangi 5' });
    for (const [m, path] of [['post', '/bookings'], ['get', '/shipments/mine'], ['get', '/payments'], ['get', '/hub/retail'], ['get', '/driver-posts/offerable']] as const) {
      expect((await send(m as any, c, path, {})).status).toBe(403);
    }
    expect((await send('get', c, '/subscription')).body).toMatchObject({ state: 'EXEMPT', hasAccess: true }); // xaridor uchun obuna talab qilinmaydi
    expect((await t.http().post('/auth/consumer/register').send({ phone: c.phone, password: 'parol1234', fullName: 'X Y', region: 'Samarqand', district: 'Siyob' })).status).toBe(409);
    const login = await t.http().post('/auth/login').send({ phone: c.phone, password: 'parol1234' });
    expect(login.status).toBe(200);
  });
});
