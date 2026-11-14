import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'prisma', 'migrations');

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  async onModuleInit() {
    await this.$connect();
    if (process.env.NODE_ENV !== 'test') await this.warnAboutPendingMigrations();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Bazada qo'llanmagan migratsiya bo'lsa, so'rovlar tushunarsiz 500 xato bilan yiqiladi
   * (masalan, yangi ustun yo'q). Shuni ishga tushishdayoq aniq aytamiz; productionda server ko'tarilmaydi.
   */
  private async warnAboutPendingMigrations() {
    if (!existsSync(MIGRATIONS_DIR)) return;
    const onDisk = readdirSync(MIGRATIONS_DIR).filter((d) => statSync(join(MIGRATIONS_DIR, d)).isDirectory());
    let applied: string[] = [];
    try {
      const rows = await this.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
      applied = rows.map((r) => r.migration_name);
    } catch {
      /* jadval yo'q: baza hali migratsiya qilinmagan */
    }
    const pending = onDisk.filter((m) => !applied.includes(m));
    if (!pending.length) return;
    const msg = `Bazada qo'llanmagan migratsiyalar bor (${pending.join(', ')}). Ro'yxatdan o'tish/kirish 500 xato berishi mumkin. Bajaring: npx prisma migrate deploy`;
    if (process.env.NODE_ENV === 'production') throw new Error(msg);
    this.logger.error(msg);
  }
}
