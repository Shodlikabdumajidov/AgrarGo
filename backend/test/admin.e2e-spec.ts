import {
  approve, book, bearer, bootApp, createAdmin, createProduct, PASSWORD, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp,
} from './helpers';

const DEFAULTS = {
  siteName: 'AgrarGo', callCenterPhones: ['+998 78 140 09 09'], supportEmail: 'info@agrargo.uz', telegramHandle: '@agrargobot', telegramUrl: 'https://t.me/agrargobot',
  instagramUrl: null, facebookUrl: null, youtubeUrl: null,
  workingHours: { uz: 'Du–Sh: 09:00–18:00', ru: 'Пн–Сб: 09:00–18:00', en: 'Mon–Sat: 09:00–18:00' },
  address: { uz: "Samarqand, O'zbekiston", ru: 'Самарканд, Узбекистан', en: 'Samarkand, Uzbekistan' },
};

describe('Admin panel (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => {
    await resetDb(t.prisma);
    await t.prisma.systemSettings.update({ where: { id: 1 }, data: { ...DEFAULTS, callCenterPhones: DEFAULTS.callCenterPhones } });
  });

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', who: any, path: string, body?: object) => {
    const r = t.http()[m](`/admin${path}`).set('Authorization', bearer(who));
    return body ? r.send(body) : r;
  };

  async function world() {
    const admin = await createAdmin(t, 'ADMIN');
    const farmer = await registerFarmer(t.http);
    const market = await registerMarket(t.http);
    const driver = await registerDriver(t.http);
    return { admin, farmer, market, driver };
  }

  describe('ruxsatlar', () => {
    it("barcha /admin endpointlari faqat ADMIN uchun (dispetcher ham kira olmaydi)", async () => {
      const w = await world();
      const staff = await createAdmin(t, 'DISPATCHER');
      const calls: [string, string, object?][] = [
        ['get', '/stats'], ['get', '/users'], ['get', `/users/${w.farmer.user.id}`], ['patch', `/users/${w.farmer.user.id}`, { fullName: 'X Y' }],
        ['patch', `/users/${w.farmer.user.id}/status`, { isActive: false }], ['post', `/users/${w.farmer.user.id}/password`, { password: 'Yangi1234x' }],
        ['post', '/staff', { phone: '+998901234567', password: 'Yangi1234x', fullName: 'Ali', role: 'DISPATCHER' }],
        ['get', '/products'], ['patch', '/products/00000000-0000-4000-8000-000000000000', { name: 'Abc' }], ['delete', '/products/00000000-0000-4000-8000-000000000000'],
        ['get', '/shipments'], ['get', '/settings'], ['put', '/settings', { siteName: 'Hack' }], ['get', '/audit'],
      ];
      for (const who of [w.farmer, w.market, w.driver, staff]) {
        for (const [m, path, body] of calls) {
          const res = await api(m as any, who, path, body);
          expect([m, path, res.status]).toEqual([m, path, 403]);
        }
      }
      for (const [m, path] of calls) expect((await (t.http() as any)[m](`/admin${path}`)).status).toBe(401);
      expect((await t.prisma.systemSettings.findUniqueOrThrow({ where: { id: 1 } })).siteName).toBe('AgrarGo');
    });

    it("admin ombor va to'lov endpointlariga ham kira oladi va o'zgartiruvchi amallari jurnalga yoziladi", async () => {
      const w = await world();
      expect((await t.http().post('/warehouse/units/defaults').set('Authorization', bearer(w.admin))).status).toBe(201);
      expect((await t.http().get('/warehouse/inventory').set('Authorization', bearer(w.admin))).status).toBe(200);
      expect((await t.http().get('/payments').set('Authorization', bearer(w.admin))).status).toBe(200);
      const log = (await api('get', w.admin, '/audit?entity=warehouse')).body;
      expect(log.items[0]).toMatchObject({ action: 'POST /warehouse/units/defaults', actorRole: 'ADMIN', entity: 'warehouse' });
      // o'qish amallari jurnalga yozilmaydi
      expect(log.total).toBe(1);
    });
  });

  describe('statistika', () => {
    it("hamma modullar bo'yicha hisoblagichlar va aylanma", async () => {
      const w = await world();
      const product = await createProduct(t.http, w.farmer, { quantityKg: 5000 });
      const b = (await book(t.http, w.market, product.id, 1000)).body;
      await approve(t.http, w.farmer, b.id);
      await pay(t.http, w.market, b.id);
      await t.prisma.user.update({ where: { id: w.driver.user.id }, data: { isActive: false } });

      const s = (await api('get', w.admin, '/stats')).body;
      expect(s.users).toMatchObject({ total: 4, blocked: 1, byRole: { FARMER: 1, MARKET: 1, DRIVER: 1, ADMIN: 1 } });
      expect(s.products).toMatchObject({ ACTIVE: expect.any(Number) });
      expect(s.bookings.APPROVED).toBe(1);
      expect(s.shipments.OPEN).toBe(1);
      expect(s.payments.byStatus.HELD.count).toBe(1);
      expect(s.payments.volume).toBe('4500000');
      expect(s.payments.heldAmount).toBe('4500000');
      expect(s.signups).toHaveLength(14);
      expect(s.signups[13]).toMatchObject({ farmers: 1, markets: 1, drivers: 1, total: 4 }); // bugun (admin ham hisobda)
      // oylik qatorlar: 6 oy, oxirgisi joriy oy; escrow'da turgan pul savdo hisoblanmaydi
      expect(s.monthly).toHaveLength(6);
      expect(s.monthly[5]).toMatchObject({ sales: '0', payments: 0, bookings: 1 });
      expect(s.monthly[0]).toMatchObject({ sales: '0', bookings: 0 });
      const rel = await t.http().post('/payments/release').set('Authorization', bearer(w.admin)).send({ bookingId: b.id });
      expect(rel.status).toBe(200);
      const after = (await api('get', w.admin, '/stats')).body;
      expect(after.monthly[5]).toMatchObject({ sales: '4500000', payments: 1 });
    });
  });

  describe('foydalanuvchilar', () => {
    it("ro'yxat: rol, holat, qidiruv va sahifalash; parol hashi hech qachon qaytmaydi", async () => {
      const w = await world();
      const all = (await api('get', w.admin, '/users')).body;
      expect(all.total).toBe(4);
      expect(JSON.stringify(all)).not.toContain('passwordHash');
      expect((await api('get', w.admin, '/users?role=FARMER')).body.items.map((u: any) => u.id)).toEqual([w.farmer.user.id]);
      expect((await api('get', w.admin, '/users?q=korzinka')).body.total).toBe(1);
      expect((await api('get', w.admin, `/users?q=${encodeURIComponent(w.farmer.phone.slice(4))}`)).body.total).toBe(1);
      expect((await api('get', w.admin, '/users?active=false')).body.total).toBe(0);
      expect((await api('get', w.admin, '/users?limit=2&page=2')).body).toMatchObject({ total: 4, page: 2, pages: 2 });
      for (const bad of ['role=KING', 'active=maybe', 'limit=500', 'page=0']) expect((await api('get', w.admin, `/users?${bad}`)).status).toBe(400);
    });

    it("batafsil ma'lumot profil va hisoblagichlar bilan; begona id 404", async () => {
      const w = await world();
      await createProduct(t.http, w.farmer);
      const u = (await api('get', w.admin, `/users/${w.farmer.user.id}`)).body;
      expect(u).toMatchObject({ role: 'FARMER', farmer: { farmName: 'Ali Agro' }, counts: { products: 1 } });
      expect(u).not.toHaveProperty('passwordHash');
      expect((await api('get', w.admin, '/users/00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await api('get', w.admin, '/users/not-uuid')).status).toBe(400);
    });

    it("tahrirlash: foydalanuvchi profilidagi bir xil validatsiya bilan; dispetcher faqat ism", async () => {
      const w = await world();
      const ok = await api('patch', w.admin, `/users/${w.farmer.user.id}`, { fullName: 'Yangi Ism', farmName: 'Yangi Xo\'jalik', region: 'Buxoro' });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ fullName: 'Yangi Ism', farmer: { farmName: "Yangi Xo'jalik", region: 'Buxoro' } });
      expect((await api('patch', w.admin, `/users/${w.farmer.user.id}`, { stir: '123' })).status).toBe(400);
      const d = await createAdmin(t, 'DISPATCHER');
      expect((await api('patch', w.admin, `/users/${d.user.id}`, { fullName: 'Dilshod Aka' })).body.fullName).toBe('Dilshod Aka');
      expect((await api('patch', w.admin, `/users/${d.user.id}`, { fullName: '' })).status).toBe(400);
      expect((await api('get', w.admin, '/audit?entity=user')).body.items[0].action).toBe('user.update');
    });

    it("bloklash: sessiya DARHOL yopiladi, kirib bo'lmaydi; faollashtirgach yana kiradi", async () => {
      const w = await world();
      expect((await t.http().get('/profile').set('Authorization', bearer(w.farmer))).status).toBe(200);
      const res = await api('patch', w.admin, `/users/${w.farmer.user.id}/status`, { isActive: false, reason: 'Firibgarlik shubhasi' });
      expect(res.body.isActive).toBe(false);
      expect((await t.http().get('/profile').set('Authorization', bearer(w.farmer))).status).toBe(401);
      expect((await t.http().post('/auth/login').send({ phone: w.farmer.phone, password: PASSWORD })).status).toBe(401);
      expect((await api('patch', w.admin, `/users/${w.farmer.user.id}/status`, { isActive: true })).body.isActive).toBe(true);
      expect((await t.http().post('/auth/login').send({ phone: w.farmer.phone, password: PASSWORD })).status).toBe(200);
      const log = (await api('get', w.admin, '/audit?entity=user')).body.items;
      expect(log.map((l: any) => l.action)).toEqual(['user.activate', 'user.block']);
      expect(log[1].details).toEqual({ reason: 'Firibgarlik shubhasi' });
    });

    it("o'zini va oxirgi faol adminni bloklab bo'lmaydi", async () => {
      const w = await world();
      expect((await api('patch', w.admin, `/users/${w.admin.user.id}/status`, { isActive: false })).status).toBe(409);
      const second = await createAdmin(t, 'ADMIN');
      // ikkinchi admin birinchisini bloklay oladi (oxirgi emas)
      expect((await api('patch', second, `/users/${w.admin.user.id}/status`, { isActive: false })).status).toBe(200);
      // endi `second` yagona faol admin: o'zini bloklay olmaydi
      expect((await api('patch', second, `/users/${second.user.id}/status`, { isActive: false })).status).toBe(409);
      expect((await api('patch', w.admin, '/users/00000000-0000-4000-8000-000000000000/status', { isActive: false })).status).toBe(401); // bloklangan admin sessiyasi ham o'ldi
      expect((await api('patch', w.admin, `/users/${w.farmer.user.id}/status`, { isActive: 'yes' as any })).status).toBe(401);
    });

    it("admin parolni tiklaydi: eski parol va tokenlar yaroqsiz; zaif parol rad etiladi", async () => {
      const w = await world();
      expect((await api('post', w.admin, `/users/${w.market.user.id}/password`, { password: '12345678' })).status).toBe(400);
      expect((await api('post', w.admin, `/users/${w.market.user.id}/password`, { password: 'Yangi-Parol-2026' })).status).toBe(200);
      expect((await t.http().get('/profile').set('Authorization', bearer(w.market))).status).toBe(401);
      expect((await t.http().post('/auth/login').send({ phone: w.market.phone, password: PASSWORD })).status).toBe(401);
      expect((await t.http().post('/auth/login').send({ phone: w.market.phone, password: 'Yangi-Parol-2026' })).status).toBe(200);
      expect(JSON.stringify((await api('get', w.admin, '/audit')).body)).not.toContain('Yangi-Parol');
    });

    it("xodim yaratish: dispetcher/admin; takroriy telefon va noto'g'ri qiymatlar rad etiladi", async () => {
      const w = await world();
      const body = { phone: '+998905550001', password: 'Xodim-Parol-2026', fullName: 'Dilshod Dispetcher', role: 'DISPATCHER' };
      const ok = await api('post', w.admin, '/staff', body);
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ role: 'DISPATCHER', isActive: true });
      expect((await t.http().post('/auth/login').send({ phone: body.phone, password: body.password })).status).toBe(200);
      expect((await api('post', w.admin, '/staff', body)).status).toBe(409);
      expect((await api('post', w.admin, '/staff', { ...body, phone: w.farmer.phone })).body.message).toMatch(/Fermer/);
      for (const bad of [{ role: 'FARMER' }, { role: 'KING' }, { phone: '12345' }, { password: 'short' }, { fullName: 'A' }]) {
        expect((await api('post', w.admin, '/staff', { ...body, phone: '+998905550002', ...bad })).status).toBe(400);
      }
    });
  });

  describe("e'lonlar va yuklar", () => {
    it("e'lonlarni ko'rish, tahrirlash, o'chirish (bronlari bo'lsa 409)", async () => {
      const w = await world();
      const p1 = await createProduct(t.http, w.farmer, { name: 'Olma', category: 'Meva' });
      const p2 = await createProduct(t.http, w.farmer, { name: 'Pomidor', quantityKg: 5000 });
      const list = (await api('get', w.admin, '/products?q=olma')).body;
      expect(list.total).toBe(1);
      expect(list.items[0].farmer.farmName).toBe('Ali Agro');
      expect((await api('patch', w.admin, `/products/${p1.id}`, { pricePerKg: 9000, status: 'SOLD', name: 'Olma (Fuji)' })).status).toBe(200);
      expect((await t.prisma.product.findUniqueOrThrow({ where: { id: p1.id } }))).toMatchObject({ name: 'Olma (Fuji)', status: 'SOLD' });
      for (const bad of [{}, { pricePerKg: -1 }, { status: 'GONE' }, { name: 'a' }, { quantityKg: 'ko\'p' }]) {
        expect((await api('patch', w.admin, `/products/${p1.id}`, bad as any)).status).toBe(400);
      }
      expect((await api('patch', w.admin, '/products/00000000-0000-4000-8000-000000000000', { name: 'Abc' })).status).toBe(404);
      await book(t.http, w.market, p2.id, 100);
      const blocked = await api('delete', w.admin, `/products/${p2.id}`);
      expect(blocked.status).toBe(409);
      expect((await api('delete', w.admin, `/products/${p1.id}`)).status).toBe(200);
      expect((await api('delete', w.admin, `/products/${p1.id}`)).status).toBe(404);
    });

    it("yuklar ro'yxati: holat filtri, haydovchi va to'lov holati", async () => {
      const w = await world();
      const p = await createProduct(t.http, w.farmer, { quantityKg: 5000 });
      const b = (await book(t.http, w.market, p.id, 500)).body;
      await approve(t.http, w.farmer, b.id);
      await pay(t.http, w.market, b.id);
      const all = (await api('get', w.admin, '/shipments')).body;
      expect(all.total).toBe(1);
      expect(all.items[0]).toMatchObject({ status: 'OPEN', paymentStatus: 'HELD', farmName: 'Ali Agro', companyName: 'Korzinka Market', driver: null });
      expect((await api('get', w.admin, '/shipments?status=DELIVERED')).body.total).toBe(0);
      expect((await api('get', w.admin, '/shipments?status=NOPE')).status).toBe(400);
    });
  });

  describe('sayt sozlamalari', () => {
    it("ochiq endpoint tokensiz ishlaydi va admin o'zgartirishi DARHOL ko'rinadi", async () => {
      const w = await world();
      const before = await t.http().get('/settings/public');
      expect(before.status).toBe(200);
      expect(before.headers['cache-control']).toMatch(/no-cache/);
      expect(before.body).toMatchObject({ callCenterPhones: ['+998 78 140 09 09'], telegramHandle: '@agrargobot' });
      expect(before.body).not.toHaveProperty('updatedById');
      expect(before.body).not.toHaveProperty('id');

      const put = await api('put', w.admin, '/settings', {
        callCenterPhones: ['+998 71 200 00 01', '+998 90 123 45 67'], supportEmail: 'help@agrargo.uz', instagramUrl: 'https://instagram.com/agrargo',
        facebookUrl: 'https://facebook.com/agrargo', youtubeUrl: 'https://youtube.com/@agrargo', telegramHandle: 'agrargo_support',
        workingHours: { uz: 'Har kuni 08:00–20:00', ru: 'Ежедневно 08:00–20:00', en: 'Daily 08:00–20:00' },
      });
      expect(put.status).toBe(200);
      const after = (await t.http().get('/settings/public')).body;
      expect(after).toMatchObject({
        callCenterPhones: ['+998 71 200 00 01', '+998 90 123 45 67'], supportEmail: 'help@agrargo.uz', instagramUrl: 'https://instagram.com/agrargo',
        telegramHandle: '@agrargo_support', workingHours: { ru: 'Ежедневно 08:00–20:00' },
      });
      expect(after.address.uz).toBe("Samarqand, O'zbekiston"); // yuborilmagan maydon o'zgarmaydi
      const audit = (await api('get', w.admin, '/audit?entity=settings')).body.items[0];
      expect(audit.details.changed).toEqual(expect.arrayContaining(['callCenterPhones', 'workingHours']));
    });

    it("xavfli yoki noto'g'ri qiymatlar rad etiladi (javascript: havolalar, noto'g'ri email/telefon)", async () => {
      const w = await world();
      for (const bad of [
        { instagramUrl: 'javascript:alert(1)' }, { facebookUrl: 'http://facebook.com/a' }, { youtubeUrl: 'data:text/html,<script>' }, { telegramUrl: 'https://' },
        { supportEmail: 'not-an-email' }, { callCenterPhones: ['abc'] }, { callCenterPhones: [] }, { callCenterPhones: ['+998901234567', '+998901234568', '+998901234569', '+998901234560', '+998901234561', '+998901234562'] },
        { telegramHandle: 'a b' }, { workingHours: { uz: 'x', ru: 'y' } }, { workingHours: { uz: 'x', ru: 'y', en: 'z'.repeat(200) } }, { siteName: 'A' },
      ]) {
        const r = await api('put', w.admin, '/settings', bad as any);
        expect([JSON.stringify(bad), r.status]).toEqual([JSON.stringify(bad), 400]);
      }
      expect((await t.http().get('/settings/public')).body).toMatchObject({ siteName: 'AgrarGo', instagramUrl: null });
    });

    it("null yuborilsa maydon tozalanadi; sozlamalar hech qachon yo'qolmaydi", async () => {
      const w = await world();
      expect((await api('put', w.admin, '/settings', { telegramUrl: null, supportEmail: null })).status).toBe(200);
      expect((await t.http().get('/settings/public')).body).toMatchObject({ telegramUrl: null, supportEmail: null });
      expect(await t.prisma.systemSettings.count()).toBe(1);
      await expect(t.prisma.$executeRaw`INSERT INTO "SystemSettings" ("id","siteName","callCenterPhones","workingHours","address","updatedAt") VALUES (2,'x',ARRAY[]::text[],'{}','{}',now())`).rejects.toThrow();
    });
  });

  describe('audit jurnali', () => {
    it("sahifalanadi, entity bo'yicha filtrlanadi va parollar/maxfiy ma'lumotlar yozilmaydi", async () => {
      const w = await world();
      await api('patch', w.admin, `/users/${w.market.user.id}/status`, { isActive: false });
      await api('patch', w.admin, `/users/${w.market.user.id}/status`, { isActive: true });
      await api('put', w.admin, '/settings', { siteName: 'AgrarGo 2' });
      const all = (await api('get', w.admin, '/audit')).body;
      expect(all.total).toBe(3);
      expect(all.items[0]).toMatchObject({ action: 'settings.update', actorName: 'Admin', actorRole: 'ADMIN' });
      expect((await api('get', w.admin, '/audit?entity=user&limit=1')).body).toMatchObject({ total: 2, pages: 2 });
      expect((await api('get', w.admin, '/audit?limit=999')).status).toBe(400);
    });
  });
});
