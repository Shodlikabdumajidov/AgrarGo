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
  SMS_PROVIDER: 'simulated';
  SMS_ALLOW_SIMULATION: boolean;
  OTP_TTL_SECONDS: number;
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
  TELEGRAM_BOT_TOKEN: string; // bo'sh = bot o'chiq
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_POLLING: boolean;
  TELEGRAM_LINK_TTL_SECONDS: number;
  THROTTLE_TELEGRAM_LIMIT: number;
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
  // Simulyatsiyada SMS yuborilmaydi: parolni tiklash kodlari kimgadir yetib bormaydi (yoki jurnalda qoladi)
  if (prod && smsProvider === 'simulated' && !smsAllowSimulation) {
    errors.push("Production'da simulyatsiya qilingan SMS taqiqlangan: haqiqiy SMS provayderini ulang (faqat demo uchun SMS_ALLOW_SIMULATION=true)");
  }

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

  const env = {
    NODE_ENV: nodeEnv as NodeEnv,
    TELEGRAM_BOT_TOKEN: tgToken,
    TELEGRAM_BOT_USERNAME: tgUsername,
    // Long polling: bir nechta nusxa (instance) ishlasa faqat bittasida yoqing (Telegram 409 qaytaradi)
    TELEGRAM_POLLING: tgPollingRaw === 'true',
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
    PAYMENT_PROVIDER: 'simulated' as const,
    PAYMENT_ALLOW_SIMULATION: allowSimulation,
    // Yetkazilgandan keyin xaridor tasdiqlamasa, fermer pulni shu soatdan keyin o'zi chiqarib ola oladi
    // Omborxona xizmat haqi (foiz): ombor buyurtmasi yetkazilganda fermer o'rniga omborxona hisobiga o'tadi
    WAREHOUSE_FEE_PERCENT: intInRange(raw.WAREHOUSE_FEE_PERCENT, 'WAREHOUSE_FEE_PERCENT', 2, 0, 30, errors),
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
