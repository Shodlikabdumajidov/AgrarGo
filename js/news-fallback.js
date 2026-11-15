// Avtomatik yaratilgan (node tools/build-news-fallback.js). Server javob bermaganda ko'rsatiladigan zaxira yangiliklar: AI xulosasiz (u faqat serverdan, tizimga kirganlarga keladi).
window.NEWS_FALLBACK = [
 {
  "id": "fb-1",
  "category": "ROADS",
  "region": "Samarqand",
  "hoursAgo": 3,
  "titleUz": "Samarqandda bayram munosabati bilan markaziy ko'chalar yopiladi",
  "titleRu": "В Самарканде на время праздника перекроют центральные улицы",
  "titleEn": "Central streets in Samarkand to be closed for the holiday",
  "summaryUz": "Bayram tadbirlari tufayli Registon va Amir Temur ko'chalari atrofida 2 kun davomida transport harakati cheklanadi. Yuk avtomobillari uchun aylanma yo'llar belgilandi.",
  "summaryRu": "Из-за праздничных мероприятий на 2 дня ограничат движение транспорта вокруг Регистана и улицы Амира Темура. Для грузовиков определены объездные маршруты.",
  "summaryEn": "Holiday events will restrict traffic around Registan and Amir Temur street for 2 days. Detour routes have been set for trucks."
 },
 {
  "id": "fb-2",
  "category": "ROADS",
  "region": "Farg'ona",
  "hoursAgo": 9,
  "titleUz": "Qamchiq dovonida ob-havo o'zgaradi: qor va tuman kutilmoqda",
  "titleRu": "На перевале Камчик ожидается перемена погоды: снег и туман",
  "titleEn": "Weather change on Kamchik Pass: snow and fog expected",
  "summaryUz": "Gidrometeorologiya xizmati yaqin 48 soat ichida Qamchiq dovonida qor, tuman va silliq yo'l ehtimolini ogohlantirdi. Og'ir yuk transportiga ehtiyot bo'lish tavsiya etiladi.",
  "summaryRu": "Гидрометслужба предупредила о вероятности снега, тумана и гололёда на перевале Камчик в ближайшие 48 часов. Тяжёлому транспорту рекомендуется соблюдать осторожность.",
  "summaryEn": "The weather service warns of snow, fog and icy roads on Kamchik Pass over the next 48 hours. Heavy freight is advised to take extra care."
 },
 {
  "id": "fb-3",
  "category": "MARKET",
  "region": "Toshkent",
  "hoursAgo": 20,
  "titleUz": "Toshkent ulgurji bozorlarida mavsumiy sabzavot talabi oshmoqda",
  "titleRu": "На оптовых рынках Ташкента растёт сезонный спрос на овощи",
  "titleEn": "Seasonal vegetable demand is rising on Tashkent wholesale markets",
  "summaryUz": "Toshkent Food City va boshqa ulgurji bozorlarda kartoshka, sabzi va piyozga talab o'tgan haftaga nisbatan sezilarli oshdi. Savdogarlar ertalabki soatlarda yirik hajmda xarid qilmoqda.",
  "summaryRu": "На Tashkent Food City и других оптовых рынках спрос на картофель, морковь и лук заметно вырос за неделю. Торговцы закупают крупные объёмы в утренние часы.",
  "summaryEn": "Demand for potatoes, carrots and onions has risen noticeably week-on-week at Tashkent Food City and other wholesale markets. Traders are buying large volumes in the early morning."
 },
 {
  "id": "fb-4",
  "category": "AGRO",
  "region": "Jizzax",
  "hoursAgo": 30,
  "titleUz": "Jizzaxda sovuq ogohlantirishi: issiqxona va omborlarni tayyorlash tavsiya etiladi",
  "titleRu": "В Джизаке объявлено предупреждение о заморозках: рекомендуется подготовить теплицы и склады",
  "titleEn": "Frost warning in Jizzakh: greenhouses and storage should be prepared",
  "summaryUz": "Kelgusi kechalari harorat nolga yaqinlashishi kutilmoqda. Mutaxassislar issiqxonalarni yopishni, ochiq dala hosilini yig'ishni va omborlarda haroratni nazorat qilishni tavsiya qilmoqda.",
  "summaryRu": "В ближайшие ночи ожидается понижение температуры до нуля. Специалисты советуют закрыть теплицы, убрать урожай с открытых полей и контролировать температуру на складах.",
  "summaryEn": "Temperatures are expected to approach zero in the coming nights. Specialists advise closing greenhouses, harvesting open-field crops and monitoring storage temperatures."
 },
 {
  "id": "fb-5",
  "category": "LOGISTICS",
  "region": "Respublika",
  "hoursAgo": 42,
  "titleUz": "Respublika bo'ylab sovutgichli (refrijerator) transportga talab oshdi",
  "titleRu": "По республике вырос спрос на рефрижераторный транспорт",
  "titleEn": "Demand for refrigerated transport is up nationwide",
  "summaryUz": "Meva-sabzavot va sut mahsulotlarini uzoq masofaga tashish ko'paygani sababli refrijerator yuk mashinalariga talab va tariflar o'sdi. Bo'sh mashinalarni topish qiyinlashmoqda.",
  "summaryRu": "Из-за роста дальних перевозок плодоовощной и молочной продукции выросли спрос и тарифы на рефрижераторы. Свободные машины найти всё сложнее.",
  "summaryEn": "Long-distance shipments of fruit, vegetables and dairy have pushed up demand and rates for refrigerated trucks. Free vehicles are getting harder to find."
 }
].map(function (n) { n.publishedAt = new Date(Date.now() - n.hoursAgo * 3600000).toISOString(); n.fallback = true; return n; });
