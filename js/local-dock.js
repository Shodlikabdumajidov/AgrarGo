/* ===== Hub rampalari (Dock Loading): vaqt va darvoza yorliqlari, band qilish, Hub xodimi uchun bandlik jadvali (Gantt) =====
 * local.js'dan keyin yuklanadi. Server: GET /hubs/:id/dock-slots, POST /hub/dock-bookings, GET /hubs/:id/dock-schedule ...
 */

const DOCK_STATUS = {
    BOOKED: { label: 'Band qilingan', cls: 'sky' },
    ARRIVED: { label: 'Keldi', cls: 'emerald' },
    DONE: { label: 'Yakunlandi', cls: 'slate' },
    CANCELLED: { label: 'Bekor qilingan', cls: 'slate' },
    NO_SHOW: { label: 'Kelmadi', cls: 'rose' }
};
const DOCK_PURPOSE = { INTAKE: { icon: 'fa-arrow-down-to-bracket', label: 'Yuk tushirish' }, PICKUP: { icon: 'fa-arrow-up-from-bracket', label: 'Yuk ortish' } };

const dkPad = function (n) { return String(n).padStart(2, '0'); };
const dkIso = function (plusDays) { const d = new Date(Date.now() + (plusDays || 0) * 86400000); return d.getFullYear() + '-' + dkPad(d.getMonth() + 1) + '-' + dkPad(d.getDate()); };
const dkDate = function (iso) {
    if (iso === dkIso(0)) return T('Bugun');
    if (iso === dkIso(1)) return T('Ertaga');
    return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
};
const dkHHMM = function (min) { return dkPad(Math.floor(min / 60) % 24) + ':' + dkPad(min % 60); };

/** "Samarqand Hub, 2-sonli rampa, vaqt: 10:00-11:00" */
function dockText(d) { return d.hubName + ', ' + T('{0}-sonli rampa', d.dockNumber) + ', ' + T('vaqt: {0}', d.timeSlot); }

/** Chiroyli yorliq: Hub, rampa raqami, vaqt oralig'i va holat */
function dockBadge(d) {
    const st = DOCK_STATUS[d.status] || DOCK_STATUS.BOOKED;
    const b = el('div', 'dk-badge ' + st.cls);
    b.setAttribute('role', 'note');
    b.setAttribute('aria-label', dockText(d));
    b.appendChild(el('i', 'fa-solid fa-door-open'));
    const t = el('div', 'min-w-0');
    t.appendChild(el('b', '', d.hubName + ' · ' + T('{0}-sonli rampa', d.dockNumber)));
    t.appendChild(el('span', '', T('vaqt: {0}', d.timeSlot) + ' · ' + dkDate(d.date) + ' · ' + T(st.label)));
    b.appendChild(t);
    return b;
}

// ---------- Rampa va vaqt tanlagich ----------
/**
 * cfg: { hubId, requireDock }. Qaytaradi { node, get() -> { startsAt, dockId? } | null, setHub(id, requireDock) }.
 * Server bo'sh rampani o'zi tanlaydi; xohlasa foydalanuvchi aniq rampani ko'rsatadi.
 */
