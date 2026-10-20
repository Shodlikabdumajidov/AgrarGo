/* ===== AgrarGo Hub va Mahalliy bozor (B2C): xaridor, fermer, Hub xodimi, kuryer, administrator =====
 * app.js'dan keyin yuklanadi (umumiy yordamchilar: el, authed, openWhForm, actionBtn, showToast ... shu yerda ishlatiladi).
 * Pul oqimi: xaridor to'laydi -> Escrow'da muzlaydi -> yetkazilgach fermer / Hub / kuryer / platformaga bo'linadi.
 */

// ---------- Umumiy ----------
const LOCAL_STATUS = {
    PENDING: { label: 'Hub tasdig\'i kutilmoqda', short: 'Kutilmoqda', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    PACKING: { label: 'Qadoqlanmoqda', short: 'Qadoqlanmoqda', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
    DELIVERING: { label: "Kuryer yo'lda", short: "Yo'lda", cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
    COMPLETED: { label: 'Yetkazildi', short: 'Yetkazildi', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    CANCELLED: { label: 'Bekor qilingan', short: 'Bekor', cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
};
const LOCAL_STEPS = ['PENDING', 'PACKING', 'DELIVERING', 'COMPLETED'];
const SPLIT_META = {
    FARMER: { icon: '🌾', label: 'Fermerga (mahsulot)' },
    HUB: { icon: '🏬', label: "Hub omboriga (saqlash va qadoqlash)" },
    COURIER: { icon: '🛵', label: 'Kuryerga (yetkazish)' },
    PLATFORM: { icon: '🧾', label: 'Platforma xizmat haqi' }
};
const SPLIT_STATE = { HELD: ["Escrow'da", 'text-amber-300'], PAID: ["O'tkazildi", 'text-emerald-300'], REFUNDED: ['Qaytarildi', 'text-slate-300'] };

const lcHue = function (s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
const lcStatusChip = function (status) {
    const m = LOCAL_STATUS[status] || LOCAL_STATUS.PENDING;
    return el('span', ['shrink-0 text-xs font-bold px-3 py-1 rounded-full border', m.cls].join(' '), T(m.label));
};
const lcKg = function (n) { return T('{0} kg', formatNumber(n)); };
const lcErr = function (err) { return (err && err.messages && err.messages[0]) || (err && err.message) || 'Xatolik'; };
const lcUser = function () { return currentUser(); };

// Qimmat narx tarkibi: mahsulot / Hub / kuryer / platforma (so'rov javobi yoki buyurtma)
function lcBreakdown(b, qtyText) {
    const box = el('div', 'lc-quote');
    const line = function (label, sub, value) {
        const r = el('div', 'lc-line');
        const l = el('div', 'min-w-0', label);
        if (sub) l.appendChild(el('small', '', sub));
        r.appendChild(l);
        r.appendChild(el('b', '', value));
        box.appendChild(r);
    };
    line('🌾 ' + T('Mahsulot'), qtyText, bdMoney(b.productAmount));
    line('🏬 ' + T('Hub: saqlash va qadoqlash'), '', bdMoney(b.hubFee));
    line('🛵 ' + T('Shahar ichi yetkazish'), '', bdMoney(b.courierFee));
    line('🧾 ' + T('Platforma xizmat haqi'), '', bdMoney(b.serviceFee));
    const tot = el('div', 'lc-total');
    tot.appendChild(el('span', '', T('Jami')));
    tot.appendChild(el('span', '', bdMoney(b.totalPrice)));
    box.appendChild(tot);
    return box;
}

// Escrow taqsimoti (hamma pul qayerga ketishini ochiq ko'rsatadi)
function lcSplits(o) {
    const box = el('div', 'rounded-2xl border border-white/10 bg-slate-950/40 p-3 space-y-2');
    box.appendChild(el('div', 'text-[11px] font-bold uppercase tracking-wider text-slate-400', T("Escrow: pul qanday taqsimlanadi")));
    const total = o.totalPrice || 1;
    const bar = el('div', 'lc-bar');
    (o.splits || []).forEach(function (s, i) { const seg = el('i', i % 2 ? 'r' : 'a'); seg.style.width = (s.amount / total * 100) + '%'; seg.style.opacity = String(1 - i * 0.18); bar.appendChild(seg); });
    box.appendChild(bar);
    (o.splits || []).forEach(function (s) {
        const m = SPLIT_META[s.party], st = SPLIT_STATE[s.status];
        const r = el('div', 'flex items-center justify-between gap-3 text-xs');
        r.appendChild(el('span', 'min-w-0 text-slate-300', m.icon + ' ' + T(m.label)));
        const rt = el('span', 'shrink-0 flex items-center gap-2');
        rt.appendChild(el('b', 'text-white', bdMoney(s.amount)));
        rt.appendChild(el('span', st[1], T(st[0])));
        r.appendChild(rt);
        box.appendChild(r);
    });
    return box;
}

function lcSteps(status) {
    const wrap = el('div', 'lc-steps');
    if (status === 'CANCELLED') { wrap.appendChild(el('span', '', T('Buyurtma bekor qilingan'))); return wrap; }
    const idx = LOCAL_STEPS.indexOf(status);
    LOCAL_STEPS.forEach(function (s, i) {
        wrap.appendChild(el('span', [i < idx ? 'on' : '', i === idx ? 'cur' : ''].join(' ').trim(), T(LOCAL_STATUS[s].short)));
        if (i < LOCAL_STEPS.length - 1) wrap.appendChild(el('span', '', '›'));
    });
    return wrap;
}

// ---------- Savatcha (localStorage) ----------
const LCART_KEY = 'agrargo_cart_v1';
function cartGet() { try { const v = JSON.parse(localStorage.getItem(LCART_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function cartSet(list) { try { localStorage.setItem(LCART_KEY, JSON.stringify(list)); } catch (e) { /* maxfiy rejim */ } cartBadge(); }
function cartBadge() { try { setTabBadge('lcart', cartGet().length); } catch (e) { /* kabinet yopiq */ } }
function cartAdd(item, qty) {
    const list = cartGet();
    const hit = list.filter(function (x) { return x.productId === item.productId; })[0];
    if (hit) hit.quantityKg = Math.min(item.maxOrderKg, hit.quantityKg + qty);
    else list.push({ productId: item.productId, name: item.name, quantityKg: qty, pricePerKg: item.pricePerKg, minOrderKg: item.minOrderKg, maxOrderKg: item.maxOrderKg, hub: item.hub.name, hubRegion: item.hub.region });
    cartSet(list);
}

// ---------- Mahalliy bozor kartochkasi va buyurtma oynasi ----------
function localCard(item, i) {
    const c = el('article', 'lc-card');
    c.style.setProperty('--i', String(Math.min(i, 12)));
    const ph = el('div', 'lc-ph', item.name.charAt(0).toUpperCase());
    ph.style.setProperty('--h', String(lcHue(item.name)));
    c.appendChild(ph);
    const head = el('div', 'min-w-0');
    head.appendChild(el('h3', 'font-extrabold text-white text-lg break-words', item.name));
    head.appendChild(el('p', 'text-xs text-slate-400 font-semibold', item.category + ' · ' + item.farmName));
    c.appendChild(head);
    const row = el('div', 'flex items-end justify-between gap-2');
    row.appendChild(el('div', 'text-xl font-black text-emerald-300', T("{0} so'm / kg", formatNumber(item.pricePerKg))));
    row.appendChild(el('div', 'text-[11px] text-slate-400 text-right', T('{0} dan', lcKg(item.minOrderKg)) + ' · ' + T('Mavjud: {0}', lcKg(item.availableKg))));
    c.appendChild(row);
    c.appendChild(el('div', 'text-xs text-sky-300 font-semibold', '🏬 ' + item.hub.name + ' · ' + item.hub.region));
    const chips = el('div', 'flex flex-wrap gap-1.5');
    lcSizes(item).forEach(function (kg) {
        const b = el('button', 'lc-chip', lcKg(kg)); b.type = 'button';
        b.addEventListener('click', function () { openLocalOrder(item, kg); });
        chips.appendChild(b);
    });
    c.appendChild(chips);
    const act = el('div', 'grid grid-cols-2 gap-2 mt-auto pt-1');
    const add = el('button', 'lc-btn ghost !py-2.5 !text-xs'); add.type = 'button';
    add.appendChild(el('i', 'fa-solid fa-cart-plus')); add.appendChild(el('span', '', T("Savatga")));
    add.addEventListener('click', function () { cartAdd(item, item.minOrderKg); showToast(T("Savatga qo'shildi: {0} · {1}", item.name, lcKg(item.minOrderKg)), 2500, 'success'); });
    const buy = el('button', 'lc-btn solid !py-2.5 !text-xs'); buy.type = 'button';
    buy.appendChild(el('i', 'fa-solid fa-bolt')); buy.appendChild(el('span', '', T('Buyurtma')));
    buy.addEventListener('click', function () { openLocalOrder(item, item.minOrderKg); });
    act.appendChild(add); act.appendChild(buy);
    c.appendChild(act);
    return c;
}
function lcSizes(item) {
    const set = [item.minOrderKg, 20, 30, 50, 100].filter(function (k) { return k >= item.minOrderKg && k <= item.maxOrderKg; });
    return Array.from(new Set(set)).sort(function (a, b) { return a - b; }).slice(0, 4);
}

const loModal = document.getElementById('lo-modal');
const lo = { item: null, qty: 0, timer: null, seq: 0, checkout: false };
function closeLoModal() { loModal.classList.remove('open'); syncScrollLock(); clearTimeout(lo.timer); }

function openLocalOrder(item, qty) {
    lo.item = item; lo.qty = qty; lo.checkout = false;
    document.getElementById('lo-hub').textContent = '🏬 ' + item.hub.name + ' · ' + item.hub.region;
    document.getElementById('lo-title').textContent = item.name;
    document.getElementById('lo-sub').textContent = T("{0} so'm / kg · {1} · fermer: {2}", formatNumber(item.pricePerKg), lcKg(item.minOrderKg) + ' ' + T('dan'), item.farmName);
    document.getElementById('lo-range').textContent = T('{0} – {1}', lcKg(item.minOrderKg), lcKg(item.maxOrderKg));
    document.getElementById('lo-checkout').classList.add('hidden');
    document.getElementById('lo-buy-label').textContent = T('Tezkor buyurtma');
    hideAuthAlert(document.getElementById('lo-alert'));
    const inp = document.getElementById('lo-qty');
    inp.min = String(item.minOrderKg); inp.max = String(item.maxOrderKg);
    inp.value = String(qty);
    const u = lcUser();
    if (u && u.consumer) {
        document.getElementById('lo-district').value = u.consumer.district || '';
        document.getElementById('lo-address').value = u.consumer.address || '';
        document.getElementById('lo-phone').value = u.phone || '';
    }
    lcRenderChips();
    lcQuote();
    loModal.classList.add('open'); syncScrollLock();
}
function lcRenderChips() {
    const box = document.getElementById('lo-chips');
    box.replaceChildren.apply(box, lcSizes(lo.item).map(function (kg) {
        const b = el('button', ['lc-chip', kg === lo.qty ? 'on' : ''].join(' ').trim(), lcKg(kg)); b.type = 'button';
        b.addEventListener('click', function () { lcSetQty(kg); });
        return b;
    }));
}
function lcSetQty(q) {
    const it = lo.item;
    lo.qty = Math.max(it.minOrderKg, Math.min(it.maxOrderKg, Math.round(q * 100) / 100));
    document.getElementById('lo-qty').value = String(lo.qty);
    lcRenderChips(); lcQuote();
}
function lcQuote() {
    const box = document.getElementById('lo-quote');
    clearTimeout(lo.timer);
    const seq = ++lo.seq, item = lo.item, qty = lo.qty;
    if (!(qty >= item.minOrderKg)) { box.replaceChildren(el('div', 'text-slate-400', T('Eng kam buyurtma: {0}', lcKg(item.minOrderKg)))); return; }
    box.replaceChildren(el('div', 'text-slate-500', T('Hisoblanmoqda...')));
    lo.timer = setTimeout(async function () {
        try {
            const q = await apiRequest('GET', '/local/quote?productId=' + encodeURIComponent(item.productId) + '&quantityKg=' + encodeURIComponent(qty));
            if (seq !== lo.seq) return;
            const nodes = [lcBreakdown(q, T('{0} × {1} so\'m', lcKg(qty), formatNumber(q.pricePerKg)))];
            nodes.push(el('p', 'text-[11px] text-slate-500 mt-2 leading-relaxed', T("To'lov Escrow'da muzlatiladi. Yetkazilgach: mahsulot puli fermerga, Hub haqi omborga, yetkazish haqi kuryerga o'tadi.")));
            box.replaceChildren.apply(box, nodes);
        } catch (err) {
            if (seq !== lo.seq) return;
            box.replaceChildren(el('div', 'text-rose-300', lcErr(err)));
        }
    }, 280);
}
document.getElementById('lo-qty').addEventListener('input', function (e) { const v = Number(e.target.value); if (v > 0) { lo.qty = v; lcRenderChips(); lcQuote(); } });
document.getElementById('lo-qty').addEventListener('change', function (e) { lcSetQty(Number(e.target.value) || lo.item.minOrderKg); });
document.getElementById('lo-minus').addEventListener('click', function () { lcSetQty(lo.qty - (lo.item.minOrderKg >= 10 ? 5 : 1)); });
document.getElementById('lo-plus').addEventListener('click', function () { lcSetQty(lo.qty + (lo.item.minOrderKg >= 10 ? 5 : 1)); });
document.getElementById('lo-cart').addEventListener('click', function () {
    if (!(lo.qty >= lo.item.minOrderKg)) return;
    cartAdd(lo.item, lo.qty);
    closeLoModal();
    showToast(T("Savatga qo'shildi: {0} · {1}", lo.item.name, lcKg(lo.qty)), 2800, 'success');
});

// Xarid faqat xaridor akkaunti bilan: kirmagan bo'lsa ro'yxatdan o'tish oynasi ochiladi
function lcRequireConsumer(next) {
    const u = lcUser();
    if (!u) { afterLoginAction = next; openAuthModal('register', 'CONSUMER'); setAuthRole('CONSUMER'); showAuthAlert(["Mahalliy bozordan xarid qilish uchun xaridor sifatida ro'yxatdan o'ting yoki kiring."], 'info'); return false; }
    if (u.role !== 'CONSUMER') { showToast(T("Mahalliy bozordan faqat «Xaridor» akkaunti xarid qila oladi."), 4500, 'error'); return false; }
    return true;
}
document.getElementById('lo-buy').addEventListener('click', async function () {
    const item = lo.item, qty = lo.qty;
    if (!lcRequireConsumer(function () { openLocalOrder(item, qty); })) { closeLoModal(); return; }
    const alertBox = document.getElementById('lo-alert');
    hideAuthAlert(alertBox);
    if (!lo.checkout) { // 1-bosqich: manzilni so'rash
        lo.checkout = true;
        document.getElementById('lo-checkout').classList.remove('hidden');
        document.getElementById('lo-buy-label').textContent = T("To'lash va buyurtma berish");
        document.getElementById('lo-address').focus();
        return;
    }
    const body = { productId: item.productId, quantityKg: qty, district: document.getElementById('lo-district').value.trim(), address: document.getElementById('lo-address').value.trim(), phone: normalizePhone(document.getElementById('lo-phone').value) };
    const note = document.getElementById('lo-note').value.trim();
    if (note) body.note = note;
    const errors = [];
    if (body.district.length < 2) errors.push('Tuman yoki mahallani kiriting.');
    if (body.address.length < 5) errors.push("Manzilni to'liq kiriting.");
    if (!/^\+998\d{9}$/.test(body.phone)) errors.push(PHONE_ERR);
    if (qty < item.minOrderKg) errors.push(T('Eng kam buyurtma: {0}', lcKg(item.minOrderKg)));
    if (errors.length) return showAuthAlert(errors, 'error', alertBox);
    const btn = document.getElementById('lo-buy');
    btn.disabled = true;
    try {
        const o = await authed('POST', '/local/orders', body);
        closeLoModal();
        showSuccessCheck(T('Buyurtma qabul qilindi!'), T('Topshirish kodi: {0}. Uni faqat kuryer yetkazganda ayting.', o.deliveryCode), 'booking');
        if (dashboardView.classList.contains('open')) selectDashTab('lorders'); else openDashboard('lorders');
    } catch (err) {
        if (err.status !== 401) showAuthAlert(err.messages || [lcErr(err)], 'error', alertBox);
    } finally { btn.disabled = false; }
});

// ---------- Landing: Marketplace'da "Mahalliy bozor" rejimi ----------
let marketMode = 'b2b';
function setMarketMode(mode) {
    marketMode = mode;
    document.getElementById('mm-b2b').classList.toggle('active', mode === 'b2b');
    document.getElementById('mm-local').classList.toggle('active', mode === 'local');
    document.getElementById('mm-b2b').setAttribute('aria-selected', String(mode === 'b2b'));
    document.getElementById('mm-local').setAttribute('aria-selected', String(mode === 'local'));
    document.getElementById('market-filters').classList.toggle('hidden', mode === 'local');
    renderLocalToolbar();
    loadMarket();
}
function renderLocalToolbar() {
    let bar = document.getElementById('local-toolbar');
    if (marketMode !== 'local') { if (bar) bar.remove(); return; }
    if (bar) return;
    bar = el('div', 'glass rounded-3xl border border-emerald-500/25 p-4 sm:p-5 mb-6 space-y-3');
    bar.id = 'local-toolbar';
    bar.appendChild(el('p', 'text-sm text-slate-300 leading-relaxed', T("Fermerlar mahsulotni shahringizdagi AgrarGo Hub omboriga topshiradi — siz 10 kg dan buyurtma qilasiz, kuryer bir necha soatda eshigingizgacha olib keladi. To'lov Escrow'da kafolatlanadi.")));
    const sel = el('select', 'auth-input sm:!w-auto sm:min-w-[14rem]'); sel.id = 'local-region';
    sel.setAttribute('aria-label', T('Viloyat'));
    sel.appendChild(new Option(T('Barcha viloyatlar'), ''));
    REGIONS.forEach(function (r) { sel.appendChild(new Option(r, r)); });
    const u = lcUser();
    sel.value = marketState.region || (u && u.consumer ? u.consumer.region : '');
    marketState.region = sel.value;
    sel.addEventListener('change', function () { marketState.region = sel.value; loadMarket(); });
    bar.appendChild(sel);
    document.getElementById('market-filters').before(bar);
}
async function loadLocalMarket() {
    const reqId = ++marketRequestId;
    renderMarketSkeleton();
    document.getElementById('market-pagination').replaceChildren();
    const qs = [];
    if (marketState.q) qs.push('q=' + encodeURIComponent(marketState.q));
    if (marketState.region) qs.push('region=' + encodeURIComponent(marketState.region));
    try {
        const items = await apiRequest('GET', '/local/market' + (qs.length ? '?' + qs.join('&') : ''));
        if (reqId !== marketRequestId) return;
        document.getElementById('market-count').innerText = items.length ? T('Topildi: {0}', items.length) : '';
        if (!items.length) return renderMarketMessage('fa-basket-shopping', T("Hozircha mahalliy bozorda mahsulot yo'q"), T("Fermerlar Hub omboriga mahsulot topshirgach, bu yerda 10 kg dan buyurtma qilish mumkin bo'ladi."), null, null);
        const grid = el('div', 'lc-grid');
        items.forEach(function (it, i) { grid.appendChild(localCard(it, i)); });
        marketGrid.replaceChildren(grid);
    } catch (err) {
        if (reqId !== marketRequestId) return;
        renderMarketMessage('fa-triangle-exclamation text-rose-400', T("Mahalliy bozorni yuklab bo'lmadi"), lcErr(err), 'Qayta urinish', loadMarket);
    }
}
document.getElementById('mm-b2b').addEventListener('click', function () { if (marketMode !== 'b2b') setMarketMode('b2b'); });
document.getElementById('mm-local').addEventListener('click', function () { if (marketMode !== 'local') setMarketMode('local'); });

// ---------- Xaridor kabineti ----------
async function renderLocalMarketTab(user) {
    const rid = ++dashRenderId;
    const head = el('div', 'flex flex-wrap items-end justify-between gap-4');
    head.appendChild(sectionTitle('Mahalliy bozor', T("Shahringizdagi Hub ombordan 10 kg dan buyurtma qiling: kuryer bir necha soatda yetkazadi")));
    const sel = el('select', 'auth-input sm:!w-auto sm:min-w-[13rem]');
    sel.setAttribute('aria-label', T('Viloyat'));
    sel.appendChild(new Option(T('Barcha viloyatlar'), ''));
    REGIONS.forEach(function (r) { sel.appendChild(new Option(r, r)); });
    const st = { region: (user.consumer && user.consumer.region) || '', q: '' };
    sel.value = st.region;
    head.appendChild(sel);
    const sw = el('div', 'pr-search');
    sw.appendChild(el('i', 'fa-solid fa-magnifying-glass'));
    const input = el('input'); input.type = 'search'; input.maxLength = 80; input.placeholder = T('Mahsulot nomi bo\'yicha qidiring...'); input.setAttribute('aria-label', T('Qidiruv'));
    sw.appendChild(input);
    const res = el('div'); res.id = 'lm-results';
    const load = async function () {
        res.replaceChildren(skeleton('list'));
        const qs = [];
        if (st.q) qs.push('q=' + encodeURIComponent(st.q));
        if (st.region) qs.push('region=' + encodeURIComponent(st.region));
        try {
            const items = await authed('GET', '/local/market' + (qs.length ? '?' + qs.join('&') : ''));
            if (rid !== dashRenderId) return;
            if (!items.length) return res.replaceChildren(emptyState({ art: 'search', compact: true, title: "Mahsulot topilmadi", text: "Boshqa viloyat yoki nom bilan qidirib ko'ring. Yangi mahsulot Hub omboriga kelganda bu yerda paydo bo'ladi." }));
            const grid = el('div', 'lc-grid');
            items.forEach(function (it, i) { grid.appendChild(localCard(it, i)); });
            res.replaceChildren(grid);
        } catch (err) { if (err.status !== 401 && rid === dashRenderId) res.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), load)); }
    };
    let t = null;
    input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { st.q = input.value.trim(); load(); }, 280); });
    sel.addEventListener('change', function () { st.region = sel.value; load(); });
    dashContent.replaceChildren(head, sw, res);
    cartBadge();
    load();
}

async function renderCartTab(user) {
    const rid = ++dashRenderId;
    const lines = cartGet();
    const head = sectionTitle('Savatcha', T("Har bir mahsulot alohida buyurtma bo'ladi: o'z escrow to'lovi va kuryer yetkazishi bilan"));
    if (!lines.length) {
        return dashContent.replaceChildren(head, emptyState({ art: 'listings', compact: true, title: "Savatchangiz bo'sh", text: "Mahalliy bozordan mahsulot tanlab, «Savatga» tugmasini bosing.", cta: { label: 'Mahalliy bozorga o\'tish', icon: 'fa-basket-shopping', fn: function () { selectDashTab('lmarket'); } } }));
    }
    dashContent.replaceChildren(head, skeleton('list'));
    // Har bir qator uchun jonli narx hisobi
    const quotes = await Promise.all(lines.map(function (l) {
        return apiRequest('GET', '/local/quote?productId=' + encodeURIComponent(l.productId) + '&quantityKg=' + encodeURIComponent(l.quantityKg)).then(function (q) { return { q: q }; }, function (e) { return { err: lcErr(e) }; });
    }));
    if (rid !== dashRenderId) return;
    const nodes = [head];
    const sum = { productAmount: 0, hubFee: 0, courierFee: 0, serviceFee: 0, totalPrice: 0 };
    let bad = false;
    lines.forEach(function (l, i) {
        const r = quotes[i];
        const card = el('div', 'glass rounded-2xl border border-white/10 p-4 space-y-3');
        const top = el('div', 'flex items-start justify-between gap-3');
        const tt = el('div', 'min-w-0');
        tt.appendChild(el('div', 'font-extrabold text-white break-words', l.name));
        tt.appendChild(el('div', 'text-xs text-slate-400', '🏬 ' + l.hub + ' · ' + T("{0} so'm / kg", formatNumber(l.pricePerKg))));
        top.appendChild(tt);
        const rm = el('button', 'text-slate-400 hover:text-rose-300 text-sm', '✕'); rm.type = 'button'; rm.setAttribute('aria-label', T("O'chirish"));
        rm.addEventListener('click', function () { cartSet(cartGet().filter(function (x) { return x.productId !== l.productId; })); renderCartTab(user); });
        top.appendChild(rm);
        card.appendChild(top);
        const stp = el('div', 'flex items-center gap-2');
        const setQ = function (q) { const list = cartGet(); const h = list.filter(function (x) { return x.productId === l.productId; })[0]; if (h) { h.quantityKg = Math.max(l.minOrderKg, Math.min(l.maxOrderKg, q)); cartSet(list); renderCartTab(user); } };
        const minus = el('button', 'lc-step', '−'); minus.type = 'button'; minus.addEventListener('click', function () { setQ(l.quantityKg - (l.minOrderKg >= 10 ? 5 : 1)); });
        const plus = el('button', 'lc-step', '+'); plus.type = 'button'; plus.addEventListener('click', function () { setQ(l.quantityKg + (l.minOrderKg >= 10 ? 5 : 1)); });
        stp.appendChild(minus); stp.appendChild(el('div', 'min-w-[5rem] text-center font-extrabold text-white', lcKg(l.quantityKg))); stp.appendChild(plus);
        card.appendChild(stp);
        if (r.q) {
            ['productAmount', 'hubFee', 'courierFee', 'serviceFee', 'totalPrice'].forEach(function (k) { sum[k] += r.q[k]; });
            card.appendChild(el('div', 'text-sm text-slate-300', T('Qator jami: {0}', bdMoney(r.q.totalPrice))));
        } else { bad = true; card.appendChild(el('div', 'text-sm text-rose-300', r.err)); }
        nodes.push(card);
    });
    nodes.push(lcBreakdown(sum, T('{0} ta mahsulot', lines.length)));
    if (!lcRequireConsumerSilent(user)) {
        nodes.push(el('p', 'text-sm text-amber-300', T("Buyurtma berish uchun «Xaridor» akkauntidan kiring.")));
        return dashContent.replaceChildren.apply(dashContent, nodes);
    }
    const form = el('form', 'glass rounded-3xl border border-white/10 p-5 space-y-3');
    form.noValidate = true;
    form.appendChild(el('div', 'text-xs font-bold uppercase tracking-wider text-emerald-300', T('Yetkazib berish')));
    const mk = function (ph, val, max, type) { const i = el('input', 'auth-input'); i.type = type || 'text'; i.placeholder = ph; i.value = val || ''; i.maxLength = max; i.setAttribute('aria-label', ph); return i; };
    const dist = mk(T('Tuman / mahalla'), user.consumer && user.consumer.district, 80), addr = mk(T("Ko'cha, uy, xonadon"), user.consumer && user.consumer.address, 200), phone = mk('+998 90 123 45 67', user.phone, 20, 'tel'), note = mk(T('Izoh (ixtiyoriy)'), '', 300);
    [dist, addr, phone, note].forEach(function (i) { form.appendChild(i); });
    const alertBox = el('div', 'hidden rounded-2xl px-4 py-3 text-sm font-medium'); alertBox.setAttribute('role', 'alert');
    form.appendChild(alertBox);
    const pay = el('button', 'lc-btn solid w-full'); pay.type = 'submit'; pay.disabled = bad;
    pay.appendChild(el('i', 'fa-solid fa-lock')); pay.appendChild(el('span', '', T("To'lash va buyurtma berish: {0}", bdMoney(sum.totalPrice))));
    form.appendChild(pay);
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        hideAuthAlert(alertBox);
        const errors = [];
        if (dist.value.trim().length < 2) errors.push('Tuman yoki mahallani kiriting.');
        if (addr.value.trim().length < 5) errors.push("Manzilni to'liq kiriting.");
        const ph = normalizePhone(phone.value);
        if (!/^\+998\d{9}$/.test(ph)) errors.push(PHONE_ERR);
        if (errors.length) return showAuthAlert(errors, 'error', alertBox);
        pay.disabled = true;
        const failed = [];
        let okCount = 0;
        for (const l of cartGet()) {
            try {
                const body = { productId: l.productId, quantityKg: l.quantityKg, district: dist.value.trim(), address: addr.value.trim(), phone: ph };
                if (note.value.trim()) body.note = note.value.trim();
                await authed('POST', '/local/orders', body);
                okCount++;
                cartSet(cartGet().filter(function (x) { return x.productId !== l.productId; }));
            } catch (err) { if (err.status === 401) return; failed.push(l.name + ': ' + lcErr(err)); }
        }
        if (failed.length) { showAuthAlert(failed, 'error', alertBox); pay.disabled = false; if (okCount) showToast(T('Qabul qilindi: {0} ta buyurtma', okCount), 3500, 'success'); return; }
        showSuccessCheck(T('Buyurtmalar qabul qilindi!'), T("Topshirish kodlari «Buyurtmalarim» bo'limida."), 'booking');
        selectDashTab('lorders');
    });
    nodes.push(form);
    dashContent.replaceChildren.apply(dashContent, nodes);
}
function lcRequireConsumerSilent(u) { return !!u && u.role === 'CONSUMER'; }

// Buyurtma kartochkasi (xaridor): holat, kod, kuryer, pul taqsimoti, amallar
function consumerOrderCard(o, reload) {
    const card = el('article', 'glass rounded-2xl border border-white/10 p-4 space-y-3');
    const top = el('div', 'flex items-start justify-between gap-3');
    const tt = el('div', 'min-w-0');
    tt.appendChild(el('h4', 'font-extrabold text-white text-lg break-words', o.productName));
    tt.appendChild(el('p', 'text-xs text-slate-400', lcKg(o.quantityKg) + ' · ' + T("{0} so'm / kg", formatNumber(o.pricePerKg)) + ' · ' + formatDateTime(o.createdAt)));
    top.appendChild(tt); top.appendChild(lcStatusChip(o.status));
    card.appendChild(top);
    card.appendChild(lcSteps(o.status));
    card.appendChild(el('p', 'text-xs text-slate-400', '🏬 ' + o.hub.name + ' → 📍 ' + o.deliveryAddress));
    if (o.deliveryCode) {
        const code = el('div', 'lc-code');
        const l = el('div', 'min-w-0');
        l.appendChild(el('div', 'text-xs font-bold uppercase tracking-wider text-amber-200', T('Topshirish kodi')));
        l.appendChild(el('div', 'text-[11px] text-amber-100/80', T("Faqat kuryer buyurtmani topshirganda ayting")));
        code.appendChild(l); code.appendChild(el('b', '', o.deliveryCode));
        card.appendChild(code);
    }
    if (o.courier) card.appendChild(el('p', 'text-sm text-sky-200', '🛵 ' + o.courier.name + ' · ' + o.courier.phone));
    if (o.cancelReason && o.status === 'CANCELLED') card.appendChild(el('p', 'text-xs text-slate-400', T('Sabab: {0}', o.cancelReason)));
    card.appendChild(lcBreakdown(o, lcKg(o.quantityKg)));
    card.appendChild(lcSplits(o));
    const act = el('div', 'flex flex-wrap gap-2');
    if (o.canConfirm) act.appendChild(actionBtn('fa-check', 'Qabul qildim', true, async function () {
        try { await authed('POST', '/local/orders/' + o.id + '/confirm'); showToast(T('Buyurtma yakunlandi. Rahmat!'), 3000, 'success'); reload(); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4000, 'error'); }
    }));
    if (o.canCancel) act.appendChild(actionBtn('fa-ban', 'Bekor qilish', false, async function () {
        if (!confirm(T("Buyurtmani bekor qilasizmi? To'lov to'liq qaytariladi."))) return;
        try { await authed('POST', '/local/orders/' + o.id + '/cancel', {}); showToast(T("Bekor qilindi, mablag' qaytarildi."), 3500); reload(); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4000, 'error'); }
    }));
    if (act.children.length) card.appendChild(act);
    return card;
}
let lcPoll = null;
async function renderLocalOrdersTab(user) {
    const rid = ++dashRenderId;
    clearInterval(lcPoll);
    const head = el('div', 'flex flex-wrap items-center justify-between gap-3');
    head.appendChild(sectionTitle('Buyurtmalarim', T("Holat, topshirish kodi va pul taqsimoti real vaqtda yangilanadi")));
    head.appendChild(refreshButton(function () { renderLocalOrdersTab(user); }));
    const res = el('div', 'space-y-4');
    dashContent.replaceChildren(head, res);
    const load = async function (silent) {
        if (!silent) res.replaceChildren(skeleton('list'));
        try {
            const list = await authed('GET', '/local/orders/mine');
            if (rid !== dashRenderId) return;
            setTabBadge('lorders', list.filter(function (o) { return o.status === 'DELIVERING'; }).length);
            if (!list.length) return res.replaceChildren(emptyState({ art: 'bookings', compact: true, title: "Hali buyurtma bermagansiz", text: "Mahalliy bozordan 10 kg dan buyurtma qiling.", cta: { label: 'Mahalliy bozor', icon: 'fa-basket-shopping', fn: function () { selectDashTab('lmarket'); } } }));
            res.replaceChildren.apply(res, list.map(function (o) { return consumerOrderCard(o, function () { load(); }); }));
        } catch (err) { if (err.status !== 401 && rid === dashRenderId) res.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), function () { load(); })); }
    };
    await load();
    lcPoll = setInterval(function () { if (dashTab !== 'lorders' || rid !== dashRenderId) return clearInterval(lcPoll); load(true); }, 20000);
}

