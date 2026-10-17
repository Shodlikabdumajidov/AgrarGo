import { ExecutionContext } from '@nestjs/common';
import { formatWait } from './app-throttler.guard';
import { ThrottleProfile } from './throttle-profile';
import { buildThrottlers, phoneTracker } from './throttling';

const LIMITS = {
  THROTTLE_DEFAULT_LIMIT: 120,
  THROTTLE_LOGIN_IP_LIMIT: 20,
  THROTTLE_LOGIN_PHONE_LIMIT: 5,
  THROTTLE_REGISTER_LIMIT: 10,
  THROTTLE_UPLOAD_LIMIT: 10,
  THROTTLE_BOOKING_LIMIT: 30,
};

// Haqiqiy dekorator bilan belgilangan "marshrut" va uning ExecutionContext'i
function contextWith(profile?: 'login' | 'register' | 'upload' | 'booking'): ExecutionContext {
  class Ctrl {
    handler() {}
  }
  if (profile) ThrottleProfile(profile)(Ctrl.prototype, 'handler', Object.getOwnPropertyDescriptor(Ctrl.prototype, 'handler')!);
  return { getHandler: () => Ctrl.prototype.handler } as unknown as ExecutionContext;
}

describe('buildThrottlers', () => {
  const throttlers = buildThrottlers(LIMITS);
  const byName = (n: string) => throttlers.find((t) => t.name === n)!;
  const skipped = (name: string, profile?: 'login' | 'register' | 'upload' | 'booking') =>
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
