import { bearer, bootApp, nextPhone, PASSWORD, registerFarmer, registerMarket, resetDb, STRONG_SECRET, TestApp } from './helpers';

const login = (t: TestApp, phone: string, password = 'wrongpass1', ip?: string) => {
  const req = t.http().post('/auth/login');
  if (ip) req.set('X-Forwarded-For', ip);
  return req.send({ phone, password });
};

/** Har bir rate-limit testi o'z ilovasida (alohida hisoblagichlar) va faqat kerakli chegara qattiq qilingan holda ishlaydi */
async function withApp(env: Record<string, string>, fn: (t: TestApp) => Promise<void>) {
  const t = await bootApp(env);
  try {
    await resetDb(t.prisma);
    await fn(t);
  } finally {
    await t.close();
  }
}

describe('Rate-limit (e2e)', () => {
  const PHONE_ONLY = { THROTTLE_LOGIN_PHONE_LIMIT: '3' };

  it("bir raqamga ketma-ket noto'g'ri parol: limitdan keyin 429, Retry-After va tushunarli xabar", () =>
    withApp(PHONE_ONLY, async (t) => {
      const phone = nextPhone();
      const codes: number[] = [];
      for (let i = 0; i < 4; i++) codes.push((await login(t, phone)).status);
      expect(codes).toEqual([401, 401, 401, 429]);

      const blocked = await login(t, phone);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(60);
      expect(blocked.body.message).toMatch(/Juda ko'p urinish.*daqiqadan keyin/);
    }));

  it("bloklangan raqam uchun to'g'ri parol ham o'tmaydi (brute-force natija bermaydi)", () =>
    withApp(PHONE_ONLY, async (t) => {
      const a = await registerFarmer(t.http);
      for (let i = 0; i < 3; i++) await login(t, a.phone);
      expect((await login(t, a.phone, PASSWORD)).status).toBe(429);
    }));

  it("bir raqamning bloklanishi boshqa raqamlarga ta'sir qilmaydi", () =>
    withApp(PHONE_ONLY, async (t) => {
      const victim = await registerFarmer(t.http);
      const other = await registerFarmer(t.http);
      for (let i = 0; i < 5; i++) await login(t, victim.phone);
      expect((await login(t, other.phone, PASSWORD)).status).toBe(200);
    }));

  it("raqamni bo'shliqlar bilan yozish orqali limitni aylanib o'tib bo'lmaydi", () =>
    withApp(PHONE_ONLY, async (t) => {
      const phone = nextPhone();
      for (let i = 0; i < 3; i++) await login(t, phone);
      expect((await login(t, phone.replace('+99890', '+998 90 '))).status).toBe(429);
    }));

  it("turli raqamlarni sinab ko'rish (parol spreyi) IP bo'yicha to'xtatiladi", () =>
    withApp({ THROTTLE_LOGIN_IP_LIMIT: '4' }, async (t) => {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await login(t, nextPhone())).status);
      expect(codes).toEqual([401, 401, 401, 401, 429]);
    }));

  it("ro'yxatdan o'tish: limitdan keyin 429 (spam akkauntlarga qarshi)", () =>
    withApp({ THROTTLE_REGISTER_LIMIT: '4' }, async (t) => {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await t.http().post('/auth/farmer/register').send({ phone: 'bad' })).status);
      expect(codes).toEqual([400, 400, 400, 400, 429]);
    }));

  it("ro'yxatdan o'tish limiti rol endpointlari bo'yicha ham ishlaydi (haydovchi va market)", () =>
    withApp({ THROTTLE_REGISTER_LIMIT: '2' }, async (t) => {
      const codes = [
        (await t.http().post('/auth/driver/register').send({})).status,
        (await t.http().post('/auth/market/register').send({})).status,
        (await t.http().post('/auth/driver/register').send({})).status,
      ];
      expect(codes[2]).toBe(429);
    }));

  it("avatar yuklash cheklangan", () =>
    withApp({ THROTTLE_UPLOAD_LIMIT: '2' }, async (t) => {
      const farmer = await registerFarmer(t.http);
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await t.http().post('/profile/avatar').set('Authorization', bearer(farmer))).status);
      expect(codes).toEqual([400, 400, 429]);
    }));

  it("bron yaratish cheklangan", () =>
    withApp({ THROTTLE_BOOKING_LIMIT: '2' }, async (t) => {
      const market = await registerMarket(t.http);
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await t.http().post('/bookings').set('Authorization', bearer(market)).send({})).status);
      expect(codes).toEqual([400, 400, 429]);
    }));

  it('/health cheklovdan ozod (balancer tekshiruvi)', () =>
    withApp({ THROTTLE_DEFAULT_LIMIT: '5' }, async (t) => {
      for (let i = 0; i < 30; i++) expect((await t.http().get('/health')).status).toBe(200);
    }));

  it("umumiy chegara: bir IP'dan haddan tashqari ko'p so'rov to'xtatiladi", () =>
    withApp({ THROTTLE_DEFAULT_LIMIT: '10' }, async (t) => {
      const codes: number[] = [];
      for (let i = 0; i < 12; i++) codes.push((await t.http().get('/marketplace')).status);
      expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
      expect(codes.slice(10)).toEqual([429, 429]);
    }));
});

