import { Inject, Injectable, Logger } from '@nestjs/common';
import { NewsCategory } from '@prisma/client';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { Insights, L3, Lang, InsightRole, templateInsights } from './news-templates';

export interface NewsText {
  titleUz: string; titleRu?: string; titleEn?: string;
  summaryUz: string; summaryRu?: string; summaryEn?: string;
  category: NewsCategory; region: string;
}
export interface NewsAiResult {
  insights: Insights;
  /** LLM yetishmayotgan ru/en matnlarni ham tarjima qilib bergan bo'lsa */
  translations: Partial<Record<'titleRu' | 'titleEn' | 'summaryRu' | 'summaryEn', string>>;
  source: 'llm' | 'template';
}

const ROLES: InsightRole[] = ['farmer', 'driver', 'market'];
const LANGS: Lang[] = ['uz', 'ru', 'en'];

/** Yangilik matnini tahlil qilib, rollarga (fermer/haydovchi/market) mos 3 tilli maslahat yaratadi. API kalit bo'lmasa yoki xato bo'lsa — aqlli shablon. */
@Injectable()
export class NewsAiService {
  private readonly logger = new Logger('NewsAI');
  /** Testlarda almashtiriladi */
  fetchImpl: typeof fetch = (...a) => fetch(...a);

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  get llmEnabled(): boolean { return !!this.env.ANTHROPIC_API_KEY; }

  async generate(n: NewsText): Promise<NewsAiResult> {
    const text = [n.titleUz, n.summaryUz, n.titleRu, n.summaryRu, n.titleEn, n.summaryEn].filter(Boolean).join(' ');
    const fallback = (): NewsAiResult => ({ insights: templateInsights({ category: n.category, region: n.region, text }), translations: {}, source: 'template' });
    if (!this.llmEnabled) return fallback();
    try {
      const r = await this.callLlm(n);
      if (r) return r;
    } catch (e) {
      this.logger.warn(`AI API xatosi, shablonga o'tildi: ${(e as Error).message}`);
    }
    return fallback();
  }

  private prompt(n: NewsText): string {
    return [
      "You are an agro-logistics analyst for Uzbekistan. Read the news and write practical advice for three roles in three languages.",
      'Roles: farmer (what to do with harvest, timing, pricing), driver (road/time/route warnings, safety, fuel), market owner (sourcing, stock, contracts).',
      'Rules: 1–3 concrete sentences per role and language (max 380 characters each), no fluff, no invented statistics, mention the region where useful.',
      'Languages: uz (Uzbek Latin), ru (Russian), en (English).',
      `Category: ${n.category}. Region: ${n.region}.`,
      `Title (uz): ${n.titleUz}`, `Summary (uz): ${n.summaryUz}`,
      n.titleRu ? `Title (ru): ${n.titleRu}` : '', n.summaryRu ? `Summary (ru): ${n.summaryRu}` : '',
      n.titleEn ? `Title (en): ${n.titleEn}` : '', n.summaryEn ? `Summary (en): ${n.summaryEn}` : '',
      'Answer with ONLY a JSON object: {"insights":{"farmer":{"uz":"","ru":"","en":""},"driver":{"uz":"","ru":"","en":""},"market":{"uz":"","ru":"","en":""}},"translations":{"titleRu":"","titleEn":"","summaryRu":"","summaryEn":""}}.',
      'In "translations" include ONLY the fields that were missing above (translated from Uzbek); otherwise use an empty object.',
    ].filter(Boolean).join('\n');
  }

  private async callLlm(n: NewsText): Promise<NewsAiResult | null> {
    const res = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.env.NEWS_AI_MODEL, max_tokens: 2000, messages: [{ role: 'user', content: this.prompt(n) }] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: any = await res.json();
    const raw: string = (body?.content ?? []).map((c: any) => c?.text ?? '').join('');
    return this.parse(raw);
  }

  /** Model javobini tekshiradi: 9 ta matn bo'lishi, uzunligi me'yorda; aks holda null (shablon ishlatiladi) */
  parse(raw: string): NewsAiResult | null {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    let j: any;
    try { j = JSON.parse(m[0]); } catch { return null; }
    const out = {} as Insights;
    for (const role of ROLES) {
      out[role] = {} as L3;
      for (const lang of LANGS) {
        const v = j?.insights?.[role]?.[lang];
        if (typeof v !== 'string' || v.trim().length < 20 || v.length > 900) return null;
        out[role][lang] = v.trim();
      }
    }
    const translations: NewsAiResult['translations'] = {};
    for (const k of ['titleRu', 'titleEn', 'summaryRu', 'summaryEn'] as const) {
      const v = j?.translations?.[k];
      if (typeof v === 'string' && v.trim().length >= 5) translations[k] = v.trim().slice(0, k.startsWith('title') ? 200 : 1500);
    }
    return { insights: out, translations, source: 'llm' };
  }
}
