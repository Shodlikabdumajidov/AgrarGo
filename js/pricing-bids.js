/* ===== Dinamik narxlash, haydovchi narx taklifi (Counter-Offer), nizo (Dispute) va Escrow 20/80 indikatori =====
 * Server: GET /pricing/road-fee, POST/GET /shipments/:id/bids, POST /shipments/:id/bids/:bidId/accept, POST /shipments/:id/dispute.
 * Umumiy yordamchilar (el, authed, T, bdMoney, formatNumber, openWhModal ...) app.js'dan.
 */

// ---- Yo'l haqi kalkulyatori: koeffitsientlar server (backend/src/pricing/pricing.ts) bilan bir xil ----
const PB_FUEL = [['METHANE', 'Metan', 0.9], ['PROPANE', 'Propan', 1.0], ['DIESEL', 'Dizel', 1.1]];
const PB_CARGO = [['STANDARD', 'Standart', 1.0], ['FRAGILE', 'Nozik', 1.15], ['REFRIGERATED', 'Refrijerator', 1.3]];
const PB_SPREAD = 0.1;
const PB_BID_MIN_RATIO = 0.7;

/** Tavsiya etilgan narx va oraliq (±10%), 1000 so'mga yaxlitlangan: butun sonlarda hisoblanadi (floating xatosiz) */
function pbRange(base, fuelFactor, cargoFactor) {
    const scaled = Math.round(base * Math.round(fuelFactor * 100) * Math.round(cargoFactor * 100) / 100); // base x ff x cf x 100 (butun)
    const rec = Math.ceil(scaled / 100 / 1000) * 1000;
    const lo = Math.floor(rec * 90 / 100 / 1000) * 1000;
    const hi = Math.ceil(rec * 110 / 100 / 1000) * 1000;
    return { recommended: rec, min: lo, max: hi };
}

/** Formula popover'iga qo'shiladigan kalkulyator: yoqilg'i turi, yuk turi va «Tavsiya etilgan narx oralig'i» */
function pbCalculator(f) {
    const box = el('div', 'pb-calc'); box.dataset.pbCalc = '1';
    box.appendChild(el('div', 'pb-calc-title', "Yo'l haqi kalkulyatori"));
    const sel = function (label, opts, key) {
        const w = el('label', 'pb-sel'); w.appendChild(el('span', '', label));
        const s = el('select', 'auth-input'); s.dataset[key] = '1';
        opts.forEach(function (o) { s.appendChild(new Option(T(o[1]) + (key === 'cargo' ? ' ×' + o[2].toFixed(2).replace(/0$/, '') : ''), o[0])); });
        s.value = key === 'fuel' ? 'PROPANE' : 'STANDARD';
        w.appendChild(s); return [w, s];
    };
    const fu = sel(T("Yoqilg'i turi"), PB_FUEL, 'fuel'), ca = sel(T('Yuk turi'), PB_CARGO, 'cargo');
    const grid = el('div', 'pb-grid'); grid.appendChild(fu[0]); grid.appendChild(ca[0]); box.appendChild(grid);
    const out = el('div', 'pb-range'); out.dataset.pbRange = '1'; box.appendChild(out);
    const paint = function () {
        const ff = PB_FUEL.filter(function (x) { return x[0] === fu[1].value; })[0][2], cf = PB_CARGO.filter(function (x) { return x[0] === ca[1].value; })[0][2];
        const r = pbRange(f.total, ff, cf);
        out.replaceChildren(el('div', 'pb-range-label', T("Tavsiya etilgan narx oralig'i")), el('div', 'pb-range-val', bdMoney(r.min) + ' – ' + bdMoney(r.max)), el('div', 'pb-range-rec', T('Tavsiya: {0}', bdMoney(r.recommended))));
    };
    fu[1].addEventListener('change', paint); ca[1].addEventListener('change', paint);
    paint();
    return box;
}

