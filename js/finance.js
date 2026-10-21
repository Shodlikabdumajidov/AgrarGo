/* ===== Moliya paneli (FINANCE_ADMIN): escrow jadvali, platforma foydasi, cashback aylanmasi, nizolarni qo'lda hal qilish =====
 * Server: GET /finance/summary, /finance/escrow, /finance/adjustments, /finance/reconcile, /finance/cashback/monthly,
 * GET /finance/payments/:id, POST /finance/payments/:id/resolve. local.js dan keyin yuklanadi; umumiy yordamchilar app.js'dan.
 */

const fin = { days: '', status: '', kind: '', page: 1 };
const FIN_STATUS = {
    PENDING: ['Kutilmoqda', 'bg-slate-500/20 text-slate-300 border-slate-500/30', 'fa-hourglass-half'],
    HELD: ['Hold (escrow)', 'bg-amber-500/15 text-amber-300 border-amber-500/30', 'fa-lock'],
    RELEASED: ['Released', 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', 'fa-circle-check'],
    REFUNDED: ['Refunded', 'bg-sky-500/15 text-sky-300 border-sky-500/30', 'fa-rotate-left'],
    CANCELLED: ['Bekor', 'bg-slate-500/20 text-slate-400 border-slate-500/30', 'fa-ban']
};
const FIN_KIND = { BOOKING: 'Bron (B2B)', WAREHOUSE: 'Ombor buyurtmasi', LOCAL: 'Chakana (Hub)' };
const FIN_ADJ = { DAMAGE: 'Ziyon (OS&D)', PACKAGING: 'Qadoqlash haqi', DISPUTE: 'Nizo qarori' };
const finMoney = function (v) { return bdMoney(Number(v) || 0); };
const finShort = function (id) { return String(id).slice(0, 8).toUpperCase(); };

function finStat(icon, label, amount, sub, tone) {
    const c = el('div', 'glass rounded-2xl border border-white/10 p-4 space-y-1');
    const top = el('div', 'flex items-center gap-2 text-xs font-bold uppercase tracking-wider ' + tone);
    top.appendChild(el('i', 'fa-solid ' + icon)); top.appendChild(el('span', '', label));
    c.appendChild(top);
    c.appendChild(el('div', 'text-xl font-black text-white break-words', finMoney(amount)));
    if (sub) c.appendChild(el('div', 'text-xs text-slate-400', sub));
    return c;
}
function finLine(label, value, opts) {
    opts = opts || {};
    const r = el('div', 'flex items-center justify-between gap-3 py-2 ' + (opts.total ? 'border-t border-white/15 mt-1 pt-3' : 'border-b border-white/5'));
    r.appendChild(el('span', opts.total ? 'font-extrabold text-white' : 'text-sm text-slate-300', label));
    const tone = opts.total ? 'text-lg font-black text-emerald-300 whitespace-nowrap' : opts.neg ? 'text-sm font-bold text-rose-300 whitespace-nowrap' : 'text-sm font-bold text-white whitespace-nowrap';
    const cls = tone;
    r.appendChild(el('span', cls, (opts.neg ? '− ' : '') + finMoney(value)));
    return r;
}

// ---------- Nizoni qo'lda hal qilish ----------
function finResolveDialog(row, again) {
    const ACTION = { DAMAGE: "Ziyon: yaroqsiz qutilar bo'yicha qisman qaytarish", PERCENT: "Mahsulot summasining foizini qaytarish", RELEASE: "Escrow'ni fermerga chiqarish", REFUND: "To'liq qaytarish (xaridorga)" };
    openWhForm({
        title: 'Nizoni hal qilish', sub: finShort(row.id) + ' · ' + row.product + ' · ' + finMoney(row.total), icon: 'fa-scale-balanced', submit: 'Qarorni bajarish',
        fields: [
            { name: 'action', label: 'Qaror', type: 'select', options: row.resolve.map(function (a) { return [a, T(ACTION[a])]; }), value: row.resolve[0] },
            { name: 'damagedBoxes', label: 'Yaroqsiz qutilar soni', type: 'number', min: 1, step: 1 },
            { name: 'totalBoxes', label: 'Jami qutilar soni', type: 'number', min: 2, step: 1 },
            { name: 'percent', label: 'Qaytariladigan foiz (1-99)', type: 'number', min: 1, max: 99, step: 1 },
            { name: 'deliveryPolicy', label: "Yo'l haqi", type: 'select', options: [['', T('Yuk holatiga qarab (avtomatik)')], ['KEEP', T("Haydovchi to'liq oladi")], ['PRORATE', T('Nisbatan qirqiladi')]], value: '' },
            { name: 'reason', label: 'Qaror sababi (audit jurnaliga yoziladi)', required: true, maxLength: 300 }
        ],
        onBuilt: function (inputs) {
            const wrapOf = function (n) { return inputs[n].closest('div'); };
            const sync = function () {
                const a = inputs.action.value;
                wrapOf('damagedBoxes').classList.toggle('hidden', a !== 'DAMAGE'); wrapOf('totalBoxes').classList.toggle('hidden', a !== 'DAMAGE');
                wrapOf('percent').classList.toggle('hidden', a !== 'PERCENT');
                wrapOf('deliveryPolicy').classList.toggle('hidden', a !== 'DAMAGE' && a !== 'PERCENT');
            };
            inputs.action.addEventListener('change', sync); sync();
        },
        onSubmit: function (v) {
            const body = { action: v.action, reason: v.reason };
            if (v.action === 'DAMAGE') { body.damagedBoxes = Math.round(v.damagedBoxes); body.totalBoxes = Math.round(v.totalBoxes); }
            if (v.action === 'PERCENT') body.percent = Math.round(v.percent);
            if (v.deliveryPolicy && (v.action === 'DAMAGE' || v.action === 'PERCENT')) body.deliveryPolicy = v.deliveryPolicy;
            return authed('POST', '/finance/payments/' + row.id + '/resolve', body);
        },
        done: "Qaror bajarildi: escrow qayta hisoblandi.", after: again
    });
}

async function finDetailDialog(id) {
    let d;
    try { d = await authed('GET', '/finance/payments/' + id); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4000, 'error'); return; }
    const box = el('div', 'space-y-4');
    const sum = el('div', 'space-y-0.5');
    [['Mahsulot (fermer)', d.amount], ["Yo'l haqi", d.deliveryFee], ['Komissiya', d.serviceFee], ['Hub haqi', d.hubFee]].forEach(function (x) { if (x[1]) sum.appendChild(finLine(T(x[0]), x[1])); });
    if (d.cashbackUsed) sum.appendChild(finLine(T('Keshbek bilan qoplangan'), d.cashbackUsed, { neg: true }));
    sum.appendChild(finLine(T('Xaridor to\'lagan jami'), d.total, { total: true }));
    box.appendChild(sum);
    if (d.refundedAmount) box.appendChild(el('p', 'text-sm font-bold text-sky-300', T('Xaridorga qaytarilgan: {0}', finMoney(d.refundedAmount))));
    if (d.splits.length) {
        box.appendChild(el('h4', 'text-xs font-bold uppercase tracking-wider text-slate-400', T('Ulushlar')));
        const w = el('div', 'flex flex-wrap gap-2');
        d.splits.forEach(function (s) { w.appendChild(el('span', 'text-xs px-2.5 py-1 rounded-full border border-white/15 text-slate-200', s.party + ': ' + finMoney(s.amount) + ' · ' + s.status)); });
        box.appendChild(w);
    }
    if (d.adjustmentList.length) {
        box.appendChild(el('h4', 'text-xs font-bold uppercase tracking-wider text-slate-400', T('Qayta hisoblashlar')));
        d.adjustmentList.forEach(function (a) {
            box.appendChild(el('p', 'text-xs text-slate-300', '#' + a.seq + ' ' + T(FIN_ADJ[a.kind]) + ' · ' + (a.totalBoxes ? a.damagedBoxes + '/' + a.totalBoxes + ' · ' : '') + (a.refundAmount ? T('qaytgan {0}', finMoney(a.refundAmount)) + ' · ' : '') + (a.transferAmount ? T("Hub'ga {0}", finMoney(a.transferAmount)) + ' · ' : '') + formatDateTime(a.createdAt) + (a.note ? ' — ' + a.note : '')));
        });
    }
    box.appendChild(el('h4', 'text-xs font-bold uppercase tracking-wider text-slate-400', T('Tarix')));
    d.events.forEach(function (e) { box.appendChild(el('p', 'text-xs text-slate-400', formatDateTime(e.createdAt) + ' · ' + e.status + ' · ' + (e.actor || '') + (e.note ? ' — ' + e.note : ''))); });
    openWhModal('To\'lov tafsiloti', finShort(d.id) + ' · ' + T(FIN_KIND[d.kind]), box, true);
}

