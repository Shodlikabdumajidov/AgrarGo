import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'prisma', 'migrations');
const log = new Logger('Migrate');

/** Prisma migratsiya SQL'ini alohida buyruqlarga bo'ladi (sharhlar tashlanadi; Prisma generatsiya qilgan oddiy SQL uchun yetarli) */
export function splitSql(sql: string): string[] {
  const noComments = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const out: string[] = []; let cur = ''; let inStr = false, dollar = false;
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    if (!dollar && ch === "'") inStr = !inStr;
    if (!inStr && noComments.startsWith('$$', i)) { dollar = !dollar; cur += '$$'; i++; continue; }
    if (ch === ';' && !inStr && !dollar) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** 1-usul: Prisma CLI (agar o'rnatilgan bo'lsa) — `prisma migrate deploy` */
function viaCli(databaseUrl: string): boolean {
  let bin: string;
  try { bin = require.resolve('prisma/build/index.js'); } catch { return false; }
  const r = spawnSync(process.execPath, [bin, 'migrate', 'deploy', '--schema', join(MIGRATIONS_DIR, '..', 'schema.prisma')], { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8', timeout: 120_000 });
  if (r.status === 0) return true;
  log.warn(`prisma migrate deploy xato bilan tugadi (${r.status ?? r.error?.message}): ${(r.stderr || r.stdout || '').slice(-300)}`);
  return false;
}

/** 2-usul (CLI yo'q yoki xato): migratsiyalarni o'zimiz qo'llaymiz va Prisma formatidagi _prisma_migrations jadvaliga yozamiz (keyin `prisma migrate deploy` bilan mos) */
export async function applyMigrationsManually(prisma: PrismaClient, dir = MIGRATIONS_DIR): Promise<string[]> {
  const applied: string[] = [];
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" ("id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
  {
    const done = new Set((await prisma.$queryRawUnsafe<{ migration_name: string }[]>('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).map((r) => r.migration_name));
    const names = readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory() && existsSync(join(dir, d, 'migration.sql'))).sort();
    for (const name of names) {
      if (done.has(name)) continue;
      const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
      const stmts = splitSql(sql);
      await prisma.$transaction([
        ...stmts.map((s) => prisma.$executeRawUnsafe(s)),
        prisma.$executeRawUnsafe(`INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count") VALUES ($1,$2,$3,now(),1)`, randomUUID(), createHash('sha256').update(sql).digest('hex'), name),
      ]);
      applied.push(name);
    }
  }
  return applied;
}

/** Server ko'tarilishidan oldin bazani eng so'nggi sxemaga keltiradi (Render'da qo'lda `migrate deploy` unutilsa ham xato bermaydi) */
export async function autoMigrate(env: { NODE_ENV: string; AUTO_MIGRATE: boolean; DATABASE_URL: string }): Promise<void> {
  if (env.NODE_ENV === 'test' || !env.AUTO_MIGRATE) return;
  try {
    if (viaCli(env.DATABASE_URL)) { log.log('Migratsiyalar dolzarb (prisma migrate deploy)'); return; }
    const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
    try {
      const applied = await applyMigrationsManually(prisma);
      log.log(applied.length ? `Qo'llangan migratsiyalar: ${applied.join(', ')}` : 'Migratsiyalar dolzarb');
    } finally { await prisma.$disconnect(); }
  } catch (e) {
    log.error(`Avto-migratsiya bajarilmadi: ${(e as Error).message}`); // server baribir ko'tariladi; PrismaService aniq ogohlantiradi
  }
}