// ---------- Fermer: Hub ombori orqali sotish ----------
function hubSteps() {
    const box = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-3');
    [['fa-truck-ramp-box', "1. Hub'ga topshiring", "Yirik partiyani (masalan, 1 tonna) viloyatingizdagi Hub omboriga olib boring."],
     ['fa-clipboard-check', '2. Hub qabul qiladi', "Ombor vaznni tekshirib qabul qiladi, qoldiq balansga yoziladi."],
     ['fa-basket-shopping', '3. Aholiga sotiladi', "Xaridorlar 10 kg dan buyurtma qiladi, kuryer shahar ichida yetkazadi."],
     ['fa-wallet', "4. Pul sizga o'tadi", "To'lov Escrow'da turadi; yetkazilgach mahsulot puli to'liq hisobingizga o'tadi."]].forEach(function (s) {
        const c = el('div', 'glass rounded-2xl border border-white/10 p-3 space-y-1.5');
        c.appendChild(el('i', 'fa-solid text-emerald-400 ' + s[0]));
        c.appendChild(el('div', 'font-extrabold text-white text-sm', T(s[1])));
        c.appendChild(el('p', 'text-xs text-slate-400 leading-relaxed', T(s[2])));
        box.appendChild(c);
    });
    return box;
}
async function renderDashHub(user) {
    const rid = ++dashRenderId;
    dashContent.replaceChildren(skeleton('list'));
    let products, hubs, intakes, sales;
    try {
        const all = await Promise.all([authed('GET', '/hub/retail'), authed('GET', '/hubs'), authed('GET', '/hub/intakes'), authed('GET', '/local/farmer/orders')]);
        products = all[0]; hubs = all[1]; intakes = all[2]; sales = all[3];
    } catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), function () { renderDashHub(user); })); }
    if (rid !== dashRenderId) return;
    const head = el('div', 'flex flex-wrap items-center justify-between gap-3');
    head.appendChild(sectionTitle("Hub ombori orqali sotish", T("Mahsulotingizni Hub omboriga topshiring va mahalliy aholiga chakana soting")));
    head.appendChild(refreshButton(function () { renderDashHub(user); }));
    const nodes = [head, hubSteps()];
    nodes.push(el('h3', 'text-lg font-extrabold text-white mt-2', T('Mening mahsulotlarim')));
    if (!products.length) nodes.push(emptyState({ art: 'listings', compact: true, title: "Mahsulot yo'q", text: "Avval «Mening e'lonlarim» bo'limida mahsulot joylang.", cta: { label: "E'lon joylash", icon: 'fa-plus', fn: function () { openProductModal(); } } }));
    const grid = el('div', 'lc-grid');
    products.forEach(function (p, i) { grid.appendChild(hubProductCard(p, hubs, i)); });
    if (products.length) nodes.push(grid);
    const pending = intakes.filter(function (x) { return x.status === 'ANNOUNCED'; });
    if (intakes.length) {
        nodes.push(el('h3', 'text-lg font-extrabold text-white mt-4', T("Topshirishlar tarixi")));
        const list = el('div', 'space-y-2');
        intakes.slice(0, 12).forEach(function (x) {
            const r = el('div', 'glass rounded-xl border border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2');
            const l = el('div', 'min-w-0 text-sm');
            l.appendChild(el('div', 'font-bold text-white', x.productName + ' · ' + lcKg(x.receivedKg !== null ? x.receivedKg : x.declaredKg)));
            l.appendChild(el('div', 'text-xs text-slate-400', '🏬 ' + x.hub.name + ' · ' + formatDateTime(x.createdAt) + (x.note ? ' · ' + x.note : '')));
            r.appendChild(l);
            const rt = el('div', 'flex items-center gap-2');
            const meta = { ANNOUNCED: ["Hub qabulini kutmoqda", 'text-amber-300'], RECEIVED: ['Qabul qilindi', 'text-emerald-300'], REJECTED: ['Rad etildi', 'text-rose-300'], CANCELLED: ['Bekor qilindi', 'text-slate-400'] }[x.status];
            rt.appendChild(el('span', ['text-xs font-bold', meta[1]].join(' '), T(meta[0])));
            if (x.status === 'ANNOUNCED') rt.appendChild(actionBtn('fa-xmark', 'Bekor qilish', false, async function () { try { await authed('POST', '/hub/intakes/' + x.id + '/cancel'); renderDashHub(user); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4000, 'error'); } }));
            r.appendChild(rt);
            list.appendChild(r);
        });
        nodes.push(list);
    }
    void pending;
    nodes.push(el('h3', 'text-lg font-extrabold text-white mt-4', T('Chakana sotuvlar va pul oqimi')));
    if (!sales.length) nodes.push(el('p', 'text-sm text-slate-400', T("Hali chakana buyurtma yo'q. Hub omboriga mahsulot topshirib, sotuvni yoqing.")));
    sales.forEach(function (o) {
        const c = el('div', 'glass rounded-2xl border border-white/10 p-4 space-y-2');
        const top = el('div', 'flex items-start justify-between gap-3');
        top.appendChild(el('div', 'min-w-0 font-bold text-white', o.productName + ' · ' + lcKg(o.quantityKg) + ' · ' + o.consumerName));
        top.appendChild(lcStatusChip(o.status));
        c.appendChild(top);
        c.appendChild(el('div', 'text-sm text-emerald-300 font-extrabold', T('Sizga: {0}', bdMoney(o.farmerAmount)) + ' · ' + T(o.status === 'COMPLETED' ? "hisobingizga o'tkazildi" : o.status === 'CANCELLED' ? 'bekor qilindi' : "Escrow'da: yetkazilgach o'tadi")));
        c.appendChild(lcSplits(o));
        nodes.push(c);
    });
    dashContent.replaceChildren.apply(dashContent, nodes);
}
function hubProductCard(p, hubs, i) {
    const c = el('article', 'lc-card');
    c.style.setProperty('--i', String(Math.min(i, 12)));
    const top = el('div', 'flex items-start justify-between gap-2');
    const tt = el('div', 'min-w-0');
    tt.appendChild(el('h3', 'font-extrabold text-white text-lg break-words', p.name));
    tt.appendChild(el('p', 'text-xs text-slate-400', p.category + ' · ' + T("Omborimda (B2B): {0}", lcKg(p.quantityKg))));
    top.appendChild(tt);
    top.appendChild(el('span', ['shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border', p.isRetail ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-slate-500/20 text-slate-300 border-slate-500/30'].join(' '), p.isRetail ? T('Chakana sotuvda') : T('Chakana sotuv o\'chiq')));
    c.appendChild(top);
    if (p.hubStock && p.hub) {
        c.appendChild(el('div', 'text-xs text-sky-300 font-semibold', '🏬 ' + p.hub.name));
        const bar = el('div', 'lc-bar'); const a = el('i', 'a'); a.style.width = (p.hubStock.weightKg ? (p.hubStock.availableKg / p.hubStock.weightKg * 100) : 0) + '%'; const r = el('i', 'r'); r.style.width = (p.hubStock.weightKg ? (p.hubStock.reservedKg / p.hubStock.weightKg * 100) : 0) + '%'; bar.appendChild(a); bar.appendChild(r);
        c.appendChild(bar);
        c.appendChild(el('div', 'text-xs text-slate-300', T('Hub omborida: {0} · sotuvga tayyor: {1} · band: {2}', lcKg(p.hubStock.weightKg), lcKg(p.hubStock.availableKg), lcKg(p.hubStock.reservedKg))));
        c.appendChild(el('div', 'text-xs text-slate-400', T("Chakana narx: {0} so'm/kg · eng kam: {1}", formatNumber(p.retailPricePerKg || 0), lcKg(p.minOrderKg || 10))));
    }
    if (p.pendingIntakes.length) c.appendChild(el('div', 'text-xs text-amber-300', T('Hub qabulini kutmoqda: {0}', lcKg(p.pendingIntakes.reduce(function (a, x) { return a + x.declaredKg; }, 0)))));
    const act = el('div', 'flex flex-wrap gap-2 mt-auto pt-1');
    act.appendChild(actionBtn('fa-truck-ramp-box', "Hub'ga topshirish", true, function () { openIntakeForm(p, hubs); }));
    if (p.hubStock) {
        act.appendChild(actionBtn(p.isRetail ? 'fa-pause' : 'fa-play', p.isRetail ? "Sotuvni to'xtatish" : 'Sotuvni yoqish', false, async function () {
            try { await authed('PATCH', '/hub/retail/' + p.id, { isRetail: !p.isRetail }); renderDashHub(currentUser()); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4000, 'error'); }
        }));
        act.appendChild(actionBtn('fa-tag', 'Narxni o\'zgartirish', false, function () {
            openWhForm({ title: "Chakana narx va minimum", sub: p.name, fields: [
                { name: 'retailPricePerKg', label: "Chakana narx (so'm / kg)", type: 'number', required: true, min: 1, value: p.retailPricePerKg || '' },
                { name: 'minOrderKg', label: 'Eng kam buyurtma (kg)', type: 'number', required: true, min: 1, value: p.minOrderKg || 10 }
            ], onSubmit: function (v) { return authed('PATCH', '/hub/retail/' + p.id, { retailPricePerKg: v.retailPricePerKg, minOrderKg: v.minOrderKg }); }, done: 'Saqlandi.' });
        }));
    }
    c.appendChild(act);
    return c;
}
function openIntakeForm(p, hubs) {
    const active = hubs.filter(function (h) { return h.isActive; });
    if (!active.length) return showToast(T("Hozircha faol Hub ombori yo'q."), 4000, 'error');
    openWhForm({
        title: "Hub omboriga topshirish", sub: p.name + ' · ' + T('Sizda mavjud: {0}', lcKg(p.quantityKg)), icon: 'fa-truck-ramp-box', submit: "Topshirishni e'lon qilish",
        fields: [
            { name: 'hubId', label: 'Hub ombori', type: 'select', options: active.map(function (h) { return [h.id, h.name + ' — ' + h.region]; }), value: p.hub ? p.hub.id : active[0].id },
            { name: 'declaredKg', label: 'Topshiriladigan miqdor (kg)', type: 'number', required: true, min: 1, max: p.quantityKg, value: Math.min(p.quantityKg, 1000), hint: "Haqiqiy vaznni Hub qabul paytida tekshiradi." },
            { name: 'retailPricePerKg', label: "Chakana narx (so'm / kg)", type: 'number', required: true, min: 1, value: p.retailPricePerKg || Math.round(p.pricePerKg * 1.4), hint: "Xaridorlar shu narxda oladi. Hub haqi, kuryer va platforma haqi xaridordan alohida olinadi — sizga to'liq shu narx o'tadi." },
            { name: 'minOrderKg', label: 'Eng kam buyurtma (kg)', type: 'number', min: 1, value: p.minOrderKg || 10 }
        ],
        onSubmit: function (v) { const body = { productId: p.id, hubId: v.hubId, declaredKg: v.declaredKg, retailPricePerKg: v.retailPricePerKg }; if (v.minOrderKg) body.minOrderKg = v.minOrderKg; return authed('POST', '/hub/intakes', body); },
        done: "Topshirish e'lon qilindi. Mahsulotni Hub omboriga olib boring."
    });
}

