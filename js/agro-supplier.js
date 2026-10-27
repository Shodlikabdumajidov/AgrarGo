/* ===== Agro-Store sotuvchilari: admin/dispetcher paneli, sotuvchi kabineti, haydovchi uchun «TEZ KUNDA» =====
 * Server: /agro-store/suppliers (ADMIN, DISPATCHER), /agro-store/me/* (AGRO_SUPPLIER).
 * Umumiy yordamchilar (el, authed, gcSlide/gcMount, openWhModal ...) app.js'dan.
 */

const AGS_TYPE = { PHARMACY: 'Dorixona (Pharmacy/Agro-chem)', FERTILIZER: "O'g'it Sotuvchi (Fertilizer Supplier)" };
const AGS_VER = {
    PENDING: ['Tekshiruvda', 'bg-amber-500/15 text-amber-300 border-amber-500/30', 'wait'],
    VERIFIED: ['VERIFIED', 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', 'ok'],
    REJECTED: ['Rad etilgan', 'bg-rose-500/15 text-rose-300 border-rose-500/30', '']
};
const AGS_CATS = { CROP: ['Pestitsid', "O'g'it", 'Fungitsid', 'Insektitsid', 'Gerbitsid', 'Stimulyator'], LIVESTOCK: ['Kombikorm', 'Silos', 'Vitamin', 'Briket', 'Xashak'] };
const AGS_UNITS = ['kg', 'litr', 'dona'];

function agsField(label, input) {
    const w = el('label', 'block');
    w.appendChild(el('span', 'block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1', label));
    w.appendChild(input);
    return w;
}
function agsInput(type, ph, extra) {
    const i = el('input', 'auth-input'); i.type = type; if (ph) i.placeholder = ph;
    if (extra) Object.keys(extra).forEach(function (k) { i[k] = extra[k]; });
    return i;
}
function agsSelect(opts, value) {
    const s = el('select', 'auth-input');
    opts.forEach(function (o) { const a = Array.isArray(o) ? o : [o, o]; s.appendChild(new Option(T(a[1]), a[0])); });
    if (value !== undefined) s.value = value;
    return s;
}
function agsStatus(v) { const m = AGS_VER[v] || AGS_VER.PENDING; return whPill(T(m[0]), m[1]); }
function agsErr(err) { if (err && err.status !== 401) showToast((err.messages && err.messages[0]) || T("Xatolik yuz berdi."), 4500, 'error'); }

/** Faylni FormData bilan yuboradi (authed JSON uchun mo'ljallangan) */
async function agsUpload(path, file) {
    const token = storageGet(TOKEN_KEY);
    if (!token) { handleSessionExpired(reopenDash); throw { status: 401, messages: [] }; }
    const fd = new FormData(); fd.append('file', file);
    let res;
    try { res = await fetch(API_URL + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd }); }
    catch (e) { throw { status: 0, messages: ["Serverga ulanib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring."] }; }
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) { if (res.status === 401) handleSessionExpired(reopenDash); throw { status: res.status, messages: [].concat(data.message || 'Xatolik') }; }
    return data;
}

// ---------------- Admin / Dispetcher: sotuvchi qo'shish va tasdiqlash ----------------

