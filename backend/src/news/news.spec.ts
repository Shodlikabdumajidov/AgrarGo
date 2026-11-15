import { Role } from '@prisma/client';
import { validateEnv } from '../config/env.validation';
import { NewsAiService } from './news-ai.service';
import { guessCategory, guessRegion, matchKeywords, parseFeed, parseFeedList, toLatin } from './news-feed';
import { splitSql } from '../prisma/auto-migrate';
import { SEED_NEWS } from './news-seed';
import { detectFlavors, templateInsights } from './news-templates';
import { insightRoleFor, NewsService } from './news.service';

const env = (extra: Record<string, string> = {}) => validateEnv({ DATABASE_URL: 'postgresql://u:p@db:5432/x', JWT_SECRET: 'dev-secret-123', ...extra });
const CYR = /[А-Яа-яЁё]/;

describe('news templates (AI zaxira shablon)', () => {
  it('har bir kategoriya × rol × til uchun bo\'sh bo\'lmagan, hududga bog\'langan matn beradi', () => {
    for (const category of ['ROADS', 'AGRO', 'MARKET', 'LOGISTICS'] as const) {
      const r = templateInsights({ category, region: 'Samarqand', text: '' });
      for (const role of ['farmer', 'driver', 'market'] as const) for (const lang of ['uz', 'ru', 'en'] as const) {
        expect(r[role][lang].length).toBeGreaterThan(40);
        expect(r[role][lang]).not.toContain('{r}');
      }
      expect(r.driver.ru).toContain('Самарканд');
      expect(r.driver.en).toContain('Samarkand');
      expect(r.farmer.uz).toContain('Samarqand');
    }
  });
  it('tillar aralashmaydi: uz/en matnda kirill yo\'q, ru matnda kirill bor', () => {
    const r = templateInsights({ category: 'ROADS', region: "Farg'ona", text: 'dovon qor yopiladi' });
    for (const role of ['farmer', 'driver', 'market'] as const) { expect(CYR.test(r[role].uz)).toBe(false); expect(CYR.test(r[role].en)).toBe(false); expect(CYR.test(r[role].ru)).toBe(true); }
  });
  it('kalit so\'zlar mos qo\'shimcha maslahat qo\'shadi', () => {
    expect(detectFlavors("Qamchiq dovonida qor va tuman")).toContain('weather');
    expect(detectFlavors('Markaziy ko\'chalar yopiladi')).toContain('closure');
    expect(detectFlavors('talab oshmoqda, narx')).toEqual(expect.arrayContaining(['demand', 'price']));
    const plain = templateInsights({ category: 'ROADS', region: 'Respublika', text: '' });
    const snow = templateInsights({ category: 'ROADS', region: 'Respublika', text: 'qor tuman' });
    expect(snow.driver.en.length).toBeGreaterThan(plain.driver.en.length);
    expect(snow.driver.en).toMatch(/tyres|chains/);
  });
  it('noma\'lum hudud nomi o\'z holicha ishlatiladi', () => {
    expect(templateInsights({ category: 'AGRO', region: 'Boshqa joy', text: '' }).farmer.en).toContain('Boshqa joy');
  });
});

describe('seed ma\'lumotlari', () => {
  it('4-5 ta yangilik, har biri 3 tilda va 9 ta xulosa bilan', () => {
    expect(SEED_NEWS.length).toBeGreaterThanOrEqual(4);
    expect(SEED_NEWS.length).toBeLessThanOrEqual(6);
    for (const s of SEED_NEWS) {
      expect(['ROADS', 'AGRO', 'MARKET', 'LOGISTICS']).toContain(s.category);
      for (const lang of ['uz', 'ru', 'en'] as const) {
        expect(s.title[lang].length).toBeGreaterThan(10); expect(s.summary[lang].length).toBeGreaterThan(30);
        for (const role of ['farmer', 'driver', 'market'] as const) expect(s.insights[role][lang].length).toBeGreaterThan(40);
      }
      expect(CYR.test(s.title.ru)).toBe(true); expect(CYR.test(s.title.uz)).toBe(false); expect(CYR.test(s.insights.driver.en)).toBe(false);
    }
    expect(new Set(SEED_NEWS.map((s) => s.category)).size).toBeGreaterThanOrEqual(3);
  });
});

