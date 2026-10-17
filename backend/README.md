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
