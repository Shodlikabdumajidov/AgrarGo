// AI API kaliti bo'lmaganda (yoki API xato bersa) ishlatiladigan aqlli shablonlar: kategoriya + kalit so'zlar + hudud bo'yicha
// 3 ta rol (fermer, haydovchi, market) uchun 3 tilda aniq va amaliy maslahat yaratadi.
import { NewsCategory } from '@prisma/client';

export type Lang = 'uz' | 'ru' | 'en';
export type InsightRole = 'farmer' | 'driver' | 'market';
export type L3 = Record<Lang, string>;
export type Insights = Record<InsightRole, L3>;

export const REGION_NAMES: Record<string, L3> = {
  Respublika: { uz: "butun respublika bo'ylab", ru: 'по всей республике', en: 'nationwide' },
  Toshkent: { uz: 'Toshkent', ru: 'Ташкент', en: 'Tashkent' },
  'Toshkent viloyati': { uz: 'Toshkent viloyati', ru: 'Ташкентская область', en: 'Tashkent region' },
  Samarqand: { uz: 'Samarqand', ru: 'Самарканд', en: 'Samarkand' },
  "Farg'ona": { uz: "Farg'ona", ru: 'Фергана', en: 'Fergana' },
  Andijon: { uz: 'Andijon', ru: 'Андижан', en: 'Andijan' },
  Namangan: { uz: 'Namangan', ru: 'Наманган', en: 'Namangan' },
  Buxoro: { uz: 'Buxoro', ru: 'Бухара', en: 'Bukhara' },
  Navoiy: { uz: 'Navoiy', ru: 'Навои', en: 'Navoi' },
  Jizzax: { uz: 'Jizzax', ru: 'Джизак', en: 'Jizzakh' },
  Sirdaryo: { uz: 'Sirdaryo', ru: 'Сырдарья', en: 'Syrdarya' },
  Qashqadaryo: { uz: 'Qashqadaryo', ru: 'Кашкадарья', en: 'Qashkadarya' },
  Surxondaryo: { uz: 'Surxondaryo', ru: 'Сурхандарья', en: 'Surkhandarya' },
  Xorazm: { uz: 'Xorazm', ru: 'Хорезм', en: 'Khorezm' },
  "Qoraqalpog'iston": { uz: "Qoraqalpog'iston", ru: 'Каракалпакстан', en: 'Karakalpakstan' },
};

export function regionIn(region: string, lang: Lang): string {
  const r = REGION_NAMES[region];
  return r ? r[lang] : region;
}

type Tpl = Record<InsightRole, L3>;

