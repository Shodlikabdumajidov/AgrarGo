// i18n/src/*.txt  ->  i18n/ru.js, i18n/en.js, i18n/uz.js
// Ishlatish:  node i18n/build.js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'src');
const SEP = '‖';
const ru = {}, en = {}, uz = [];
const problems = [];
const holders = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt')).sort()) {
  fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const parts = line.split(SEP);
    if (parts.length !== 3) return problems.push(`${f}:${i + 1}: 3 ta qism kerak (${parts.length}) — ${line.slice(0, 60)}`);
    const [k, r, e] = parts.map((x) => x.trim());
    if (!k || !r || !e) return problems.push(`${f}:${i + 1}: bo'sh qism — ${k.slice(0, 50)}`);
    if (holders(k) !== holders(r) || holders(k) !== holders(e)) problems.push(`${f}:${i + 1}: {n} o'rinlari mos emas — ${k.slice(0, 50)}`);
    if (k in ru && (ru[k] !== r || en[k] !== e)) problems.push(`${f}:${i + 1}: takroriy kalit, har xil tarjima — ${k.slice(0, 50)}`);
    if (!(k in ru)) uz.push(k);
    ru[k] = r; en[k] = e;
  });
}
const out = (name, obj) => fs.writeFileSync(path.join(__dirname, name + '.js'),
  `// Avtomatik yaratilgan (node i18n/build.js). Qo'lda tahrirlamang: i18n/src/*.txt ni o'zgartiring.\nwindow.I18N_DICTS = window.I18N_DICTS || {};\nwindow.I18N_DICTS.${name} = ${JSON.stringify(obj)};\n`);
out('ru', ru); out('en', en);
fs.writeFileSync(path.join(__dirname, 'uz.js'),
  `// Manba til (o'zbekcha): barcha tarjima kalitlari. Avtomatik yaratilgan.\nwindow.I18N_KEYS = ${JSON.stringify(uz)};\n`);
console.log(`kalitlar: ${uz.length}`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
