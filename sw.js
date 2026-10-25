/* AgrarGo Service Worker
 * - App shell (index.html, manifest, ikonkalar, i18n, vendor) oldindan keshlanadi: oflayn ochiladi.
 * - Sahifa (navigate): tarmoq birinchi, tarmoq bo'lmasa kesh, u ham bo'lmasa offline.html.
 * - Statik fayllar va CDN (Tailwind, FontAwesome, AOS, Leaflet, shriftlar): stale-while-revalidate.
 * - API (boshqa origin: backend), POST/PUT/PATCH/DELETE, Authorization'li so'rovlar HECH QACHON keshlanmaydi
 *   (shaxsiy ma'lumotlar, to'lov va GPS har doim yangi bo'lishi shart).
 * Versiyani o'zgartirsangiz eski keshlar o'chiriladi.
 */
const VERSION = 'v35';
const SHELL = `agrargo-shell-${VERSION}`;
const RUNTIME = `agrargo-runtime-${VERSION}`;
const RUNTIME_MAX = 80;

const SHELL_FILES = [
  './', './index.html', './offline.html', './manifest.json', './images/newlogo.png', './js/tailwind-config.js', './js/app.js', './js/local.js', './js/local-dock.js', './js/cashback.js', './js/hub-ops.js', './js/finance.js', './js/ebol.js', './js/safety.js', './js/new-alphabet.js', './css/light.css', './css/perf-layout.css', './js/perf.js',
  './images/icons/icon-192.png', './images/icons/icon-512.png', './images/icons/favicon-32.png',
  './i18n/uz.js', './i18n/ru.js', './i18n/en.js', './i18n/engine.js',
  './vendor/JsBarcode.code128.min.js', './vendor/qrcode.js', './vendor/chart.umd.js', './404.html', './vendor/label-print.css',
];

const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // Bitta fayl topilmasa ham o'rnatish to'xtamasin
      Promise.all(SHELL_FILES.map((f) => cache.add(new Request(f, { cache: 'reload' })).catch(() => undefined))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('agrargo-') && k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Background Sync: aloqa tiklanganda ochiq oynalarga oflayn navbatni yuborishni buyuradi
// (so'rovlar tokenli bo'lgani uchun navbatni sahifaning o'zi yuboradi; token SW'ga berilmaydi).
self.addEventListener('sync', (event) => {
  if (event.tag !== 'agrargo-flush') return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => list.forEach((c) => c.postMessage({ type: 'flush-queue' }))));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = (await caches.match(request)) || (await cache.match(request));
  const network = fetch(request).then((res) => {
    // Faqat muvaffaqiyatli (yoki CDN'ning opaque) javoblar keshlanadi
    if (res && (res.ok || res.type === 'opaque')) { cache.put(request, res.clone()).then(() => trim(RUNTIME, RUNTIME_MAX)); }
    return res;
  }).catch(() => undefined);
  return cached || (await network) || Response.error();
}

async function networkFirstAsset(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(request)) || Response.error();
  }
}

async function networkFirstPage(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) { const c = await caches.open(SHELL); c.put('./index.html', res.clone()); }
    // Mavjud bo'lmagan sahifa: serverning quruq 404'i o'rniga AgrarGo'ning 404 sahifasi (status 404 saqlanadi)
    if (res && res.status === 404) {
      const nf = await caches.match('./404.html');
      if (nf) return new Response(nf.body, { status: 404, statusText: 'Not Found', headers: nf.headers });
    }
    return res;
  } catch (e) {
    return (await caches.match('./index.html')) || (await caches.match('./')) || (await caches.match('./offline.html')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('authorization')) return; // shaxsiy so'rovlar: brauzerga qoldiriladi
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    if (url.origin !== self.location.origin) return;
    event.respondWith(networkFirstPage(req));
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  // 3D kitob bundle'i: har doim yangisi (tarmoq birinchi), oflayn bo'lsa keshdagisi — eski nusxa qotib qolmasin
  if (sameOrigin && url.pathname.endsWith('/js/book/agrar-book.js')) { event.respondWith(networkFirstAsset(req)); return; }
  if (sameOrigin && !/\.(js|css|png|jpe?g|webp|svg|ico|json|woff2?)$/i.test(url.pathname)) return; // faqat statik fayllar
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return; // backend API, xarita plitkalari va boshqalar keshlanmaydi
  event.respondWith(staleWhileRevalidate(req));
});
