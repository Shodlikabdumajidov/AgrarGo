# AgrarGo Backend (NestJS + Prisma + PostgreSQL)

```bash
cp .env.example .env      # DATABASE_URL va JWT_SECRET ni to'ldiring
npm install
npx prisma migrate dev
npm run start:dev
```

## Testlar
```bash
npm test            # unit testlar (bazasiz, ~6 s)
npm run test:e2e    # e2e: haqiqiy PostgreSQL (agrargo_test), to'liq HTTP stack, ~20 s
npm run test:all
```
E2E testlar `TEST_DATABASE_URL` (standart: `postgresql://postgres:parol@localhost:5432/agrargo_test`) bazasida ishlaydi, migratsiyalarni o'zi qo'llaydi va **faqat nomi `_test` bilan tugaydigan bazada** ishga tushadi (jadvallarni tozalaydi). Qamrov: autentifikatsiya va JWT himoyasi, bitta raqam — bitta rol, bron (qisman miqdor, poyga holatlari, telefon ochilishi), yuk tashish oqimi, rate-limit, CORS, xavfsizlik sarlavhalari va sozlamalarni tekshirish. GitHub Actions: `.github/workflows/backend-ci.yml`.

## Production'ga chiqarish
1. `.env` (yoki platforma sozlamalari) ni to'ldiring. Ilova noto'g'ri sozlama bilan **ishga tushmaydi** va sabablarini ko'rsatadi:
   - `NODE_ENV=production`
   - `JWT_SECRET`: kamida 32 belgi, tasodifiy (`openssl rand -base64 48`); namuna va zaif qiymatlar rad etiladi
   - `CORS_ORIGINS=https://agrargo.uz,https://www.agrargo.uz`: faqat shu manzillarga ruxsat; `*` va `http://` mumkin emas
   - `TRUST_PROXY=1`: Nginx/balancer ortida bo'lsangiz (aks holda barcha mijozlar bitta IP bo'lib ko'rinadi va rate-limit hamma uchun bir vaqtda ishlaydi). Proksisiz `0` qoldiring.
2. `npx prisma migrate deploy && npm run build && npm run start:prod`
3. `GET /health` — balancer/monitoring uchun (bazani tekshiradi, hech narsa oshkor qilmaydi).
4. Frontend (`index.html`) dagi `API_URL` ni backend manziliga almashtiring.

### Himoya choralari
- **Rate-limit** (`@nestjs/throttler`, javob `429` + `Retry-After`): umumiy 120 so'rov/daq/IP; login: telefon raqam bo'yicha 5 urinish/15 daq (keyin 30 daq blok) va IP bo'yicha 20 urinish/15 daq; ro'yxatdan o'tish: 10/soat/IP (uch rol uchun umumiy); avatar yuklash 10/daq; bron 30/daq. Chegaralar `THROTTLE_*` orqali sozlanadi. Hisoblagichlar xotirada saqlanadi: bir nechta nusxada (instance) ishlatilsa, Redis storage ulang.
- **CORS**: production'da faqat `CORS_ORIGINS`; cookie ishlatilmaydi (JWT `Authorization` sarlavhasida).
- **Helmet**: CSP, HSTS, `nosniff`, `X-Frame-Options`; `X-Powered-By` o'chirilgan.
- **JWT**: faqat HS256, muddati `JWT_EXPIRES_IN`; foydalanuvchining roli token ichidan emas, bazadan olinadi; faolsizlantirilgan akkauntlar tokeni ham rad etiladi.
- **Login**: noto'g'ri parol va mavjud bo'lmagan raqam bir xil xabar va bir xil vaqt sarflanadi (akkaunt mavjudligi oshkor bo'lmaydi).
- **Yuklash**: fayl turi baytlar bo'yicha tekshiriladi, hajm ≤ 2 MB, papka ro'yxati ko'rsatilmaydi.


