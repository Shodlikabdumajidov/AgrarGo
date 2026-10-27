import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

/** `length` xonali kod (standart 6; muhitda OTP_LENGTH=4): kriptografik tasodifiy (Math.random emas), boshidagi nollar saqlanadi. */
export const generateOtp = (length = 6): string => String(randomInt(0, 10 ** length)).padStart(length, '0');

/**
 * Kod bazada HMAC-SHA256 (server kaliti + raqam bilan bog'langan) ko'rinishida saqlanadi: 6 xonali kod
 * 1 million variantli bo'lgani uchun oddiy xesh bazadan darhol tiklanadi, kalitsiz esa yo'q.
 */
export const hashOtp = (secret: string, phone: string, code: string): string =>
  createHmac('sha256', createHmac('sha256', secret).update('agrargo:otp').digest())
    .update(`${phone}:${code}`)
    .digest('hex');

/** Vaqt bo'yicha tomonlama hujumga qarshi: doimiy vaqtda solishtirish */
export const safeEqualHex = (a: string, b: string): boolean => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

/** Tiklash tokeni: 256 bit tasodifiy, bazada faqat SHA-256 xeshi. */
export const generateResetToken = (): string => randomBytes(32).toString('base64url');
export const hashResetToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export const RESET_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;
