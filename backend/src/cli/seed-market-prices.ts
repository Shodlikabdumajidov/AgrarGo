/**
 * Bozor narxlari uchun test ma'lumotlari (jadval bo'sh bo'lsagina qo'shiladi):
 *   npm run seed:prices
 */
import { PrismaClient } from '@prisma/client';

const SEED = [
  { marketName: 'Toshkent Food City', productName: 'Kartoshka', priceYesterday: 5200, priceToday: 5600 },
  { marketName: 'Samarqand Siyob dehqon bozori', productName: 'Sabzi', priceYesterday: 4300, priceToday: 4000 },
  { marketName: "Jizzax Markaziy dehqon bozori (Ko'k bozor)", productName: 'Piyoz', priceYesterday: 3500, priceToday: 3500 },
  { marketName: 'Toshkent Food City', productName: 'Pomidor', priceYesterday: 8000, priceToday: 9200 },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    if ((await prisma.marketPrice.count()) > 0) return console.log("Bozor narxlari allaqachon mavjud — o'zgartirilmadi");
    const now = Date.now();
    for (const s of SEED) {
      // Oldingi kun yozuvi ham qo'shiladi, shunda tarix to'liq bo'ladi
      await prisma.marketPrice.create({ data: { ...s, priceToday: s.priceYesterday, createdAt: new Date(now - 86_400_000) } });
      await prisma.marketPrice.create({ data: s });
    }
    console.log(`${SEED.length} ta bozor narxi qo'shildi`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
