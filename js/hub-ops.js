/* ===== Hub operatsiyalari paneli: QR skaner (qabul), OS&D hisobotlari, qadoqlash navbati (PaaS), ombor qoldiqlari =====
 * Server: GET /hub/qr/:code, POST /hub/qr/:code/receive {mode, damagedBoxes}, GET /hub/osd, GET /hub/packaging,
 * POST /hub/packaging/:id/done, GET /hub/stock. HUB_ADMIN, SUPER_ADMIN va Hub xodimi (dispetcher) uchun.
 * local.js dan keyin yuklanadi; umumiy yordamchilar (el, authed, adm*, openWhForm, hubStockCard ...) app.js / local.js'dan.
 */

const hubScan = { code: '' };
const hsRound2 = function (n) { return Math.round(n * 100) / 100; };
/** Serverdagi osdSplit bilan bir xil hisob (faqat ko'rsatish uchun; haqiqiy hisobni server qiladi) */
function hsSplit(declaredKg, boxCount, damagedBoxes) {
    const received = hsRound2(declaredKg * (boxCount - damagedBoxes) / boxCount);
    return { receivedKg: received, damagedKg: hsRound2(declaredKg - received) };
}
const hsHead = function (title, sub, again) {
    const head = el('div', 'flex flex-wrap items-center justify-between gap-3');
    head.appendChild(sectionTitle(title, sub));
    head.appendChild(refreshButton(again));
    return head;
};
const hsStat = function (icon, label, value, tone) {
    const c = el('div', 'glass rounded-2xl border border-white/10 p-4 flex items-center gap-3');
    const ic = el('span', 'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ' + tone);
    ic.appendChild(el('i', 'fa-solid ' + icon));
    const t = el('div', 'min-w-0');
    t.appendChild(el('div', 'text-2xl font-black text-white', String(value)));
    t.appendChild(el('div', 'text-xs font-bold uppercase tracking-wider text-slate-400', label));
    c.appendChild(ic); c.appendChild(t);
    return c;
};

// ---------- Kamera orqali QR o'qish (brauzer BarcodeDetector'ni qo'llasa) ----------
async function hsCameraScan(onCode) {
    const box = el('div', 'space-y-3');
    const video = el('video', 'w-full rounded-2xl bg-black');
    video.setAttribute('playsinline', ''); video.muted = true;
    box.append(video, el('p', 'text-xs text-slate-400 text-center', T('Master QR ni kameraga yaqinlashtiring.')));
    let stream = null, stopped = false;
    const stop = function () { stopped = true; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); };
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
    catch (e) { return showToast(T("Kameraga ruxsat berilmadi yoki kamera topilmadi. Kodni qo'lda kiriting."), 5000); }
    video.srcObject = stream;
    openWhModal('Kamera bilan skanerlash', '', box, false);
    try { await video.play(); } catch (e) { /* foydalanuvchi qo'lda boshlaydi */ }
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128'] });
    const tick = async function () {
        if (stopped) return;
        if (!video.isConnected) return stop(); // oyna yopilgan
        try {
            const found = await detector.detect(video);
            if (found.length && found[0].rawValue) { stop(); closeWhModal(); return onCode(String(found[0].rawValue).slice(0, 60)); }
        } catch (e) { /* keyingi kadr */ }
        setTimeout(tick, 250);
    };
    tick();
}