async function renderAgroSuppliers(user) {
    const rid = ++dashRenderId;
    const isAdmin = user.role === 'ADMIN';
    const again = function () { renderAgroSuppliers(user); };
    const head = el('div', 'flex flex-wrap items-center justify-between gap-3');
    head.appendChild(sectionTitle("Agro-Store Sotuvchisini Qo'shish", T("Dorixona yoki o'g'it sotuvchisini yarating: u telefon raqam va boshlang'ich parol bilan kiradi.")));
    head.appendChild(refreshButton(again));

    const form = el('form', 'glass rounded-3xl border border-white/10 p-5 grid gap-3 sm:grid-cols-2'); form.id = 'ags-form'; form.noValidate = true;
    const type = agsSelect([['PHARMACY', AGS_TYPE.PHARMACY], ['FERTILIZER', AGS_TYPE.FERTILIZER]], 'PHARMACY'); type.name = 'type';
    const org = agsInput('text', T("Tashkilot / Do'kon nomi"), { name: 'orgName', maxLength: 120 });
    const contact = agsInput('text', T("Mas'ul shaxs F.I.SH."), { name: 'contactName', maxLength: 100 });
    const phone = agsInput('tel', '+998901234567', { name: 'phone', maxLength: 13 });
    const pw = agsInput('text', T("Boshlang'ich parol"), { name: 'password', maxLength: 64, autocomplete: 'off' });
    [[T('Sotuvchi turi'), type], [T("Tashkilot / Do'kon nomi"), org], [T("Mas'ul shaxs"), contact], [T('Telefon raqami'), phone], [T("Boshlang'ich parol"), pw]].forEach(function (f) { form.appendChild(agsField(f[0], f[1])); });
    const submit = actionBtn('fa-user-plus', "Sotuvchini qo'shish", true, function () {});
    submit.type = 'submit'; const sw = el('div', 'flex items-end'); sw.appendChild(submit); form.appendChild(sw);
    const msg = el('p', 'sm:col-span-2 text-xs text-slate-400', T("Parol kamida 8 ta belgi, harf va raqam bo'lishi kerak. Sotuvchi birinchi kirgach hujjatlarini yuklaydi."));
    form.appendChild(msg);
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        submit.disabled = true;
        try {
            const r = await authed('POST', '/agro-store/suppliers', { type: type.value, orgName: org.value, contactName: contact.value, phone: phone.value.trim(), password: pw.value });
            showToast(T("Sotuvchi qo'shildi: {0}", r.orgName), 3500, 'success');
            again();
        } catch (err) { agsErr(err); submit.disabled = false; }
    });

    dashContent.replaceChildren(head, form, skeleton('list'));
    let list;
    try { list = await authed('GET', '/agro-store/suppliers'); }
    catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(head, form, dashMessage('fa-triangle-exclamation text-rose-400', (err.messages || [''])[0], again)); }
    if (rid !== dashRenderId) return;
    const nodes = [head, form, sectionTitle('Sotuvchilar', T('{0} ta', list.length))];
    if (!list.length) nodes.push(emptyState({ art: 'search', compact: true, title: "Hali sotuvchi yo'q", text: "Yuqoridagi forma orqali birinchi sotuvchini qo'shing." }));
    const grid = el('div', 'grid gap-4 lg:grid-cols-2'); grid.id = 'ags-list';
    list.forEach(function (s) {
        const c = el('article', 'glass rounded-2xl border border-white/10 p-4 space-y-3'); c.dataset.supplier = s.id;
        const top = el('div', 'flex items-start justify-between gap-3');
        const tt = el('div', 'min-w-0'); tt.appendChild(el('h3', 'font-extrabold text-white break-words', s.orgName));
        tt.appendChild(el('p', 'text-xs text-slate-400', T(AGS_TYPE[s.type]) + ' · ' + s.contactName + ' · ' + s.phone));
        top.appendChild(tt); top.appendChild(agsStatus(s.verification)); c.appendChild(top);
        const info = el('div', 'text-xs text-slate-300 space-y-1');
        info.appendChild(el('div', '', T('Postlar') + ': ' + s.productCount));
        if (s.type === 'FERTILIZER') info.appendChild(el('div', '', 'STIR: ' + (s.stir || '—') + ' · ' + T('Pasport') + ': ' + (s.passportInfo || '—')));
        if (s.rejectReason) info.appendChild(el('div', 'text-rose-300', T('Sabab') + ': ' + s.rejectReason));
        if (s.missing && s.missing.length && s.verification !== 'VERIFIED') info.appendChild(el('div', 'text-amber-300', T('Yetishmaydi') + ': ' + s.missing.map(function (m) { return m === 'license' ? T('Litsenziya') : m === 'stir' ? T('STIR guvohnomasi') : T('STIR / pasport'); }).join(', ')));
        c.appendChild(info);
        const act = el('div', 'flex flex-wrap gap-2');
        if (s.hasLicense) act.appendChild(actionBtn('fa-file-pdf', 'Litsenziya', false, function () { openPdf('/agro-store/suppliers/' + s.id + '/documents/license', 'license'); }));
        if (s.hasStirDoc) act.appendChild(actionBtn('fa-id-card', 'STIR guvohnomasi', false, function () { openPdf('/agro-store/suppliers/' + s.id + '/documents/stir', 'stir'); }));
        if (isAdmin && s.verification !== 'VERIFIED') act.appendChild(actionBtn('fa-circle-check', 'Tasdiqlash (VERIFIED)', true, async function () {
            try { await authed('PATCH', '/agro-store/suppliers/' + s.id + '/verify'); showToast(T('Sotuvchi tasdiqlandi.'), 2500, 'success'); again(); } catch (err) { agsErr(err); }
        }));
        if (isAdmin && s.verification !== 'REJECTED') act.appendChild(actionBtn('fa-ban', 'Rad etish', false, async function () {
            const reason = window.prompt(T('Rad etish sababini yozing'));
            if (!reason || reason.trim().length < 3) return;
            try { await authed('PATCH', '/agro-store/suppliers/' + s.id + '/reject', { reason: reason.trim() }); again(); } catch (err) { agsErr(err); }
        }));
        c.appendChild(act); grid.appendChild(c);
    });
    if (list.length) nodes.push(grid);
    dashContent.replaceChildren.apply(dashContent, nodes);
}

