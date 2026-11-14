/** Agro-Store (dori va o'g'itlar) — «TEZ KUNDA» holatidagi mock ma'lumotlar. Savdo hali yoqilmagan: narxlar va mahsulotlar ko'rgazma uchun. */
export type L3 = { uz: string; ru: string; en: string };
export type AgroMode = 'crop' | 'livestock';

export interface AgroProduct {
  id: string;
  mode: AgroMode;
  category: 'FERTILIZER' | 'PESTICIDE' | 'SEED_CARE' | 'FEED' | 'SILAGE' | 'VITAMIN' | 'BRIQUETTE';
  name: L3;
  description: L3;
  /** Qo'llanma va dozirovka */
  usage: L3;
  price: number;
  unit: 'litr' | 'kg';
  /** Shahar ichida yetkazib berish narxi (so'm) */
  cityDeliveryFee: number;
  /** Boshqa yuklar bilan birga qisman (partial) tashish mumkin */
  partialFreight: boolean;
  image: null;
}

export interface AgroPost {
  id: string;
  mode: AgroMode;
  author: string;
  region: L3;
  text: L3;
  likes: number;
}

const p = (x: Omit<AgroProduct, 'partialFreight' | 'image'>): AgroProduct => ({ ...x, partialFreight: true, image: null });

