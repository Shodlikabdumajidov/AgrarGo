# AgrarGo
AgrarGo — O'zbekiston agrar sektori uchun aqlli agro-logistika ekotizimi.

- `book/` — «Mening e'lonlarim» raqamli kitobi manbasi (React + Framer Motion), yig'ilgan bundle: `js/book/agrar-book.js` ([book/README.md](book/README.md)).
- `index.html` — frontend sahifasi (HTML + uslublar), `js/app.js` — butun frontend mantiqi, `js/tailwind-config.js` — Tailwind sozlamalari, `images/` — barcha rasmlar (`images/icons/` — PWA ikonkalari, `images/og-banner.jpg` — ulashish kartochkasi), `backend/` — NestJS + Prisma + PostgreSQL API ([backend/README.md](backend/README.md)).

## Ko'p tillilik (i18n): UZ / RU / EN
Til yuqori paneldagi 🌐 menyusidan tanlanadi va `localStorage` (`agrargo_lang`) da saqlanadi. Birinchi kirishda brauzer tili (ru/en/uz) aniqlanadi.

**Arxitektura** ("manba matn kalit" usuli, gettext kabi):
- Manba til — o'zbekcha: HTML va JS'dagi o'zbekcha matn o'zi kalit.
- Tarjimalar `i18n/src/*.txt` fayllarida: `o'zbekcha ‖ русский ‖ English` (har qatorda bitta kalit). `{0}`, `{1}` — o'zgaruvchan qismlar (uch tilda bir xil bo'lishi shart).
- `node i18n/build.js` ularni `i18n/ru.js`, `i18n/en.js` (tarjimalar) va `i18n/uz.js` (barcha kalitlar) ga aylantiradi. Bu fayllarni qo'lda tahrirlamang.
- `i18n/engine.js` — DOM kuzatuvchisi: statik HTML va JS yaratgan istalgan matn (menyu, tugma, modal, alert, server xatolari) avtomatik tarjima qilinadi. Tarjimasi bo'lmagan matn o'zbekcha qoladi. DOM'dan tashqari matnlar (`confirm`) uchun `T("kalit", ...args)`.
- Select/option **qiymatlari** (`value`) tarjima qilinmaydi — serverga har doim o'zbekcha qiymat ketadi.
- Sayt sozlamalari (ish vaqti, manzil) admin panelida har bir til uchun alohida kiritiladi.

**Yangi matn qo'shish:** matnni kodga o'zbekcha yozing → tegishli `i18n/src/*.txt` ga qator qo'shing → `node i18n/build.js` → `node i18n/check.js` (tarjimasiz matnlarni ko'rsatadi; CI ham tekshiradi).
Dasturchi uchun: brauzer konsolida `I18N.report()` — tarjimasi topilmagan matnlar ro'yxati.

## Super Admin paneli
ADMIN roli bilan kirilganda kabinetda: boshqaruv paneli (statistika), foydalanuvchilar (tahrirlash, bloklash/faollashtirish, parol tiklash, xodim qo'shish), e'lonlar, yuklar, to'lovlar (pulni o'tkazish/qaytarish), omborxona (zonalar, kameralar, buyurtmalar, inventarizatsiya), sayt sozlamalari va audit jurnali. Sayt sozlamalari (call-center, email, ijtimoiy tarmoqlar, ish vaqti, manzil) saqlangach saytning yuqori paneli va footer'ida darhol yangilanadi. Birinchi adminni yaratish: `cd backend && ADMIN_PASSWORD='...' npm run admin:create -- +998901234567 "Ism Familiya"`.

## Admin rollari (RBAC) va e-BOL
**Admin rollari.** `User.adminRole` (`SUPER_ADMIN`, `SAFETY_ADMIN`, `FINANCE_ADMIN`, `HUB_ADMIN`, `USER` — standart) biznes roli (`role`) bilan birga ishlaydi: `role = ADMIN` bo'lganlarda `USER` bo'lmagan adminRole majburiy (bazada CHECK). Himoya `RolesGuard` + `@AdminRoles(...)` orqali: belgilanmagan joy faqat `SUPER_ADMIN` uchun (xavfsiz standart). `SAFETY_ADMIN` — KYC tasdiqlash va `/safety/*`; `FINANCE_ADMIN` — to'lovlar; `HUB_ADMIN` — Hub, chakana buyurtmalar, rampalar; `/admin/*` (foydalanuvchilar, sozlamalar, audit) — faqat `SUPER_ADMIN`. Kabinetda tablar adminRole bo'yicha filtrlanadi. Mavjud adminlar migratsiyada `SUPER_ADMIN` bo'ldi. Yangi admin: `npm run admin:create -- <telefon> "Ism" --admin-role=SAFETY_ADMIN` yoki kabinetda «Xodim qo'shish»; rolni o'zgartirish: `PATCH /admin/users/:id/admin-role` (sessiyalari yopiladi; oxirgi superadminni tushirib bo'lmaydi).

**e-BOL (raqamli yuk xati).** Haydovchi yuklash joyiga yetgach `POST /shipments/:id/arrived` (Hub buyurtmasi: `POST /local/orders/:id/ebol/otp`) — fermer telefoniga 4 xonali kod SMS orqali yuboriladi (hozircha `SMS_PROVIDER=simulated`: kod server konsoliga yoziladi, production'da yozilmaydi). Haydovchi kodni `POST /shipments/:id/sign {code}` bilan kiritadi: bir tranzaksiyada `isSigned=true`, `EBolContract` (haydovchi, fermer, `signedAt`, SHA-256 izi) yoziladi va yuk `IN_TRANSIT` ga o'tadi. Kod bazada faqat HMAC-hash ko'rinishida (`pickupOtp`), muddati `EBOL_OTP_TTL_MIN` (15 daq), 5 ta urinish, qayta yuborish 60 soniyadan keyin. `EBOL_ENFORCE=true` bo'lsa imzosiz yo'lga chiqish (va Hub buyurtmasini imzosiz topshirish) rad etiladi; standartda `false` — mavjud oqim o'zgarmaydi. Ombor yuklari (dispetcher jo'natadi) e-BOL talab qilmaydi.

**Safety paneli.** `SAFETY_ADMIN` kabineti faqat ikki bo'limdan iborat: kutayotgan foydalanuvchilarni tasdiqlash/rad etish (`/kyc/*`) va imzolangan e-BOL shartnomalari ro'yxati — vaqt tamg'asi (soniyagacha) va ID lari bilan (`GET /safety/summary`, `/safety/ebol`, `/safety/ebol/:id`).
