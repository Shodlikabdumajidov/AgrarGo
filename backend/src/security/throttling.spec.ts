import { ExecutionContext } from '@nestjs/common';
import { formatWait } from './app-throttler.guard';
import { ThrottleProfile } from './throttle-profile';
import * as jwt from 'jsonwebtoken';
import { buildThrottlers, phoneTracker, userTracker } from './throttling';

const LIMITS = {
  THROTTLE_DEFAULT_LIMIT: 120,
  THROTTLE_LOGIN_IP_LIMIT: 20,
  THROTTLE_LOGIN_PHONE_LIMIT: 5,
  THROTTLE_REGISTER_LIMIT: 10,
  THROTTLE_UPLOAD_LIMIT: 10,
  THROTTLE_BOOKING_LIMIT: 30,
  THROTTLE_PAYMENT_LIMIT: 20,
  THROTTLE_FORGOT_IP_LIMIT: 5,
  THROTTLE_FORGOT_PHONE_LIMIT: 3,
  THROTTLE_VERIFY_IP_LIMIT: 20,
  THROTTLE_VERIFY_PHONE_LIMIT: 10,
  THROTTLE_RESET_LIMIT: 10,
  THROTTLE_CHANGE_PASSWORD_LIMIT: 5,
  THROTTLE_LOCATION_LIMIT: 12,
  THROTTLE_TELEGRAM_LIMIT: 10,
  THROTTLE_REVIEW_LIMIT: 5,
  THROTTLE_REVIEW_READ_LIMIT: 60,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  JWT_SECRET: 'unit-test-secret-unit-test-secret-123',
};

// Haqiqiy dekorator bilan belgilangan "marshrut" va uning ExecutionContext'i
function contextWith(profile?: 'login' | 'register' | 'upload' | 'booking' | 'payment' | 'forgot' | 'verify' | 'reset' | 'pwchange' | 'location'): ExecutionContext {
  class Ctrl {
    handler() {}
  }
  if (profile) ThrottleProfile(profile)(Ctrl.prototype, 'handler', Object.getOwnPropertyDescriptor(Ctrl.prototype, 'handler')!);
  return { getHandler: () => Ctrl.prototype.handler } as unknown as ExecutionContext;
}

describe('buildThrottlers', () => {
  const throttlers = buildThrottlers(LIMITS);
  const byName = (n: string) => throttlers.find((t) => t.name === n)!;
  type Profile = 'login' | 'register' | 'upload' | 'booking' | 'payment' | 'forgot' | 'verify' | 'reset' | 'pwchange' | 'location';
  const skipped = (name: string, profile?: Profile) =>
    byName(name).skipIf!(contextWith(profile));

  it("umumiy chegara har doim ishlaydi, qattiq chegaralar faqat o'z marshrutida", () => {
    expect(byName('default').skipIf).toBeUndefined();
    expect(skipped('login-ip', 'login')).toBe(false);
    expect(skipped('login-ip')).toBe(true);
    expect(skipped('login-phone', 'login')).toBe(false);
    expect(skipped('login-phone', 'register')).toBe(true);
    expect(skipped('register', 'register')).toBe(false);
    expect(skipped('register', 'login')).toBe(true);
    expect(skipped('upload', 'upload')).toBe(false);
    expect(skipped('booking', 'booking')).toBe(false);
  });

  it("ro'yxatdan o'tish endpointlari (fermer/haydovchi/market) bitta umumiy hisobda sanaladi", () => {
    const gen = byName('register').generateKey!;
    const key = (handler: string) =>
      gen({ getHandler: () => ({ name: handler }) } as unknown as ExecutionContext, 'ip:1.2.3.4', 'register');
    expect(key('registerFarmer')).toBe(key('registerDriver'));
    expect(key('registerFarmer')).toBe(key('registerMarket'));
    expect(gen({} as ExecutionContext, 'ip:5.6.7.8', 'register')).not.toBe(key('registerFarmer'));
  });

  it("pul harakatlari (init/release/refund) bitta umumiy hisobda sanaladi", () => {
    const t = byName('payment');
    expect(skipped('payment', 'payment')).toBe(false);
    expect(skipped('payment', 'booking')).toBe(true);
    const key = (h: string) => t.generateKey!({ getHandler: () => ({ name: h }) } as unknown as ExecutionContext, 'ip:1.1.1.1', 'payment');
    expect(key('init')).toBe(key('refund'));
    expect(t.limit).toBe(20);
  });

  it("parolni tiklash chegaralari faqat o'z marshrutlarida ishlaydi va raqam bo'yicha sanaladi", () => {
    for (const name of ['forgot-ip', 'forgot-phone', 'forgot-cooldown']) {
      expect(skipped(name, 'forgot')).toBe(false);
      expect(skipped(name, 'login')).toBe(true);
    }
    for (const name of ['verify-ip', 'verify-phone']) {
      expect(skipped(name, 'verify')).toBe(false);
      expect(skipped(name, 'forgot')).toBe(true);
    }
    expect(skipped('reset-ip', 'reset')).toBe(false);
    expect(skipped('pwchange', 'pwchange')).toBe(false);
    expect(skipped('pwchange', 'reset')).toBe(true);
    expect(byName('forgot-phone').getTracker).toBe(phoneTracker);
    expect(byName('forgot-cooldown')).toMatchObject({ limit: 1, ttl: 60_000 });
    expect(byName('forgot-phone')).toMatchObject({ limit: 3, ttl: 60 * 60_000 });
    expect(byName('verify-phone')).toMatchObject({ limit: 10, blockDuration: 30 * 60_000 });
    expect(byName('pwchange')).toMatchObject({ limit: 5, blockDuration: 30 * 60_000 });
    expect(byName('location')).toMatchObject({ limit: 12 });
    expect(skipped('location', 'location')).toBe(false);
    expect(skipped('location', 'login')).toBe(true);
  });

  it('login urinishlari limitdan oshsa vaqtincha bloklanadi', () => {
    expect(byName('login-phone')).toMatchObject({ limit: 5, ttl: 15 * 60_000, blockDuration: 30 * 60_000 });
    expect(byName('login-ip').blockDuration).toBe(15 * 60_000);
  });
});

