// Toza yordamchi funksiyalar (React'siz): testlanadi va komponentlarda qayta ishlatiladi.

export const STORAGE_KEY = 'agrargo_book_onboarded_v1';

export const STATUS = {
  ACTIVE: { label: 'FAOL', tone: 'green' },
  ARCHIVED: { label: 'ARXIVDA', tone: 'grey' },
  BOOKED: { label: 'BRON QILINGAN', tone: 'amber' },
  SOLD: { label: 'SOTILGAN', tone: 'blue' },
};

export const CATEGORIES = ['Sabzavot', 'Meva', 'Poliz', 'Don', 'Boshqa'];

export const fmt = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

export function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** Kitob sahifalari: har bir e'lon — alohida sahifa, oxirida «yangi e'lon» sahifasi */
export function buildPages(products) {
  return [...products.map((product) => ({ type: 'listing', id: product.id, product })), { type: 'add', id: 'add' }];
}

/**
 * Bir necha sahifa oshib o'tishda ketma-ket ko'rsatiladigan varaqlar: eng ko'pi bilan `maxSteps` ta,
 * oxirgisi doim `to`. Masalan 1 → 9 (max 4): [3, 5, 7, 9].
 */
export function planPath(from, to, maxSteps = 4) {
  if (from === to) return [];
  const delta = to - from;
  const steps = Math.min(Math.abs(delta), maxSteps);
  const path = [];
  for (let k = 1; k <= steps; k++) path.push(Math.round(from + (delta * k) / steps));
  return path;
}

/** Ekran o'lchamidan kitob rejimi va sahifa o'lchami: keng ekranda ikki sahifa, tor ekranda bitta */
export function bookSize(vw, vh) {
  const ratio = 0.72; // eni / bo'yi
  const spread = vw >= 760;
  const availH = Math.max(280, vh - (spread ? 150 : 190));
  const pw = spread
    ? Math.max(260, Math.min(470, (vw - 56) / 2, availH * ratio))
    : Math.max(250, Math.min(440, vw - 28, availH * ratio));
  return { mode: spread ? 'spread' : 'single', pw: Math.round(pw), ph: Math.round(pw / ratio) };
}

/** Forma tekshiruvi (serverdagi qoidalar bilan bir xil). Xatolar ro'yxatini qaytaradi. */
export function validateListing(v) {
  const errors = [];
  if ((v.name || '').trim().length < 2) errors.push('Mahsulot nomini kiriting.');
  if (!v.category) errors.push('Kategoriyani tanlang.');
  if (!(Number(v.quantityKg) > 0)) errors.push("Vaznni kiriting (0 dan katta bo'lsin).");
  if (!(Number(v.pricePerKg) > 0)) errors.push("Narxni kiriting (0 dan katta bo'lsin).");
  return errors;
}

export function toPayload(v, editing) {
  const payload = { name: v.name.trim(), category: v.category, quantityKg: Number(v.quantityKg), pricePerKg: Number(v.pricePerKg) };
  if (v.harvestDate) payload.harvestDate = v.harvestDate;
  else if (editing) payload.harvestDate = null; // tahrirda sana tozalansa server ham o'chiradi
  return payload;
}

export function readOnboarded(storage) {
  try { return storage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}
export function writeOnboarded(storage) {
  try { storage.setItem(STORAGE_KEY, '1'); } catch { /* maxfiy rejim: har safar ko'rsatiladi */ }
}
