export type Lang = 'uz' | 'ru' | 'en';
export const LANGS: Lang[] = ['uz', 'ru', 'en'];
export type GuideRole = 'FARMER' | 'DRIVER' | 'MARKET' | 'DISPATCHER';
export const GUIDE_ROLES: GuideRole[] = ['FARMER', 'DRIVER', 'MARKET', 'DISPATCHER'];

type L3 = Record<Lang, string>;
const L = (uz: string, ru: string, en: string): L3 => ({ uz, ru, en });

interface Step { icon: string; title: L3; text: L3 }
interface Topic { id: string; icon: string; title: L3; steps: Step[] }

/** Mavzular kutubxonasi: har bir rol o'ziga kerak mavzularni oladi */
const TOPICS: Record<string, Topic> = {
  listing: {
    id: 'listing', icon: 'fa-seedling', title: L('E\'lon joylash', 'Как разместить объявление', 'Posting a listing'),
    steps: [
      { icon: 'fa-id-card', title: L('Profilni to\'ldiring', 'Заполните профиль', 'Complete your profile'), text: L('Ro\'yxatdan o\'tib, ferma nomi va hududni kiriting. Tasdiqlangan (Verified) profil ko\'proq ishonch uyg\'otadi.', 'Зарегистрируйтесь и укажите название хозяйства и регион. Верифицированный профиль вызывает больше доверия.', 'Sign up and enter your farm name and region. A verified profile earns more trust.') },
      { icon: 'fa-plus-circle', title: L('Mahsulot qo\'shing', 'Добавьте товар', 'Add a product'), text: L('«Mahsulotlarim» bo\'limida nomi, hajmi (kg), 1 kg narxi va hosil sanasini kiriting, rasm yuklang.', 'В разделе «Мои товары» укажите название, объём (кг), цену за 1 кг и дату урожая, загрузите фото.', 'In "My products" enter the name, volume (kg), price per kg and harvest date, then upload a photo.') },
      { icon: 'fa-chart-line', title: L('Narxni solishtiring', 'Сравните цену', 'Compare the price'), text: L('«Bozor narxlari» sahifasida bugungi narxlarni ko\'rib, adolatli narx qo\'ying.', 'На странице «Цены рынков» посмотрите сегодняшние цены и установите справедливую.', 'Check today\'s prices on "Market prices" and set a fair one.') },
      { icon: 'fa-bell', title: L('So\'rovlarni kuting', 'Ждите заявки', 'Wait for requests'), text: L('Market bron qilganda Telegram va ilovada bildirishnoma keladi.', 'Когда маркет забронирует, придёт уведомление в Telegram и приложении.', 'When a market books, you get a Telegram and in-app notification.') },
    ],
  },
  booking: {
    id: 'booking', icon: 'fa-calendar-check', title: L('Bron qilish', 'Бронирование', 'Booking'),
    steps: [
      { icon: 'fa-magnifying-glass', title: L('Mahsulot toping', 'Найдите товар', 'Find a product'), text: L('Bozor bo\'limida qidiruv va filtrlar (hudud, narx, hajm) yordamida kerakli mahsulotni tanlang.', 'В разделе «Рынок» выберите товар через поиск и фильтры (регион, цена, объём).', 'Pick a product in the Marketplace using search and filters (region, price, volume).') },
      { icon: 'fa-weight-hanging', title: L('Hajmni kiriting', 'Укажите объём', 'Enter the quantity'), text: L('Kerakli kg ni yozing — taxminiy yetkazish va xizmat haqi bilan jami narx darhol ko\'rinadi.', 'Введите нужные кг — сразу виден итог с ориентировочной доставкой и сервисным сбором.', 'Enter the kilograms — the total with estimated delivery and service fees shows instantly.') },
      { icon: 'fa-handshake', title: L('Fermer tasdiqlaydi', 'Фермер подтверждает', 'Farmer approves'), text: L('Fermer bronni tasdiqlagach, to\'lov bosqichiga o\'tasiz.', 'После подтверждения брони фермером вы переходите к оплате.', 'Once the farmer approves, you proceed to payment.') },
      { icon: 'fa-credit-card', title: L('Escrow orqali to\'lang', 'Оплатите через эскроу', 'Pay via Escrow'), text: L('Mablag\' xavfsiz saqlanadi va yuk yetib kelgandan keyingina taqsimlanadi.', 'Средства хранятся безопасно и распределяются только после доставки.', 'Funds are held safely and released only after delivery.') },
    ],
  },
  escrow: {
    id: 'escrow', icon: 'fa-shield-halved', title: L('Escrow qanday ishlaydi', 'Как работает эскроу', 'How Escrow works'),
    steps: [
      { icon: 'fa-lock', title: L('1. Mablag\' band qilinadi', '1. Средства блокируются', '1. Funds are held'), text: L('Market jami summani (mahsulot + yetkazish + xizmat haqi) to\'laydi. Pul platformada «HELD» holatida turadi.', 'Маркет платит полную сумму (товар + доставка + сервисный сбор). Деньги остаются на платформе в статусе «HELD».', 'The market pays the full amount (product + delivery + service fee). Money stays on the platform as "HELD".') },
      { icon: 'fa-truck-fast', title: L('2. Yuk yetkaziladi', '2. Груз доставляется', '2. Cargo is delivered'), text: L('Haydovchi to\'lov kafolatlangan yukni qabul qiladi va yo\'lga chiqadi.', 'Водитель берёт груз с гарантированной оплатой и выезжает.', 'The driver accepts a cargo with guaranteed payment and sets off.') },
      { icon: 'fa-circle-check', title: L('3. Yetkazildi — taqsimot', '3. Доставлено — распределение', '3. Delivered — payout'), text: L('Yetkazilgach: mahsulot puli fermerga, yo\'l haqi haydovchiga, xizmat haqi platformaga o\'tadi.', 'После доставки: оплата товара — фермеру, плата за рейс — водителю, сервисный сбор — платформе.', 'On delivery: the product amount goes to the farmer, the delivery fee to the driver, the service fee to the platform.') },
      { icon: 'fa-rotate-left', title: L('Qaytarish', 'Возврат', 'Refund'), text: L('Bekor qilinsa yoki yuk yetmasa, jami summa marketga qaytariladi.', 'При отмене или недоставке вся сумма возвращается маркету.', 'If cancelled or not delivered, the full amount is returned to the market.') },
    ],
  },
  payouts: {
    id: 'payouts', icon: 'fa-sack-dollar', title: L('Haydovchi to\'lovlari', 'Выплаты водителям', 'Driver payouts'),
    steps: [
      { icon: 'fa-eye', title: L('Daromadni oldindan ko\'ring', 'Видите доход заранее', 'See your earnings upfront'), text: L('Yuk kartochkasida «Sizning daromadingiz» — qabul qilishdan oldin aniq summa ko\'rsatiladi.', 'В карточке груза указано «Ваш доход» — точная сумма видна до принятия.', 'The cargo card shows "Your earnings" — the exact amount before you accept.') },
      { icon: 'fa-calculator', title: L('Formula', 'Формула', 'The formula'), text: L('Baza tarif + masofa (km × tarif) + og\'irlik (t × km × tarif). «?» belgisini bosib hisob-kitobni ko\'ring.', 'Базовый тариф + расстояние (км × тариф) + вес (т × км × тариф). Нажмите «?», чтобы увидеть расчёт.', 'Base fee + distance (km × rate) + weight (t × km × rate). Tap "?" to see the breakdown.') },
      { icon: 'fa-lock', title: L('Kafolatlangan to\'lov', 'Гарантированная оплата', 'Guaranteed payment'), text: L('Yukni faqat market to\'lovni Escrow\'ga qo\'ygandan keyin qabul qilish mumkin.', 'Груз можно принять только после того, как маркет поместил оплату в эскроу.', 'You can accept a cargo only after the market has put the payment into Escrow.') },
      { icon: 'fa-wallet', title: L('Yetkazgach olasiz', 'Получаете после доставки', 'Paid on delivery'), text: L('Yuk yetkazilgach yo\'l haqi (deliveryFee) avtomatik sizga o\'tkaziladi.', 'После доставки плата за рейс (deliveryFee) автоматически зачисляется вам.', 'After delivery the delivery fee is credited to you automatically.') },
    ],
  },
  eld: {
    id: 'eld', icon: 'fa-satellite-dish', title: L('ELD jurnali qanday yuritiladi', 'Как ведётся журнал ELD', 'How the ELD log is kept'),
    steps: [
      { icon: 'fa-location-crosshairs', title: L('GPS yoqing', 'Включите GPS', 'Turn on GPS'), text: L('Yo\'lga chiqqach ilova joylashuvni yuboradi. Brauzerda geolokatsiyaga ruxsat bering.', 'После выезда приложение отправляет местоположение. Разрешите геолокацию в браузере.', 'After departure the app sends your location. Allow geolocation in the browser.') },
      { icon: 'fa-route', title: L('Reys avtomatik yoziladi', 'Рейс пишется автоматически', 'The trip is logged automatically'), text: L('Har bir nuqta vaqt, tezlik va koordinata bilan saqlanadi.', 'Каждая точка сохраняется со временем, скоростью и координатами.', 'Each point is stored with time, speed and coordinates.') },
      { icon: 'fa-clock', title: L('Dam olish nazorati', 'Контроль отдыха', 'Rest tracking'), text: L('Tizim haydash va tanaffus vaqtini hisoblab, ELD jurnalida ko\'rsatadi.', 'Система считает время вождения и перерывов и показывает в журнале ELD.', 'The system counts driving and break time and shows it in the ELD log.') },
      { icon: 'fa-file-excel', title: L('Yuklab oling', 'Скачайте', 'Download it'), text: L('ELD bo\'limidan jurnalni Excel yoki hujjat sifatida yuklab olish mumkin.', 'В разделе ELD журнал можно скачать в Excel или как документ.', 'From the ELD section you can download the log as Excel or a document.') },
    ],
  },
  post: {
    id: 'post', icon: 'fa-bullhorn', title: L('Xizmat e\'loni joylash', 'Объявление об услугах', 'Posting a service listing'),
    steps: [
      { icon: 'fa-truck', title: L('Mashina ma\'lumoti', 'Данные о машине', 'Vehicle details'), text: L('Tirkama turi (Dry Van, Reefer, Flatbed…), sig\'im va rasmlarni kiriting.', 'Укажите тип прицепа (Dry Van, Reefer, Flatbed…), грузоподъёмность и фото.', 'Enter the trailer type (Dry Van, Reefer, Flatbed…), capacity and photos.') },
      { icon: 'fa-map-location-dot', title: L('Yo\'nalish va holat', 'Маршруты и статус', 'Routes and status'), text: L('«Bo\'sh» yoki «Yo\'lda» holatini tanlang, yo\'nalishlar, joylashuv va yetib borish vaqtini yozing.', 'Выберите статус «Свободен» или «В пути», укажите маршруты, местоположение и время подъезда.', 'Pick "Available" or "On route", add routes, location and arrival time.') },
      { icon: 'fa-tags', title: L('Narx va xizmatlar', 'Цена и услуги', 'Price and extras'), text: L('1 km narxi va qo\'shimcha xizmatlar (yuklovchi, harorat nazorati, brezent…) belgilang.', 'Укажите цену за 1 км и доп. услуги (грузчики, контроль температуры, тент…).', 'Set a price per km and extras (loaders, temperature control, tarps…).') },
      { icon: 'fa-phone', title: L('Mijozlar bog\'lanadi', 'Клиенты свяжутся', 'Clients reach out'), text: L('Fermer va marketlar katalogdan sizni topib, to\'g\'ridan-to\'g\'ri bog\'lanadi.', 'Фермеры и маркеты находят вас в каталоге и связываются напрямую.', 'Farmers and markets find you in the catalog and contact you directly.') },
    ],
  },
  kyc: {
    id: 'kyc', icon: 'fa-user-check', title: L('Verified Pro (KYC)', 'Verified Pro (KYC)', 'Verified Pro (KYC)'),
    steps: [
      { icon: 'fa-id-badge', title: L('Hujjat yuklang', 'Загрузите документ', 'Upload a document'), text: L('Profilda pasport/haydovchilik guvohnomasi suratini yuklang.', 'В профиле загрузите фото паспорта/водительских прав.', 'In your profile upload a photo of your passport/driver\'s licence.') },
      { icon: 'fa-face-smile', title: L('Face ID', 'Face ID', 'Face ID'), text: L('Kamera orqali yuzingizni tasdiqlang.', 'Подтвердите лицо через камеру.', 'Confirm your face with the camera.') },
      { icon: 'fa-circle-check', title: L('Belgi oling', 'Получите знак', 'Get the badge'), text: L('Tasdiqdan so\'ng profilingizda yashil «Verified» belgisi paydo bo\'ladi.', 'После проверки в профиле появится зелёный знак «Verified».', 'After approval a green "Verified" mark appears on your profile.') },
    ],
  },
  badges: {
    id: 'badges', icon: 'fa-medal', title: L('Nishonlar va reyting', 'Значки и рейтинг', 'Badges and rating'),
    steps: [
      { icon: 'fa-star', title: L('Baho oling', 'Получайте оценки', 'Earn ratings'), text: L('Har bir yetkazilgan yukdan keyin tomonlar bir-birini 1–5 yulduz bilan baholaydi.', 'После каждой доставки стороны оценивают друг друга от 1 до 5 звёзд.', 'After each delivery both sides rate each other 1–5 stars.') },
      { icon: 'fa-award', title: L('Nishonlarni oching', 'Открывайте значки', 'Unlock badges'), text: L('Vaqtida yetkazish, ko\'p km, 5 yulduz kabi yutuqlar uchun nishonlar beriladi.', 'Значки выдаются за своевременность, пробег, пятёрки и другие достижения.', 'Badges are awarded for punctuality, mileage, five-star reviews and more.') },
      { icon: 'fa-ranking-star', title: L('Maqom', 'Статус', 'Status'), text: L('Yangi → Doimiy → Veteran maqomlari ishonchni oshiradi.', 'Новичок → Постоянный → Ветеран повышают доверие.', 'New → Regular → Veteran status builds trust.') },
    ],
  },
  prices: {
    id: 'prices', icon: 'fa-chart-line', title: L('Bozor narxlari', 'Цены рынков', 'Market prices'),
    steps: [
      { icon: 'fa-magnifying-glass', title: L('Qidiring', 'Ищите', 'Search'), text: L('Bozor yoki mahsulot nomi bo\'yicha qidiring.', 'Ищите по названию рынка или товара.', 'Search by market or product name.') },
      { icon: 'fa-arrow-trend-up', title: L('O\'zgarishni kuzating', 'Следите за изменением', 'Track the change'), text: L('Bugungi va kechagi narx hamda foiz o\'zgarishi ko\'rsatiladi.', 'Показаны сегодняшняя и вчерашняя цена и процент изменения.', 'Today\'s and yesterday\'s price and the percentage change are shown.') },
    ],
  },
  dispatch: {
    id: 'dispatch', icon: 'fa-headset', title: L('Dispetcher ishi', 'Работа диспетчера', 'Dispatcher workflow'),
    steps: [
      { icon: 'fa-list-check', title: L('Yuklarni kuzating', 'Следите за грузами', 'Monitor shipments'), text: L('Ochiq va yo\'ldagi yuklar, haydovchilar holatini real vaqtda ko\'ring.', 'Смотрите открытые и находящиеся в пути грузы и статусы водителей в реальном времени.', 'View open and in-transit cargo and driver statuses in real time.') },
      { icon: 'fa-chart-column', title: L('Narxlarni kiriting', 'Вносите цены', 'Enter prices'), text: L('«Bozor narxlari»da yangi narx qo\'shing — kechagi narx avtomatik saqlanadi.', 'Добавляйте новые цены — вчерашняя цена сохраняется автоматически.', 'Add new prices — yesterday\'s price is stored automatically.') },
      { icon: 'fa-phone-volume', title: L('Qo\'llab-quvvatlash', 'Поддержка', 'Support'), text: L('Fermer, haydovchi va marketlarga qo\'ng\'iroq markazi orqali yordam bering.', 'Помогайте фермерам, водителям и маркетам через колл-центр.', 'Help farmers, drivers and markets via the call centre.') },
    ],
  },
};

