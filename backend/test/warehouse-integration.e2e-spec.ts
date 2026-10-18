import { PAYMENT_PROVIDER } from '../src/payment/provider/payment-provider';
import {
  bearer, bootApp, createAdmin, registerDriver, registerFarmer, registerMarket, resetDb, TestApp,
} from './helpers';

// Ombor buyurtmalari <-> escrow to'lov <-> yuk (Shipment) <-> GPS/ELD integratsiyasi
describe('Warehouse integration: escrow + shipment + GPS (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp({ WAREHOUSE_FEE_PERCENT: '5' }); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => {
    await resetDb(t.prisma);
    await t.prisma.systemSettings.update({ where: { id: 1 }, data: { warehouseRegion: 'Samarqand', warehouseDistrict: 'Samarqand shahri', warehouseAddress: 'Sanoat ko\'chasi 1' } });
  });

  const wh = (m: 'get' | 'post' | 'patch', who: any, path: string, body?: object) => {
    const r = t.http()[m](`/warehouse${path}`).set('Authorization', bearer(who));
    return body ? r.send(body) : r;
  };
  const api = (m: 'get' | 'post' | 'patch', who: any, path: string, body?: object) => {
    const r = t.http()[m](path).set('Authorization', bearer(who));
    return body ? r.send(body) : r;
  };

  async function world(price = 4000) {
    const staff = await createAdmin(t, 'DISPATCHER');
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const driver = await registerDriver(t.http, { capacityKg: 2000 });
    await wh('post', staff, '/units/defaults');
    const units = (await wh('get', staff, '/units')).body as any[];
    const created = (await api('post', farmer, '/warehouse/items', { name: 'Pomidor', category: 'Sabzavot', declaredWeightKg: 1000, pricePerKg: price })).body;
    await wh('post', staff, `/items/${created.id}/receive`, { measuredWeightKg: 1000 });
    await wh('post', staff, `/items/${created.id}/inspect`, { accept: true, grade: 'A' });
    await wh('post', staff, `/items/${created.id}/move`, { zone: 'STORAGE', unitId: units.find((u) => u.type === 'COLD').id });
    await wh('post', staff, `/items/${created.id}/move`, { zone: 'OUTBOUND' });
    return { staff, farmer, market, driver, itemId: created.id as string };
  }
  const order = async (w: any, qty = 100, market = w.market) => {
    const r = await wh('post', market, '/orders', { itemId: w.itemId, quantityKg: qty });
    expect(r.status).toBe(201);
    return r.body as any;
  };
  const picked = async (w: any, id: string) => {
    expect((await wh('patch', w.staff, `/orders/${id}/picking`)).status).toBe(200);
    expect((await wh('patch', w.staff, `/orders/${id}/picked`)).status).toBe(200);
  };
  const shipmentOf = async (orderId: string) => t.prisma.shipment.findUniqueOrThrow({ where: { warehouseOrderId: orderId } });
  const paymentOf = async (orderId: string) => t.prisma.payment.findUniqueOrThrow({ where: { warehouseOrderId: orderId }, include: { events: { orderBy: { createdAt: 'asc' } } } });

  describe('escrow: buyurtma berilganda mablag\' muzlatiladi', () => {
    it("to'lov darhol HELD; summa serverda hisoblanadi; xizmat haqi va fermer ulushi", async () => {
      const w = await world(3333.33);
      const o = await order(w, 3);
      expect(o.payment).toMatchObject({ status: 'HELD', amount: '9999.99' }); // market xizmat haqini ko'rmaydi
      expect(o.payment).not.toHaveProperty('feeAmount');
      const pay = await paymentOf(o.id);
      expect(pay.status).toBe('HELD');
      expect(pay.heldAt).not.toBeNull();
      expect(pay.bookingId).toBeNull();
      expect(pay.events.map((e) => [e.status, e.actor])).toEqual([['HELD', 'MARKET']]);
      expect(pay.feeAmount.toString()).toBe('500'); // 5% = 499.9995 -> 500.00
      expect(pay.amount.sub(pay.feeAmount).toString()).toBe('9499.99');
    });

    it("marketga umumiy summa, fermerga sof summa va xizmat haqi, haydovchiga summa ko'rinmaydi", async () => {
      const w = await world();
      const o = await order(w, 100); // 400 000, 5% = 20 000
      const forMarket = (await wh('get', w.market, '/orders/mine')).body[0];
      expect(forMarket.payment).toMatchObject({ status: 'HELD', amount: '400000' });
      expect(forMarket.payment).not.toHaveProperty('feeAmount');
      expect(forMarket.payment).not.toHaveProperty('farmerAmount');
      const forFarmer = (await wh('get', w.farmer, '/orders/mine')).body[0];
      expect(forFarmer.payment).toMatchObject({ amount: '400000', feeAmount: '20000', farmerAmount: '380000' });
      const forStaff = (await wh('get', w.staff, '/orders')).body[0];
      expect(forStaff.payment.feeAmount).toBe('20000');
      expect(o.id).toBe(forMarket.id);
    });

    it("mavjud /payments ro'yxatida (fermer, market, admin) ombor to'lovi manbasi bilan ko'rinadi; amallar yopiq", async () => {
      const w = await world();
      const o = await order(w, 100);
      const admin = await createAdmin(t, 'ADMIN');
      for (const who of [w.market, w.farmer, admin]) {
        const list = (await api('get', who, '/payments')).body;
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({
          source: 'WAREHOUSE', warehouseOrderId: o.id, bookingId: null, status: 'HELD', amount: '400000', feeAmount: '20000', farmerAmount: '380000',
          order: { productName: 'Pomidor', quantityKg: '100' },
          actions: { canPay: false, canRelease: false, canRefund: false },
        });
      }
      const other = await registerMarket(t.http);
      expect((await api('get', other, '/payments')).body).toHaveLength(0);
      // bron-endpointlari ombor to'lovini boshqara olmaydi
      expect((await api('post', w.market, '/payments/refund', { bookingId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    });

    it("provayder xatosi: buyurtma ham, zaxira ham yaratilmaydi (atomik)", async () => {
      const w = await world();
      const provider = t.app.get(PAYMENT_PROVIDER);
      const spy = jest.spyOn(provider, 'charge').mockRejectedValueOnce(new Error('provider down'));
      const r = await wh('post', w.market, '/orders', { itemId: w.itemId, quantityKg: 100 });
      expect(r.status).toBe(502);
      expect(await t.prisma.warehouseOrder.count()).toBe(0);
      expect(await t.prisma.payment.count()).toBe(0);
      expect((await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: w.itemId } })).reservedKg.toString()).toBe('0');
      spy.mockRestore();
      expect((await wh('post', w.market, '/orders', { itemId: w.itemId, quantityKg: 100 })).status).toBe(201);
    });

    it("bekor qilish: mablag' xaridorga qaytadi (REFUNDED), zaxira qaytadi; qaytarish xatosida holat o'zgarmaydi", async () => {
      const w = await world();
      const o = await order(w, 100);
      const provider = t.app.get(PAYMENT_PROVIDER);
      const spy = jest.spyOn(provider, 'refund').mockRejectedValueOnce(new Error('down'));
      expect((await wh('patch', w.market, `/orders/${o.id}/cancel`)).status).toBe(502);
      expect((await paymentOf(o.id)).status).toBe('HELD');
      expect((await t.prisma.warehouseOrder.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PENDING');
      spy.mockRestore();

      const res = await wh('patch', w.market, `/orders/${o.id}/cancel`);
      expect(res.status).toBe(200);
      expect(res.body.payment.status).toBe('REFUNDED');
      const pay = await paymentOf(o.id);
      expect(pay.refundedAt).not.toBeNull();
      expect(pay.events.map((e) => e.status)).toEqual(['HELD', 'REFUNDED']);
      expect((await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: w.itemId } })).reservedKg.toString()).toBe('0');
      expect((await wh('patch', w.market, `/orders/${o.id}/cancel`)).status).toBe(409);
    });
  });

  describe("logistika: yig'ilgan buyurtma yukka aylanadi va haydovchi kabinetida ko'rinadi", () => {
    it("PICKED bo'lganda yuk (OPEN) yaratiladi: marshrut omborxonadan marketgacha, aloqa omborxona orqali", async () => {
      const w = await world();
      const o = await order(w, 100);
      expect(await t.prisma.shipment.count()).toBe(0); // yig'ilmaguncha yuk yo'q
      await picked(w, o.id);
      const sh = await shipmentOf(o.id);
      expect(sh).toMatchObject({
        status: 'OPEN', driverId: null, cargoName: 'Pomidor', originRegion: 'Samarqand', originAddress: "Sanoat ko'chasi 1", destRegion: 'Toshkent shahri', bookingId: null,
      });
      expect(sh.weightKg.toString()).toBe('100');
      // takroriy "picked" ikkinchi yuk yaratmaydi
      expect((await wh('patch', w.staff, `/orders/${o.id}/picked`)).status).toBe(409);
      expect(await t.prisma.shipment.count()).toBe(1);

      const avail = (await api('get', w.driver, '/shipments/available')).body;
      expect(avail).toHaveLength(1);
      expect(avail[0]).toMatchObject({ id: sh.id, source: 'WAREHOUSE', bookingId: null, warehouseOrderId: o.id, status: 'OPEN', paymentStatus: 'HELD', fitsCapacity: true });
      // fermer va market o'z yukini ko'radi: telefonlar o'rniga omborxona aloqasi
      const forMarket = (await api('get', w.market, '/shipments/mine')).body[0];
      expect(forMarket).toMatchObject({ id: sh.id, source: 'WAREHOUSE', status: 'OPEN' });
      expect(forMarket.farmer.fullName).toBe('Dispetcher');
      expect(JSON.stringify(forMarket)).not.toContain(w.farmer.phone);
      const forFarmer = (await api('get', w.farmer, '/shipments/mine')).body[0];
      expect(forFarmer.id).toBe(sh.id);
      const other = await registerMarket(t.http);
      expect((await api('get', other, '/shipments/mine')).body).toHaveLength(0);
    });

    it("haydovchi qabul qiladi (LOADING); dispetcher yuklab jo'natmaguncha yo'lga chiqolmaydi; ikkinchi haydovchi qabul qila olmaydi", async () => {
      const w = await world();
      const o = await order(w, 100);
      await picked(w, o.id);
      const sh = await shipmentOf(o.id);
      const second = await registerDriver(t.http, { capacityKg: 2000 });

      const acc = await api('post', w.driver, `/shipments/${sh.id}/accept`);
      expect(acc.status).toBe(201);
      expect(acc.body.status).toBe('LOADING');
      expect((await t.prisma.warehouseOrder.findUniqueOrThrow({ where: { id: o.id } })).driverId).not.toBeNull();
      expect((await api('post', second, `/shipments/${sh.id}/accept`)).status).toBe(409);
      expect((await api('get', second, '/shipments/available')).body).toHaveLength(0);

      const early = await api('patch', w.driver, `/shipments/${sh.id}/advance`);
      expect(early.status).toBe(409);
      expect(early.body.message).toMatch(/dispetcher/i);
      expect((await shipmentOf(o.id)).status).toBe('LOADING');
      // qaytarsa, yuk yana ochiladi va buyurtma haydovchisi tozalanadi
      expect((await api('post', w.driver, `/shipments/${sh.id}/release`)).status).toBe(201);
      expect((await t.prisma.warehouseOrder.findUniqueOrThrow({ where: { id: o.id } })).driverId).toBeNull();
      expect((await api('get', second, '/shipments/available')).body).toHaveLength(1);
    });

    it("dispetcher haydovchini biriktirishi mumkin (sig'im tekshiriladi); haydovchisiz yuklab jo'natib bo'lmaydi", async () => {
      const w = await world();
      const o = await order(w, 100);
      await picked(w, o.id);
      expect((await wh('patch', w.staff, `/orders/${o.id}/dispatch`)).status).toBe(409);
      const drv = await t.prisma.driver.findFirstOrThrow();
      const res = await wh('patch', w.staff, `/orders/${o.id}/assign`, { driverId: drv.id });
      expect(res.status).toBe(200);
      expect(res.body.shipment.status).toBe('LOADING');
      expect((await wh('patch', w.staff, `/orders/${o.id}/assign`, { driverId: drv.id })).status).toBe(409); // allaqachon biriktirilgan
      expect((await wh('patch', w.market, `/orders/${o.id}/assign`, { driverId: drv.id })).status).toBe(403);
    });

    it("yuklab jo'natish: qoldiq kamayadi, yuk YO'LDA; haydovchi GPS yuboradi; fermer va market xaritada ko'radi; ELD yoziladi", async () => {
      const w = await world();
      const o = await order(w, 100);
      await picked(w, o.id);
      const sh = await shipmentOf(o.id);
      await api('post', w.driver, `/shipments/${sh.id}/accept`);
      const out = await wh('patch', w.staff, `/orders/${o.id}/dispatch`);
      expect(out.status).toBe(200);
      expect(out.body).toMatchObject({ status: 'DISPATCHED', shipment: { status: 'IN_TRANSIT' }, driver: { plateNumber: expect.any(String) } });
      const item = await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: w.itemId } });
      expect([item.weightKg.toString(), item.reservedKg.toString()]).toEqual(['900', '0']);
      expect((await shipmentOf(o.id)).status).toBe('IN_TRANSIT');
      expect((await t.prisma.shipmentEvent.findMany({ where: { shipmentId: sh.id }, orderBy: { createdAt: 'asc' } })).map((e) => e.status)).toEqual(['OPEN', 'LOADING', 'IN_TRANSIT']);
      expect((await wh('patch', w.staff, `/orders/${o.id}/dispatch`)).status).toBe(409); // takroriy
      expect((await wh('patch', w.staff, `/orders/${o.id}/cancel`)).status).toBe(409); // yo'lda bekor qilib bo'lmaydi

      // GPS
      const now = Date.now();
      for (const [i, lat] of [39.65, 39.652, 39.654].entries()) {
        const r = await api('post', w.driver, `/shipments/${sh.id}/location`, { lat, lng: 66.96, timestamp: new Date(now - (3 - i) * 15_000).toISOString() });
        expect(r.status).toBe(200);
      }
      for (const who of [w.farmer, w.market]) {
        const loc = (await api('get', who, `/shipments/${sh.id}/location`)).body;
        expect(loc).toMatchObject({ tracking: true, status: 'IN_TRANSIT', location: { lat: 39.654 }, route: { origin: { region: 'Samarqand' }, destination: { region: 'Toshkent shahri' } } });
        expect(loc.trail).toHaveLength(3);
      }
      const otherMarket = await registerMarket(t.http);
      expect((await api('get', otherMarket, `/shipments/${sh.id}/location`)).status).toBe(404);
      const eld = (await api('get', w.driver, '/shipments/eld')).body;
      expect(eld.current).toMatchObject({ shipmentId: sh.id });
      expect(eld.days.length).toBeGreaterThan(0);
    });
  });

  describe("yetkazish va pulni chiqarish (RELEASED)", () => {
    async function inTransit(w: any, qty = 100) {
      const o = await order(w, qty);
      await picked(w, o.id);
      const sh = await shipmentOf(o.id);
      await api('post', w.driver, `/shipments/${sh.id}/accept`);
      expect((await wh('patch', w.staff, `/orders/${o.id}/dispatch`)).status).toBe(200);
      return { o, sh };
    }

    it("haydovchi yetkazadi -> buyurtma DELIVERED, pul hali escrow'da; xaridor tasdiqlagach RELEASED (fermer + omborxona)", async () => {
      const w = await world();
      const { o, sh } = await inTransit(w);
      const done = await api('patch', w.driver, `/shipments/${sh.id}/advance`);
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('DELIVERED');
      const mid = (await wh('get', w.market, '/orders/mine')).body[0];
      expect(mid).toMatchObject({ status: 'DELIVERED', awaitingConfirmation: true, payment: { status: 'HELD' } });
      expect((await paymentOf(o.id)).status).toBe('HELD');

      expect((await wh('patch', w.farmer, `/orders/${o.id}/deliver`)).status).toBe(403); // fermer o'zi tasdiqlay olmaydi
      expect((await wh('patch', w.driver, `/orders/${o.id}/deliver`)).status).toBe(403);
      const other = await registerMarket(t.http);
      expect((await wh('patch', other, `/orders/${o.id}/deliver`)).status).toBe(404);

      const res = await wh('patch', w.market, `/orders/${o.id}/deliver`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'DELIVERED', awaitingConfirmation: false, payment: { status: 'RELEASED' } });
      const pay = await paymentOf(o.id);
      expect(pay.status).toBe('RELEASED');
      expect(pay.releasedAt).not.toBeNull();
      expect(pay.events.map((e) => [e.status, e.actor])).toEqual([['HELD', 'MARKET'], ['RELEASED', 'MARKET']]);
      expect(pay.events[1].note).toMatch(/380000\.00.*20000\.00/);
      expect((await wh('patch', w.market, `/orders/${o.id}/deliver`)).status).toBe(409); // ikki marta chiqarib bo'lmaydi
      const farmerView = (await api('get', w.farmer, '/payments')).body[0];
      expect(farmerView).toMatchObject({ status: 'RELEASED', farmerAmount: '380000', feeAmount: '20000' });
    });

    it("dispetcher tasdiqlasa: yo'ldagi yuk ham yetkazildi hisoblanadi (yuk va buyurtma DELIVERED) va pul chiqadi", async () => {
      const w = await world();
      const { o, sh } = await inTransit(w);
      const res = await wh('patch', w.staff, `/orders/${o.id}/deliver`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'DELIVERED', payment: { status: 'RELEASED' }, shipment: { status: 'DELIVERED' } });
      const row = await t.prisma.shipment.findUniqueOrThrow({ where: { id: sh.id } });
      expect(row.status).toBe('DELIVERED');
      expect(row.deliveredAt).not.toBeNull();
      expect((await paymentOf(o.id)).events[1].actor).toBe('DISPATCHER');
      // haydovchi endi qayta yetkaza olmaydi
      expect((await api('patch', w.driver, `/shipments/${sh.id}/advance`)).status).toBe(409);
    });

    it("parallel tasdiqlash (xaridor + dispetcher): pul bir marta chiqadi", async () => {
      const w = await world();
      const { o } = await inTransit(w);
      const res = await Promise.all([wh('patch', w.market, `/orders/${o.id}/deliver`), wh('patch', w.staff, `/orders/${o.id}/deliver`)]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
      const pay = await paymentOf(o.id);
      expect(pay.status).toBe('RELEASED');
      expect(pay.events.filter((e) => e.status === 'RELEASED')).toHaveLength(1);
    });

    it("pul chiqarishda provayder xatosi: holat o'zgarmaydi (HELD), keyin qayta urinish ishlaydi", async () => {
      const w = await world();
      const { o } = await inTransit(w);
      const provider = t.app.get(PAYMENT_PROVIDER);
      const spy = jest.spyOn(provider, 'payout').mockRejectedValueOnce(new Error('down'));
      expect((await wh('patch', w.market, `/orders/${o.id}/deliver`)).status).toBe(502);
      expect((await paymentOf(o.id)).status).toBe('HELD');
      expect((await t.prisma.warehouseOrder.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('DISPATCHED'); // tranzaksiya qaytarildi
      expect((await shipmentOf(o.id)).status).toBe('IN_TRANSIT');
      spy.mockRestore();
      expect((await wh('patch', w.market, `/orders/${o.id}/deliver`)).status).toBe(200);
    });

    it("yig'ilgandan keyin dispetcher bekor qilsa: yuk CANCELLED (haydovchi bo'shaydi), pul qaytadi", async () => {
      const w = await world();
      const o = await order(w, 100);
      await picked(w, o.id);
      const sh = await shipmentOf(o.id);
      await api('post', w.driver, `/shipments/${sh.id}/accept`);
      const res = await wh('patch', w.staff, `/orders/${o.id}/cancel`);
      expect(res.status).toBe(200);
      expect(res.body.payment.status).toBe('REFUNDED');
      expect((await shipmentOf(o.id)).status).toBe('CANCELLED');
      expect((await api('get', w.driver, '/shipments/mine')).body[0].status).toBe('CANCELLED');
      // haydovchi yana yuk ola oladi (faol yuki yo'q)
      const o2 = await order(w, 50);
      await picked(w, o2.id);
      expect((await api('post', w.driver, `/shipments/${(await shipmentOf(o2.id)).id}/accept`)).status).toBe(201);
    });
  });

  describe('admin va ma\'lumotlar yaxlitligi', () => {
    it("admin yuklar ro'yxatida ombor yuki manbasi bilan ko'rinadi; sozlamalardagi ombor manzili marshrut boshlanishi bo'ladi", async () => {
      const w = await world();
      const admin = await createAdmin(t, 'ADMIN');
      await t.http().put('/admin/settings').set('Authorization', bearer(admin)).send({ warehouseRegion: 'Buxoro', warehouseDistrict: 'Buxoro shahri', warehouseAddress: null });
      const o = await order(w, 100);
      await picked(w, o.id);
      const list = (await t.http().get('/admin/shipments').set('Authorization', bearer(admin))).body;
      expect(list.items[0]).toMatchObject({ source: 'WAREHOUSE', farmName: 'Ali Agro', companyName: 'Korzinka Market', paymentStatus: 'HELD', amount: '400000' });
      expect((await shipmentOf(o.id)).originRegion).toBe('Buxoro');
      const bad = await t.http().put('/admin/settings').set('Authorization', bearer(admin)).send({ warehouseRegion: 'X' });
      expect(bad.status).toBe(400);
    });

    it("baza cheklovlari: yuk va to'lov manbai aynan bitta; xizmat haqi summadan oshmaydi", async () => {
      const w = await world();
      const o = await order(w, 100);
      await expect(t.prisma.$executeRaw`UPDATE "Payment" SET "bookingId" = NULL, "warehouseOrderId" = NULL WHERE "warehouseOrderId" = ${o.id}`).rejects.toThrow();
      await expect(t.prisma.$executeRaw`UPDATE "Payment" SET "feeAmount" = "amount" + 1 WHERE "warehouseOrderId" = ${o.id}`).rejects.toThrow();
      await picked(w, o.id);
      await expect(t.prisma.$executeRaw`UPDATE "Shipment" SET "warehouseOrderId" = NULL WHERE "warehouseOrderId" = ${o.id}`).rejects.toThrow();
    });
  });
});
