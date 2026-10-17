import { envWarnings, parseOrigins, validateEnv } from './env.validation';

const STRONG = 'Zk8!vQ2#mL9$xT4@pR7&wN1^cB5*dF3%hJ6';
const base = {
  DATABASE_URL: 'postgresql://u:p@db:5432/agrargo',
  JWT_SECRET: STRONG,
};
const prod = { ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://agrargo.uz', PAYMENT_ALLOW_SIMULATION: 'true' };

describe('validateEnv', () => {
  it('development uchun standart qiymatlarni beradi', () => {
    const env = validateEnv({ ...base, JWT_SECRET: 'dev-secret-123' });
    expect(env).toMatchObject({ NODE_ENV: 'development', PORT: 3000, JWT_EXPIRES_IN: '7d', TRUST_PROXY: 0 });
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.THROTTLE_LOGIN_PHONE_LIMIT).toBe(5);
  });

  it("DATABASE_URL va JWT_SECRET majburiy, barcha xatolar birdan ko'rsatiladi", () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET/);
  });

  it("noto'g'ri NODE_ENV, PORT va JWT_EXPIRES_IN ni rad etadi", () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => validateEnv({ ...base, PORT: '99999' })).toThrow(/PORT/);
    expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => validateEnv({ ...base, JWT_EXPIRES_IN: 'forever' })).toThrow(/JWT_EXPIRES_IN/);
  });

  describe('production', () => {
    it("to'g'ri sozlamani qabul qiladi", () => {
      const env = validateEnv({ ...prod, TRUST_PROXY: '1' });
      expect(env.CORS_ORIGINS).toEqual(['https://agrargo.uz']);
      expect(env.TRUST_PROXY).toBe(1);
    });

    it.each([
      ['qisqa kalit', 'short-secret'],
      ['namuna kalit', 'uzun-tasodifiy-sir-almashtiring'],
      ['bir xil belgilar', 'a'.repeat(40)],
    ])('zaif JWT_SECRET ni rad etadi: %s', (_name, secret) => {
      expect(() => validateEnv({ ...prod, JWT_SECRET: secret })).toThrow(/JWT_SECRET/);
    });

    it('CORS_ORIGINS majburiy', () => {
      expect(() => validateEnv({ ...prod, CORS_ORIGINS: '' })).toThrow(/CORS_ORIGINS majburiy/);
    });

    it("http:// (localhost bo'lmagan) manzilni rad etadi", () => {
      expect(() => validateEnv({ ...prod, CORS_ORIGINS: 'http://agrargo.uz' })).toThrow(/https/);
    });
  });

  describe('CORS_ORIGINS', () => {
    it("'*' ni har doim rad etadi", () => {
      expect(() => validateEnv({ ...base, JWT_SECRET: 'dev-secret-123', CORS_ORIGINS: '*' })).toThrow(/'\*'/);
    });

    it("yo'li bor yoki noto'g'ri manzilni rad etadi", () => {
      expect(() => validateEnv({ ...prod, CORS_ORIGINS: 'https://agrargo.uz/app' })).toThrow(/noto'g'ri manzil/);
      expect(() => validateEnv({ ...prod, CORS_ORIGINS: 'agrargo.uz' })).toThrow(/noto'g'ri manzil/);
    });

    it("bir nechta manzil va oxiridagi '/' ni normallashtiradi", () => {
      expect(parseOrigins(' https://a.uz/ , https://b.uz ,')).toEqual(['https://a.uz', 'https://b.uz']);
    });
  });

  describe("to'lov sozlamalari", () => {
    it("standart qiymatlar: simulyatsiya, 72 soat, development'da ruxsat", () => {
      const env = validateEnv({ ...base, JWT_SECRET: 'dev-secret-123' });
      expect(env).toMatchObject({ PAYMENT_PROVIDER: 'simulated', PAYMENT_ALLOW_SIMULATION: false, PAYMENT_RELEASE_GRACE_HOURS: 72, THROTTLE_PAYMENT_LIMIT: 20 });
    });

    it("production'da simulyatsiya ochiq ruxsatsiz rad etiladi", () => {
      expect(() => validateEnv({ ...prod, PAYMENT_ALLOW_SIMULATION: undefined })).toThrow(/simulyatsiya/);
      expect(() => validateEnv({ ...prod, PAYMENT_ALLOW_SIMULATION: 'false' })).toThrow(/PAYMENT_ALLOW_SIMULATION=true/);
      expect(validateEnv(prod).PAYMENT_ALLOW_SIMULATION).toBe(true);
    });

    it("noma'lum provayder, noto'g'ri bayroq va muddatni rad etadi", () => {
      expect(() => validateEnv({ ...base, JWT_SECRET: 'dev-secret-123', PAYMENT_PROVIDER: 'payme' })).toThrow(/PAYMENT_PROVIDER/);
      expect(() => validateEnv({ ...base, JWT_SECRET: 'dev-secret-123', PAYMENT_ALLOW_SIMULATION: 'maybe' })).toThrow(/PAYMENT_ALLOW_SIMULATION/);
      expect(() => validateEnv({ ...base, JWT_SECRET: 'dev-secret-123', PAYMENT_RELEASE_GRACE_HOURS: '-1' })).toThrow(/PAYMENT_RELEASE_GRACE_HOURS/);
      expect(validateEnv({ ...base, JWT_SECRET: 'dev-secret-123', PAYMENT_RELEASE_GRACE_HOURS: '0' }).PAYMENT_RELEASE_GRACE_HOURS).toBe(0);
    });
  });

  it("throttle chegaralarini sozlash mumkin va noto'g'ri qiymat rad etiladi", () => {
    expect(validateEnv({ ...base, JWT_SECRET: 'dev-secret-123', THROTTLE_LOGIN_PHONE_LIMIT: '3' }).THROTTLE_LOGIN_PHONE_LIMIT).toBe(3);
    expect(() => validateEnv({ ...base, JWT_SECRET: 'dev-secret-123', THROTTLE_LOGIN_PHONE_LIMIT: '0' })).toThrow(/THROTTLE_LOGIN_PHONE_LIMIT/);
  });
});

describe('envWarnings', () => {
  it('namuna kalit va bo‘sh CORS uchun development’da ogohlantiradi', () => {
    const env = validateEnv({ ...base, JWT_SECRET: 'uzun-tasodifiy-sir-almashtiring' });
    expect(envWarnings(env)).toHaveLength(3); // JWT, CORS va to'lov simulyatsiyasi
  });

  it("production'da faqat to'lov simulyatsiyasi haqida ogohlantiradi", () => {
    const warnings = envWarnings(validateEnv(prod));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/simulyatsiya/);
  });
});