// ---------- Hub xodimi / administrator: chakana buyurtmalar, qabul, qoldiq ----------
const hubOps = { tab: 'orders', hubId: '' };
async function renderHubOps(user) {
    const rid = ++dashRenderId;
    const head = el('div', 'flex flex-wrap items-center justify-between gap-3');
    head.appendChild(sectionTitle('Hub: chakana savdo', T("Qabul, qoldiq va mahalliy buyurtmalarni boshqarish")));
    head.appendChild(refreshButton(function () { renderHubOps(user); }));
    const tabs = el('div', 'flex flex-wrap gap-2');
    [['orders', 'Buyurtmalar'], ['intakes', 'Qabul'], ['stock', 'Qoldiq']].forEach(function (t) {
        const b = el('button', ['dp-pill', hubOps.tab === t[0] ? 'on' : ''].join(' ').trim(), T(t[1])); b.type = 'button';
        b.addEventListener('click', function () { hubOps.tab = t[0]; renderHubOps(user); });
        tabs.appendChild(b);
    });
    const body = el('div', 'space-y-3');
    dashContent.replaceChildren(head, tabs, body);
    body.appendChild(skeleton('list'));
    const qs = hubOps.hubId ? '?hubId=' + encodeURIComponent(hubOps.hubId) : '';
    try {
        if (hubOps.tab === 'orders') {
            const list = await authed('GET', '/local/hub/orders' + qs);
            if (rid !== dashRenderId) return;
            setTabBadge('hubops', list.filter(function (o) { return o.status === 'PENDING'; }).length);
            if (!list.length) return body.replaceChildren(emptyState({ art: 'bookings', compact: true, title: "Chakana buyurtma yo'q", text: "Xaridorlar buyurtma berganda shu yerda paydo bo'ladi." }));
            body.replaceChildren.apply(body, list.map(function (o) { return hubOrderCard(o, user); }));
        } else if (hubOps.tab === 'intakes') {
            const list = await authed('GET', '/hub/intakes' + qs);
            if (rid !== dashRenderId) return;
            if (!list.length) return body.replaceChildren(emptyState({ art: 'listings', compact: true, title: "Topshirishlar yo'q", text: "Fermerlar Hub'ga mahsulot topshirishni e'lon qilganda shu yerda ko'rinadi." }));
            body.replaceChildren.apply(body, list.map(function (x) { return hubIntakeCard(x, user); }));
        } else {
            const list = await authed('GET', '/hub/stock' + qs);
            if (rid !== dashRenderId) return;
            if (!list.length) return body.replaceChildren(emptyState({ art: 'listings', compact: true, title: "Omborda qoldiq yo'q", text: "Birinchi topshirishni qabul qilgach qoldiq shu yerda ko'rinadi." }));
            body.replaceChildren.apply(body, list.map(function (s) { return hubStockCard(s); }));
        }
    } catch (err) { if (err.status !== 401 && rid === dashRenderId) body.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), function () { renderHubOps(user); })); }
}
function hubOrderCard(o, user) {
    const card = el('article', 'glass rounded-2xl border border-white/10 p-4 space-y-3');
    const top = el('div', 'flex items-start justify-between gap-3');
    const tt = el('div', 'min-w-0');
    tt.appendChild(el('h4', 'font-extrabold text-white break-words', o.productName + ' · ' + lcKg(o.quantityKg)));
    tt.appendChild(el('p', 'text-xs text-slate-400', o.consumerName + ' · ' + o.contactPhone + ' · ' + formatDateTime(o.createdAt)));
    top.appendChild(tt); top.appendChild(lcStatusChip(o.status));
    card.appendChild(top);
    card.appendChild(lcSteps(o.status));
    card.appendChild(el('p', 'text-xs text-slate-300', '📍 ' + o.deliveryAddress + (o.note ? ' · 💬 ' + o.note : '')));
    if (o.status === 'PACKING') card.appendChild(el('p', 'text-xs font-bold ' + (o.packed ? 'text-emerald-300' : 'text-amber-300'), o.packed ? T('Tayyor: kuryer kutilmoqda') : T('Qadoqlash jarayonida')));
    if (o.courier) card.appendChild(el('p', 'text-xs text-sky-200', '🛵 ' + o.courier.name + ' · ' + o.courier.phone));
    card.appendChild(lcSplits(o));
    const act = el('div', 'flex flex-wrap gap-2');
    const run = function (path, body) { return async function () { try { await authed('POST', path, body); renderHubOps(user); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4000, 'error'); } }; };
    if (o.status === 'PENDING') act.appendChild(actionBtn('fa-box', 'Qadoqlashni boshlash', true, run('/local/orders/' + o.id + '/pack-start')));
    if (o.status === 'PACKING' && !o.packed) act.appendChild(actionBtn('fa-check', 'Tayyor (kuryerga)', true, run('/local/orders/' + o.id + '/packed')));
    if (o.status === 'PENDING' || o.status === 'PACKING' || (o.status === 'DELIVERING' && user.role === 'ADMIN')) {
        act.appendChild(actionBtn('fa-ban', 'Bekor qilish', false, function () {
            openWhForm({ title: 'Buyurtmani bekor qilish', sub: T("To'lov xaridorga to'liq qaytariladi, qoldiq omborga qaytadi."), submit: 'Bekor qilish', icon: 'fa-ban',
                fields: [{ name: 'reason', label: 'Sabab', required: true, maxLength: 300 }],
                onSubmit: function (v) { return authed('POST', '/local/orders/' + o.id + '/cancel', { reason: v.reason }); }, done: 'Buyurtma bekor qilindi.' });
        }));
    }
    if (act.children.length) card.appendChild(act);
    return card;
}
function hubIntakeCard(x, user) {
    const c = el('div', 'glass rounded-2xl border border-white/10 p-4 space-y-2');
    const top = el('div', 'flex items-start justify-between gap-3');
    top.appendChild(el('div', 'min-w-0 font-bold text-white', x.productName + ' · ' + x.farmName));
    const meta = { ANNOUNCED: ['Kutilmoqda', 'text-amber-300'], RECEIVED: ['Qabul qilindi', 'text-emerald-300'], REJECTED: ['Rad etildi', 'text-rose-300'], CANCELLED: ['Bekor', 'text-slate-400'] }[x.status];
    top.appendChild(el('span', ['text-xs font-bold', meta[1]].join(' '), T(meta[0])));
    c.appendChild(top);
    c.appendChild(el('div', 'text-xs text-slate-400', '🏬 ' + x.hub.name + ' · ' + T("E'lon qilingan: {0}", lcKg(x.declaredKg)) + (x.receivedKg !== null ? ' · ' + T('Qabul: {0}', lcKg(x.receivedKg)) : '') + ' · ' + formatDateTime(x.createdAt)));
    if (x.note) c.appendChild(el('div', 'text-xs text-slate-300', '💬 ' + x.note));
    if (x.status === 'ANNOUNCED') {
        const act = el('div', 'flex flex-wrap gap-2');
        act.appendChild(actionBtn('fa-clipboard-check', 'Qabul qilish', true, function () {
            openWhForm({ title: 'Mahsulotni qabul qilish', sub: x.productName + ' · ' + T("E'lon qilingan: {0}", lcKg(x.declaredKg)), submit: 'Qabul qilish', icon: 'fa-clipboard-check',
                fields: [{ name: 'receivedKg', label: 'Haqiqiy vazn (kg)', type: 'number', required: true, min: 0.01, max: x.declaredKg, value: x.declaredKg, hint: "Qoldiq balansga shu vazn yoziladi va fermer e'lonidagi miqdordan ayriladi." }, { name: 'note', label: 'Izoh (ixtiyoriy)', maxLength: 300 }],
                onSubmit: function (v) { return authed('POST', '/hub/intakes/' + x.id + '/receive', { receivedKg: v.receivedKg, note: v.note }); }, done: 'Qabul qilindi: qoldiq yangilandi.' });
        }));
        act.appendChild(actionBtn('fa-xmark', 'Rad etish', false, function () {
            openWhForm({ title: 'Topshirishni rad etish', sub: x.productName, submit: 'Rad etish', icon: 'fa-xmark', fields: [{ name: 'note', label: 'Sabab', required: true, maxLength: 300 }],
                onSubmit: function (v) { return authed('POST', '/hub/intakes/' + x.id + '/reject', { note: v.note }); }, done: 'Rad etildi.' });
        }));
        c.appendChild(act);
    }
    void user;
    return c;
}
function hubStockCard(s) {
    const c = el('div', 'glass rounded-2xl border border-white/10 p-4 space-y-2');
    const top = el('div', 'flex items-start justify-between gap-3');
    const tt = el('div', 'min-w-0');
    tt.appendChild(el('div', 'font-extrabold text-white', s.name + ' · ' + s.farmName));
    tt.appendChild(el('div', 'text-xs text-slate-400', '🏬 ' + s.hub.name + ' · ' + (s.isRetail ? T("Chakana sotuvda: {0} so'm/kg", formatNumber(s.retailPricePerKg || 0)) : T('Sotuv o\'chiq'))));
    top.appendChild(tt);
    top.appendChild(actionBtn('fa-sliders', 'Tuzatish', false, function () {
        openWhForm({ title: "Qoldiqni tuzatish", sub: s.name + ' · ' + T('Hozir: {0}', lcKg(s.weightKg)), submit: 'Saqlash', icon: 'fa-sliders',
            fields: [{ name: 'deltaKg', label: "O'zgarish (kg, kamaytirish uchun manfiy)", type: 'number', required: true, hint: "Masalan, yaroqsiz mahsulot: -5. Band qilingan miqdordan kam bo'lib qolmaydi." }, { name: 'note', label: 'Sabab', required: true, maxLength: 200 }],
            onSubmit: function (v) { return authed('POST', '/hub/stock/' + s.id + '/adjust', { deltaKg: v.deltaKg, note: v.note }); }, done: 'Qoldiq tuzatildi.' });
    }));
    c.appendChild(top);
    const bar = el('div', 'lc-bar'); const a = el('i', 'a'); a.style.width = (s.weightKg ? s.availableKg / s.weightKg * 100 : 0) + '%'; const r = el('i', 'r'); r.style.width = (s.weightKg ? s.reservedKg / s.weightKg * 100 : 0) + '%'; bar.appendChild(a); bar.appendChild(r);
    c.appendChild(bar);
    c.appendChild(el('div', 'text-sm text-slate-200', T('Omborda: {0} · sotuvga tayyor: {1} · buyurtmalarga band: {2}', lcKg(s.weightKg), lcKg(s.availableKg), lcKg(s.reservedKg))));
    const MV = { INTAKE: 'Qabul', RESERVE: 'Zaxira', RELEASE: 'Zaxira bo\'shadi', DISPATCH: 'Kuryerga chiqdi', RETURN: 'Omborga qaytdi', ADJUST: 'Tuzatish' };
    if (s.movements.length) c.appendChild(el('div', 'text-[11px] text-slate-500', s.movements.slice(0, 4).map(function (m) { return T(MV[m.type]) + ' ' + formatNumber(m.quantityKg) + ' kg'; }).join(' · ')));
    return c;
}

