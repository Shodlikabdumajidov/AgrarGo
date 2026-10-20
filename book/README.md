# AgrarGo «Mening e'lonlarim» — raqamli kitob

React 18 + Framer Motion bilan yozilgan interaktiv kitob. Asosiy ilova (vanilla JS) uni kerak bo'lganda (lazy) yuklaydi.

## Tuzilma
```
book/
  src/
    index.jsx        mount(container, props) — tashqi API (global: AgrarBook)
    BookApp.jsx      holat (useState), varaqlash mantiqi, soyalar, onboarding
    Leaf.jsx         varaq: 14 ta ichma-ich tik bo'lak → «paper curl» (sin·cos bukilish) + burchakka bog'liq soya
    Cover.jsx        charm muqova, 3D ochilish
    Toc.jsx          mundarija (chap sahifa)
    ListingPage.jsx  e'lon sahifasi (qog'oz + metall tugmalar)
    AddPage.jsx      katta zumrad «+» sahifasi
    ListingForm.jsx  markazdan «o'sib chiqadigan» forma (clip-path)
    PageSheet.jsx, MetalButton.jsx, useBookSize.js, lib.js (toza funksiyalar), book.css
  test/lib.test.mjs  toza mantiq testlari (node:test)
../js/book/agrar-book.js   yig'ilgan bundle (IIFE, ~300 KB) — repoda saqlanadi
```

## Yig'ish va test
```bash
cd book && npm install
npm run build   # ../js/book/agrar-book.js ni yangilaydi
npm run watch   # ishlab chiqish
npm test        # lib.js testlari
```
Manba o'zgarsa bundleni qayta yig'ib, `js/app.js` dagi `BOOK_SRC` (`?v=`) va `sw.js` `VERSION` ni oshiring.

## Integratsiya (js/app.js)
```js
const book = AgrarBook.mount(rootEl, {
  products,                       // GET /products natijasi
  onCreate: (payload) => api.post('/products', payload),     // Promise; xatoda { messages: [...] } bilan rad eting
  onUpdate: (id, payload) => api.put('/products/' + id, payload),
  onArchive: (product) => ...,    // ACTIVE <-> ARCHIVED
  onDelete: (id) => ...,
  onClose: () => ...,
});
book.update({ products: yangiRoyxat });   // har amaldan keyin ro'yxatni yangilash
book.unmount();
```
`openMyProducts()` kitobni oladi; kutubxona yuklanmasa (oflayn) eski o'ng panel (`openMyProductsPanel`) zaxira sifatida ochiladi.

## Rejimlar
- ≥ 760 px: ikki sahifa (chapda doimo mundarija, o'ngda e'lon).
- < 760 px (mobil): bitta sahifa; birinchi sahifa — mundarija, pastda «Mundarija / Oldingi / Keyingi». Sahifa ichi vertikal aylanadi.
- Onboarding ishorasi: `localStorage['agrargo_book_onboarded_v1']`.
- Klaviatura: ← → varaqlash, Esc — forma/kitobni yopish.
