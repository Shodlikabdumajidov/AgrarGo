import { PAYMENT_PROVIDER } from '../src/payment/provider/payment-provider';
import { Account, approve, bearer, book, bootApp, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');
const post = { status: 'AVAILABLE', trailerType: 'DRY_VAN', capacityKg: 20000, routes: ['Samarqand ↔ Toshkent'], currentLocation: 'Samarqand sh.', loadMode: 'FTL' };

function setup(env: Record<string, string> = {}) {
  const ctx: any = { calls: [] as { kind: string; paymentId: string; amount: string }[] };
  ctx.boot = async () => {
    ctx.t = await bootApp(env);
    const prov: any = ctx.t.app.get(PAYMENT_PROVIDER);
    for (const kind of ['charge', 'payout', 'refund']) {
      const orig = prov[kind].bind(prov);
      prov[kind] = async (req: any) => { ctx.calls.push({ kind, paymentId: req.paymentId, amount: req.amount }); return orig(req); };
    }
    ctx.send = (m: 'get' | 'post' | 'patch' | 'delete', who: Account | null, path: string, body?: any) => (who ? ctx.t.http()[m](path).set('Authorization', bearer(who)) : ctx.t.http()[m](path)).send(body);
  };
  return ctx;
}

describe('Savdolashish (Make an Offer) va Incoterms (e2e)', () => {
  const c = setup();
  let t: TestApp;
  beforeAll(async () => { await c.boot(); t = c.t; });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); c.calls.length = 0; });
  const send = (...a: Parameters<typeof c.send>) => c.send(...a);

  async function world(productExtra: any = {}) {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http, { capacityKg: 30000 });
    const product = await createProduct(t.http, farmer, { name: 'Pomidor', quantityKg: 1000, pricePerKg: 1000, ...productExtra });
    return { farmer, market, driver, product };
  }

  it("market taklif beradi: validatsiyalar, takroriy ochiq taklif rad etiladi, fermer 'Kutishdagi taklif'ni ko'radi", async () => {
    const w = await world();
    const base = { productId: w.product.id, quantityKg: 100, pricePerKg: 800, message: 'Doimiy xaridor' };
    expect((await send('post', w.farmer, '/offers', base)).status).toBe(403);
    expect((await send('post', w.market, '/offers', { ...base, pricePerKg: 1200 })).status).toBe(400); // e'lon narxidan baland
    expect((await send('post', w.market, '/offers', { ...base, pricePerKg: 100 })).status).toBe(400); // 30% dan past
    expect((await send('post', w.market, '/offers', { ...base, quantityKg: 5000 })).status).toBe(409); // zaxira yetmaydi
    expect((await send('post', w.market, '/offers', { ...base, productId: 'x' })).status).toBe(400);
    const ok = await send('post', w.market, '/offers', base);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: 'PENDING', product: { name: 'Pomidor' } });
    expect([Number(ok.body.pricePerKg), Number(ok.body.quantityKg), Number(ok.body.product.pricePerKg)]).toEqual([800, 100, 1000]);
    expect((await send('post', w.market, '/offers', base)).status).toBe(409); // javob kutilayotgan taklif bor
    // taklif zaxirani band qilmaydi
    expect(Number((await t.prisma.product.findUniqueOrThrow({ where: { id: w.product.id } })).quantityKg)).toBe(1000);
    const inc = (await send('get', w.farmer, '/offers/incoming')).body;
    expect(inc).toHaveLength(1);
    expect(inc[0]).toMatchObject({ status: 'PENDING', market: { companyName: expect.any(String) } });
    expect((await send('get', w.market, '/offers/mine')).body).toHaveLength(1);
    const other = await registerFarmer(t.http);
    expect((await send('get', other, '/offers/incoming')).body).toHaveLength(0);
    expect((await send('post', other, `/offers/${ok.body.id}/accept`)).status).toBe(404); // begona fermer
  });

  it("fermer qabul qiladi: bron darhol tasdiqlanadi (kelishilgan narxda), zaxira band, to'lov va yuk yaratiladi; takror qabul 409", async () => {
    const w = await world();
    const o = (await send('post', w.market, '/offers', { productId: w.product.id, quantityKg: 200, pricePerKg: 700 })).body;
    const acc = await send('post', w.farmer, `/offers/${o.id}/accept`);
    expect(acc.status).toBe(200);
    expect(acc.body).toMatchObject({ status: 'ACCEPTED', bookingId: expect.any(String) });
    expect([Number(acc.body.agreed.pricePerKg), Number(acc.body.agreed.quantityKg)]).toEqual([700, 200]);
    const bk = await t.prisma.booking.findUniqueOrThrow({ where: { id: acc.body.bookingId }, include: { payment: true, shipment: true } });
    expect(bk).toMatchObject({ status: 'APPROVED' });
    expect(Number(bk.pricePerKg)).toBe(700);
    expect(Number(bk.payment!.amount)).toBe(140000);
    expect(bk.payment!.status).toBe('PENDING');
    expect(bk.shipment!.status).toBe('OPEN');
    expect(Number((await t.prisma.product.findUniqueOrThrow({ where: { id: w.product.id } })).quantityKg)).toBe(800);
    expect((await send('post', w.farmer, `/offers/${o.id}/accept`)).status).toBe(409);
    expect((await send('post', w.market, `/offers/${o.id}/cancel`)).status).toBe(409);
    // market to'laydi — oddiy oqim davom etadi
    expect((await pay(t.http, w.market, bk.id)).status).toBe(200);
  });

  it("fermer rad etadi; qarshi taklif (Counter): narx qoidalari, market qabul qiladi -> qarshi narxda bron; market bekor qila oladi", async () => {
    const w = await world();
    const o1 = (await send('post', w.market, '/offers', { productId: w.product.id, quantityKg: 100, pricePerKg: 600 })).body;
    expect((await send('post', w.farmer, `/offers/${o1.id}/reject`)).body.status).toBe('REJECTED');
    expect((await send('post', w.farmer, `/offers/${o1.id}/counter`, { pricePerKg: 900 })).status).toBe(409);
    // yangi taklif -> qarshi taklif
    const o2 = (await send('post', w.market, '/offers', { productId: w.product.id, quantityKg: 100, pricePerKg: 600 })).body;
    expect((await send('post', w.farmer, `/offers/${o2.id}/counter`, { pricePerKg: 500 })).status).toBe(400); // taklifdan past
    expect((await send('post', w.farmer, `/offers/${o2.id}/counter`, { pricePerKg: 1500 })).status).toBe(400); // e'lon narxidan baland
    expect((await send('post', w.market, `/offers/${o2.id}/counter`, { pricePerKg: 900 })).status).toBe(403); // market qarshi taklif yubora olmaydi
    const ct = await send('post', w.farmer, `/offers/${o2.id}/counter`, { pricePerKg: 850, quantityKg: 80, message: 'Oxirgi narx' });
    expect(ct.status).toBe(200);
    expect(ct.body).toMatchObject({ status: 'COUNTERED', counter: { message: 'Oxirgi narx' } });
    expect([Number(ct.body.counter.pricePerKg), Number(ct.body.counter.quantityKg), Number(ct.body.agreed.pricePerKg), Number(ct.body.agreed.quantityKg)]).toEqual([850, 80, 850, 80]);
    expect((await send('post', w.farmer, `/offers/${o2.id}/accept`)).status).toBe(409); // endi market javobini kutadi
    const stranger = await registerMarket(t.http);
    expect((await send('post', stranger, `/offers/${o2.id}/accept-counter`)).status).toBe(404);
    const acc = await send('post', w.market, `/offers/${o2.id}/accept-counter`);
    expect(acc.status).toBe(200);
    expect(acc.body).toMatchObject({ status: 'ACCEPTED' });
    const bk = await t.prisma.booking.findUniqueOrThrow({ where: { id: acc.body.bookingId } });
    expect([Number(bk.pricePerKg), Number(bk.quantityKg)]).toEqual([850, 80]);
    // bekor qilish
    const o3 = (await send('post', w.market, '/offers', { productId: w.product.id, quantityKg: 50, pricePerKg: 700 })).body;
    expect((await send('post', w.market, `/offers/${o3.id}/cancel`)).body.status).toBe('CANCELLED');
    expect((await send('post', w.farmer, `/offers/${o3.id}/accept`)).status).toBe(409);
  });

  it("zaxira tugab qolsa kelishilgan taklif qabul qilinmaydi va holat o'zgarmaydi (tranzaksiya qaytadi)", async () => {
    const w = await world({ quantityKg: 100 });
    const o = (await send('post', w.market, '/offers', { productId: w.product.id, quantityKg: 100, pricePerKg: 700 })).body;
    await book(t.http, await registerMarket(t.http), w.product.id, 60); // boshqa market 60 kg bron qildi
    expect((await send('post', w.farmer, `/offers/${o.id}/accept`)).status).toBe(409);
    expect((await send('get', w.farmer, '/offers/incoming')).body[0].status).toBe('PENDING');
  });

  it("Incoterms: BUYER — logistika narxga qo'shiladi; FERMER — yo'l haqi fermer oladigan summadan ushlanadi, market jami = mahsulot + xizmat haqi", async () => {
    // XARIDOR to'laydi (standart)
    const b = await world();
    expect((await send('get', b.farmer, `/products/${b.product.id}`)).body.deliveryPayer).toBe('BUYER');
    const bk1 = (await book(t.http, b.market, b.product.id, 100)).body;
    await approve(t.http, b.farmer, bk1.id);
    const p1 = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: bk1.id } });
    expect(Number(p1.amount)).toBe(100000);
    expect(p1.deliveryPayer).toBe('BUYER');
    const total1 = Number(p1.amount) + Number(p1.deliveryFee) + Number(p1.serviceFee);
    const v1 = (await send('get', b.market, '/bookings/mine')).body[0].breakdown;
    expect(v1).toMatchObject({ deliveryPayer: 'BUYER', productPrice: 100000, totalPrice: total1 });
    expect(Number(p1.deliveryFee)).toBeGreaterThan(0);

    // FERMER to'laydi
    const f = await world({ deliveryPayer: 'FARMER', pricePerKg: 2000, quantityKg: 2000 });
    expect(f.product).toBeTruthy();
    const est = await send('get', f.market, `/pricing/estimate?productId=${f.product.id}&quantityKg=500`);
    expect(est.body).toMatchObject({ deliveryPayer: 'FARMER', productPrice: 1_000_000 });
    const bk2 = (await book(t.http, f.market, f.product.id, 500)).body;
    expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: bk2.id } })).deliveryPayer).toBe('FARMER');
    await approve(t.http, f.farmer, bk2.id);
    const p2 = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: bk2.id } });
    const fee = Number(p2.deliveryFee), service = Number(p2.serviceFee);
    expect(p2.deliveryPayer).toBe('FARMER');
    expect(Number(p2.amount)).toBe(1_000_000 - fee); // fermer oladigan sof summa
    // market jami: mahsulot narxi + xizmat haqi (yo'l haqi qo'shilmaydi)
    expect(Number(p2.amount) + fee + service).toBe(1_000_000 + service);
    const mv = (await send('get', f.market, '/bookings/mine')).body.find((x: any) => x.id === bk2.id).breakdown;
    expect(mv).toMatchObject({ deliveryPayer: 'FARMER', productPrice: 1_000_000, deliveryFee: fee, totalPrice: 1_000_000 + service, farmerNet: 1_000_000 - fee });
    // to'lov va escrow taqsimoti: fermerga sof summa, haydovchiga yo'l haqi
    expect((await pay(t.http, f.market, bk2.id)).status).toBe(200);
    expect(c.calls.find((x: any) => x.kind === 'charge' && x.paymentId === p2.id)!.amount).toBe((1_000_000 + service).toFixed(2));
    const sh = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk2.id } });
    await send('post', f.driver, `/shipments/${sh.id}/accept`);
    await send('patch', f.driver, `/shipments/${sh.id}/advance`);
    await send('patch', f.driver, `/shipments/${sh.id}/advance`);
    expect((await send('post', f.market, '/payments/release', { bookingId: bk2.id })).status).toBe(200);
    const payouts = c.calls.filter((x: any) => x.kind === 'payout');
    expect(payouts.some((x: any) => Number(x.amount) === 1_000_000 - fee)).toBe(true);
    expect(payouts.some((x: any) => Number(x.amount) === fee)).toBe(true);
  });

  it("FERMER yetkazishni to'lasa va yo'l haqi mahsulot narxidan oshsa — bron tasdiqlanmaydi (409)", async () => {
    const f = await world({ deliveryPayer: 'FARMER', pricePerKg: 1, quantityKg: 10 });
    const bk = (await book(t.http, f.market, f.product.id, 1)).body;
    expect((await approve(t.http, f.farmer, bk.id)).status).toBe(409);
    expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: bk.id } })).status).toBe('PENDING');
    // noto'g'ri qiymat
    expect((await send('post', f.farmer, '/products', { name: 'X1', category: 'Sabzavot', quantityKg: 5, pricePerKg: 100, deliveryPayer: 'MARKET' })).status).toBe(400);
  });
});