// ---------------- Sotuvchi kabineti: postlar (Glassy Carousel) ----------------

async function renderAgroSupplierPosts(user) {
    const rid = ++dashRenderId;
    const again = function () { renderAgroSupplierPosts(user); };
    let me, items;
    dashContent.replaceChildren(skeleton('list'));
    try { const all = await Promise.all([authed('GET', '/agro-store/me'), authed('GET', '/agro-store/me/products')]); me = all[0]; items = all[1]; }
    catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', (err.messages || [''])[0], again)); }
    if (rid !== dashRenderId) return;
    const head = el('div', 'flex flex-wrap items-center justify-between gap-3');
    head.appendChild(sectionTitle(me.orgName, T(AGS_TYPE[me.type])));
    const hb = el('div', 'flex flex-wrap gap-2');
    const add = actionBtn('fa-plus', 'Yangi post', true, function () { openAgroPostForm(null, again); }); add.id = 'asp-add';
    hb.appendChild(add); hb.appendChild(refreshButton(again)); head.appendChild(hb);
    const nodes = [head, agroVerifyBanner(me)];
    if (!items.length) nodes.push(emptyState({ art: 'listings', title: "Hali post yo'q", text: "Birinchi mahsulotingizni joylang: tasdiqlangach fermerlar katalogda ko'radi.", cta: { label: 'Yangi post', icon: 'fa-plus', fn: function () { openAgroPostForm(null, again); } } }));
    else {
        const slides = items.map(function (p) {
            const d = el('div', 'rounded-2xl border border-white/10 p-4 space-y-3'); d.dataset.post = p.id;
            d.appendChild(el('h4', 'font-extrabold text-white', p.name));
            if (p.description) d.appendChild(el('p', 'text-xs text-slate-300', p.description));
            const use = el('div', 'ag-usage'); use.appendChild(el('b', '', T("Ishlatish bo'yicha qo'llanma"))); use.appendChild(el('span', '', p.usage || '—')); d.appendChild(use);
            d.appendChild(el('p', 'text-xs text-slate-400', T(p.mode === 'LIVESTOCK' ? 'Chorvachilik Mahsulotlari' : 'Ekin dorilari va O\'g\'itlar') + ' · ' + T(p.category)));
            const act = el('div', 'flex flex-wrap gap-2');
            act.appendChild(actionBtn('fa-pen', 'Tahrirlash', false, function () { openAgroPostForm(p, again); }));
            act.appendChild(actionBtn(p.isActive ? 'fa-box-archive' : 'fa-box-open', p.isActive ? 'Arxivlash' : 'Faollashtirish', false, async function () {
                try { await authed('PUT', '/agro-store/me/products/' + p.id, { isActive: !p.isActive }); again(); } catch (err) { agsErr(err); }
            }));
            act.appendChild(actionBtn('fa-trash', "O'chirish", false, async function () {
                if (!window.confirm(T("Post o'chirilsinmi?"))) return;
                try { await authed('DELETE', '/agro-store/me/products/' + p.id); again(); } catch (err) { agsErr(err); }
            }));
            d.appendChild(act);
            return gcSlide({ photo: p.imageUrl, icon: 'fa-flask-vial', title: p.name, chip: p.visible ? T('Ommaga ko\'rinadi') : T('Yashirin'), price: formatNumber(p.price) + ' ' + T("so'm") + '/' + T(p.unit), qty: formatNumber(p.stockQty) + ' ' + T(p.unit),
                loc: me.orgName, pin: { text: me.verification === 'VERIFIED' ? T('Tasdiqlangan sotuvchi') : T('Verifikatsiya kutilmoqda'), tone: AGS_VER[me.verification][2] }, quick: 'Batafsil', detail: d });
        });
        nodes.push(gcMount(slides, "Postlar karuseli"));
    }
    dashContent.replaceChildren.apply(dashContent, nodes);
}