/** {r} — hudud nomi */
const BASE: Record<NewsCategory, Tpl> = {
  ROADS: {
    farmer: {
      uz: "Hosilni yuklash va jo'natish vaqtini yo'l holatiga moslang ({r}): kechikishni oldindan haydovchi bilan kelishing, tez buziladigan mahsulotni sovuq/soyali joyda saqlang.",
      ru: 'Подстройте время погрузки и отправки под состояние дорог ({r}): заранее согласуйте сдвиг с водителем, быстропортящуюся продукцию держите в тени или холоде.',
      en: 'Adjust loading and dispatch times to road conditions ({r}): agree any delay with the driver in advance and keep perishable produce cool and shaded.',
    },
    driver: {
      uz: "Ogohlantirish: {r} yo'nalishida harakat qiyinlashishi mumkin. Ertalabki erta soatlarda (05:00–08:00) yoki kechqurun yo'lga chiqing, aylanma yo'lni oldindan belgilang va yoqilg'i zaxirasini oshiring.",
      ru: 'Предупреждение: на маршрутах {r} движение может затрудниться. Выезжайте рано утром (05:00–08:00) или вечером, заранее выберите объезд и увеличьте запас топлива.',
      en: 'Warning: traffic may be disrupted on routes around {r}. Depart early (05:00–08:00) or in the evening, plan a detour in advance and carry extra fuel.',
    },
    market: {
      uz: "Yetkazib berish muddati cho'zilishi mumkin ({r}): buyurtmani 1 kun oldinroq bering va zaxira ta'minotchini tayyor tuting.",
      ru: 'Сроки доставки могут вырасти ({r}): размещайте заказ на день раньше и держите резервного поставщика.',
      en: 'Delivery lead times may grow ({r}): place orders a day earlier and keep a backup supplier ready.',
    },
  },
  AGRO: {
    farmer: {
      uz: "Dalada ish rejasini yangilang ({r}): yig'im-terim, sug'orish yoki himoya tadbirlarini ob-havo va yangilikdagi muddatlarga moslang; hosilni sotishni erta e'lon qiling.",
      ru: 'Обновите план полевых работ ({r}): сбор урожая, полив и защитные меры привяжите к срокам из новости; объявляйте продажу урожая заранее.',
      en: 'Update your field plan ({r}): align harvesting, irrigation and protection work with the dates in the news, and list your produce early.',
    },
    driver: {
      uz: "Qishloq xo'jaligi mavsumi yuk oqimini oshiradi ({r}): fermerlar bilan oldindan kelishib, qaytish yo'lida yuk (backhaul) toping va to'liq yuklab yuring.",
      ru: 'Сельхозсезон увеличит поток грузов ({r}): договаривайтесь с фермерами заранее, ищите обратный груз и ездите с полной загрузкой.',
      en: 'The farming season will raise cargo volumes ({r}): book farmers in advance, find backhaul loads and travel fully loaded.',
    },
    market: {
      uz: "Mavsumiy ta'minot o'zgaradi ({r}): hajmni oldindan shartnoma bilan band qiling, narxni fiksatsiya qilib, sifat va qadoqlash talablarini aniqlashtiring.",
      ru: 'Сезонные поставки изменятся ({r}): заранее закрепите объёмы контрактом, зафиксируйте цену и уточните требования к качеству и упаковке.',
      en: 'Seasonal supply will shift ({r}): lock in volumes by contract, fix the price and clarify quality and packaging requirements.',
    },
  },
  MARKET: {
    farmer: {
      uz: "Narx va talab o'zgarmoqda ({r}): hosilni hammasini bir kunda sotmang, bozor narxini kuzating va talab yuqori kunlarga bo'lib jo'nating — shunda daromad oshadi.",
      ru: 'Цены и спрос меняются ({r}): не продавайте весь урожай за один день, следите за рыночной ценой и распределите отправки на дни высокого спроса.',
      en: 'Prices and demand are shifting ({r}): do not sell the whole harvest in one day — watch the market price and spread dispatches over high-demand days.',
    },
    driver: {
      uz: "Talab oshgan joyga yuk ko'p chiqadi ({r}): ertalabki ulgurji bozor soatlariga (04:00–07:00) yetib borishni rejalang va tarifni talab yuqori vaqtda to'g'rilang.",
      ru: 'Там, где растёт спрос, грузов станет больше ({r}): планируйте прибытие к утренним оптовым часам (04:00–07:00) и корректируйте тариф в часы пик спроса.',
      en: 'More freight appears where demand grows ({r}): plan to arrive for the morning wholesale hours (04:00–07:00) and adjust your rate during peak demand.',
    },
    market: {
      uz: "Xarid strategiyasini yangilang ({r}): narx oshishidan oldin zarur hajmning bir qismini hozir oling, ulgurji narxlarni 2–3 ta ta'minotchi bilan solishtiring.",
      ru: 'Обновите стратегию закупок ({r}): часть нужного объёма купите до роста цен, сравнивайте оптовые цены у 2–3 поставщиков.',
      en: 'Refresh your sourcing strategy ({r}): buy part of the needed volume before prices rise and compare wholesale quotes from 2–3 suppliers.',
    },
  },
  LOGISTICS: {
    farmer: {
      uz: "Yuk tashish sharoiti o'zgardi ({r}): jo'natishdan oldin tarif va muddatni tasdiqlang, to'liq yuk (FTL) yoki qisman yuk tanlang va hujjatlarni oldindan tayyorlang.",
      ru: 'Условия перевозки изменились ({r}): перед отправкой подтвердите тариф и сроки, выберите полную или частичную загрузку и заранее подготовьте документы.',
      en: 'Freight conditions have changed ({r}): confirm the rate and timing before dispatch, choose full or partial load and prepare documents in advance.',
    },
    driver: {
      uz: "Logistika bozori o'zgardi ({r}): marshrutni bo'sh yurishsiz tuzing, yo'lda to'xtash va dam olish vaqtini hisobga oling, tarif va yoqilg'i xarajatini qayta hisoblang.",
      ru: 'Логистический рынок изменился ({r}): стройте маршрут без порожних пробегов, учитывайте остановки и отдых, пересчитайте тариф и расходы на топливо.',
      en: 'The freight market has changed ({r}): build routes without empty legs, allow for stops and rest, and recalculate your rate and fuel cost.',
    },
    market: {
      uz: "Yetkazib berish tarifi va muddati o'zgarishi mumkin ({r}): yuklarni jamlab (konsolidatsiya) buyurtma qiling, shartnomada yetkazish oynasini aniq yozing.",
      ru: 'Тарифы и сроки доставки могут измениться ({r}): консолидируйте заказы и чётко пропишите окно доставки в договоре.',
      en: 'Delivery rates and lead times may change ({r}): consolidate orders and state the delivery window clearly in the contract.',
    },
  },
};

