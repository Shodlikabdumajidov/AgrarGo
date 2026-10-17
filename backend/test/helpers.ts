import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TEST_DATABASE_URL } from './global-setup';

export const PASSWORD = 'parol1234';
export const STRONG_SECRET = 'e2e-test-secret-Zk8!vQ2#mL9$xT4@pR7&wN1^cB5*dF3%';

/** Oddiy suitelar rate-limitga tushib qolmasligi uchun yuqori chegaralar */
const RELAXED_LIMITS = {
  THROTTLE_DEFAULT_LIMIT: '100000',
  THROTTLE_LOGIN_IP_LIMIT: '100000',
  THROTTLE_LOGIN_PHONE_LIMIT: '100000',
  THROTTLE_REGISTER_LIMIT: '100000',
  THROTTLE_UPLOAD_LIMIT: '100000',
  THROTTLE_BOOKING_LIMIT: '100000',
};

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/** Productionga bir xil sozlangan (helmet, CORS, pipes) to'liq ilova; muhit o'zgaruvchilari faqat shu ilova uchun. */
export async function bootApp(env: Record<string, string | undefined> = {}): Promise<TestApp> {
  const overrides: Record<string, string | undefined> = {
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: STRONG_SECRET,
    JWT_EXPIRES_IN: '1h',
    CORS_ORIGINS: '',
    ...RELAXED_LIMITS,
    ...env,
  };
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };

  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    return {
      app,
      prisma: app.get(PrismaService),
      http: () => request(app.getHttpServer()),
      close: async () => {
        await app.close();
        restore();
      },
    };
  } catch (e) {
    restore();
    throw e;
  }
}

export async function resetDb(prisma: PrismaClient) {
  // Xavfsizlik: tozalash faqat test bazasida ishlaydi (Prisma .env'dagi haqiqiy bazani yuklab olgan bo'lishi mumkin)
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (!db.endsWith('_test')) throw new Error(`resetDb "${db}" bazasida bajarilmaydi: faqat *_test`);
  // CASCADE: User'ga bog'liq barcha jadvallar (profillar, e'lon, bron, yuk) tozalanadi
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
}

let phoneCounter = 0;
export const nextPhone = () => `+99890${String(1000000 + ++phoneCounter).slice(-7)}`;

export interface Account {
  token: string;
  user: any;
  phone: string;
}

type Http = TestApp['http'];

export async function registerFarmer(http: Http, extra: Record<string, unknown> = {}): Promise<Account> {
  const phone = (extra.phone as string) ?? nextPhone();
  const res = await http().post('/auth/farmer/register').send({
    phone, password: PASSWORD, fullName: 'Ali Valiyev', farmName: 'Ali Agro',
    region: 'Samarqand', district: 'Urgut', address: "Dehqon ko'chasi 5", ...extra,
  });
  if (res.status !== 201) throw new Error(`registerFarmer ${res.status}: ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, user: res.body.user, phone };
}

export async function registerMarket(http: Http, extra: Record<string, unknown> = {}): Promise<Account> {
  const phone = (extra.phone as string) ?? nextPhone();
  const res = await http().post('/auth/market/register').send({
    phone, password: PASSWORD, fullName: 'Sardor Menejer', companyName: 'Korzinka Market',
    region: 'Toshkent shahri', district: 'Chilonzor', address: 'Bunyodkor 12', ...extra,
  });
  if (res.status !== 201) throw new Error(`registerMarket ${res.status}: ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, user: res.body.user, phone };
}

let plateCounter = 0;
export async function registerDriver(http: Http, extra: Record<string, unknown> = {}): Promise<Account> {
  const phone = (extra.phone as string) ?? nextPhone();
  const res = await http().post('/auth/driver/register').send({
    phone, password: PASSWORD, fullName: 'Hasan Haydovchi', vehicleType: 'Isuzu (kichik yuk)',
    plateNumber: `01A${String(100 + ++plateCounter)}BC`, capacityKg: 1000, region: 'Samarqand', ...extra,
  });
  if (res.status !== 201) throw new Error(`registerDriver ${res.status}: ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, user: res.body.user, phone };
}

export const bearer = (a: Account | string) => `Bearer ${typeof a === 'string' ? a : a.token}`;

export async function createProduct(http: Http, farmer: Account, extra: Record<string, unknown> = {}) {
  const res = await http().post('/products').set('Authorization', bearer(farmer)).send({
    name: 'Pomidor', category: 'Sabzavot', quantityKg: 500, pricePerKg: 4500, ...extra,
  });
  if (res.status !== 201) throw new Error(`createProduct ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body as { id: string; quantityKg: string; status: string };
}

export async function book(http: Http, market: Account, productId: string, quantityKg: number, message?: string) {
  return http().post('/bookings').set('Authorization', bearer(market)).send({ productId, quantityKg, message });
}

export const approve = (http: Http, farmer: Account, bookingId: string) =>
  http().patch(`/bookings/${bookingId}/approve`).set('Authorization', bearer(farmer));

export type { INestApplication };