function dockPicker(cfg) {
    const st = { hubId: cfg.hubId, require: !!cfg.requireDock, date: dkIso(1), data: null, sel: null, seq: 0 };
    const node = el('div', 'space-y-3');
    const dateIn = el('input', 'auth-input'); dateIn.type = 'date'; dateIn.min = dkIso(0); dateIn.max = dkIso(14); dateIn.value = st.date; dateIn.setAttribute('aria-label', T('Sana'));
    const grid = el('div', 'dk-slots'); grid.setAttribute('role', 'listbox'); grid.setAttribute('aria-label', T('Vaqt oralig\'i'));
    const dockSel = el('select', 'auth-input'); dockSel.style.display = 'none'; dockSel.setAttribute('aria-label', T('Rampa'));
    const note = el('p', 'text-[11px] text-slate-400');
    node.appendChild(dateIn); node.appendChild(grid); node.appendChild(dockSel); node.appendChild(note);

    const paintNote = function (msg, cls) { note.className = 'text-[11px] ' + (cls || 'text-slate-400'); note.textContent = msg || ''; };
    const paint = function () {
        grid.replaceChildren();
        dockSel.style.display = 'none';
        const d = st.data;
        dateIn.style.display = d && d.docks.length ? '' : 'none';
        if (!d) return;
        if (!d.docks.length) { paintNote(T("Bu Hub rampa jadvalini yuritmaydi: vaqt belgilash shart emas."), 'text-slate-400'); return; }
        paintNote(st.require ? T("Bu Hub rampa va vaqtni band qilishni talab qiladi. Tizim bo'sh rampani o'zi tanlaydi.") : T("Rampa va vaqtni tanlang. Tizim bo'sh rampani o'zi tanlaydi."), st.require ? 'text-amber-300' : 'text-slate-400');
        d.free.forEach(function (f, i) {
            const mine = d.docks.some(function (k) { return k.slots[i].status === 'mine'; });
            const off = f.past || (f.freeDocks === 0 && !mine);
            const b = el('button', ['dk-slot', st.sel && st.sel.startsAt === f.startsAt ? 'on' : '', off ? 'off' : '', mine ? 'mine' : ''].join(' ').trim()); b.type = 'button'; b.disabled = off;
            b.setAttribute('role', 'option'); b.setAttribute('aria-selected', st.sel && st.sel.startsAt === f.startsAt ? 'true' : 'false');
            b.appendChild(el('b', '', f.timeSlot));
            b.appendChild(el('small', '', f.past ? T("O'tib ketgan") : mine ? T('Sizniki') : f.freeDocks ? T("{0} ta bo'sh", f.freeDocks) : T('Band')));
            b.addEventListener('click', function () { st.sel = { startsAt: f.startsAt, idx: i }; paint(); });
            grid.appendChild(b);
        });
        if (st.sel) {
            const i = st.sel.idx;
            dockSel.replaceChildren(new Option(T('Rampa: avtomatik (tavsiya)'), ''));
            d.docks.forEach(function (k) { if (k.slots[i].status === 'free') dockSel.appendChild(new Option(T('{0}-sonli rampa', k.number) + (k.name ? ' · ' + k.name : ''), k.id)); });
            dockSel.style.display = '';
        }
    };
    const load = async function () {
        if (!st.hubId) { st.data = null; grid.replaceChildren(); paintNote(T('Hub ombori tanlang.')); return; }
        const my = ++st.seq;
        grid.replaceChildren(el('div', 'text-xs text-slate-500', T('Yuklanmoqda...')));
        try {
            const data = await authed('GET', '/hubs/' + st.hubId + '/dock-slots?date=' + encodeURIComponent(st.date));
            if (my !== st.seq) return;
            st.data = data; st.sel = null; paint();
        } catch (err) { if (my === st.seq && err.status !== 401) { st.data = null; grid.replaceChildren(); paintNote(lcErr(err), 'text-rose-300'); } }
    };
    dateIn.addEventListener('change', function () { st.date = dateIn.value; st.sel = null; load(); });
    load();
    return {
        node: node,
        get: function () { return st.sel ? { startsAt: st.sel.startsAt, dockId: dockSel.value || undefined } : null; },
        setHub: function (id, require) { st.hubId = id; st.require = !!require; st.sel = null; load(); }
    };
}

/** Mavjud topshirish uchun rampa/vaqt band qilish yoki o'zgartirish (fermer) */
function openIntakeDockForm(x, after) {
    const picker = dockPicker({ hubId: x.hub.id, requireDock: x.hub.requireDockBooking });
    const form = el('div', 'space-y-4');
    if (x.dock) form.appendChild(dockBadge(x.dock));
    form.appendChild(picker.node);
    const alertBox = el('div', 'hidden rounded-2xl px-4 py-3 text-sm font-medium'); alertBox.setAttribute('role', 'alert');
    form.appendChild(alertBox);
    const go = el('button', 'lc-btn solid w-full'); go.type = 'button'; go.appendChild(el('i', 'fa-solid fa-door-open')); go.appendChild(el('span', '', x.dock ? T('Vaqtni o\'zgartirish') : T('Rampani band qilish')));
    go.addEventListener('click', async function () {
        const v = picker.get();
        if (!v) return showAuthAlert([T('Vaqt oralig\'ini tanlang.')], 'error', alertBox);
        go.disabled = true;
        try { await authed('POST', '/hub/dock-bookings', { hubId: x.hub.id, purpose: 'INTAKE', intakeId: x.id, startsAt: v.startsAt, dockId: v.dockId }); closeWhModal(); showToast(T('Rampa band qilindi.'), 3000, 'success'); after(); }
        catch (err) { go.disabled = false; if (err.status !== 401) showAuthAlert([lcErr(err)], 'error', alertBox); }
    });
    form.appendChild(go);
    openWhModal(T('Rampa va vaqt'), x.productName + ' · ' + x.hub.name, form);
}