type Flavor = 'closure' | 'weather' | 'demand' | 'price';
const FLAVOR_RE: Record<Flavor, RegExp> = {
  closure: /yopil|yopiladi|to'sil|tirband|closed|closure|congest|закры|перекр|пробк/i,
  weather: /ob-havo|qor|yomg'ir|sovuq|tuman|shamol|dovon|weather|snow|rain|frost|fog|pass|погод|снег|дожд|мороз|туман|перевал/i,
  demand: /talab|oshib|oshmoq|demand|rising|surge|спрос|вырос|рост/i,
  price: /narx|qimmat|arzon|price|cost|цен|подорож|дешев/i,
};

const FLAVOR_ADD: Record<Flavor, Tpl> = {
  closure: {
    farmer: { uz: "Yopilgan hududlarga yuk yetkazish uchun alohida ruxsat/yo'l so'rang.", ru: 'Для въезда в закрытые зоны заранее уточните пропуск или объезд.', en: 'Ask in advance about a permit or detour for any closed zones.' },
    driver: { uz: "Yopilgan ko'chalarni navigatorda tekshiring, markazga kirmasdan halqa yo'ldan foydalaning.", ru: 'Проверьте закрытые улицы в навигаторе и используйте кольцевые дороги, не заезжая в центр.', en: 'Check closed streets in your navigator and use ring roads instead of entering the centre.' },
    market: { uz: "Qabul qilish vaqtini yopiq soatlardan tashqariga suring.", ru: 'Перенесите приёмку на часы вне перекрытий.', en: 'Move receiving outside the closure hours.' },
  },
  weather: {
    farmer: { uz: "Mahsulotni sovuq va namdan himoya qiling (brezent, termo-qadoq).", ru: 'Защитите продукцию от холода и влаги (тент, термоупаковка).', en: 'Protect produce from cold and moisture (tarpaulin, thermal packaging).' },
    driver: { uz: "Shinalar, zanjir va tormoz holatini tekshiring; dovonda tezlikni pasaytiring va tumanda masofa saqlang.", ru: 'Проверьте шины, цепи и тормоза; на перевале снизьте скорость и держите дистанцию в тумане.', en: 'Check tyres, chains and brakes; slow down on the pass and keep distance in fog.' },
    market: { uz: "Ob-havo tufayli kechikish bo'lsa, zaxira hajmini oshiring.", ru: 'Из-за погоды возможны задержки — увеличьте страховой запас.', en: 'Weather delays are possible — raise your safety stock.' },
  },
  demand: {
    farmer: { uz: "Talab yuqori — narxni bozor ko'rsatkichidan past qo'ymang.", ru: 'Спрос высок — не занижайте цену относительно рынка.', en: 'Demand is high — do not price below the market.' },
    driver: { uz: "Talab yuqori yo'nalishlarda tarifni oshirish imkoni bor.", ru: 'На направлениях с высоким спросом можно поднять тариф.', en: 'There is room to raise your rate on high-demand routes.' },
    market: { uz: "Raqobat kuchayadi — kerakli hajmni tezroq band qiling.", ru: 'Конкуренция растёт — быстрее закрепляйте нужный объём.', en: 'Competition will tighten — secure the volume you need sooner.' },
  },
  price: {
    farmer: { uz: "Narx tebranishini kuzating, minimal sotish narxini oldindan belgilang.", ru: 'Следите за колебаниями цены и заранее задайте минимальную цену продажи.', en: 'Watch price swings and set a minimum selling price in advance.' },
    driver: { uz: "Yetkazish narxini yoqilg'i va yo'l xarajatiga moslab qayta hisoblang.", ru: 'Пересчитайте стоимость перевозки с учётом топлива и дорожных расходов.', en: 'Recalculate your haul price for fuel and road costs.' },
    market: { uz: "Narx shartnomasini qat'iy (fiksatsiya) qilish xavfni kamaytiradi.", ru: 'Фиксация цены в договоре снижает риск.', en: 'Fixing the price in the contract reduces risk.' },
  },
};

const ROLES: InsightRole[] = ['farmer', 'driver', 'market'];
const LANGS: Lang[] = ['uz', 'ru', 'en'];

export function detectFlavors(text: string): Flavor[] {
  return (Object.keys(FLAVOR_RE) as Flavor[]).filter((f) => FLAVOR_RE[f].test(text));
}

export function templateInsights(input: { category: NewsCategory; region: string; text: string }): Insights {
  const flavors = detectFlavors(input.text).slice(0, 2);
  const out = {} as Insights;
  for (const role of ROLES) {
    out[role] = {} as L3;
    for (const lang of LANGS) {
      const base = BASE[input.category][role][lang].replace('{r}', regionIn(input.region, lang));
      const add = flavors.map((f) => FLAVOR_ADD[f][role][lang]).join(' ');
      out[role][lang] = (base + (add ? ' ' + add : '')).trim();
    }
  }
  return out;
}
