import { JwtService } from '@nestjs/jwt';
import { bearer, bootApp, nextPhone, PASSWORD, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

describe('Authentication (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  describe('ro‘yxatdan o‘tish', () => {
    it("fermer, haydovchi va marketni ro'yxatdan o'tkazadi; parol xeshi hech qachon qaytmaydi", async () => {
      const farmer = await registerFarmer(t.http);
      const driver = await registerDriver(t.http);
      const market = await registerMarket(t.http);

      expect(farmer.user).toMatchObject({ role: 'FARMER', farmer: { farmName: 'Ali Agro' } });
      expect(driver.user).toMatchObject({ role: 'DRIVER', driver: { capacityKg: '1000' } });
      expect(market.user).toMatchObject({ role: 'MARKET', market: { companyName: 'Korzinka Market' } });
      for (const a of [farmer, driver, market]) {
        expect(a.token).toEqual(expect.any(String));
        expect(JSON.stringify(a.user)).not.toMatch(/passwordHash/);
      }
    });

    it("parol bazada bcrypt xesh sifatida saqlanadi", async () => {
      const a = await registerFarmer(t.http);
      const row = await t.prisma.user.findUniqueOrThrow({ where: { id: a.user.id } });
      expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(row.passwordHash).not.toContain(PASSWORD);
    });

    it("haydovchi davlat raqami normallashtiriladi (bo'shliq olib tashlanadi, katta harf)", async () => {
      const d = await registerDriver(t.http, { plateNumber: '01 a 123 bc' });
      expect(d.user.driver.plateNumber).toBe('01A123BC');
    });

    it("noto'g'ri ma'lumot 400 va tushunarli xabarlar bilan rad etiladi", async () => {
      const res = await t.http().post('/auth/farmer/register').send({ phone: '123', password: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.message.join(' ')).toMatch(/\+998XXXXXXXXX/);
    });

    it('ortiqcha maydonlar (masalan role) e‘tiborga olinmaydi: fermer bo‘lib ro‘yxatdan o‘tgan ADMIN bo‘la olmaydi', async () => {
      const a = await registerFarmer(t.http, { role: 'ADMIN' });
      expect(a.user.role).toBe('FARMER');
    });
  });

  describe('bitta telefon raqam — bitta rol', () => {
    it.each([
      ['FARMER', 'Fermer', () => registerFarmer, () => registerDriver, '/auth/driver/register'],
      ['DRIVER', 'Haydovchi', () => registerDriver, () => registerMarket, '/auth/market/register'],
      ['MARKET', 'Market', () => registerMarket, () => registerFarmer, '/auth/farmer/register'],
    ])('%s raqami boshqa rolda ro‘yxatdan o‘ta olmaydi', async (_role, label, first, _second, path) => {
      const a = await first()(t.http);
      const body: Record<string, unknown> = {
        phone: a.phone, password: PASSWORD, fullName: 'Boshqa Odam',
        // barcha rollar uchun kerakli maydonlar
        farmName: 'X Agro', region: 'Samarqand', district: 'Urgut', vehicleType: 'Isuzu', plateNumber: '01Z999ZZ',
        capacityKg: 500, companyName: 'X Market',
      };
      const res = await t.http().post(path).send(body);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(`Ushbu raqam allaqachon ${label} sifatida ro'yxatdan o'tgan`);
    });

    it("bir xil rolda ikkinchi marta ham 409", async () => {
      const a = await registerFarmer(t.http);
      const res = await t.http().post('/auth/farmer/register').send({
        phone: a.phone, password: PASSWORD, fullName: 'Ali', farmName: 'Ali Agro', region: 'Samarqand', district: 'Urgut',
      });
      expect(res.status).toBe(409);
    });

    it('takroriy STIR va davlat raqami 409', async () => {
      await registerFarmer(t.http, { stir: '123456789' });
      await expect(registerFarmer(t.http, { stir: '123456789' })).rejects.toThrow(/409/);
      const d = await registerDriver(t.http);
      const res = await t.http().post('/auth/driver/register').send({
        phone: nextPhone(), password: PASSWORD, fullName: 'Karim', vehicleType: 'Fura',
        plateNumber: d.user.driver.plateNumber, capacityKg: 5000, region: 'Samarqand',
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/davlat raqami/);
    });

    it('bir vaqtda ikki marta yuborilgan ro‘yxatdan o‘tish: bittasi yaratiladi, ikkinchisi 409', async () => {
      const phone = nextPhone();
      const send = () => t.http().post('/auth/farmer/register').send({
        phone, password: PASSWORD, fullName: 'Ali', farmName: 'Ali Agro', region: 'Samarqand', district: 'Urgut',
      });
      const results = await Promise.all([send(), send(), send()]);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      expect(await t.prisma.user.count({ where: { phone } })).toBe(1);
    });
  });

  describe('kirish (login)', () => {
    it("to'g'ri ma'lumot bilan token qaytaradi", async () => {
      const a = await registerFarmer(t.http);
      const res = await t.http().post('/auth/login').send({ phone: a.phone, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(a.user.id);
    });

    it('noto‘g‘ri parol va mavjud bo‘lmagan raqam bir xil 401 xabarini beradi', async () => {
      const a = await registerFarmer(t.http);
      const wrongPw = await t.http().post('/auth/login').send({ phone: a.phone, password: 'wrongpass1' });
      const noUser = await t.http().post('/auth/login').send({ phone: nextPhone(), password: 'wrongpass1' });
      expect(wrongPw.status).toBe(401);
      expect(noUser.status).toBe(401);
      expect(wrongPw.body.message).toBe(noUser.body.message);
    });

    it("role berilsa va raqam boshqa rolda bo'lsa 409; parol xato bo'lsa rol oshkor qilinmaydi (401)", async () => {
      const farmer = await registerFarmer(t.http);
      const mismatch = await t.http().post('/auth/login').send({ phone: farmer.phone, password: PASSWORD, role: 'DRIVER' });
      expect(mismatch.status).toBe(409);
      expect(mismatch.body.message).toMatch(/Fermer sifatida ro'yxatdan o'tgan.*Haydovchi sifatida kirib bo'lmaydi/);

      const leak = await t.http().post('/auth/login').send({ phone: farmer.phone, password: 'wrongpass1', role: 'DRIVER' });
      expect(leak.status).toBe(401);

      const ok = await t.http().post('/auth/login').send({ phone: farmer.phone, password: PASSWORD, role: 'FARMER' });
      expect(ok.status).toBe(200);
    });

    it('faol bo‘lmagan akkaunt kira olmaydi', async () => {
      const a = await registerFarmer(t.http);
      await t.prisma.user.update({ where: { id: a.user.id }, data: { isActive: false } });
      const res = await t.http().post('/auth/login').send({ phone: a.phone, password: PASSWORD });
      expect(res.status).toBe(401);
    });
  });

  describe('JWT himoyasi', () => {
    it('/auth/me token bilan foydalanuvchini qaytaradi, tokensiz 401', async () => {
      const a = await registerDriver(t.http);
      const me = await t.http().get('/auth/me').set('Authorization', bearer(a));
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ id: a.user.id, role: 'DRIVER', driver: { plateNumber: expect.any(String) } });
      expect(me.body.passwordHash).toBeUndefined();
      expect((await t.http().get('/auth/me')).status).toBe(401);
    });

    it("buzilgan, boshqa kalit bilan imzolangan, muddati o'tgan va 'none' algoritmli tokenlar rad etiladi", async () => {
      const a = await registerFarmer(t.http);
      const jwt = t.app.get(JwtService);

      const tampered = a.token.slice(0, -4) + (a.token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
      const wrongKey = new JwtService({ secret: 'boshqa-kalit-boshqa-kalit-boshqa-kalit' }).sign({ sub: a.user.id, role: 'FARMER' });
      const expired = jwt.sign({ sub: a.user.id, role: 'FARMER' }, { expiresIn: '-10s' });
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: a.user.id, role: 'FARMER' })}.`;

      for (const token of [tampered, wrongKey, expired, none, 'abc.def.ghi', '']) {
        const res = await t.http().get('/auth/me').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(401);
      }
    });

    it("token yaroqli bo'lsa ham o'chirilgan yoki faolsizlantirilgan foydalanuvchi kira olmaydi", async () => {
      const a = await registerFarmer(t.http);
      await t.prisma.user.update({ where: { id: a.user.id }, data: { isActive: false } });
      expect((await t.http().get('/auth/me').set('Authorization', bearer(a))).status).toBe(401);
    });

    it("token ichidagi rol emas, bazadagi rol hisobga olinadi", async () => {
      const farmer = await registerFarmer(t.http);
      const forged = t.app.get(JwtService).sign({ sub: farmer.user.id, role: 'ADMIN' });
      const res = await t.http().get('/products').set('Authorization', `Bearer ${forged}`);
      expect(res.status).toBe(200); // haqiqiy rol FARMER: tokendagi "ADMIN" yolg'on da'vo e'tiborsiz
      const asDriver = await registerDriver(t.http);
      const forged2 = t.app.get(JwtService).sign({ sub: asDriver.user.id, role: 'FARMER' });
      expect((await t.http().get('/products').set('Authorization', `Bearer ${forged2}`)).status).toBe(403);
    });
  });
});
