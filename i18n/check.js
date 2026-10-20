// Tarjima qamrovini tekshiradi:  node i18n/check.js
//  - index.html va js/app.js dagi matnlar (HTML va JS satrlari) i18n/src/*.txt da bormi
//  - ru/en lug'atlari bir xil kalitlarga egami
// Eslatma: o'zgaruvchan matnlar ({0}) andoza sifatida kalitda; faqat foydalanuvchiga ko'rinadigan matnlar hisobga olinadi.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const acorn = require(fs.existsSync(path.join(root, 'backend/node_modules/acorn')) ? path.join(root, 'backend/node_modules/acorn') : 'acorn');
const dict = {};
new Function('window', fs.readFileSync(path.join(__dirname, 'ru.js'), 'utf8') + fs.readFileSync(path.join(__dirname, 'en.js'), 'utf8')).call(null, (global.window = dict));
const ru = dict.I18N_DICTS.ru, en = dict.I18N_DICTS.en;
const keys = new Set(Object.keys(ru).map((k) => k.trim()));
const patterns = Object.keys(ru).filter((k) => /\{\d+\}/.test(k)).map((k) => new RegExp('^' + k.trim().replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{\d+\\?\}/g, '(.+?)') + '$'));
const keyList = [...keys];
// Yig'ma matn bo'laklari (masalan, "Oxirgi signal: " + x) to'liq andoza ichida bo'lsa, qamrab olingan hisoblanadi
const covered = (s) => keys.has(s.trim()) || patterns.some((re) => re.test(s.trim())) || (s.trim().length > 3 && keyList.some((k) => k.includes(s.trim())));

// JS endi js/app.js da; HTML'dan skript va uslublar olib tashlanadi
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const head = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
const found = new Set();
for (const m of head.matchAll(/>([^<>]+)</g)) found.add(m[1].replace(/&copy;/g, '©').replace(/\s+/g, ' ').trim());
for (const m of head.matchAll(/\b(?:placeholder|title|aria-label|alt)="([^"]*)"/g)) found.add(m[1].trim());
const asts = ['app.js', 'local.js', 'local-dock.js', 'cashback.js'].map((f) => acorn.parse(fs.readFileSync(path.join(root, 'js', f), 'utf8'), { ecmaVersion: 2022 }));
const strOf = (n) => (n.type === 'Literal' && typeof n.value === 'string' ? n.value : null);
const flat = (n, a) => (n.type === 'BinaryExpression' && n.operator === '+' ? (flat(n.left, a), flat(n.right, a)) : a.push(n));
const seen = new Set();
function walk(n) {
  if (!n || typeof n.type !== 'string') return;
  if (n.type === 'Literal' && typeof n.value === 'string') found.add(n.value);
  if (n.type === 'BinaryExpression' && n.operator === '+' && !seen.has(n)) {
    const parts = []; flat(n, parts);
    (function mark(x) { if (x.type === 'BinaryExpression' && x.operator === '+') { seen.add(x); mark(x.left); mark(x.right); } })(n);
    if (parts.some((p) => strOf(p) && /\p{L}{2,}/u.test(strOf(p))) && parts.some((p) => strOf(p) === null)) {
      let i = 0; found.add(parts.map((p) => (strOf(p) !== null ? strOf(p) : '{' + i++ + '}')).join(''));
    }
  }
  for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
}
asts.forEach((a) => walk(a));

const uzbek = /['ʻ‘’]|\b(?:va|uchun|bilan|yo'q|kerak|ma'lumot|bo'l|qil|ish|lar|dagi|dan|ga)\b|[a-z]{3,}(?:ish|lar|ni|ga|da|dan|ma|im|iz|ing)\b/i;
const missing = [];
for (const raw of found) {
  const s = raw.trim();
  if (!/\p{L}{2,}/u.test(s) || s.length > 400) continue;
  if (/^(https?:|\/|#|\.|data:|<|sha256-|calc\(|url\()/.test(s)) continue;
  const toks = s.split(/\s+/);
  if (toks.every((t) => /^[a-z0-9\/\[\]\-_.:%#!()@,>*&~+='"\\]+$/.test(t)) && toks.some((t) => /[-:\[\]\/]/.test(t))) continue;
  if (toks.length === 1 && /^[a-z][A-Za-z0-9_.\-]*$/.test(s)) continue;
  if (/^[A-Z][A-Z0-9_]*$/.test(s) || /^[A-Za-z0-9_.\-\/]+$/.test(s) && !/^[A-Z][a-z]/.test(s)) continue;
  if (/^(fa-|bg-|text-|border-|flex|grid|rounded|absolute|relative|hidden|w-|h-|px-|py-|mt-|mb-|min-|max-|shadow|space-|gap-|glass|auth-|mp-|shrink|inline|mx-|font-|dash-|trk-|dk-|hover:)/.test(s)) continue;
  if (!uzbek.test(s) && toks.length < 2) continue;
  if (/^(Bearer|\[API|noopener|&copy;|\{0\}(rounded|glass)|O'zbekcha$|English$)/.test(s)) continue;
  if (!covered(s)) missing.push(s);
}
let bad = 0;
for (const k of Object.keys(ru)) if (!(k in en)) { console.error('en yo\'q:', k); bad++; }
if (missing.length) { console.log(`Tarjimasi topilmagan matnlar (${missing.length}):`); missing.forEach((m) => console.log('  ' + m.replace(/\n/g, '\\n'))); }
console.log(`Kalitlar: ${keys.size}. Tarjimasiz: ${missing.length}.`);
process.exit(bad ? 1 : 0);
