/* ===== Safety Admin paneli: kutayotgan foydalanuvchilarni tasdiqlash va imzolangan e-BOL shartnomalari =====
 * Server: GET /safety/summary, GET /safety/ebol (sahifalangan), GET /kyc/pending, POST /kyc/:id/approve|reject.
 * SAFETY_ADMIN va SUPER_ADMIN uchun; umumiy yordamchilar (el, authed, adm*, openWhForm ...) app.js'dan.
 */

const SF_KIND = { SHIPMENT: 'Yuk tashish', LOCAL: 'Hub buyurtmasi' };
const sfState = { kind: '', page: 1 };

/** To'liq vaqt tamg'asi (soniyagacha, Toshkent vaqti): kelishuv paytini aniq ko'rsatish uchun */
function sfStamp(iso) {
    if (!iso) return '—';
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(iso));
    const g = function (t) { return (p.find(function (x) { return x.type === t; }) || {}).value; };
    return g('day') + '.' + g('month') + '.' + g('year') + ' ' + g('hour') + ':' + g('minute') + ':' + g('second');
}

/** Uzun ID: qisqa ko'rinish, bosilganda to'liq qiymat nusxalanadi */
function sfIdChip(id) {
    const b = el('button', 'font-mono text-xs px-2 py-1 rounded-lg border border-white/15 text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300 transition', String(id).slice(0, 8).toUpperCase());
    b.type = 'button';
    b.title = id;
    b.addEventListener('click', function () {
        try { navigator.clipboard.writeText(id).then(function () { showToast(T('ID nusxalandi'), 1800, 'success'); }); } catch (e) { showToast(id, 4000); }
    });
    return b;
}

function sfStat(icon, label, value, tone) {
    const c = el('div', 'glass rounded-2xl border border-white/10 p-4 flex items-center gap-3');
    c.appendChild(el('span', 'w-10 h-10 rounded-xl flex items-center justify-center ' + tone, ''));
    c.firstChild.appendChild(el('i', 'fa-solid ' + icon));
    const t = el('div', 'min-w-0');
    t.appendChild(el('div', 'text-2xl font-black text-white', String(value)));
    t.appendChild(el('div', 'text-xs font-bold uppercase tracking-wider text-slate-400', label));
    c.appendChild(t);
    return c;
}

function sfPendingSection(list, again) {
    const box = el('div', 'space-y-3');
    box.appendChild(sectionTitle('Kutayotgan foydalanuvchilarni tasdiqlash', T("Tekshiruvni kutayotgan arizalar: {0} ta", list.length)));
    box.appendChild(admTable([
        ['Foydalanuvchi', function (u) { return admName(u.fullName, u.phone + (u.plateNumber ? ' · ' + u.plateNumber : '')); }],
        ['Rol', function (u) { return ADM_ROLE_LABEL[u.role] || u.role; }],
        ['Hujjatlar', function (u) {
            const w = el('div', 'flex flex-wrap gap-1.5');
            KYC_STEPS.filter(function (s) { return (u.docs || []).indexOf(s[0]) !== -1; }).forEach(function (s) { w.appendChild(admBtn(s[1], s[2], function () { viewKycDoc(u.id, s[0]); }, 'ok')); });
            if (!w.childNodes.length) w.textContent = '—';
            return w;
        }],
        ['Yuborilgan', function (u) { return admDate(u.createdAt); }],
        ['Amallar', function (u) {
            return admActions([
                admBtn('fa-circle-check', 'Tasdiqlash', async function () {
                    try { await authed('POST', '/kyc/' + u.id + '/approve'); showToast('Tasdiqlandi', 2400, 'success'); again(); } catch (e) { showToast(lcErr(e), 4000, 'error'); }
                }, 'ok'),
                admBtn('fa-circle-xmark', 'Rad etish', function () {
                    openWhForm({
                        title: 'Rad etish sababi', sub: u.fullName, icon: 'fa-circle-xmark', submit: 'Rad etish',
                        fields: [{ name: 'reason', label: 'Sabab', type: 'text', required: true }],
                        onSubmit: function (v) { return authed('POST', '/kyc/' + u.id + '/reject', { reason: v.reason }); }, done: 'Ariza rad etildi.'
                    });
                }, 'danger')
            ]);
        }]
    ], list, "Tekshirishni kutayotgan arizalar yo'q."));
    return box;
}

