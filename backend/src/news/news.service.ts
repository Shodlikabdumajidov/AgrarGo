import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { AgroNews, NewsCategory, Role } from '@prisma/client';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNewsDto, ListNewsQuery, UpdateNewsDto } from './dto/news.dto';
import { Analysis, NewsAiService } from './news-ai.service';
import { SEED_NEWS } from './news-seed';
import { InsightRole, Lang } from './news-templates';

export const NEWS_REGIONS = ['Respublika', 'Toshkent', 'Toshkent viloyati', 'Samarqand', "Farg'ona", 'Andijon', 'Namangan', 'Buxoro', 'Navoiy', 'Jizzax', 'Sirdaryo', 'Qashqadaryo', 'Surxondaryo', 'Xorazm', "Qoraqalpog'iston"];
const STAFF: Role[] = [Role.ADMIN, Role.DISPATCHER];

/** Foydalanuvchi roli → qaysi AI xulosa ko'rsatiladi (Admin/Dispetcher — hammasi) */
export function insightRoleFor(role?: Role | string | null): InsightRole | 'all' | null {
  switch (role) {
    case Role.FARMER: case Role.AGRO_SUPPLIER: return 'farmer';
    case Role.DRIVER: return 'driver';
    case Role.MARKET: case Role.CONSUMER: return 'market';
    case Role.ADMIN: case Role.DISPATCHER: return 'all';
    default: return null;
  }
}

const tri = (n: any, p: string): Record<Lang, string> => ({ uz: n[p + 'Uz'], ru: n[p + 'Ru'], en: n[p + 'En'] });