const pick = (...ids: string[]) => ids.map((i) => TOPICS[i]);

export const ROLE_META: Record<GuideRole, { icon: string; title: L3; intro: L3; topics: Topic[] }> = {
  FARMER: { icon: 'fa-tractor', title: L('Fermer', 'Фермер', 'Farmer'), intro: L('Hosilni to\'g\'ridan-to\'g\'ri marketlarga soting: e\'lon, tasdiqlash va xavfsiz to\'lov.', 'Продавайте урожай напрямую маркетам: объявление, подтверждение и безопасная оплата.', 'Sell your harvest directly to markets: listing, approval and safe payment.'), topics: pick('listing', 'escrow', 'payouts', 'kyc', 'badges', 'prices') },
  DRIVER: { icon: 'fa-truck', title: L('Haydovchi', 'Водитель', 'Driver'), intro: L('Yuk toping, daromadni oldindan biling va to\'lovni kafolat bilan oling.', 'Находите грузы, узнавайте доход заранее и получайте оплату с гарантией.', 'Find cargo, know your earnings upfront and get paid with a guarantee.'), topics: pick('payouts', 'escrow', 'eld', 'post', 'kyc', 'badges') },
  MARKET: { icon: 'fa-store', title: L('Market', 'Маркет', 'Market'), intro: L('Fermerlardan to\'g\'ridan-to\'g\'ri xarid qiling: bron, Escrow to\'lov va kuzatuv.', 'Покупайте напрямую у фермеров: бронь, эскроу-оплата и отслеживание.', 'Buy directly from farmers: booking, Escrow payment and tracking.'), topics: pick('booking', 'escrow', 'prices', 'post', 'badges') },
  DISPATCHER: { icon: 'fa-headset', title: L('Dispetcher', 'Диспетчер', 'Dispatcher'), intro: L('Platforma jarayonlarini kuzating va ishtirokchilarga yordam bering.', 'Следите за процессами платформы и помогайте участникам.', 'Oversee platform processes and help participants.'), topics: pick('dispatch', 'prices', 'escrow', 'eld') },
};

