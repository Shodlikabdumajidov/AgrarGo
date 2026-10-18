# AgrarGo
AgrarGo — O'zbekiston agrar sektori uchun aqlli agro-logistika ekotizimi.

- `index.html` — frontend (bitta sahifa), `backend/` — NestJS + Prisma + PostgreSQL API ([backend/README.md](backend/README.md)).

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