describe('Rate-limit: proksi ortida (TRUST_PROXY)', () => {
  it("TRUST_PROXY=1 bo'lganda X-Forwarded-For bo'yicha har bir mijoz alohida sanaladi", async () => {
    const t = await bootApp({ TRUST_PROXY: '1', THROTTLE_LOGIN_IP_LIMIT: '2', THROTTLE_LOGIN_PHONE_LIMIT: '100000' });
    try {
      const a1 = [await login(t, nextPhone(), 'x', '10.0.0.1'), await login(t, nextPhone(), 'x', '10.0.0.1'), await login(t, nextPhone(), 'x', '10.0.0.1')];
      expect(a1.map((r) => r.status)).toEqual([401, 401, 429]);
      expect((await login(t, nextPhone(), 'x', '10.0.0.2')).status).toBe(401); // boshqa mijoz ta'sirlanmaydi
    } finally {
      await t.close();
    }
  });

  it("TRUST_PROXY yo'q bo'lsa X-Forwarded-For soxtalashtirib limitni aylanib o'tib bo'lmaydi", async () => {
    const t = await bootApp({ THROTTLE_LOGIN_IP_LIMIT: '2', THROTTLE_LOGIN_PHONE_LIMIT: '100000' });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await login(t, nextPhone(), 'x', `10.9.9.${i}`)).status);
      expect(codes).toEqual([401, 401, 429]);
    } finally {
      await t.close();
    }
  });
});

