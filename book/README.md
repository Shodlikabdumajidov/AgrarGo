# AgrarGo «Mening e'lonlarim» — raqamli kitob

React 18 bilan yozilgan interaktiv kitob: asosiy variant — **WebGL 3D kitob (React Three Fiber + Three.js)**, WebGL bo'lmasa yoki xato bo'lsa — CSS-3D kitob (Framer Motion). Asosiy ilova (vanilla JS) uni kerak bo'lganda (lazy) yuklaydi.

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
  src/three/         WebGL (R3F) kitobi
    Book3D.jsx       holat, teksturalar keshi, navigatsiya, DOM tugmalar paneli, forma
    Scene.jsx        <Leaf> (bukiladigan varaq), <Binding> (qopqoq, umurtqa), <Rig> (kamera), <Controller> (sichqoncha/sensor)
    paint.js         sahifalarni 2D canvas'ga chizish (qorong'i mavzu + #00E676) va bosiladigan joylar
    model.js         toza mantiq: sahifalar ketma-ketligi, varaq bukilish profili, sudrash qoidalari
  test/              lib.test.mjs, model3d.test.mjs (node:test)
../js/book/agrar-book.js   yig'ilgan bundle (IIFE, ~1.1 MB, kerak bo'lganda yuklanadi) — repoda saqlanadi
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


## 3D kitob qanday ishlaydi
- **Varaq** — `SEG=26` bo'lakli tasma; har kadrda profil `φ(s)=θ−lag·sinθ·(s/w)^1.25`, nuqta = ∫(cosφ, sinφ) (`model.js: bendProfile`). Varaq uzunligi o'zgarmaydi (cho'zilmaydi), tekis holatda z=0. `lag` varaq tezligiga bog'liq: tez burilganda chekka orqada qoladi.
- **Fizika** — har varaq burchagi uchun prujina (`stiffness 62, damping 12.5`); ko'p sahifaga sakraganda varaqlar ketma-ket, biroz kechikib buriladi.
- **Sudrash** — nur (raycaster) z=0 tekislikni kesadi; `θ = acos(x/W)`, shuning uchun varaq chekkasi kursorga ergashadi. Qo'yib yuborganda burchak va tezlikka qarab oxirigacha ag'dariladi yoki qaytadi. Sahifa chekkasini bosish ham varaqlaydi.
- **Sahifalar** — canvas teksturalari (`paint.js`); tarkib o'zgarmasa keshdan olinadi. Mundarijadagi qatorlar va «＋» uchun bosiladigan joylar UV orqali aniqlanadi.
- **Amallar** (tahrirlash/arxiv/o'chirish) — kitob ostidagi DOM paneli: klaviatura va ekran o'quvchi bilan ishlaydi. Tillar (UZ/RU/EN) canvas matnlarida ham `window.T` orqali; til almashsa teksturalar qayta chiziladi.
- **Tor ekran** (telefon) — bitta sahifa kamera bilan markazlanadi, «Keyingi» avval o'ng sahifaga, keyin varaq ag'darishga o'tadi.
- Renderlash `frameloop="demand"`: harakat bo'lmaganda GPU ishlamaydi.
- `mount(el, { renderer: 'css' })` — CSS-3D kitobni majburan tanlash.