// ---------- Administrator: Hub'lar ----------
async function renderAdmHubs(user) {
    const rid = ++dashRenderId;
    dashContent.replaceChildren(skeleton('list'));
    let hubs, staff;
    try { const all = await Promise.all([authed('GET', '/hubs'), authed('GET', '/admin/users?role=DISPATCHER&limit=100')]); hubs = all[0]; staff = all[1].items; }
    catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), function () { renderAdmHubs(user); })); }
    if (rid !== dashRenderId) return;
    const head = el('div', 'flex flex-wrap items-center justify-between gap-3');
    head.appendChild(sectionTitle('Hub omborlar', T("Viloyat omborlari va ularning xodimlari")));
    const btns = el('div', 'flex gap-2');
    btns.appendChild(refreshButton(function () { renderAdmHubs(user); }));
    btns.appendChild(actionBtn('fa-plus', "Hub qo'shish", true, function () {
        openWhForm({ title: "Yangi Hub ombori", submit: 'Yaratish', icon: 'fa-warehouse', fields: [
            { name: 'name', label: 'Nomi', required: true, maxLength: 80, placeholder: 'Samarqand Hub' },
            { name: 'region', label: 'Viloyat', type: 'select', options: REGIONS.map(function (r) { return [r, r]; }), value: 'Samarqand' },
            { name: 'district', label: 'Tuman / shahar', maxLength: 80 }, { name: 'address', label: 'Manzil', maxLength: 200 }],
            onSubmit: function (v) { return authed('POST', '/hubs', { name: v.name, region: v.region, district: v.district, address: v.address }); }, done: 'Hub yaratildi.' });
    }));
    head.appendChild(btns);
    const nodes = [head];
    if (!hubs.length) nodes.push(emptyState({ art: 'listings', compact: true, title: "Hub yo'q", text: "Birinchi Hub omborini yarating, so'ng dispetcher xodimni biriktiring." }));
    hubs.forEach(function (h) {
        const c = el('div', 'glass rounded-2xl border border-white/10 p-4 space-y-3');
        const top = el('div', 'flex items-start justify-between gap-3');
        const tt = el('div', 'min-w-0');
        tt.appendChild(el('div', 'font-extrabold text-white text-lg', '🏬 ' + h.name));
        tt.appendChild(el('div', 'text-xs text-slate-400', [h.region, h.district, h.address].filter(Boolean).join(' · ')));
        top.appendChild(tt);
        top.appendChild(el('span', ['shrink-0 text-xs font-bold', h.isActive ? 'text-emerald-300' : 'text-slate-400'].join(' '), h.isActive ? T('Faol') : T('Faol emas')));
        c.appendChild(top);
        const mine = staff.filter(function (s) { return s.hubId === h.id; });
        c.appendChild(el('div', 'text-xs text-slate-300', T('Xodimlar: {0}', mine.length ? mine.map(function (s) { return s.fullName; }).join(', ') : T('biriktirilmagan'))));
        const act = el('div', 'flex flex-wrap gap-2');
        act.appendChild(actionBtn('fa-user-plus', 'Xodim biriktirish', false, function () {
            const free = staff.filter(function (s) { return s.hubId !== h.id; });
            if (!free.length) return showToast(T("Biriktiriladigan dispetcher yo'q. Avval «Foydalanuvchilar» bo'limida dispetcher yarating."), 4500, 'error');
            openWhForm({ title: 'Xodim biriktirish', sub: h.name, submit: 'Biriktirish', icon: 'fa-user-plus', fields: [{ name: 'userId', label: 'Dispetcher', type: 'select', options: free.map(function (s) { return [s.id, s.fullName + ' · ' + s.phone]; }) }],
                onSubmit: function (v) { return authed('POST', '/hubs/' + h.id + '/staff', { userId: v.userId }); }, done: 'Biriktirildi.' });
        }));
        mine.forEach(function (s) { act.appendChild(actionBtn('fa-user-minus', s.fullName, false, async function () { try { await authed('DELETE', '/hubs/' + h.id + '/staff/' + s.id); renderAdmHubs(user); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4000, 'error'); } })); });
        act.appendChild(actionBtn(h.isActive ? 'fa-eye-slash' : 'fa-eye', h.isActive ? "O'chirish" : 'Faollashtirish', false, async function () { try { await authed('PATCH', '/hubs/' + h.id, { isActive: !h.isActive }); renderAdmHubs(user); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4000, 'error'); } }));
        c.appendChild(act);
        nodes.push(c);
    });
    dashContent.replaceChildren.apply(dashContent, nodes);
}

