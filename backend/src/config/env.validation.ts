// Muhit o'zgaruvchilarini ishga tushishda tekshiradi: noto'g'ri sozlama bilan server umuman ko'tarilmaydi.

export type NodeEnv = 'development' | 'production' | 'test';

export interface AppEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  CORS_ORIGINS: string[];
  TRUST_PROXY: number;
  THROTTLE_DEFAULT_LIMIT: number;
  THROTTLE_LOGIN_IP_LIMIT: number;
  THROTTLE_LOGIN_PHONE_LIMIT: number;
  THROTTLE_REGISTER_LIMIT: number;
  THROTTLE_UPLOAD_LIMIT: number;
  THROTTLE_BOOKING_LIMIT: number;
  THROTTLE_PAYMENT_LIMIT: number;
  PAYMENT_PROVIDER: 'simulated';
  PAYMENT_ALLOW_SIMULATION: boolean;
  PAYMENT_RELEASE_GRACE_HOURS: number;
  WAREHOUSE_FEE_PERCENT: number;
  DELIVERY_BASE_FEE: number;
  DELIVERY_FEE_PER_KM: number;
  DELIVERY_FEE_PER_TON_KM: number;
  SERVICE_FEE_PERCENT: number;
  LOCAL_HUB_FEE_PERCENT: number;
  LOCAL_HUB_FEE_MIN: number;
  LOCAL_COURIER_FEE: number;
  LOCAL_SERVICE_FEE_PERCENT: number;
  LOCAL_SERVICE_FEE_MIN: number;
  LOCAL_MIN_ORDER_KG: number;
  LOCAL_MAX_ORDER_KG: number;
  CASHBACK_BUYER_PERCENT: number;
  CASHBACK_FARMER_PERCENT: number;
  CASHBACK_DRIVER_PERCENT: number;
  CASHBACK_MAX_SPEND_PERCENT: number;
  DOCK_UTC_OFFSET_MIN: number;
  DOCK_MAX_DAYS_AHEAD: number;
  DOCK_MAX_ACTIVE_PER_USER: number;
  DOCK_GRACE_MIN: number;
  SMS_PROVIDER: 'simulated';
  SMS_ALLOW_SIMULATION: boolean;
  EBOL_OTP_TTL_MIN: number;
  EBOL_ENFORCE: boolean;
  PIN_ENFORCE: boolean;
  OTP_TTL_SECONDS: number;
  OTP_LENGTH: number;
  REGISTER_OTP_ENFORCE: boolean;
  OTP_MAX_ATTEMPTS: number;
  OTP_RESEND_COOLDOWN_SECONDS: number;
  RESET_TOKEN_TTL_SECONDS: number;
  THROTTLE_FORGOT_IP_LIMIT: number;
  THROTTLE_FORGOT_PHONE_LIMIT: number;
  THROTTLE_VERIFY_IP_LIMIT: number;
  THROTTLE_VERIFY_PHONE_LIMIT: number;
  THROTTLE_RESET_LIMIT: number;
  THROTTLE_CHANGE_PASSWORD_LIMIT: number;
  THROTTLE_LOCATION_LIMIT: number;
  LOCATION_ALLOW_SIMULATION: boolean;
  KYC_ALLOW_SIMULATION: boolean;
  TELEGRAM_BOT_TOKEN: string; // bo'sh = bot o'chiq
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_POLLING: boolean;
  TELEGRAM_WEBHOOK_URL: string; // bo'sh = webhook o'chiq (long polling); to'liq https:// manzil
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_WEB_URL: string; // xabardagi «Kabinetni ochish» tugmasi uchun sayt manzili (https)
  TELEGRAM_LINK_TTL_SECONDS: number;
  THROTTLE_TELEGRAM_LIMIT: number;
  THROTTLE_REVIEW_LIMIT: number;
  THROTTLE_REVIEW_READ_LIMIT: number;
  REVIEWS_AUTO_APPROVE: boolean;
}