describe('NewsAiService (Gemini → Groq → Anthropic → shablon)', () => {
  const input = { title: "Qamchiq dovonida qor", text: "Dovonda qor va tuman kutilmoqda, ehtiyot bo'ling.", sourceName: 'Kun.uz' };
  const L3 = (p: string) => ({ uz: `${p} uz matn yetarli uzunlikda`, ru: `${p} ru текст достаточной длины`, en: `${p} en text of sufficient length` });
  const payload = (extra: any = {}) => JSON.stringify({ category: 'ROADS', region: "Farg'ona", title: L3('Sarlavha'), summary: L3('Qisqa mazmun'), insights: { farmer: L3('farmer'), driver: L3('driver'), market: L3('market') }, ...extra });
  const geminiRes = (txt: string) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: txt }] } }] }) });
  const groqRes = (txt: string) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: txt } }] }) });
  const mk = (extra: Record<string, string> = {}) => new NewsAiService(env(extra));

  it('kalitlar yo\'q: tarmoqqa chiqmaydi, shablon (tahlil + rollar xulosasi) qaytaradi', async () => {
    const ai = mk(); const f = jest.fn(); ai.fetchImpl = f as any;
    const r = await ai.analyze(input);
    expect(f).not.toHaveBeenCalled(); expect(ai.providers()).toEqual([]);
    expect(r.source).toBe('template'); expect(r.category).toBe('ROADS'); expect(r.region).toBe("Farg'ona");
    expect(r.insights.driver.uz.length).toBeGreaterThan(40); expect(r.title.uz).toContain('Qamchiq');
  });
  it('Gemini: to\'g\'ri URL/sarlavha/so\'rov (gemini-2.5-flash, JSON rejimi), javob 3 tilli tahlilga aylanadi', async () => {
    const ai = mk({ GEMINI_API_KEY: 'g-key' }); const f = jest.fn(async () => geminiRes('```json\n' + payload() + '\n```')); ai.fetchImpl = f as any;
    const r = await ai.analyze(input);
    expect(r).toMatchObject({ source: 'gemini', category: 'ROADS', region: "Farg'ona" });
    expect(r.title.ru).toContain('Sarlavha ru'); expect(r.summary.en).toContain('en text'); expect(r.insights.market.ru).toContain('market ru');
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('g-key');
    const body = JSON.parse(init.body); expect(body.generationConfig.responseMimeType).toBe('application/json'); expect(body.contents[0].parts[0].text).toContain('Qamchiq dovonida qor'); expect(body.contents[0].parts[0].text).toContain('Kun.uz');
  });
  it('Gemini limiti (429) tugasa avtomatik Groq\'ga o\'tadi', async () => {
    const ai = mk({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' });
    const f = jest.fn(async (url: string) => (String(url).includes('googleapis') ? { ok: false, status: 429 } : groqRes(payload({ region: 'Toshkent' }))));
    ai.fetchImpl = f as any;
    const r = await ai.analyze(input);
    expect(r.source).toBe('groq'); expect(r.region).toBe('Toshkent');
    expect(f.mock.calls.map((c: any) => c[0])).toEqual(['https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', 'https://api.groq.com/openai/v1/chat/completions']);
    const [, init] = f.mock.calls[1] as any; expect(init.headers.authorization).toBe('Bearer q'); const b = JSON.parse(init.body); expect(b.model).toBe('llama-3.3-70b-versatile'); expect(b.response_format).toEqual({ type: 'json_object' });
  });
  it('Gemini yaroqsiz JSON bersa ham Groq\'ga o\'tadi; kalitlar bo\'lsa-yu hammasi xato bo\'lsa — shablon (yangilik yo\'qolmaydi)', async () => {
    const ai = mk({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' });
    ai.fetchImpl = (async (url: string) => (String(url).includes('googleapis') ? geminiRes('bu JSON emas') : groqRes(payload()))) as any;
    expect((await ai.analyze(input)).source).toBe('groq');
    const ai2 = mk({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' }); ai2.fetchImpl = (async () => { throw new Error('ECONNRESET'); }) as any;
    const r = await ai2.analyze(input); expect(r.source).toBe('template'); expect(r.insights.farmer.en.length).toBeGreaterThan(40);
  });
  it('faqat Groq kaliti bo\'lsa Gemini chaqirilmaydi; Anthropic — oxirgi ixtiyoriy zaxira', async () => {
    const ai = mk({ GROQ_API_KEY: 'q', ANTHROPIC_API_KEY: 'a' }); const calls: string[] = [];
    ai.fetchImpl = (async (url: string) => { calls.push(String(url)); return String(url).includes('groq') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ content: [{ text: payload() }] }) }; }) as any;
    const r = await ai.analyze(input);
    expect(calls).toEqual(['https://api.groq.com/openai/v1/chat/completions', 'https://api.anthropic.com/v1/messages']); expect(r.source).toBe('llm');
  });
  it('parse: RSS yangiligi uchun 3 tilli sarlavha/mazmun va 9 ta maslahat shart; noto\'g\'ri kategoriya/hudud taxminiga almashadi', () => {
    const ai = mk();
    expect(ai.parse(payload(), input, 'gemini')).not.toBeNull();
    const j1 = JSON.parse(payload()); delete j1.insights.driver.en; expect(ai.parse(JSON.stringify(j1), input, 'gemini')).toBeNull();
    const j2 = JSON.parse(payload()); delete j2.title.ru; expect(ai.parse(JSON.stringify(j2), input, 'gemini')).toBeNull();
    const j3 = JSON.parse(payload()); j3.insights.market.uz = 'x'.repeat(1000); expect(ai.parse(JSON.stringify(j3), input, 'gemini')).toBeNull();
    const bad = ai.parse(payload({ category: 'SPORT', region: 'Mars' }), input, 'gemini')!; expect(bad.category).toBe('ROADS'); expect(bad.region).toBe("Farg'ona"); // sarlavhadan taxmin
    expect(ai.parse('', input, 'groq')).toBeNull(); expect(ai.parse('{"insights":', input, 'groq')).toBeNull();
  });
  it('admin yaratganda (known) o\'zining matni va kategoriya/hududi o\'zgarmaydi, AI faqat xulosa beradi', async () => {
    const ai = mk({ GEMINI_API_KEY: 'g' });
    ai.fetchImpl = (async () => geminiRes(JSON.stringify({ category: 'MARKET', region: 'Mars', insights: { farmer: L3('farmer'), driver: L3('driver'), market: L3('market') } }))) as any;
    const r = await ai.analyze({ title: 'Qor yog\'di dovonda', text: 'matn', known: { category: 'ROADS', region: 'Samarqand', summaryUz: 'Admin matni uzun', titleRu: 'Снег' } });
    expect(r.source).toBe('gemini'); expect(r.category).toBe('ROADS'); expect(r.region).toBe('Samarqand'); expect(r.summary.uz).toBe('Admin matni uzun'); expect(r.title.ru).toBe('Снег'); expect(r.insights.driver.en).toContain('driver en');
  });
});

describe('RSS parser va kalit so\'z filtri', () => {
  const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Kun.uz</title>
    <item><title><![CDATA[Qamchiq dovonida &amp; atrofida yo'l yopiladi]]></title><link>https://kun.uz/news/2026/11/14/qamchiq</link><description><![CDATA[<p>Qor tufayli <b>dovon</b> yopildi.</p>]]></description><pubDate>Sat, 14 Nov 2026 08:00:00 +0500</pubDate></item>
    <item><title>Футбол: &quot;Пахтакор&quot; ғалаба қозонди</title><link>https://kun.uz/news/2026/11/14/futbol</link><description>Sport yangiliklari</description><pubDate>Sat, 14 Nov 2026 07:00:00 +0500</pubDate></item>
    <item><title>Бозорларда сабзавот нархи ошди</title><link>https://www.gazeta.uz/oz/2026/11/14/narx/</link><content:encoded><![CDATA[<p>Тошкент бозорларида картошка нархи кўтарилди.</p>]]></content:encoded><dc:date>2026-11-13T10:00:00Z</dc:date></item>
    <item><title>Linksiz yozuv</title><description>yo'l</description></item>
  </channel></rss>`;
  const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Fermerlar hosilni eksport qilmoqda</title><link rel="alternate" href="https://daryo.uz/2026/11/14/fermer"/><summary>Eksport hajmi oshdi</summary><updated>2026-11-14T05:00:00Z</updated></entry></feed>`;

  it('RSS 2.0: CDATA, HTML va entitilar tozalanadi; havolasiz yozuv tashlanadi; sanalar o\'qiladi', () => {
    const it = parseFeed(RSS);
    expect(it).toHaveLength(3);
    expect(it[0]).toMatchObject({ title: "Qamchiq dovonida & atrofida yo'l yopiladi", link: 'https://kun.uz/news/2026/11/14/qamchiq', description: 'Qor tufayli dovon yopildi.' });
    expect(it[0].publishedAt!.toISOString()).toBe('2026-11-14T03:00:00.000Z');
    expect(it[1].title).toBe('Футбол: "Пахтакор" ғалаба қозонди');
    expect(it[2].description).toContain('Тошкент бозорларида'); expect(it[2].publishedAt!.toISOString()).toBe('2026-11-13T10:00:00.000Z');
  });
  it('Atom (<entry href>) va bo\'sh/yaroqsiz XML', () => {
    expect(parseFeed(ATOM)).toEqual([expect.objectContaining({ title: 'Fermerlar hosilni eksport qilmoqda', link: 'https://daryo.uz/2026/11/14/fermer' })]);
    expect(parseFeed('')).toEqual([]); expect(parseFeed('<html>404</html>')).toEqual([]);
  });
  it('kalit so\'z filtri: yo\'l/transport va qishloq xo\'jaligi/bozor mavzulari o\'tadi, sport o\'tmaydi', () => {
    const [a, b, c] = parseFeed(RSS);
    expect(matchKeywords(a.title, a.description)).toMatchObject({ matched: true, road: expect.any(Number) });
    expect(matchKeywords(b.title, b.description).matched).toBe(false);
    expect(matchKeywords(c.title, c.description)).toMatchObject({ matched: true }); // kirill matn lotinga o'giriladi: bozor, sabzavot, narx
    const cases: [string, boolean][] = [
      ["Samarqandda tirbandlik kuchaydi", true], ["Dizel narxi oshdi", true], ["Metan ta'minoti yaxshilandi", true], ["Yomg'ir va sel xavfi", true], ['Ob-havo: qor yog\'adi', true],
      ['Haydovchilar uchun yangi qoidalar', true], ['Yuk mashinalari navbatda', true], ['Dehqonlar paxta terimini yakunladi', true], ["G'alla yetishtirish rejasi", true], ["Qishloq xo'jaligi vazirligi hisoboti", true],
      ['Meva-sabzavot eksporti ortdi', true], ['Omborlarda zaxira yetarli', true], ['Oziq-ovqat narxlari barqaror', true],
      ['Yuksak cho\'qqini zabt etdi', false], ['Selfi olish mashhur bo\'ldi', false], ['Futbol chempionati boshlandi', false], ['Yangi kino premyerasi', false],
    ];
    for (const [t, exp] of cases) expect([t, matchKeywords(t).matched]).toEqual([t, exp]);
  });
  it('kategoriya va hudud taxmini', () => {
    expect(guessCategory("Qamchiq dovonida qor yog'di")).toBe('ROADS');
    expect(guessCategory('Bozorlarda narx oshdi')).toBe('MARKET');
    expect(guessCategory('Fermerlar hosilni yig\'moqda')).toBe('AGRO');
    expect(guessCategory('Dizel narxi va yuk transporti')).toBe('LOGISTICS');
    expect(guessRegion("Samarqandda yo'l yopiladi")).toBe('Samarqand'); expect(guessRegion('Тошкент бозорлари')).toBe('Toshkent'); expect(guessRegion('Toshkent viloyatida')).toBe('Toshkent viloyati');
    expect(guessRegion("Qamchiq dovoni")).toBe("Farg'ona"); expect(guessRegion('Butun mamlakat bo\'ylab')).toBe('Respublika');
    expect(toLatin('Ўзбекистон ҳосил қишлоқ ғалла')).toBe("O'zbekiston hosil qishloq g'alla");
  });
  it('NEWS_FEEDS ro\'yxati va standart uchta manba', () => {
    expect(parseFeedList().map((f) => f.url)).toEqual(['https://kun.uz/news/rss', 'https://daryo.uz/feed/', 'https://www.gazeta.uz/oz/rss/']);
    expect(parseFeedList('A|https://a.uz/rss, B|http://b.uz/x?y=1|z, yaroqsiz')).toEqual([{ name: 'A', url: 'https://a.uz/rss' }, { name: 'B', url: 'http://b.uz/x?y=1|z' }]);
    expect(parseFeedList('yaroqsiz')).toHaveLength(3);
  });
});

describe('avto-migratsiya yordamchilari', () => {
  it('splitSql: sharhlar tashlanadi, buyruqlar to\'g\'ri bo\'linadi, matn ichidagi ; saqlanadi', () => {
    const sql = `-- CreateEnum\nCREATE TYPE "X" AS ENUM ('A', 'B;C');\n\n-- CreateTable\nCREATE TABLE "T" (\n  "id" TEXT NOT NULL,\n  CONSTRAINT "T_pkey" PRIMARY KEY ("id")\n);\n\nCREATE INDEX "i" ON "T"("id");\n`;
    expect(splitSql(sql)).toEqual([`CREATE TYPE "X" AS ENUM ('A', 'B;C')`, `CREATE TABLE "T" (\n  "id" TEXT NOT NULL,\n  CONSTRAINT "T_pkey" PRIMARY KEY ("id")\n)`, `CREATE INDEX "i" ON "T"("id")`]);
    expect(splitSql('')).toEqual([]);
  });
});

describe('role → insight mapping va serialize (xavfsizlik)', () => {
  it('rollar', () => {
    expect(insightRoleFor(Role.FARMER)).toBe('farmer'); expect(insightRoleFor(Role.DRIVER)).toBe('driver'); expect(insightRoleFor(Role.MARKET)).toBe('market');
    expect(insightRoleFor(Role.ADMIN)).toBe('all'); expect(insightRoleFor(Role.DISPATCHER)).toBe('all'); expect(insightRoleFor(undefined)).toBeNull();
  });
  const row: any = { id: 'x', titleUz: 'a', titleRu: 'b', titleEn: 'c', summaryUz: 'a', summaryRu: 'b', summaryEn: 'c', category: 'ROADS', region: 'Samarqand', publishedAt: new Date(), isActive: true, aiSource: 'llm' };
  for (const r of ['Farmer', 'Driver', 'Market']) for (const l of ['Uz', 'Ru', 'En']) row[`aiInsight${r}${l}`] = `${r}-${l}`;
  const svc = new NewsService({} as any, {} as any, env());
  it('mehmonga hech qanday ai* maydon yuborilmaydi (kalit ham)', () => {
    const o = svc.serialize(row, null); expect(Object.keys(o).filter((k) => /^ai/i.test(k))).toEqual([]);
    expect(JSON.stringify(o)).not.toMatch(/Farmer-|Driver-|Market-|aiInsight|aiSource/);
  });
  it('har bir rol faqat o\'z xulosasini oladi', () => {
    const f: any = svc.serialize(row, { role: Role.FARMER }); expect(f.aiInsight).toEqual({ role: 'FARMER', uz: 'Farmer-Uz', ru: 'Farmer-Ru', en: 'Farmer-En' }); expect(JSON.stringify(f)).not.toMatch(/Driver-|Market-/);
    const d: any = svc.serialize(row, { role: Role.DRIVER }); expect(d.aiInsight.role).toBe('DRIVER'); expect(JSON.stringify(d)).not.toMatch(/Farmer-|Market-/);
    const m: any = svc.serialize(row, { role: Role.MARKET }); expect(m.aiInsight.uz).toBe('Market-Uz'); expect(JSON.stringify(m)).not.toMatch(/Farmer-|Driver-/);
  });
  it('admin/dispetcher uchala rolni va holatni ko\'radi', () => {
    const a: any = svc.serialize(row, { role: Role.ADMIN }); expect(Object.keys(a.aiInsights)).toEqual(['farmer', 'driver', 'market']); expect(a.isActive).toBe(true); expect(a.aiInsight).toBeUndefined();
  });
});