function agroVerifyBanner(me) {
    const m = AGS_VER[me.verification] || AGS_VER.PENDING;
    const b = el('div', 'ag-banner'); b.id = 'asp-verify';
    b.appendChild(el('i', 'fa-solid ' + (me.verification === 'VERIFIED' ? 'fa-shield-check' : 'fa-shield-halved')));
    const t = el('div'); const tag = el('span', 'ag-soon', T(m[0])); t.appendChild(tag);
    t.appendChild(el('p', '', me.verification === 'VERIFIED' ? T("Postlaringiz fermerlarga ko'rinadi.")
        : me.verification === 'REJECTED' ? T('Rad etildi') + ': ' + (me.rejectReason || '') : T("Admin tasdiqlamaguncha postlaringiz ommaga ko'rinmaydi. «Verifikatsiya» bo'limida hujjatlarni to'ldiring.")));
    b.appendChild(t);
    return b;
}

function openAgroPostForm(p, done) {
    const box = el('form', 'space-y-3'); box.noValidate = true; box.id = 'asp-form';
    const mode = agsSelect([['CROP', "Ekin dorilari va O'g'itlar"], ['LIVESTOCK', 'Chorvachilik Mahsulotlari']], p ? p.mode : 'CROP');
    const name = agsInput('text', T('Mahsulot nomi'), { maxLength: 120, value: p ? p.name : '' });
    const cat = agsSelect(AGS_CATS.CROP.concat(AGS_CATS.LIVESTOCK).filter(function (x, i, a) { return a.indexOf(x) === i; }), p ? p.category : AGS_CATS.CROP[0]);
    const price = agsInput('number', '0', { min: 1, step: '1', value: p ? p.price : '' });
    const unit = agsSelect(AGS_UNITS, p ? p.unit : 'kg');
    const stock = agsInput('number', '0', { min: 0, step: '1', value: p ? p.stockQty : '' });
    const usage = el('textarea', 'auth-input'); usage.rows = 2; usage.maxLength = 600; usage.placeholder = T('Masalan: 1 gektarga 2 litr'); usage.value = p ? p.usage : '';
    const desc = el('textarea', 'auth-input'); desc.rows = 2; desc.maxLength = 600; desc.value = p ? p.description : '';
    const file = agsInput('file', ''); file.accept = 'image/jpeg,image/png,image/webp';
    const g = el('div', 'grid gap-3 sm:grid-cols-2');
    [[T('Rejim'), mode], [T('Mahsulot nomi'), name], [T('Kategoriya'), cat], [T('Narxi (so\'m)'), price], [T('Birlik'), unit], [T('Zaxira miqdori'), stock]].forEach(function (f) { g.appendChild(agsField(f[0], f[1])); });
    box.appendChild(g);
    box.appendChild(agsField(T("Dozasi / ishlatish yo'riqnomasi"), usage));
    box.appendChild(agsField(T('Qisqa tavsif'), desc));
    box.appendChild(agsField(T('Mahsulot rasmi'), file));
    const submit = actionBtn('fa-floppy-disk', 'Saqlash', true, function () {}); submit.type = 'submit'; box.appendChild(submit);
    box.addEventListener('submit', async function (e) {
        e.preventDefault(); submit.disabled = true;
        const body = { name: name.value, category: cat.value, mode: mode.value, price: Number(price.value), unit: unit.value, stockQty: Number(stock.value || 0), usage: usage.value, description: desc.value };
        try {
            const row = p ? await authed('PUT', '/agro-store/me/products/' + p.id, body) : await authed('POST', '/agro-store/me/products', body);
            if (file.files && file.files[0]) await agsUpload('/agro-store/me/products/' + row.id + '/photo', file.files[0]);
            closeWhModal(); showToast(T('Saqlandi'), 2200, 'success'); done();
        } catch (err) { agsErr(err); submit.disabled = false; }
    });
    openWhModal(p ? 'Postni tahrirlash' : 'Yangi post', '', box, true);
}

// ---------------- Sotuvchi kabineti: verifikatsiya va profil ----------------