// ---------- Haydovchi (kuryer): yuk olish uchun rampa ----------
function courierDockCard(me, user, reload) {
    const c = el('div', 'glass rounded-2xl border border-sky-500/25 p-4 space-y-3');
    c.appendChild(el('div', 'font-extrabold text-white', '🚪 ' + T('Rampa va vaqt')));
    c.appendChild(el('p', 'text-xs ' + (me.requireDock ? 'text-amber-300' : 'text-slate-400'), me.requireDock
        ? T("Bu Hub'dan yuk olish uchun avval rampa va vaqtni band qilishingiz shart. Belgilangan vaqtda keling.")
        : T("Hub navbatsiz tartib uchun rampa jadvalini yuritadi: vaqtni oldindan band qilsangiz, kutmaysiz.")));
    (me.appointments || []).forEach(function (a) {
        const row = el('div', 'flex flex-wrap items-center justify-between gap-2');
        row.appendChild(dockBadge(a));
        if (a.status === 'BOOKED') row.appendChild(actionBtn('fa-xmark', 'Bekor qilish', false, async function () {
            try { await authed('POST', '/hub/dock-bookings/' + a.id + '/cancel', {}); reload(); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4000, 'error'); }
        }));
        c.appendChild(row);
    });
    c.appendChild(actionBtn('fa-door-open', 'Rampa band qilish', true, function () {
        const picker = dockPicker({ hubId: me.hub.id, requireDock: me.requireDock });
        const form = el('div', 'space-y-4');
        form.appendChild(picker.node);
        const alertBox = el('div', 'hidden rounded-2xl px-4 py-3 text-sm font-medium'); alertBox.setAttribute('role', 'alert');
        form.appendChild(alertBox);
        const go = el('button', 'lc-btn solid w-full'); go.type = 'button'; go.appendChild(el('i', 'fa-solid fa-check')); go.appendChild(el('span', '', T('Band qilish')));
        go.addEventListener('click', async function () {
            const v = picker.get();
            if (!v) return showAuthAlert([T("Vaqt oralig'ini tanlang.")], 'error', alertBox);
            go.disabled = true;
            try { await authed('POST', '/hub/dock-bookings', { hubId: me.hub.id, purpose: 'PICKUP', startsAt: v.startsAt, dockId: v.dockId }); closeWhModal(); showToast(T('Rampa band qilindi.'), 3000, 'success'); reload(); }
            catch (err) { go.disabled = false; if (err.status !== 401) showAuthAlert([lcErr(err)], 'error', alertBox); }
        });
        form.appendChild(go);
        openWhModal(T('Rampa va vaqt'), me.hub.name, form);
    }));
    void user;
    return c;
}