describe('phoneTracker', () => {
  it("login urinishlarini telefon raqam bo'yicha guruhlaydi", () => {
    expect(phoneTracker({ body: { phone: '+998901234567' }, ip: '1.1.1.1' })).toBe('phone:+998901234567');
    expect(phoneTracker({ body: { phone: '+998 90 123 45 67' }, ip: '2.2.2.2' })).toBe('phone:+998901234567');
  });

  it("telefon bo'lmasa yoki matn bo'lmasa IP bo'yicha", () => {
    expect(phoneTracker({ body: {}, ip: '3.3.3.3' })).toBe('ip:3.3.3.3');
    expect(phoneTracker({ body: { phone: { $ne: null } }, ip: '3.3.3.3' })).toBe('ip:3.3.3.3');
    expect(phoneTracker({ ip: '3.3.3.3' })).toBe('ip:3.3.3.3');
  });

  it("juda uzun qiymat kesiladi (xotira to'ldirish hujumi)", () => {
    expect(phoneTracker({ body: { phone: '9'.repeat(10_000) } }).length).toBeLessThan(30);
  });
});

describe('formatWait', () => {
  it.each([
    [1, '1 soniya'],
    [45, '45 soniya'],
    [60, '1 daqiqa'],
    [1800, '30 daqiqa'],
    [3601, '2 soat'],
    [0, '1 soniya'],
  ])('%s s -> %s', (s, text) => expect(formatWait(s)).toBe(text));
});

describe('userTracker', () => {
  const SECRET = LIMITS.JWT_SECRET;
  const track = userTracker(SECRET);
  const req = (authorization?: string) => ({ headers: authorization ? { authorization } : {}, ip: '9.9.9.9' });

  it("imzosi to'g'ri token bo'lsa foydalanuvchi bo'yicha sanaydi", () => {
    const token = jwt.sign({ sub: 'user-1', role: 'FARMER' }, SECRET, { expiresIn: '1h' });
    expect(track(req(`Bearer ${token}`))).toBe('user:user-1');
  });

  it("soxta imzo, boshqa kalit, 'none' algoritm va muddati o'tgan token IP bo'yicha sanaladi (boshqa hisobni to'ldirib bo'lmaydi)", () => {
    const other = jwt.sign({ sub: 'victim' }, 'boshqa-kalit-boshqa-kalit-boshqa-kalit');
    const expired = jwt.sign({ sub: 'victim' }, SECRET, { expiresIn: '-10s' });
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'victim' })}.`;
    const unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'victim' })}.AAAA`;
    for (const t of [other, expired, none, unsigned, 'abc', '']) {
      expect(track(req(`Bearer ${t}`))).toBe('ip:9.9.9.9');
    }
    expect(track(req())).toBe('ip:9.9.9.9');
  });
});
