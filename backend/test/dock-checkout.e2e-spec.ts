import { PAYMENT_PROVIDER } from '../src/payment/provider/payment-provider';
import { localDate, localDayStart } from '../src/hub/dock-time';
import { bearer, bootApp, createAdmin, createProduct, registerConsumer, registerDriver, registerFarmer, resetDb, TestApp } from './helpers';

const OFF = 300;
/** Ertangi kunning mahalliy HH:00 vaqti (ISO) */
const tomorrowAt = (hh: number, days = 1) => new Date(localDayStart(localDate(new Date(Date.now() + days * 86_400_000), OFF), OFF).getTime() + hh * 3_600_000).toISOString();
const tomorrowDate = (days = 1) => localDate(new Date(Date.now() + days * 86_400_000), OFF);

describe('Rampalar (dock loading) va birlashgan savat (e2e)', () => {
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

  async function hubWith(docks = 3, extra: any = {}) {
    const admin = await createAdmin(t, 'ADMIN'), staff = await createAdmin(t, 'DISPATCHER');
    const hub = (await send('post', admin, '/hubs', { name: 'Samarqand Hub ' + Math.random().toString(36).slice(2, 7), region: 'Samarqand', district: 'Siyob', address: 'Sanoat 5', ...extra })).body;
    await send('post', admin, `/hubs/${hub.id}/staff`, { userId: staff.user.id });
    for (let i = 0; i < docks; i++) expect((await send('post', staff, `/hubs/${hub.id}/docks`, {})).status).toBe(201);
    return { admin, staff, hub };
  }
  /** Fermer + mahsulot (+ e'lon qilingan topshirish) */
  async function farmerWithIntake(hub: any, body: any = {}) {
    const farmer = await registerFarmer(t.http, { region: 'Qashqadaryo' });
    const product = await createProduct(t.http, farmer, { name: 'Kartoshka', category: 'Sabzavot', quantityKg: 1000, pricePerKg: 3000 });
    return { farmer, product, announce: (dock?: any) => send('post', farmer, '/hub/intakes', { productId: product.id, hubId: hub.id, declaredKg: 500, retailPricePerKg: 4500, minOrderKg: 10, ...(dock && { dockSlot: dock }), ...body }) };
  }
  /** Hub'da qoldiqli chakana mahsulot (xaridor savati uchun) */
  async function stocked(hub: any, staff: any, name: string, kg: number, price = 4000) {
    const farmer = await registerFarmer(t.http, { region: 'Qashqadaryo' });
    const product = await createProduct(t.http, farmer, { name, category: 'Sabzavot', quantityKg: kg + 100, pricePerKg: price - 1000 });
    const intake = (await send('post', farmer, '/hub/intakes', { productId: product.id, hubId: hub.id, declaredKg: kg, retailPricePerKg: price, minOrderKg: 10 })).body;
    expect((await send('post', staff, `/hub/intakes/${intake.id}/receive`, { receivedKg: kg })).status).toBe(201);
    return { farmer, product };
  }

  // ---------- Rampalar boshqaruvi ----------

  it("rampalar: qo'shish (avto-raqam), takror raqam, huquqlar, sozlamalar va o'chirish qoidalari", async () => {
    const { admin, staff, hub } = await hubWith(0);
    const d1 = await send('post', staff, `/hubs/${hub.id}/docks`, {}), d2 = await send('post', admin, `/hubs/${hub.id}/docks`, { name: 'Sovutgich' });
    expect(d1.body.docks.map((d: any) => d.number)).toEqual([1]);
    expect(d2.body.docks.map((d: any) => d.number)).toEqual([1, 2]);
    expect(d2.body.docks[1].name).toBe('Sovutgich');
    expect((await send('post', staff, `/hubs/${hub.id}/docks`, { number: 2 })).status).toBe(409);
    const other = await createAdmin(t, 'DISPATCHER');
    const hub2 = (await send('post', admin, '/hubs', { name: 'Buxoro Hub', region: 'Buxoro' })).body;
    await send('post', admin, `/hubs/${hub2.id}/staff`, { userId: other.user.id });
    expect((await send('post', other, `/hubs/${hub.id}/docks`, {})).status).toBe(403); // boshqa Hub xodimi
    expect((await send('post', await registerFarmer(t.http), `/hubs/${hub.id}/docks`, {})).status).toBe(403);
    // sozlamalar
    expect((await send('patch', staff, `/hubs/${hub.id}/dock-settings`, { openTime: '20:00', closeTime: '08:00' })).status).toBe(400);
    expect((await send('patch', staff, `/hubs/${hub.id}/dock-settings`, { slotMinutes: 5 })).status).toBe(400);
    const set = await send('patch', staff, `/hubs/${hub.id}/dock-settings`, { slotMinutes: 60, openTime: '08:00', closeTime: '18:00', requireDockBooking: false });
    expect(set.body.hub).toMatchObject({ slotMinutes: 60, openTime: '08:00', closeTime: '18:00' });
    // kelgusi yozuv bor rampani o'chirib/faolsizlantirib bo'lmaydi
    const f = await farmerWithIntake(hub.id ? hub : hub);
    const dockId = d2.body.docks[0].id;
    const ok = await f.announce({ startsAt: tomorrowAt(10), dockId });
    expect(ok.status).toBe(201);
    expect((await send('delete', staff, `/hubs/${hub.id}/docks/${dockId}`)).status).toBe(409);
    expect((await send('patch', staff, `/hubs/${hub.id}/docks/${dockId}`, { isActive: false })).status).toBe(409);
    expect((await send('patch', staff, `/hubs/${hub.id}/dock-settings`, { slotMinutes: 45 })).status).toBe(409); // yozuv yangi to'rga tushmaydi
    // bo'sh rampa butunlay o'chadi
    const del = await send('delete', staff, `/hubs/${hub.id}/docks/${d2.body.docks[1].id}`);
    expect(del.status).toBe(200); expect(del.body.removed).toBe(true); expect(del.body.docks).toHaveLength(1);
  });

  // ---------- Band qilish va to'qnashuvning oldini olish ----------

  it("topshirish e'lonida rampa: avto-tanlash 1,2,3, to'rtinchisi rad; yorliq; slotlar jadvali; bekor qilish bo'shatadi", async () => {
    const { staff, hub } = await hubWith(3, {});
    await send('patch', staff, `/hubs/${hub.id}/dock-settings`, { slotMinutes: 60, openTime: '06:00', closeTime: '20:00' });
    const slot = { startsAt: tomorrowAt(10) };
    const fs = [await farmerWithIntake(hub), await farmerWithIntake(hub), await farmerWithIntake(hub), await farmerWithIntake(hub)];
    const r = [];
    for (const f of fs.slice(0, 3)) { const x = await f.announce(slot); expect(x.status).toBe(201); r.push(x.body); }
    expect(r.map((x) => x.dock.dockNumber)).toEqual([1, 2, 3]);
    expect(r[1].dock).toMatchObject({ hubName: hub.name, timeSlot: '10:00-11:00', status: 'BOOKED', purpose: 'INTAKE' });
    const full = await fs[3].announce(slot);
    expect(full.status).toBe(409); expect(full.body.message).toMatch(/bo'sh rampa/);
    // e'lon ham yaratilmadi (yarim holat yo'q)
    expect(await t.prisma.hubIntake.count({ where: { farmerId: fs[3].farmer.user.farmer?.id ?? fs[3].farmer.user.id } })).toBe(0);
    expect((await send('get', fs[3].farmer, '/hub/intakes')).body).toHaveLength(0);
    // ko'rsatilgan band rampa
    const busy = await fs[3].announce({ ...slot, dockId: r[0].dock ? (await t.prisma.hubDock.findFirstOrThrow({ where: { hubId: hub.id, number: 1 } })).id : undefined });
    expect(busy.status).toBe(409); expect(busy.body.message).toMatch(/band/);
    // boshqa vaqt — bo'sh
    expect((await fs[3].announce({ startsAt: tomorrowAt(11) })).status).toBe(201);
    // slotlar jadvali
    const sl = (await send('get', fs[0].farmer, `/hubs/${hub.id}/dock-slots?date=${tomorrowDate()}`)).body;
    const ten = sl.free.find((x: any) => x.timeSlot === '10:00-11:00');
    expect(ten.freeDocks).toBe(0);
    expect(sl.free.find((x: any) => x.timeSlot === '11:00-12:00').freeDocks).toBe(2);
    expect(sl.docks).toHaveLength(3);
    expect(sl.docks[0].slots.find((s: any) => s.timeSlot === '10:00-11:00').status).toBe('mine');
    expect(sl.docks[1].slots.find((s: any) => s.timeSlot === '10:00-11:00').status).toBe('busy');
    // Hub xodimi jadvali: kim va qaysi rampa
    const sched = (await send('get', staff, `/hubs/${hub.id}/dock-schedule?date=${tomorrowDate()}`)).body;
    expect(sched.appointments.filter((a: any) => a.timeSlot === '10:00-11:00')).toHaveLength(3);
    expect(sched.appointments[0].bookedBy).toBeTruthy();
    expect((await send('get', fs[0].farmer, `/hubs/${hub.id}/dock-schedule?date=${tomorrowDate()}`)).status).toBe(403);
    // bekor qilish slotni bo'shatadi (3-rampa)
    const cancel = await send('post', fs[2].farmer, `/hub/dock-bookings/${r[2].dock.id}/cancel`, {});
    expect(cancel.status).toBe(201); expect(cancel.body.status).toBe('CANCELLED');
    expect((await send('post', fs[2].farmer, `/hub/dock-bookings/${r[2].dock.id}/cancel`, {})).status).toBe(409);
    expect((await send('post', fs[0].farmer, `/hub/dock-bookings/${r[2].dock.id}/cancel`, {})).status).toBe(404); // boshqaning yozuvi
    expect((await fs[3].announce(slot)).status).toBe(201); // bo'shagan slotga boshqa fermer yoza oladi (3-rampa)
  });

  it("to'qnashuv: bir vaqtdagi 6 ta so'rov 3 ta rampaga — aniq 3 tasi o'tadi; qoidalar (to'r, o'tgan vaqt, ikki joyda bo'lish)", async () => {
    const { staff, hub } = await hubWith(3);
    await send('patch', staff, `/hubs/${hub.id}/dock-settings`, { slotMinutes: 60, openTime: '06:00', closeTime: '20:00' });
    const slot = { startsAt: tomorrowAt(14) };
    const fs = await Promise.all(Array.from({ length: 6 }, () => farmerWithIntake(hub)));
    const res = await Promise.all(fs.map((f) => f.announce(slot)));
    expect(res.filter((x) => x.status === 201)).toHaveLength(3);
    expect(res.filter((x) => x.status === 409)).toHaveLength(3);
    const numbers = res.filter((x) => x.status === 201).map((x) => x.body.dock.dockNumber).sort();
    expect(numbers).toEqual([1, 2, 3]); // ikkita mashina bitta rampada emas
    const active = await t.prisma.dockAppointment.findMany({ where: { hubId: hub.id, slotLock: { not: null } } });
    expect(new Set(active.map((a) => a.dockId + a.startsAt.toISOString())).size).toBe(3);
    // yengil qoidalar
    const g = await farmerWithIntake(hub);
    expect((await g.announce({ startsAt: tomorrowAt(14).replace('T09:00', 'T09:30') })).status).toBe(400); // to'rga mos emas (14:00 local = 09:00Z)
    const past = new Date(Date.now() - 86_400_000); past.setUTCMinutes(0, 0, 0);
    expect((await g.announce({ startsAt: past.toISOString() })).status).toBe(400);
    expect((await g.announce({ startsAt: tomorrowAt(22) })).status).toBe(400); // yopiq soat
    expect((await g.announce({ startsAt: tomorrowAt(10, 40) })).status).toBe(400); // juda uzoq
    // bir foydalanuvchi bir vaqtda ikki joyda bo'la olmaydi
    const f2 = await farmerWithIntake(hub); const p2 = await createProduct(t.http, f2.farmer, { name: 'Sabzi', category: 'Sabzavot', quantityKg: 500, pricePerKg: 2000 });
    expect((await f2.announce({ startsAt: tomorrowAt(16) })).status).toBe(201);
    const second = await send('post', f2.farmer, '/hub/intakes', { productId: p2.id, hubId: hub.id, declaredKg: 100, retailPricePerKg: 3000, dockSlot: { startsAt: tomorrowAt(16) } });
    expect(second.status).toBe(409); expect(second.body.message).toMatch(/boshqa rampaga/);
  });

  it("vaqtni o'zgartirish, majburiy rampa, qabul qilinganda yozuv yopiladi", async () => {
    const { staff, hub } = await hubWith(2, {});
    await send('patch', staff, `/hubs/${hub.id}/dock-settings`, { slotMinutes: 60, openTime: '06:00', closeTime: '20:00', requireDockBooking: true });
    const f = await farmerWithIntake(hub);
    const no = await f.announce(); expect(no.status).toBe(409); expect(no.body.message).toMatch(/rampa va vaqt/);
    const ok = (await f.announce({ startsAt: tomorrowAt(9) })).body;
    expect(ok.dock.timeSlot).toBe('09:00-10:00');
    // boshqa slotga o'tkazish: eski bo'shaydi, yangisi band
    const moved = await send('post', f.farmer, '/hub/dock-bookings', { hubId: hub.id, purpose: 'INTAKE', intakeId: ok.id, startsAt: tomorrowAt(13) });
    expect(moved.status).toBe(201); expect(moved.body.timeSlot).toBe('13:00-14:00');
    const rows = await t.prisma.dockAppointment.findMany({ where: { hubId: hub.id } });
    expect(rows.filter((a) => a.slotLock).length).toBe(1);
    expect(rows.find((a) => a.status === 'CANCELLED')!.cancelReason).toMatch(/o'zgartirildi/);
    expect((await send('get', f.farmer, '/hub/intakes')).body[0].dock.timeSlot).toBe('13:00-14:00');
    // Hub qabul qiladi -> yozuv DONE, slot bo'sh
    expect((await send('post', staff, `/hub/dock-bookings/${moved.body.id}/arrive`, {})).body.status).toBe('ARRIVED');
    expect((await send('post', staff, `/hub/intakes/${ok.id}/receive`, { receivedKg: 480 })).status).toBe(201);
    const done = await t.prisma.dockAppointment.findUniqueOrThrow({ where: { id: moved.body.id } });
    expect(done.status).toBe('DONE'); expect(done.slotLock).toBeNull();
    // kelmadi
    const f2 = await farmerWithIntake(hub); const a2 = (await f2.announce({ startsAt: tomorrowAt(15) })).body;
    expect((await send('post', staff, `/hub/dock-bookings/${a2.dock.id}/no-show`, {})).body.status).toBe('NO_SHOW');
    expect((await send('post', f2.farmer, `/hub/dock-bookings/${a2.dock.id}/no-show`, {})).status).toBe(403);
  });

  it("kuryer: majburiy rampa bo'lmasa yuk olmaydi; yozuv vaqti kelgach oladi, buyurtmada yorliq ko'rinadi", async () => {
    const { staff, hub } = await hubWith(2);
    const { product } = await stocked(hub, staff, 'Kartoshka', 300);
    // sutka davomida ochiq jadval: joriy soat doim slotga tushadi
    expect((await send('patch', staff, `/hubs/${hub.id}/dock-settings`, { slotMinutes: 60, openTime: '00:00', closeTime: '24:00', requireDockBooking: true })).status).toBe(200);
    const consumer = await registerConsumer(t.http);
    const o = (await send('post', consumer, '/local/orders', { productId: product.id, quantityKg: 10, district: 'Siyob', address: "Registon ko'chasi 10, 5-uy" })).body;
    await send('post', staff, `/local/orders/${o.id}/pack-start`, {}); await send('post', staff, `/local/orders/${o.id}/packed`, {});
    const courier = await registerDriver(t.http, { region: 'Samarqand' });
    expect((await send('patch', courier, '/local/courier/mode', { enabled: true, hubId: hub.id })).status).toBe(200);
    const me = (await send('get', courier, '/local/courier/me')).body;
    expect(me.requireDock).toBe(true); expect(me.dockCount).toBe(2);
    const noAppt = await send('post', courier, `/local/orders/${o.id}/accept`, {});
    expect(noAppt.status).toBe(409); expect(noAppt.body.message).toMatch(/rampa va vaqtni band/);
    // ertangi yozuv: vaqti hali kelmagan
    const future = await send('post', courier, '/hub/dock-bookings', { hubId: hub.id, purpose: 'PICKUP', startsAt: tomorrowAt(12) });
    expect(future.status).toBe(201);
    expect((await send('post', courier, `/local/orders/${o.id}/accept`, { appointmentId: future.body.id })).status).toBe(409);
    // joriy slot (hozirgi soat)
    const nowSlot = new Date(); nowSlot.setUTCMinutes(0, 0, 0);
    const cur = await send('post', courier, '/hub/dock-bookings', { hubId: hub.id, purpose: 'PICKUP', startsAt: nowSlot.toISOString() });
    expect(cur.status).toBe(201); expect(cur.body.dockNumber).toBeGreaterThan(0);
    // fermer PICKUP band qila olmaydi; boshqa Hub kuryeri ham
    expect((await send('post', await registerFarmer(t.http), '/hub/dock-bookings', { hubId: hub.id, purpose: 'PICKUP', startsAt: tomorrowAt(13) })).status).toBe(403);
    const acc = await send('post', courier, `/local/orders/${o.id}/accept`, {});
    expect(acc.status).toBe(201);
    expect(acc.body.dock).toMatchObject({ hubName: hub.name, dockNumber: cur.body.dockNumber, purpose: 'PICKUP', status: 'ARRIVED' });
    expect(acc.body.dock.timeSlot).toMatch(/^\d{2}:00-\d{2}:00$|^23:00-00:00$/);
    expect((await send('get', staff, `/local/hub/orders`)).body[0].dock.dockNumber).toBe(cur.body.dockNumber);
    expect((await send('get', courier, '/hub/dock-bookings/mine')).body.length).toBe(2);
    expect((await send('get', consumer, `/local/orders/${o.id}`)).body.dock).toBeUndefined(); // xaridorga rampa ko'rinmaydi
  });

  // ---------- Birlashgan savat ----------

  async function cartWorld() {
    const { staff, admin, hub } = await hubWith(0);
    const hub2 = (await send('post', admin, '/hubs', { name: 'Samarqand Hub 2 ' + Math.random().toString(36).slice(2, 6), region: 'Samarqand' })).body;
    const staff2 = await createAdmin(t, 'DISPATCHER'); await send('post', admin, `/hubs/${hub2.id}/staff`, { userId: staff2.user.id });
    const a = await stocked(hub, staff, 'Sabzi', 100, 3000), b = await stocked(hub2, staff2, 'Pomidor', 60, 6000);
    const consumer = await registerConsumer(t.http);
    const addr = { district: 'Siyob', address: "Registon ko'chasi 10, 5-uy" };
    return { staff, staff2, hub, hub2, a, b, consumer, addr };
  }

  it("savat: 2 ta Hub/fermer — BITTA to'lov (charge), 2 ta alohida buyurtma, har biri o'z escrow'i va taqsimoti", async () => {
    const w = await cartWorld();
    const items = [{ productId: w.a.product.id, quantityKg: 10 }, { productId: w.b.product.id, quantityKg: 20 }];
    const q = (await send('post', null, '/local/cart/quote', { items })).body;
    expect(q.okCount).toBe(2); expect(q.hubCount).toBe(2);
    calls = [];
    const r = await send('post', w.consumer, '/local/orders/checkout-bulk', { items, ...w.addr, idempotencyKey: 'k-12345678' });
    expect(r.status).toBe(201);
    expect(r.body.itemCount).toBe(2); expect(r.body.totalPrice).toBe(q.totalPrice);
    expect(r.body.orders).toHaveLength(2);
    expect(new Set(r.body.orders.map((o: any) => o.hub.id)).size).toBe(2);
    expect(r.body.orders.every((o: any) => o.checkoutId === r.body.checkoutId && /^\d{4}$/.test(o.deliveryCode))).toBe(true);
    expect(new Set(r.body.orders.map((o: any) => o.deliveryCode)).size).toBeGreaterThan(0);
    // bitta charge, jami summaga teng
    const charges = calls.filter((c) => c.kind === 'charge');
    expect(charges).toHaveLength(1);
    expect(charges[0].paymentId).toBe(r.body.checkoutId);
    expect(Number(charges[0].amount)).toBe(r.body.totalPrice);
    // buyurtmalar yig'indisi chekka teng; har birining escrow'i HELD va ulushlar yig'indisi = buyurtma jami
    expect(r.body.orders.reduce((s: number, o: any) => s + o.totalPrice, 0)).toBe(r.body.totalPrice);
    for (const o of r.body.orders) {
      expect(o.paymentStatus).toBe('HELD');
      expect(o.splits.reduce((s: number, x: any) => s + x.amount, 0)).toBeCloseTo(o.totalPrice, 2);
    }
    // ombor zaxirasi ikkala Hub'da
    const st = await t.prisma.hubStock.findMany({ where: { productId: { in: [w.a.product.id, w.b.product.id] } } });
    expect(st.map((s) => Number(s.reservedKg)).sort()).toEqual([10, 20]);
    // idempotent takror: yangi to'lov va buyurtma yo'q
    const again = await send('post', w.consumer, '/local/orders/checkout-bulk', { items, ...w.addr, idempotencyKey: 'k-12345678' });
    expect(again.status).toBe(201); expect(again.body.checkoutId).toBe(r.body.checkoutId);
    expect(calls.filter((c) => c.kind === 'charge')).toHaveLength(1);
    expect(await t.prisma.localOrder.count()).toBe(2);
    expect((await send('get', w.consumer, `/local/checkouts/${r.body.checkoutId}`)).body.orders).toHaveLength(2);
    // har bir buyurtma o'z yo'li bilan: biri yetkaziladi (faqat uning ulushlari to'lanadi), ikkinchisi bekor (faqat uning jami qaytadi)
    const [o1, o2] = r.body.orders;
    const courier = await registerDriver(t.http, { region: 'Samarqand' });
    const staffOf = (o: any) => (o.hub.id === w.hub.id ? w.staff : w.staff2);
    await send('post', staffOf(o1), `/local/orders/${o1.id}/pack-start`, {}); await send('post', staffOf(o1), `/local/orders/${o1.id}/packed`, {});
    await send('patch', courier, '/local/courier/mode', { enabled: true, hubId: o1.hub.id });
    expect((await send('post', courier, `/local/orders/${o1.id}/accept`, {})).status).toBe(201);
    calls = [];
    expect((await send('post', courier, `/local/orders/${o1.id}/deliver`, { code: o1.deliveryCode })).body.status).toBe('COMPLETED');
    expect(calls.filter((c) => c.kind === 'payout').length).toBeGreaterThanOrEqual(3);
    expect(calls.filter((c) => c.kind === 'refund')).toHaveLength(0);
    calls = [];
    const c2 = await send('post', w.consumer, `/local/orders/${o2.id}/cancel`, {});
    expect(c2.body.status).toBe('CANCELLED');
    const refunds = calls.filter((c) => c.kind === 'refund');
    expect(refunds).toHaveLength(1); expect(Number(refunds[0].amount)).toBe(o2.totalPrice);
    const pays = await t.prisma.payment.findMany({ where: { localOrder: { checkoutId: r.body.checkoutId } }, orderBy: { createdAt: 'asc' } });
    expect(pays.map((p) => p.status).sort()).toEqual(['REFUNDED', 'RELEASED']);
  });

  it("savat: biror qator o'tmasa HECH NARSA yozilmaydi (to'lov ham, zaxira ham); xato qaysi mahsulotga tegishliligi bilan; bir xil mahsulot birlashadi", async () => {
    const w = await cartWorld();
    calls = [];
    const bad = await send('post', w.consumer, '/local/orders/checkout-bulk', { items: [{ productId: w.a.product.id, quantityKg: 10 }, { productId: w.b.product.id, quantityKg: 61 }], ...w.addr });
    expect(bad.status).toBe(409); expect(bad.body.productId).toBe(w.b.product.id); expect(bad.body.message).toMatch(/Pomidor/);
    expect(await t.prisma.localOrder.count()).toBe(0);
    expect(await t.prisma.localCheckout.count()).toBe(0);
    expect(await t.prisma.payment.count()).toBe(0);
    expect(calls.filter((c) => c.kind === 'charge')).toHaveLength(0);
    expect((await t.prisma.hubStock.findMany()).every((s) => Number(s.reservedKg) === 0)).toBe(true);
    // minimumdan kam
    const min = await send('post', w.consumer, '/local/orders/checkout-bulk', { items: [{ productId: w.a.product.id, quantityKg: 5 }], ...w.addr });
    expect(min.status).toBe(400); expect(min.body.productId).toBe(w.a.product.id);
    // savat narxi: muammoli qator belgilanadi, qolganlari hisoblanadi
    const q = (await send('post', null, '/local/cart/quote', { items: [{ productId: w.a.product.id, quantityKg: 10 }, { productId: w.b.product.id, quantityKg: 999 }] })).body;
    expect(q.okCount).toBe(1); expect(q.lines.find((l: any) => !l.ok).error).toBeTruthy();
    // takroriy qatorlar birlashadi: 10 + 15 = 25 kg bitta buyurtma
    const ok = await send('post', w.consumer, '/local/orders/checkout-bulk', { items: [{ productId: w.a.product.id, quantityKg: 10 }, { productId: w.a.product.id, quantityKg: 15 }], ...w.addr });
    expect(ok.status).toBe(201); expect(ok.body.orders).toHaveLength(1); expect(ok.body.orders[0].quantityKg).toBe(25);
    // boshqa viloyat manzili, rol, bo'sh/ko'p qatorlar
    expect((await send('post', w.consumer, '/local/orders/checkout-bulk', { items: [{ productId: w.b.product.id, quantityKg: 10 }], ...w.addr, region: 'Buxoro' })).status).toBe(400);
    expect((await send('post', w.a.farmer, '/local/orders/checkout-bulk', { items: [{ productId: w.b.product.id, quantityKg: 10 }], ...w.addr })).status).toBe(403);
    expect((await send('post', w.consumer, '/local/orders/checkout-bulk', { items: [], ...w.addr })).status).toBe(400);
    expect((await send('post', w.consumer, '/local/orders/checkout-bulk', { items: Array.from({ length: 21 }, () => ({ productId: w.b.product.id, quantityKg: 10 })), ...w.addr })).status).toBe(400);
  });

  it("savat: oxirgi qoldiqqa ikki xaridor bir vaqtda — bittasi o'tadi, oversell yo'q va boshqasining to'lovi yechilmaydi", async () => {
    const w = await cartWorld();
    const c2 = await registerConsumer(t.http);
    calls = [];
    const body = { items: [{ productId: w.b.product.id, quantityKg: 40 }, { productId: w.a.product.id, quantityKg: 10 }], ...w.addr };
    const [r1, r2] = await Promise.all([send('post', w.consumer, '/local/orders/checkout-bulk', body), send('post', c2, '/local/orders/checkout-bulk', body)]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(calls.filter((c) => c.kind === 'charge')).toHaveLength(1);
    const st = await t.prisma.hubStock.findFirstOrThrow({ where: { productId: w.b.product.id } });
    expect(Number(st.reservedKg)).toBe(40); expect(Number(st.weightKg)).toBe(60);
    expect(await t.prisma.localOrder.count()).toBe(2);
  });

  // ---------- Bir kuryer — bir nechta mahsulot ----------

  it("bir Hub'dan 2 xil mahsulot: bitta yetkazish haqi (teng bo'lingan), umumiy kod, kuryer ikkalasini birga oladi va bitta kod bilan topshiradi", async () => {
    const w = await cartWorld();
    const c2 = await stocked(w.hub, w.staff, 'Piyoz', 80, 2500); // a bilan bir Hub
    const items = [{ productId: w.a.product.id, quantityKg: 10 }, { productId: c2.product.id, quantityKg: 20 }];
    const q = (await send('post', null, '/local/cart/quote', { items })).body;
    expect(q.hubCount).toBe(1); expect(q.lines.every((l: any) => l.sharedCourier)).toBe(true);
    expect(q.lines.reduce((s: number, l: any) => s + l.courierFee, 0)).toBe(12000); // bitta yetkazish haqi (LOCAL_COURIER_FEE)
    const r = await send('post', w.consumer, '/local/orders/checkout-bulk', { items, ...w.addr });
    expect(r.status).toBe(201); expect(r.body.totalPrice).toBe(q.totalPrice); expect(r.body.courierFee).toBe(12000);
    const [o1, o2] = r.body.orders;
    expect(o1.deliveryGroupId).toBeTruthy(); expect(o1.deliveryGroupId).toBe(o2.deliveryGroupId);
    expect(o1.deliveryCode).toBe(o2.deliveryCode);
    expect(o1.courierFee + o2.courierFee).toBe(12000);
    for (const o of r.body.orders) expect(o.splits.reduce((s: number, x: any) => s + x.amount, 0)).toBeCloseTo(o.totalPrice, 2);
    const courier = await registerDriver(t.http, { region: 'Samarqand' });
    await send('patch', courier, '/local/courier/mode', { enabled: true, hubId: w.hub.id });
    // faqat biri tayyor: kuryerga ko'rinmaydi va olib bo'lmaydi
    await send('post', w.staff, `/local/orders/${o1.id}/pack-start`, {}); await send('post', w.staff, `/local/orders/${o1.id}/packed`, {});
    expect((await send('get', courier, '/local/courier/available')).body).toHaveLength(0);
    const early = await send('post', courier, `/local/orders/${o1.id}/accept`, {});
    expect(early.status).toBe(409); expect(early.body.message).toMatch(/tayyor/);
    await send('post', w.staff, `/local/orders/${o2.id}/pack-start`, {}); await send('post', w.staff, `/local/orders/${o2.id}/packed`, {});
    const av = (await send('get', courier, '/local/courier/available')).body;
    expect(av).toHaveLength(1); expect(av[0].items).toHaveLength(2); expect(av[0].courierFee).toBe(12000);
    // bitta buyurtmani olish ikkalasini oladi
    const acc = await send('post', courier, `/local/orders/${o2.id}/accept`, {});
    expect(acc.status).toBe(201);
    const mine = (await send('get', courier, '/local/courier/mine')).body;
    expect(mine.map((o: any) => o.status)).toEqual(['DELIVERING', 'DELIVERING']);
    const st = await t.prisma.hubStock.findMany({ where: { productId: { in: [w.a.product.id, c2.product.id] } } });
    expect(st.every((x) => Number(x.reservedKg) === 0)).toBe(true); // ikkalasi ombordan chiqdi
    // noto'g'ri kod urinishlari guruhga umumiy; to'g'ri kod ikkalasini yakunlaydi
    expect((await send('post', courier, `/local/orders/${o1.id}/deliver`, { code: '0000' === o1.deliveryCode ? '1111' : '0000' })).status).toBe(400);
    expect((await t.prisma.localOrder.findMany({ select: { codeAttempts: true } })).every((x) => x.codeAttempts === 1)).toBe(true);
    calls = [];
    const done = await send('post', courier, `/local/orders/${o1.id}/deliver`, { code: o1.deliveryCode });
    expect(done.body.status).toBe('COMPLETED');
    expect((await t.prisma.localOrder.findMany()).every((x) => x.status === 'COMPLETED')).toBe(true);
    const courierPayouts = calls.filter((c) => c.kind === 'payout' && c.paymentId.endsWith(':courier'));
    expect(courierPayouts.reduce((s, c) => s + Number(c.amount), 0)).toBe(12000);
  });

  it("guruh: bittasi bekor bo'lsa faqat o'z ulushi qaytadi; 3 tadan ortiq mahsulotli guruh bitta yetkazish hisoblanadi", async () => {
    const w = await cartWorld();
    const extra = [await stocked(w.hub, w.staff, 'Piyoz', 80, 2500), await stocked(w.hub, w.staff, 'Sabzi2', 80, 2500), await stocked(w.hub, w.staff, 'Rediska', 80, 2500)];
    const items = [w.a, ...extra].map((x) => ({ productId: x.product.id, quantityKg: 10 }));
    const r = await send('post', w.consumer, '/local/orders/checkout-bulk', { items, ...w.addr });
    expect(r.status).toBe(201); expect(r.body.orders).toHaveLength(4); expect(r.body.courierFee).toBe(12000);
    const orders = r.body.orders;
    // bittasini bekor qilish: aynan o'z jami qaytadi
    calls = [];
    const victim = orders[3];
    expect((await send('post', w.consumer, `/local/orders/${victim.id}/cancel`, {})).body.status).toBe('CANCELLED');
    const rf = calls.filter((c) => c.kind === 'refund'); expect(rf).toHaveLength(1); expect(Number(rf[0].amount)).toBe(victim.totalPrice);
    for (const o of orders.slice(0, 3)) { await send('post', w.staff, `/local/orders/${o.id}/pack-start`, {}); await send('post', w.staff, `/local/orders/${o.id}/packed`, {}); }
    const courier = await registerDriver(t.http, { region: 'Samarqand' });
    await send('patch', courier, '/local/courier/mode', { enabled: true, hubId: w.hub.id });
    const av = (await send('get', courier, '/local/courier/available')).body;
    expect(av).toHaveLength(1); expect(av[0].items).toHaveLength(3); // bekor qilingani guruhdan chiqadi
    expect((await send('post', courier, `/local/orders/${orders[0].id}/accept`, {})).status).toBe(201);
    // xaridor tasdiqlasa ham hamma yo'ldagi birga yakunlanadi
    expect((await send('post', w.consumer, `/local/orders/${orders[1].id}/confirm`, {})).body.status).toBe('COMPLETED');
    expect((await t.prisma.localOrder.findMany({ where: { status: 'COMPLETED' } })).length).toBe(3);
  });
});
