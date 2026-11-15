import { NewsCategory } from '@prisma/client';
import { Insights } from './news-templates';

export interface SeedNews {
  category: NewsCategory;
  region: string;
  hoursAgo: number;
  title: { uz: string; ru: string; en: string };
  summary: { uz: string; ru: string; en: string };
  insights: Insights;
}

/** Boshlang'ich yangiliklar: 3 tilli matn va rollarga mos 3 tilli AI xulosalari tayyor (jadval bo'sh bo'lsagina qo'shiladi) */
export const SEED_NEWS: SeedNews[] = [
  {
    category: 'ROADS', region: 'Samarqand', hoursAgo: 3,
    title: {
      uz: "Samarqandda bayram munosabati bilan markaziy ko'chalar yopiladi",
      ru: 'В Самарканде на время праздника перекроют центральные улицы',
      en: 'Central streets in Samarkand to be closed for the holiday',
    },
    summary: {
      uz: "Bayram tadbirlari tufayli Registon va Amir Temur ko'chalari atrofida 2 kun davomida transport harakati cheklanadi. Yuk avtomobillari uchun aylanma yo'llar belgilandi.",
      ru: 'Из-за праздничных мероприятий на 2 дня ограничат движение транспорта вокруг Регистана и улицы Амира Темура. Для грузовиков определены объездные маршруты.',
      en: 'Holiday events will restrict traffic around Registan and Amir Temur street for 2 days. Detour routes have been set for trucks.',
    },
    insights: {
      farmer: {
        uz: "Samarqand shahriga yuk yetkazishni bayramdan bir kun oldin yoki keyin rejalang. Tez buziladigan mahsulotni (sabzavot, meva) sovuq saqlang va haydovchi bilan topshirish vaqtini oldindan kelishing.",
        ru: 'Планируйте доставку в Самарканд за день до праздника или после него. Быстропортящиеся овощи и фрукты держите в прохладе и заранее согласуйте с водителем время сдачи.',
        en: 'Plan deliveries to Samarkand a day before or after the holiday. Keep perishable vegetables and fruit cool and agree the handover time with the driver in advance.',
      },
      driver: {
        uz: "Ogohlantirish: Registon va Amir Temur ko'chalari yopiq. Shaharga halqa yo'l orqali, 05:00–07:00 oralig'ida kiring; navigatorda yopiq hududlarni belgilang va yoqilg'i zaxirasini oshiring. Kechqurun 18:00 dan keyin tirbandlik kuchayadi.",
        ru: 'Предупреждение: улицы вокруг Регистана и Амира Темура закрыты. Въезжайте в город по кольцевой в 05:00–07:00; отметьте закрытые зоны в навигаторе и увеличьте запас топлива. После 18:00 пробки усилятся.',
        en: 'Warning: streets around Registan and Amir Temur are closed. Enter the city via the ring road between 05:00 and 07:00; mark closed zones in your navigator and carry extra fuel. Congestion builds after 18:00.',
      },
      market: {
        uz: "Samarqand do'konlari uchun yetkazib berish kechikishi mumkin. Buyurtmani 1 kun oldinroq bering, qabul qilish vaqtini ertalabki soatlarga suring va zaxira ta'minotchini tayyor tuting.",
        ru: 'Для магазинов Самарканда возможны задержки поставок. Размещайте заказ на день раньше, перенесите приёмку на утро и держите резервного поставщика.',
        en: 'Deliveries to Samarkand stores may be delayed. Order a day earlier, move receiving to the morning and keep a backup supplier ready.',
      },
    },
  },
  {
    category: 'ROADS', region: "Farg'ona", hoursAgo: 9,
    title: {
      uz: "Qamchiq dovonida ob-havo o'zgaradi: qor va tuman kutilmoqda",
      ru: 'На перевале Камчик ожидается перемена погоды: снег и туман',
      en: 'Weather change on Kamchik Pass: snow and fog expected',
    },
    summary: {
      uz: "Gidrometeorologiya xizmati yaqin 48 soat ichida Qamchiq dovonida qor, tuman va silliq yo'l ehtimolini ogohlantirdi. Og'ir yuk transportiga ehtiyot bo'lish tavsiya etiladi.",
      ru: 'Гидрометслужба предупредила о вероятности снега, тумана и гололёда на перевале Камчик в ближайшие 48 часов. Тяжёлому транспорту рекомендуется соблюдать осторожность.',
      en: 'The weather service warns of snow, fog and icy roads on Kamchik Pass over the next 48 hours. Heavy freight is advised to take extra care.',
    },
    insights: {
      farmer: {
        uz: "Farg'ona vodiysidan Toshkentga jo'natmoqchi bo'lsangiz, yukni 48 soatdan keyinga suring yoki haydovchi bilan tunnel yo'nalishini kelishing. Mahsulotni sovuqdan himoya qiling (brezent, termo-qadoq).",
        ru: 'Если отправляете груз из Ферганской долины в Ташкент, сдвиньте отправку на 48 часов или согласуйте с водителем маршрут через тоннель. Защитите продукцию от холода (тент, термоупаковка).',
        en: 'If you ship from the Fergana Valley to Tashkent, move dispatch back 48 hours or agree a tunnel route with the driver. Protect produce from the cold (tarpaulin, thermal packaging).',
      },
      driver: {
        uz: "Ogohlantirish: Qamchiq dovonida qor va tuman. Zanjir, shina va tormozni tekshiring; dovonga kunduzi (10:00–16:00) chiqing, tezlikni 40 km/soatgacha tushiring, oldingi mashinadan 50 m masofa saqlang. Imkon bo'lsa Angren–Pop yo'nalishini tanlang.",
        ru: 'Предупреждение: на перевале Камчик снег и туман. Проверьте цепи, шины и тормоза; поднимайтесь днём (10:00–16:00), снизьте скорость до 40 км/ч и держите 50 м до впереди идущей машины. По возможности выберите маршрут Ангрен–Поп.',
        en: 'Warning: snow and fog on Kamchik Pass. Check chains, tyres and brakes; cross in daylight (10:00–16:00), cut speed to 40 km/h and keep 50 m behind the vehicle ahead. If possible choose the Angren–Pop route.',
      },
      market: {
        uz: "Farg'onadan keladigan yetkazib berishlar 1–2 kunga kechikishi mumkin. Toshkentdagi zaxirangizni oshiring va ta'minotchi bilan yangilangan yetkazish vaqtini tasdiqlang.",
        ru: 'Поставки из Ферганы могут задержаться на 1–2 дня. Увеличьте запас в Ташкенте и подтвердите с поставщиком новое время доставки.',
        en: 'Deliveries from Fergana may slip by 1–2 days. Raise your stock in Tashkent and confirm the updated delivery time with the supplier.',
      },
    },
  },
  {
    category: 'MARKET', region: 'Toshkent', hoursAgo: 20,
    title: {
      uz: "Toshkent ulgurji bozorlarida mavsumiy sabzavot talabi oshmoqda",
      ru: 'На оптовых рынках Ташкента растёт сезонный спрос на овощи',
      en: 'Seasonal vegetable demand is rising on Tashkent wholesale markets',
    },
    summary: {
      uz: "Toshkent Food City va boshqa ulgurji bozorlarda kartoshka, sabzi va piyozga talab o'tgan haftaga nisbatan sezilarli oshdi. Savdogarlar ertalabki soatlarda yirik hajmda xarid qilmoqda.",
      ru: 'На Tashkent Food City и других оптовых рынках спрос на картофель, морковь и лук заметно вырос за неделю. Торговцы закупают крупные объёмы в утренние часы.',
      en: 'Demand for potatoes, carrots and onions has risen noticeably week-on-week at Tashkent Food City and other wholesale markets. Traders are buying large volumes in the early morning.',
    },
    insights: {
      farmer: {
        uz: "Talab yuqori: kartoshka, sabzi va piyozni hozir e'lon qiling va narxni bozor ko'rsatkichidan past qo'ymang. Hosilni bir kunda emas, 2–3 partiyaga bo'lib jo'nating — shunda narx tushmaydi va daromad oshadi.",
        ru: 'Спрос высок: выставляйте картофель, морковь и лук сейчас и не занижайте цену относительно рынка. Отправляйте урожай не за один день, а 2–3 партиями — так цена не упадёт, а доход вырастет.',
        en: 'Demand is strong: list potatoes, carrots and onions now and do not price below the market. Ship in 2–3 batches rather than all at once so the price holds and income rises.',
      },
      driver: {
        uz: "Toshkent yo'nalishida yuk ko'paydi. Ulgurji bozorga ertalabki 04:00–07:00 oralig'ida yetib boring — qabul eng tez shu paytda. Qaytishda bo'sh yurmaslik uchun Toshkentdan viloyatga yuk (backhaul) qidiring va tarifni talab yuqori kunlarda oshiring.",
        ru: 'На ташкентском направлении грузов стало больше. Приезжайте на оптовый рынок в 04:00–07:00 — приёмка идёт быстрее всего. Чтобы не ехать порожним, ищите обратный груз из Ташкента в область и поднимайте тариф в дни высокого спроса.',
        en: 'Freight on the Tashkent corridor is up. Arrive at the wholesale market between 04:00 and 07:00 when receiving is fastest. Look for a backhaul load out of Tashkent so you do not return empty, and raise your rate on high-demand days.',
      },
      market: {
        uz: "Narx oshishidan oldin kerakli hajmning bir qismini hozir xarid qiling. 2–3 ta fermer bilan narxni solishtiring, yirik partiya uchun yetkazishni oldindan band qiling va shartnomada narxni fiksatsiya qiling.",
        ru: 'Закупите часть нужного объёма до роста цен. Сравните цены у 2–3 фермеров, заранее забронируйте доставку крупной партии и зафиксируйте цену в договоре.',
        en: 'Buy part of the volume you need before prices climb. Compare quotes from 2–3 farmers, book delivery of large lots early and fix the price in the contract.',
      },
    },
  },
  {
    category: 'AGRO', region: 'Jizzax', hoursAgo: 30,
    title: {
      uz: "Jizzaxda sovuq ogohlantirishi: issiqxona va omborlarni tayyorlash tavsiya etiladi",
      ru: 'В Джизаке объявлено предупреждение о заморозках: рекомендуется подготовить теплицы и склады',
      en: 'Frost warning in Jizzakh: greenhouses and storage should be prepared',
    },
    summary: {
      uz: "Kelgusi kechalari harorat nolga yaqinlashishi kutilmoqda. Mutaxassislar issiqxonalarni yopishni, ochiq dala hosilini yig'ishni va omborlarda haroratni nazorat qilishni tavsiya qilmoqda.",
      ru: 'В ближайшие ночи ожидается понижение температуры до нуля. Специалисты советуют закрыть теплицы, убрать урожай с открытых полей и контролировать температуру на складах.',
      en: 'Temperatures are expected to approach zero in the coming nights. Specialists advise closing greenhouses, harvesting open-field crops and monitoring storage temperatures.',
    },
    insights: {
      farmer: {
        uz: "Issiqxonalarni kechqurun yoping va qo'shimcha qoplama torting; ochiq maydondagi pishgan hosilni sovuqdan oldin yig'ing. Omborda harorat 2–5 °C bo'lishini nazorat qiling va hosilni tezroq sotish uchun e'lon joylang.",
        ru: 'Закрывайте теплицы вечером и накрывайте дополнительным укрытием; уберите созревший урожай с открытых полей до заморозков. Держите на складе 2–5 °C и разместите объявление, чтобы быстрее продать урожай.',
        en: 'Close greenhouses in the evening and add extra cover; harvest ripe open-field produce before the frost. Keep storage at 2–5 °C and post a listing to sell the harvest sooner.',
      },
      driver: {
        uz: "Jizzax yo'nalishida erta ertalab yo'l muzlashi mumkin (05:00–08:00). Tezlikni pasaytiring, tormoz masofasini oshiring. Tez buziladigan yuk tashisangiz, kabinani isitish va yukni brezent bilan yopishni unutmang.",
        ru: 'На направлении Джизак рано утром (05:00–08:00) возможен гололёд. Снизьте скорость и увеличьте тормозной путь. Если везёте скоропортящийся груз, не забудьте накрыть его тентом и обогреть кузов.',
        en: 'Roads towards Jizzakh may ice over early in the morning (05:00–08:00). Slow down and allow a longer braking distance. If hauling perishables, cover the load with a tarpaulin and keep it from freezing.',
      },
      market: {
        uz: "Sovuq tufayli Jizzaxdan sabzavot ta'minoti qisqa muddatga kamayishi mumkin. Kerakli hajmni oldindan buyurtma qiling, muqobil hududlardan (Samarqand, Sirdaryo) ta'minotchini aniqlab qo'ying.",
        ru: 'Из-за заморозков поставки овощей из Джизака могут ненадолго сократиться. Закажите нужный объём заранее и подготовьте альтернативных поставщиков из других регионов (Самарканд, Сырдарья).',
        en: 'Frost may briefly cut vegetable supply from Jizzakh. Order the volume you need ahead of time and line up alternative suppliers from other regions (Samarkand, Syrdarya).',
      },
    },
  },
  {
    category: 'LOGISTICS', region: 'Respublika', hoursAgo: 42,
    title: {
      uz: "Respublika bo'ylab sovutgichli (refrijerator) transportga talab oshdi",
      ru: 'По республике вырос спрос на рефрижераторный транспорт',
      en: 'Demand for refrigerated transport is up nationwide',
    },
    summary: {
      uz: "Meva-sabzavot va sut mahsulotlarini uzoq masofaga tashish ko'paygani sababli refrijerator yuk mashinalariga talab va tariflar o'sdi. Bo'sh mashinalarni topish qiyinlashmoqda.",
      ru: 'Из-за роста дальних перевозок плодоовощной и молочной продукции выросли спрос и тарифы на рефрижераторы. Свободные машины найти всё сложнее.',
      en: 'Long-distance shipments of fruit, vegetables and dairy have pushed up demand and rates for refrigerated trucks. Free vehicles are getting harder to find.',
    },
    insights: {
      farmer: {
        uz: "Sovutgichli mashinani jo'natishdan 2–3 kun oldin band qiling. Mahsulotni oldindan sovutib (pre-cooling) qadoqlang, to'liq yuk (FTL) o'rniga qisman yuk (LTL) ulashib, tashish narxini kamaytiring.",
        ru: 'Бронируйте рефрижератор за 2–3 дня до отправки. Предварительно охлаждайте и упаковывайте продукцию, а вместо полной загрузки (FTL) делите машину с другими (LTL), чтобы снизить стоимость перевозки.',
        en: 'Book a refrigerated truck 2–3 days before dispatch. Pre-cool and pack produce, and share a truck (LTL) instead of a full load (FTL) to cut transport cost.',
      },
      driver: {
        uz: "Refrijerator egalari uchun imkoniyat: tarifni talab yuqori yo'nalishlarda oshiring, qaytishda bo'sh yurmaslik uchun ikki tomonlama (backhaul) yuk rejalang. Sovutish agregati va yoqilg'ini safardan oldin tekshiring, harorat jurnalini yuriting.",
        ru: 'Возможность для владельцев рефрижераторов: поднимайте тариф на направлениях с высоким спросом, планируйте обратный груз, чтобы не ехать порожним. Перед рейсом проверьте агрегат и топливо, ведите температурный журнал.',
        en: 'An opportunity for reefer owners: raise your rate on high-demand lanes and plan a backhaul so you do not return empty. Check the cooling unit and fuel before each trip and keep a temperature log.',
      },
      market: {
        uz: "Sovutgichli yetkazib berish narxi oshishi mumkin. Buyurtmalarni jamlab (konsolidatsiya) bitta reysga birlashtiring, shartnomada yetkazish oynasi va harorat talabini aniq yozing, muddat uzaytirilsa zaxirangizni oshiring.",
        ru: 'Стоимость холодной доставки может вырасти. Консолидируйте заказы в один рейс, чётко пропишите в договоре окно доставки и температурный режим, а при задержках увеличьте запас.',
        en: 'Cold-chain delivery may get more expensive. Consolidate orders into one trip, state the delivery window and temperature requirement in the contract and raise stock if lead times stretch.',
      },
    },
  },
];