describe("E'longa rasm yuklash (e2e)", () => {
  const c = setup();
  let t: TestApp;
  beforeAll(async () => { await c.boot(); t = c.t; });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  it("1-5 ta rasm: yuklash, 6-chisi rad etiladi, noto'g'ri fayl 400, begona fermer 404, o'chirish; katalogda ko'rinadi va fayl beriladi", async () => {
    const farmer = await registerFarmer(t.http), other = await registerFarmer(t.http), market = await registerMarket(t.http);
    const product = await createProduct(t.http, farmer, { name: 'Olma', quantityKg: 100, pricePerKg: 5000 });
    const up = (who: Account, buf: Buffer, name = 'a.png') => t.http().post(`/products/${product.id}/photos`).set('Authorization', bearer(who)).attach('file', buf, name);
    expect((await t.http().post(`/products/${product.id}/photos`).attach('file', PNG, 'a.png')).status).toBe(401);
    expect((await up(market, PNG)).status).toBe(403);
    expect((await up(other, PNG)).status).toBe(404);
    expect((await up(farmer, Buffer.from('MZ-not-an-image-file'), 'x.png')).status).toBe(400);
    expect((await t.http().post(`/products/${product.id}/photos`).set('Authorization', bearer(farmer))).status).toBe(400); // fayl yo'q
    let last: any;
    for (let i = 0; i < 5; i++) { last = await up(farmer, PNG); expect(last.status).toBe(201); }
    expect(last.body.photos).toHaveLength(5);
    expect(last.body.photos[0]).toMatch(/^\/uploads\/products\/[0-9a-f]+\.png$/);
    expect((await up(farmer, PNG)).status).toBe(400); // 6-chi rasm
    const cat = (await t.http().get('/marketplace')).body.items.find((x: any) => x.id === product.id);
    expect(cat.photos).toHaveLength(5);
    expect(cat.deliveryPayer).toBe('BUYER');
    expect((await t.http().get(cat.photos[0])).status).toBe(200);
    const del = await t.http().delete(`/products/${product.id}/photos/0`).set('Authorization', bearer(farmer));
    expect(del.status).toBe(200);
    expect(del.body.photos).toHaveLength(4);
    expect((await t.http().get(cat.photos[0])).status).toBe(404); // fayl ham o'chirildi
    expect((await t.http().delete(`/products/${product.id}/photos/9`).set('Authorization', bearer(farmer))).status).toBe(404);
  });
});

