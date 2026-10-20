// Sahifalarni 2D canvas'ga chizadi (keyin WebGL teksturasi bo'ladi). Qorong'i mavzu + zumrad (#00E676).
import { fmt, fmtDate, STATUS } from '../lib.js';
import { folioOf } from './model.js';

export const TW = 800;
export const TH = 1111; // eni/bo'yi = 0.72 (kitob sahifasi nisbati)

const INK = '#e6f4ec', MUTED = '#8fb3a1', EMERALD = '#00E676', LINE = 'rgba(0,230,118,.22)';
const SERIF = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';
const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
const TONES = { green: '#00E676', grey: '#9aa7a0', amber: '#ffb74d', blue: '#64b5f6' };
const DOTS = { ACTIVE: '#00E676', ARCHIVED: '#9aa7a0', BOOKED: '#ffb74d', SOLD: '#64b5f6' };

function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function grain(ctx, seed, alpha) {
  const rnd = seeded(seed);
  ctx.save();
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.6})`;
    ctx.fillRect(rnd() * TW, rnd() * TH, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
  }
  ctx.restore();
}

/** Qog'oz foni: to'q yashil-grafit, nozik don, kitob o'rtasiga (tikuv) qarab qorayish */
function paper(ctx, side, seed) {
  const g = ctx.createRadialGradient(TW * 0.5, TH * 0.42, 60, TW * 0.5, TH * 0.5, TH * 0.85);
  g.addColorStop(0, '#13231d'); g.addColorStop(0.7, '#0f1c17'); g.addColorStop(1, '#0a1511');
  ctx.fillStyle = g; ctx.fillRect(0, 0, TW, TH);
  grain(ctx, seed, 0.035);
  // yuqori chap yorug' dog' (lampa nuri)
  const l = ctx.createRadialGradient(TW * 0.3, TH * 0.15, 10, TW * 0.3, TH * 0.15, TW * 0.9);
  l.addColorStop(0, 'rgba(0,230,118,.07)'); l.addColorStop(1, 'rgba(0,230,118,0)');
  ctx.fillStyle = l; ctx.fillRect(0, 0, TW, TH);
  // tikuv (gutter) soyasi
  const w = TW * 0.2;
  const x0 = side === 'right' ? 0 : TW, x1 = side === 'right' ? w : TW - w;
  const gg = ctx.createLinearGradient(x0, 0, x1, 0);
  gg.addColorStop(0, 'rgba(0,0,0,.62)'); gg.addColorStop(0.45, 'rgba(0,0,0,.2)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg; ctx.fillRect(Math.min(x0, x1), 0, w, TH);
  // tashqi chekka (qog'oz qirrasi) yorug'ligi
  ctx.strokeStyle = 'rgba(0,230,118,.10)'; ctx.lineWidth = 3;
  ctx.strokeRect(side === 'right' ? 1.5 : 1.5, 1.5, TW - 3, TH - 3);
}

function pad(side) { return side === 'right' ? { l: 112, r: 70 } : { l: 70, r: 112 }; }

function wrapText(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const out = lines.slice(0, maxLines); let last = out[maxLines - 1]; while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1); out[maxLines - 1] = last + '…'; return out; }
  return lines;
}

function fitText(ctx, text, maxW, size, weight, family) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; if (ctx.measureText(text).width <= maxW) break; s -= 2; } while (s > 22);
  return s;
}

function ornament(ctx, y, x0, x1) {
  const cx = (x0 + x1) / 2;
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, 'rgba(0,230,118,0)'); g.addColorStop(0.5, 'rgba(0,230,118,.55)'); g.addColorStop(1, 'rgba(0,230,118,0)');
  ctx.fillStyle = g; ctx.fillRect(x0, y - 1, x1 - x0, 2);
  ctx.fillStyle = '#0f1c17'; ctx.fillRect(cx - 26, y - 14, 52, 28);
  ctx.fillStyle = EMERALD; ctx.font = `26px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('❦', cx, y + 1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function folio(ctx, faceIndex, side) {
  const n = folioOf(faceIndex);
  if (n == null) return;
  ctx.fillStyle = MUTED; ctx.font = `600 24px ${SANS}`; ctx.textAlign = 'center';
  ctx.fillText(`—  ${n}  —`, side === 'right' ? TW / 2 + 20 : TW / 2 - 20, TH - 54);
  ctx.textAlign = 'left';
}

function kicker(ctx, text, x, y) {
  ctx.fillStyle = EMERALD; ctx.font = `800 22px ${SANS}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
  ctx.fillText(String(text).toUpperCase(), x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function wheat(ctx, cx, cy, s, color) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, -12); ctx.stroke();
  for (const y of [-6, 6, 18]) for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(d * 12, y - 2, d * 11, y - 14); ctx.quadraticCurveTo(d * 2, y - 10, 0, y); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(0, -18, 3.5, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---------------- sahifa turlari ----------------

function drawCover(ctx, { t }) {
  const g = ctx.createLinearGradient(0, 0, TW, TH);
  g.addColorStop(0, '#0e5a3a'); g.addColorStop(0.5, '#073b27'); g.addColorStop(1, '#04281b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, TW, TH);
  grain(ctx, 7, 0.07);
  const hl = ctx.createRadialGradient(TW * 0.3, TH * 0.18, 10, TW * 0.3, TH * 0.18, TW * 0.9);
  hl.addColorStop(0, 'rgba(255,255,255,.16)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl; ctx.fillRect(0, 0, TW, TH);
  const sp = ctx.createLinearGradient(0, 0, 150, 0);
  sp.addColorStop(0, 'rgba(0,0,0,.6)'); sp.addColorStop(0.55, 'rgba(0,0,0,.14)'); sp.addColorStop(0.7, 'rgba(255,255,255,.06)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sp; ctx.fillRect(0, 0, 150, TH);
  // tikuvli ramka
  ctx.setLineDash([16, 12]); ctx.strokeStyle = 'rgba(0,230,118,.55)'; ctx.lineWidth = 4; roundRect(ctx, 76, 62, TW - 126, TH - 124, 22); ctx.stroke(); ctx.setLineDash([]);
  // oltin bosma
  const gold = ctx.createLinearGradient(0, 330, 0, 640); gold.addColorStop(0, '#fff7c2'); gold.addColorStop(0.5, '#f3c75a'); gold.addColorStop(1, '#b9871f');
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowOffsetY = 3; ctx.shadowBlur = 3;
  wheat(ctx, 460, 290, 3.6, '#f3c75a');
  ctx.fillStyle = gold; ctx.textAlign = 'center'; ctx.font = `700 92px ${SERIF}`;
  const title = t("Mening E'lonlarim"); const lines = wrapText(ctx, title, TW - 320, 2);
  lines.forEach((ln, i) => ctx.fillText(ln, 460, 520 + i * 104));
  ctx.shadowColor = 'transparent';
  const ly = 520 + lines.length * 104 - 40;
  const lg = ctx.createLinearGradient(260, 0, 660, 0); lg.addColorStop(0, 'rgba(232,194,90,0)'); lg.addColorStop(0.5, '#e8c25a'); lg.addColorStop(1, 'rgba(232,194,90,0)');
  ctx.fillStyle = lg; ctx.fillRect(260, ly, 400, 4);
  ctx.fillStyle = EMERALD; ctx.font = `800 44px ${SERIF}`; if ('letterSpacing' in ctx) ctx.letterSpacing = '16px';
  ctx.shadowColor = 'rgba(0,230,118,.55)'; ctx.shadowBlur = 24; ctx.fillText('AGRARGO', 470, ly + 100); ctx.shadowColor = 'transparent';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillStyle = 'rgba(230,244,236,.55)'; ctx.font = `600 24px ${SANS}`; ctx.fillText(t('Ochish uchun bosing yoki suring'), 460, TH - 118);
  ctx.textAlign = 'left';
  return [];
}

function drawEndpaper(ctx, { side }) {
  const g = ctx.createLinearGradient(0, 0, TW, TH);
  g.addColorStop(0, '#0b3d2a'); g.addColorStop(1, '#062a1d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, TW, TH);
  grain(ctx, 11, 0.04);
  // romb naqsh
  ctx.strokeStyle = 'rgba(0,230,118,.10)'; ctx.lineWidth = 2;
  for (let y = -40; y < TH + 80; y += 90) for (let x = -40; x < TW + 80; x += 90) {
    const o = ((y / 90) & 1) * 45; ctx.beginPath(); ctx.moveTo(x + o, y - 30); ctx.lineTo(x + o + 30, y); ctx.lineTo(x + o, y + 30); ctx.lineTo(x + o - 30, y); ctx.closePath(); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,230,118,.3)'; ctx.lineWidth = 3; roundRect(ctx, 60, 60, TW - 120, TH - 120, 18); ctx.stroke();
  wheat(ctx, TW / 2, TH / 2, 3, 'rgba(0,230,118,.45)');
  const w = TW * 0.2, gg = ctx.createLinearGradient(side === 'right' ? 0 : TW, 0, side === 'right' ? w : TW - w, 0);
  gg.addColorStop(0, 'rgba(0,0,0,.6)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg; ctx.fillRect(side === 'right' ? 0 : TW - w, 0, w, TH);
  return [];
}

function drawBlank(ctx, { side, index }) {
  paper(ctx, side, 100 + index);
  ctx.globalAlpha = 0.5; ornament(ctx, TH / 2, 200, TW - 200); ctx.globalAlpha = 1;
  return [];
}

function drawToc(ctx, { face, side, index, t }) {
  paper(ctx, side, 200 + index);
  const { l, r } = pad(side);
  kicker(ctx, 'AgrarGo', l, 128);
  ctx.fillStyle = INK; ctx.font = `700 78px ${SERIF}`;
  ctx.fillText(face.part ? t('Mundarija (davomi)') : t('Mundarija'), l, 220);
  ornament(ctx, 262, l, TW - r);
  const hits = [];
  if (!face.items.length) {
    ctx.fillStyle = MUTED; ctx.font = `italic 32px ${SERIF}`;
    wrapText(ctx, t("Hali e'lon qo'shmagansiz. Pastdagi «Yangi e'lon» sahifasidan birinchi mahsulotingizni joylang."), TW - l - r, 6).forEach((ln, i) => ctx.fillText(ln, l, 340 + i * 46));
  }
  const rowH = 86; let y = 310;
  face.items.forEach((it) => {
    const mid = y + rowH / 2;
    ctx.fillStyle = DOTS[it.status] || DOTS.ACTIVE; ctx.beginPath(); ctx.arc(l + 12, mid, 8, 0, Math.PI * 2); ctx.fill();
    const num = String(folioOf(it.face));
    ctx.font = `600 32px ${SANS}`; const nw = ctx.measureText(num).width;
    const label = `${it.name} ${fmt(it.quantityKg)} kg`;
    const maxLabel = TW - r - l - 40 - nw - 70;
    ctx.font = `600 34px ${SERIF}`;
    let shown = label; while (shown.length > 3 && ctx.measureText(shown).width > maxLabel) shown = shown.slice(0, -2);
    if (shown !== label) shown = shown.trimEnd() + '…';
    ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.fillText(shown, l + 40, mid);
    const lw = ctx.measureText(shown).width;
    ctx.fillStyle = 'rgba(0,230,118,.35)';
    for (let x = l + 40 + lw + 18; x < TW - r - nw - 18; x += 12) ctx.fillRect(x, mid + 12, 4, 4);
    ctx.fillStyle = EMERALD; ctx.font = `700 32px ${SANS}`; ctx.textAlign = 'right'; ctx.fillText(num, TW - r, mid); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = LINE; ctx.fillRect(l, y + rowH - 1, TW - l - r, 1);
    hits.push({ x: l - 10, y, w: TW - l - r + 20, h: rowH, go: it.face, label: it.name });
    y += rowH;
  });
  if (face.withAdd) {
    y += 14; const mid = y + 40;
    ctx.fillStyle = 'rgba(0,230,118,.10)'; roundRect(ctx, l - 10, y, TW - l - r + 20, 80, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(0,230,118,.55)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = EMERALD; ctx.font = `800 40px ${SANS}`; ctx.textBaseline = 'middle'; ctx.fillText('+', l + 14, mid + 1);
    ctx.font = `700 31px ${SANS}`; ctx.fillText(t("Yangi e'lon qo'shish"), l + 56, mid);
    ctx.textAlign = 'right'; ctx.fillText(String(folioOf(face.addFace)), TW - r - 10, mid); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    hits.push({ x: l - 10, y, w: TW - l - r + 20, h: 80, go: face.addFace, label: t("Yangi e'lon qo'shish") });
  }
  ctx.fillStyle = MUTED; ctx.font = `italic 26px ${SERIF}`; ctx.fillText(`${t("Jami e'lonlar:")} ${face.total}`.trim(), l, TH - 110);
  folio(ctx, index, side);
  return hits;
}

function drawListing(ctx, { face, side, index, t }) {
  const p = face.product;
  paper(ctx, side, 300 + index);
  const { l, r } = pad(side); const cw = TW - l - r;
  // katta yarim shaffof bosh harf (suv belgisi)
  ctx.fillStyle = 'rgba(0,230,118,.045)'; ctx.font = `700 760px ${SERIF}`; ctx.textAlign = 'center';
  ctx.fillText(String(p.name).charAt(0).toUpperCase(), TW / 2 + (side === 'right' ? 40 : -40), 820); ctx.textAlign = 'left';
  kicker(ctx, `${t("E'lon №")} ${face.number}`, l, 128);
  const size = fitText(ctx, p.name, cw, 84, 700, SERIF);
  ctx.fillStyle = INK; ctx.font = `700 ${size}px ${SERIF}`;
  const nameLines = wrapText(ctx, p.name, cw, 2); nameLines.forEach((ln, i) => ctx.fillText(ln, l, 218 + i * (size + 6)));
  let y = 218 + (nameLines.length - 1) * (size + 6);
  ctx.fillStyle = MUTED; ctx.font = `italic 34px ${SERIF}`; ctx.fillText(p.category, l, y + 54);
  y += 100; ornament(ctx, y, l, TW - r); y += 40;
  const rows = [
    [t('Vazni'), `${fmt(p.quantityKg)} kg`],
    [t('Narxi'), `${fmt(p.pricePerKg)} ${t("so'm")} / kg`],
  ];
  const hv = fmtDate(p.harvestDate), cr = fmtDate(p.createdAt);
  if (hv) rows.push([t("O'rim-yig'im"), hv]);
  if (cr) rows.push([t('Joylangan'), cr]);
  rows.forEach(([k, v]) => {
    ctx.fillStyle = MUTED; ctx.font = `600 22px ${SANS}`; if ('letterSpacing' in ctx) ctx.letterSpacing = '3px'; ctx.fillText(String(k).toUpperCase(), l, y + 44); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = INK; ctx.font = `700 36px ${SANS}`; ctx.textAlign = 'right'; ctx.fillText(v, TW - r, y + 44); ctx.textAlign = 'left';
    ctx.fillStyle = LINE; ctx.fillRect(l, y + 64, cw, 1); y += 82;
  });
  // jami qiymat kartasi
  y += 18;
  const cg = ctx.createLinearGradient(l, y, TW - r, y + 150); cg.addColorStop(0, 'rgba(0,230,118,.20)'); cg.addColorStop(1, 'rgba(0,230,118,.06)');
  ctx.fillStyle = cg; roundRect(ctx, l - 8, y, cw + 16, 150, 22); ctx.fill();
  ctx.strokeStyle = 'rgba(0,230,118,.6)'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = MUTED; ctx.font = `600 22px ${SANS}`; if ('letterSpacing' in ctx) ctx.letterSpacing = '3px'; ctx.fillText(t('Jami qiymat').toUpperCase(), l + 16, y + 44); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const total = `${fmt(Number(p.quantityKg) * Number(p.pricePerKg))} ${t("so'm")}`;
  ctx.fillStyle = EMERALD; const ts = fitText(ctx, total, cw - 32, 60, 800, SANS); ctx.font = `800 ${ts}px ${SANS}`;
  ctx.shadowColor = 'rgba(0,230,118,.5)'; ctx.shadowBlur = 18; ctx.fillText(total, l + 16, y + 112); ctx.shadowColor = 'transparent';
  y += 150;
  // holat muhri
  const st = STATUS[p.status] || STATUS.ACTIVE; const col = TONES[st.tone] || TONES.green;
  ctx.save(); ctx.translate(l + 150, TH - 180); ctx.rotate(-0.1);
  ctx.font = `800 34px ${SANS}`; if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  const label = t(st.label); const sw = ctx.measureText(label).width + 54;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 6; ctx.globalAlpha = 0.9; roundRect(ctx, -sw / 2, -34, sw, 68, 12); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 3, 3); ctx.restore();
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  folio(ctx, index, side);
  return [];
}

function drawAdd(ctx, { side, index, t }) {
  paper(ctx, side, 400 + index);
  const cx = TW / 2 + (side === 'right' ? 30 : -30), cy = 450;
  ctx.textAlign = 'center';
  kicker(ctx, t('Yangi sahifa'), cx, 190);
  ctx.textAlign = 'center'; ctx.fillStyle = EMERALD; ctx.font = `800 22px ${SANS}`;
  for (const [rad, a] of [[190, 0.1], [160, 0.2]]) { ctx.strokeStyle = `rgba(0,230,118,${a})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke(); }
  const g = ctx.createRadialGradient(cx - 40, cy - 46, 10, cx, cy, 130); g.addColorStop(0, '#5dffa9'); g.addColorStop(0.45, '#00E676'); g.addColorStop(1, '#00a152');
  ctx.shadowColor = 'rgba(0,230,118,.6)'; ctx.shadowBlur = 40; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 130, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 17; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - 52, cy); ctx.lineTo(cx + 52, cy); ctx.moveTo(cx, cy - 52); ctx.lineTo(cx, cy + 52); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = `700 46px ${SERIF}`; ctx.fillText(t("Yangi e'lon qo'shish"), cx, 740);
  ctx.fillStyle = MUTED; ctx.font = `italic 28px ${SERIF}`;
  wrapText(ctx, t("Mahsulotingizni joylang: do'konlar uni darhol ko'rib, bron qila boshlaydi."), 470, 4).forEach((ln, i) => ctx.fillText(ln, cx, 800 + i * 40));
  ctx.textAlign = 'left';
  folio(ctx, index, side);
  return [{ x: cx - 200, y: cy - 200, w: 400, h: 400, act: 'add', label: t("Yangi e'lon qo'shish") }];
}

const DRAW = { cover: drawCover, endpaper: drawEndpaper, blank: drawBlank, toc: drawToc, listing: drawListing, add: drawAdd };

/** Bitta yuzni chizib, canvas va bosiladigan joylar ro'yxatini qaytaradi */
export function paintFace(canvas, face, index, t) {
  canvas.width = TW; canvas.height = TH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, TW, TH);
  const side = index % 2 === 0 ? 'right' : 'left';
  return (DRAW[face.kind] || drawBlank)(ctx, { face, side, index, t }) || [];
}

/** Keshlash uchun yuzning «imzosi»: tarkib o'zgarmasa qayta chizilmaydi */
export function faceSignature(face, index, lang) {
  if (face.kind === 'listing') { const p = face.product; return ['L', index, lang, face.number, p.name, p.category, p.quantityKg, p.pricePerKg, p.status, p.harvestDate, p.createdAt].join('|'); }
  if (face.kind === 'toc') return ['T', index, lang, face.part, face.withAdd, face.addFace, face.total, face.items.map((i) => [i.id, i.name, i.quantityKg, i.status, i.face].join(':')).join(',')].join('|');
  return [face.kind, index, lang].join('|');
}