// ---------- Asosiy bo'limlar ----------
function finProfitPanel(s) {
    const p = s.profit;
    const box = el('div', 'space-y-0.5');
    box.appendChild(finLine(T('Komissiya (yalpi)'), p.commissionGross));
    if (p.cashbackCovered) box.appendChild(finLine(T('Keshbek bilan qoplangan qismi'), p.cashbackCovered, { neg: true }));
    box.appendChild(finLine(T('Sof komissiya'), p.commissionNet));
    box.appendChild(finLine(T('Omborxona xizmat haqi'), p.warehouseFee));
    box.appendChild(finLine(T('Qadoqlash xizmati (Hub ulushi)') + ' · ' + p.packagingCount, p.packagingFee));
    box.appendChild(finLine(T('Jami platforma foydasi'), p.total, { total: true }));
    box.appendChild(el('p', 'text-[11px] text-slate-500 pt-2', T("Yakunlangan (Released) to'lovlar bo'yicha. Hub saqlash haqlari ({0}) Hub'lar daromadi, platforma foydasiga kirmaydi.", finMoney(p.hubFees))));
    return admPanel('Platforma foydasi', box);
}
function finCashbackPanel(s, monthly) {
    const c = s.cashback;
    const wrap = el('div', 'space-y-3');
    const stats = el('div', 'grid grid-cols-2 gap-2');
    [['Yozilgan', c.earned, 'text-emerald-300'], ['Ishlatilgan', c.spent, 'text-amber-300'], ['Qaytgan', c.restored, 'text-sky-300'], ['Foydalanuvchilar balansi', c.outstanding, 'text-white']].forEach(function (x) {
        const cell = el('div', 'rounded-xl bg-slate-950/40 border border-white/10 px-3 py-2');
        cell.appendChild(el('div', 'text-[11px] uppercase tracking-wider text-slate-400', T(x[0])));
        cell.appendChild(el('div', 'font-black ' + x[2], finMoney(x[1])));
        stats.appendChild(cell);
    });
    wrap.appendChild(stats);
    wrap.appendChild(el('p', 'text-xs text-slate-400', T('Aylanma (yozilgan + ishlatilgan): {0}', finMoney(c.turnover))));
    if (monthly.length) wrap.appendChild(barChartCard('Oylar bo\'yicha', '', monthly.map(function (m) { return m.month; }), [
        { label: 'Yozilgan', data: monthly.map(function (m) { return m.earned; }), color: CHART_COLORS.emerald },
        { label: 'Ishlatilgan', data: monthly.map(function (m) { return m.spent; }), color: CHART_COLORS.amber }
    ], { fmt: finMoney, axis: moneyShort }));
    return admPanel('Cashback aylanmasi', wrap);
}