// ---- Haydovchi: narx taklifi (Counter-Offer / Bidding) ----
function pbBidInput(s) {
    const fee = (typeof bdNorm === 'function' && bdNorm(s.price)) ? bdNorm(s.price).delivery : 0;
    if (!(fee > 0) || s.paymentStatus !== 'HELD' || s.status !== 'OPEN') return null;
    const min = Math.ceil(fee * PB_BID_MIN_RATIO / 1000) * 1000;
    const form = el('form', 'w-full rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 space-y-2'); form.dataset.bid = '1'; form.noValidate = true;
    form.appendChild(el('div', 'text-[11px] font-bold uppercase tracking-wider text-violet-300', 'O\'z narxingizni taklif qiling'));
    const row = el('div', 'flex gap-2');
    const inp = el('input', 'auth-input'); inp.type = 'number'; inp.min = min; inp.max = fee; inp.step = 1000; inp.placeholder = String(fee); inp.setAttribute('aria-label', T('Taklif narxi'));
    const go = el('button', 'flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-extrabold border bg-violet-500 border-violet-500 text-white hover:bg-violet-400 disabled:opacity-50'); go.type = 'submit';
    go.appendChild(el('i', 'fa-solid fa-hand-holding-dollar')); go.appendChild(el('span', '', 'Taklif yuborish'));
    row.appendChild(inp); row.appendChild(go); form.appendChild(row);
    form.appendChild(el('p', 'text-[11px] text-slate-400', T("Taklif oralig'i: {0} – {1}. Yuk egasi qabul qilsa, siz biriktirilasiz va yo'l haqi shu narxga tushadi.", bdMoney(min), bdMoney(fee))));
    const status = el('p', 'text-xs font-semibold text-violet-200 hidden'); status.dataset.bidStatus = '1'; form.appendChild(status);
    const show = function (b) { status.classList.remove('hidden'); status.textContent = T('Taklifingiz: {0} — {1}', bdMoney(b.price), T(b.status === 'ACCEPTED' ? 'qabul qilindi' : b.status === 'REJECTED' ? 'rad etildi' : 'javob kutilmoqda')); inp.value = b.price; };
    authed('GET', '/shipments/' + s.id + '/bids').then(function (r) { if (r.bids && r.bids[0]) show(r.bids[0]); }).catch(function () {});
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const v = Number(inp.value);
        if (!(v >= min && v <= fee)) return showToast(T("Taklif {0} dan {1} so'mgacha bo'lishi kerak.", formatNumber(min), formatNumber(fee)), 4500, 'error');
        go.disabled = true;
        try { const b = await authed('POST', '/shipments/' + s.id + '/bids', { price: v }); show(b); showToast(T('Taklif yuborildi. Yuk egasi javobini kuting.'), 3500, 'success'); }
        catch (err) { if (err.status !== 401) showToast((err.messages && err.messages[0]) || T('Xatolik yuz berdi.'), 5000, 'error'); }
        go.disabled = false;
    });
    return form;
}

// ---- Yuk egasi: kelgan takliflar va qabul qilish ----
function pbBidsPanel(s, reload) {
    if (s.status !== 'OPEN' || s.driver || s.paymentStatus !== 'HELD') return null;
    const box = el('div', 'w-full rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 space-y-2'); box.dataset.bids = '1';
    const head = el('div', 'flex items-center justify-between gap-2');
    head.appendChild(el('div', 'text-[11px] font-bold uppercase tracking-wider text-violet-300', 'Haydovchilar takliflari'));
    const open = el('button', 'text-xs font-extrabold text-violet-200 hover:text-white'); open.type = 'button'; open.textContent = T("Takliflarni ko'rish");
    head.appendChild(open); box.appendChild(head);
    const list = el('div', 'space-y-2'); box.appendChild(list);
    const load = async function () {
        let r;
        try { r = await authed('GET', '/shipments/' + s.id + '/bids'); } catch (err) { if (err.status !== 401) showToast((err.messages && err.messages[0]) || T('Xatolik yuz berdi.'), 4500, 'error'); return; }
        if (!r.bids.length) { list.replaceChildren(el('p', 'text-xs text-slate-400', T("Hozircha takliflar yo'q."))); return; }
        list.replaceChildren.apply(list, r.bids.map(function (b) {
            const row = el('div', 'flex items-center justify-between gap-3 rounded-lg bg-slate-950/40 border border-white/10 px-3 py-2'); row.dataset.bid = b.id;
            const l = el('div', 'min-w-0'); l.appendChild(el('div', 'text-sm font-extrabold text-white', bdMoney(b.price)));
            l.appendChild(el('div', 'text-[11px] text-slate-400 truncate', b.driver ? b.driver.fullName + ' · ' + b.driver.vehicleType + ' · ' + b.driver.plateNumber : ''));
            row.appendChild(l);
            if (b.status === 'PENDING') {
                const acc = el('button', 'px-3 py-1.5 rounded-lg text-xs font-extrabold bg-violet-500 text-white hover:bg-violet-400'); acc.type = 'button'; acc.dataset.bidAccept = '1'; acc.textContent = T('Qabul qilish');
                acc.addEventListener('click', async function () {
                    acc.disabled = true;
                    try { await authed('POST', '/shipments/' + s.id + '/bids/' + b.id + '/accept', {}); showToast(T('Taklif qabul qilindi: haydovchi biriktirildi.'), 3500, 'success'); reload(); }
                    catch (err) { if (err.status !== 401) showToast((err.messages && err.messages[0]) || T('Xatolik yuz berdi.'), 5000, 'error'); acc.disabled = false; }
                });
                row.appendChild(acc);
            } else row.appendChild(el('span', 'text-[11px] font-bold text-slate-300', T(b.status === 'ACCEPTED' ? 'Qabul qilindi' : 'Rad etildi')));
            return row;
        }));
    };
    open.addEventListener('click', load);
    return box;
}

