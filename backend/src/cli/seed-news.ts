/** Agro-logistika yangiliklari (jadval bo'sh bo'lsagina): npm run seed:news */
import { PrismaClient } from '@prisma/client';
import { SEED_NEWS } from '../news/news-seed';

async function main() {
  const prisma = new PrismaClient();
  try {
    if ((await prisma.agroNews.count()) > 0) return console.log("Yangiliklar allaqachon mavjud — o'zgartirilmadi");
    const now = Date.now();
    for (const s of SEED_NEWS) {
      await prisma.agroNews.create({ data: {
        titleUz: s.title.uz, titleRu: s.title.ru, titleEn: s.title.en, summaryUz: s.summary.uz, summaryRu: s.summary.ru, summaryEn: s.summary.en,
        category: s.category, region: s.region, publishedAt: new Date(now - s.hoursAgo * 3_600_000), aiSource: 'seed',
        aiInsightFarmerUz: s.insights.farmer.uz, aiInsightFarmerRu: s.insights.farmer.ru, aiInsightFarmerEn: s.insights.farmer.en,
        aiInsightDriverUz: s.insights.driver.uz, aiInsightDriverRu: s.insights.driver.ru, aiInsightDriverEn: s.insights.driver.en,
        aiInsightMarketUz: s.insights.market.uz, aiInsightMarketRu: s.insights.market.ru, aiInsightMarketEn: s.insights.market.en } });
    }
    console.log(`${SEED_NEWS.length} ta yangilik qo'shildi`);
  } finally { await prisma.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