async function renderAgroSupplierProfile(user) {
    const rid = ++dashRenderId;
    const again = function () { renderAgroSupplierProfile(user); };
    dashContent.replaceChildren(skeleton('list'));
    let me;
    try { me = await authed('GET', '/agro-store/me'); }
    catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', (err.messages || [''])[0], again)); }
    if (rid !== dashRenderId) return;
    const head = sectionTitle('Verifikatsiya va profil', T(me.type === 'PHARMACY'
        ? "Kimyoviy va biologik moddalarni sotish uchun litsenziya va STIR guvohnomasi rasmini yuklang."
        : "O'g'it sotuvchi uchun STIR yoki pasport ma'lumotlari va shaxsni tasdiqlash yetarli."));
    const card = el('div', 'glass rounded-3xl border border-white/10 p-5 space-y-4'); card.id = 'asv-card';
    const row = el('div', 'flex items-center justify-between gap-3 flex-wrap');
    row.appendChild(el('div', 'text-sm text-slate-300', me.orgName + ' · ' + me.phone)); row.appendChild(agsStatus(me.verification)); card.appendChild(row);
    const docRow = function (type, label, has) {
        const r = el('div', 'rounded-2xl border border-white/10 p-3 flex flex-wrap items-center gap-3 justify-between'); r.dataset.doc = type;
        r.appendChild(el('div', 'text-sm font-bold text-white', label));
        const right = el('div', 'flex items-center gap-2 flex-wrap');
        right.appendChild(whPill(T(has ? 'Yuklangan' : 'Yuklanmagan'), has ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'));
        if (has) right.appendChild(actionBtn('fa-eye', "Ko'rish", false, function () { openPdf('/agro-store/me/documents/' + type, type); }));
        const f = agsInput('file', ''); f.accept = 'application/pdf,image/jpeg,image/png,image/webp'; f.className = 'text-xs text-slate-300';
        f.addEventListener('change', async function () {
            if (!f.files || !f.files[0]) return;
            try { await agsUpload('/agro-store/me/documents/' + type, f.files[0]); showToast(T('Hujjat yuklandi'), 2200, 'success'); again(); } catch (err) { agsErr(err); }
        });
        right.appendChild(f); r.appendChild(right); return r;
    };
    if (me.type === 'PHARMACY') {
        card.appendChild(docRow('license', T('Farmatsevtika / Agro-kimyoviy faoliyat litsenziyasi (PDF/rasm)'), me.hasLicense));
        card.appendChild(docRow('stir', T('STIR / Guvohnoma (PDF/rasm)'), me.hasStirDoc));
    } else {
        const f = el('form', 'grid gap-3 sm:grid-cols-2'); f.id = 'asv-form'; f.noValidate = true;
        const stir = agsInput('text', '305123456', { maxLength: 9, value: me.stir || '' });
        const pass = agsInput('text', 'AA1234567', { maxLength: 200, value: me.passportInfo || '' });
        f.appendChild(agsField('STIR', stir)); f.appendChild(agsField(T('Pasport ma\'lumotlari'), pass));
        const save = actionBtn('fa-floppy-disk', 'Saqlash', true, function () {}); save.type = 'submit'; f.appendChild(save);
        f.addEventListener('submit', async function (e) {
            e.preventDefault(); save.disabled = true;
            const body = {}; if (stir.value.trim()) body.stir = stir.value.trim(); if (pass.value.trim()) body.passportInfo = pass.value.trim();
            try { await authed('PUT', '/agro-store/me', body); showToast(T('Saqlandi'), 2200, 'success'); again(); } catch (err) { agsErr(err); save.disabled = false; }
        });
        card.appendChild(f);
    }
    if (me.rejectReason) card.appendChild(el('p', 'text-sm text-rose-300', T('Rad etildi') + ': ' + me.rejectReason));
    dashContent.replaceChildren(head, agroVerifyBanner(me), card, buildPasswordForm());
}

// ---------------- Haydovchi: «Dori & O'g'itlar» — TEZ KUNDA ----------------

function renderAgroDriverSoon() {
    dashRenderId++;
    const box = el('div', 'glass rounded-3xl border border-white/10 text-center py-14 px-6 space-y-4'); box.id = 'agd-soon';
    box.appendChild(el('i', 'fa-solid fa-flask-vial text-4xl text-amber-300'));
    const tag = el('span', 'ag-soon', T('TEZ KUNDA')); const w = el('div'); w.appendChild(tag); box.appendChild(w);
    box.appendChild(el('h3', 'text-xl font-extrabold text-white', "Dori & O'g'itlar"));
    box.appendChild(el('p', 'text-sm text-slate-300 max-w-md mx-auto', T("Dori va o'g'it yuklarini tashish bo'limi tez orada ishga tushadi. Hozircha bu bo'lim ulanmagan.")));
    dashContent.replaceChildren(box);
}

Object.assign(LOCAL_TABS, { agrosuppliers: renderAgroSuppliers, asposts: renderAgroSupplierPosts, asprofile: renderAgroSupplierProfile, agrodriver: renderAgroDriverSoon });