function finEscrowTable(d, again) {
    const box = el('div', 'space-y-3');
    box.appendChild(admFilterBar([
        admSelect([['', 'Barcha holatlar'], ['HELD', 'Hold'], ['RELEASED', 'Released'], ['REFUNDED', 'Refunded'], ['PENDING', 'Kutilmoqda'], ['CANCELLED', 'Bekor']], fin.status, function (v) { fin.status = v; fin.page = 1; again(); }),
        admSelect([['', 'Barcha turlar'], ['BOOKING', FIN_KIND.BOOKING], ['WAREHOUSE', FIN_KIND.WAREHOUSE], ['LOCAL', FIN_KIND.LOCAL]], fin.kind, function (v) { fin.kind = v; fin.page = 1; again(); })
    ]));
    box.appendChild(admTable([
        ['To\'lov', function (r) { const b = el('button', 'font-mono text-xs px-2 py-1 rounded-lg border border-white/15 text-slate-200 hover:border-emerald-500/50 transition', finShort(r.id)); b.type = 'button'; b.title = r.id; b.addEventListener('click', function () { finDetailDialog(r.id); }); return b; }],
        ['Tur', function (r) { return T(FIN_KIND[r.kind]); }],
        ['Holat', function (r) { const s = FIN_STATUS[r.status]; return whPill(T(s[0]), s[1], s[2]); }],
        ['Xaridor', function (r) { return admName(r.buyer, r.product); }],
        ['Fermer', function (r) { return r.farm; }],
        ['Jami', function (r) { return el('b', 'text-white whitespace-nowrap', finMoney(r.total)); }],
        ['Qaytarilgan', function (r) { return r.refundedAmount ? el('span', 'text-sky-300 font-bold whitespace-nowrap', finMoney(r.refundedAmount)) : '—'; }],
        ['Sana', function (r) { return admDate(r.createdAt); }],
        ['Amallar', function (r) {
            const b = [admBtn('fa-eye', 'Tafsilot', function () { finDetailDialog(r.id); })];
            if (r.resolve.length) b.push(admBtn('fa-scale-balanced', 'Nizoni hal qilish', function () { finResolveDialog(r, again); }, 'ok'));
            else if (r.status === 'HELD' && r.kind === 'LOCAL') { const n = el('span', 'text-[11px] text-slate-500', T('Ziyon: Hub xodimi (qadoqlash)')); b.push(n); }
            return admActions(b);
        }]
    ], d.items, "To'lovlar topilmadi."));
    box.appendChild(admPager(d, function (p) { fin.page = p; again(); }));
    return box;
}