describe('Xavfsizlik sarlavhalari va CORS (e2e)', () => {
  describe('production konfiguratsiyasi', () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await bootApp({ NODE_ENV: 'production', CORS_ORIGINS: 'https://agrargo.uz,https://www.agrargo.uz' });
    });
    afterAll(async () => { await t.close(); });

    it("ruxsat etilgan origin CORS sarlavhasini oladi, boshqalari olmaydi", async () => {
      const ok = await t.http().get('/marketplace').set('Origin', 'https://agrargo.uz');
      expect(ok.headers['access-control-allow-origin']).toBe('https://agrargo.uz');
      expect(ok.headers['vary']).toMatch(/Origin/);

      for (const origin of ['https://evil.example', 'https://agrargo.uz.evil.example', 'http://agrargo.uz', 'null']) {
        const res = await t.http().get('/marketplace').set('Origin', origin);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      }
    });

    it("preflight: ruxsat etilgan origin uchun metodlar va sarlavhalar, begona origin uchun hech narsa", async () => {
      const ok = await t.http().options('/bookings').set('Origin', 'https://www.agrargo.uz')
        .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,content-type');
      expect(ok.status).toBe(204);
      expect(ok.headers['access-control-allow-origin']).toBe('https://www.agrargo.uz');
      expect(ok.headers['access-control-allow-headers']).toMatch(/Authorization/i);
      expect(ok.headers['access-control-allow-credentials']).toBeUndefined();

      const bad = await t.http().options('/bookings').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    });

    it("helmet sarlavhalari qo'yilgan va X-Powered-By yashirilgan", async () => {
      const res = await t.http().get('/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin'); // avatarlarni boshqa domen ko'ra olishi uchun
    });

    it("xato javoblari stack trace yoki ichki ma'lumot oshkor qilmaydi", async () => {
      const res = await t.http().post('/auth/login').set('Content-Type', 'application/json').send('{"phone": ');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toMatch(/at \w+|node_modules|prisma/i);
    });

    it("yuklangan fayllar ro'yxati ko'rsatilmaydi va yo'l bosib o'tish (traversal) ishlamaydi", async () => {
      for (const path of ['/uploads/', '/uploads/avatars/', '/uploads/..%2fpackage.json', '/uploads/%2e%2e/package.json']) {
        const res = await t.http().get(path);
        expect(res.status).not.toBe(200);
      }
    });
  });

  describe('development konfiguratsiyasi', () => {
    it("CORS_ORIGINS bo'sh bo'lsa hamma origin'ga ruxsat (faqat dev)", async () => {
      const t = await bootApp({ NODE_ENV: 'test', CORS_ORIGINS: '' });
      try {
        const res = await t.http().get('/marketplace').set('Origin', 'http://localhost:8080');
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8080');
      } finally {
        await t.close();
      }
    });
  });
});

describe('Ishga tushishda sozlamalarni tekshirish (e2e)', () => {
  it("production'da zaif JWT_SECRET bilan ilova ko'tarilmaydi", async () => {
    await expect(bootApp({ NODE_ENV: 'production', CORS_ORIGINS: 'https://agrargo.uz', JWT_SECRET: 'qisqa' })).rejects.toThrow(/JWT_SECRET/);
    await expect(bootApp({ NODE_ENV: 'production', CORS_ORIGINS: 'https://agrargo.uz', JWT_SECRET: 'uzun-tasodifiy-sir-almashtiring' })).rejects.toThrow(/JWT_SECRET/);
  });

  it("production'da CORS_ORIGINS bo'sh bo'lsa ko'tarilmaydi", async () => {
    await expect(bootApp({ NODE_ENV: 'production', CORS_ORIGINS: '', JWT_SECRET: STRONG_SECRET })).rejects.toThrow(/CORS_ORIGINS/);
  });

  it("production'da simulyatsiya qilingan to'lov ochiq ruxsatsiz ko'tarilmaydi (haqiqiy pulsiz 'to'lov' bo'lib qolmasligi uchun)", async () => {
    await expect(
      bootApp({ NODE_ENV: 'production', CORS_ORIGINS: 'https://agrargo.uz', JWT_SECRET: STRONG_SECRET, PAYMENT_ALLOW_SIMULATION: 'false' }),
    ).rejects.toThrow(/simulyatsiya/);
  });

  it("DATABASE_URL bo'lmasa ko'tarilmaydi", async () => {
    await expect(bootApp({ DATABASE_URL: 'mysql://x' })).rejects.toThrow(/DATABASE_URL/);
  });

  it("to'g'ri production sozlamasi bilan ko'tariladi va /health ishlaydi", async () => {
    const t = await bootApp({ NODE_ENV: 'production', CORS_ORIGINS: 'https://agrargo.uz', JWT_SECRET: STRONG_SECRET });
    try {
      expect((await t.http().get('/health')).body).toEqual({ status: 'ok', db: 'up' });
    } finally {
      await t.close();
    }
  });
});
