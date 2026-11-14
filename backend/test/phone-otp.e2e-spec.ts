import { PASSWORD, TestApp, bootApp, nextPhone, registerConsumer, resetDb } from './helpers';

describe('SMS OTP: ro\'yxatdan o\'tish va parolni tiklash (send-otp / verify-otp / reset-password) (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp({ REGISTER_OTP_ENFORCE: 'true' }); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const send = (phone: string, purpose = 'REGISTER') => t.http().post('/auth/send-otp').send({ phone, purpose });
  const verify = (phone: string, code: string, purpose = 'REGISTER') => t.http().post('/auth/verify-otp').send({ phone, code, purpose });
  const consumer = (phone: string, extra: Record<string, unknown> = {}) =>
    t.http().post('/auth/consumer/register').send({ phone, password: PASSWORD, fullName: 'Dilnoza Xaridor', region: 'Samarqand', district: 'Siyob', ...extra });
  const cooldown = () => new Promise((r) => setTimeout(r, 5300)); // testlarda qayta yuborish kutishi 5 s
  const wrong = (code: string) => String((Number(code) + 1) % 10000).padStart(4, '0');

  it("send-otp (REGISTER): 4 xonali kod, simulyatsiya rejimida devCode qaytadi; band raqam 409; noto'g'ri purpose/raqam 400", async () => {
    const phone = nextPhone();
    const res = await send(phone);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ otpLength: 4, simulated: true, resendAfterSeconds: expect.any(Number) });
    expect(res.body.devCode).toMatch(/^\d{4}$/);
    const row = await t.prisma.phoneVerification.findFirstOrThrow({ where: { phone } });
    expect(row.codeHash).not.toContain(res.body.devCode); // kod ochiq saqlanmaydi
    await cooldown();
    expect((await registerWithOtp(phone)).status).toBe(201); // keyin band
    await cooldown();
    expect((await send(phone)).status).toBe(409);
    expect((await send(nextPhone(), 'XYZ')).status).toBe(400);
    expect((await send('12345')).status).toBe(400);
  });

  async function registerWithOtp(phone: string) {
    const code = (await send(phone)).body.devCode;
    const otp = await verify(phone, code);
    return consumer(phone, { otpToken: otp.body.otpToken });
  }

  it("ro'yxatdan o'tish OTP'siz rad etiladi; to'g'ri kod -> otpToken -> 201; token bir martalik va faqat shu raqam uchun", async () => {
    const phone = nextPhone();
    expect((await consumer(phone)).status).toBe(400); // token yo'q
    expect((await consumer(phone, { otpToken: 'x'.repeat(43) })).status).toBe(400); // soxta token
    const code = (await send(phone)).body.devCode;
    expect((await verify(phone, wrong(code))).status).toBe(400);
    const ok = await verify(phone, code);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ verified: true });
    expect(ok.body.otpToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // boshqa raqam uchun token yaroqsiz
    expect((await consumer(nextPhone(), { otpToken: ok.body.otpToken })).status).toBe(400);
    const reg = await consumer(phone, { otpToken: ok.body.otpToken });
    expect(reg.status).toBe(201);
    expect(reg.body.user.role).toBe('CONSUMER');
    // qayta ishlatib bo'lmaydi
    await t.prisma.user.deleteMany({ where: { phone } });
    expect((await consumer(phone, { otpToken: ok.body.otpToken })).status).toBe(400);
  });

  it("urinishlar chegarasi: 5 ta noto'g'ri kodday keyin to'g'ri kod ham o'tmaydi; yangi kod eskisini bekor qiladi", async () => {
    const phone = nextPhone();
    const code = (await send(phone)).body.devCode;
    for (let i = 0; i < 5; i++) expect((await verify(phone, wrong(code))).status).toBe(400);
    expect((await verify(phone, code)).status).toBe(400);
    await cooldown();
    const code2 = (await send(phone)).body.devCode;
    expect((await t.prisma.phoneVerification.count({ where: { phone, usedAt: null } }))).toBe(1);
    expect((await verify(phone, code2)).status).toBe(200);
  });

  it("OTP majburiyligi o'chirilgan bo'lsa (eski oqim) token'siz ham ro'yxatdan o'tiladi", async () => {
    const t2 = await bootApp({ REGISTER_OTP_ENFORCE: 'false' });
    try {
      const a = await registerConsumer(t2.http);
      expect(a.token).toBeTruthy();
      // token berilsa baribir tekshiriladi
      const bad = await t2.http().post('/auth/consumer/register').send({ phone: nextPhone(), password: PASSWORD, fullName: 'Dilnoza Xaridor', region: 'Samarqand', district: 'Siyob', otpToken: 'x'.repeat(43) });
      expect(bad.status).toBe(400);
    } finally { await t2.close(); }
  });

  it("parolni tiklash (RESET): send-otp -> verify-otp (resetToken) -> reset-password -> yangi parol bilan kirish; noma'lum raqam bir xil javob, devCode yo'q", async () => {
    const phone = nextPhone();
    expect((await registerWithOtp(phone)).status).toBe(201);
    const acc = { phone };
    await cooldown();
    const sent = await send(acc.phone, 'RESET');
    expect(sent.status).toBe(200);
    expect(sent.body.devCode).toMatch(/^\d{4}$/);
    expect(sent.body.otpLength).toBe(4);
    const unknown = await send(nextPhone(), 'RESET');
    expect(unknown.status).toBe(200);
    expect(unknown.body.devCode).toBeUndefined();
    expect(unknown.body.message).toBe(sent.body.message);
    expect((await verify(acc.phone, wrong(sent.body.devCode), 'RESET')).status).toBe(400);
    const ok = await verify(acc.phone, sent.body.devCode, 'RESET');
    expect(ok.status).toBe(200);
    expect(ok.body.verified).toBe(true);
    const reset = await t.http().post('/auth/reset-password').send({ resetToken: ok.body.resetToken, newPassword: 'yangiParol123' });
    expect(reset.status).toBe(200);
    expect((await t.http().post('/auth/login').send({ phone: acc.phone, password: 'yangiParol123' })).status).toBe(200);
    expect((await t.http().post('/auth/login').send({ phone: acc.phone, password: PASSWORD })).status).toBe(401);
    // token bir martalik
    expect((await t.http().post('/auth/reset-password').send({ resetToken: ok.body.resetToken, newPassword: 'boshqaParol123' })).status).toBe(400);
  });
});
