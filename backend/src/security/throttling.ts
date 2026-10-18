import { ExecutionContext } from '@nestjs/common';
import { ThrottlerOptions } from '@nestjs/throttler';
import * as jwt from 'jsonwebtoken';
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

/**
 * Tizimga kirgan foydalanuvchi bo'yicha sanash (parolni o'zgartirishda joriy parolni terib ko'rishdan himoya).
 * Guard JWT tekshiruvidan oldin ishlagani uchun token imzosi shu yerda tekshiriladi: soxta token bilan
 * boshqa foydalanuvchining hisobini to'ldirib bo'lmaydi (tekshiruvdan o'tmasa IP bo'yicha sanaladi).
 */
export const userTracker = (jwtSecret: string) => (req: Record<string, any>): string => {
  const match = /^Bearer (.+)$/i.exec(String(req.headers?.authorization ?? ''));
  if (match) {
    try {
      const payload = jwt.verify(match[1], jwtSecret, { algorithms: ['HS256'] }) as { sub?: unknown };
      if (typeof payload.sub === 'string') return `user:${payload.sub}`;
    } catch {
      /* yaroqsiz/muddati o'tgan token: IP bo'yicha */
    }
  }
  return `ip:${req.ip}`;
};

export type ThrottleEnv = Pick<AppEnv,
  | 'JWT_SECRET' | 'OTP_RESEND_COOLDOWN_SECONDS'
  | 'THROTTLE_DEFAULT_LIMIT' | 'THROTTLE_LOGIN_IP_LIMIT' | 'THROTTLE_LOGIN_PHONE_LIMIT'
  | 'THROTTLE_REGISTER_LIMIT' | 'THROTTLE_UPLOAD_LIMIT' | 'THROTTLE_BOOKING_LIMIT' | 'THROTTLE_PAYMENT_LIMIT'
  | 'THROTTLE_FORGOT_IP_LIMIT' | 'THROTTLE_FORGOT_PHONE_LIMIT' | 'THROTTLE_VERIFY_IP_LIMIT'
  | 'THROTTLE_VERIFY_PHONE_LIMIT' | 'THROTTLE_RESET_LIMIT' | 'THROTTLE_CHANGE_PASSWORD_LIMIT' | 'THROTTLE_LOCATION_LIMIT' | 'THROTTLE_TELEGRAM_LIMIT' | 'THROTTLE_REVIEW_LIMIT' | 'THROTTLE_REVIEW_READ_LIMIT'>;

export function buildThrottlers(env: ThrottleEnv): ThrottlerOptions[] {
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
    // Pul harakati (to'lash, chiqarish, qaytarish): bitta umumiy hisob
    { name: 'payment', ttl: MINUTE, limit: env.THROTTLE_PAYMENT_LIMIT, generateKey: sharedKey, skipIf: onlyFor('payment') },

    // Parolni tiklash: SMS "bombasi" va qimmat SMS xarajatidan himoya (raqam mavjud bo'lsa ham, bo'lmasa ham bir xil hisoblanadi)
    { name: 'forgot-ip', ttl: HOUR, limit: env.THROTTLE_FORGOT_IP_LIMIT, skipIf: onlyFor('forgot') },
    { name: 'forgot-phone', ttl: HOUR, limit: env.THROTTLE_FORGOT_PHONE_LIMIT, getTracker: phoneTracker, skipIf: onlyFor('forgot') },
    { name: 'forgot-cooldown', ttl: env.OTP_RESEND_COOLDOWN_SECONDS * 1000, limit: 1, getTracker: phoneTracker, skipIf: onlyFor('forgot') },
    // Kodni terib ko'rishdan himoya (qo'shimcha ravishda har bir kodda urinishlar soni bazada cheklangan)
    { name: 'verify-ip', ttl: 15 * MINUTE, limit: env.THROTTLE_VERIFY_IP_LIMIT, blockDuration: 15 * MINUTE, skipIf: onlyFor('verify') },
    { name: 'verify-phone', ttl: 15 * MINUTE, limit: env.THROTTLE_VERIFY_PHONE_LIMIT, blockDuration: 30 * MINUTE, getTracker: phoneTracker, skipIf: onlyFor('verify') },
    { name: 'reset-ip', ttl: 15 * MINUTE, limit: env.THROTTLE_RESET_LIMIT, blockDuration: 15 * MINUTE, skipIf: onlyFor('reset') },
    // Joriy parolni terib ko'rishdan himoya: foydalanuvchi bo'yicha (IP almashtirib aylanib o'tib bo'lmaydi)
    // GPS nuqtalari: haydovchi bo'yicha (har 10-15 soniyada bitta; spam va bazani to'ldirishdan himoya)
    { name: 'location', ttl: MINUTE, limit: env.THROTTLE_LOCATION_LIMIT, getTracker: userTracker(env.JWT_SECRET), skipIf: onlyFor('location') },
    // Telegram bog'lash tokenlari: foydalanuvchi bo'yicha soatiga cheklangan
    { name: 'telegram', ttl: HOUR, limit: env.THROTTLE_TELEGRAM_LIMIT, getTracker: userTracker(env.JWT_SECRET), skipIf: onlyFor('telegram') },
    // Sharhlar: yozish foydalanuvchi bo'yicha soatiga, o'qish IP bo'yicha daqiqasiga cheklanadi (spam va scraping)
    { name: 'review', ttl: HOUR, limit: env.THROTTLE_REVIEW_LIMIT, getTracker: userTracker(env.JWT_SECRET), skipIf: onlyFor('review') },
    { name: 'review-read', ttl: MINUTE, limit: env.THROTTLE_REVIEW_READ_LIMIT, skipIf: onlyFor('reviewRead') },
    { name: 'pwchange', ttl: 15 * MINUTE, limit: env.THROTTLE_CHANGE_PASSWORD_LIMIT, blockDuration: 30 * MINUTE, getTracker: userTracker(env.JWT_SECRET), skipIf: onlyFor('pwchange') },
  ];
}