// ---------- QR Skaner (qabul qilish) ----------
function hsDamageForm(x, afterDone) {
    const total = x.boxCount;
    openWhForm({
        title: 'Qisman ziyon (Partial Damage)', sub: x.productName + ' · ' + T('{0} quti', total) + ' · ' + lcKg(x.declaredKg), icon: 'fa-triangle-exclamation', submit: 'Qabul qilish',
        fields: [
            { name: 'damagedBoxes', label: 'Yaroqsiz qutilar soni', type: 'number', required: true, min: 1, max: total - 1, step: 1, value: 1, hint: '…' },
            { name: 'note', label: 'Sabab / izoh', maxLength: 300, placeholder: "Masalan: yomg'irda ho'l bo'lgan, ezilgan" }
        ],
        onBuilt: function (inputs) {
            const inp = inputs.damagedBoxes, hint = inp._hint;
            const paint = function () {
                const n = Math.round(Number(inp.value));
                if (!(n >= 1 && n < total)) { hint.textContent = T("Yaroqsiz qutilar soni 1 dan {0} gacha bo'lsin.", total - 1); return; }
                const r = hsSplit(x.declaredKg, total, n);
                hint.textContent = T('Qabul: {0} quti = {1} · yaroqsiz: {2} quti = {3}', total - n, lcKg(r.receivedKg), n, lcKg(r.damagedKg));
            };
            inp.addEventListener('input', paint); paint();
        },
        onSubmit: function (v) { return authed('POST', '/hub/qr/' + encodeURIComponent(x.masterQr) + '/receive', { mode: 'PARTIAL', damagedBoxes: Math.round(v.damagedBoxes), note: v.note }); },
        done: 'Qabul qilindi: yaroqli qism omborga yozildi, OS&D hisobotiga tushdi.', after: afterDone
    });
}

function hsScanResult(x, again) {
    const c = el('article', 'glass rounded-3xl border border-sky-400/30 p-5 space-y-3');
    const top = el('div', 'flex flex-wrap items-start justify-between gap-3');
    const tt = el('div', 'min-w-0');
    tt.appendChild(el('h3', 'text-xl font-extrabold text-white break-words', x.productName));
    tt.appendChild(el('p', 'text-sm text-slate-300', '👨‍🌾 ' + x.farmName + ' · 🏬 ' + x.hub.name));
    top.appendChild(tt);
    top.appendChild(el('span', 'font-mono text-sm font-bold px-3 py-1 rounded-xl border border-sky-400/40 text-sky-200', x.masterQr));
    c.appendChild(top);
    const grid = el('div', 'grid grid-cols-3 gap-3 text-center');
    [[x.boxCount || '—', 'quti (tara)'], [lcKg(x.declaredKg), "e'lon qilingan"], [x.kgPerBox ? lcKg(x.kgPerBox) : '—', '1 quti']].forEach(function (p) {
        const cell = el('div', 'rounded-2xl bg-slate-950/40 border border-white/10 py-3');
        cell.appendChild(el('div', 'text-lg font-black text-white', String(p[0])));
        cell.appendChild(el('div', 'text-[11px] uppercase tracking-wider text-slate-400', T(p[1])));
        grid.appendChild(cell);
    });
    c.appendChild(grid);
    const tags = hubIntakeTags(x); if (tags) c.appendChild(tags);
    if (x.usePackaging) c.appendChild(el('p', 'text-xs font-bold text-amber-300', '📦 ' + T("Fermer qadoqlash xizmatini tanlagan: qabuldan keyin «Qadoqlash» bo'limiga tushadi.")));
    if (x.dock) c.appendChild(dockBadge(x.dock));
    if (x.status !== 'ANNOUNCED') {
        c.appendChild(el('p', 'text-sm font-bold text-rose-300', T("Bu partiya allaqachon ko'rib chiqilgan") + ': ' + T({ RECEIVED: 'Qabul qilindi', REJECTED: 'Rad etildi', CANCELLED: 'Bekor' }[x.status] || x.status)));
        return c;
    }
    if (!x.boxCount) {
        c.appendChild(el('p', 'text-sm text-amber-300', T("Quti soni belgilanmagan. Avval quti sonini kiriting.")));
        c.appendChild(actionBtn('fa-qrcode', 'Master QR biriktirish', true, function () { openMasterQr(x, again); }));
        return c;
    }
    const act = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1');
    const full = actionBtn('fa-circle-check', "To'liq qabul qilish", true, async function () {
        full.disabled = true;
        try {
            await authed('POST', '/hub/qr/' + encodeURIComponent(x.masterQr) + '/receive', { mode: 'FULL' });
            showToast(T("Qabul qilindi: {0} omborga yozildi.", lcKg(x.declaredKg)), 3500, 'success');
            hubScan.code = ''; again();
        } catch (err) { full.disabled = false; if (err.status !== 401) showToast(lcErr(err), 5000, 'error'); }
    });
    const part = actionBtn('fa-triangle-exclamation', 'Qisman ziyon (Partial Damage)', false, function () { hsDamageForm(x, function () { hubScan.code = ''; again(); }); });
    part.classList.add('!border-amber-400/50', '!text-amber-200');
    act.appendChild(full); act.appendChild(part);
    c.appendChild(act);
    return c;
}

