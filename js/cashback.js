/* ===== Keshbek (loyalty): «Mening keshbeklarim» bo'limi va to'lovda keshbekdan foydalanish =====
 * Server: GET /cashback (balans, foizlar, tarix). Keshbek faqat platforma xizmat haqini qoplaydi (fermer/Hub/kuryer ulushlariga tegmaydi).
 * local-dock.js / local.js bilan birga yuklanadi; umumiy yordamchilar (el, authed, T, bdMoney ...) app.js'dan.
 */

const CB_TYPE = {
    EARNED: { icon: 'fa-circle-plus', cls: 'text-emerald-300', sign: '+', label: 'Keshbek yozildi' },
    SPENT: { icon: 'fa-circle-minus', cls: 'text-amber-300', sign: '−', label: 'Xizmat haqiga ishlatildi' },
    REFUNDED: { icon: 'fa-rotate-left', cls: 'text-sky-300', sign: '+', label: 'Qaytarildi' }
};
const CB_SOURCE = { LOCAL_ORDER: 'Chakana buyurtma', SHIPMENT: 'Yuk tashish', WAREHOUSE_ORDER: 'Ombor buyurtmasi', BOOKING: 'Bron' };

/** Joriy foydalanuvchining keshbek holati (xato bo'lsa null: to'lov oynasi keshbeksiz ishlayveradi) */
async function cbFetch(limit) {
    try { return await authed('GET', '/cashback' + (limit ? '?limit=' + limit : '')); } catch (e) { return null; }
}

/** Shu to'lovda ishlatish mumkin bo'lgan keshbek: balans va xizmat haqining ruxsat etilgan ulushi (server ham shunday hisoblaydi) */
function cbUsable(cb, serviceFee) {
    if (!cb || !(cb.balance > 0) || !(serviceFee > 0)) return 0;
    const cap = Math.floor(serviceFee * (cb.rates.maxSpendPercent / 100) * 100) / 100;
    return Math.max(0, Math.min(Math.floor(cb.balance * 100) / 100, cap));
}

/**
 * «Keshbek balansidan foydalanish (Sizda X so'm bor)» katakchasi.
 * Qaytaradi { node, checked() } yoki null (ishlatadigan keshbek bo'lmasa). onChange(checked, usable) — jami summani qayta hisoblash uchun.
 */
function cbCheckbox(cb, serviceFee, onChange) {
    const usable = cbUsable(cb, serviceFee);
    if (usable <= 0) return null;
    const lab = el('label', 'flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-slate-200 cursor-pointer');
    const box = el('input', 'mt-1 accent-emerald-500'); box.type = 'checkbox'; box.id = 'cb-use';
    const txt = el('span', 'min-w-0');
    txt.appendChild(el('b', 'block text-white', '🪙 ' + T("Keshbek balansidan foydalanish (Sizda {0} so'm bor)", formatNumber(cb.balance))));
    txt.appendChild(el('small', 'block text-xs text-slate-400', T("Platforma xizmat haqidan {0} so'm qoplanadi; fermer, Hub va kuryer ulushlari o'zgarmaydi.", formatNumber(usable))));
    lab.appendChild(box); lab.appendChild(txt);
    box.addEventListener('change', function () { onChange(box.checked, usable); });
    return { node: lab, checked: function () { return box.checked; }, usable: usable };
}

// ---------- Kabinet bo'limi ----------
async function renderCashbackTab(user, page) {
    const rid = ++dashRenderId;
    const pg = page || 1;
    const head = el('div', 'flex flex-wrap items-center justify-between gap-3');
    head.appendChild(sectionTitle('Mening keshbeklarim', T("Har bir yakunlangan buyurtmadan keshbek yig'iladi va platforma xizmat haqini qoplash uchun ishlatiladi")));
    head.appendChild(refreshButton(function () { renderCashbackTab(user); }));
    dashContent.replaceChildren(head, skeleton('list'));
    let d;
    try { d = await authed('GET', '/cashback?page=' + pg + '&limit=20'); }
    catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(head, dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), function () { renderCashbackTab(user); })); }
    if (rid !== dashRenderId) return;
    const nodes = [head];
    // Balans
    const bal = el('div', 'cb-balance');
    bal.appendChild(el('div', 'text-xs font-bold uppercase tracking-wider text-amber-200', '🪙 ' + T('Joriy balans')));
    bal.appendChild(el('div', 'cb-amount', bdMoney(d.balance)));
    const tot = el('div', 'flex flex-wrap gap-x-6 gap-y-1 text-xs text-amber-100/80');
    tot.appendChild(el('span', '', T('Jami yig\'ilgan: {0}', bdMoney(d.totals.earned))));
    tot.appendChild(el('span', '', T('Ishlatilgan: {0}', bdMoney(d.totals.spent - d.totals.refunded))));
    bal.appendChild(tot);
    nodes.push(bal);
    // Qoidalar
    const role = (user.role === 'FARMER') ? d.rates.farmer : (user.role === 'DRIVER') ? d.rates.driver : d.rates.buyer;
    const rule = el('div', 'rounded-2xl border border-white/10 bg-slate-950/40 p-4 space-y-1.5 text-sm text-slate-300');
    rule.appendChild(el('div', 'font-bold text-white', T('Qanday ishlaydi?')));
    rule.appendChild(el('p', '', '✅ ' + T("Buyurtma muvaffaqiyatli yakunlanganda sizga {0}% keshbek yoziladi ({1}).", role, user.role === 'FARMER' ? T('sotuv summasidan') : user.role === 'DRIVER' ? T("yo'l haqidan") : T('xarid summasidan'))));
    rule.appendChild(el('p', '', '🪙 ' + T("To'lovda keshbek platforma xizmat haqining {0}% igacha qoplaydi; fermer, Hub va kuryer ulushlari o'zgarmaydi.", d.rates.maxSpendPercent)));
    rule.appendChild(el('p', '', '↩️ ' + T("Buyurtma bekor qilinsa, ishlatilgan keshbek balansingizga qaytadi.")));
    nodes.push(rule);
    // Tarix
    nodes.push(el('h3', 'text-lg font-extrabold text-white mt-2', T('Tushum va xarajatlar tarixi')));
    if (!d.items.length) nodes.push(emptyState({ art: 'bookings', compact: true, title: "Hali keshbek yo'q", text: "Birinchi buyurtmangiz yakunlangach keshbek shu yerda paydo bo'ladi." }));
    const list = el('div', 'space-y-2');
    d.items.forEach(function (t) {
        const m = CB_TYPE[t.type] || CB_TYPE.EARNED;
        const r = el('div', 'glass rounded-xl border border-white/10 px-4 py-3 flex items-center gap-3');
        r.appendChild(el('i', 'fa-solid text-xl shrink-0 ' + m.icon + ' ' + m.cls));
        const l = el('div', 'min-w-0 flex-1');
        l.appendChild(el('div', 'font-bold text-white text-sm break-words', T(m.label) + ' · ' + T(CB_SOURCE[t.sourceType] || t.sourceType)));
        l.appendChild(el('div', 'text-xs text-slate-400 break-words', T(t.description) + ' · ' + formatDateTime(t.createdAt)));
        r.appendChild(l);
        r.appendChild(el('b', 'shrink-0 ' + m.cls, m.sign + ' ' + bdMoney(t.amount)));
        list.appendChild(r);
    });
    nodes.push(list);
    if (d.total > d.page * d.limit) nodes.push(actionBtn('fa-angles-down', "Ko'proq ko'rsatish", false, function () { renderCashbackTab(user, pg + 1); }));
    dashContent.replaceChildren.apply(dashContent, nodes);
}