## API
- `POST /auth/farmer/register` — fermer ro'yxatdan o'tishi (telefon `+998XXXXXXXXX`, parol, fullName, farmName, region, district; ixtiyoriy: address, latitude, longitude, stir)
- `POST /auth/login` — `{ phone, password }` → `{ accessToken, user }`
- `GET /auth/me` — `Authorization: Bearer <token>`

## Products (faqat FARMER roli, `Authorization: Bearer <token>`)
- `POST /products` — `{ name, category, quantityKg, pricePerKg, harvestDate?, description? }`
- `GET /products?status=ACTIVE|BOOKED|SOLD|ARCHIVED` — faqat o'z e'lonlari
- `GET /products/:id`
- `PUT /products/:id` — qisman yangilash; `status` faqat `ACTIVE`/`ARCHIVED`
- `DELETE /products/:id`

Boshqa fermerning e'loni `404` qaytaradi. FARMER bo'lmagan rol `403`, tokensiz `401`.

## Marketplace (ochiq, tokensiz)
`GET /marketplace?q=&category=&region=&sort=newest|price_asc|price_desc&page=1&limit=12`
- Faqat `ACTIVE` e'lonlar. `q` — mahsulot, kategoriya, xo'jalik yoki fermer ismi bo'yicha (katta-kichik harf farqsiz).
- `limit` ≤ 50. Javob: `{ items: [...], meta: { page, limit, total, totalPages } }`.
- Fermer haqida faqat `fullName`, `farmName`, `region`, `district`, `isVerified` qaytadi. Telefon, email, manzil, koordinata va STIR hech qachon qaytmaydi (`select` orqali whitelist).

## Rollar (bitta telefon — bitta rol)
- `POST /auth/farmer/register`, `POST /auth/driver/register`, `POST /auth/market/register`
- Raqam allaqachon bor bo'lsa: `409 "Ushbu raqam allaqachon Fermer sifatida ro'yxatdan o'tgan"` (rol nomi mavjud rolga qarab).
- `POST /auth/login` ixtiyoriy `role` qabul qiladi (`FARMER|DRIVER|MARKET`); raqam boshqa rolda bo'lsa `409`.