function finAdjustments(d) {
    return admTable([
        ['Sana', function (a) { return admDate(a.createdAt); }],
        ['Turi', function (a) { return T(FIN_ADJ[a.kind]); }],
        ['To\'lov', function (a) { return el('span', 'font-mono text-xs', finShort(a.paymentId)); }],
        ['Qutilar', function (a) { return a.totalBoxes ? a.damagedBoxes + ' / ' + a.totalBoxes : '—'; }],
        ['Xaridorga qaytgan', function (a) { return a.refundAmount ? finMoney(a.refundAmount) : '—'; }],
        ["Hub'ga o'tgan", function (a) { return a.transferAmount ? finMoney(a.transferAmount) : '—'; }],
        ['Izoh', function (a) { return a.note || '—'; }]
    ], d.items, "Qayta hisoblashlar hali yo'q.");
}

async function renderFinanceTab(user) {
    const rid = ++dashRenderId;
    const again = function () { renderFinanceTab(user); };
    const head = admHead('Moliya paneli', again, []);
    dashContent.replaceChildren(head, skeleton('list'));
    const from = fin.days ? new Date(Date.now() - Number(fin.days) * 86400000).toISOString() : '';
    let sum, escrow, adj, rec, monthly;
    try {
        [sum, escrow, adj, rec, monthly] = await Promise.all([
            authed('GET', '/finance/summary' + whQuery({ from: from })),
            authed('GET', '/finance/escrow' + whQuery({ status: fin.status, kind: fin.kind, page: fin.page, limit: 12, from: from })),
            authed('GET', '/finance/adjustments' + whQuery({ limit: 8, from: from })),
            authed('GET', '/finance/reconcile'),
            authed('GET', '/finance/cashback/monthly')
        ]);
    } catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(head, dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), again)); }
    if (rid !== dashRenderId) return;
    const period = admFilterBar([admSelect([['', 'Barcha vaqt'], ['7', "So'nggi 7 kun"], ['30', "So'nggi 30 kun"], ['90', "So'nggi 90 kun"]], fin.days, function (v) { fin.days = v; fin.page = 1; again(); })]);
    const banner = el('div', 'rounded-2xl border px-4 py-3 text-sm font-bold flex items-start gap-3 ' + (rec.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/40 bg-rose-500/10 text-rose-200'));
    banner.appendChild(el('i', 'fa-solid mt-0.5 ' + (rec.ok ? 'fa-circle-check' : 'fa-triangle-exclamation')));
    const bt = el('div', 'min-w-0');
    bt.appendChild(el('div', '', rec.ok ? T("Hisob-kitob izchil: ulushlar, holatlar, qaytarishlar va qadoqlash haqlari jurnal bilan mos.") : T('Hisob-kitobda nomuvofiqlik aniqlandi: {0} ta', rec.issues.length)));
    rec.issues.slice(0, 5).forEach(function (i) { bt.appendChild(el('div', 'text-xs font-medium font-mono opacity-90', i.type + ' · ' + (i.paymentId ? finShort(i.paymentId) + ' · ' : '') + i.detail)); });
    banner.appendChild(bt);

    const st = sum.escrow.byStatus;
    const cnt = function (k) { return st[k] ? T('{0} ta', st[k].count) : T('{0} ta', 0); };
    const amt = function (k) { return st[k] ? st[k].amount : 0; };
    const stats = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-3');
    stats.appendChild(finStat('fa-lock', 'Hold (escrow)', amt('HELD'), cnt('HELD'), 'text-amber-300'));
    stats.appendChild(finStat('fa-circle-check', 'Released', amt('RELEASED'), cnt('RELEASED'), 'text-emerald-300'));
    stats.appendChild(finStat('fa-rotate-left', 'Refunded', amt('REFUNDED'), cnt('REFUNDED'), 'text-sky-300'));
    stats.appendChild(finStat('fa-triangle-exclamation', 'Ziyon va nizo qaytarishlari', sum.disputes.refunded, T('{0} ta qaror', sum.disputes.count), 'text-rose-300'));
    const two = el('div', 'grid grid-cols-1 lg:grid-cols-2 gap-4');
    two.appendChild(finProfitPanel(sum)); two.appendChild(finCashbackPanel(sum, monthly));
    dashContent.replaceChildren(head, period, banner, stats, two,
        sectionTitle('Escrow jadvallari', T('Hold, Released va Refunded holatidagi to\'lovlar; nizoli to\'lovga qaror chiqarish mumkin')), finEscrowTable(escrow, again),
        sectionTitle("Qayta hisoblashlar jurnali", T("Ziyon, qadoqlash haqi ushlanmasi va nizo qarorlari")), finAdjustments(adj));
}

LOCAL_TABS.finance = renderFinanceTab;