// ---------- Haydovchi: Shahar ichi kuryeri ----------
async function renderCourierTab(user) {
    const rid = ++dashRenderId;
    dashContent.replaceChildren(skeleton('list'));
    let me, hubs, avail, mine;
    try {
        const all = await Promise.all([authed('GET', '/local/courier/me'), authed('GET', '/hubs'), authed('GET', '/local/courier/available'), authed('GET', '/local/courier/mine')]);
        me = all[0]; hubs = all[1]; avail = all[2]; mine = all[3];
    } catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), function () { renderCourierTab(user); })); }
    if (rid !== dashRenderId) return;
    const head = el('div', 'flex flex-wrap items-center justify-between gap-3');
    head.appendChild(sectionTitle('Shahar ichi kuryeri', T("Hub ombordan shahar ichidagi kichik buyurtmalarni yetkazing: har buyurtma uchun qat'iy haq")));
    head.appendChild(refreshButton(function () { renderCourierTab(user); }));
    const mode = el('div', 'glass rounded-2xl border border-white/10 p-4 space-y-3');
    mode.appendChild(el('div', 'font-extrabold text-white', me.courierMode ? '🟢 ' + T('Kuryer rejimi yoqilgan') : '⚪ ' + T('Kuryer rejimi o\'chiq')));
    mode.appendChild(el('p', 'text-xs text-slate-400', T("Yetkazish haqi: {0} (buyurtma topshirilgach, Escrow'dan avtomatik o'tadi). Bir vaqtda {1} tagacha buyurtma olasiz.", bdMoney(me.courierFee), me.maxActive)));
    const mr = el('div', 'flex flex-wrap items-center gap-2');
    const active = hubs.filter(function (h) { return h.isActive && normRegionClient(h.region) === normRegionClient(user.driver ? user.driver.region : ''); });
    const sel = el('select', 'auth-input sm:!w-auto sm:min-w-[14rem]'); sel.setAttribute('aria-label', T('Hub ombori'));
    if (!active.length) sel.appendChild(new Option(T("Viloyatingizda Hub yo'q"), ''));
    active.forEach(function (h) { sel.appendChild(new Option(h.name, h.id)); });
    if (me.hub) sel.value = me.hub.id;
    mr.appendChild(sel);
    mr.appendChild(actionBtn(me.courierMode ? 'fa-toggle-on' : 'fa-toggle-off', me.courierMode ? "Rejimni o'chirish" : 'Kuryer bo\'lish', !me.courierMode, async function () {
        try { await authed('PATCH', '/local/courier/mode', { enabled: !me.courierMode, hubId: sel.value || undefined }); renderCourierTab(user); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4500, 'error'); }
    }));
    mode.appendChild(mr);
    const nodes = [head, mode];
    if (me.courierMode) {
        nodes.push(el('h3', 'text-lg font-extrabold text-white', T('Tayyor buyurtmalar')));
        if (!avail.length) nodes.push(el('p', 'text-sm text-slate-400', T("Hozircha tayyor buyurtma yo'q. Hub qadoqlab bo'lgach shu yerda paydo bo'ladi.")));
        avail.forEach(function (o) {
            const c = el('article', 'glass rounded-2xl border border-white/10 p-4 space-y-2');
            const top = el('div', 'flex items-start justify-between gap-3');
            top.appendChild(el('div', 'min-w-0 font-extrabold text-white', o.productName + ' · ' + lcKg(o.quantityKg)));
            top.appendChild(el('div', 'earn-amt !text-xl shrink-0', bdMoney(o.courierFee)));
            c.appendChild(top);
            c.appendChild(el('div', 'text-xs text-slate-300', '🏬 ' + o.hub.name + (o.hubAddress ? ' (' + o.hubAddress + ')' : '') + ' → 📍 ' + o.deliveryRegion + ', ' + o.deliveryDistrict));
            c.appendChild(el('div', 'text-[11px] text-slate-500', T("Aniq manzil va telefon buyurtmani olgandan keyin ochiladi.")));
            c.appendChild(actionBtn('fa-hand', 'Buyurtmani olish', true, async function () { try { await authed('POST', '/local/orders/' + o.id + '/accept'); renderCourierTab(user); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4500, 'error'); } }));
            nodes.push(c);
        });
    }
    const myActive = mine.filter(function (o) { return o.status === 'DELIVERING'; });
    nodes.push(el('h3', 'text-lg font-extrabold text-white mt-2', T("Yo'ldagi buyurtmalarim")));
    if (!myActive.length) nodes.push(el('p', 'text-sm text-slate-400', T("Hozir yo'lda buyurtma yo'q.")));
    myActive.forEach(function (o) {
        const c = el('article', 'glass rounded-2xl border border-violet-500/30 p-4 space-y-2');
        c.appendChild(el('div', 'font-extrabold text-white', o.productName + ' · ' + lcKg(o.quantityKg)));
        c.appendChild(el('div', 'text-sm text-slate-200', '📍 ' + o.deliveryDistrict + ', ' + o.deliveryAddress));
        c.appendChild(el('div', 'text-sm text-sky-200', '👤 ' + o.consumerName + ' · ' + o.contactPhone));
        if (o.note) c.appendChild(el('div', 'text-xs text-slate-400', '💬 ' + o.note));
        c.appendChild(el('div', 'text-xs text-emerald-300 font-bold', T("Yetkazib berish haqi: {0}", bdMoney(o.courierFee))));
        c.appendChild(actionBtn('fa-key', 'Kod bilan topshirish', true, function () {
            openWhForm({ title: 'Buyurtmani topshirish', sub: T("Xaridordan 4 xonali topshirish kodini oling"), submit: 'Topshirish', icon: 'fa-check',
                fields: [{ name: 'code', label: 'Topshirish kodi', required: true, maxLength: 4, placeholder: '0000' }],
                onSubmit: function (v) { return authed('POST', '/local/orders/' + o.id + '/deliver', { code: v.code }); }, done: "Yetkazildi! Yetkazish haqi hisobingizga o'tkazildi." });
        }));
        nodes.push(c);
    });
    const done = mine.filter(function (o) { return o.status === 'COMPLETED'; });
    if (done.length) nodes.push(el('p', 'text-xs text-slate-400 mt-2', T('Yakunlangan yetkazishlar: {0} · jami daromad: {1}', done.length, bdMoney(done.reduce(function (a, o) { return a + o.courierFee; }, 0)))));
    dashContent.replaceChildren.apply(dashContent, nodes);
}
const normRegionClient = function (s) { return String(s || '').trim().toLowerCase().replace(/[‘’`ʻʼ]/g, "'"); };

// Kabinet tablari ro'yxati (app.js selectDashTab shu obyektdan chaqiradi)
const LOCAL_TABS = {
    lmarket: renderLocalMarketTab, lcart: renderCartTab, lorders: renderLocalOrdersTab,
    hub: renderDashHub, hubops: renderHubOps, 'adm-hubs': renderAdmHubs, courier: renderCourierTab
};
