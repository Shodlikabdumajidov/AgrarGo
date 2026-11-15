// RSS/Atom tasmasini o'qish, Agro & Logistika kalit so'z filtri, kategoriya/hudud taxmini — toza funksiyalar (tarmoqsiz, testlanadi).
import { NewsCategory } from '@prisma/client';

export interface FeedSource { name: string; url: string }
export interface RssItem { title: string; link: string; description: string; publishedAt: Date | null }

export const DEFAULT_FEEDS: FeedSource[] = [
  { name: 'Kun.uz', url: 'https://kun.uz/news/rss' },
  { name: 'Daryo.uz', url: 'https://daryo.uz/feed/' },
  { name: 'Gazeta.uz', url: 'https://www.gazeta.uz/oz/rss/' },
];

/** NEWS_FEEDS="Nomi|https://..,Nomi2|https://.." */
export function parseFeedList(raw?: string): FeedSource[] {
  if (!raw || !raw.trim()) return DEFAULT_FEEDS;
  const out = raw.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [n, ...u] = x.split('|'); const url = u.join('|').trim(); return { name: n.trim(), url }; }).filter((f) => f.name && /^https?:\/\//i.test(f.url));
  return out.length ? out : DEFAULT_FEEDS;
}

// ---------- RSS parser ----------
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const cdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
export function stripHtml(s: string): string {
  return decodeEntities(cdata(s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

/** RSS 2.0 (<item>) va Atom (<entry>) ni o'qiydi; yaroqsiz yozuvlar tashlanadi */
export function parseFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of blocks) {
    const title = stripHtml(tag(b, 'title'));
    let link = stripHtml(tag(b, 'link'));
    if (!link) { const m = b.match(/<link[^>]*\shref=["']([^"']+)["']/i); link = m ? decodeEntities(m[1]) : stripHtml(tag(b, 'guid')); }
    const description = stripHtml(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content'));
    const d = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const t = d ? new Date(stripHtml(d)) : null;
    if (!title || !/^https?:\/\//i.test(link)) continue;
    items.push({ title, link: link.slice(0, 500), description, publishedAt: t && !isNaN(t.getTime()) ? t : null });
  }
  return items;
}

// ---------- Matn normallashtirish (kirill → lotin, apostrof) ----------
const CYR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h' };
export function toLatin(s: string): string {
  return s.replace(/[А-Яа-яЁёЎўҚқҒғҲҳ]/g, (ch) => { const l = ch.toLowerCase(); const r = CYR[l] ?? ch; return ch !== l ? r.charAt(0).toUpperCase() + r.slice(1) : r; });
}
export function normalize(s: string): string {
  return toLatin(s).toLowerCase().replace(/[ʻʼ’‘`´]/g, "'").replace(/\s+/g, ' ');
}

// ---------- Kalit so'z filtri ----------
/** "*" — o'zak (har qanday qo'shimcha), aks holda — so'z + odatiy qo'shimchalar. Faqat so'z boshida mos keladi. */
export const ROAD_KEYWORDS = ["yo'l*", 'dovon*', 'qamchiq*', 'tirband*', 'yopil*', 'transport*', 'yuk', 'yuklar', 'yuk tashish*', 'haydovchi*', 'metan', 'benzin*', 'dizel*', 'ob-havo*', 'ob havo*', 'qor', 'qorli', "yomg'ir*", 'sel', 'sellar'];
export const AGRO_KEYWORDS = ["qishloq xo'jaligi*", 'fermer*', 'dehqon*', 'hosil*', 'meva*', 'sabzavot*', 'bozor*', 'narx*', 'eksport*', 'oziq-ovqat*', 'oziq ovqat*', 'ombor*', 'paxta', 'paxtasi', 'paxtachilik*', "g'alla*", 'poliz*'];
const SUFFIX = "(?:lar|larning|larni|lari|ning|ni|ga|da|dan|ka|ki|i|si|ini|ida|imiz|ingiz)?";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function kwRegex(kw: string): RegExp {
  const stem = kw.endsWith('*'); const w = esc(stem ? kw.slice(0, -1) : kw).replace(/ /g, '\\s+');
  return new RegExp(`(?<![a-z'])${w}${stem ? "[a-z']*" : SUFFIX}(?![a-z'])`, 'i');
}
const ROAD_RE = ROAD_KEYWORDS.map(kwRegex), AGRO_RE = AGRO_KEYWORDS.map(kwRegex);
const hits = (re: RegExp[], t: string) => re.filter((r) => r.test(t)).length;

export interface KeywordMatch { matched: boolean; road: number; agro: number }
export function matchKeywords(title: string, text = ''): KeywordMatch {
  const t = normalize(`${title}. ${text}`);
  const road = hits(ROAD_RE, t), agro = hits(AGRO_RE, t);
  return { matched: road + agro > 0, road, agro };
}

// ---------- Kategoriya va hudud taxmini (AI bo'lmaganda) ----------
const CAT_RE: Record<NewsCategory, RegExp[]> = {
  ROADS: ["yo'l*", 'dovon*', 'qamchiq*', 'tirband*', 'yopil*', 'ob-havo*', 'ob havo*', 'qor', 'qorli', "yomg'ir*", 'sel', 'sellar'].map(kwRegex),
  LOGISTICS: ['transport*', 'yuk', 'yuklar', 'yuk tashish*', 'haydovchi*', 'metan', 'benzin*', 'dizel*', 'ombor*'].map(kwRegex),
  MARKET: ['bozor*', 'narx*', 'eksport*', 'oziq-ovqat*', 'oziq ovqat*'].map(kwRegex),
  AGRO: ["qishloq xo'jaligi*", 'fermer*', 'dehqon*', 'hosil*', 'meva*', 'sabzavot*', 'paxta', 'paxtasi', 'paxtachilik*', "g'alla*", 'poliz*'].map(kwRegex),
};
export function guessCategory(title: string, text = ''): NewsCategory {
  const t = normalize(`${title}. ${title}. ${text}`); // sarlavha ikki hissa muhim
  let best: NewsCategory = 'AGRO', bs = 0;
  (Object.keys(CAT_RE) as NewsCategory[]).forEach((c) => { const s = hits(CAT_RE[c], t); if (s > bs) { bs = s; best = c; } });
  return best;
}

const REGION_PATTERNS: [string, RegExp][] = [
  ['Toshkent viloyati', /toshkent viloyat/], ['Toshkent', /toshkent/], ['Samarqand', /samarqand/], ["Farg'ona", /farg'ona|qamchiq/], ['Andijon', /andijon/], ['Namangan', /namangan/],
  ['Buxoro', /buxoro/], ['Navoiy', /navoiy/], ['Jizzax', /jizzax/], ['Sirdaryo', /sirdaryo/], ['Qashqadaryo', /qashqadaryo|qarshi/], ['Surxondaryo', /surxondaryo|termiz/],
  ['Xorazm', /xorazm|urganch/], ["Qoraqalpog'iston", /qoraqalpog'iston|nukus/],
];
export function guessRegion(title: string, text = ''): string {
  // Avval sarlavhadan (eng ishonchli), topilmasa matndan qidiriladi
  for (const src of [normalize(title), normalize(`${title}. ${text}`)]) for (const [name, re] of REGION_PATTERNS) if (re.test(src)) return name;
  return 'Respublika';
}