export const UI_TEXT = {
  title: L('AgrarGo foydalanish qo\'llanmasi', 'Руководство пользователя AgrarGo', 'AgrarGo user guide'),
  subtitle: L('Fermerdan to\'g\'ridan-to\'g\'ri B2B platforma', 'B2B-платформа напрямую от фермера', 'Direct-from-farmer B2B platform'),
  step: L('Qadam', 'Шаг', 'Step'),
  contents: L('Mundarija', 'Содержание', 'Contents'),
  flow: L('Escrow sxemasi', 'Схема эскроу', 'Escrow flow'),
  footer: L('Savollar uchun: qo\'llab-quvvatlash markaziga murojaat qiling.', 'По вопросам обращайтесь в службу поддержки.', 'For questions please contact support.'),
};

/** Tilga moslangan JSON */
export function guideFor(lang: Lang, only?: GuideRole) {
  const roles = GUIDE_ROLES.filter((r) => !only || r === only).map((r) => {
    const m = ROLE_META[r];
    return {
      role: r, icon: m.icon, title: m.title[lang], intro: m.intro[lang],
      topics: m.topics.map((t) => ({ id: t.id, icon: t.icon, title: t.title[lang], steps: t.steps.map((s) => ({ icon: s.icon, title: s.title[lang], text: s.text[lang] })) })),
    };
  });
  return { lang, title: UI_TEXT.title[lang], roles };
}