// Namuna (.env.example) va keng tarqalgan zaif qiymatlar production'da qabul qilinmaydi
const WEAK_SECRETS = [
  'uzun-tasodifiy-sir-almashtiring',
  'changeme',
  'change-me',
  'secret',
  'jwt_secret',
  'jwtsecret',
  'password',
  'agrargo',
  'qwerty',
];

export const MIN_PROD_SECRET_LENGTH = 32;

const intInRange = (raw: unknown, name: string, def: number, min: number, max: number, errors: string[]) => {
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push(`${name} ${min} dan ${max} gacha butun son bo'lishi kerak (hozir: "${raw}")`);
    return def;
  }
  return n;
};

function isValidOrigin(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === value;
  } catch {
    return false;
  }
}

export function parseOrigins(raw: unknown): string[] {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function validateEnv(raw: Record<string, unknown>): AppEnv & Record<string, unknown> {
  const errors: string[] = [];

  const nodeEnv = (raw.NODE_ENV === undefined || raw.NODE_ENV === '' ? 'development' : raw.NODE_ENV) as string;
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    errors.push(`NODE_ENV development, production yoki test bo'lishi kerak (hozir: "${nodeEnv}")`);
  }
  const prod = nodeEnv === 'production';

  const databaseUrl = String(raw.DATABASE_URL ?? '');
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) errors.push('DATABASE_URL postgresql:// bilan boshlanishi kerak');

  const jwtSecret = String(raw.JWT_SECRET ?? '');
  if (!jwtSecret) {
    errors.push('JWT_SECRET berilmagan');
  } else if (prod) {
    if (jwtSecret.length < MIN_PROD_SECRET_LENGTH) {
      errors.push(`Production'da JWT_SECRET kamida ${MIN_PROD_SECRET_LENGTH} belgi bo'lishi kerak`);
    }
    if (WEAK_SECRETS.includes(jwtSecret.toLowerCase()) || new Set(jwtSecret).size < 8) {
      errors.push("JWT_SECRET zaif yoki namuna qiymat. Tasodifiy kalit yarating: openssl rand -base64 48");
    }
  } else if (jwtSecret.length < 8) {
    errors.push("JWT_SECRET kamida 8 belgi bo'lishi kerak");
  }

  const jwtExpires = String(raw.JWT_EXPIRES_IN ?? '7d');
  if (!/^\d+[smhd]$/.test(jwtExpires)) errors.push(`JWT_EXPIRES_IN "15m", "12h" yoki "7d" ko'rinishida bo'lishi kerak (hozir: "${jwtExpires}")`);

  const corsOrigins = parseOrigins(raw.CORS_ORIGINS);
  for (const o of corsOrigins) {
    if (o === '*') errors.push("CORS_ORIGINS da '*' mumkin emas: aniq manzillarni yozing (https://agrargo.uz)");
    else if (!isValidOrigin(o)) errors.push(`CORS_ORIGINS da noto'g'ri manzil: "${o}" (faqat sxema+domen, masalan https://agrargo.uz)`);
  }
  if (prod && corsOrigins.length === 0) {
    errors.push("Production'da CORS_ORIGINS majburiy: frontend manzillarini vergul bilan yozing");
  }
  if (prod && corsOrigins.some((o) => o.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o))) {
    errors.push("Production'da CORS_ORIGINS faqat https:// bo'lishi kerak");
  }

  const paymentProvider = String(raw.PAYMENT_PROVIDER ?? 'simulated');
  if (paymentProvider !== 'simulated') {
    errors.push(`PAYMENT_PROVIDER "${paymentProvider}" qo'llab-quvvatlanmaydi (hozircha faqat "simulated")`);
  }
  const allowSimulationRaw = String(raw.PAYMENT_ALLOW_SIMULATION ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(allowSimulationRaw)) errors.push('PAYMENT_ALLOW_SIMULATION true yoki false bo\'lishi kerak');
  const allowSimulation = allowSimulationRaw === 'true';
  // Simulyatsiya haqiqiy pul olmaydi: productionda tasodifan qolib ketmasligi uchun ochiq tasdiq talab qilinadi
  if (prod && paymentProvider === 'simulated' && !allowSimulation) {
    errors.push("Production'da simulyatsiya qilingan to'lov taqiqlangan: haqiqiy to'lov provayderini ulang (faqat demo uchun PAYMENT_ALLOW_SIMULATION=true)");
  }

  const smsProvider = String(raw.SMS_PROVIDER ?? 'simulated');
  if (smsProvider !== 'simulated') {
    errors.push(`SMS_PROVIDER "${smsProvider}" qo'llab-quvvatlanmaydi (hozircha faqat "simulated")`);
  }
  const smsAllowRaw = String(raw.SMS_ALLOW_SIMULATION ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(smsAllowRaw)) errors.push("SMS_ALLOW_SIMULATION true yoki false bo'lishi kerak");
  const smsAllowSimulation = smsAllowRaw === 'true';
  const ebolEnforceRaw = String(raw.EBOL_ENFORCE ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(ebolEnforceRaw)) errors.push("EBOL_ENFORCE true yoki false bo'lishi kerak");
  // PIN-kod tasdiqlash (yuklash: haydovchi PIN'ini fermer kiritadi; topshirish: market PIN'ini haydovchi kiritadi). Standart: yoqilgan
  const pinEnforceRaw = String(raw.PIN_ENFORCE ?? 'true').toLowerCase();
  if (!['true', 'false'].includes(pinEnforceRaw)) errors.push("PIN_ENFORCE true yoki false bo'lishi kerak");
  // Ro'yxatdan o'tishda telefonni SMS kod bilan tasdiqlash majburiyligi. Standart: yoqilgan
  const regOtpRaw = String(raw.REGISTER_OTP_ENFORCE ?? 'true').toLowerCase();
  if (!['true', 'false'].includes(regOtpRaw)) errors.push("REGISTER_OTP_ENFORCE true yoki false bo'lishi kerak");
  // Simulyatsiyada SMS yuborilmaydi: parolni tiklash kodlari kimgadir yetib bormaydi (yoki jurnalda qoladi)
  if (prod && smsProvider === 'simulated' && !smsAllowSimulation) {
    errors.push("Production'da simulyatsiya qilingan SMS taqiqlangan: haqiqiy SMS provayderini ulang (faqat demo uchun SMS_ALLOW_SIMULATION=true)");
  }

  // KYC: simulyatsiyada Face ID haqiqiy tekshirilmaydi va hujjatlar yuklangach avtomatik tasdiqlanadi; production'da administrator ko'rib chiqadi
  const kycSimRaw = String(raw.KYC_ALLOW_SIMULATION ?? (prod ? 'false' : 'true')).toLowerCase();
  if (!['true', 'false'].includes(kycSimRaw)) errors.push("KYC_ALLOW_SIMULATION true yoki false bo'lishi kerak");

  const locSimRaw = String(raw.LOCATION_ALLOW_SIMULATION ?? (prod ? 'false' : 'true')).toLowerCase();
  if (!['true', 'false'].includes(locSimRaw)) errors.push("LOCATION_ALLOW_SIMULATION true yoki false bo'lishi kerak");

  // Telegram bot (ixtiyoriy). Token qiymati xato xabarlariga yozilmaydi.
  const tgToken = String(raw.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (tgToken && !/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(tgToken)) {
    errors.push("TELEGRAM_BOT_TOKEN formati noto'g'ri (BotFather bergan '123456:ABC...' ko'rinishida bo'lishi kerak)");
  }
  const tgUsername = String(raw.TELEGRAM_BOT_USERNAME ?? 'AgrarGoBot').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(tgUsername)) errors.push("TELEGRAM_BOT_USERNAME 5-32 belgidan iborat lotin harf/raqam/_ bo'lishi kerak");
  const tgPollingRaw = String(raw.TELEGRAM_POLLING ?? (nodeEnv === 'test' ? 'false' : 'true')).toLowerCase();
  if (!['true', 'false'].includes(tgPollingRaw)) errors.push("TELEGRAM_POLLING true yoki false bo'lishi kerak");

  // Webhook rejimi (Render kabi hostinglarda polling o'rniga): URL berilsa polling o'chadi va maxfiy sarlavha (secret) majburiy
  const tgWebhookUrl = String(raw.TELEGRAM_WEBHOOK_URL ?? '').trim();
  const tgWebhookSecret = String(raw.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
  if (tgWebhookUrl && !/^https:\/\/[^\s]+$/.test(tgWebhookUrl)) errors.push("TELEGRAM_WEBHOOK_URL https:// bilan boshlanuvchi to'liq manzil bo'lishi kerak");
  if (tgWebhookUrl && !/^[A-Za-z0-9_-]{16,256}$/.test(tgWebhookSecret)) errors.push("TELEGRAM_WEBHOOK_SECRET kamida 16 belgi (A-Z a-z 0-9 _ -) bo'lishi kerak");
  const tgWebUrl = String(raw.TELEGRAM_WEB_URL ?? corsOrigins[0] ?? '').trim().replace(/\/$/, '');
  if (tgWebUrl && !/^https?:\/\/[^\s]+$/.test(tgWebUrl)) errors.push("TELEGRAM_WEB_URL noto'g'ri manzil");

  const reviewsAutoRaw = String(raw.REVIEWS_AUTO_APPROVE ?? 'true').toLowerCase();
  if (!['true', 'false'].includes(reviewsAutoRaw)) errors.push("REVIEWS_AUTO_APPROVE true yoki false bo'lishi kerak");

  const env = {
    NODE_ENV: nodeEnv as NodeEnv,
    // true: yangi sharh darhol ochiq ko'rinadi (admin keyin yashirishi mumkin); false: admin tasdiqlaguncha ko'rinmaydi
    REVIEWS_AUTO_APPROVE: reviewsAutoRaw === 'true',
    THROTTLE_REVIEW_LIMIT: intInRange(raw.THROTTLE_REVIEW_LIMIT, 'THROTTLE_REVIEW_LIMIT', 5, 1, 100000, errors),
    THROTTLE_REVIEW_READ_LIMIT: intInRange(raw.THROTTLE_REVIEW_READ_LIMIT, 'THROTTLE_REVIEW_READ_LIMIT', 60, 1, 100000, errors),
    TELEGRAM_BOT_TOKEN: tgToken,
    TELEGRAM_BOT_USERNAME: tgUsername,
    // Long polling: bir nechta nusxa (instance) ishlasa faqat bittasida yoqing (Telegram 409 qaytaradi)
    TELEGRAM_POLLING: tgPollingRaw === 'true' && !tgWebhookUrl,
    TELEGRAM_WEBHOOK_URL: tgWebhookUrl,
    TELEGRAM_WEBHOOK_SECRET: tgWebhookSecret,
    TELEGRAM_WEB_URL: tgWebUrl,
    TELEGRAM_LINK_TTL_SECONDS: intInRange(raw.TELEGRAM_LINK_TTL_SECONDS, 'TELEGRAM_LINK_TTL_SECONDS', 600, 60, 3600, errors),
    THROTTLE_TELEGRAM_LIMIT: intInRange(raw.THROTTLE_TELEGRAM_LIMIT, 'THROTTLE_TELEGRAM_LIMIT', 10, 1, 100000, errors),
    PORT: intInRange(raw.PORT, 'PORT', 3000, 1, 65535, errors),
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpires,
    CORS_ORIGINS: corsOrigins,
    // Nginx/balancer ortida nechta proksi borligi (IP aniqlash va rate-limit uchun)
    TRUST_PROXY: intInRange(raw.TRUST_PROXY, 'TRUST_PROXY', 0, 0, 10, errors),
    THROTTLE_DEFAULT_LIMIT: intInRange(raw.THROTTLE_DEFAULT_LIMIT, 'THROTTLE_DEFAULT_LIMIT', 120, 1, 100000, errors),
    THROTTLE_LOGIN_IP_LIMIT: intInRange(raw.THROTTLE_LOGIN_IP_LIMIT, 'THROTTLE_LOGIN_IP_LIMIT', 20, 1, 100000, errors),
    THROTTLE_LOGIN_PHONE_LIMIT: intInRange(raw.THROTTLE_LOGIN_PHONE_LIMIT, 'THROTTLE_LOGIN_PHONE_LIMIT', 5, 1, 100000, errors),
    THROTTLE_REGISTER_LIMIT: intInRange(raw.THROTTLE_REGISTER_LIMIT, 'THROTTLE_REGISTER_LIMIT', 10, 1, 100000, errors),
    THROTTLE_UPLOAD_LIMIT: intInRange(raw.THROTTLE_UPLOAD_LIMIT, 'THROTTLE_UPLOAD_LIMIT', 10, 1, 100000, errors),
    THROTTLE_BOOKING_LIMIT: intInRange(raw.THROTTLE_BOOKING_LIMIT, 'THROTTLE_BOOKING_LIMIT', 30, 1, 100000, errors),
    THROTTLE_PAYMENT_LIMIT: intInRange(raw.THROTTLE_PAYMENT_LIMIT, 'THROTTLE_PAYMENT_LIMIT', 20, 1, 100000, errors),
    SMS_PROVIDER: 'simulated' as const,
    SMS_ALLOW_SIMULATION: smsAllowSimulation,
    EBOL_OTP_TTL_MIN: intInRange(raw.EBOL_OTP_TTL_MIN, 'EBOL_OTP_TTL_MIN', 15, 1, 120, errors),
    EBOL_ENFORCE: ebolEnforceRaw === 'true',
    PIN_ENFORCE: pinEnforceRaw === 'true',
    OTP_LENGTH: intInRange(raw.OTP_LENGTH, 'OTP_LENGTH', 4, 4, 8, errors),
    REGISTER_OTP_ENFORCE: regOtpRaw === 'true',
    OTP_TTL_SECONDS: intInRange(raw.OTP_TTL_SECONDS, 'OTP_TTL_SECONDS', 300, 60, 900, errors),
    OTP_MAX_ATTEMPTS: intInRange(raw.OTP_MAX_ATTEMPTS, 'OTP_MAX_ATTEMPTS', 5, 1, 10, errors),
    OTP_RESEND_COOLDOWN_SECONDS: intInRange(raw.OTP_RESEND_COOLDOWN_SECONDS, 'OTP_RESEND_COOLDOWN_SECONDS', 60, 5, 600, errors),
    RESET_TOKEN_TTL_SECONDS: intInRange(raw.RESET_TOKEN_TTL_SECONDS, 'RESET_TOKEN_TTL_SECONDS', 600, 60, 1800, errors),
    THROTTLE_FORGOT_IP_LIMIT: intInRange(raw.THROTTLE_FORGOT_IP_LIMIT, 'THROTTLE_FORGOT_IP_LIMIT', 5, 1, 100000, errors),
    THROTTLE_FORGOT_PHONE_LIMIT: intInRange(raw.THROTTLE_FORGOT_PHONE_LIMIT, 'THROTTLE_FORGOT_PHONE_LIMIT', 3, 1, 100000, errors),
    THROTTLE_VERIFY_IP_LIMIT: intInRange(raw.THROTTLE_VERIFY_IP_LIMIT, 'THROTTLE_VERIFY_IP_LIMIT', 20, 1, 100000, errors),
    THROTTLE_VERIFY_PHONE_LIMIT: intInRange(raw.THROTTLE_VERIFY_PHONE_LIMIT, 'THROTTLE_VERIFY_PHONE_LIMIT', 10, 1, 100000, errors),
    THROTTLE_RESET_LIMIT: intInRange(raw.THROTTLE_RESET_LIMIT, 'THROTTLE_RESET_LIMIT', 10, 1, 100000, errors),
    THROTTLE_CHANGE_PASSWORD_LIMIT: intInRange(raw.THROTTLE_CHANGE_PASSWORD_LIMIT, 'THROTTLE_CHANGE_PASSWORD_LIMIT', 5, 1, 100000, errors),
    THROTTLE_LOCATION_LIMIT: intInRange(raw.THROTTLE_LOCATION_LIMIT, 'THROTTLE_LOCATION_LIMIT', 12, 1, 100000, errors),
    // Demo (soxta) joylashuv: productionda sukut bo'yicha o'chiq, fermer/market haqiqiy joyni ko'rishiga ishonadi
    LOCATION_ALLOW_SIMULATION: locSimRaw === 'true',
    KYC_ALLOW_SIMULATION: kycSimRaw === 'true',
    PAYMENT_PROVIDER: 'simulated' as const,
    PAYMENT_ALLOW_SIMULATION: allowSimulation,
    // Yetkazilgandan keyin xaridor tasdiqlamasa, fermer pulni shu soatdan keyin o'zi chiqarib ola oladi
    // Omborxona xizmat haqi (foiz): ombor buyurtmasi yetkazilganda fermer o'rniga omborxona hisobiga o'tadi
    WAREHOUSE_FEE_PERCENT: intInRange(raw.WAREHOUSE_FEE_PERCENT, 'WAREHOUSE_FEE_PERCENT', 2, 0, 30, errors),
    // To'lov tarkibi: yetkazib berish haqi (haydovchiga) va platforma xizmat haqi
    DELIVERY_BASE_FEE: intInRange(raw.DELIVERY_BASE_FEE, 'DELIVERY_BASE_FEE', 20000, 0, 10_000_000, errors),
    DELIVERY_FEE_PER_KM: intInRange(raw.DELIVERY_FEE_PER_KM, 'DELIVERY_FEE_PER_KM', 400, 0, 100_000, errors),
    DELIVERY_FEE_PER_TON_KM: intInRange(raw.DELIVERY_FEE_PER_TON_KM, 'DELIVERY_FEE_PER_TON_KM', 150, 0, 100_000, errors),
    SERVICE_FEE_PERCENT: intInRange(raw.SERVICE_FEE_PERCENT, 'SERVICE_FEE_PERCENT', 1, 0, 30, errors),
    // Chakana (Hub) savdo: Hub saqlash/qadoqlash haqi, shahar ichi kuryer haqi va platforma komissiyasi (hammasi xaridorga ochiq ko'rsatiladi)
    LOCAL_HUB_FEE_PERCENT: intInRange(raw.LOCAL_HUB_FEE_PERCENT, 'LOCAL_HUB_FEE_PERCENT', 5, 0, 30, errors),
    LOCAL_HUB_FEE_MIN: intInRange(raw.LOCAL_HUB_FEE_MIN, 'LOCAL_HUB_FEE_MIN', 2000, 0, 1_000_000, errors),
    LOCAL_COURIER_FEE: intInRange(raw.LOCAL_COURIER_FEE, 'LOCAL_COURIER_FEE', 12000, 0, 1_000_000, errors),
    LOCAL_SERVICE_FEE_PERCENT: intInRange(raw.LOCAL_SERVICE_FEE_PERCENT, 'LOCAL_SERVICE_FEE_PERCENT', 3, 0, 30, errors),
    LOCAL_SERVICE_FEE_MIN: intInRange(raw.LOCAL_SERVICE_FEE_MIN, 'LOCAL_SERVICE_FEE_MIN', 500, 0, 1_000_000, errors),
    LOCAL_MIN_ORDER_KG: intInRange(raw.LOCAL_MIN_ORDER_KG, 'LOCAL_MIN_ORDER_KG', 10, 1, 1000, errors),
    LOCAL_MAX_ORDER_KG: intInRange(raw.LOCAL_MAX_ORDER_KG, 'LOCAL_MAX_ORDER_KG', 200, 1, 5000, errors),
    CASHBACK_BUYER_PERCENT: intInRange(raw.CASHBACK_BUYER_PERCENT, 'CASHBACK_BUYER_PERCENT', 1, 0, 20, errors),
    CASHBACK_FARMER_PERCENT: intInRange(raw.CASHBACK_FARMER_PERCENT, 'CASHBACK_FARMER_PERCENT', 1, 0, 20, errors),
    CASHBACK_DRIVER_PERCENT: intInRange(raw.CASHBACK_DRIVER_PERCENT, 'CASHBACK_DRIVER_PERCENT', 1, 0, 20, errors),
    CASHBACK_MAX_SPEND_PERCENT: intInRange(raw.CASHBACK_MAX_SPEND_PERCENT, 'CASHBACK_MAX_SPEND_PERCENT', 100, 0, 100, errors),
    DOCK_UTC_OFFSET_MIN: intInRange(raw.DOCK_UTC_OFFSET_MIN, 'DOCK_UTC_OFFSET_MIN', 300, -720, 840, errors),
    DOCK_MAX_DAYS_AHEAD: intInRange(raw.DOCK_MAX_DAYS_AHEAD, 'DOCK_MAX_DAYS_AHEAD', 14, 1, 60, errors),
    DOCK_MAX_ACTIVE_PER_USER: intInRange(raw.DOCK_MAX_ACTIVE_PER_USER, 'DOCK_MAX_ACTIVE_PER_USER', 6, 1, 50, errors),
    DOCK_GRACE_MIN: intInRange(raw.DOCK_GRACE_MIN, 'DOCK_GRACE_MIN', 15, 0, 120, errors),
    PAYMENT_RELEASE_GRACE_HOURS: intInRange(raw.PAYMENT_RELEASE_GRACE_HOURS, 'PAYMENT_RELEASE_GRACE_HOURS', 72, 0, 720, errors),
  };

  if (errors.length) {
    throw new Error(`Muhit sozlamalari noto'g'ri:\n - ${errors.join('\n - ')}`);
  }
  return { ...raw, ...env };
}