async function renderHubScanTab(user) {
    const rid = ++dashRenderId;
    const again = function () { renderHubScanTab(user); };
    const head = hsHead('QR Skaner (qabul qilish)', T("Partiyaning Master QR kodini skanerlang: «1 QR = N quti». Kamera, USB skaner yoki qo'lda kiritish."), again);
    const form = el('form', 'glass rounded-3xl border border-white/10 p-4 flex flex-wrap items-stretch gap-3');
    const input = el('input', 'auth-input flex-1 min-w-[12rem] font-mono text-lg tracking-wider uppercase');
    input.type = 'text'; input.setAttribute('data-no-alphabet', ''); input.placeholder = 'MQ-XXXXXXXX'; input.maxLength = 40; input.autocomplete = 'off'; input.value = hubScan.code || '';
    input.setAttribute('aria-label', T('Master QR kodi'));
    const go = el('button', 'px-5 py-3 rounded-2xl bg-emerald-500 text-slate-950 font-extrabold hover:bg-emerald-400 transition flex items-center gap-2');
    go.type = 'submit'; go.appendChild(el('i', 'fa-solid fa-magnifying-glass')); go.appendChild(el('span', '', T('Topish')));
    form.appendChild(input); form.appendChild(go);
    if ('BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const cam = el('button', 'px-5 py-3 rounded-2xl border border-sky-400/40 text-sky-200 font-extrabold hover:bg-sky-400/10 transition flex items-center gap-2');
        cam.type = 'button'; cam.appendChild(el('i', 'fa-solid fa-camera')); cam.appendChild(el('span', '', T('Kamera')));
        cam.addEventListener('click', function () { hsCameraScan(function (code) { input.value = code; lookup(); }); });
        form.appendChild(cam);
    }
    const out = el('div', 'space-y-3');
    dashContent.replaceChildren(head, form, out);
    const lookup = async function () {
        const code = input.value.trim().replace(/\s+/g, '').toUpperCase();
        if (!code) return;
        hubScan.code = code;
        out.replaceChildren(skeleton('list'));
        try {
            const x = await authed('GET', '/hub/qr/' + encodeURIComponent(code));
            if (rid !== dashRenderId) return;
            out.replaceChildren(hsScanResult(x, again));
        } catch (err) { if (err.status !== 401 && rid === dashRenderId) out.replaceChildren(dashMessage('fa-qrcode text-rose-400', lcErr(err))); }
    };
    form.addEventListener('submit', function (e) { e.preventDefault(); lookup(); });
    if (hubScan.code) lookup(); else input.focus();
}

// ---------- OS&D hisobotlari ----------
const hsOsd = { page: 1, days: '' };
const HS_OSD_TYPE = { DAMAGED: ['Yaroqsiz (Damaged)', 'bg-rose-500/15 text-rose-300 border-rose-500/30', 'fa-triangle-exclamation'], SHORT: ['Kam vazn (Short)', 'bg-amber-500/15 text-amber-300 border-amber-500/30', 'fa-scale-unbalanced'] };

