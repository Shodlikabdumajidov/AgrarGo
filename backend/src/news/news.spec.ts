import { Role } from '@prisma/client';
import { validateEnv } from '../config/env.validation';
import { NewsAiService } from './news-ai.service';
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

describe('NewsAiService', () => {
  const input = { titleUz: "Qamchiq dovonida qor", summaryUz: "Dovonda qor va tuman kutilmoqda, ehtiyot bo'ling.", category: 'ROADS' as const, region: "Farg'ona" };
  const good = (extra: any = {}) => JSON.stringify({ insights: Object.fromEntries(['farmer', 'driver', 'market'].map((r) => [r, { uz: `${r} uz maslahat matni uchun yetarli uzunlik`, ru: `${r} ru совет достаточной длины для проверки`, en: `${r} en advice of sufficient length for the check` }])), translations: {}, ...extra });
  const mk = (e = env()) => new NewsAiService(e);

  it('API kalit yo\'q bo\'lsa tarmoqqa chiqmaydi va shablon qaytaradi', async () => {
    const ai = mk(); const f = jest.fn(); ai.fetchImpl = f as any;
    const r = await ai.generate(input);
    expect(f).not.toHaveBeenCalled(); expect(ai.llmEnabled).toBe(false);
    expect(r.source).toBe('template'); expect(r.insights.driver.uz.length).toBeGreaterThan(40);
  });
  it('kalit bo\'lsa Anthropic API\'ni to\'g\'ri sarlavhalar va modelda chaqiradi, javobni qabul qiladi', async () => {
    const ai = mk(env({ ANTHROPIC_API_KEY: 'sk-test', NEWS_AI_MODEL: 'm-1' }));
    const f = jest.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'Mana javob:\n' + good({ translations: { titleRu: 'Снег на перевале Камчик' } }) }] }) }));
    ai.fetchImpl = f as any;
    const r = await ai.generate(input);
    expect(r.source).toBe('llm'); expect(r.translations.titleRu).toBe('Снег на перевале Камчик'); expect(r.insights.farmer.ru).toContain('farmer ru');
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-test'); expect(init.headers['anthropic-version']).toBeTruthy();
    const body = JSON.parse(init.body); expect(body.model).toBe('m-1'); expect(body.messages[0].content).toContain("Qamchiq dovonida qor"); expect(body.messages[0].content).toContain('ROADS');
  });
  it('API xatosi, tarmoq xatosi yoki yaroqsiz JSON bo\'lsa shablonga tushadi (yangilik yaratish buzilmaydi)', async () => {
    for (const impl of [async () => ({ ok: false, status: 500 }), async () => { throw new Error('ECONNRESET'); }, async () => ({ ok: true, json: async () => ({ content: [{ text: 'bu JSON emas' }] }) }), async () => ({ ok: true, json: async () => ({ content: [{ text: JSON.stringify({ insights: { farmer: { uz: 'qisqa' } } }) }] }) })]) {
      const ai = mk(env({ ANTHROPIC_API_KEY: 'sk-test' })); ai.fetchImpl = impl as any;
      const r = await ai.generate(input); expect(r.source).toBe('template'); expect(r.insights.market.en.length).toBeGreaterThan(40);
    }
  });
  it('parse: 9 ta matndan biri yetishmasa yoki juda uzun bo\'lsa null', () => {
    const ai = mk(); expect(ai.parse(good())).not.toBeNull();
    const j = JSON.parse(good()); delete j.insights.driver.en; expect(ai.parse(JSON.stringify(j))).toBeNull();
    const k = JSON.parse(good()); k.insights.market.uz = 'x'.repeat(1000); expect(ai.parse(JSON.stringify(k))).toBeNull();
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
