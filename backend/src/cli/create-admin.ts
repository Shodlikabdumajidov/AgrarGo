/**
 * Administrator yoki ombor dispetcherini yaratish (API orqali ro'yxatdan o'tmaydi):
 *   ADMIN_PASSWORD='...' npm run admin:create -- +998901234567 "Ism Familiya"
 *   ADMIN_PASSWORD='...' npm run admin:create -- --role=DISPATCHER +998901234567 "Ism Familiya"
 * Parol buyruq satriga emas, muhit o'zgaruvchisiga yoziladi (shell tarixi va jarayonlar ro'yxatida ko'rinmasligi uchun).
 */
import { AdminRole, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

async function main() {
  const args = process.argv.slice(2);
  const roleArg = args.find((a) => a.startsWith('--role='))?.slice('--role='.length) ?? 'ADMIN';
  const [phone, ...nameParts] = args.filter((a) => !a.startsWith('--role='));
  const fullName = nameParts.join(' ').trim();
  const password = process.env.ADMIN_PASSWORD ?? '';

  const problems: string[] = [];
  const adminRoleArg = args.find((a) => a.startsWith('--admin-role='))?.slice('--admin-role='.length) ?? 'SUPER_ADMIN';
  if (roleArg === 'ADMIN' && !['SUPER_ADMIN', 'SAFETY_ADMIN', 'FINANCE_ADMIN', 'HUB_ADMIN'].includes(adminRoleArg)) problems.push("--admin-role: SUPER_ADMIN | SAFETY_ADMIN | FINANCE_ADMIN | HUB_ADMIN");
  if (roleArg !== 'ADMIN' && roleArg !== 'DISPATCHER') problems.push("--role faqat ADMIN yoki DISPATCHER bo'lishi mumkin");
  if (!/^\+998\d{9}$/.test(phone ?? '')) problems.push('telefon +998XXXXXXXXX formatida bo\'lishi kerak');
  if (fullName.length < 2) problems.push('ism va familiyani kiriting');
  if (password.length < 12) problems.push('ADMIN_PASSWORD kamida 12 belgi bo\'lishi kerak');
  if (problems.length) {
    console.error(`Xato: ${problems.join('; ')}\nFoydalanish: ADMIN_PASSWORD='...' npm run admin:create -- +998901234567 "Ism Familiya"`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { phone }, select: { role: true } });
    if (existing) {
      console.error(`Xato: bu raqam allaqachon ${existing.role} sifatida ro'yxatdan o'tgan (bitta raqam — bitta rol)`);
      process.exit(1);
    }
    const user = await prisma.user.create({
      data: { phone, fullName, role: roleArg as Role, ...(roleArg === 'ADMIN' && { adminRole: adminRoleArg as AdminRole }), passwordHash: await bcrypt.hash(password, 10) },
      select: { id: true, phone: true, fullName: true, role: true, adminRole: true },
    });
    console.log(`${roleArg} yaratildi:`, user);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
