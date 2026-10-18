import { JwtService } from '@nestjs/jwt';
import { SimulatedSmsProvider } from '../src/sms/sms-provider';
import { generateResetToken } from '../src/auth/password/otp';
import {
  Account, bearer, bootApp, nextPhone, PASSWORD, registerDriver, registerFarmer, registerMarket, resetDb, TestApp,
} from './helpers';

const NEW_PASSWORD = 'Yangi-parol-2026';
const flush = () => new Promise((r) => setImmediate(r)); // fire-and-forget SMS yuborilishini kutish

describe('Parol: o‘zgartirish va tiklash (e2e)', () => {
  let t: TestApp;
  let sms: jest.SpyInstance;
  let clock: jest.SpyInstance;
  let offset = 0;
  beforeAll(async () => { t = await bootApp({ OTP_MAX_ATTEMPTS: '5', OTP_TTL_SECONDS: '300' }); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => {
    await resetDb(t.prisma);
    sms = jest.spyOn(SimulatedSmsProvider.prototype, 'send').mockResolvedValue(undefined);
    // Qayta yuborish kutish muddatini (rate-limit hisoblagichi) kutmaslik uchun soat oldinga suriladi
    const realNow = Date.now.bind(Date);
    offset = 0;
    clock = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
  });
  afterEach(() => { sms.mockRestore(); clock.mockRestore(); });
  const skipCooldown = () => { offset += 6_000; };

  const login = (phone: string, password: string) => t.http().post('/auth/login').send({ phone, password });
  const me = (token: string) => t.http().get('/auth/me').set('Authorization', `Bearer ${token}`);
  const change = (who: Account | string, body: object) => t.http().post('/auth/change-password').set('Authorization', bearer(who)).send(body);
  const forgot = (phone: string) => t.http().post('/auth/forgot-password').send({ phone });
  const verify = (phone: string, code: string) => t.http().post('/auth/verify-reset-code').send({ phone, code });
  const reset = (resetToken: string, newPassword: string) => t.http().post('/auth/reset-password').send({ resetToken, newPassword });
  const rows = (userId: string) => t.prisma.passwordReset.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const wrongCode = (code: string) => (code === '000000' ? '000001' : '000000');

  /** SMS kodni olib, tasdiqlab, tiklash tokenini qaytaradi */
  async function getResetToken(phone: string) {
    const code = (await forgot(phone)).body.devCode as string;
    const res = await verify(phone, code);
    expect(res.status).toBe(200);
    return { code, token: res.body.resetToken as string };
  }

  describe('POST /auth/change-password', () => {
    it("joriy parol bilan yangisiga almashtiradi: eski token va eski parol yaroqsiz, yangi token ishlaydi", async () => {
      const a = await registerFarmer(t.http);
      const res = await change(a, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.message).toMatch(/sessiyalar yopildi/);

      expect((await me(a.token)).status).toBe(401); // eski token
      expect((await me(res.body.accessToken)).status).toBe(200); // joriy qurilma tizimda qoladi
      expect((await login(a.phone, PASSWORD)).status).toBe(401);
      expect((await login(a.phone, NEW_PASSWORD)).status).toBe(200);
    });

    it("boshqa qurilmalardagi barcha sessiyalar yopiladi (tokenVersion)", async () => {
      const a = await registerMarket(t.http);
      const other = (await login(a.phone, PASSWORD)).body.accessToken as string; // ikkinchi qurilma
      expect((await me(other)).status).toBe(200);
      await change(a, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect((await me(other)).status).toBe(401);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).tokenVersion).toBe(1);
    });

    it("parol bazada yangi bcrypt xesh sifatida saqlanadi", async () => {
      const a = await registerDriver(t.http);
      const before = (await t.prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).passwordHash;
      await change(a, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      const after = (await t.prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).passwordHash;
      expect(after).toMatch(/^\$2[aby]\$/);
      expect(after).not.toBe(before);
      expect(after).not.toContain(NEW_PASSWORD);
    });

    it("xavfsizlik SMS'i yuboriladi (parol matni yo'q)", async () => {
      const a = await registerFarmer(t.http);
      await change(a, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      await flush();
      expect(sms).toHaveBeenCalledWith(a.phone, expect.stringMatching(/parolingiz o'zgartirildi/));
      expect(JSON.stringify(sms.mock.calls)).not.toContain(NEW_PASSWORD);
    });

    it("noto'g'ri joriy parol 400; parol va sessiya o'zgarmaydi", async () => {
      const a = await registerFarmer(t.http);
      const res = await change(a, { currentPassword: 'wrongpass1', newPassword: NEW_PASSWORD });
      expect(res.status).toBe(400); // 401 emas: frontend sessiya tugadi deb chiqarib yubormasligi uchun
      expect(res.body.message).toBe("Joriy parol noto'g'ri");
      expect((await login(a.phone, PASSWORD)).status).toBe(200);
      expect((await me(a.token)).status).toBe(200);
    });

    it("yangi parol joriy bilan bir xil bo'lsa rad etiladi", async () => {
      const a = await registerFarmer(t.http);
      const res = await change(a, { currentPassword: PASSWORD, newPassword: PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/farq qilishi/);
    });

    it.each([
      ['qisqa', 'ab12', /kamida 8/],
      ['raqamsiz', 'faqatharflar', /raqam/],
      ['harfsiz', '1234567890', /harf/],
      ['ommabop', 'Password123', /oddiy/],
      ['uzun (72 baytdan ko‘p)', 'a1b2c3d4'.repeat(10), /72 bayt/],
    ])("zaif yangi parol (%s) 400", async (_n, newPassword, msg) => {
      const a = await registerFarmer(t.http);
      const res = await change(a, { currentPassword: PASSWORD, newPassword });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toMatch(msg);
      expect((await login(a.phone, PASSWORD)).status).toBe(200);
    });

    it("tokensiz yoki yaroqsiz token bilan 401; maydonlar yetishmasa 400; ortiqcha maydonlar e'tiborsiz", async () => {
      const a = await registerFarmer(t.http);
      expect((await t.http().post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(401);
      expect((await change('bad.token.value', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(401);
      expect((await change(a, {})).status).toBe(400);
      expect((await change(a, { currentPassword: PASSWORD })).status).toBe(400);
      const res = await change(a, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, role: 'ADMIN', phone: '+998909999999', tokenVersion: 99 });
      expect(res.status).toBe(200);
      const row = await t.prisma.user.findUniqueOrThrow({ where: { id: a.user.id } });
      expect(row).toMatchObject({ role: 'FARMER', phone: a.phone, tokenVersion: 1 });
    });

    it("operator injection (obyekt yuborish) rad etiladi", async () => {
      const a = await registerFarmer(t.http);
      expect((await change(a, { currentPassword: { $ne: '' }, newPassword: NEW_PASSWORD })).status).toBe(400);
      expect((await change(a, { currentPassword: PASSWORD, newPassword: { $ne: '' } })).status).toBe(400);
    });

    it("har qanday rol o'z parolini o'zgartira oladi (fermer, haydovchi, market, admin)", async () => {
      const farmer = await registerFarmer(t.http);
      const driver = await registerDriver(t.http);
      const market = await registerMarket(t.http);
      for (const acc of [farmer, driver, market]) {
        expect((await change(acc, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(200);
      }
    });
  });

  describe('POST /auth/forgot-password', () => {
    it("ro'yxatdan o'tgan raqamga 6 xonali kod SMS orqali yuboriladi; kod bazada faqat xesh sifatida", async () => {
      const a = await registerFarmer(t.http);
      const res = await forgot(a.phone);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ expiresInSeconds: 300, resendAfterSeconds: expect.any(Number) });
      expect(res.body.devCode).toMatch(/^\d{6}$/); // faqat development/test

      await flush();
      expect(sms).toHaveBeenCalledTimes(1);
      expect(sms).toHaveBeenCalledWith(a.phone, expect.stringContaining(res.body.devCode));

      const [row] = await rows(a.user.id);
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain(res.body.devCode);
      expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(290_000);
      expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000);
    });

    it("mavjud bo'lmagan raqamga ham xuddi shu xabar, lekin SMS ham, yozuv ham yo'q", async () => {
      const real = await registerFarmer(t.http);
      const ok = await forgot(real.phone);
      const ghost = await forgot(nextPhone());
      expect(ghost.status).toBe(200);
      expect(ghost.body.message).toBe(ok.body.message);
      expect(ghost.body.expiresInSeconds).toBe(ok.body.expiresInSeconds);
      await flush();
      expect(sms).toHaveBeenCalledTimes(1);
      expect(await t.prisma.passwordReset.count()).toBe(1);
    });

    it("faolsizlantirilgan akkauntga kod yuborilmaydi (javob o'zgarmaydi)", async () => {
      const a = await registerFarmer(t.http);
      await t.prisma.user.update({ where: { id: a.user.id }, data: { isActive: false } });
      expect((await forgot(a.phone)).status).toBe(200);
      await flush();
      expect(sms).not.toHaveBeenCalled();
      expect(await t.prisma.passwordReset.count()).toBe(0);
    });

    it("yangi kod so'ralsa eski kod bekor bo'ladi", async () => {
      const a = await registerFarmer(t.http);
      const first = (await forgot(a.phone)).body.devCode;
      skipCooldown();
      const second = (await forgot(a.phone)).body.devCode;
      expect(second).toEqual(expect.any(String));
      if (first !== second) expect((await verify(a.phone, first)).status).toBe(400);
      expect((await verify(a.phone, second)).status).toBe(200);
      expect(await t.prisma.passwordReset.count({ where: { userId: a.user.id, usedAt: null } })).toBe(1);
    });

    it("noto'g'ri telefon formati va maydon turi 400", async () => {
      for (const body of [{ phone: '90 123' }, {}, { phone: { $ne: null } }, { phone: '+998 90 123 45 67' }]) {
        expect((await t.http().post('/auth/forgot-password').send(body)).status).toBe(400);
        skipCooldown(); // noto'g'ri so'rovlar ham IP bo'yicha kutish hisobiga kiradi
      }
    });

    it("SMS provayderi ishlamasa ham javob bir xil (xato jurnalga yoziladi, foydalanuvchiga ko'rinmaydi)", async () => {
      const a = await registerFarmer(t.http);
      sms.mockRejectedValue(new Error('provider down'));
      const res = await forgot(a.phone);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/provider down/);
    });
  });

  describe('POST /auth/verify-reset-code', () => {
    it("to'g'ri kod tiklash tokenini beradi; token bazada faqat xesh sifatida", async () => {
      const a = await registerFarmer(t.http);
      const { token } = await getResetToken(a.phone);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const [row] = await rows(a.user.id);
      expect(row.verifiedAt).not.toBeNull();
      expect(row.resetTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it("noto'g'ri kod, mavjud bo'lmagan raqam, faolsiz akkaunt va muddati o'tgan kod uchun xabar bir xil", async () => {
      const a = await registerFarmer(t.http);
      const inactive = await registerFarmer(t.http);
      const code = (await forgot(a.phone)).body.devCode;
      await forgot(inactive.phone);
      await t.prisma.user.update({ where: { id: inactive.user.id }, data: { isActive: false } });

      const messages = new Set<string>();
      for (const res of [
        await verify(a.phone, wrongCode(code)),
        await verify(nextPhone(), '123456'),
        await verify(inactive.phone, '123456'),
      ]) {
        expect(res.status).toBe(400);
        messages.add(res.body.message);
      }
      await t.prisma.passwordReset.updateMany({ where: { userId: a.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const expired = await verify(a.phone, code);
      expect(expired.status).toBe(400);
      messages.add(expired.body.message);
      expect(messages.size).toBe(1);
    });

    it("urinishlar chegarasi (5): to'g'ri kod ham, chegaradan keyin yaroqsiz; yangi kod so'rash mumkin", async () => {
      const a = await registerFarmer(t.http);
      const code = (await forgot(a.phone)).body.devCode;
      for (let i = 0; i < 5; i++) expect((await verify(a.phone, wrongCode(code))).status).toBe(400);
      expect((await verify(a.phone, code)).status).toBe(400); // kod to'g'ri, lekin urinishlar tugagan
      expect((await rows(a.user.id))[0].attempts).toBe(5);

      skipCooldown();
      const fresh = (await forgot(a.phone)).body.devCode;
      expect((await verify(a.phone, fresh)).status).toBe(200);
    });

    it("parallel 30 ta taxmin: bazada urinishlar soni aniq 5 dan oshmaydi", async () => {
      const a = await registerFarmer(t.http);
      const code = (await forgot(a.phone)).body.devCode;
      const guesses = Array.from({ length: 30 }, (_, i) => String(100000 + i).replace(code, '999999'));
      const results = await Promise.all(guesses.map((g) => verify(a.phone, g)));
      expect(results.every((r) => r.status === 400)).toBe(true);
      expect((await rows(a.user.id))[0].attempts).toBe(5);
      expect((await verify(a.phone, code)).status).toBe(400); // endi to'g'ri kod ham o'tmaydi
    });

    it("bir vaqtda 5 ta to'g'ri so'rov: faqat bittasi token oladi", async () => {
      const a = await registerFarmer(t.http);
      const code = (await forgot(a.phone)).body.devCode;
      const results = await Promise.all(Array.from({ length: 5 }, () => verify(a.phone, code)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    });

    it("kod raqamga bog'langan: boshqa raqam bilan, yoki ishlatib bo'lingan kod bilan o'tmaydi", async () => {
      const a = await registerFarmer(t.http);
      const b = await registerMarket(t.http);
      const codeA = (await forgot(a.phone)).body.devCode;
      await forgot(b.phone);
      if (codeA !== (await rows(b.user.id))[0].codeHash) expect((await verify(b.phone, codeA)).status).toBe(400);
      expect((await verify(a.phone, codeA)).status).toBe(200);
      expect((await verify(a.phone, codeA)).status).toBe(400); // allaqachon tasdiqlangan
    });

    it("kod formati noto'g'ri bo'lsa 400 (6 raqam emas)", async () => {
      for (const code of ['12345', '1234567', 'abcdef', '12 456', '']) {
        expect((await verify(nextPhone(), code)).status).toBe(400);
      }
      expect((await t.http().post('/auth/verify-reset-code').send({ phone: nextPhone(), code: { $ne: 0 } })).status).toBe(400);
    });
  });

  describe('POST /auth/reset-password', () => {
    it("to'liq oqim: kod → token → yangi parol; eski parol va barcha eski tokenlar yaroqsiz", async () => {
      const a = await registerFarmer(t.http);
      const { token } = await getResetToken(a.phone);

      const res = await reset(token, NEW_PASSWORD);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Parol yangilandi/);
      expect(res.body.accessToken).toBeUndefined(); // avtomatik kirish yo'q: yangi parol bilan kiriladi

      expect((await login(a.phone, PASSWORD)).status).toBe(401);
      expect((await login(a.phone, NEW_PASSWORD)).status).toBe(200);
      expect((await me(a.token)).status).toBe(401); // tiklashdan oldingi token
      await flush();
      expect(sms).toHaveBeenCalledWith(a.phone, expect.stringMatching(/parolingiz tiklandi/));
    });

    it("token bir martalik: ikkinchi marta ishlamaydi", async () => {
      const a = await registerFarmer(t.http);
      const { token } = await getResetToken(a.phone);
      expect((await reset(token, NEW_PASSWORD)).status).toBe(200);
      const again = await reset(token, 'Boshqa-parol-777');
      expect(again.status).toBe(400);
      expect((await login(a.phone, NEW_PASSWORD)).status).toBe(200);
      expect((await login(a.phone, 'Boshqa-parol-777')).status).toBe(401);
    });

    it("zaif parol 400 va token 'yonib ketmaydi': keyin yaxshi parol bilan davom ettirish mumkin", async () => {
      const a = await registerFarmer(t.http);
      const { token } = await getResetToken(a.phone);
      for (const weak of ['short1', 'faqatharflar', '12345678', 'Password123']) {
        expect((await reset(token, weak)).status).toBe(400);
      }
      expect((await login(a.phone, PASSWORD)).status).toBe(200); // parol o'zgarmadi
      expect((await reset(token, NEW_PASSWORD)).status).toBe(200);
    });

    it("muddati o'tgan, noto'g'ri formatdagi va o'ylab topilgan tokenlar rad etiladi", async () => {
      const a = await registerFarmer(t.http);
      const { token } = await getResetToken(a.phone);
      expect((await reset('qisqa', NEW_PASSWORD)).status).toBe(400);
      expect((await reset(generateResetToken(), NEW_PASSWORD)).status).toBe(400); // formati to'g'ri, lekin bazada yo'q
      expect((await t.http().post('/auth/reset-password').send({ resetToken: { $ne: '' }, newPassword: NEW_PASSWORD })).status).toBe(400);

      await t.prisma.passwordReset.updateMany({ where: { userId: a.user.id }, data: { resetTokenExpiresAt: new Date(Date.now() - 1000) } });
      const res = await reset(token, NEW_PASSWORD);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/yaroqsiz yoki muddati o'tgan/);
      expect((await login(a.phone, PASSWORD)).status).toBe(200);
    });

    it("tasdiqlanmagan kod bilan token olib bo'lmaydi: faqat verify'dan o'tgan qator tokenga ega", async () => {
      const a = await registerFarmer(t.http);
      await forgot(a.phone);
      const [row] = await rows(a.user.id);
      expect(row.resetTokenHash).toBeNull();
    });

    it("parallel 5 ta so'rov: faqat bittasi parolni o'zgartiradi", async () => {
      const a = await registerFarmer(t.http);
      const { token } = await getResetToken(a.phone);
      const passwords = ['Parol-aaa-111', 'Parol-bbb-222', 'Parol-ccc-333', 'Parol-ddd-444', 'Parol-eee-555'];
      const results = await Promise.all(passwords.map((p) => reset(token, p)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).tokenVersion).toBe(1);
      const winners = await Promise.all(passwords.map(async (p) => (await login(a.phone, p)).status === 200));
      expect(winners.filter(Boolean)).toHaveLength(1);
    });

    it("tiklangach boshqa ochiq kodlar ham bekor bo'ladi", async () => {
      const a = await registerFarmer(t.http);
      const { token } = await getResetToken(a.phone);
      skipCooldown();
      const lateCode = (await forgot(a.phone)).body.devCode; // yangi kod so'ralgach eski token ham bekor bo'ladi
      expect((await reset(token, NEW_PASSWORD)).status).toBe(400); // yangi kod so'ralgach eski token yaroqsiz
      const t2 = (await verify(a.phone, lateCode)).body.resetToken;
      expect((await reset(t2, NEW_PASSWORD)).status).toBe(200);
      expect((await t.prisma.passwordReset.findMany({ where: { userId: a.user.id, usedAt: null } }))).toHaveLength(0);
    });

    it("faolsizlantirilgan akkaunt tiklay olmaydi", async () => {
      const a = await registerFarmer(t.http);
      const { token } = await getResetToken(a.phone);
      await t.prisma.user.update({ where: { id: a.user.id }, data: { isActive: false } });
      expect((await reset(token, NEW_PASSWORD)).status).toBe(400);
    });

    it("har bir foydalanuvchining tokeni faqat o'z parolini o'zgartiradi", async () => {
      const a = await registerFarmer(t.http);
      const b = await registerMarket(t.http);
      const { token } = await getResetToken(a.phone);
      await reset(token, NEW_PASSWORD);
      expect((await login(b.phone, PASSWORD)).status).toBe(200); // boshqa akkaunt tegilmagan
    });
  });

  describe("ro'yxatdan o'tishda parol siyosati", () => {
    it("zaif parol bilan ro'yxatdan o'tib bo'lmaydi; kuchli parol bilan mumkin", async () => {
      const base = { fullName: 'Ali Valiyev', farmName: 'Ali Agro', region: 'Samarqand', district: 'Urgut' };
      for (const password of ['12345678', 'abcdefgh', 'Password123', 'short1']) {
        const res = await t.http().post('/auth/farmer/register').send({ ...base, phone: nextPhone(), password });
        expect(res.status).toBe(400);
      }
      const ok = await t.http().post('/auth/farmer/register').send({ ...base, phone: nextPhone(), password: NEW_PASSWORD });
      expect(ok.status).toBe(201);
    });
  });

  describe('eski tokenlar (tokenVersion)', () => {
    it("tv maydonsiz (yangilanishdan oldin berilgan) token versiya 0 da yaroqli, parol o'zgargach yaroqsiz", async () => {
      const a = await registerFarmer(t.http);
      const legacy = t.app.get(JwtService).sign({ sub: a.user.id, role: 'FARMER' }); // tv yo'q
      expect((await me(legacy)).status).toBe(200);
      await change(a, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect((await me(legacy)).status).toBe(401);
    });

    it("tokenga qo'lda yozilgan yuqori tv ham o'tmaydi", async () => {
      const a = await registerFarmer(t.http);
      const forged = t.app.get(JwtService).sign({ sub: a.user.id, role: 'FARMER', tv: 5 });
      expect((await me(forged)).status).toBe(401);
    });
  });
});

describe('Parol: rate-limit (e2e)', () => {
  async function withApp(env: Record<string, string>, fn: (t: TestApp) => Promise<void>) {
    const t = await bootApp(env);
    const sms = jest.spyOn(SimulatedSmsProvider.prototype, 'send').mockResolvedValue(undefined);
    try {
      await resetDb(t.prisma);
      await fn(t);
    } finally {
      sms.mockRestore();
      await t.close();
    }
  }
  const forgot = (t: TestApp, phone: string) => t.http().post('/auth/forgot-password').send({ phone });
  const verify = (t: TestApp, phone: string, code: string) => t.http().post('/auth/verify-reset-code').send({ phone, code });

  it("kodni qayta so'rash kutish muddati bilan cheklanadi (429, Retry-After), raqam mavjud bo'lmasa ham xuddi shunday", () =>
    withApp({ OTP_RESEND_COOLDOWN_SECONDS: '30' }, async (t) => {
      const a = await registerFarmer(t.http);
      expect((await forgot(t, a.phone)).status).toBe(200);
      const again = await forgot(t, a.phone);
      expect(again.status).toBe(429);
      expect(Number(again.headers['retry-after'])).toBeGreaterThan(0);
      expect(again.body.message).toMatch(/soniyadan keyin/);

      const ghost = nextPhone();
      expect((await forgot(t, ghost)).status).toBe(200);
      expect((await forgot(t, ghost)).status).toBe(429); // mavjud bo'lmagan raqam ham xuddi shunday cheklanadi
    }));

  it("bir raqamga soatiga ko'pi bilan N ta kod: SMS 'bombasi'dan himoya", () =>
    withApp({ THROTTLE_FORGOT_PHONE_LIMIT: '2', OTP_RESEND_COOLDOWN_SECONDS: '5' }, async (t) => {
      const a = await registerFarmer(t.http);
      const realNow = Date.now;
      let offset = 0;
      const spy = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
      try {
        const codes: number[] = [];
        for (let i = 0; i < 3; i++) {
          codes.push((await forgot(t, a.phone)).status);
          offset += 6000; // kutish muddatidan (5 s) keyin, soatlik chegara ichida
        }
        expect(codes).toEqual([200, 200, 429]);
      } finally {
        spy.mockRestore();
      }
    }));

  it("bitta IP'dan ko'p raqamga kod so'rash cheklanadi", () =>
    withApp({ THROTTLE_FORGOT_IP_LIMIT: '3' }, async (t) => {
      const codes: number[] = [];
      for (let i = 0; i < 4; i++) codes.push((await forgot(t, nextPhone())).status);
      expect(codes).toEqual([200, 200, 200, 429]);
    }));

  it("kodni terib ko'rish raqam bo'yicha cheklanadi: limitdan keyin to'g'ri kod ham 429", () =>
    withApp({ THROTTLE_VERIFY_PHONE_LIMIT: '3', OTP_MAX_ATTEMPTS: '10' }, async (t) => {
      const a = await registerFarmer(t.http);
      const code = (await forgot(t, a.phone)).body.devCode as string;
      const wrong = code === '111111' ? '222222' : '111111';
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await verify(t, a.phone, wrong)).status);
      expect(codes).toEqual([400, 400, 400]);
      const blocked = await verify(t, a.phone, code);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(60);
    }));

  it("kodni tekshirish IP bo'yicha ham cheklanadi (turli raqamlarni sinab ko'rish)", () =>
    withApp({ THROTTLE_VERIFY_IP_LIMIT: '3' }, async (t) => {
      const codes: number[] = [];
      for (let i = 0; i < 4; i++) codes.push((await verify(t, nextPhone(), '123456')).status);
      expect(codes).toEqual([400, 400, 400, 429]);
    }));

  it("tiklash tokenini terib ko'rish cheklanadi", () =>
    withApp({ THROTTLE_RESET_LIMIT: '3' }, async (t) => {
      const codes: number[] = [];
      for (let i = 0; i < 4; i++) {
        codes.push((await t.http().post('/auth/reset-password').send({ resetToken: generateResetToken(), newPassword: NEW_PASSWORD })).status);
      }
      expect(codes).toEqual([400, 400, 400, 429]);
    }));

  it("parolni o'zgartirishda joriy parolni terib ko'rish foydalanuvchi bo'yicha to'xtatiladi", () =>
    withApp({ THROTTLE_CHANGE_PASSWORD_LIMIT: '3' }, async (t) => {
      const a = await registerFarmer(t.http);
      const attempt = (password: string) =>
        t.http().post('/auth/change-password').set('Authorization', bearer(a)).send({ currentPassword: password, newPassword: NEW_PASSWORD });
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await attempt('wrongpass1')).status);
      expect(codes).toEqual([400, 400, 400]);
      const blocked = await attempt(PASSWORD); // to'g'ri joriy parol ham o'tmaydi
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(60);
      expect((await t.http().post('/auth/login').send({ phone: a.phone, password: PASSWORD })).status).toBe(200); // parol o'zgarmagan
    }));

  it("soxta token bilan boshqa foydalanuvchining hisobini to'ldirib bo'lmaydi", () =>
    withApp({ THROTTLE_CHANGE_PASSWORD_LIMIT: '3' }, async (t) => {
      const victim = await registerFarmer(t.http);
      const forged = new JwtService({ secret: 'hujumchi-kaliti-hujumchi-kaliti-12345' }).sign({ sub: victim.user.id, role: 'FARMER', tv: 0 });
      const attacker: number[] = [];
      for (let i = 0; i < 5; i++) {
        attacker.push((await t.http().post('/auth/change-password').set('Authorization', `Bearer ${forged}`).send({ currentPassword: 'x', newPassword: NEW_PASSWORD })).status);
      }
      expect(attacker).toEqual([401, 401, 401, 429, 429]); // hujumchi o'z IP chegarasiga uriladi
      // jabrlanuvchining hisobi (user:<id>) tegilmagan: o'z tokeni bilan ishlay oladi
      const ok = await t.http().post('/auth/change-password').set('Authorization', bearer(victim)).send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect([200, 429]).toContain(ok.status);
    }));
});

describe('Parol: production sozlamalari (e2e)', () => {
  it("production'da javobda kod yo'q (devCode faqat development/test'da); SMS esa yuboriladi", async () => {
    const t = await bootApp({ NODE_ENV: 'production', CORS_ORIGINS: 'https://agrargo.uz' });
    const sms = jest.spyOn(SimulatedSmsProvider.prototype, 'send').mockResolvedValue(undefined);
    try {
      await resetDb(t.prisma);
      const a = await registerFarmer(t.http);
      const res = await t.http().post('/auth/forgot-password').send({ phone: a.phone });
      expect(res.status).toBe(200);
      expect(res.body.devCode).toBeUndefined();
      await flush();
      expect(sms).toHaveBeenCalledTimes(1);
      const code = /(\d{6})/.exec(sms.mock.calls[0][1] as string)![1];
      expect(JSON.stringify(res.body)).not.toContain(code);

      // mavjud va mavjud bo'lmagan raqam javoblari production'da aynan bir xil shaklda
      const ghost = await t.http().post('/auth/forgot-password').send({ phone: nextPhone() });
      expect(Object.keys(ghost.body).sort()).toEqual(Object.keys(res.body).sort());
      expect(ghost.body).toEqual(res.body);

      // kod SMS'dan olinib to'liq oqim ishlaydi
      const verified = await t.http().post('/auth/verify-reset-code').send({ phone: a.phone, code });
      expect(verified.status).toBe(200);
    } finally {
      sms.mockRestore();
      await t.close();
    }
  });

  it("production'da simulyatsiya qilingan SMS ochiq ruxsatsiz ko'tarilmaydi", async () => {
    await expect(
      bootApp({ NODE_ENV: 'production', CORS_ORIGINS: 'https://agrargo.uz', SMS_ALLOW_SIMULATION: 'false' }),
    ).rejects.toThrow(/simulyatsiya qilingan SMS/);
  });
});
