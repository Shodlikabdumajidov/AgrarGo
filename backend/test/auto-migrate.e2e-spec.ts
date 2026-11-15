import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';
import { applyMigrationsManually } from '../src/prisma/auto-migrate';
import { TEST_DATABASE_URL } from './global-setup';

describe('Avto-migratsiya: bo\'sh bazani noldan to\'liq sxemaga keltiradi (Render cold start)', () => {
  const base = new URL(TEST_DATABASE_URL); const name = 'agrargo_automig_test';
  const urlFor = (db: string) => { const u = new URL(base.toString()); u.pathname = '/' + db; return u.toString(); };
  const admin = new PrismaClient({ datasources: { db: { url: urlFor('postgres') } } });
  let fresh: PrismaClient;
  beforeAll(async () => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    fresh = new PrismaClient({ datasources: { db: { url: urlFor(name) } } });
  });
  afterAll(async () => { await fresh.$disconnect(); await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.$disconnect(); });

  it("barcha migratsiyalar qo'llanadi, AgroNews jadvali va yangi ustunlar paydo bo'ladi, qayta chaqirish hech narsa qilmaydi", async () => {
    const dir = join(__dirname, '..', 'prisma', 'migrations');
    const all = readdirSync(dir).filter((d) => /^\d/.test(d)).sort();
    const applied = await applyMigrationsManually(fresh);
    expect(applied).toEqual(all);
    const cols = (await fresh.$queryRawUnsafe<{ column_name: string }[]>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'AgroNews'`)).map((c) => c.column_name);
    expect(cols).toEqual(expect.arrayContaining(['sourceUrl', 'sourceName', 'aiInsightDriverRu', 'category']));
    expect(Number((await fresh.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`))[0].n)).toBe(all.length);
    expect(await applyMigrationsManually(fresh)).toEqual([]);
    // Prisma CLI bilan mos: checksum'lar to'g'ri, kutilayotgan migratsiya yo'q
    const out = execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: urlFor(name) }, encoding: 'utf8' });
    expect(out).toMatch(/No pending migrations to apply/);
  }, 120_000);

  it("sxema ishlaydi: yangilik yozish mumkin (sourceUrl unique)", async () => {
    const base = { titleUz: 'abcde', titleRu: 'abcde', titleEn: 'abcde', summaryUz: 'abcdefghij', summaryRu: 'abcdefghij', summaryEn: 'abcdefghij', category: 'AGRO' as const, aiInsightFarmerUz: 'x', aiInsightFarmerRu: 'x', aiInsightFarmerEn: 'x', aiInsightDriverUz: 'x', aiInsightDriverRu: 'x', aiInsightDriverEn: 'x', aiInsightMarketUz: 'x', aiInsightMarketRu: 'x', aiInsightMarketEn: 'x', sourceUrl: 'https://kun.uz/x' };
    await fresh.agroNews.create({ data: base });
    await expect(fresh.agroNews.create({ data: base })).rejects.toMatchObject({ code: 'P2002' });
  });
});