export const AGRO_PRODUCTS: AgroProduct[] = [
  p({ id: 'agro-crop-1', mode: 'crop', category: 'FERTILIZER', price: 6500, unit: 'kg', cityDeliveryFee: 25000,
    name: { uz: 'Karbamid (azotli o\'g\'it) 46%', ru: 'Карбамид (азотное удобрение) 46%', en: 'Urea (nitrogen fertilizer) 46%' },
    description: { uz: "Poya va barg o'sishini kuchaytiradi, hosildorlikni oshiradi.", ru: 'Усиливает рост стеблей и листьев, повышает урожайность.', en: 'Boosts stem and leaf growth and raises yield.' },
    usage: { uz: "1 gektarga 150–200 kg; ekish oldidan va o'sish davrida 2 bosqichda soling.", ru: '150–200 кг на 1 га; вносить в 2 приёма: перед посевом и в период роста.', en: '150–200 kg per hectare; apply in 2 stages: before sowing and during growth.' } }),
  p({ id: 'agro-crop-2', mode: 'crop', category: 'FERTILIZER', price: 9800, unit: 'kg', cityDeliveryFee: 25000,
    name: { uz: 'Ammofos (NP 11:46)', ru: 'Аммофос (NP 11:46)', en: 'Ammophos (NP 11:46)' },
    description: { uz: "Fosforli-azotli o'g'it: ildiz tizimi va gullashni qo'llab-quvvatlaydi.", ru: 'Фосфорно-азотное удобрение: поддерживает корневую систему и цветение.', en: 'Phosphorus-nitrogen fertilizer supporting roots and flowering.' },
    usage: { uz: "1 gektarga 100–150 kg; shudgor oldidan tuproqqa aralashtiring.", ru: '100–150 кг на 1 га; вносить в почву перед вспашкой.', en: '100–150 kg per hectare; mix into soil before ploughing.' } }),
  p({ id: 'agro-crop-3', mode: 'crop', category: 'PESTICIDE', price: 185000, unit: 'litr', cityDeliveryFee: 30000,
    name: { uz: "Fungitsid «Skor» (zamburug'ga qarshi)", ru: 'Фунгицид «Скор» (против грибковых болезней)', en: 'Fungicide "Skor" (antifungal)' },
    description: { uz: "Pomidor, uzum va kartoshkadagi zamburug' kasalliklariga qarshi tizimli preparat.", ru: 'Системный препарат против грибковых болезней томатов, винограда и картофеля.', en: 'Systemic product against fungal diseases of tomato, grape and potato.' },
    usage: { uz: "1 gektarga 0,4 litr (200 litr suvda); mavsumda 2 martadan ko'p purkamang.", ru: '0,4 л на 1 га (в 200 л воды); не более 2 обработок за сезон.', en: '0.4 L per hectare (in 200 L of water); no more than 2 sprays per season.' } }),
  p({ id: 'agro-crop-4', mode: 'crop', category: 'PESTICIDE', price: 142000, unit: 'litr', cityDeliveryFee: 30000,
    name: { uz: 'Insektitsid «Aktara»', ru: 'Инсектицид «Актара»', en: 'Insecticide "Aktara"' },
    description: { uz: "Shira, oq qanot va tripsga qarshi tez ta'sir qiluvchi vosita.", ru: 'Быстродействующее средство против тли, белокрылки и трипса.', en: 'Fast-acting control of aphids, whitefly and thrips.' },
    usage: { uz: "1 gektarga 2 litr; kechqurun, shamolsiz havoda purkang.", ru: '2 л на 1 га; опрыскивать вечером в безветренную погоду.', en: '2 L per hectare; spray in the evening in calm weather.' } }),
  p({ id: 'agro-crop-5', mode: 'crop', category: 'SEED_CARE', price: 54000, unit: 'litr', cityDeliveryFee: 22000,
    name: { uz: "Gumat kaliy (o'sish stimulyatori)", ru: 'Гумат калия (стимулятор роста)', en: 'Potassium humate (growth stimulator)' },
    description: { uz: "Urug' unuvchanligini va ildiz rivojini yaxshilaydi, stressga chidamlilikni oshiradi.", ru: 'Улучшает всхожесть семян и развитие корней, повышает устойчивость к стрессу.', en: 'Improves seed germination and root development, increases stress tolerance.' },
    usage: { uz: "1 gektarga 2 litr; sug'orish suvi bilan yoki barg orqali.", ru: '2 л на 1 га; с поливной водой или по листу.', en: '2 L per hectare; with irrigation water or foliar.' } }),
  p({ id: 'agro-crop-6', mode: 'crop', category: 'FERTILIZER', price: 12500, unit: 'kg', cityDeliveryFee: 25000,
    name: { uz: 'Kaliy sulfat (K2SO4)', ru: 'Сульфат калия (K2SO4)', en: 'Potassium sulfate (K2SO4)' },
    description: { uz: "Meva shirinligi va saqlanuvchanligini oshiradi; xlorsiz.", ru: 'Повышает сладость и лёжкость плодов; не содержит хлора.', en: 'Improves fruit sweetness and shelf life; chlorine-free.' },
    usage: { uz: "1 gektarga 80–120 kg; gullash va meva tugish davrida.", ru: '80–120 кг на 1 га; в период цветения и завязи плодов.', en: '80–120 kg per hectare; during flowering and fruit set.' } }),

  p({ id: 'agro-live-1', mode: 'livestock', category: 'FEED', price: 4200, unit: 'kg', cityDeliveryFee: 30000,
    name: { uz: "Kombikorm «Sut-Plyus» (sigirlar uchun)", ru: 'Комбикорм «Молоко-Плюс» (для коров)', en: 'Compound feed "Milk-Plus" (for cows)' },
    description: { uz: "Sut mahsuldorligini oshiruvchi muvozanatlangan oqsil-energiya aralashmasi.", ru: 'Сбалансированная белково-энергетическая смесь для повышения удоя.', en: 'Balanced protein-energy blend that raises milk yield.' },
    usage: { uz: "Sigirga kuniga 4–6 kg, 2–3 marta bo'lib bering; suv doim bo'lsin.", ru: '4–6 кг на корову в день, 2–3 раза; вода всегда в доступе.', en: '4–6 kg per cow daily in 2–3 feedings; keep water available.' } }),
  p({ id: 'agro-live-2', mode: 'livestock', category: 'SILAGE', price: 900, unit: 'kg', cityDeliveryFee: 45000,
    name: { uz: "Makkajo'xori silosi", ru: 'Силос кукурузный', en: 'Corn silage' },
    description: { uz: "Qishki ozuqa: yuqori energiyali, yaxshi hazm bo'ladigan siloslangan makkajo'xori.", ru: 'Зимний корм: высокоэнергетический, хорошо усваиваемый силос из кукурузы.', en: 'Winter feed: high-energy, highly digestible corn silage.' },
    usage: { uz: "Katta qoramolga kuniga 15–25 kg; asta-sekin o'rgating.", ru: '15–25 кг на голову крупного скота в день; приучать постепенно.', en: '15–25 kg per head of cattle daily; introduce gradually.' } }),
  p({ id: 'agro-live-3', mode: 'livestock', category: 'VITAMIN', price: 78000, unit: 'kg', cityDeliveryFee: 20000,
    name: { uz: "Vitamin-mineral premiks «AgroVit»", ru: 'Витаминно-минеральный премикс «АгроВит»', en: 'Vitamin-mineral premix "AgroVit"' },
    description: { uz: "Qoramol, qo'y va echkilar uchun A, D3, E vitaminlari va mikroelementlar.", ru: 'Витамины A, D3, E и микроэлементы для КРС, овец и коз.', en: 'Vitamins A, D3, E and trace elements for cattle, sheep and goats.' },
    usage: { uz: "Yemga 1% nisbatda aralashtiring (100 kg yemga 1 kg).", ru: 'Добавлять в корм в пропорции 1% (1 кг на 100 кг корма).', en: 'Mix into feed at 1% (1 kg per 100 kg of feed).' } }),
  p({ id: 'agro-live-4', mode: 'livestock', category: 'BRIQUETTE', price: 5600, unit: 'kg', cityDeliveryFee: 30000,
    name: { uz: "Tuz-mineral briket (lizunets)", ru: 'Соль-минеральный брикет (лизунец)', en: 'Salt-mineral lick briquette' },
    description: { uz: "Chorvaning mineral tanqisligini to'ldiradi; yaylov va otarda foydali.", ru: 'Восполняет дефицит минералов у скота; полезен на пастбище и в загоне.', en: 'Covers livestock mineral deficiency; useful on pasture and in the pen.' },
    usage: { uz: "Har 5–8 bosh uchun 1 dona (2–5 kg), doim ochiq turadigan joyga qo'ying.", ru: 'Один брикет (2–5 кг) на 5–8 голов; размещать в постоянно доступном месте.', en: 'One briquette (2–5 kg) per 5–8 head; place where animals can always reach it.' } }),
  p({ id: 'agro-live-5', mode: 'livestock', category: 'FEED', price: 3100, unit: 'kg', cityDeliveryFee: 30000,
    name: { uz: "Qo'y va echki uchun kombikorm", ru: 'Комбикорм для овец и коз', en: 'Compound feed for sheep and goats' },
    description: { uz: "Semirtirish va qo'zilash davri uchun granulalangan ozuqa.", ru: 'Гранулированный корм для откорма и периода ягнения.', en: 'Pelleted feed for fattening and lambing periods.' },
    usage: { uz: "Boshiga kuniga 0,4–0,8 kg, xashak bilan birga.", ru: '0,4–0,8 кг на голову в день вместе с сеном.', en: '0.4–0.8 kg per head daily together with hay.' } }),
  p({ id: 'agro-live-6', mode: 'livestock', category: 'SILAGE', price: 1500, unit: 'kg', cityDeliveryFee: 40000,
    name: { uz: "Beda xashagi (yo'nichqa pressli bog'lam)", ru: 'Сено люцерны (прессованные тюки)', en: 'Alfalfa hay (baled)' },
    description: { uz: "Oqsilga boy, tez o'sish va sut uchun asosiy qo'shimcha xashak.", ru: 'Богатое белком сено — основной корм для роста и молока.', en: 'Protein-rich hay — a staple for growth and milk.' },
    usage: { uz: "Qoramolga kuniga 6–10 kg; qo'y-echkiga 1–2 kg.", ru: 'КРС 6–10 кг в день; овцам и козам 1–2 кг.', en: 'Cattle 6–10 kg daily; sheep and goats 1–2 kg.' } }),
];

