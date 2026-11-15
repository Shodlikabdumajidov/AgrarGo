/* ===== Agro-Logistika Yangiliklari va rolga mos AI maslahat =====
 * Server: GET /news (ochiq; token bo'lsa roliga mos `aiInsight`, Admin/Dispetcherga `aiInsights`), POST/PATCH/DELETE /news (ADMIN, DISPATCHER).
 * Mehmonga ai_insight maydonlari serverdan UMUMAN kelmaydi: yopiq blokda faqat bezak chiziqlar ko'rsatiladi.
 * Bosh sahifa (#news) va kabinet bo'limi (LOCAL_TABS.news) shu faylda. Umumiy yordamchilar (el, authed, apiRequest, sectionTitle ...) app.js'dan.
 */

const NW_CATS = {
    ROADS: ['fa-road', "Yo'llar"],
    AGRO: ['fa-seedling', "Qishloq xo'jaligi"],
    MARKET: ['fa-chart-line', 'Bozorlar'],
    LOGISTICS: ['fa-truck-fast', 'Yuk tashish']
};
const NW_ROLE_NAMES = { FARMER: 'Fermer', DRIVER: 'Haydovchi', MARKET: 'Market', ADMIN: 'Admin' };
const NW_STAFF = ['ADMIN', 'DISPATCHER'];
const NW_REGIONS = ['Respublika', 'Toshkent', 'Toshkent viloyati', 'Samarqand', "Farg'ona", 'Andijon', 'Namangan', 'Buxoro', 'Navoiy', 'Jizzax', 'Sirdaryo', 'Qashqadaryo', 'Surxondaryo', 'Xorazm', "Qoraqalpog'iston"];

const nwState = { home: { items: [], cat: '', loaded: false, failed: false }, cab: { items: [], regions: [], cat: '', region: '', loaded: false } };

