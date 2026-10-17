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

  const env = {
    NODE_ENV: nodeEnv as NodeEnv,
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
  return out;
}
