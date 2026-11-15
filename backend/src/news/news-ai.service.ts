import { Inject, Injectable, Logger } from '@nestjs/common';
import { NewsCategory } from '@prisma/client';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { guessCategory, guessRegion, normalize, toLatin } from './news-feed';
import { InsightRole, Insights, L3, Lang, REGION_NAMES, templateInsights } from './news-templates';

export type AiSource = 'gemini' | 'groq' | 'llm' | 'template';

export interface AnalyzeInput {
  title: string;
  text?: string;
  sourceName?: string;
  /** Admin tomonidan berilgan (o'zgarmas) qiymatlar: AI faqat yetishmaganini to'ldiradi */
  known?: { category?: NewsCategory; region?: string; titleRu?: string; titleEn?: string; summaryUz?: string; summaryRu?: string; summaryEn?: string };
}
export interface Analysis {
  category: NewsCategory;
  region: string;
  title: L3;
  summary: L3;
  insights: Insights;
  source: AiSource;
}

const ROLES: InsightRole[] = ['farmer', 'driver', 'market'];
const LANGS: Lang[] = ['uz', 'ru', 'en'];
const CATS: NewsCategory[] = ['ROADS', 'AGRO', 'MARKET', 'LOGISTICS'];
const REGIONS = Object.keys(REGION_NAMES);
const trim = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

/**
 * Yangilikni tahlil qiladi: 3 tilli qisqa mazmun, kategoriya, hudud va Fermer/Haydovchi/Market uchun 3 tilli maslahat.
 * Zanjir: Gemini (bepul, gemini-2.5-flash) → Groq → Anthropic (ixtiyoriy) → aqlli shablon. Bittasi xato/limit bersa keyingisiga o'tadi.
 */
@Injectable()
export class NewsAiService {
  private readonly logger = new Logger('NewsAI');
  /** Testlarda almashtiriladi */
  fetchImpl: typeof fetch = (...a) => fetch(...a);

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  /** Qaysi provayderlar sozlangan (tartib bilan) */
  providers(): AiSource[] {
    const p: AiSource[] = [];
    if (this.env.GEMINI_API_KEY) p.push('gemini');
    if (this.env.GROQ_API_KEY) p.push('groq');
    if (this.env.ANTHROPIC_API_KEY) p.push('llm');
    return p;
  }
  get llmEnabled(): boolean { return this.providers().length > 0; }

  async analyze(input: AnalyzeInput): Promise<Analysis> {
    const prompt = this.prompt(input);
    for (const p of this.providers()) {
      try {
        const raw = await this.call(p, prompt);
        const a = this.parse(raw, input, p);
        if (a) return a;
        this.logger.warn(`${p}: javob yaroqsiz, keyingi provayderga o'tildi`);
      } catch (e) {
        this.logger.warn(`${p}: ${(e as Error).message} — keyingi provayderga o'tildi`);
      }
    }
    return this.template(input);
  }

  // ---------- Prompt ----------
  prompt(i: AnalyzeInput): string {
    const k = i.known ?? {};
    return [
      'You are an agro-logistics analyst for Uzbekistan. Read the news item below (it may be in Uzbek Latin, Uzbek Cyrillic or Russian) and produce ONE JSON object.',
      `Source: ${i.sourceName ?? 'AgrarGo'}`,
      `Title: ${i.title}`,
      i.text ? `Text: ${trim(i.text, 1200)}` : '',
      k.category ? `Category is FIXED: ${k.category}` : `Pick "category" from: ROADS (roads, traffic, weather on routes), AGRO (farming, crops, harvest), MARKET (markets, prices, export, food), LOGISTICS (freight, trucks, fuel, warehouses).`,
      k.region ? `Region is FIXED: ${k.region}` : `Pick "region" from: ${REGIONS.join(', ')} (use "Respublika" when nationwide or unclear).`,
      'Write "title" and "summary" in uz (Uzbek Latin), ru (Russian) and en (English): title up to 140 chars, summary 1–2 sentences up to 300 chars, faithful to the source, no invented facts.',
      'Write "insights": practical advice/warning for each role, each in uz, ru and en, 1–3 concrete sentences (max 380 chars): farmer (harvest, timing, pricing, storage), driver (road/time/route warnings, safety, fuel, best departure window), market (sourcing, stock, contracts, price risk). Base it on THIS news; no invented statistics.',
      'Answer with ONLY JSON in exactly this shape:',
      '{"category":"","region":"","title":{"uz":"","ru":"","en":""},"summary":{"uz":"","ru":"","en":""},"insights":{"farmer":{"uz":"","ru":"","en":""},"driver":{"uz":"","ru":"","en":""},"market":{"uz":"","ru":"","en":""}}}',
    ].filter(Boolean).join('\n');
  }

