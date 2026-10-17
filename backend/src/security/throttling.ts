import { ExecutionContext } from '@nestjs/common';
import { ThrottlerOptions } from '@nestjs/throttler';
import { AppEnv } from '../config/env.validation';
import { THROTTLE_PROFILE_KEY, ThrottleProfileName } from './throttle-profile';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const profileOf = (ctx: ExecutionContext): string | undefined =>
  Reflect.getMetadata(THROTTLE_PROFILE_KEY, ctx.getHandler());

// Faqat tegishli profil belgilangan marshrutlarda ishlaydi, boshqalarida o'tkazib yuboriladi
const onlyFor = (name: ThrottleProfileName) => (ctx: ExecutionContext) => profileOf(ctx) !== name;

/** Login uchun urinishlar telefon raqam bo'yicha sanaladi: turli IP'dan parol terish ham to'xtatiladi. */
export const phoneTracker = (req: Record<string, any>): string => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.replace(/\s/g, '').slice(0, 20) : '';
  return phone ? `phone:${phone}` : `ip:${req.ip}`;
};

// Barcha rol endpointlari bitta umumiy hisobda sanaladi (fermer + haydovchi + market = bitta limit)
const sharedKey = (_ctx: ExecutionContext, tracker: string, name: string) => `${name}:${tracker}`;

export function buildThrottlers(env: Pick<AppEnv,
  'THROTTLE_DEFAULT_LIMIT' | 'THROTTLE_LOGIN_IP_LIMIT' | 'THROTTLE_LOGIN_PHONE_LIMIT' |
  'THROTTLE_REGISTER_LIMIT' | 'THROTTLE_UPLOAD_LIMIT' | 'THROTTLE_BOOKING_LIMIT'>): ThrottlerOptions[] {
  return [
    // Hamma marshrutlar: IP bo'yicha umumiy chegara
    { name: 'default', ttl: MINUTE, limit: env.THROTTLE_DEFAULT_LIMIT },
    // Parolni terib ko'rishdan himoya: IP va telefon bo'yicha, limitdan oshsa vaqtincha bloklanadi
    { name: 'login-ip', ttl: 15 * MINUTE, limit: env.THROTTLE_LOGIN_IP_LIMIT, blockDuration: 15 * MINUTE, skipIf: onlyFor('login') },
    { name: 'login-phone', ttl: 15 * MINUTE, limit: env.THROTTLE_LOGIN_PHONE_LIMIT, blockDuration: 30 * MINUTE, getTracker: phoneTracker, skipIf: onlyFor('login') },
    // Ommaviy ro'yxatdan o'tish (spam akkauntlar)
    { name: 'register', ttl: HOUR, limit: env.THROTTLE_REGISTER_LIMIT, generateKey: sharedKey, skipIf: onlyFor('register') },
    // Qimmat amallar
    { name: 'upload', ttl: MINUTE, limit: env.THROTTLE_UPLOAD_LIMIT, skipIf: onlyFor('upload') },
    { name: 'booking', ttl: MINUTE, limit: env.THROTTLE_BOOKING_LIMIT, skipIf: onlyFor('booking') },
  ];
}
