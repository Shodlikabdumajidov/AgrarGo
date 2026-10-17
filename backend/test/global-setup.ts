import { execSync } from 'child_process';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:parol@localhost:5432/agrargo_test?schema=public';

export default async function globalSetup() {
  // Testlar jadvallarni tozalaydi: faqat nomi "_test" bilan tugaydigan bazada ishlashga ruxsat
  const dbName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`E2E testlar faqat "_test" bilan tugaydigan bazada ishlaydi (hozir: "${dbName}")`);
  }
  // Baza bo'lmasa Prisma o'zi yaratadi; migratsiyalar productionga o'xshash tarzda qo'llanadi
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