## Profil (`Authorization: Bearer <token>`, har qanday rol)
- `GET /profile`, `PATCH /profile` (rolga mos maydonlar; telefon va rol o'zgarmaydi)
- `POST /profile/avatar` (multipart, maydon nomi `file`; JPG/PNG/WEBP, ≤ 2 MB, tur baytlar bo'yicha tekshiriladi), `DELETE /profile/avatar`
- `POST /profile/cover` (multipart, `file`; faqat FARMER/MARKET, JPG/PNG/WEBP, ≤ 4 MB, bayt-imzo tekshiriladi), `DELETE /profile/cover` — kabinet muqovasi (`User.coverUrl`)
- `GET /marketplace` yangi filtrlar: `minPrice`, `maxPrice` (so'm/kg), `minQty`, `maxQty` (kg); javob `meta.ranges` — slayder chegaralari
- **Bozor narxlari**: `GET /market-prices?q=` (har bir bozor+mahsulot uchun eng oxirgi narx; qidiruv bozor yoki mahsulot nomi bo'yicha; barcha tizimga kirgan rollar), `GET /market-prices/markets` (viloyat bo'yicha bozorlar ro'yxati), `POST /market-prices` (faqat ADMIN/DISPATCHER, multipart: `marketName`, `productName`, `priceToday`, ixtiyoriy `image` ≤ 3 MB). Yangi narx qo'shilganda shu bozor va mahsulotning oxirgi narxi avtomatik `priceYesterday` ga yoziladi; birinchi kiritishda kecha = bugun. Test ma'lumotlari: `npm run seed:prices` (jadval bo'sh bo'lsagina).
- **Hujjatlar (PDF)**: `GET /documents/ttn/:shipmentId` (Tovar-transport yukxati) va `GET /documents/receipt/:shipmentId` (to'lov cheki) — yukning fermeri, marketi, biriktirilgan haydovchisi va admin oladi (boshqalarga 403). Hujjatda logotip, tomonlar, yuk, marshrut, summa va HMAC-SHA256 asosidagi xavfsizlik kodi + QR bor. Ochiq tekshiruv: `GET /documents/verify/:kind/:shipmentId/:code` (shaxsiy ma'lumotsiz). Shrift va logotip `backend/assets/` ichida (ish papkasiga nisbatan o'qiladi).
- **Excel hisobotlar**: `GET /reports/market.xlsx?month=YYYY-MM|all` (MARKET: xulosa, bronlar, to'lovlar/Escrow, ombor buyurtmalari), `GET /reports/admin.xlsx?from=&to=` (ADMIN: tranzaksiyalar va ularning tarixi, foydalanuvchilar, obuna to'lovlari). Foydalanuvchi matnlari formula-inyeksiyadan himoyalangan; har varaq 20 000 qatorgacha.
- **KYC / ishonch / badjlar**: `GET /kyc`, `POST /kyc/documents/:type` (haydovchi: `ID_CARD`, `DRIVER_LICENSE`, `TECH_PASSPORT`, `FACE`; JPG/PNG/WEBP ≤ 5 MB) — fayllar ommaviy `/uploads`da EMAS, `backend/private/kyc/` ichida va faqat egasi/admin oladi. 4 ta hujjatdan keyin `KYC_ALLOW_SIMULATION=true` bo'lsa avtomatik `isVerified=true, verifiedAt` (Face ID haqiqiy solishtirilmaydi — demo); aks holda `PENDING` va administrator `GET /kyc/pending`, `POST /kyc/:userId/approve|reject|revoke` orqali ko'rib chiqadi (fermer/marketda hujjatsiz admin tasdig'i). Production'da `KYC_ALLOW_SIMULATION` standart `false`.
- **Status va badjlar**: `GET /trust/me` (status NEW/REGULAR/VETERAN, daraja, haydovchi 15 + fermer 4 + market 3 badj, progress bilan), `GET /trust/user/:id` (ommaviy qisqa kartochka). Yuk va dispetcher haydovchi ro'yxatidagi `driver.trust`. Baholash: `POST /ratings` (yetkazilgan yukdan keyin tomonlar bir-birini 1–5 yulduz, «xushmuomala»/«zarar yetdi» tegi bilan), `GET /ratings/mine`. Hisob-kitob qoidalari `src/trust/badges.ts` va `trust.service.ts`da (masofa — viloyat markazlari bo'yicha taxminiy; «bo'sh qaytish» — 48 soat ichida oldingi manzildan o'z viloyatiga yuk; ELD — kuniga ≥5 GPS nuqta bo'lgan ketma-ket kunlar). `POST /bookings` da `urgent: true` — shoshilinch bron.
- Davlat raqami: faqat KATTA lotin harflari va raqamlar (`01A777AA` yoki `70777AAA`); server kichik harfni KATTAga o'tkazadi.
- **Obuna va bepul sinov**: ro'yxatdan o'tgan FARMER/DRIVER/MARKET'ga avtomatik 30 kunlik sinov (`User.trialEndsAt`); to'lovdan keyin `User.subscriptionEndsAt` uzaytiriladi (kirish huquqi = ikkalasidan kechrog'i; qolgan sinov kunlari yo'qolmaydi). Tariflar (oyiga): Fermer 49 000, Haydovchi 79 000, Market 149 000 so'm — server hisoblaydi.
  - `GET /subscription` (holat, qolgan kunlar, tariflar), `GET /subscription/plans`, `GET /subscription/history`, `POST /subscription/pay` `{ months: 1|3|6|12 }` (hozir simulyatsiya provayderi orqali)
  - Muddat tugagach `SubscriptionGuard` e'lon berish (`POST /products`, `POST /warehouse/items`), bron qilish (`POST /bookings`) va yuk qabul qilishni (`POST /shipments/:id/accept`) bloklaydi: **402** `{ code: 'SUBSCRIPTION_REQUIRED' }`. O'qish amallari va to'lov ishlayveradi. Admin/dispetcher obunadan ozod.
- Rasmlar `uploads/avatars/` papkasida saqlanadi va `/uploads/avatars/<fayl>` orqali beriladi (production'da doimiy disk yoki S3 kerak).

## Bronlar (qisman miqdor)
- `POST /bookings` (MARKET): `{ productId, quantityKg, message? }`. E'lon qoldig'i darhol kamayadi; qoldiq 0 bo'lsa e'lon `BOOKED` bo'ladi va bozordan chiqadi.
- `GET /bookings/mine` (MARKET), `PATCH /bookings/:id/cancel` (faqat `PENDING`)
- `GET /bookings/incoming` (FARMER), `PATCH /bookings/:id/approve`, `PATCH /bookings/:id/reject`
- Rad etilgan/bekor qilingan bronning miqdori e'longa qaytadi. Narx bron paytida qotiriladi.
- Telefon raqamlar faqat `APPROVED` bronda ikkala tomonga ochiladi.

## Yuk tashish (Shipments)
Fermer bronni tasdiqlaganda shu tranzaksiyada `OPEN` holatdagi yuk yaratiladi (marshrut: fermer manzili → market manzili, og'irlik = bron miqdori; ma'lumotlar bron paytida nusxalanadi).

Holatlar: `OPEN` (haydovchi kutilmoqda) → `LOADING` (yuklanmoqda) → `IN_TRANSIT` (yo'lda) → `DELIVERED` (yetkazib berildi). Har o'zgarish `events` ro'yxatiga yoziladi (tarix).

- `GET /shipments/available?originRegion=` (DRIVER): bo'sh yuklar. Faqat viloyat/tuman, og'irlik va `fitsCapacity` ko'rinadi; aniq manzil va telefonlar yashirin.
- `POST /shipments/:id/accept` (DRIVER): yukni biriktirish (`OPEN → LOADING`). Transport sig'imidan og'ir yuk va ikkinchi faol yuk (`MAX_ACTIVE_SHIPMENTS = 1`) rad etiladi; bir yukka bir vaqtda faqat bitta haydovchi yetadi.
- `POST /shipments/:id/release` (DRIVER): yo'lga chiqishdan oldin qaytarish (`LOADING → OPEN`).
- `PATCH /shipments/:id/advance` (DRIVER): `LOADING → IN_TRANSIT → DELIVERED`.
- `GET /shipments/mine?status=` (DRIVER | FARMER | MARKET): o'ziga tegishli yuklar. Haydovchi ikkala tomonning manzili va telefonini, fermer/market esa biriktirilgan haydovchi ma'lumotini ko'radi.

## GPS joylashuv va ELD (`Authorization: Bearer <token>`)
- `POST /shipments/:id/location` (DRIVER, faqat o'z yuki, faqat **YO'LDA**) — `{ lat, lng, timestamp?, speedKmh?, accuracyM?, source? }`. Javob: `{ accepted, latest }`.
  - Tekshiruvlar: koordinata diapazoni, `timestamp` kelajakda bo'lmasligi va 10 daqiqadan eski bo'lmasligi, oldingi nuqtadan 200 km/soatdan tez "sakrash" → 422, takroriy vaqt → `accepted:false` (xato emas), eski nuqta jurnalga yoziladi lekin "oxirgi joylashuv"ni almashtirmaydi.
  - Rate-limit: haydovchi bo'yicha minutiga `THROTTLE_LOCATION_LIMIT` (12). Mijoz har 10-15 soniyada yuboradi.
  - `source: "SIMULATED"` demo rejimi: `LOCATION_ALLOW_SIMULATION=true` bo'lsagina qabul qilinadi (productionda sukut bo'yicha yo'q), ko'ruvchilarga "Demo" deb ko'rsatiladi.
- `GET /shipments/:id/location` (DRIVER/FARMER/MARKET/ADMIN, faqat o'ziga tegishli yuk; begona yuk 404) — joriy nuqta, so'nggi 200 nuqtalik iz va marshrut (viloyat markazlari, taxminiy). Faqat yuk YO'LDA bo'lganda; yetkazilgach joylashuv ko'rsatilmaydi. `Cache-Control: no-store`.
- `GET /shipments/eld?days=1..7` (DRIVER) — ELD jurnali: kunlar bo'yicha haydash/to'xtash daqiqalari, masofa, tezlik, to'xtashlar tarixi (≥3 daqiqa), 9 soatlik kunlik chegara belgisi. Kunlar Toshkent vaqti (UTC+5) bo'yicha. 5 daqiqadan uzoq signalsiz oraliq hisobga olinmaydi.
- Jadvallar: `LocationLog` (har bir nuqta), `Shipment.last*` (oxirgi nuqta nusxasi). Eslatma: jurnal hozircha cheksiz saqlanadi — productionda eski yozuvlarni arxivlash/o'chirish ishini qo'shing.

## Super Admin paneli (`ADMIN`) va sayt sozlamalari
`/admin/*` — faqat ADMIN (dispetcher ham kira olmaydi). Omborxona (`/warehouse/*`) va to'lov (`/payments`, `release`, `refund`) endpointlari ham ADMIN'ga ochiq.
- `GET /admin/stats` — foydalanuvchilar, e'lonlar, bronlar, yuklar, to'lovlar (aylanma, escrow), ombor, 14 kunlik ro'yxatdan o'tish.
- Foydalanuvchilar: `GET /admin/users` (rol, holat, qidiruv, sahifalash), `GET|PATCH /admin/users/:id` (profil tahriri — foydalanuvchi profilidagi bir xil validatsiya), `PATCH /admin/users/:id/status` (bloklash/faollashtirish; bloklanganda sessiyalar darhol yopiladi; o'zini va oxirgi faol adminni bloklab bo'lmaydi), `POST /admin/users/:id/password`, `POST /admin/staff` (dispetcher/admin yaratish).
- `GET /admin/products`, `PATCH|DELETE /admin/products/:id`, `GET /admin/shipments`.
- Sozlamalar: `SystemSettings` (yagona qator, id=1). Ochiq: `GET /settings/public` (tokensiz, keshlanmaydi). Admin: `GET|PUT /admin/settings` — call-center telefonlari (1-5), email, Telegram, Instagram/Facebook/YouTube (faqat `https://`), ish vaqti va manzil (uz/ru/en). Sayt ochilganda va admin saqlaganda darhol yangilanadi.
- Audit: `AuditLog`; admin amallari va xodimlar (admin/dispetcher) bajargan ombor/to'lov o'zgarishlari yoziladi: `GET /admin/audit`. Parollar yozilmaydi.

## Omborxona (Warehouse / WMS)
Rollar: **FARMER** (e'lon qiladi, o'z yuklarini kuzatadi), **MARKET** (tayyor postlardan buyurtma beradi), **DISPATCHER** yoki **ADMIN** (ombor operatsiyalari). Dispetcher API orqali ro'yxatdan o'tmaydi:
`ADMIN_PASSWORD='...' npm run admin:create -- --role=DISPATCHER +998901234567 "Ism Familiya"`

Zonalar: `INBOUND` (qabul) → `STORAGE` (kamera/ombor) ↔ `SORTING` (saralash/qadoqlash) → `OUTBOUND` (jo'natish). Yuk holati: `ANNOUNCED → RECEIVED → ACTIVE` (yoki `REJECTED`) → `DEPLETED`.

- Fermer: `POST /warehouse/items` (e'lon; saqlash turi nomi/toifasidan aniqlanadi), `GET /warehouse/items/mine`, `DELETE /warehouse/items/:id` (qabul qilinmaguncha), `POST /warehouse/items/:id/photo`.
- Dispetcher: `POST /warehouse/items/:id/receive` (tortish + shtrix-kod `AG-YYMMDD-XXXXXXXX`, ixtiyoriy RFID), `/inspect` (baho A/B/C, yaroqsiz miqdor, rad etish), `/move` (zona + kamera; sovuq talab qiladigan mahsulot quruq omborga qo'yilmaydi, sig'im tekshiriladi, saqlash muddati hisoblanadi), `/sort` (o'lcham, qadoq, chiqit), `/count` (inventarizatsiya), `GET /warehouse/scan/:code`, `GET /warehouse/items`, `GET /warehouse/inventory`.
- Kameralar: `GET/POST /warehouse/units`, `POST /warehouse/units/defaults`, `POST /warehouse/units/:id/readings` (harorat/namlik; me'yor/ogohlantirish/avariya, 30 daqiqadan eski ko'rsatkich = NO_DATA).
- Market: `GET /warehouse/feed` (faqat jo'natishga tayyor postlar; telefon va zaxira miqdori yashirin), `POST /warehouse/orders` (miqdor atomik zaxiralanadi va **to'lov darhol HELD** holatida muzlatiladi — provayder xatosida buyurtma ham, zaxira ham yaratilmaydi), `GET /warehouse/orders/mine`, `PATCH /warehouse/orders/:id/cancel` (jo'natilgunga qadar; pul qaytariladi), `PATCH /warehouse/orders/:id/deliver` (market / dispetcher / admin tasdiqlaydi → pul RELEASED).
- Dispetcher buyurtmalari: `PATCH /warehouse/orders/:id/picking|picked|assign|dispatch`. Buyurtma yig'ilganda (`picked`) mavjud **Shipment** tizimida OPEN yuk yaratiladi (marshrut: omborxona → market; manzil Sayt sozlamalaridan). Haydovchi uni "Mavjud yuklar"da qabul qiladi (yoki dispetcher `assign` bilan biriktiradi), dispetcher `dispatch` bilan yuklanganini tasdiqlaydi (qoldiq kamayadi, yuk IN_TRANSIT). GPS va ELD mavjud `/tracking` va `/shipments` orqali ishlaydi. Haydovchi yetkazganda buyurtma DELIVERED bo'ladi, lekin pul market/dispetcher/admin tasdiqlamaguncha escrow'da qoladi. `GET /warehouse/orders`, `GET /warehouse/drivers`.
- Xizmat haqi: `WAREHOUSE_FEE_PERCENT` (0–30, standart 2). Chiqarilganda fermer `summa − xizmat haqi` oladi, xizmat haqi omborxonada qoladi (hodisa izohida yoziladi). Market umumiy summani, fermer sof summani va haqni ko'radi; haydovchi summani ko'rmaydi.
- Qoldiq `StockMovement` jurnali bilan mos; bazada `CHECK (reservedKg <= weightKg, weightKg >= 0)` cheklovlari bor.
- Eslatma: buyurtmalar hozircha escrow to'lovga ulanmagan va ombor jo'natmalari `Shipment` (GPS) tizimidan alohida; harorat datchiklari uchun haqiqiy IoT integratsiyasi yo'q (dispetcher kiritadi).

## Kafolatlangan to'lov (Escrow)
Bron tasdiqlanganda `PENDING` to'lov yaratiladi (summa = miqdor × bron narxi, serverda hisoblanadi, `UZS`). Yuk faqat to'lov `HELD` bo'lgandan keyin olinadi.

Holatlar: `PENDING` (kutilmoqda) → `HELD` (escrow'da) → `RELEASED` (fermerga o'tdi) yoki `REFUNDED` (xaridorga qaytdi); to'lanmagan buyurtma bekor qilinsa `CANCELLED`. Har o'zgarish `events` ro'yxatiga (kim, qachon, nima uchun) yoziladi.

- `POST /payments/init` `{ bookingId }` (MARKET): to'laydi → `HELD`. Takroriy so'rov xavfsiz (idempotent): ikki marta yechilmaydi.
- `POST /payments/release` `{ bookingId }`: `HELD → RELEASED`. Xaridor: yuk yetkazilgach. Fermer: yetkazilgandan `PAYMENT_RELEASE_GRACE_HOURS` (72) soat o'tib, xaridor e'tiroz bildirmagan bo'lsa. ADMIN: istalgan vaqtda.
- `POST /payments/refund` `{ bookingId, reason? }`: to'lanmagan bo'lsa `CANCELLED`, escrow'da bo'lsa `REFUNDED`. Xaridor: haydovchi biriktirilgunga qadar; fermer: yuk yo'lga chiqquncha; ADMIN: istalgan paytda. Yuk yo'lga chiqmagan bo'lsa buyurtma ham bekor qilinadi (bron va yuk `CANCELLED`, miqdor e'longa qaytadi); yo'lda/yetkazilgan yukda faqat ADMIN, u pulni qaytaradi, buyurtmaga tegmaydi.
- `GET /payments?status=` (MARKET | FARMER | ADMIN): o'z to'lovlari va tranzaksiyalar tarixi; javobdagi `actions` (`canPay`, `canRelease`, `canRefund`) UI uchun tayyor ruxsatlar.
- `GET /payments/booking/:bookingId`

Qoidalar `src/payment/payment.policy.ts` da (sof funksiyalar, unit testlangan). Pul harakati `PaymentProvider` adapteri orqali: hozir `SimulatedPaymentProvider` (haqiqiy pul yo'q). Provayder xatosida tranzaksiya qaytariladi (holat o'zgarmaydi, `502`). E'londa to'lov tarixi bo'lsa u o'chirilmaydi.

**Administrator** API orqali ro'yxatdan o'tmaydi: `ADMIN_PASSWORD='...' npm run admin:create -- +998901234567 "Ism Familiya"` (parol kamida 12 belgi).

## Parol: o'zgartirish va SMS orqali tiklash
**Parol siyosati** (ro'yxatdan o'tish, o'zgartirish va tiklashda): kamida 8 belgi, kamida bitta harf va bitta raqam, 72 baytdan oshmasin (bcrypt chegarasi), ommabop zaif parollar (`Password123`, `qwerty123`...) rad etiladi. Mavjud foydalanuvchilarning eski parollari o'zgarmaydi.

- `POST /auth/change-password` `{ currentPassword, newPassword }` (tizimga kirgan): joriy parol tekshiriladi (noto'g'ri bo'lsa `400`). Muvaffaqiyatda `tokenVersion` oshadi: **barcha boshqa qurilmalardagi tokenlar darhol yaroqsiz bo'ladi**; javobdagi yangi `accessToken` joriy qurilmani tizimda saqlaydi. Foydalanuvchiga xavfsizlik SMS'i yuboriladi.
- `POST /auth/forgot-password` `{ phone }`: raqam mavjudligidan qat'i nazar **bir xil javob** (`200`), mavjud bo'lsa 6 xonali kod SMS qilinadi (SMS javobni kutmasdan yuboriladi). Kod 5 daqiqa amal qiladi, yangi kod eskisini bekor qiladi.
- `POST /auth/verify-reset-code` `{ phone, code }`: to'g'ri kod bir martalik `resetToken` beradi (10 daqiqa). Har bir kodda ko'pi bilan 5 ta urinish (to'g'ri javob ham bitta urinish, parallel so'rovlar bilan ham oshib bo'lmaydi); xato sabablari (noto'g'ri, eskirgan, tugagan, raqam yo'q) bir xil xabar.
- `POST /auth/reset-password` `{ resetToken, newPassword }`: token bir martalik; zaif parol tokenni "yoqmaydi". Muvaffaqiyatda barcha eski tokenlar yaroqsiz bo'ladi. Avtomatik kirish yo'q.

**Saqlash**: kod HMAC-SHA256 (server kaliti va raqam bilan), token SHA-256 xeshi sifatida; ochiq ko'rinishda hech qachon.
**Rate-limit** (`429` + `Retry-After`): kod so'rash: qayta yuborish kutishi (60 s) + raqamga soatiga 3 + IP'ga soatiga 5 (mavjud bo'lmagan raqamlar ham xuddi shunday sanaladi); kodni tekshirish: raqamga 15 daqiqada 10 (keyin 30 daqiqa blok) + IP'ga 20; yangi parol: IP'ga 10; parolni o'zgartirish: foydalanuvchiga 15 daqiqada 5 (token imzosi tekshirilib, soxta token bilan boshqa hisobni to'ldirib bo'lmaydi).
**SMS**: `SmsProvider` adapteri; hozir `SimulatedSmsProvider` (SMS yuborilmaydi). Development/test'da `forgot-password` javobida `devCode` qaytadi (faqat shu rejimlarda); production'da simulyatsiya `SMS_ALLOW_SIMULATION=true`siz ishga tushmaydi va u yoqilganda ham kod jurnalga yozilmaydi.


## Telegram bot va xabarnomalar

- `.env`: `TELEGRAM_BOT_TOKEN` (BotFather tokeni, faqat serverda), `TELEGRAM_BOT_USERNAME`, `TELEGRAM_POLLING`, `TELEGRAM_LINK_TTL_SECONDS`. Token bo'sh bo'lsa bot o'chiq, qolgan tizim ishlayveradi.
- Bog'lash: `POST /profile/telegram/link` → `{ token, url: https://t.me/<bot>?start=<token>, expiresAt }` (bir martalik, 10 daqiqa; bazada faqat SHA-256 xeshi). Foydalanuvchi botda `/start <token>` bossa akkaunt chatga bog'lanadi. `GET /profile/telegram` — holat, `DELETE /profile/telegram` — uzish. Botda: `/unlink`, `/help`.
- Maxfiylik: API javoblarida `telegramChatId` va token ko'rinmaydi, faqat `telegramLinked`. Bitta chat — bitta akkaunt.
- Xabarnomalar: bron (fermerga), bron tasdiqlanishi (market va fermerga), escrow muzlatilishi (bron va ombor buyurtmasi; market va fermerga), yuk "Yo'lda" va "Yetkazildi" (fermer, market va ombor yuklari uchun dispetcherlarga). Xabarlar tranzaksiya tasdiqlangandan keyin, asosiy amalni kutdirmasdan yuboriladi; xato bo'lsa amal buziladi emas. Bot bloklangan chat avtomatik uziladi.
- Cheklov: yuborish navbati xotirada (server qayta ishga tushsa kutayotgan xabarlar yo'qoladi). Long polling bitta nusxada ishlashi kerak.

## Sharhlar (Live Reviews)

- `GET /reviews?role=&limit=` — ochiq (tokensiz): faqat tasdiqlangan sharhlar + umumiy va rollar bo'yicha statistika (o'rtacha, taqsimot). Ismning faqat bosh harfi, rol va viloyat ko'rinadi; telefon/ID chiqmaydi. IP bo'yicha daqiqasiga cheklangan.
- `POST /reviews { rating: 1..5, comment: 10..500 }` — faqat fermer, haydovchi, market. Bitta foydalanuvchi — bitta sharh (qayta yuborsa yangilanadi). Foydalanuvchi bo'yicha soatiga cheklangan (`THROTTLE_REVIEW_LIMIT`). Spamga qarshi: havola/@username/domen taqiqlanadi, takroriy belgilar va boshqa foydalanuvchining aynan shu matni rad etiladi; boshqaruv belgilari olib tashlanadi; baho va uzunlik bazada ham CHECK bilan himoyalangan.
- `GET /reviews/mine`, `DELETE /reviews/mine` — o'z sharhi.
- Moderatsiya (ADMIN): `GET /admin/reviews`, `PATCH /admin/reviews/:id { isApproved }`, `DELETE /admin/reviews/:id` (audit jurnaliga yoziladi). `REVIEWS_AUTO_APPROVE=false` bo'lsa yangi sharh admin tasdiqlaguncha ko'rinmaydi.

## PWA

Frontend ildizida: `manifest.json`, `sw.js` (Service Worker), `offline.html`, `icons/`. Service Worker faqat `https://` yoki `localhost` da ishlaydi. App shell oldindan keshlanadi, statik fayllar va CDN stale-while-revalidate; backend API va Authorization'li so'rovlar hech qachon keshlanmaydi. Keshni yangilash uchun `sw.js` dagi `VERSION` ni oshiring.