async function renderHubOsdTab(user) {
    const rid = ++dashRenderId;
    const again = function () { renderHubOsdTab(user); };
    const from = hsOsd.days ? new Date(Date.now() - Number(hsOsd.days) * 86400000).toISOString() : '';
    let d;
    dashContent.replaceChildren(hsHead('OS&D hisobotlari', T("Qabul paytidagi yo'qotishlar: yaroqsiz va kam vaznli partiyalar"), again), skeleton('list'));
    try { d = await authed('GET', '/hub/osd' + whQuery({ page: hsOsd.page, limit: 15, from: from })); }
    catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), again)); }
    if (rid !== dashRenderId) return;
    const s = d.summary;
    const stats = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-3');
    stats.appendChild(hsStat('fa-file-circle-exclamation', 'Hisobotlar', s.count, 'bg-sky-500/15 text-sky-300'));
    stats.appendChild(hsStat('fa-weight-hanging', "Yo'qotish (kg)", formatNumber(s.lossKg), 'bg-rose-500/15 text-rose-300'));
    stats.appendChild(hsStat('fa-box-open', 'Yaroqsiz qutilar', s.damagedBoxes, 'bg-amber-500/15 text-amber-300'));
    stats.appendChild(hsStat('fa-percent', "Yo'qotish ulushi", s.lossPercent + '%', 'bg-violet-500/15 text-violet-300'));
    const filter = admFilterBar([admSelect([['', 'Barcha vaqt'], ['7', "So'nggi 7 kun"], ['30', "So'nggi 30 kun"], ['90', "So'nggi 90 kun"]], hsOsd.days, function (v) { hsOsd.days = v; hsOsd.page = 1; again(); })]);
    const table = admTable([
        ['Sana', function (r) { return admDate(r.createdAt); }],
        ['Master QR / manba', function (r) { return r.masterQr ? el('span', 'font-mono text-xs text-sky-200', r.masterQr) : (r.source === 'ORDER' ? T('Chakana buyurtma') : '—'); }],
        ['Mahsulot', function (r) { return admName(r.productName, r.farmName + ' · ' + r.hub); }],
        ['Turi', function (r) { const t = HS_OSD_TYPE[r.type]; return whPill(t[0], t[1], t[2]); }],
        ['Qutilar', function (r) { return r.totalBoxes ? T('{0} / {1} yaroqsiz', r.damagedBoxes || 0, r.totalBoxes) : '—'; }],
        ['Kutilgan → qabul', function (r) { return lcKg(r.expectedKg) + ' → ' + lcKg(r.receivedKg); }],
        ["Yo'qotish", function (r) { return el('b', 'text-rose-300', lcKg(r.lossKg)); }],
        ['Xaridorga qaytgan', function (r) { return r.refundAmount ? bdMoney(r.refundAmount) : '—'; }],
        ['Izoh / xodim', function (r) { return admName(r.note || '—', r.reportedBy || ''); }]
    ], d.items, "OS&D hisobotlari yo'q: hamma partiya to'liq qabul qilingan.");
    dashContent.replaceChildren(hsHead('OS&D hisobotlari', T("Qabul paytidagi yo'qotishlar: yaroqsiz va kam vaznli partiyalar"), again), stats, filter, table, admPager(d, function (p) { hsOsd.page = p; again(); }));
}