export const AGRO_POSTS: AgroPost[] = [
  { id: 'agro-post-1', mode: 'livestock', author: 'Jasur (Qashqadaryo)', likes: 14, region: { uz: 'Qashqadaryo', ru: 'Кашкадарья', en: 'Qashkadarya' },
    text: { uz: "50 bosh sigir uchun qishlik silos kerak. Hajmi bo'yicha narx kelishsak bo'ladimi?", ru: 'Нужен зимний силос на 50 коров. Можно ли договориться о цене за объём?', en: 'I need winter silage for 50 cows. Can we agree a volume price?' } },
  { id: 'agro-post-2', mode: 'livestock', author: 'Dilfuza (Samarqand)', likes: 9, region: { uz: 'Samarqand', ru: 'Самарканд', en: 'Samarkand' },
    text: { uz: "Qo'zilash oldidan vitamin premiks tavsiya qilasizlarmi? Natijani yozing.", ru: 'Какой витаминный премикс посоветуете перед ягнением? Поделитесь результатами.', en: 'Which vitamin premix do you recommend before lambing? Share your results.' } },
  { id: 'agro-post-3', mode: 'livestock', author: 'Rustam (Jizzax)', likes: 6, region: { uz: 'Jizzax', ru: 'Джизак', en: 'Jizzakh' },
    text: { uz: "Briket va xashakni boshqa yuk bilan birga partial olib kelsa arzonroq bo'ladi.", ru: 'Брикеты и сено выгоднее везти частичной загрузкой вместе с другими грузами.', en: 'Briquettes and hay are cheaper delivered as a partial load with other cargo.' } },
  { id: 'agro-post-4', mode: 'crop', author: 'Bobur (Farg\'ona)', likes: 11, region: { uz: "Farg'ona", ru: 'Фергана', en: 'Fergana' },
    text: { uz: "Pomidor uchun azot-kaliy nisbatini qanday tanlaysizlar?", ru: 'Как вы подбираете соотношение азота и калия для томатов?', en: 'How do you choose the nitrogen-potassium ratio for tomatoes?' } },
];