// ---------- Hub xodimi / administrator: rampalar bandlik jadvali (Gantt) ----------
const hubDocks = { hubId: '', date: '' };
async function renderHubDocks(user) {
    const rid = ++dashRenderId;
    if (!hubDocks.date) hubDocks.date = dkIso(0);
    dashContent.replaceChildren(skeleton('list'));
    let hubs, sch;
    try {
        hubs = (await authed('GET', '/hubs')).filter(function (h) { return h.isActive && (!user.hubId || h.id === user.hubId); });
        if (!hubs.length) { if (rid !== dashRenderId) return; return dashContent.replaceChildren(sectionTitle('Rampalar', T('Hub darvozalari va vaqt jadvali')), emptyState({ art: 'listings', compact: true, title: "Hub yo'q", text: "Birinchi Hub omborini yarating, so'ng dispetcher xodimni biriktiring." })); }
        if (!hubs.some(function (h) { return h.id === hubDocks.hubId; })) hubDocks.hubId = (user.hubId && hubs[0].id) || hubs[0].id;
        sch = await authed('GET', '/hubs/' + hubDocks.hubId + '/dock-schedule?date=' + encodeURIComponent(hubDocks.date));
    } catch (err) { if (err.status === 401 || rid !== dashRenderId) return; return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', lcErr(err), function () { renderHubDocks(user); })); }
    if (rid !== dashRenderId) return;
    const again = function () { renderHubDocks(user); };

    const head = el('div', 'flex flex-wrap items-center justify-between gap-3');
    head.appendChild(sectionTitle('Rampalar', T('Hub darvozalari va vaqt jadvali')));
    head.appendChild(refreshButton(again));

    // Boshqaruv qatori: Hub, sana, rampa qo'shish, sozlamalar
    const bar = el('div', 'flex flex-wrap items-center gap-2');
    if (hubs.length > 1) {
        const hs = el('select', 'auth-input sm:!w-auto sm:min-w-[12rem]'); hs.setAttribute('aria-label', T('Hub ombori'));
        hubs.forEach(function (h) { hs.appendChild(new Option(h.name, h.id)); });
        hs.value = hubDocks.hubId;
        hs.addEventListener('change', function () { hubDocks.hubId = hs.value; again(); });
        bar.appendChild(hs);
    }
    const shift = function (n) { const d = new Date(hubDocks.date + 'T12:00:00'); d.setDate(d.getDate() + n); hubDocks.date = d.getFullYear() + '-' + dkPad(d.getMonth() + 1) + '-' + dkPad(d.getDate()); again(); };
    const prev = el('button', 'lc-step', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', T('Oldingi kun')); prev.addEventListener('click', function () { shift(-1); });
    const next = el('button', 'lc-step', '›'); next.type = 'button'; next.setAttribute('aria-label', T('Keyingi kun')); next.addEventListener('click', function () { shift(1); });
    const di = el('input', 'auth-input !w-auto'); di.type = 'date'; di.value = hubDocks.date; di.setAttribute('aria-label', T('Sana'));
    di.addEventListener('change', function () { if (di.value) { hubDocks.date = di.value; again(); } });
    bar.appendChild(prev); bar.appendChild(di); bar.appendChild(next);
    bar.appendChild(actionBtn('fa-calendar-day', 'Bugun', false, function () { hubDocks.date = dkIso(0); again(); }));
    bar.appendChild(actionBtn('fa-plus', "Rampa qo'shish", true, function () {
        openWhForm({ title: "Yangi rampa (darvoza)", sub: sch.hub.name, submit: "Qo'shish", icon: 'fa-door-open',
            fields: [{ name: 'name', label: 'Nomi (ixtiyoriy)', maxLength: 40, placeholder: 'Masalan: Sovutgichli' }, { name: 'number', label: 'Raqami (bo\'sh qolsa avtomatik)', type: 'number', min: 1, max: 99 }],
            onSubmit: function (v) { const b = {}; if (v.name) b.name = v.name; if (v.number) b.number = v.number; return authed('POST', '/hubs/' + sch.hub.id + '/docks', b); }, done: "Rampa qo'shildi.", after: again });
    }));
    bar.appendChild(actionBtn('fa-sliders', 'Jadval sozlamalari', false, function () {
        const hrs = function (from, to) { const o = []; for (let h = from; h <= to; h++) o.push([dkPad(h) + ':00', dkPad(h) + ':00']); return o; };
        openWhForm({ title: 'Rampa jadvali', sub: sch.hub.name, submit: 'Saqlash', icon: 'fa-sliders',
            fields: [
                { name: 'slotMinutes', label: 'Slot uzunligi', type: 'select', options: [15, 20, 30, 45, 60, 90, 120].map(function (m) { return [String(m), T('{0} daqiqa', m)]; }), value: String(sch.hub.slotMinutes) },
                { name: 'openTime', label: 'Ochilish vaqti', type: 'select', options: hrs(0, 23), value: sch.hub.openTime },
                { name: 'closeTime', label: 'Yopilish vaqti', type: 'select', options: hrs(1, 24), value: sch.hub.closeTime },
                { name: 'requireDockBooking', label: "Yuk topshirish va olish uchun rampa band qilish majburiy", type: 'checkbox', value: sch.hub.requireDockBooking }
            ],
            onSubmit: function (v) { return authed('PATCH', '/hubs/' + sch.hub.id + '/dock-settings', { slotMinutes: Number(v.slotMinutes), openTime: v.openTime, closeTime: v.closeTime, requireDockBooking: !!v.requireDockBooking }); }, done: 'Saqlandi.', after: again });
    }));

    const nodes = [head, bar];
    const act = sch.appointments.filter(function (a) { return a.status === 'BOOKED' || a.status === 'ARRIVED'; });
    nodes.push(el('p', 'text-xs text-slate-400', T('{0} · {1}–{2} · slot {3} daqiqa · faol yozuvlar: {4}', dkDate(sch.date), sch.hub.openTime, sch.hub.closeTime, sch.hub.slotMinutes, act.length) + (sch.hub.requireDockBooking ? ' · ' + T('band qilish majburiy') : '')));
    if (!sch.docks.length) {
        nodes.push(emptyState({ art: 'listings', compact: true, title: "Rampa yo'q", text: "«Rampa qo'shish» tugmasi bilan Hub darvozalarini kiriting (masalan, 3 ta)." }));
        return dashContent.replaceChildren.apply(dashContent, nodes);
    }
    nodes.push(dockGantt(sch, again));
    // Rang izohi
    const lg = el('div', 'flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400');
    [['in', 'Yuk tushirish (fermer)'], ['out', 'Yuk ortish (kuryer)'], ['arr', 'Keldi'], ['done', 'Yakunlandi'], ['ns', 'Kelmadi']].forEach(function (l) { const s = el('span', 'inline-flex items-center gap-1.5'); s.appendChild(el('i', 'dk-dot ' + l[0])); s.appendChild(el('span', '', T(l[1]))); lg.appendChild(s); });
    nodes.push(lg);
    // Matnli ro'yxat: telefon va kichik ekranlar uchun qulay, ekran o'quvchi uchun ham
    if (sch.appointments.length) {
        nodes.push(el('h3', 'text-lg font-extrabold text-white mt-3', T('Kunning yozuvlari')));
        const list = el('div', 'space-y-2');
        sch.appointments.forEach(function (a) {
            const r = el('button', 'dk-item'); r.type = 'button';
            r.appendChild(dockBadge(a));
            r.appendChild(el('span', 'text-xs text-slate-300 min-w-0', T(DOCK_PURPOSE[a.purpose].label) + ' · ' + a.bookedBy.name + (a.vehiclePlate ? ' · ' + a.vehiclePlate : '')));
            r.addEventListener('click', function () { openDockDetails(a, again); });
            list.appendChild(r);
        });
        nodes.push(list);
    }
    dashContent.replaceChildren.apply(dashContent, nodes);
}

function dockGantt(sch, again) {
    const span = sch.closeMin - sch.openMin;
    const hours = Math.ceil(span / 60);
    const wrap = el('div', 'dk-gantt');
    const grid = el('div', 'dk-grid');
    grid.style.minWidth = 'calc(7rem + ' + hours * 4.5 + 'rem)';
    grid.style.setProperty('--h', String(hours));
    const pct = function (min) { return Math.max(0, Math.min(100, (min - sch.openMin) / span * 100)); };
    // Soatlar sarlavhasi
    const hr = el('div', 'dk-row dk-head');
    hr.appendChild(el('div', 'dk-label', T('Rampa')));
    const ht = el('div', 'dk-track');
    for (let m = sch.openMin; m < sch.closeMin; m += 60) { const t = el('span', 'dk-tick', dkHHMM(m)); t.style.left = pct(m) + '%'; ht.appendChild(t); }
    hr.appendChild(ht);
    grid.appendChild(hr);
    const nowMin = (function () { const n = Math.floor(Date.now() / 60000) + sch.utcOffsetMin; return ((n % 1440) + 1440) % 1440; })();
    const isToday = sch.date === (function () { const n = new Date(Date.now() + sch.utcOffsetMin * 60000); return n.toISOString().slice(0, 10); })();
    sch.docks.forEach(function (d) {
        const row = el('div', 'dk-row');
        const lab = el('div', 'dk-label');
        lab.appendChild(el('b', '', T('{0}-sonli rampa', d.number)));
        if (d.name) lab.appendChild(el('small', '', d.name));
        if (!d.isActive) lab.appendChild(el('small', 'text-rose-300', T('Faol emas')));
        const rm = el('button', 'dk-rm', '✕'); rm.type = 'button'; rm.setAttribute('aria-label', T("Rampani o'chirish") + ' ' + d.number);
        rm.addEventListener('click', async function () {
            if (!confirm(T("{0}-sonli rampani o'chirasizmi?", d.number))) return;
            try { await authed('DELETE', '/hubs/' + sch.hub.id + '/docks/' + d.id); showToast(T("Rampa o'chirildi."), 3000); again(); } catch (err) { if (err.status !== 401) showToast(lcErr(err), 4500, 'error'); }
        });
        lab.appendChild(rm);
        row.appendChild(lab);
        const tr = el('div', 'dk-track');
        sch.appointments.filter(function (a) { return a.dockId === d.id; }).forEach(function (a) {
            const l = pct(a.startMin), w = Math.max(2, pct(a.endMin) - l);
            const cls = ['dk-bar', a.purpose === 'INTAKE' ? 'in' : 'out', a.status === 'ARRIVED' ? 'arr' : '', a.status === 'DONE' ? 'done' : '', a.status === 'NO_SHOW' ? 'ns' : ''].join(' ').trim();
            const b = el('button', cls); b.type = 'button';
            b.style.left = l + '%'; b.style.width = w + '%';
            b.title = dockText(a) + ' · ' + a.bookedBy.name;
            b.setAttribute('aria-label', dockText(a) + ', ' + a.bookedBy.name);
            b.appendChild(el('i', 'fa-solid ' + DOCK_PURPOSE[a.purpose].icon));
            b.appendChild(el('span', '', a.timeSlot.slice(0, 5) + ' ' + a.bookedBy.name));
            b.addEventListener('click', function () { openDockDetails(a, again); });
            tr.appendChild(b);
        });
        if (isToday && nowMin >= sch.openMin && nowMin <= sch.closeMin) { const nl = el('i', 'dk-now'); nl.style.left = pct(nowMin) + '%'; tr.appendChild(nl); }
        row.appendChild(tr);
        grid.appendChild(row);
    });
    wrap.appendChild(grid);
    return wrap;
}

function openDockDetails(a, again) {
    const box = el('div', 'space-y-3');
    box.appendChild(dockBadge(a));
    const info = el('div', 'space-y-1.5 text-sm text-slate-200');
    const row = function (k, v) { if (!v) return; const r = el('div', 'flex justify-between gap-3'); r.appendChild(el('span', 'text-slate-400', T(k))); r.appendChild(el('b', 'text-right min-w-0 break-words', v)); info.appendChild(r); };
    row('Maqsad', T(DOCK_PURPOSE[a.purpose].label));
    row('Band qilgan', a.bookedBy.name + ' · ' + a.bookedBy.phone);
    row('Mashina raqami', a.vehiclePlate);
    if (a.intake) row('Mahsulot', a.intake.productName + ' · ' + lcKg(a.intake.declaredKg));
    if (a.orders && a.orders.length) row('Buyurtmalar', a.orders.map(function (o) { return o.productName + ' ' + lcKg(o.quantityKg); }).join(', '));
    if (a.note) row('Izoh', a.note);
    box.appendChild(info);
    const alertBox = el('div', 'hidden rounded-2xl px-4 py-3 text-sm font-medium'); alertBox.setAttribute('role', 'alert');
    box.appendChild(alertBox);
    const acts = el('div', 'flex flex-wrap gap-2');
    const run = function (path, body) { return async function () { try { await authed('POST', '/hub/dock-bookings/' + a.id + '/' + path, body || {}); closeWhModal(); again(); } catch (err) { if (err.status !== 401) showAuthAlert([lcErr(err)], 'error', alertBox); } }; };
    if (a.status === 'BOOKED') { acts.appendChild(actionBtn('fa-truck', 'Keldi', true, run('arrive'))); acts.appendChild(actionBtn('fa-user-slash', 'Kelmadi', false, run('no-show'))); }
    if (a.status === 'BOOKED' || a.status === 'ARRIVED') {
        acts.appendChild(actionBtn('fa-flag-checkered', 'Yakunlash', a.status === 'ARRIVED', run('complete')));
        acts.appendChild(actionBtn('fa-ban', 'Bekor qilish', false, run('cancel', { reason: 'Hub bekor qildi' })));
    }
    if (acts.children.length) box.appendChild(acts);
    openWhModal(T('Rampa yozuvi'), a.hubName, box);
}
