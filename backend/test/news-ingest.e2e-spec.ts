import { NewsAiService } from '../src/news/news-ai.service';
import { NewsIngestorService } from '../src/news/news-ingestor.service';
import { bearer, bootApp, createAdmin, registerDriver, registerFarmer, resetDb, TestApp } from './helpers';

const L3 = (p: string) => ({ uz: `${p} uz maslahat matni yetarli`, ru: `${p} ru совет достаточной длины`, en: `${p} en advice long enough` });
const rss = (items: { t: string; l: string; d?: string; date?: Date }[]) => `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${items.map((i) => `<item><title><![CDATA[${i.t}]]></title><link>${i.l}</link><description><![CDATA[${i.d ?? ''}]]></description><pubDate>${(i.date ?? new Date()).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

const KUN = rss([
  { t: "Qamchiq dovonida qor yog'di, yo'l yopilishi mumkin", l: 'https://kun.uz/news/a1', d: "Farg'ona va Toshkent o'rtasidagi dovonda qor.", date: hoursAgo(2) },
  { t: 'Toshkent bozorlarida sabzavot narxi oshdi', l: 'https://kun.uz/news/a2', d: 'Kartoshka va piyoz narxi o\'sdi.', date: hoursAgo(5) },
  { t: 'Futbol: yangi mavsum boshlandi', l: 'https://kun.uz/news/a3', d: 'Sport yangiliklari', date: hoursAgo(1) },
  { t: "Eski yo'l ta'miri haqida xabar", l: 'https://kun.uz/news/old', d: "yo'l", date: new Date(Date.now() - 30 * 86_400_000) },
]);

describe('RSS yangiliklar ingestori + Gemini/Groq zanjiri (e2e)', () => {
  let t: TestApp; let ing: NewsIngestorService; let ai: NewsAiService;
  const calls: string[] = [];
  let geminiMode: 'ok' | 'limit' = 'ok'; let groqMode: 'ok' | 'fail' = 'ok';

  const aiAnswer = (prompt: string) => {
    const title = (prompt.match(/^Title: (.*)$/m) || [])[1] ?? '';
    const category = /dovon|yo'l/i.test(title) ? 'ROADS' : 'MARKET'; const region = /Qamchiq/.test(title) ? "Farg'ona" : 'Toshkent';
    return JSON.stringify({ category, region, title: { uz: `${title} (uz)`, ru: `РУС: ${title}`, en: `EN: ${title}` }, summary: L3('Mazmun'), insights: { farmer: L3('farmer'), driver: L3('driver'), market: L3('market') } });
  };

  beforeAll(async () => {
    t = await bootApp({ GEMINI_API_KEY: 'g-test', GROQ_API_KEY: 'q-test', NEWS_FEEDS: 'Kun.uz|https://kun.uz/news/rss,Daryo.uz|https://daryo.uz/feed/' });
    await t.app.listen(0); // supertest uchun barqaror manzil
    ing = t.app.get(NewsIngestorService); ai = t.app.get(NewsAiService);
    ing.fetchImpl = (async (url: string) => {
      calls.push(String(url));
      if (String(url).includes('kun.uz')) return { ok: true, status: 200, text: async () => feedXml.kun };
      if (String(url).includes('daryo.uz')) return { ok: feedXml.daryo !== null, status: feedXml.daryo === null ? 500 : 200, text: async () => feedXml.daryo ?? '' };
      throw new Error('kutilmagan URL ' + url);
    }) as any;
    ai.fetchImpl = (async (url: string, init: any) => {
      calls.push(String(url));
      const body = JSON.parse(init.body);
      if (String(url).includes('googleapis')) { if (geminiMode === 'limit') return { ok: false, status: 429 }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: aiAnswer(body.contents[0].parts[0].text) }] } }] }) }; }
      if (String(url).includes('groq')) { if (groqMode === 'fail') return { ok: false, status: 503 }; return { ok: true, json: async () => ({ choices: [{ message: { content: aiAnswer(body.messages[0].content) } }] }) }; }
      throw new Error('kutilmagan AI URL ' + url);
    }) as any;
  });
  afterAll(async () => { await t.close(); });
  const feedXml: { kun: string; daryo: string | null } = { kun: KUN, daryo: null };
  beforeEach(async () => { await resetDb(t.prisma); calls.length = 0; geminiMode = 'ok'; groqMode = 'ok'; feedXml.kun = KUN; feedXml.daryo = null; });

  it("faqat Admin/Dispetcher yangilashni ishga tushiradi (tokensiz 401, boshqa rollar 403)", async () => {
    const farmer = await registerFarmer(t.http), driver = await registerDriver(t.http);
    expect((await t.http().post('/news/refresh')).status).toBe(401);
    expect((await t.http().post('/news/refresh').set('Authorization', bearer(farmer))).status).toBe(403);
    expect((await t.http().post('/news/refresh').set('Authorization', bearer(driver))).status).toBe(403);
    for (const role of ['ADMIN', 'DISPATCHER'] as const) expect((await t.http().post('/news/refresh').set('Authorization', bearer(await createAdmin(t, role)))).status).toBe(200);
  });

  it("kalit so'z filtri: faqat agro/logistika mavzulari, eski yozuv va sport o'tmaydi; buzilgan tasma qolganlarni to'xtatmaydi; manba nomi va havolasi saqlanadi", async () => {
    const admin = await createAdmin(t);
    const r = await t.http().post('/news/refresh').set('Authorization', bearer(admin));
    expect(r.body).toMatchObject({ fetched: 4, matched: 2, created: 2, duplicates: 0, failedFeeds: ['Daryo.uz'], aiSources: { gemini: 2 } });
    const rows = await t.prisma.agroNews.findMany({ orderBy: { publishedAt: 'desc' } });
    expect(rows.map((x) => x.sourceUrl).sort()).toEqual(['https://kun.uz/news/a1', 'https://kun.uz/news/a2']);
    const a1 = rows.find((x) => x.sourceUrl === 'https://kun.uz/news/a1')!;
    expect(a1).toMatchObject({ sourceName: 'Kun.uz', category: 'ROADS', region: "Farg'ona", aiSource: 'gemini', isActive: true });
    expect(a1.titleRu).toMatch(/^РУС: /); expect(a1.titleEn).toMatch(/^EN: /); expect(a1.aiInsightDriverRu).toContain('driver ru'); expect(a1.aiInsightMarketEn).toContain('market en');
    expect(Math.abs(a1.publishedAt.getTime() - hoursAgo(2).getTime())).toBeLessThan(5000);
    expect(calls.filter((c) => c.includes('googleapis'))).toHaveLength(2); expect(calls.some((c) => c.includes('groq'))).toBe(false);
  });

  it("dublikat: ikkinchi yangilashda sourceUrl bo'yicha tekshiriladi, qayta saqlanmaydi va AI chaqirilmaydi", async () => {
    const admin = await createAdmin(t);
    await t.http().post('/news/refresh').set('Authorization', bearer(admin));
    calls.length = 0;
    const r2 = await t.http().post('/news/refresh').set('Authorization', bearer(admin));
    expect(r2.body).toMatchObject({ created: 0, duplicates: 2 }); expect(await t.prisma.agroNews.count()).toBe(2);
    expect(calls.some((c) => c.includes('googleapis') || c.includes('groq'))).toBe(false);
    feedXml.kun = rss([{ t: "Yangi dovon yo'li ochildi", l: 'https://kun.uz/news/a9', d: 'x', date: hoursAgo(1) }, { t: "Qamchiq dovonida qor yog'di, yo'l yopilishi mumkin", l: 'https://kun.uz/news/a1', date: hoursAgo(2) }]);
    const r3 = await t.http().post('/news/refresh').set('Authorization', bearer(admin)); expect(r3.body).toMatchObject({ created: 1, duplicates: 1 }); expect(await t.prisma.agroNews.count()).toBe(3);
  });

  it("API: manba nomi mehmonga ham ko'rinadi (ai maydonsiz); kirgan fermer o'z maslahatini oladi", async () => {
    await t.http().post('/news/refresh').set('Authorization', bearer(await createAdmin(t)));
    const guest = (await t.http().get('/news')).body.items;
    expect(guest.map((x: any) => x.sourceName)).toEqual(['Kun.uz', 'Kun.uz']); expect(guest[0].sourceUrl).toMatch(/^https:\/\/kun\.uz\/news\/a[12]$/);
    expect(JSON.stringify(guest)).not.toMatch(/aiInsight|aiSource/);
    const farmer = await registerFarmer(t.http); const fi = (await t.http().get('/news').set('Authorization', bearer(farmer))).body.items;
    expect(fi[0].aiInsight).toMatchObject({ role: 'FARMER', uz: expect.stringContaining('farmer uz') });
    // admin qo'lda yaratgan yangilikda manba yo'q
    const mine = await t.http().post('/news').set('Authorization', bearer(await createAdmin(t))).send({ titleUz: "Qo'lda qo'shilgan yangilik sarlavhasi", summaryUz: "Qo'lda kiritilgan qisqa matn namunasi", category: 'AGRO' });
    expect(mine.body).toMatchObject({ sourceName: null, sourceUrl: null, aiSource: 'gemini' });
  });

  it("Gemini limiti tugasa Groq, u ham ishlamasa shablon: yangilik baribir saqlanadi", async () => {
    const admin = await createAdmin(t);
    geminiMode = 'limit';
    let r = await t.http().post('/news/refresh').set('Authorization', bearer(admin));
    expect(r.body.aiSources).toEqual({ groq: 2 });
    await resetDb(t.prisma); geminiMode = 'limit'; groqMode = 'fail';
    r = await t.http().post('/news/refresh').set('Authorization', bearer(await createAdmin(t)));
    expect(r.body).toMatchObject({ created: 2, aiSources: { template: 2 } });
    const row = await t.prisma.agroNews.findFirstOrThrow({ where: { sourceUrl: 'https://kun.uz/news/a1' } });
    expect(row.aiSource).toBe('template'); expect(row.category).toBe('ROADS'); expect(row.region).toBe("Farg'ona"); // sarlavhadan taxmin
    expect(row.aiInsightDriverUz.length).toBeGreaterThan(40); expect(row.titleUz).toContain('Qamchiq');
  });

  it("bir vaqtda ikki marta ishga tushsa ikkinchisi kutmaydi (running); har tasma uchun yangi yozuvlar soni cheklangan", async () => {
    const many = rss(Array.from({ length: 9 }, (_, i) => ({ t: `Dehqonlar hosil ${i} yig'ishtirmoqda`, l: `https://kun.uz/news/m${i}`, d: 'hosil', date: hoursAgo(i + 1) })));
    feedXml.kun = many;
    const [a, b] = await Promise.all([ing.run(), ing.run()]);
    const results = [a, b]; expect(results.filter((x) => x.running)).toHaveLength(1);
    const done = results.find((x) => !x.running)!; expect(done.created).toBe(5); expect(await t.prisma.agroNews.count()).toBe(5);
  });
});