function sfEbolSection(d, again) {
    const box = el('div', 'space-y-3');
    box.appendChild(sectionTitle("Imzolangan e-BOL shartnomalari ro'yxati", T("Haydovchi fermer SMS-kodini kiritganda shartnoma yoziladi: vaqt tamg'asi va ID bilan")));
    box.appendChild(admFilterBar([admSelect([['', 'Barcha turlar'], ['SHIPMENT', SF_KIND.SHIPMENT], ['LOCAL', SF_KIND.LOCAL]], sfState.kind, function (v) { sfState.kind = v; sfState.page = 1; again(); })]));
    box.appendChild(admTable([
        ['Shartnoma ID', function (r) { return sfIdChip(r.id); }],
        ["Imzolangan vaqt", function (r) { return el('span', 'font-mono text-xs whitespace-nowrap', sfStamp(r.signedAt)); }],
        ['Tur / yuk ID', function (r) {
            const w = el('div', 'space-y-1');
            w.appendChild(el('div', 'text-xs font-bold text-slate-300', SF_KIND[r.kind] || r.kind));
            w.appendChild(sfIdChip(r.shipmentId || r.localOrderId));
            return w;
        }],
        ['Yuk', function (r) { return r.cargo ? admName(r.cargo.name, T('{0} kg', formatNumber(r.cargo.weightKg)) + (r.cargo.route ? ' · ' + r.cargo.route : '')) : '—'; }],
        ['Haydovchi', function (r) { return admName(r.driver.fullName, r.driver.phone + (r.driver.plateNumber ? ' · ' + r.driver.plateNumber : '')); }],
        ['Fermer', function (r) { return admName(r.farmer.fullName, r.farmer.phone + ' · ' + r.farmer.farmName); }],
        ['Holat', function (r) { return whPill(r.status === 'SIGNED' ? 'Imzolangan' : 'Bekor qilingan', r.status === 'SIGNED' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30', r.status === 'SIGNED' ? 'fa-file-signature' : 'fa-ban'); }],
        ['Imzo izi (SHA-256)', function (r) { const s = el('span', 'font-mono text-[11px] text-slate-400', r.contractHash.slice(0, 12) + '…'); s.title = r.contractHash; return s; }]
    ], d.items, "Imzolangan shartnomalar hali yo'q."));
    box.appendChild(admPager(d, function (p) { sfState.page = p; again(); }));
    return box;
}

async function renderSafetyTab(user) {
    const rid = ++dashRenderId;
    const again = function () { renderSafetyTab(user); };
    const head = admHead('Safety paneli', again);
    dashContent.replaceChildren(head, skeleton('list'));
    let sum, pending, ebol;
    try {
        [sum, pending, ebol] = await Promise.all([
            authed('GET', '/safety/summary'),
            authed('GET', '/kyc/pending'),
            authed('GET', '/safety/ebol' + whQuery({ kind: sfState.kind, page: sfState.page, limit: 15 }))
        ]);
    } catch (err) {
        if (err.status === 401 || rid !== dashRenderId) return;
        return dashContent.replaceChildren(head, dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), again));
    }
    if (rid !== dashRenderId) return;
    const stats = el('div', 'grid grid-cols-1 sm:grid-cols-3 gap-3');
    stats.appendChild(sfStat('fa-user-clock', 'Tasdiq kutmoqda', sum.pendingUsers, 'bg-amber-500/15 text-amber-300'));
    stats.appendChild(sfStat('fa-file-signature', 'Imzolangan e-BOL', sum.signedTotal, 'bg-emerald-500/15 text-emerald-300'));
    stats.appendChild(sfStat('fa-calendar-day', 'Bugun imzolangan', sum.signedToday, 'bg-sky-500/15 text-sky-300'));
    dashContent.replaceChildren(head, stats, sfPendingSection(pending, again), sfEbolSection(ebol, again));
}

LOCAL_TABS.safety = renderSafetyTab;
