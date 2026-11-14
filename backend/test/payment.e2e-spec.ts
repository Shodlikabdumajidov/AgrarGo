import { NestExpressApplication } from '@nestjs/platform-express';
import {
  Account, approve, bearer, book, bootApp, createAdmin, createProduct, pay, registerDriver, registerFarmer, registerMarket,
  resetDb, TestApp,
} from './helpers';
import { SimulatedPaymentProvider } from '../src/payment/provider/payment-provider';

describe('Payment / Escrow (e2e)', () => {
  let t: TestApp;
  let admin: Account;
  beforeAll(async () => { t = await bootApp({ PAYMENT_RELEASE_GRACE_HOURS: '72' }); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => {
    await resetDb(t.prisma);
    admin = await createAdmin(t);
  });

  /** Fermer, market, mahsulot (500 kg x 4500) va tasdiqlangan bron: to'lov PENDING */
  async function setup(quantityKg = 100) {
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const product = await createProduct(t.http, farmer, { quantityKg: 500, pricePerKg: 4500 });
    const booking = (await book(t.http, market, product.id, quantityKg)).body;
    await approve(t.http, farmer, booking.id);
    return { farmer, market, product, booking };
  }

  const post = (path: string, who: Account, body: object) => t.http().post(path).set('Authorization', bearer(who)).send(body);
  const release = (who: Account, bookingId: string) => post('/payments/release', who, { bookingId });
  const refund = (who: Account, bookingId: string, reason?: string) => post('/payments/refund', who, { bookingId, reason });
  const paymentOf = (bookingId: string) => t.prisma.payment.findUniqueOrThrow({ where: { bookingId }, include: { events: { orderBy: { createdAt: 'asc' } } } });
  const shipmentOf = (bookingId: string) => t.prisma.shipment.findUniqueOrThrow({ where: { bookingId } });
  const productOf = (id: string) => t.prisma.product.findUniqueOrThrow({ where: { id } });
  const avail = (driver: Account) => t.http().get('/shipments/available').set('Authorization', bearer(driver));
  const driverAct = (m: 'post' | 'patch', driver: Account, shipmentId: string, what: string) =>
    t.http()[m](`/shipments/${shipmentId}/${what}`).set('Authorization', bearer(driver));

  /** Yukni haydovchi bilan oxirigacha yetkazadi */
  async function deliver(driver: Account, bookingId: string) {
    const s = await shipmentOf(bookingId);
    await driverAct('post', driver, s.id, 'accept');
    await driverAct('patch', driver, s.id, 'advance');
    return driverAct('patch', driver, s.id, 'advance');
  }

  describe("to'lov yaratilishi", () => {
    it("bron tasdiqlanganda PENDING to'lov yaratiladi; summa serverda hisoblanadi", async () => {
      const { booking } = await setup(150.5);
      const p = await paymentOf(booking.id);
      expect(p).toMatchObject({ status: 'PENDING', currency: 'UZS', provider: 'simulated', providerRef: null });
      expect(p.amount.toFixed(2)).toBe('677250.00');
      expect(p.events.map((e) => e.status)).toEqual(['PENDING']);
    });

    it("tasdiqlanmagan, rad etilgan yoki bekor qilingan bron uchun to'lov yaratilmaydi", async () => {
      const farmer = await registerFarmer(t.http);
      const market = await registerMarket(t.http);
      const product = await createProduct(t.http, farmer);
      const pending = (await book(t.http, market, product.id, 10)).body;
      const rejected = (await book(t.http, market, product.id, 10)).body;
      await t.http().patch(`/bookings/${rejected.id}/reject`).set('Authorization', bearer(farmer));
      expect(await t.prisma.payment.count()).toBe(0);
      expect((await pay(t.http, market, pending.id)).status).toBe(404);
    });

    it("takroriy tasdiq ikkinchi to'lov yaratmaydi; bron ro'yxatlarida to'lov holati ko'rinadi", async () => {
      const { farmer, market, booking } = await setup();
      await approve(t.http, farmer, booking.id);
      expect(await t.prisma.payment.count()).toBe(1);
      const mine = await t.http().get('/bookings/mine').set('Authorization', bearer(market));
      expect(mine.body[0].payment).toMatchObject({ status: 'PENDING', amount: '450000', currency: 'UZS' });
      const incoming = await t.http().get('/bookings/incoming').set('Authorization', bearer(farmer));
      expect(incoming.body[0].payment.status).toBe('PENDING');
    });

    it("bron narxi keyin o'zgarsa ham to'lov summasi qotirilgan narxda qoladi", async () => {
      const { farmer, product, booking } = await setup(100);
      await t.http().put(`/products/${product.id}`).set('Authorization', bearer(farmer)).send({ pricePerKg: 99999 });
      expect((await paymentOf(booking.id)).amount.toFixed(2)).toBe('450000.00');
    });
  });

  describe('POST /payments/init', () => {
    it("xaridor to'laydi: HELD, provayder ma'lumotlari va tarix yoziladi; mijoz summani o'zgartira olmaydi", async () => {
      const { market, booking } = await setup();
      const res = await post('/payments/init', market, { bookingId: booking.id, amount: 1, status: 'RELEASED' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'HELD', amount: '450000', currency: 'UZS',
        actions: { canPay: false, canRelease: false, canRefund: true, refundEffect: 'CANCEL_ORDER' },
        order: { productName: 'Pomidor', quantityKg: '100' },
      });
      expect(res.body.heldAt).toEqual(expect.any(String));
      expect(res.body.events.map((e: any) => e.status)).toEqual(['PENDING', 'HELD']);
      const p = await paymentOf(booking.id);
      expect(p.providerRef).toMatch(/^SIM-CHG-/);
      expect(p.amount.toFixed(2)).toBe('450000.00');
    });

    it("takroriy init xavfsiz (idempotent): ikkinchi marta yechilmaydi", async () => {
      const { market, booking } = await setup();
      const first = await pay(t.http, market, booking.id);
      const again = await pay(t.http, market, booking.id);
      expect(again.status).toBe(200);
      expect(again.body.status).toBe('HELD');
      expect((await paymentOf(booking.id)).events.filter((e) => e.status === 'HELD')).toHaveLength(1);
      expect(again.body.heldAt).toBe(first.body.heldAt);
    });

    it("bir vaqtda 5 ta so'rov: provayder faqat bir marta chaqiriladi", async () => {
      const { market, booking } = await setup();
      const spy = jest.spyOn(SimulatedPaymentProvider.prototype, 'charge');
      try {
        const results = await Promise.all(Array.from({ length: 5 }, () => pay(t.http, market, booking.id)));
        expect(results.every((r) => r.status === 200)).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });

    it("faqat o'zining bronini to'lay oladi; fermer, haydovchi, begona market va tokensiz rad etiladi", async () => {
      const { farmer, booking } = await setup();
      const driver = await registerDriver(t.http);
      const stranger = await registerMarket(t.http, { companyName: 'Makro' });
      expect((await pay(t.http, farmer, booking.id)).status).toBe(403);
      expect((await pay(t.http, driver, booking.id)).status).toBe(403);
      expect((await pay(t.http, admin, booking.id)).status).toBe(403);
      expect((await pay(t.http, stranger, booking.id)).status).toBe(404);
      expect((await t.http().post('/payments/init').send({ bookingId: booking.id })).status).toBe(401);
      expect((await post('/payments/init', stranger, { bookingId: 'not-a-uuid' })).status).toBe(400);
      expect((await paymentOf(booking.id)).status).toBe('PENDING');
    });

    it("yopilgan to'lovni (RELEASED/REFUNDED/CANCELLED) qayta to'lab bo'lmaydi", async () => {
      const { market, booking } = await setup();
      await refund(market, booking.id); // PENDING -> CANCELLED
      const res = await pay(t.http, market, booking.id);
      expect(res.status).toBe(409);
    });

    it("provayder xatosi: 502, to'lov PENDING qoladi va tarixga hech narsa yozilmaydi", async () => {
      const { market, booking } = await setup();
      const spy = jest.spyOn(SimulatedPaymentProvider.prototype, 'charge').mockRejectedValue(new Error('gateway down'));
      try {
        const res = await pay(t.http, market, booking.id);
        expect(res.status).toBe(502);
        expect(JSON.stringify(res.body)).not.toMatch(/gateway down/); // ichki xato oshkor qilinmaydi
      } finally {
        spy.mockRestore();
      }
      const p = await paymentOf(booking.id);
      expect(p).toMatchObject({ status: 'PENDING', heldAt: null, providerRef: null });
      expect(p.events).toHaveLength(1);
      expect((await pay(t.http, market, booking.id)).status).toBe(200); // keyin qayta urinish ishlaydi
    });
  });

  describe('POST /payments/release', () => {
    it("yuk yetkazilmaguncha xaridor va fermer chiqara olmaydi, to'lanmagan to'lov ham chiqmaydi", async () => {
      const { farmer, market, booking } = await setup();
      expect((await release(market, booking.id)).status).toBe(409); // PENDING
      await pay(t.http, market, booking.id);
      const early = await release(market, booking.id);
      expect(early.status).toBe(409);
      expect(early.body.message).toMatch(/yetkazib berilgandan keyin/);
      expect((await release(farmer, booking.id)).status).toBe(409);
      expect((await paymentOf(booking.id)).status).toBe('HELD');
    });

    it("yetkazilgach xaridor tasdiqlaydi: RELEASED, fermerga o'tkaziladi, tarix to'liq", async () => {
      const { market, booking } = await setup();
      const driver = await registerDriver(t.http);
      await pay(t.http, market, booking.id);
      expect((await deliver(driver, booking.id)).body.status).toBe('DELIVERED');

      const res = await release(market, booking.id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'RELEASED', actions: { canRelease: false, canRefund: false } });
      expect(res.body.events.map((e: any) => `${e.status}:${e.actor}`)).toEqual(['PENDING:SYSTEM', 'HELD:MARKET', 'RELEASED:MARKET']);
      expect((await paymentOf(booking.id)).releasedAt).not.toBeNull();
      expect((await release(market, booking.id)).status).toBe(409); // ikki marta chiqmaydi
    });

    it("fermer faqat himoya muddati (72 soat) o'tgach oladi", async () => {
      const { farmer, market, booking } = await setup();
      const driver = await registerDriver(t.http);
      await pay(t.http, market, booking.id);
      await deliver(driver, booking.id);

      const early = await release(farmer, booking.id);
      expect(early.status).toBe(409);
      expect(early.body.message).toMatch(/72 soat kutiladi/);
      const view = (await t.http().get('/payments').set('Authorization', bearer(farmer))).body[0];
      expect(view.actions).toMatchObject({ canRelease: false, releaseBlockedReason: expect.stringMatching(/72 soat/) });

      await t.prisma.shipment.update({ where: { bookingId: booking.id }, data: { deliveredAt: new Date(Date.now() - 73 * 3_600_000) } });
      const ok = await release(farmer, booking.id);
      expect(ok.status).toBe(200);
      expect(ok.body.status).toBe('RELEASED');
      expect(ok.body.events.at(-1)).toMatchObject({ status: 'RELEASED', actor: 'FARMER' });
    });

    it("administrator istalgan vaqtda chiqara oladi (nizo)", async () => {
      const { market, booking } = await setup();
      await pay(t.http, market, booking.id);
      const res = await release(admin, booking.id);
      expect(res.status).toBe(200);
      expect(res.body.events.at(-1)).toMatchObject({ status: 'RELEASED', actor: 'ADMIN' });
    });

    it("begona foydalanuvchilar va haydovchi chiqara olmaydi", async () => {
      const { market, booking } = await setup();
      const driver = await registerDriver(t.http);
      const otherFarmer = await registerFarmer(t.http);
      const otherMarket = await registerMarket(t.http, { companyName: 'Makro' });
      await pay(t.http, market, booking.id);
      expect((await release(driver, booking.id)).status).toBe(403);
      expect((await release(otherFarmer, booking.id)).status).toBe(404);
      expect((await release(otherMarket, booking.id)).status).toBe(404);
      expect((await t.http().post('/payments/release').send({ bookingId: booking.id })).status).toBe(401);
    });

    it("provayder xatosida to'lov HELD qoladi", async () => {
      const { market, booking } = await setup();
      const driver = await registerDriver(t.http);
      await pay(t.http, market, booking.id);
      await deliver(driver, booking.id);
      const spy = jest.spyOn(SimulatedPaymentProvider.prototype, 'payout').mockRejectedValue(new Error('boom'));
      try {
        expect((await release(market, booking.id)).status).toBe(502);
      } finally {
        spy.mockRestore();
      }
      expect((await paymentOf(booking.id)).status).toBe('HELD');
      expect((await release(market, booking.id)).status).toBe(200);
    });
  });

  describe('POST /payments/refund', () => {
    it("to'lanmagan buyurtmani bekor qilish: pul harakati yo'q, yuk va bron bekor, miqdor e'longa qaytadi", async () => {
      const { market, product, booking } = await setup(100);
      expect((await productOf(product.id)).quantityKg.toString()).toBe('400');

      const res = await refund(market, booking.id, 'Fikrim o\'zgardi');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.events.at(-1)).toMatchObject({ status: 'CANCELLED', actor: 'MARKET', note: "Fikrim o'zgardi" });
      expect((await paymentOf(booking.id)).refundedAt).toBeNull();
      expect((await shipmentOf(booking.id)).status).toBe('CANCELLED');
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CANCELLED');
      expect((await productOf(product.id)).quantityKg.toString()).toBe('500');
      expect((await avail(await registerDriver(t.http))).body).toHaveLength(0); // bekor qilingan yuk haydovchilarga ko'rinmaydi
    });

    it("escrow'dagi mablag'ni xaridor yuk OPEN bo'lganda qaytarib oladi", async () => {
      const { market, product, booking } = await setup(100);
      await pay(t.http, market, booking.id);
      const res = await refund(market, booking.id);
      expect(res.body.status).toBe('REFUNDED');
      expect(res.body.events.at(-1).note).toMatch(/qaytarildi.*SIM-REF-/);
      expect((await paymentOf(booking.id)).refundedAt).not.toBeNull();
      expect((await shipmentOf(booking.id)).status).toBe('CANCELLED');
      expect((await productOf(product.id)).quantityKg.toString()).toBe('500');
    });

    it("qoldiq tugagan (BOOKED) e'lon bekor qilingach qayta faol bo'ladi", async () => {
      const farmer = await registerFarmer(t.http);
      const market = await registerMarket(t.http);
      const product = await createProduct(t.http, farmer, { quantityKg: 100 });
      const booking = (await book(t.http, market, product.id, 100)).body;
      await approve(t.http, farmer, booking.id);
      expect((await productOf(product.id)).status).toBe('BOOKED');
      await refund(farmer, booking.id);
      expect(await productOf(product.id)).toMatchObject({ status: 'ACTIVE' });
    });

    it("haydovchi biriktirilgach xaridor bekor qila olmaydi; fermer yo'lga chiqmaguncha qaytara oladi va haydovchi bo'shaydi", async () => {
      const { farmer, market, product, booking } = await setup();
      const driver = await registerDriver(t.http);
      await pay(t.http, market, booking.id);
      await driverAct('post', driver, (await shipmentOf(booking.id)).id, 'accept'); // LOADING

      const byMarket = await refund(market, booking.id);
      expect(byMarket.status).toBe(409);
      expect(byMarket.body.message).toMatch(/Haydovchi biriktirilgandan keyin/);
      expect((await paymentOf(booking.id)).status).toBe('HELD');

      const byFarmer = await refund(farmer, booking.id, 'Mahsulot tugab qoldi');
      expect(byFarmer.status).toBe(200);
      expect(byFarmer.body.status).toBe('REFUNDED');
      expect((await shipmentOf(booking.id)).status).toBe('CANCELLED');
      expect((await productOf(product.id)).quantityKg.toString()).toBe('500');
      // bekor qilingan yuk haydovchining faol yuki hisoblanmaydi
      const mine = await t.http().get('/shipments/mine').set('Authorization', bearer(driver));
      expect(mine.body[0].status).toBe('CANCELLED');
      const farmer2Booking = (await book(t.http, market, product.id, 50)).body;
      await approve(t.http, farmer, farmer2Booking.id);
      await pay(t.http, market, farmer2Booking.id);
      expect((await driverAct('post', driver, (await shipmentOf(farmer2Booking.id)).id, 'accept')).status).toBe(201);
    });

    it("yo'lga chiqqandan keyin faqat administrator qaytaradi; buyurtma o'zgarmaydi (MONEY_ONLY)", async () => {
      const { farmer, market, booking } = await setup();
      const driver = await registerDriver(t.http);
      await pay(t.http, market, booking.id);
      const s = await shipmentOf(booking.id);
      await driverAct('post', driver, s.id, 'accept');
      await driverAct('patch', driver, s.id, 'advance'); // IN_TRANSIT

      expect((await refund(farmer, booking.id)).status).toBe(409);
      expect((await refund(market, booking.id)).status).toBe(409);
      const res = await refund(admin, booking.id, 'Sifat nizosi');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REFUNDED');
      expect(res.body.events.at(-1).note).toMatch(/Sifat nizosi.*Buyurtma o'zgarmadi/);
      expect((await shipmentOf(booking.id)).status).toBe('IN_TRANSIT');
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('APPROVED');
    });

    it("chiqarilgan (RELEASED) va qaytarilgan to'lovni qayta qaytarib bo'lmaydi", async () => {
      const { market, booking } = await setup();
      const driver = await registerDriver(t.http);
      await pay(t.http, market, booking.id);
      await deliver(driver, booking.id);
      await release(market, booking.id);
      for (const who of [market, admin]) expect((await refund(who, booking.id)).status).toBe(409);

      const second = await setup();
      await pay(t.http, second.market, second.booking.id);
      await refund(second.market, second.booking.id);
      expect((await refund(second.market, second.booking.id)).status).toBe(409);
      expect((await refund(admin, second.booking.id)).status).toBe(409);
    });

    it("begona foydalanuvchi va haydovchi qaytara olmaydi", async () => {
      const { market, booking } = await setup();
      const driver = await registerDriver(t.http);
      const otherMarket = await registerMarket(t.http, { companyName: 'Makro' });
      await pay(t.http, market, booking.id);
      expect((await refund(driver, booking.id)).status).toBe(403);
      expect((await refund(otherMarket, booking.id)).status).toBe(404);
      expect((await paymentOf(booking.id)).status).toBe('HELD');
    });

    it("provayder xatosida hech narsa o'zgarmaydi (to'lov, yuk, bron, e'lon qoldig'i)", async () => {
      const { market, product, booking } = await setup(100);
      await pay(t.http, market, booking.id);
      const spy = jest.spyOn(SimulatedPaymentProvider.prototype, 'refund').mockRejectedValue(new Error('down'));
      try {
        expect((await refund(market, booking.id)).status).toBe(502);
      } finally {
        spy.mockRestore();
      }
      expect((await paymentOf(booking.id)).status).toBe('HELD');
      expect((await shipmentOf(booking.id)).status).toBe('OPEN');
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('APPROVED');
      expect((await productOf(product.id)).quantityKg.toString()).toBe('400');
    });
  });

  describe('poyga holatlari', () => {
    it("bir vaqtda chiqarish va qaytarish: faqat bittasi o'tadi, pul ikki marta harakatlanmaydi", async () => {
      const { market, booking } = await setup();
      const driver = await registerDriver(t.http);
      await pay(t.http, market, booking.id);
      await deliver(driver, booking.id);
      const results = await Promise.all([release(market, booking.id), refund(admin, booking.id), release(admin, booking.id), refund(admin, booking.id)]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      const final = await paymentOf(booking.id);
      expect(['RELEASED', 'REFUNDED']).toContain(final.status);
      expect(final.events.filter((e) => ['RELEASED', 'REFUNDED'].includes(e.status))).toHaveLength(1);
    });

    it("bir vaqtda xaridor va fermer qaytarsa: bir marta, miqdor faqat bir marta qaytadi", async () => {
      const { farmer, market, product, booking } = await setup(100);
      await pay(t.http, market, booking.id);
      const results = await Promise.all([refund(market, booking.id), refund(farmer, booking.id), refund(admin, booking.id)]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect((await productOf(product.id)).quantityKg.toString()).toBe('500'); // 600 emas
    });

    it("haydovchi yukni olishga urinayotganda fermer qaytarsa: holat izchil qoladi", async () => {
      const { farmer, market, product, booking } = await setup(100);
      const driver = await registerDriver(t.http);
      await pay(t.http, market, booking.id);
      const s = await shipmentOf(booking.id);
      const [accept, ref] = await Promise.all([driverAct('post', driver, s.id, 'accept'), refund(farmer, booking.id)]);
      expect(ref.status).toBe(200); // fermer OPEN va LOADING da qaytara oladi
      expect([201, 409]).toContain(accept.status);
      expect((await shipmentOf(booking.id)).status).toBe('CANCELLED');
      expect((await paymentOf(booking.id)).status).toBe('REFUNDED');
      expect((await productOf(product.id)).quantityKg.toString()).toBe('500');
      // haydovchida faol yuk qolmagan
      expect(await t.prisma.shipment.count({ where: { driverId: driver.user.driver.id, status: { in: ['LOADING', 'IN_TRANSIT'] } } })).toBe(0);
    });
  });

  describe("ro'yxat va ko'rinish", () => {
    it("har kim faqat o'z to'lovlarini ko'radi; administrator hammasini", async () => {
      const a = await setup();
      const b = await setup();
      const asMarketA = (await t.http().get('/payments').set('Authorization', bearer(a.market))).body;
      const asFarmerB = (await t.http().get('/payments').set('Authorization', bearer(b.farmer))).body;
      const asAdmin = (await t.http().get('/payments').set('Authorization', bearer(admin))).body;
      expect(asMarketA.map((p: any) => p.bookingId)).toEqual([a.booking.id]);
      expect(asFarmerB.map((p: any) => p.bookingId)).toEqual([b.booking.id]);
      expect(asAdmin).toHaveLength(2);
      const driver = await registerDriver(t.http);
      expect((await t.http().get('/payments').set('Authorization', bearer(driver))).status).toBe(403);
      expect((await t.http().get('/payments')).status).toBe(401);
    });

    it("holat filtri va bitta to'lovni olish ishlaydi; begona to'lov 404", async () => {
      const { market, farmer, booking } = await setup();
      await pay(t.http, market, booking.id);
      expect((await t.http().get('/payments?status=HELD').set('Authorization', bearer(market))).body).toHaveLength(1);
      expect((await t.http().get('/payments?status=PENDING').set('Authorization', bearer(market))).body).toHaveLength(0);
      expect((await t.http().get('/payments?status=BAD').set('Authorization', bearer(market))).status).toBe(400);
      expect((await t.http().get(`/payments/booking/${booking.id}`).set('Authorization', bearer(farmer))).body.status).toBe('HELD');
      const stranger = await registerMarket(t.http, { companyName: 'Makro' });
      expect((await t.http().get(`/payments/booking/${booking.id}`).set('Authorization', bearer(stranger))).status).toBe(404);
    });

    it("amallar bayroqlari rolga va holatga mos: PENDING (xaridor to'laydi), HELD, yetkazilgach", async () => {
      const { farmer, market, booking } = await setup();
      const driver = await registerDriver(t.http);
      const view = async (who: Account) => (await t.http().get('/payments').set('Authorization', bearer(who))).body[0].actions;

      expect(await view(market)).toMatchObject({ canPay: true, canRelease: false, canRefund: true, refundEffect: 'CANCEL_ORDER' });
      expect(await view(farmer)).toMatchObject({ canPay: false, canRelease: false, canRefund: true });

      await pay(t.http, market, booking.id);
      expect(await view(market)).toMatchObject({ canPay: false, canRelease: false, canRefund: true });

      await deliver(driver, booking.id);
      expect(await view(market)).toMatchObject({ canRelease: true, canRefund: false, refundBlockedReason: expect.any(String) });
      expect(await view(farmer)).toMatchObject({ canRelease: false, canRefund: false });
    });

    it("ko'rinishda telefon raqam va boshqa maxfiy ma'lumot yo'q; qarshi tomon faqat nomi bilan", async () => {
      const { farmer, market, booking } = await setup();
      await pay(t.http, market, booking.id);
      const asMarket = (await t.http().get('/payments').set('Authorization', bearer(market))).body[0];
      const asFarmer = (await t.http().get('/payments').set('Authorization', bearer(farmer))).body[0];
      expect(asMarket.farmer).toMatchObject({ name: 'Ali Agro' });
      expect(asMarket.market).toBeNull();
      expect(asFarmer.market).toMatchObject({ name: 'Korzinka Market' });
      expect(asFarmer.farmer).toBeNull();
      for (const v of [asMarket, asFarmer]) expect(JSON.stringify(v)).not.toMatch(/\+998|passwordHash|providerRef/);
    });
  });

  describe("e'lonni o'chirish", () => {
    it("to'lov tarixi bor e'lonni o'chirib bo'lmaydi (bekor qilingandan keyin ham), arxivlash mumkin", async () => {
      const { farmer, market, product, booking } = await setup();
      await refund(market, booking.id); // buyurtma bekor, to'lov CANCELLED
      const del = await t.http().delete(`/products/${product.id}`).set('Authorization', bearer(farmer));
      expect(del.status).toBe(409);
      expect(del.body.message).toMatch(/to'lov tarixi/);
      expect(await t.prisma.payment.count()).toBe(1); // moliyaviy yozuv saqlanadi
      const arch = await t.http().put(`/products/${product.id}`).set('Authorization', bearer(farmer)).send({ status: 'ARCHIVED' });
      expect(arch.status).toBe(200);
    });
  });
});
