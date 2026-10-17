# AgrarGo Backend (NestJS + Prisma + PostgreSQL)

```bash
cp .env.example .env      # DATABASE_URL va JWT_SECRET ni to'ldiring
npm install
npx prisma migrate dev
npm run start:dev
```

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
