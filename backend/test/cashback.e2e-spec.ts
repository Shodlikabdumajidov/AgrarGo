import { PAYMENT_PROVIDER } from '../src/payment/provider/payment-provider';
import { Account, approve, bearer, book, bootApp, createAdmin, createProduct, registerConsumer, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

describe('Keshbek (e2e)', () => {
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

  const send = (m: 'get' | 'post' | 'patch', who: any, path: string, body?: any) => (who ? t.http()[m](path).set('Authorization', bearer(who)) : t.http()[m](path)).send(body);
  const balance = async (a: Account) => Number((await t.prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).cashbackBalance);
  const addr = { district: 'Siyob', address: "Registon ko'chasi 10, 5-uy" };

  async function world() {
    const admin = await createAdmin(t, 'ADMIN'), staff = await createAdmin(t, 'DISPATCHER');
    const hub = (await send('post', admin, '/hubs', { name: 'Samarqand Hub', region: 'Samarqand' })).body;
    await send('post', admin, `/hubs/${hub.id}/staff`, { userId: staff.user.id });
    const farmer = await registerFarmer(t.http, { region: 'Qashqadaryo' });
    const product = await createProduct(t.http, farmer, { name: 'Kartoshka', category: 'Sabzavot', quantityKg: 1000, pricePerKg: 3000 });
    const intake = (await send('post', farmer, '/hub/intakes', { productId: product.id, hubId: hub.id, declaredKg: 500, retailPricePerKg: 4000, minOrderKg: 10 })).body;
    await send('post', staff, `/hub/intakes/${intake.id}/receive`, { receivedKg: 500 });
    const consumer = await registerConsumer(t.http), courier = await registerDriver(t.http, { region: 'Samarqand' });
    await send('patch', courier, '/local/courier/mode', { enabled: true, hubId: hub.id });
    /** buyurtma -> qadoqlash -> kuryer -> kod bilan yetkazish */
    const complete = async (id: string, code: string) => {
      await send('post', staff, `/local/orders/${id}/pack-start`, {}); await send('post', staff, `/local/orders/${id}/packed`, {});
      await send('post', courier, `/local/orders/${id}/accept`, {});
      return send('post', courier, `/local/orders/${id}/deliver`, { code });
    };
    return { staff, hub, farmer, product, consumer, courier, complete };
  }

  it("B2C: yakunlanganda xaridor/fermer/kuryerga 1% keshbek (mahsulot, mahsulot, yetkazish haqidan); takroriy yozilmaydi; escrow taqsimoti o'zgarmaydi", async () => {
    const w = await world();
    const o = (await send('post', w.consumer, '/local/orders', { productId: w.product.id, quantityKg: 50, ...addr })).body; // 50 x 4000 = 200 000
    expect(await balance(w.consumer)).toBe(0);
    const done = await w.complete(o.id, o.deliveryCode);
    expect(done.body.status).toBe('COMPLETED');
    expect(await balance(w.consumer)).toBe(2000); // 1% of 200 000
    expect(await balance(w.farmer)).toBe(2000);
    expect(await balance(w.courier)).toBe(120); // 1% of 12 000
    const my = (await send('get', w.consumer, '/cashback')).body;
    expect(my.balance).toBe(2000); expect(my.totals.earned).toBe(2000);
    expect(my.items[0]).toMatchObject({ type: 'EARNED', amount: 2000, sourceType: 'LOCAL_ORDER', sourceId: o.id });
    expect(my.rates).toMatchObject({ buyer: 1, farmer: 1, driver: 1 });
    // escrow ulushlari: fermerga to'liq mahsulot puli
    const splits = (await t.prisma.paymentSplit.findMany({ where: { payment: { localOrderId: o.id } } })).map((s) => [s.party, Number(s.amount)]);
    expect(Object.fromEntries(splits)).toMatchObject({ FARMER: 200000, COURIER: 12000 });
    // takroriy hisoblash balansni oshirmaydi (idempotent)
    const cb = t.app.get((await import('../src/cashback/cashback.service')).CashbackService);
    const pay = await t.prisma.payment.findFirstOrThrow({ where: { localOrderId: o.id } });
    await t.prisma.$transaction((tx) => cb.earnForPayment(tx, pay.id));
    expect(await balance(w.consumer)).toBe(2000);
    // boshqa foydalanuvchi o'zinikini ko'radi
    expect((await send('get', w.farmer, '/cashback')).body.balance).toBe(2000);
    expect((await send('get', null, '/cashback')).status).toBe(401);
  });

  it("keshbek ishlatish: faqat platforma xizmat haqini qoplaydi; yechiladigan summa kamayadi; ulushlar yig'indisi = yechilgan; bekor qilinsa qaytadi", async () => {
    const w = await world();
    await t.prisma.user.update({ where: { id: w.consumer.user.id }, data: { cashbackBalance: 1000 } });
    const q = (await send('post', null, '/local/cart/quote', { items: [{ productId: w.product.id, quantityKg: 50 }] })).body;
    const fee = q.serviceFee; // 3% => 6 000
    expect(fee).toBe(6000);
    calls = [];
    const o = (await send('post', w.consumer, '/local/orders', { productId: w.product.id, quantityKg: 50, ...addr, useCashback: true })).body;
    expect(o.cashbackUsed).toBe(1000); expect(o.totalPrice).toBe(q.totalPrice); expect(o.payableTotal).toBe(q.totalPrice - 1000);
    expect(Number(calls.find((c) => c.kind === 'charge')!.amount)).toBe(q.totalPrice - 1000);
    const pm = await t.prisma.payment.findFirstOrThrow({ where: { localOrderId: o.id }, include: { splits: true } });
    expect(Number(pm.cashbackUsed)).toBe(1000);
    const bySplit = Object.fromEntries(pm.splits.map((s) => [s.party, Number(s.amount)]));
    expect(bySplit.FARMER).toBe(200000); expect(bySplit.PLATFORM).toBe(fee - 1000); // faqat platforma ulushi kamaydi
    expect(pm.splits.reduce((a, s) => a + Number(s.amount), 0)).toBe(q.totalPrice - 1000); // yig'indi = xaridordan yechilgan
    expect(await balance(w.consumer)).toBe(0);
    expect((await send('get', w.consumer, '/cashback')).body.items[0]).toMatchObject({ type: 'SPENT', amount: 1000, sourceId: o.id });
    // balans yetarli bo'lmasa — hech narsa ishlatilmaydi (0), to'liq to'lanadi
    const o2 = (await send('post', w.consumer, '/local/orders', { productId: w.product.id, quantityKg: 10, ...addr, useCashback: true })).body;
    expect(o2.cashbackUsed).toBe(0);
    // bekor qilish: yechilgan sof summa qaytadi va keshbek balansga qaytadi
    calls = [];
    expect((await send('post', w.consumer, `/local/orders/${o.id}/cancel`, {})).body.status).toBe('CANCELLED');
    const rf = calls.filter((c) => c.kind === 'refund'); expect(rf).toHaveLength(1); expect(Number(rf[0].amount)).toBe(q.totalPrice - 1000);
    expect(await balance(w.consumer)).toBe(1000);
    expect((await send('get', w.consumer, '/cashback')).body.totals).toMatchObject({ spent: 1000, refunded: 1000 });
    // takroriy bekor qilish keshbekni ikki marta qaytarmaydi
    expect((await send('post', w.consumer, `/local/orders/${o.id}/cancel`, {})).status).toBe(409);
    expect(await balance(w.consumer)).toBe(1000);
  });

  it("savat (bulk): keshbek buyurtmalar o'rtasida xizmat haqiga mutanosib taqsimlanadi; bitta charge = jami - keshbek; chegara xizmat haqi", async () => {
    const w = await world();
    const b = await (async () => {
      const farmer = await registerFarmer(t.http, { region: 'Qashqadaryo' });
      const product = await createProduct(t.http, farmer, { name: 'Piyoz', category: 'Sabzavot', quantityKg: 500, pricePerKg: 2000 });
      const intake = (await send('post', farmer, '/hub/intakes', { productId: product.id, hubId: w.hub.id, declaredKg: 200, retailPricePerKg: 2500, minOrderKg: 10 })).body;
      await send('post', w.staff, `/hub/intakes/${intake.id}/receive`, { receivedKg: 200 });
      return { farmer, product };
    })();
    await t.prisma.user.update({ where: { id: w.consumer.user.id }, data: { cashbackBalance: 100000 } }); // xizmat haqidan ko'p
    const items = [{ productId: w.product.id, quantityKg: 50 }, { productId: b.product.id, quantityKg: 20 }];
    const q = (await send('post', null, '/local/cart/quote', { items })).body;
    calls = [];
    const r = await send('post', w.consumer, '/local/orders/checkout-bulk', { items, ...addr, useCashback: true });
    expect(r.status).toBe(201);
    expect(r.body.cashbackUsed).toBe(q.serviceFee); // faqat xizmat haqi qadar
    expect(r.body.payableTotal).toBe(q.totalPrice - q.serviceFee);
    const charges = calls.filter((c) => c.kind === 'charge'); expect(charges).toHaveLength(1); expect(Number(charges[0].amount)).toBe(r.body.payableTotal);
    for (const o of r.body.orders) {
      expect(o.cashbackUsed).toBeLessThanOrEqual(o.serviceFee);
      expect(o.splits.reduce((s: number, x: any) => s + x.amount, 0)).toBeCloseTo(o.totalPrice - o.cashbackUsed, 2);
    }
    expect(await balance(w.consumer)).toBe(100000 - q.serviceFee);
    // bitta buyurtmani bekor qilish: faqat shuning keshbeki qaytadi
    const first = r.body.orders[0];
    await send('post', w.consumer, `/local/orders/${first.id}/cancel`, {});
    expect(await balance(w.consumer)).toBe(100000 - q.serviceFee + first.cashbackUsed);
  });

  it("parallel: bir xil keshbek bilan ikkita buyurtma — balansdan oshib ketmaydi (manfiy bo'lmaydi)", async () => {
    const w = await world();
    await t.prisma.user.update({ where: { id: w.consumer.user.id }, data: { cashbackBalance: 6000 } }); // bitta buyurtmaning xizmat haqiga yetadi
    const mk = () => send('post', w.consumer, '/local/orders', { productId: w.product.id, quantityKg: 50, ...addr, useCashback: true });
    const rs = await Promise.all([mk(), mk()]);
    const used = rs.filter((x) => x.status === 201).reduce((a, x) => a + x.body.cashbackUsed, 0);
    expect(used).toBeLessThanOrEqual(6000);
    expect(await balance(w.consumer)).toBe(6000 - used);
    expect(await balance(w.consumer)).toBeGreaterThanOrEqual(0);
  });

  it("B2B (bron/shipment): yetkazilib pul chiqarilganda market, fermer va haydovchiga keshbek; to'lovda keshbek xizmat haqini qoplaydi va bekor qilinsa qaytadi", async () => {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http);
    const product = await createProduct(t.http, farmer, { quantityKg: 500, pricePerKg: 4500 });
    await t.prisma.user.update({ where: { id: market.user.id }, data: { cashbackBalance: 500 } });
    const mkBooking = async () => { const b = (await book(t.http, market, product.id, 100)).body; await approve(t.http, farmer, b.id); return b; };
    // 1) bekor qilinadigan to'lov: keshbek ishlatiladi va qaytadi
    const b1 = await mkBooking();
    calls = [];
    const p1 = await send('post', market, '/payments/init', { bookingId: b1.id, useCashback: true });
    expect(p1.status).toBe(200); expect(p1.body.cashbackUsed).toBe(500); expect(p1.body.payableTotal).toBe(p1.body.totalPrice - 500);
    expect(Number(calls.find((c) => c.kind === 'charge')!.amount)).toBe(p1.body.totalPrice - 500);
    expect(await balance(market)).toBe(0);
    await send('post', market, '/payments/refund', { bookingId: b1.id });
    expect(await balance(market)).toBe(500);
    // 2) yetkazib, pulni chiqarish: keshbek yoziladi
    const b2 = await mkBooking();
    await send('post', market, '/payments/init', { bookingId: b2.id });
    const s = await t.prisma.shipment.findUniqueOrThrow({ where: { bookingId: b2.id } });
    for (const step of [['post', 'accept'], ['patch', 'advance'], ['patch', 'advance']] as const) await t.http()[step[0]](`/shipments/${s.id}/${step[1]}`).set('Authorization', bearer(driver));
    const rel = await send('post', market, '/payments/release', { bookingId: b2.id });
    expect(rel.status).toBe(200);
    const pay = await t.prisma.payment.findUniqueOrThrow({ where: { bookingId: b2.id } });
    expect(await balance(market)).toBe(500 + Math.floor(Number(pay.amount) * 1) / 100);
    expect(await balance(farmer)).toBe(Math.floor(Number(pay.amount) * 1) / 100);
    expect(await balance(driver)).toBe(Math.floor(Number(pay.deliveryFee) * 1) / 100);
    const tx = await t.prisma.cashbackTransaction.findMany({ where: { sourceType: 'SHIPMENT', sourceId: s.id } });
    expect(tx).toHaveLength(3);
  });
});
