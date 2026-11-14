// 3D kitobning toza (React va WebGL'siz) modeli: sahifalar ketma-ketligi va varaq hisob-kitoblari. Testlanadi.

export const TOC_PER_PAGE = 9;

/**
 * Kitobning barcha «yuzlari» (sahifalari) ketma-ketligi. Juft indeks — varaqning old tomoni (o'ng sahifa),
 * toq indeks — orqa tomoni (chap sahifa). Varaq j: old yuz 2j, orqa yuz 2j+1.
 *   0 muqova · 1 old forzats · 2.. mundarija · e'lonlar · «yangi e'lon» · (juftlash uchun bo'sh sahifa)
 */
export function buildFaces(products) {
  const faces = [{ kind: 'cover' }, { kind: 'endpaper' }];
  const chunks = [];
  for (let i = 0; i < products.length; i += TOC_PER_PAGE) chunks.push(products.slice(i, i + TOC_PER_PAGE));
  if (!chunks.length) chunks.push([]);
  const tocCount = chunks.length;
  const firstListing = 2 + tocCount;
  chunks.forEach((items, ci) => faces.push({
    kind: 'toc', part: ci, parts: tocCount,
    items: items.map((p, k) => ({ id: p.id, name: p.name, quantityKg: p.quantityKg, status: p.status, face: firstListing + ci * TOC_PER_PAGE + k })),
    withAdd: ci === tocCount - 1,
    addFace: firstListing + products.length, total: products.length,
  }));
  products.forEach((product, k) => faces.push({ kind: 'listing', product, number: k + 1 }));
  faces.push({ kind: 'add' });
  if (faces.length % 2) faces.push({ kind: 'blank' });
  return faces;
}

/** Sahifa raqami (bosma): mundarija — 1-bet */
export const folioOf = (faceIndex) => (faceIndex >= 2 ? faceIndex - 1 : null);

/** Yuz ko'rinishi uchun nechta varaq ag'darilgan bo'lishi kerak */
export function turnsForFace(face) {
  if (face <= 0) return 0;
  return face % 2 ? (face + 1) / 2 : face / 2;
}

/** t ta varaq ag'darilgan holatdagi ko'rinadigan yuzlar */
export function spreadFaces(t, leafCount) {
  return { left: t > 0 ? 2 * t - 1 : null, right: t < leafCount ? 2 * t : null };
}

/** Varaq ustida bosilgan joy (kitob koordinatalarida) bo'yicha burchak: 0 — o'ngda yotibdi, PI — chapda */
export function angleFromX(x, w) {
  return Math.acos(Math.max(-1, Math.min(1, x / w)));
}

/** Sudrash tugaganda: varaq oxirigacha ag'dariladimi? (burchak, yo'nalish: +1 oldinga, -1 orqaga, tezlik rad/s) */
export function shouldComplete(angle, dir, velocity) {
  if (Math.abs(velocity) > 2.2 && Math.sign(velocity) === dir) return true;
  if (Math.abs(velocity) > 2.2 && Math.sign(velocity) === -dir) return false;
  return dir === 1 ? angle > Math.PI * 0.4 : angle < Math.PI * 0.6;
}

/**
 * Varaqning bukilgan shakli: x–z tekisligida chiziq. s bo'ylab burchak φ(s) = θ − lag·sinθ·(s/w)^1.25,
 * nuqta = ∫(cosφ, sinφ). θ=0 yoki π da varaq tekis yotadi. Qaytaradi: [{x, z}, ...] (seg+1 ta nuqta).
 */
export function bendProfile(theta, lag, w, seg) {
  const pts = [{ x: 0, z: 0 }];
  const ds = w / seg;
  const sinT = Math.sin(theta);
  let x = 0, z = 0;
  for (let i = 0; i < seg; i++) {
    const u = (i + 0.5) / seg;
    const phi = theta - lag * sinT * Math.pow(u, 1.25);
    x += Math.cos(phi) * ds;
    z += Math.sin(phi) * ds;
    pts.push({ x, z });
  }
  return pts;
}

/** Hozirgi holatga ko'ra kitobni gorizontal markazlash siljishi (muqova yopiq / oxirgi sahifa) */
export function bookShift(firstAngle, lastAngle, w) {
  return (-w / 2) * (1 - firstAngle / Math.PI) + (w / 2) * (lastAngle / Math.PI);
}