@Injectable()
export class NewsService implements OnModuleInit {
  private readonly logger = new Logger('News');
  constructor(private readonly prisma: PrismaService, private readonly ai: NewsAiService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  async onModuleInit() {
    if (this.env.NODE_ENV === 'test') return; // testlarda seed qo'lda chaqiriladi
    try { await this.ensureSeed(); } catch (e) { this.logger.warn(`Seed bajarilmadi: ${(e as Error).message}`); }
  }

  /** Jadval bo'sh bo'lsagina boshlang'ich yangiliklarni qo'shadi */
  async ensureSeed(): Promise<number> {
    if ((await this.prisma.agroNews.count()) > 0) return 0;
    const now = Date.now();
    for (const s of SEED_NEWS) {
      await this.prisma.agroNews.create({
        data: {
          titleUz: s.title.uz, titleRu: s.title.ru, titleEn: s.title.en,
          summaryUz: s.summary.uz, summaryRu: s.summary.ru, summaryEn: s.summary.en,
          category: s.category, region: s.region, publishedAt: new Date(now - s.hoursAgo * 3_600_000), aiSource: 'seed',
          aiInsightFarmerUz: s.insights.farmer.uz, aiInsightFarmerRu: s.insights.farmer.ru, aiInsightFarmerEn: s.insights.farmer.en,
          aiInsightDriverUz: s.insights.driver.uz, aiInsightDriverRu: s.insights.driver.ru, aiInsightDriverEn: s.insights.driver.en,
          aiInsightMarketUz: s.insights.market.uz, aiInsightMarketRu: s.insights.market.ru, aiInsightMarketEn: s.insights.market.en,
        },
      });
    }
    return SEED_NEWS.length;
  }

  /**
   * Mehmon uchun ai_insight_* maydonlari javobga UMUMAN qo'shilmaydi.
   * Kirgan foydalanuvchiga roliga mos `aiInsight` ({role, uz, ru, en}); Admin/Dispetcherga `aiInsights` (uchala rol).
   */
  serialize(n: AgroNews, user?: { role?: Role | string } | null) {
    const base: Record<string, unknown> = {
      id: n.id,
      titleUz: n.titleUz, titleRu: n.titleRu, titleEn: n.titleEn,
      summaryUz: n.summaryUz, summaryRu: n.summaryRu, summaryEn: n.summaryEn,
      category: n.category, region: n.region, publishedAt: n.publishedAt,
      sourceName: n.sourceName ?? null, sourceUrl: n.sourceUrl ?? null,
    };
    if (!user) return base;
    const r = insightRoleFor(user.role);
    if (user.role && STAFF.includes(user.role as Role)) { base.isActive = n.isActive; base.aiSource = n.aiSource; }
    if (r === 'all') base.aiInsights = { farmer: tri(n, 'aiInsightFarmer'), driver: tri(n, 'aiInsightDriver'), market: tri(n, 'aiInsightMarket') };
    else if (r) base.aiInsight = { role: r.toUpperCase(), ...tri(n, 'aiInsight' + r[0].toUpperCase() + r.slice(1)) };
    else base.aiInsight = null;
    return base;
  }

  async list(user: any | null, q: ListNewsQuery) {
    const staff = !!user && STAFF.includes(user.role);
    const where: any = {};
    if (!(staff && q.includeInactive)) where.isActive = true;
    if (q.category) where.category = q.category;
    if (q.region) where.region = q.region;
    const rows = await this.prisma.agroNews.findMany({ where, orderBy: { publishedAt: 'desc' }, take: q.limit ?? 30 });
    const regions = (await this.prisma.agroNews.findMany({ where: { isActive: true }, distinct: ['region'], select: { region: true } })).map((r) => r.region).sort((a, b) => a.localeCompare(b));
    return { items: rows.map((n) => this.serialize(n, user)), regions };
  }

  /** Tahlil natijasidan yozuv ma'lumoti (admin yaratishi va RSS ingestor uchun umumiy) */
  private rowData(a: Analysis) {
    const i = a.insights;
    return {
      titleUz: a.title.uz, titleRu: a.title.ru, titleEn: a.title.en, summaryUz: a.summary.uz, summaryRu: a.summary.ru, summaryEn: a.summary.en,
      category: a.category, region: a.region, aiSource: a.source,
      aiInsightFarmerUz: i.farmer.uz, aiInsightFarmerRu: i.farmer.ru, aiInsightFarmerEn: i.farmer.en,
      aiInsightDriverUz: i.driver.uz, aiInsightDriverRu: i.driver.ru, aiInsightDriverEn: i.driver.en,
      aiInsightMarketUz: i.market.uz, aiInsightMarketRu: i.market.ru, aiInsightMarketEn: i.market.en,
    };
  }

  async createFromAnalysis(a: Analysis, extra: { publishedAt?: Date; sourceUrl?: string; sourceName?: string }) {
    return this.prisma.agroNews.create({ data: { ...this.rowData(a), publishedAt: extra.publishedAt ?? new Date(), sourceUrl: extra.sourceUrl ?? null, sourceName: extra.sourceName ?? null } });
  }

  async create(dto: CreateNewsDto, user: any) {
    const region = dto.region || 'Respublika';
    const a = await this.ai.analyze({ title: dto.titleUz, text: dto.summaryUz, sourceName: 'AgrarGo', known: { category: dto.category, region, titleRu: dto.titleRu, titleEn: dto.titleEn, summaryUz: dto.summaryUz, summaryRu: dto.summaryRu, summaryEn: dto.summaryEn } });
    // Admin kiritgan matn o'zgarmaydi: AI faqat yetishmagan tarjimalarni to'ldiradi (yo'q bo'lsa — o'zbekcha matn)
    const fixed: Analysis = { ...a, title: { uz: dto.titleUz, ru: dto.titleRu ?? a.title.ru, en: dto.titleEn ?? a.title.en }, summary: { uz: dto.summaryUz, ru: dto.summaryRu ?? a.summary.ru, en: dto.summaryEn ?? a.summary.en }, category: dto.category, region };
    const row = await this.prisma.agroNews.create({ data: { ...this.rowData(fixed), publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : new Date(), isActive: dto.isActive ?? true } });
    return this.serialize(row, user);
  }

  async update(id: string, dto: UpdateNewsDto, user: any) {
    const cur = await this.prisma.agroNews.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Yangilik topilmadi');
    const { regenerateInsights, publishedAt, ...rest } = dto;
    const data: any = { ...rest };
    if (publishedAt) data.publishedAt = new Date(publishedAt);
    const textChanged = ['titleUz', 'summaryUz', 'category', 'region'].some((k) => (rest as any)[k] !== undefined && (rest as any)[k] !== (cur as any)[k]);
    if (regenerateInsights || textChanged) {
      const m = { ...cur, ...rest };
      const a = await this.ai.analyze({ title: m.titleUz, text: m.summaryUz, sourceName: m.sourceName ?? 'AgrarGo', known: { category: m.category, region: m.region, titleRu: m.titleRu, titleEn: m.titleEn, summaryUz: m.summaryUz, summaryRu: m.summaryRu, summaryEn: m.summaryEn } });
      const i = a.insights;
      Object.assign(data, {
        aiSource: a.source,
        aiInsightFarmerUz: i.farmer.uz, aiInsightFarmerRu: i.farmer.ru, aiInsightFarmerEn: i.farmer.en,
        aiInsightDriverUz: i.driver.uz, aiInsightDriverRu: i.driver.ru, aiInsightDriverEn: i.driver.en,
        aiInsightMarketUz: i.market.uz, aiInsightMarketRu: i.market.ru, aiInsightMarketEn: i.market.en,
      });
    }
    return this.serialize(await this.prisma.agroNews.update({ where: { id }, data }), user);
  }

  async remove(id: string) {
    const r = await this.prisma.agroNews.deleteMany({ where: { id } });
    if (!r.count) throw new NotFoundException('Yangilik topilmadi');
    return { ok: true };
  }
}
