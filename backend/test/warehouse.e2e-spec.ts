import { promises as fs } from 'fs';
import { join } from 'path';
import {
  bearer, bootApp, createAdmin, registerDriver, registerFarmer, registerMarket, resetDb, TestApp,
} from './helpers';

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe('Warehouse (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => {
    await fs.rm(join(process.cwd(), 'uploads', 'warehouse'), { recursive: true, force: true });
    await t.close();
  });
  beforeEach(async () => { await resetDb(t.prisma); });

  const call = (m: 'get' | 'post' | 'patch' | 'delete', who: any, path: string, body?: object) => {
    const r = t.http()[m](`/warehouse${path}`).set('Authorization', bearer(who));
    return body ? r.send(body) : r;
  };

  async function world() {
    const staff = await createAdmin(t, 'DISPATCHER');
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const driver = await registerDriver(t.http, { capacityKg: 5000 });
    expect((await call('post', staff, '/units/defaults')).status).toBe(201);
    const units = (await call('get', staff, '/units')).body as any[];
    const unit = (type: string) => units.find((u) => u.type === type).id as string;
    return { staff, farmer, market, driver, unit };
  }

  const announce = async (farmer: any, extra: object = {}) => {
    const res = await call('post', farmer, '/items', { name: 'Pomidor', category: 'Sabzavot', declaredWeightKg: 1000, pricePerKg: 4500, ...extra });
    expect(res.status).toBe(201);
    return res.body as any;
  };

  /** Fermer e'lon qiladi -> qabul -> tekshiruv -> kameraga -> jo'natish zonasi */
  async function readyItem(w: Awaited<ReturnType<typeof world>>, opts: { weight?: number; name?: string; category?: string; unitType?: string } = {}) {
    const { weight = 1000, name = 'Pomidor', category = 'Sabzavot', unitType = 'COLD' } = opts;
    const item = await announce(w.farmer, { name, category, declaredWeightKg: weight });
    expect((await call('post', w.staff, `/items/${item.id}/receive`, { measuredWeightKg: weight })).status).toBe(200);
    expect((await call('post', w.staff, `/items/${item.id}/inspect`, { accept: true, grade: 'A' })).status).toBe(200);
    expect((await call('post', w.staff, `/items/${item.id}/move`, { zone: 'STORAGE', unitId: w.unit(unitType) })).status).toBe(200);
    const out = await call('post', w.staff, `/items/${item.id}/move`, { zone: 'OUTBOUND' });
    expect(out.status).toBe(200);
    return out.body as any;
  }

  describe('rollar va ruxsatlar', () => {
    it("faqat fermer e'lon qila oladi; boshqa rollar 403; tokensiz 401", async () => {
      const w = await world();
      const body = { name: 'Olma', category: 'Meva', declaredWeightKg: 100, pricePerKg: 8000 };
      expect((await call('post', w.market, '/items', body)).status).toBe(403);
      expect((await call('post', w.driver, '/items', body)).status).toBe(403);
      expect((await call('post', w.staff, '/items', body)).status).toBe(403);
      expect((await t.http().post('/warehouse/items').send(body)).status).toBe(401);
      expect((await call('post', w.farmer, '/items', body)).status).toBe(201);
    });

    it("ombor operatsiyalari faqat dispetcher/admin uchun", async () => {
      const w = await world();
      const item = await announce(w.farmer);
      for (const who of [w.farmer, w.market, w.driver]) {
        expect((await call('post', who, `/items/${item.id}/receive`, { measuredWeightKg: 10 })).status).toBe(403);
        expect((await call('post', who, `/items/${item.id}/inspect`, { accept: true, grade: 'A' })).status).toBe(403);
        expect((await call('post', who, `/items/${item.id}/move`, { zone: 'SORTING' })).status).toBe(403);
        expect((await call('post', who, `/items/${item.id}/count`, { countedKg: 1 })).status).toBe(403);
        expect((await call('get', who, '/units')).status).toBe(403);
        expect((await call('get', who, '/inventory')).status).toBe(403);
        expect((await call('get', who, '/items')).status).toBe(403);
        expect((await call('get', who, '/drivers')).status).toBe(403);
        expect((await call('post', who, '/units', { name: 'X', type: 'DRY', capacityKg: 10 })).status).toBe(403);
      }
      const admin = await createAdmin(t, 'ADMIN');
      expect((await call('post', admin, `/items/${item.id}/receive`, { measuredWeightKg: 10 })).status).toBe(200); // admin ham ishlay oladi
    });

    it("dispetcher/admin API orqali ro'yxatdan o'tolmaydi", async () => {
      const res = await t.http().post('/auth/dispatcher/register').send({ phone: '+998901112233', password: 'parol1234', fullName: 'Ali' });
      expect(res.status).toBe(404);
    });
  });

  describe("e'lon va tekshiruvlar", () => {
    it("noto'g'ri qiymatlar rad etiladi", async () => {
      const w = await world();
      const ok = { name: 'Olma', category: 'Meva', declaredWeightKg: 100, pricePerKg: 8000 };
      for (const bad of [
        { ...ok, name: 'a' }, { ...ok, category: 'Mashina' }, { ...ok, declaredWeightKg: 0 }, { ...ok, declaredWeightKg: -5 },
        { ...ok, declaredWeightKg: '100' }, { ...ok, pricePerKg: 0 }, { ...ok, declaredWeightKg: 100.123 }, { ...ok, declaredWeightKg: 1e9 },
        { ...ok, pricePerKg: null },
      ]) {
        expect((await call('post', w.farmer, '/items', bad as any)).status).toBe(400);
      }
      expect(await t.prisma.warehouseItem.count()).toBe(0);
    });

    it("saqlash turi mahsulotga qarab aniqlanadi (kartoshka — ventilyatsiya, pomidor — sovitkich, bug'doy — quruq)", async () => {
      const w = await world();
      expect((await announce(w.farmer, { name: 'Kartoshka', category: 'Sabzavot' })).storageType).toBe('VENTILATED');
      expect((await announce(w.farmer, { name: 'Pomidor', category: 'Sabzavot' })).storageType).toBe('COLD');
      expect((await announce(w.farmer, { name: "Bug'doy", category: 'Don' })).storageType).toBe('DRY');
    });

    it("e'lon qilingan yukni faqat egasi va faqat qabul qilinmaguncha bekor qila oladi", async () => {
      const w = await world();
      const other = await registerFarmer(t.http);
      const item = await announce(w.farmer);
      expect((await call('delete', other, `/items/${item.id}`)).status).toBe(404);
      await call('post', w.staff, `/items/${item.id}/receive`, { measuredWeightKg: 900 });
      expect((await call('delete', w.farmer, `/items/${item.id}`)).status).toBe(409);
      const second = await announce(w.farmer);
      expect((await call('delete', w.farmer, `/items/${second.id}`)).status).toBe(200);
    });
  });

  describe('1) Qabul qilish zonasi', () => {
    it("qabul: tortiladi, shtrix-kod beriladi, ikkinchi marta qabul qilib bo'lmaydi", async () => {
      const w = await world();
      const item = await announce(w.farmer);
      const res = await call('post', w.staff, `/items/${item.id}/receive`, { measuredWeightKg: 980.5, rfidTag: 'RFID-0001' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'RECEIVED', zone: 'INBOUND', weightKg: '980.5', receivedWeightKg: '980.5', rfidTag: 'RFID-0001' });
      expect(res.body.code).toMatch(/^AG-\d{6}-[2-9A-HJKMNP-Z]{8}$/);
      expect((await call('post', w.staff, `/items/${item.id}/receive`, { measuredWeightKg: 10 })).status).toBe(409);
      expect((await call('post', w.staff, '/items/00000000-0000-4000-8000-000000000000/receive', { measuredWeightKg: 10 })).status).toBe(404);
    });

    it("RFID takrorlanmaydi; skaner shtrix-kod va RFID bo'yicha topadi", async () => {
      const w = await world();
      const a = await announce(w.farmer);
      const b = await announce(w.farmer);
      const ra = await call('post', w.staff, `/items/${a.id}/receive`, { measuredWeightKg: 100, rfidTag: 'RFID-AAAA' });
      expect((await call('post', w.staff, `/items/${b.id}/receive`, { measuredWeightKg: 100, rfidTag: 'RFID-AAAA' })).status).toBe(409);
      expect((await call('get', w.staff, `/scan/${ra.body.code}`)).body.id).toBe(a.id);
      expect((await call('get', w.staff, `/scan/${ra.body.code.toLowerCase()}`)).body.id).toBe(a.id);
      expect((await call('get', w.staff, '/scan/RFID-AAAA')).body.id).toBe(a.id);
      expect((await call('get', w.staff, '/scan/NOPE')).status).toBe(404);
      expect((await call('get', w.market, `/scan/${ra.body.code}`)).status).toBe(403);
      // b hali qabul qilinmaganligi uchun bekor qilinmagan holda qoldi
      expect((await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('ANNOUNCED');
    });

    it("sifat tekshiruvi: baho, yaroqsiz miqdor, to'liq rad etish; qayta tekshirib bo'lmaydi", async () => {
      const w = await world();
      const a = await announce(w.farmer);
      expect((await call('post', w.staff, `/items/${a.id}/inspect`, { accept: true, grade: 'A' })).status).toBe(409); // hali qabul qilinmagan
      await call('post', w.staff, `/items/${a.id}/receive`, { measuredWeightKg: 1000 });
      expect((await call('post', w.staff, `/items/${a.id}/inspect`, { accept: true })).status).toBe(400); // baho kerak
      expect((await call('post', w.staff, `/items/${a.id}/inspect`, { accept: true, grade: 'B', rejectedKg: 2000 })).status).toBe(400);
      const ok = await call('post', w.staff, `/items/${a.id}/inspect`, { accept: true, grade: 'B', rejectedKg: 50, notes: 'Biroz ezilgan' });
      expect(ok.body).toMatchObject({ status: 'ACTIVE', grade: 'B', weightKg: '950', rejectedKg: '50', inspectionNotes: 'Biroz ezilgan' });
      expect((await call('post', w.staff, `/items/${a.id}/inspect`, { accept: true, grade: 'A' })).status).toBe(409);

      const b = await announce(w.farmer);
      await call('post', w.staff, `/items/${b.id}/receive`, { measuredWeightKg: 500 });
      const rej = await call('post', w.staff, `/items/${b.id}/inspect`, { accept: false, notes: 'Chirigan' });
      expect(rej.body).toMatchObject({ status: 'REJECTED', weightKg: '0', rejectedKg: '500' });
      expect((await call('post', w.staff, `/items/${b.id}/move`, { zone: 'SORTING' })).status).toBe(409); // rad etilganni ko'chirib bo'lmaydi
    });
  });

  describe('2-4) Zonalar orasida ko\'chirish', () => {
    async function inspected(w: any, o: object = {}) {
      const item = await announce(w.farmer, o);
      await call('post', w.staff, `/items/${item.id}/receive`, { measuredWeightKg: 1000 });
      await call('post', w.staff, `/items/${item.id}/inspect`, { accept: true, grade: 'A' });
      return item.id as string;
    }

    it("tekshiruvdan o'tmagan yuk ko'chirilmaydi; qabuldan to'g'ridan-to'g'ri jo'natishga o'tib bo'lmaydi", async () => {
      const w = await world();
      const raw = await announce(w.farmer);
      await call('post', w.staff, `/items/${raw.id}/receive`, { measuredWeightKg: 100 });
      expect((await call('post', w.staff, `/items/${raw.id}/move`, { zone: 'STORAGE', unitId: w.unit('COLD') })).status).toBe(409);
      const id = await inspected(w);
      expect((await call('post', w.staff, `/items/${id}/move`, { zone: 'OUTBOUND' })).status).toBe(409);
      expect((await call('post', w.staff, `/items/${id}/move`, { zone: 'INBOUND' })).status).toBe(400); // enum tashqarisida
      expect((await call('post', w.staff, `/items/${id}/move`, { zone: 'STORAGE' })).status).toBe(400); // kamera tanlanmagan
    });

    it("sovuq talab qiladigan mahsulotni quruq omborga qo'yib bo'lmaydi; override bilan mumkin; sovitkichga ventilyatsiyalini mumkin", async () => {
      const w = await world();
      const tomato = await inspected(w);
      const r = await call('post', w.staff, `/items/${tomato}/move`, { zone: 'STORAGE', unitId: w.unit('DRY') });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/mos emas/);
      expect((await call('post', w.staff, `/items/${tomato}/move`, { zone: 'STORAGE', unitId: w.unit('DRY'), override: true })).status).toBe(200);

      const potato = await inspected(w, { name: 'Kartoshka' });
      expect((await call('post', w.staff, `/items/${potato}/move`, { zone: 'STORAGE', unitId: w.unit('DRY') })).status).toBe(409);
      expect((await call('post', w.staff, `/items/${potato}/move`, { zone: 'STORAGE', unitId: w.unit('VENTILATED') })).status).toBe(200);
      const wheat = await inspected(w, { name: "Bug'doy", category: 'Don' });
      expect((await call('post', w.staff, `/items/${wheat}/move`, { zone: 'STORAGE', unitId: w.unit('DRY') })).status).toBe(200);
    });

    it("saqlash muddati kameraga qo'yilganda hisoblanadi va sovitkichda uzayadi", async () => {
      const w = await world();
      const cold = await inspected(w, { name: 'Olma', category: 'Meva' });
      const r = await call('post', w.staff, `/items/${cold}/move`, { zone: 'STORAGE', unitId: w.unit('COLD') });
      const days = (new Date(r.body.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(28);
      expect(days).toBeLessThan(31);
    });

    it("kamera sig'imi tekshiriladi (parallel joylashda ham oshib ketmaydi)", async () => {
      const w = await world();
      const small = (await call('post', w.staff, '/units', { name: 'Kichik kamera', type: 'COLD', capacityKg: 1500 })).body.id;
      const ids = [await inspected(w), await inspected(w), await inspected(w)]; // 1000 kg dan
      const res = await Promise.all(ids.map((id) => call('post', w.staff, `/items/${id}/move`, { zone: 'STORAGE', unitId: small })));
      expect(res.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      const unit = (await call('get', w.staff, '/units')).body.find((u: any) => u.id === small);
      expect(Number(unit.usedKg)).toBe(1000);
    });

    it("saralash: o'lcham, qadoq, yaroqsiz miqdor; faqat saralash zonasida", async () => {
      const w = await world();
      const id = await inspected(w);
      expect((await call('post', w.staff, `/items/${id}/sort`, { sizeClass: 'LARGE' })).status).toBe(409); // hali saralash zonasida emas
      await call('post', w.staff, `/items/${id}/move`, { zone: 'SORTING' });
      expect((await call('post', w.staff, `/items/${id}/sort`, {})).status).toBe(400);
      expect((await call('post', w.staff, `/items/${id}/sort`, { rejectedKg: 5000 })).status).toBe(400);
      const res = await call('post', w.staff, `/items/${id}/sort`, { sizeClass: 'LARGE', rejectedKg: 40, packagingType: 'Karton 10 kg', packageWeightKg: 10 });
      expect(res.body).toMatchObject({ sizeClass: 'LARGE', packagingType: 'Karton 10 kg', packageWeightKg: '10', weightKg: '960', rejectedKg: '40' });
      expect((await call('post', w.staff, `/items/${id}/move`, { zone: 'STORAGE', unitId: w.unit('COLD') })).status).toBe(200); // qaytib saqlashga
      expect((await call('post', w.staff, `/items/${id}/move`, { zone: 'OUTBOUND' })).status).toBe(200);
    });
  });

  describe('post lenta (market)', () => {
    it("marketlar faqat jo'natishga tayyor postlarni ko'radi; maxfiy maydonlar yo'q", async () => {
      const w = await world();
      const ready = await readyItem(w, { name: 'Pomidor' });
      const stored = await announce(w.farmer, { name: 'Olma', category: 'Meva' });
      await call('post', w.staff, `/items/${stored.id}/receive`, { measuredWeightKg: 300 });

      const feed = await call('get', w.market, '/feed');
      expect(feed.status).toBe(200);
      expect(feed.body.total).toBe(1);
      const post = feed.body.items[0];
      expect(post).toMatchObject({ id: ready.id, name: 'Pomidor', zone: 'OUTBOUND', availableKg: '1000', pricePerKg: '4500', grade: 'A', storageType: 'COLD' });
      expect(post.climate.unit).toMatchObject({ name: 'Sovitkich kamera 1', type: 'COLD' });
      expect(post.farmer).toEqual({ farmName: 'Ali Agro', region: 'Samarqand' });
      const raw = JSON.stringify(feed.body);
      for (const secret of [w.farmer.phone, 'inspectionNotes', 'reservedKg', 'rfidTag', 'declaredWeightKg', '"weightKg"']) expect(raw).not.toContain(secret);
      expect((await call('get', w.farmer, '/feed')).status).toBe(403);
      expect((await call('get', w.driver, '/feed')).status).toBe(403);
      expect((await t.http().get('/warehouse/feed')).status).toBe(401);
    });

    it("qidiruv, kategoriya va sahifalash ishlaydi; to'liq zaxiralangan post yashirinadi", async () => {
      const w = await world();
      await readyItem(w, { name: 'Pomidor', weight: 100 });
      const apple = await readyItem(w, { name: 'Qizil olma', category: 'Meva', weight: 100 });
      expect((await call('get', w.market, '/feed?q=olma')).body.total).toBe(1);
      expect((await call('get', w.market, '/feed?q=ALI AGRO')).body.total).toBe(2);
      expect((await call('get', w.market, '/feed?category=Meva')).body.items[0].id).toBe(apple.id);
      expect((await call('get', w.market, '/feed?limit=1&page=2')).body).toMatchObject({ total: 2, page: 2, pages: 2 });
      expect((await call('get', w.market, '/feed?limit=999')).status).toBe(400);
      expect((await call('get', w.market, '/feed?storageType=XYZ')).status).toBe(400);

      expect((await call('post', w.market, '/orders', { itemId: apple.id, quantityKg: 100 })).status).toBe(201);
      expect((await call('get', w.market, '/feed')).body.total).toBe(1); // olma to'liq zaxiralangan
    });

    it("bitta post: market faqat jo'natishga tayyorini, fermer faqat o'zini ko'radi", async () => {
      const w = await world();
      const ready = await readyItem(w);
      const hidden = await announce(w.farmer, { name: 'Olma', category: 'Meva' });
      const other = await registerFarmer(t.http);
      expect((await call('get', w.market, `/items/${ready.id}`)).status).toBe(200);
      expect((await call('get', w.market, `/items/${hidden.id}`)).status).toBe(404);
      expect((await call('get', w.farmer, `/items/${hidden.id}`)).status).toBe(200);
      expect((await call('get', other, `/items/${ready.id}`)).status).toBe(404);
      expect((await call('get', w.driver, `/items/${ready.id}`)).status).toBe(403);
      const own = await call('get', w.farmer, `/items/${ready.id}`);
      expect(own.body.movements.length).toBe(3);
      expect(own.body).not.toHaveProperty('rfidTag');
    });

    it("fermer faqat o'z yuklarini ko'radi; dispetcher hammasini (aloqa ma'lumotlari bilan)", async () => {
      const w = await world();
      const other = await registerFarmer(t.http);
      await announce(w.farmer);
      await announce(other, { name: 'Olma', category: 'Meva' });
      const mine = await call('get', w.farmer, '/items/mine');
      expect(mine.body.total).toBe(1);
      expect(mine.body.items[0].farmer).not.toHaveProperty('phone');
      const all = await call('get', w.staff, '/items');
      expect(all.body.total).toBe(2);
      expect(all.body.items[0].farmer.phone).toEqual(expect.stringMatching(/^\+998/));
      expect((await call('get', w.staff, '/items?zone=INBOUND&status=ANNOUNCED')).body.total).toBe(2);
      expect((await call('get', w.staff, '/items?zone=NOPE')).status).toBe(400);
    });
  });

  describe("5) Jo'natish: buyurtmalar", () => {
    it("to'liq oqim: buyurtma -> yig'ish -> haydovchiga yuklash -> yetkazish; qoldiq va jurnal mos", async () => {
      const w = await world();
      const item = await readyItem(w, { weight: 1000 });
      const order = await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 300, note: 'Ertalab kerak' });
      expect(order.status).toBe(201);
      expect(order.body).toMatchObject({ status: 'PENDING', quantityKg: '300', pricePerKg: '4500', totalPrice: '1350000' });
      let row = await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.reservedKg.toString()).toBe('300');
      expect(row.weightKg.toString()).toBe('1000');

      const id = order.body.id;
      expect((await call('patch', w.staff, `/orders/${id}/dispatch`, { driverId: w.driver.user.driver?.id ?? (await t.prisma.driver.findFirstOrThrow()).id })).status).toBe(409); // yig'ilmagan
      expect((await call('patch', w.staff, `/orders/${id}/picked`)).status).toBe(409);
      expect((await call('patch', w.staff, `/orders/${id}/picking`)).body.status).toBe('PICKING');
      expect((await call('patch', w.staff, `/orders/${id}/picking`)).status).toBe(409);
      expect((await call('patch', w.staff, `/orders/${id}/picked`)).body.status).toBe('PICKED');

      const driverId = (await t.prisma.driver.findFirstOrThrow()).id;
      const dispatched = await call('patch', w.staff, `/orders/${id}/dispatch`, { driverId });
      expect(dispatched.body).toMatchObject({ status: 'DISPATCHED', driver: { plateNumber: expect.any(String) } });
      row = await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.weightKg.toString()).toBe('700');
      expect(row.reservedKg.toString()).toBe('0');

      // haydovchi ko'radi (market manzili bilan), fermer ko'radi (market telefonisiz)
      const forDriver = (await call('get', w.driver, '/orders/mine')).body;
      expect(forDriver).toHaveLength(1);
      expect(forDriver[0].market.phone).toEqual(expect.stringMatching(/^\+998/));
      const forFarmer = (await call('get', w.farmer, '/orders/mine')).body;
      expect(forFarmer[0].market).not.toHaveProperty('phone');
      expect(forFarmer[0].driver).toBeNull();

      expect((await call('patch', w.farmer, `/orders/${id}/deliver`)).status).toBe(403);
      expect((await call('patch', w.market, `/orders/${id}/deliver`)).body.status).toBe('DELIVERED');
      expect((await call('patch', w.market, `/orders/${id}/deliver`)).status).toBe(409);

      // jurnal yig'indisi = qoldiq
      const moves = await t.prisma.stockMovement.findMany({ where: { itemId: item.id } });
      expect(moves.reduce((a, m) => a + Number(m.deltaKg), 0)).toBe(700);
      expect(moves.map((m) => m.type)).toEqual(expect.arrayContaining(['RECEIVE', 'MOVE', 'DISPATCH']));
    });

    it("hammasi jo'natilsa yuk DEPLETED bo'ladi va lentadan yo'qoladi", async () => {
      const w = await world();
      const item = await readyItem(w, { weight: 200 });
      const id = (await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 200 })).body.id;
      await call('patch', w.staff, `/orders/${id}/picking`);
      await call('patch', w.staff, `/orders/${id}/picked`);
      await call('patch', w.staff, `/orders/${id}/dispatch`, { driverId: (await t.prisma.driver.findFirstOrThrow()).id });
      expect((await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('DEPLETED');
      expect((await call('get', w.market, '/feed')).body.total).toBe(0);
    });

    it("mavjuddan ko'p buyurtma berib bo'lmaydi; noto'g'ri qiymatlar rad etiladi; faqat market buyurtma beradi", async () => {
      const w = await world();
      const item = await readyItem(w, { weight: 100 });
      expect((await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 100.01 })).status).toBe(409);
      for (const bad of [{ quantityKg: 0 }, { quantityKg: -5 }, { quantityKg: '10' }, { quantityKg: 1.234 }, { itemId: 'x', quantityKg: 5 }]) {
        expect((await call('post', w.market, '/orders', { itemId: item.id, ...bad } as any)).status).toBe(400);
      }
      for (const who of [w.farmer, w.driver, w.staff]) expect((await call('post', who, '/orders', { itemId: item.id, quantityKg: 5 })).status).toBe(403);
      expect((await call('post', w.market, '/orders', { itemId: '00000000-0000-4000-8000-000000000000', quantityKg: 5 })).status).toBe(404);
      expect((await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: item.id } })).reservedKg.toString()).toBe('0');
    });

    it("tayyor bo'lmagan (jo'natish zonasida bo'lmagan) yukka buyurtma berib bo'lmaydi", async () => {
      const w = await world();
      const item = await announce(w.farmer);
      expect((await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 5 })).status).toBe(404);
    });

    it("PARALLEL buyurtmalar: oxirgi kilogrammlar ortiqcha sotilmaydi", async () => {
      const w = await world();
      const item = await readyItem(w, { weight: 100 });
      const markets = [w.market, await registerMarket(t.http), await registerMarket(t.http), await registerMarket(t.http), await registerMarket(t.http)];
      const res = await Promise.all(markets.map((m) => call('post', m, '/orders', { itemId: item.id, quantityKg: 30 })));
      expect(res.map((r) => r.status).sort()).toEqual([201, 201, 201, 409, 409]);
      const row = await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.reservedKg.toString()).toBe('90');
    });

    it("bekor qilish zaxirani qaytaradi; market faqat yig'ish tugamaguncha; dispatchdan keyin hech kim", async () => {
      const w = await world();
      const item = await readyItem(w, { weight: 100 });
      const a = (await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 40 })).body.id;
      const other = await registerMarket(t.http);
      expect((await call('patch', other, `/orders/${a}/cancel`)).status).toBe(404); // begona
      expect((await call('patch', w.market, `/orders/${a}/cancel`)).body.status).toBe('CANCELLED');
      expect((await call('patch', w.market, `/orders/${a}/cancel`)).status).toBe(409);
      expect((await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: item.id } })).reservedKg.toString()).toBe('0');

      const b = (await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 40 })).body.id;
      await call('patch', w.staff, `/orders/${b}/picking`);
      await call('patch', w.staff, `/orders/${b}/picked`);
      expect((await call('patch', w.market, `/orders/${b}/cancel`)).status).toBe(409); // yig'ilgandan keyin faqat dispetcher
      expect((await call('patch', w.staff, `/orders/${b}/cancel`)).body.status).toBe('CANCELLED');
      expect((await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: item.id } })).reservedKg.toString()).toBe('0');

      const c = (await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 10 })).body.id;
      await call('patch', w.staff, `/orders/${c}/picking`);
      await call('patch', w.staff, `/orders/${c}/picked`);
      await call('patch', w.staff, `/orders/${c}/dispatch`, { driverId: (await t.prisma.driver.findFirstOrThrow()).id });
      expect((await call('patch', w.staff, `/orders/${c}/cancel`)).status).toBe(409);
      expect((await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: item.id } })).weightKg.toString()).toBe('90');
    });

    it("bekor qilish va yuklash poygasi: zaxira ham, qoldiq ham buzilmaydi", async () => {
      const w = await world();
      const item = await readyItem(w, { weight: 100 });
      const id = (await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 60 })).body.id;
      await call('patch', w.staff, `/orders/${id}/picking`);
      await call('patch', w.staff, `/orders/${id}/picked`);
      const driverId = (await t.prisma.driver.findFirstOrThrow()).id;
      const [a, b] = await Promise.all([
        call('patch', w.staff, `/orders/${id}/dispatch`, { driverId }),
        call('patch', w.staff, `/orders/${id}/cancel`),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const row = await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.reservedKg.toString()).toBe('0');
      expect(['40', '100']).toContain(row.weightKg.toString());
    });

    it("zaxiralangan yukni jo'natish zonasidan chiqarib/kamaytirib bo'lmaydi", async () => {
      const w = await world();
      const item = await readyItem(w, { weight: 100 });
      await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 60 });
      expect((await call('post', w.staff, `/items/${item.id}/move`, { zone: 'STORAGE', unitId: w.unit('COLD') })).status).toBe(409);
      expect((await call('post', w.staff, `/items/${item.id}/count`, { countedKg: 50 })).status).toBe(409);
      expect((await call('post', w.staff, `/items/${item.id}/count`, { countedKg: 60 })).status).toBe(200);
    });

    it("haydovchi sig'imi va mavjudligi tekshiriladi", async () => {
      const w = await world();
      const item = await readyItem(w, { weight: 9000 });
      const big = (await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 6000 })).body.id;
      await call('patch', w.staff, `/orders/${big}/picking`);
      await call('patch', w.staff, `/orders/${big}/picked`);
      const driverId = (await t.prisma.driver.findFirstOrThrow()).id; // sig'imi 5000
      expect((await call('patch', w.staff, `/orders/${big}/dispatch`, { driverId })).status).toBe(409);
      expect((await call('patch', w.staff, `/orders/${big}/dispatch`, { driverId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
      expect((await call('patch', w.staff, `/orders/${big}/dispatch`, {})).status).toBe(400);
      expect((await call('get', w.staff, '/drivers')).body).toHaveLength(1);
    });

    it("bitta market ochiq buyurtmalar chegarasidan oshmaydi", async () => {
      const w = await world();
      const item = await readyItem(w, { weight: 1000 });
      for (let i = 0; i < 20; i++) expect((await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 1 })).status).toBe(201);
      const over = await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 1 });
      expect(over.status).toBe(409);
      expect(over.body.message).toMatch(/chegarasiga/);
    });

    it("buyurtmalar ro'yxati rolga qarab cheklangan", async () => {
      const w = await world();
      const item = await readyItem(w);
      await call('post', w.market, '/orders', { itemId: item.id, quantityKg: 10 });
      const otherMarket = await registerMarket(t.http);
      const otherFarmer = await registerFarmer(t.http);
      expect((await call('get', w.market, '/orders/mine')).body).toHaveLength(1);
      expect((await call('get', otherMarket, '/orders/mine')).body).toHaveLength(0);
      expect((await call('get', w.farmer, '/orders/mine')).body).toHaveLength(1);
      expect((await call('get', otherFarmer, '/orders/mine')).body).toHaveLength(0);
      expect((await call('get', w.driver, '/orders/mine')).body).toHaveLength(0);
      expect((await call('get', w.staff, '/orders')).body).toHaveLength(1);
      expect((await call('get', w.staff, '/orders?status=DELIVERED')).body).toHaveLength(0);
      expect((await call('get', w.market, '/orders')).status).toBe(403);
      expect((await call('get', w.staff, '/orders/mine')).status).toBe(403);
    });
  });

  describe('inventarizatsiya va kameralar', () => {
    it("sanash qoldiqni tuzatadi va jurnalga yoziladi; 0 bo'lsa DEPLETED", async () => {
      const w = await world();
      const item = await readyItem(w, { weight: 500 });
      const r = await call('post', w.staff, `/items/${item.id}/count`, { countedKg: 480, note: 'Kamomad' });
      expect(r.body.weightKg).toBe('480');
      const m = await t.prisma.stockMovement.findFirstOrThrow({ where: { itemId: item.id, type: 'ADJUST' } });
      expect(m.deltaKg.toString()).toBe('-20');
      expect(m.note).toBe('Kamomad');
      expect((await call('post', w.staff, `/items/${item.id}/count`, { countedKg: -1 })).status).toBe(400);
      expect((await call('post', w.staff, `/items/${item.id}/count`, { countedKg: 0 })).body.status).toBe('DEPLETED');
    });

    it("kamera yaratish tekshiruvlari; nom takrorlanmaydi; standart kameralar bir marta", async () => {
      const w = await world();
      expect((await call('post', w.staff, '/units/defaults')).status).toBe(409);
      expect((await call('post', w.staff, '/units', { name: 'Sovitkich kamera 1', type: 'COLD', capacityKg: 100 })).status).toBe(409);
      expect((await call('post', w.staff, '/units', { name: 'Yangi', type: 'COLD', capacityKg: 100, tempMinC: 10, tempMaxC: 5 })).status).toBe(400);
      expect((await call('post', w.staff, '/units', { name: 'Yangi', type: 'COLD', capacityKg: 0 })).status).toBe(400);
      expect((await call('post', w.staff, '/units', { name: 'Yangi', type: 'KOSMOS', capacityKg: 100 })).status).toBe(400);
      const ok = await call('post', w.staff, '/units', { name: 'Maxsus', type: 'COLD', capacityKg: 100, tempMinC: -2, tempMaxC: 2 });
      expect(ok.status).toBe(201);
    });

    it("harorat ko'rsatkichi: me'yor/ogohlantirish/avariya; postda ko'rinadi", async () => {
      const w = await world();
      const item = await readyItem(w);
      const unitId = (await t.prisma.warehouseItem.findUniqueOrThrow({ where: { id: item.id } })).unitId!;
      const read = (tempC: number, humidity: number) => call('post', w.staff, `/units/${unitId}/readings`, { tempC, humidity });
      expect((await read(4, 90)).body.status).toBe('OK');
      expect((await read(9.5, 90)).body.status).toBe('WARN');
      expect((await read(14, 90)).body.status).toBe('ALARM');
      const post = (await call('get', w.market, '/feed')).body.items[0];
      expect(post.climate.unit).toMatchObject({ tempC: 14, humidity: 90, status: 'ALARM' });
      expect((await call('post', w.staff, `/units/${unitId}/readings`, { tempC: 100, humidity: 50 })).status).toBe(400);
      expect((await call('post', w.staff, `/units/${unitId}/readings`, { tempC: 5, humidity: 120 })).status).toBe(400);
      expect((await call('post', w.staff, '/units/00000000-0000-4000-8000-000000000000/readings', { tempC: 5, humidity: 50 })).status).toBe(404);
      const inv = (await call('get', w.staff, '/inventory')).body;
      expect(inv.alarms).toEqual([expect.objectContaining({ unitId, status: 'ALARM' })]);
    });

    it("inventarizatsiya hisoboti zonalar, toifalar va kutilayotgan yuklar bo'yicha", async () => {
      const w = await world();
      await readyItem(w, { weight: 400 });                                     // OUTBOUND
      const b = await announce(w.farmer, { name: 'Olma', category: 'Meva' });
      await call('post', w.staff, `/items/${b.id}/receive`, { measuredWeightKg: 300 });
      await call('post', w.staff, `/items/${b.id}/inspect`, { accept: true, grade: 'B' });
      await call('post', w.staff, `/items/${b.id}/move`, { zone: 'STORAGE', unitId: w.unit('COLD') });
      await announce(w.farmer);                                                  // ANNOUNCED
      const inv = (await call('get', w.staff, '/inventory')).body;
      expect(inv.totalKg).toBe('700');
      expect(inv.byZone.find((z: any) => z.zone === 'OUTBOUND')).toMatchObject({ itemCount: 1, weightKg: '400' });
      expect(inv.byZone.find((z: any) => z.zone === 'STORAGE')).toMatchObject({ itemCount: 1, weightKg: '300' });
      expect(inv.byZone.find((z: any) => z.zone === 'INBOUND')).toMatchObject({ itemCount: 0 });
      expect(inv.byCategory).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'Meva', weightKg: '300' })]));
      expect(inv.awaiting.ANNOUNCED).toBe(1);
      expect(inv.units.find((u: any) => u.name === 'Sovitkich kamera 1').usedKg).toBe('700');
    });

    it("bazaning CHECK cheklovi: zaxira qoldiqdan ko'p bo'la olmaydi (hatto to'g'ridan-to'g'ri SQL bilan)", async () => {
      const w = await world();
      const item = await readyItem(w, { weight: 100 });
      await expect(t.prisma.$executeRaw`UPDATE "WarehouseItem" SET "reservedKg" = 101 WHERE id = ${item.id}`).rejects.toThrow();
      await expect(t.prisma.$executeRaw`UPDATE "WarehouseItem" SET "weightKg" = -1 WHERE id = ${item.id}`).rejects.toThrow();
    });
  });

  describe('rasm', () => {
    it("fermer/dispetcher rasm yuklaydi; haqiqiy rasm bo'lmagan fayl va begona fermer rad etiladi", async () => {
      const w = await world();
      const item = await announce(w.farmer);
      const other = await registerFarmer(t.http);
      const up = (who: any, buf: Buffer, name = 'a.png') => t.http().post(`/warehouse/items/${item.id}/photo`).set('Authorization', bearer(who)).attach('file', buf, name);

      const ok = await up(w.farmer, PNG);
      expect(ok.status).toBe(200);
      expect(ok.body.photoUrl).toMatch(/^\/uploads\/warehouse\/.+\.png$/);
      expect((await t.http().get(ok.body.photoUrl)).status).toBe(200);
      expect((await up(w.farmer, Buffer.from('<script>alert(1)</script>'), 'x.png')).status).toBe(400); // kengaytma emas, baytlar tekshiriladi
      expect((await up(other, PNG)).status).toBe(404);
      expect((await up(w.market, PNG)).status).toBe(403);
      expect((await up(w.staff, PNG)).status).toBe(200);
      expect((await t.http().post(`/warehouse/items/${item.id}/photo`).set('Authorization', bearer(w.farmer))).status).toBe(400); // fayl yo'q
    });
  });
});