  // ---------- Provayder chaqiruvlari ----------
  private async post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
    const res = await this.fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new Error(res.status === 429 ? 'limit tugadi (HTTP 429)' : `HTTP ${res.status}`);
    return res.json();
  }

  private async call(p: AiSource, prompt: string): Promise<string> {
    if (p === 'gemini') {
      const j = await this.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.env.GEMINI_MODEL)}:generateContent`, { 'x-goog-api-key': this.env.GEMINI_API_KEY as string },
        { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json', maxOutputTokens: 4096 } });
      return (j?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x?.text ?? '').join('');
    }
    if (p === 'groq') {
      const j = await this.post('https://api.groq.com/openai/v1/chat/completions', { authorization: `Bearer ${this.env.GROQ_API_KEY}` },
        { model: this.env.GROQ_MODEL, temperature: 0.3, max_tokens: 3000, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] });
      return j?.choices?.[0]?.message?.content ?? '';
    }
    const j = await this.post('https://api.anthropic.com/v1/messages', { 'x-api-key': this.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01' },
      { model: this.env.NEWS_AI_MODEL, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] });
    return (j?.content ?? []).map((c: any) => c?.text ?? '').join('');
  }

  // ---------- Javobni tekshirish ----------
  /** Model javobini (```json ...``` ham bo'lishi mumkin) tekshiradi; 9 ta maslahat matni yaroqli bo'lmasa null (keyingi provayder / shablon) */
  parse(raw: string, input: AnalyzeInput, source: AiSource): Analysis | null {
    const m = (raw || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    let j: any;
    try { j = JSON.parse(m[0]); } catch { return null; }
    const insights = {} as Insights;
    for (const role of ROLES) {
      insights[role] = {} as L3;
      for (const lang of LANGS) {
        const v = j?.insights?.[role]?.[lang];
        if (typeof v !== 'string' || v.trim().length < 20 || v.length > 900) return null;
        insights[role][lang] = v.trim();
      }
    }
    const k = input.known ?? {};
    const pick = (o: any, l: Lang, max: number): string | null => (typeof o?.[l] === 'string' && o[l].trim().length >= 5 ? trim(o[l].trim(), max) : null);
    const title = {} as L3, summary = {} as L3;
    for (const l of LANGS) {
      const t = pick(j.title, l, 200), sm = pick(j.summary, l, 600);
      // RSS yangiligi (known yo'q): 3 tilli matn to'liq bo'lishi shart. Admin yaratganda — o'zi bergan matn yetarli.
      if (!input.known && (!t || !sm)) return null;
      const baseSum = trim(input.text || input.title, 300);
      title[l] = t ?? (l === 'ru' ? k.titleRu : l === 'en' ? k.titleEn : undefined) ?? toLatin(input.title);
      summary[l] = sm ?? (l === 'uz' ? k.summaryUz : l === 'ru' ? k.summaryRu : k.summaryEn) ?? baseSum;
    }
    const category: NewsCategory = k.category ?? (CATS.includes(j.category) ? j.category : guessCategory(input.title, input.text));
    const region = k.region ?? (typeof j.region === 'string' && REGIONS.includes(j.region) ? j.region : guessRegion(input.title, input.text));
    return { category, region, title, summary, insights, source };
  }

  // ---------- Zaxira: aqlli shablon ----------
  template(input: AnalyzeInput): Analysis {
    const k = input.known ?? {};
    const text = [input.title, input.text, k.summaryUz].filter(Boolean).join(' ');
    const category = k.category ?? guessCategory(input.title, input.text);
    const region = k.region ?? guessRegion(input.title, input.text);
    const uzTitle = toLatin(input.title);
    const uzSum = k.summaryUz ?? trim(toLatin(input.text || input.title), 300);
    return {
      category, region,
      title: { uz: uzTitle, ru: k.titleRu ?? uzTitle, en: k.titleEn ?? uzTitle },
      summary: { uz: uzSum, ru: k.summaryRu ?? uzSum, en: k.summaryEn ?? uzSum },
      insights: templateInsights({ category, region, text: normalize(text) }),
      source: 'template',
    };
  }
}
