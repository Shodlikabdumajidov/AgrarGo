import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { NewsAiService } from './news-ai.service';
import { FeedSource, matchKeywords, parseFeed, parseFeedList, RssItem } from './news-feed';
import { NewsService } from './news.service';

export interface IngestResult {
  fetched: number; matched: number; created: number; duplicates: number; failedFeeds: string[]; aiSources: Record<string, number>; running?: boolean;
}

const MAX_AGE_MS = 5 * 86_400_000; // 5 kundan eski xabarlar olinmaydi
const MAX_NEW_PER_FEED = 5;
const MAX_NEW_PER_RUN = 12; // bepul AI limitini tejash

/** O'zbekiston axborot saytlari RSS tasmalaridan Agro & Logistika yangiliklarini (kalit so'z filtri bilan) tortadi, AI bilan tahlil qilib saqlaydi. */
@Injectable()
export class NewsIngestorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('NewsIngest');
  /** Testlarda almashtiriladi */
  fetchImpl: typeof fetch = (...a) => fetch(...a);
  private timer: NodeJS.Timeout | null = null;
  private boot: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly ai: NewsAiService, private readonly news: NewsService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  get feeds(): FeedSource[] { return parseFeedList(this.env.NEWS_FEEDS); }

  onModuleInit() {
    if (this.env.NODE_ENV === 'test' || !this.env.NEWS_INGEST_ENABLED) return;
    // Ishga tushgach (cold start tugagach) bir marta, so'ng har NEWS_INGEST_INTERVAL_MIN daqiqada (standart 2 soat)
    this.boot = setTimeout(() => { void this.run().catch(() => undefined); }, 20_000);
    this.timer = setInterval(() => { void this.run().catch(() => undefined); }, this.env.NEWS_INGEST_INTERVAL_MIN * 60_000);
    this.boot.unref?.(); this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); if (this.boot) clearTimeout(this.boot); }

  private async fetchXml(f: FeedSource): Promise<string> {
    const res = await this.fetchImpl(f.url, { headers: { 'user-agent': 'AgrarGoBot/1.0 (+news aggregator)', accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(12_000), redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  /** Bir marta ishga tushiradi; parallel chaqiruvlar bir-birini kutmaydi (running=true qaytadi) */
  async run(): Promise<IngestResult> {
    const out: IngestResult = { fetched: 0, matched: 0, created: 0, duplicates: 0, failedFeeds: [], aiSources: {} };
    if (this.running) return { ...out, running: true };
    this.running = true;
    try {
      const cutoff = Date.now() - MAX_AGE_MS;
      for (const feed of this.feeds) {
        if (out.created >= MAX_NEW_PER_RUN) break;
        let items: RssItem[];
        try { items = parseFeed(await this.fetchXml(feed)); } catch (e) { out.failedFeeds.push(feed.name); this.logger.warn(`${feed.name}: ${(e as Error).message}`); continue; }
        out.fetched += items.length;
        const fresh = items.filter((it) => (!it.publishedAt || it.publishedAt.getTime() >= cutoff) && matchKeywords(it.title, it.description).matched);
        out.matched += fresh.length;
        const known = new Set((await this.prisma.agroNews.findMany({ where: { sourceUrl: { in: fresh.map((f) => f.link) } }, select: { sourceUrl: true } })).map((r) => r.sourceUrl));
        let created = 0;
        for (const it of fresh) {
          if (known.has(it.link)) { out.duplicates++; continue; }
          if (created >= MAX_NEW_PER_FEED || out.created >= MAX_NEW_PER_RUN) break;
          try {
            const a = await this.ai.analyze({ title: it.title, text: it.description, sourceName: feed.name });
            await this.news.createFromAnalysis(a, { publishedAt: it.publishedAt && it.publishedAt.getTime() <= Date.now() ? it.publishedAt : new Date(), sourceUrl: it.link, sourceName: feed.name });
            created++; out.created++; out.aiSources[a.source] = (out.aiSources[a.source] ?? 0) + 1;
          } catch (e) {
            if ((e as any)?.code === 'P2002') out.duplicates++; // parallel instansiya allaqachon saqlagan (sourceUrl unique)
            else this.logger.warn(`${feed.name}: "${it.title.slice(0, 50)}" saqlanmadi: ${(e as Error).message}`);
          }
        }
      }
      if (out.created) this.logger.log(`RSS: ${out.created} ta yangi yangilik (${JSON.stringify(out.aiSources)})`);
      return out;
    } finally { this.running = false; }
  }
}