function nwLang() { const l = (window.I18N && I18N.lang) || 'uz'; return l === 'ru' || l === 'en' ? l : 'uz'; }
function nwPick(obj, base) { const L = nwLang(); const k = base + L[0].toUpperCase() + L.slice(1); return obj[k] || obj[base + 'Uz'] || ''; }
function nwDate(iso) {
    const loc = nwLang() === 'ru' ? 'ru-RU' : nwLang() === 'en' ? 'en-GB' : 'uz-UZ';
    try { return new Date(iso).toLocaleDateString(loc, { day: 'numeric', month: 'short' }) + ', ' + new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}
function nwRegionLabel(r) { return T(r); }

/** AI blok (ochiq): faqat server bergan matn, joriy tilda */
function nwAiOpen(role, data) {
    const box = el('div', 'nw-ai open');
    box.dataset.role = role;
    const h = el('div', 'nw-ai-h');
    h.appendChild(el('span', '', T('✨ AI Maslahat ({0} uchun)', T(NW_ROLE_NAMES[role] || 'Admin'))));
    box.appendChild(h);
    box.appendChild(el('p', 'nw-ai-t', data[nwLang()] || data.uz || ''));
    return box;
}

/** AI blok (mehmon uchun yopiq): haqiqiy matn yo'q, faqat blur ostidagi bezak va kirish tugmasi */
function nwAiLocked() {
    const box = el('div', 'nw-ai locked');
    const bg = el('div', 'nw-lock-bg'); bg.setAttribute('aria-hidden', 'true');
    bg.appendChild(el('i')); bg.appendChild(el('i')); bg.appendChild(el('i')); bg.appendChild(el('i'));
    box.appendChild(bg);
    const fg = el('div', 'nw-lock-fg');
    const h = el('div', 'nw-lock-h'); h.appendChild(el('i', 'fa-solid fa-lock')); h.appendChild(el('span', '', T('✨ AI Agro-Tahlil va Maslahat')));
    fg.appendChild(h);
    fg.appendChild(el('p', 'nw-lock-p', T("Rolingizga mos AI ogohlantirish va yo'l tavsiyalarini ko'rish uchun tizimga kiring")));
    const b = el('button', 'nw-login'); b.type = 'button';
    b.appendChild(el('i', 'fa-solid fa-right-to-bracket')); b.appendChild(el('span', '', T("Kirish / Ro'yxatdan o'tish")));
    b.addEventListener('click', function () { openAuthModal('login'); });
    fg.appendChild(b);
    box.appendChild(fg);
    return box;
}

function nwCard(n, opts) {
    opts = opts || {};
    const card = el('article', 'nw-card'); card.dataset.id = n.id; card.dataset.cat = n.category;
    const meta = el('div', 'nw-meta');
    const c = NW_CATS[n.category] || NW_CATS.AGRO;
    const cat = el('span', 'nw-cat'); cat.dataset.c = n.category; cat.appendChild(el('i', 'fa-solid ' + c[0])); cat.appendChild(el('span', '', T(c[1]))); meta.appendChild(cat);
    const reg = el('span', 'nw-reg'); reg.appendChild(el('i', 'fa-solid fa-location-dot')); reg.appendChild(el('span', '', nwRegionLabel(n.region))); meta.appendChild(reg);
    if (n.isActive === false) meta.appendChild(el('span', 'nw-off', T('Yashirin')));
    meta.appendChild(el('span', 'nw-time', nwDate(n.publishedAt)));
    card.appendChild(meta);
    card.appendChild(el('h3', 'nw-title', nwPick(n, 'title')));
    card.appendChild(el('p', 'nw-sum', nwPick(n, 'summary')));
    // AI blok: server nima bergan bo'lsa — shuni ko'rsatamiz (mehmonda hech narsa yo'q → yopiq)
    if (n.aiInsight && n.aiInsight.role) card.appendChild(nwAiOpen(n.aiInsight.role, n.aiInsight));
    else if (n.aiInsights) ['farmer', 'driver', 'market'].forEach(function (r) { card.appendChild(nwAiOpen(r.toUpperCase(), n.aiInsights[r])); });
    else if (!opts.authed) card.appendChild(nwAiLocked());
    if (opts.staff) {
        const a = el('div', 'nw-actions');
        const tg = el('button', 'nw-mini', n.isActive === false ? T("Ko'rsatish") : T('Yashirish')); tg.type = 'button';
        tg.addEventListener('click', async function () { try { await authed('PATCH', '/news/' + n.id, { isActive: n.isActive === false }); showToast('✓'); nwLoadCab(true); } catch (e) { showToast((e.messages && e.messages[0]) || 'Xatolik'); } });
        const del = el('button', 'nw-mini', T("O'chirish")); del.type = 'button';
        del.addEventListener('click', async function () { if (!confirm(T("Yangilik o'chirilsinmi?"))) return; try { await authed('DELETE', '/news/' + n.id); nwLoadCab(true); } catch (e) { showToast((e.messages && e.messages[0]) || 'Xatolik'); } });
        a.appendChild(tg); a.appendChild(del); card.appendChild(a);
    }
    return card;
}

function nwChips(host, current, onPick, stateKey) {
    host.replaceChildren();
    [['', 'Barchasi'], ['ROADS', "Yo'llar"], ['AGRO', "Qishloq xo'jaligi"], ['MARKET', 'Bozorlar'], ['LOGISTICS', 'Yuk tashish']].forEach(function (x) {
        const b = el('button', 'nw-chip' + (current === x[0] ? ' on' : '')); b.type = 'button'; b.dataset.cat = x[0]; b.setAttribute('aria-pressed', String(current === x[0]));
        if (x[0]) b.appendChild(el('i', 'fa-solid ' + NW_CATS[x[0]][0]));
        b.appendChild(el('span', '', T(x[1])));
        b.addEventListener('click', function () { onPick(x[0]); });
        host.appendChild(b);
    });
}

function nwAuthed() { return !!currentUser(); }

/* ---------- Bosh sahifa ---------- */
function nwRenderHome() {
    const grid = document.getElementById('news-grid'), chips = document.getElementById('news-filters');
    if (!grid || !chips) return;
    const st = nwState.home, user = currentUser();
    nwChips(chips, st.cat, function (c) { st.cat = c; nwRenderHome(); });
    if (!st.loaded) { grid.replaceChildren(el('div', 'nw-skel'), el('div', 'nw-skel'), el('div', 'nw-skel')); return; }
    if (st.failed) { grid.replaceChildren(el('div', 'nw-empty', T('Yangiliklarni yuklab bo\'lmadi'))); return; }
    const items = st.items.filter(function (n) { return !st.cat || n.category === st.cat; });
    if (!items.length) { grid.replaceChildren(el('div', 'nw-empty', T(st.items.length ? 'Bu filtr bo\'yicha yangilik topilmadi' : 'Hozircha yangiliklar yo\'q'))); return; }
    grid.replaceChildren.apply(grid, items.slice(0, 9).map(function (n) { return nwCard(n, { authed: !!user }); }));
}
async function nwLoadHome() {
    const st = nwState.home;
    try {
        const token = storageGet(TOKEN_KEY);
        const r = await apiRequest('GET', '/news?limit=12', undefined, token || undefined, { noQueue: true });
        st.items = r.items || []; st.failed = false;
    } catch (e) { st.failed = true; }
    st.loaded = true; nwRenderHome();
}

/* ---------- Kabinet: «Yangiliklar va AI Tahlil» ---------- */
async function nwLoadCab(force) {
    const st = nwState.cab, host = document.getElementById('nw-cab-list');
    if (!host) return;
    if (force || !st.loaded) host.replaceChildren(el('div', 'nw-skel'), el('div', 'nw-skel'));
    try {
        const qs = ['limit=50'].concat(st.cat ? ['category=' + st.cat] : [], st.region ? ['region=' + encodeURIComponent(st.region)] : [], NW_STAFF.indexOf(currentUser().role) !== -1 ? ['includeInactive=true'] : []).join('&');
        const r = await authed('GET', '/news?' + qs);
        st.items = r.items || []; st.regions = r.regions || []; st.loaded = true;
    } catch (e) { host.replaceChildren(el('div', 'nw-empty', T("Yangiliklarni yuklab bo'lmadi"))); return; }
    nwRenderCab();
}
function nwRenderCab() {
    const host = document.getElementById('nw-cab-list'), chips = document.getElementById('nw-cab-chips'), sel = document.getElementById('nw-cab-region');
    if (!host || !chips) return;
    const st = nwState.cab, user = currentUser();
    nwChips(chips, st.cat, function (c) { st.cat = c; nwLoadCab(true); });
    if (sel) {
        const regs = Array.from(new Set(NW_REGIONS.concat(st.regions)));
        sel.replaceChildren(Object.assign(el('option', '', T('Barcha hududlar')), { value: '' }));
        regs.forEach(function (r) { sel.appendChild(Object.assign(el('option', '', nwRegionLabel(r)), { value: r })); });
        sel.value = st.region;
    }
    if (!st.items.length) { host.replaceChildren(el('div', 'nw-empty', T(st.cat || st.region ? "Bu filtr bo'yicha yangilik topilmadi" : "Hozircha yangiliklar yo'q"))); return; }
    host.replaceChildren.apply(host, st.items.map(function (n) { return nwCard(n, { authed: true, staff: NW_STAFF.indexOf(user.role) !== -1 }); }));
}
function nwAdminForm() {
    const f = el('form', 'nw-form'); f.id = 'nw-form'; f.noValidate = true;
    f.appendChild(el('h4', 'font-extrabold', T('Yangilik qo\'shish')));
    const t = el('input', 'auth-input'); t.id = 'nw-f-title'; t.maxLength = 200; t.placeholder = T("Sarlavha (o'zbekcha)");
    const s = el('textarea', 'auth-input'); s.id = 'nw-f-sum'; s.rows = 3; s.maxLength = 1500; s.placeholder = T("Qisqa matn (o'zbekcha)");
    const row = el('div', 'nw-bar');
    const cat = el('select', 'nw-sel'); cat.id = 'nw-f-cat'; Object.keys(NW_CATS).forEach(function (k) { cat.appendChild(Object.assign(el('option', '', T(NW_CATS[k][1])), { value: k })); });
    const reg = el('select', 'nw-sel'); reg.id = 'nw-f-reg'; NW_REGIONS.forEach(function (r) { reg.appendChild(Object.assign(el('option', '', nwRegionLabel(r)), { value: r })); });
    row.appendChild(cat); row.appendChild(reg);
    const b = el('button', 'nw-login'); b.type = 'submit'; b.id = 'nw-f-save'; b.appendChild(el('i', 'fa-solid fa-wand-magic-sparkles')); b.appendChild(el('span', '', T('Saqlash va AI xulosa yaratish')));
    const msg = el('p', 'text-sm font-semibold'); msg.id = 'nw-f-msg';
    f.appendChild(t); f.appendChild(s); f.appendChild(row); f.appendChild(b); f.appendChild(msg);
    f.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (t.value.trim().length < 5 || s.value.trim().length < 10) { msg.textContent = T('Sarlavha va qisqa matnni to\'ldiring'); return; }
        b.disabled = true;
        try {
            await authed('POST', '/news', { titleUz: t.value.trim(), summaryUz: s.value.trim(), category: cat.value, region: reg.value });
            msg.textContent = T("Yangilik qo'shildi, AI xulosalar avtomatik yaratildi."); t.value = ''; s.value = ''; nwState.home.loaded = false; nwLoadHome(); nwLoadCab(true);
        } catch (err) { msg.textContent = (err.messages && err.messages[0]) || 'Xatolik'; }
        b.disabled = false;
    });
    return f;
}
function renderNewsTab(user) {
    dashRenderId++;
    const st = nwState.cab; st.cat = ''; st.region = ''; st.loaded = false;
    const nodes = [sectionTitle(T('Yangiliklar va AI Tahlil'), T("Hudud va kategoriya bo'yicha yangiliklar, ostida esa rolingizga mos to'liq AI xulosa"))];
    const wrap = el('div', 'nw-wrap space-y-4');
    const bar = el('div', 'nw-bar');
    const sel = el('select', 'nw-sel'); sel.id = 'nw-cab-region'; sel.setAttribute('aria-label', T('Hudud'));
    sel.addEventListener('change', function () { st.region = sel.value; nwLoadCab(true); });
    bar.appendChild(sel);
    const chips = el('div', 'nw-filters'); chips.id = 'nw-cab-chips'; chips.style.margin = '0';
    bar.appendChild(chips);
    wrap.appendChild(bar);
    if (NW_STAFF.indexOf(user.role) !== -1) wrap.appendChild(nwAdminForm());
    const list = el('div', 'nw-grid'); list.id = 'nw-cab-list'; wrap.appendChild(list);
    nodes.push(wrap);
    dashContent.replaceChildren.apply(dashContent, nodes);
    nwRenderCab_init();
}
function nwRenderCab_init() { nwRenderCab(); nwLoadCab(true); }

Object.assign(LOCAL_TABS, { news: renderNewsTab });

// Til o'zgarganda keshdagi ma'lumotdan qayta chiziladi; kirish/chiqishda mehmon/rol ko'rinishi qayta yuklanadi
document.addEventListener('i18n:change', function () { nwRenderHome(); if (document.getElementById('nw-cab-list')) nwRenderCab(); });
document.addEventListener('auth:change', function () { nwState.home.loaded = false; nwRenderHome(); nwLoadHome(); });
nwRenderHome();
nwLoadHome();
setInterval(function () { if (!document.hidden) nwLoadHome(); }, 300000);