describe("PIN-kod tasdiqlash: yuklash (fermer) va topshirish (haydovchi) (e2e, PIN_ENFORCE=true)", () => {
  const c = setup({ PIN_ENFORCE: 'true' });
  let t: TestApp;
  beforeAll(async () => { await c.boot(); t = c.t; });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); c.calls.length = 0; });
  const send = (...a: Parameters<typeof c.send>) => c.send(...a);

  async function loading() {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http, { capacityKg: 20000 });
    const product = await createProduct(t.http, farmer, { quantityKg: 1000, pricePerKg: 1000 });
    const bk = (await book(t.http, market, product.id, 300)).body;
    await approve(t.http, farmer, bk.id);
    await pay(t.http, market, bk.id);
    const id = (await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } })).id;
    expect((await send('post', driver, `/shipments/${id}/accept`)).status).toBe(201);
    return { farmer, market, driver, bk, id };
  }
  const pinOf = async (id: string) => t.prisma.shipment.findUniqueOrThrow({ where: { id }, select: { pickupPin: true, deliveryPin: true, status: true } });
  const wrong = (pin: string) => (pin === '1234' ? '4321' : '1234');

  it("PIN-kodlar 4 xonali; haydovchi faqat yuklash PIN'ini, market faqat topshirish PIN'ini ko'radi; fermer ikkalasini ham ko'rmaydi", async () => {
    const w = await loading();
    const pins = await pinOf(w.id);
    expect(pins.pickupPin).toMatch(/^\d{4}$/);
    expect(pins.deliveryPin).toMatch(/^\d{4}$/);
    const dv = (await send('get', w.driver, '/shipments/mine')).body[0];
    expect(dv.pin).toMatchObject({ enforced: true, pickup: pins.pickupPin, delivery: null, awaiting: 'PICKUP' });
    const mv = (await send('get', w.market, '/shipments/mine')).body[0];
    expect(mv.pin).toMatchObject({ pickup: null, delivery: pins.deliveryPin });
    const fv = (await send('get', w.farmer, '/shipments/mine')).body[0];
    expect(fv.pin).toMatchObject({ pickup: null, delivery: null, awaiting: 'PICKUP' });
    expect(JSON.stringify(fv)).not.toContain(pins.pickupPin! + '"' + pins.deliveryPin);
  });

  it("PIN yoqilganda «Yo'lga chiqdim/Yetkazdim» tugmasi (advance) rad etiladi; yuklash — fermer haydovchi PIN'ini kiritganda", async () => {
    const w = await loading();
    const { pickupPin } = await pinOf(w.id);
    expect((await send('patch', w.driver, `/shipments/${w.id}/advance`)).status).toBe(409);
    expect((await send('post', w.driver, `/shipments/${w.id}/confirm-pickup`, { pin: pickupPin })).status).toBe(403); // haydovchi o'zi tasdiqlay olmaydi
    expect((await send('post', w.market, `/shipments/${w.id}/confirm-pickup`, { pin: pickupPin })).status).toBe(403);
    const other = await registerFarmer(t.http);
    expect((await send('post', other, `/shipments/${w.id}/confirm-pickup`, { pin: pickupPin })).status).toBe(404);
    expect((await send('post', w.farmer, `/shipments/${w.id}/confirm-pickup`, { pin: '12' })).status).toBe(400); // format
    expect((await send('post', w.farmer, `/shipments/${w.id}/confirm-pickup`, { pin: wrong(pickupPin!) })).status).toBe(400);
    expect((await pinOf(w.id)).status).toBe('LOADING');
    const ok = await send('post', w.farmer, `/shipments/${w.id}/confirm-pickup`, { pin: pickupPin });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('IN_TRANSIT');
    expect(ok.body.pin.awaiting).toBe('DELIVERY');
    expect((await send('post', w.farmer, `/shipments/${w.id}/confirm-pickup`, { pin: pickupPin })).status).toBe(409); // takror
  });

  it("5 marta noto'g'ri PIN — kod bloklanadi (to'g'ri kod ham o'tmaydi)", async () => {
    const w = await loading();
    const { pickupPin } = await pinOf(w.id);
    for (let i = 0; i < 5; i++) expect((await send('post', w.farmer, `/shipments/${w.id}/confirm-pickup`, { pin: wrong(pickupPin!) })).status).toBe(400);
    expect((await send('post', w.farmer, `/shipments/${w.id}/confirm-pickup`, { pin: pickupPin })).status).toBe(409);
    expect((await pinOf(w.id)).status).toBe('LOADING');
  });

  it("topshirish: haydovchi market PIN'ini kiritgandagina DELIVERED va escrow fermer + haydovchiga bo'linadi", async () => {
    const w = await loading();
    const { pickupPin, deliveryPin } = await pinOf(w.id);
    expect((await send('post', w.driver, `/shipments/${w.id}/deliver`, { pin: deliveryPin })).status).toBe(409); // hali yo'lda emas
    await send('post', w.farmer, `/shipments/${w.id}/confirm-pickup`, { pin: pickupPin });
    expect((await send('patch', w.driver, `/shipments/${w.id}/advance`)).status).toBe(409); // PIN'siz yetkazib bo'lmaydi
    expect((await send('post', w.farmer, `/shipments/${w.id}/deliver`, { pin: deliveryPin })).status).toBe(403);
    expect((await send('post', w.market, `/payments/release`, { bookingId: w.bk.id })).status).toBe(409); // yetkazilmagan: pul chiqmaydi
    expect((await send('post', w.driver, `/shipments/${w.id}/deliver`, { pin: wrong(deliveryPin!) })).status).toBe(400);
    expect((await pinOf(w.id)).status).toBe('IN_TRANSIT');
    expect(c.calls.filter((x: any) => x.kind === 'payout')).toHaveLength(0);
    const done = await send('post', w.driver, `/shipments/${w.id}/deliver`, { pin: deliveryPin });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'DELIVERED', paymentReleased: true });
    const pay0 = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: w.bk.id } });
    expect(pay0.status).toBe('RELEASED');
    const payouts = c.calls.filter((x: any) => x.kind === 'payout');
    expect(payouts.some((x: any) => Number(x.amount) === Number(pay0.amount))).toBe(true); // fermer
    expect(payouts.some((x: any) => Number(x.amount) === Number(pay0.deliveryFee))).toBe(true); // haydovchi
    // takror topshirish pulni ikki marta o'tkazmaydi
    const n = c.calls.length;
    expect((await send('post', w.driver, `/shipments/${w.id}/deliver`, { pin: deliveryPin })).status).toBe(409);
    expect(c.calls.length).toBe(n);
  });

  it("yukni qaytarib berilganda PIN'lar yangilanadi (yangi haydovchi — yangi kod)", async () => {
    const w = await loading();
    const first = await pinOf(w.id);
    expect((await send('post', w.driver, `/shipments/${w.id}/release`)).status).toBe(201);
    expect(await pinOf(w.id)).toMatchObject({ pickupPin: null, deliveryPin: null });
    const d2 = await registerDriver(t.http, { capacityKg: 20000 });
    await send('post', d2, `/shipments/${w.id}/accept`);
    const second = await pinOf(w.id);
    expect(second.pickupPin).toMatch(/^\d{4}$/);
    expect(first.pickupPin === second.pickupPin && first.deliveryPin === second.deliveryPin).toBe(false);
  });
});