// ---- Nizo (Dispute): sifatsiz yuk / rad etish ----
function pbDisputeButton(s, onDone, full) {
    const b = el('button', (full ? 'w-full ' : 'flex-1 ') + 'flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-extrabold border border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition');
    b.type = 'button'; b.dataset.dispute = '1';
    b.appendChild(el('i', 'fa-solid fa-triangle-exclamation')); b.appendChild(el('span', '', 'Sifatsiz yuk / Rad etish (Dispute)'));
    b.addEventListener('click', function () {
        const f = el('form', 'space-y-3'); f.noValidate = true; f.id = 'dispute-form';
        f.appendChild(el('p', 'text-sm text-slate-300', T("Yuk sifatsiz yoki qabul qilib bo'lmasa, sababni yozing. Nizo ochiq turganda topshirish bloklanadi va pul escrow'da saqlanadi — dispetcher qaror chiqaradi.")));
        const ta = el('textarea', 'auth-input'); ta.rows = 3; ta.maxLength = 500; ta.placeholder = T('Masalan: 30% mahsulot chirigan'); f.appendChild(ta);
        const go = el('button', 'w-full py-3 rounded-xl text-sm font-extrabold bg-rose-500 text-white hover:bg-rose-400 disabled:opacity-50'); go.type = 'submit'; go.textContent = T('Nizo ochish'); f.appendChild(go);
        f.addEventListener('submit', async function (e) {
            e.preventDefault();
            if (ta.value.trim().length < 5) return showToast(T('Sababni yozing (kamida 5 ta belgi).'), 3500, 'error');
            go.disabled = true;
            try { await authed('POST', '/shipments/' + s.id + '/dispute', { reason: ta.value.trim() }); closeWhModal(); showToast(T('Nizo ochildi. Dispetcher ko\'rib chiqadi.'), 4000, 'success'); onDone(); }
            catch (err) { if (err.status !== 401) showToast((err.messages && err.messages[0]) || T('Xatolik yuz berdi.'), 5000, 'error'); go.disabled = false; }
        });
        openWhModal(T('Sifatsiz yuk / Rad etish (Dispute)'), '', f, false);
    });
    return b;
}

function pbDisputeBanner(s) {
    const d = s.dispute; if (!d) return null;
    const b = el('div', 'rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 space-y-1'); b.dataset.disputeBanner = '1';
    b.appendChild(el('div', 'font-extrabold flex items-center gap-2', '⚠ ' + T('Nizo ochilgan')));
    b.appendChild(el('div', 'text-xs', d.reason || ''));
    b.appendChild(el('div', 'text-[11px] text-rose-300/80', T("Topshirish bloklangan, pul escrow'da saqlanmoqda. Dispetcher qaror chiqaradi.")));
    return b;
}

// ---- Escrow 20/80 indikatori (buyurtma rasmiylashtirishda) ----
function pbEscrowIndicator(total) {
    const hold = Math.round(total * 0.2), rest = Math.round(total) - hold;
    const box = el('div', 'pb-escrow'); box.dataset.escrow = '1';
    const head = el('div', 'pb-escrow-head');
    head.appendChild(el('i', 'fa-solid fa-shield-halved'));
    head.appendChild(el('span', '', T("Kafolat (Escrow): jami summaning 20% band qilinadi")));
    box.appendChild(head);
    const bar = el('div', 'pb-escrow-bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', '20% / 80%');
    const a = el('span', 'pb-escrow-a', '20%'); a.style.width = '20%'; const b = el('span', 'pb-escrow-b', '80%'); b.style.width = '80%';
    bar.appendChild(a); bar.appendChild(b); box.appendChild(bar);
    const legend = el('div', 'pb-escrow-legend');
    legend.appendChild(el('span', '', T('Kafolat (band): {0}', bdMoney(hold))));
    legend.appendChild(el('span', '', T('Qolgan 80%: {0}', bdMoney(rest))));
    box.appendChild(legend);
    return box;
}
