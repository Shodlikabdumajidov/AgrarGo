// Backend seed ma'lumotidan frontend zaxira yangiliklarini (AI xulosasiz) yaratadi: node tools/build-news-fallback.js
// Avval: cd backend && npm run build
const fs = require('fs'), path = require('path');
const { SEED_NEWS } = require(path.join(__dirname, '..', 'backend', 'dist', 'news', 'news-seed.js'));
const items = SEED_NEWS.map((s, i) => ({
  id: 'fb-' + (i + 1), category: s.category, region: s.region, hoursAgo: s.hoursAgo,
  titleUz: s.title.uz, titleRu: s.title.ru, titleEn: s.title.en, summaryUz: s.summary.uz, summaryRu: s.summary.ru, summaryEn: s.summary.en,
}));
fs.writeFileSync(path.join(__dirname, '..', 'js', 'news-fallback.js'),
  "// Avtomatik yaratilgan (node tools/build-news-fallback.js). Server javob bermaganda ko'rsatiladigan zaxira yangiliklar: AI xulosasiz (u faqat serverdan, tizimga kirganlarga keladi).\n" +
  'window.NEWS_FALLBACK = ' + JSON.stringify(items, null, 1) + '.map(function (n) { n.publishedAt = new Date(Date.now() - n.hoursAgo * 3600000).toISOString(); n.fallback = true; return n; });\n');
console.log(items.length + ' ta zaxira yangilik');