// ---------- Qadoqlash navbati (PaaS) ----------
async function renderHubPackTab(user) {
    const rid = ++dashRenderId;
    const again = function () { renderHubPackTab(user); };
    const head = hsHead('Qadoqlanishi kerak bo\'lgan yuklar', T("Fermer «Hub'da qadoqlash xizmati»ni tanlagan topshirishlar"), again);
    dashContent.replaceChildren(head, skeleton('list'));
    let list;
    try { list = await authed('GET', '/hub/packaging'); }
    catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(head, dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), again)); }
    if (rid !== dashRenderId) return;
    setTabBadge('hubpack', list.filter(function (x) { return x.status === 'RECEIVED'; }).length);
    if (!list.length) return dashContent.replaceChildren(head, emptyState({ art: 'listings', compact: true, title: "Qadoqlanadigan yuk yo'q", text: "Fermer qadoqlash xizmatini tanlagan topshirishlar shu yerda ko'rinadi." }));
    const cards = list.map(function (x) {
        const c = el('article', 'glass rounded-2xl border border-white/10 p-4 space-y-2');
        const top = el('div', 'flex items-start justify-between gap-3');
        top.appendChild(el('div', 'min-w-0 font-extrabold text-white break-words', x.productName + ' · ' + x.farmName));
        const ready = x.status === 'RECEIVED';
        top.appendChild(el('span', 'text-xs font-bold ' + (ready ? 'text-emerald-300' : 'text-amber-300'), T(ready ? 'Omborda: qadoqlash mumkin' : 'Yuk hali kelmagan')));
        c.appendChild(top);
        c.appendChild(el('div', 'text-xs text-slate-400', '🏬 ' + x.hub.name + ' · ' + lcKg(x.receivedKg !== null ? x.receivedKg : x.declaredKg) + (x.boxCount ? ' · ' + T('{0} quti', x.boxCount) : '') + ' · ' + T('Xizmat haqi: {0}', bdMoney(x.packagingFee || 0))));
        const tags = hubIntakeTags(x); if (tags) c.appendChild(tags);
        if (x.dock) c.appendChild(dockBadge(x.dock));
        const act = el('div', 'flex flex-wrap gap-2');
        const done = actionBtn('fa-box-archive', 'Qadoqlandi', true, async function () {
            done.disabled = true;
            try { await authed('POST', '/hub/packaging/' + x.id + '/done'); showToast(T('Qadoqlandi deb belgilandi.'), 2500, 'success'); again(); }
            catch (err) { done.disabled = false; if (err.status !== 401) showToast(lcErr(err), 4500, 'error'); }
        });
        done.disabled = !ready;
        act.appendChild(done);
        if (x.masterQr && !ready) act.appendChild(actionBtn('fa-boxes-packing', 'Skaner bilan qabul', false, function () { hubScan.code = x.masterQr; selectDashTab('hubscan'); }));
        c.appendChild(act);
        return c;
    });
    dashContent.replaceChildren.apply(dashContent, [head].concat(cards));
}

// ---------- Ombor qoldiqlari ----------
async function renderHubStockTab(user) {
    const rid = ++dashRenderId;
    const again = function () { renderHubStockTab(user); };
    const head = hsHead('Ombor qoldiqlari', T("Hub omborlaridagi joriy qoldiq: mavjud, zaxiralangan va sotuvga ochiq"), again);
    dashContent.replaceChildren(head, skeleton('list'));
    let list;
    try { list = await authed('GET', '/hub/stock'); }
    catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(head, dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), again)); }
    if (rid !== dashRenderId) return;
    if (!list.length) return dashContent.replaceChildren(head, emptyState({ art: 'listings', compact: true, title: "Omborda qoldiq yo'q", text: "Birinchi topshirishni qabul qilgach qoldiq shu yerda ko'rinadi." }));
    const sum = function (k) { return list.reduce(function (a, s) { return a + (s[k] || 0); }, 0); };
    const stats = el('div', 'grid grid-cols-3 gap-3');
    stats.appendChild(hsStat('fa-warehouse', 'Jami qoldiq', lcKg(sum('weightKg')), 'bg-emerald-500/15 text-emerald-300'));
    stats.appendChild(hsStat('fa-lock', 'Zaxirada', lcKg(sum('reservedKg')), 'bg-amber-500/15 text-amber-300'));
    stats.appendChild(hsStat('fa-cart-shopping', "Sotuvga ochiq", lcKg(sum('availableKg')), 'bg-sky-500/15 text-sky-300'));
    dashContent.replaceChildren.apply(dashContent, [head, stats].concat(list.map(function (s) { return hubStockCard(s); })));
}

LOCAL_TABS.hubscan = renderHubScanTab;
LOCAL_TABS.hubosd = renderHubOsdTab;
LOCAL_TABS.hubpack = renderHubPackTab;
LOCAL_TABS.hubstock = renderHubStockTab;