/** Production bo'lmasa ham xavfli bo'lishi mumkin bo'lgan holatlar uchun ogohlantirishlar. */
export function envWarnings(env: AppEnv): string[] {
  const out: string[] = [];
  if (env.NODE_ENV !== 'production') {
    if (WEAK_SECRETS.includes(env.JWT_SECRET.toLowerCase())) out.push("JWT_SECRET namuna qiymatda. Production'da almashtiring");
    if (env.CORS_ORIGINS.length === 0) out.push("CORS_ORIGINS bo'sh: barcha manzillarga ruxsat (faqat development uchun)");
  }
  if (env.SMS_PROVIDER === 'simulated') {
    out.push("SMS simulyatsiya rejimida: kodlar yuborilmaydi (development'da javobda va jurnalda ko'rinadi)");
  }
  if (env.LOCATION_ALLOW_SIMULATION && env.NODE_ENV === 'production') {
    out.push("LOCATION_ALLOW_SIMULATION yoqilgan: haydovchilar soxta (demo) joylashuv yubora oladi");
  }
  if (!env.TELEGRAM_BOT_TOKEN) out.push("TELEGRAM_BOT_TOKEN berilmagan: Telegram bot va xabarnomalar o'chiq");
  if (env.PAYMENT_PROVIDER === 'simulated') {
    out.push("To'lovlar simulyatsiya rejimida: haqiqiy pul harakati yo'q");
  }
  return out;
}
