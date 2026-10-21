/* ===== e-BOL: yukni olishda fermer SMS-kodi bilan raqamli imzo (haydovchi / kuryer tomoni) =====
 * Yuk (Shipment):  POST /shipments/:id/arrived  -> kod fermer telefoniga; POST /shipments/:id/sign {code} -> imzo + yo'lga chiqish
 * Hub buyurtmasi:  POST /local/orders/:id/ebol/otp  /  POST /local/orders/:id/ebol/sign {code}
 * app.js / local.js dan keyin yuklanadi; umumiy yordamchilar (el, authed, showToast, lcErr ...) shu fayllardan.
 */

const EBOL_API = {
    SHIPMENT: { otp: function (id) { return '/shipments/' + id + '/arrived'; }, sign: function (id) { return '/shipments/' + id + '/sign'; } },
    LOCAL: { otp: function (id) { return '/local/orders/' + id + '/ebol/otp'; }, sign: function (id) { return '/local/orders/' + id + '/ebol/sign'; } }
};

/**
 * e-BOL paneli. opts: { kind: 'SHIPMENT'|'LOCAL', id, label?, signed, required, onSigned(result) }
 * Imzolangan bo'lsa — faqat belgi; aks holda «Yetib keldim — kod yuborish» va 4 xonali kod maydoni.
 */
function ebolPanel(opts) {
    const box = el('div', 'w-full rounded-xl border px-4 py-3 space-y-2 ' + (opts.signed ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-sky-500/30 bg-sky-500/10'));
    const title = el('div', 'flex items-center gap-2 text-sm font-extrabold ' + (opts.signed ? 'text-emerald-300' : 'text-sky-200'));
    title.appendChild(el('i', 'fa-solid ' + (opts.signed ? 'fa-file-signature' : 'fa-signature')));
    title.appendChild(el('span', '', (opts.label ? opts.label + ' · ' : '') + T(opts.signed ? 'e-BOL imzolangan' : 'e-BOL: fermer kodi bilan imzolash')));
    box.appendChild(title);
    if (opts.signed) return box;

    const hint = el('p', 'text-xs text-slate-300', T("Yuklash joyiga yetib kelgach «Kod yuborish» ni bosing: fermer telefoniga 4 xonali kod boradi. Fermer kodni aytgach, uni kiriting."));
    const row = el('div', 'flex flex-wrap items-stretch gap-2');
    const send = el('button', 'flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sky-400/40 text-sky-200 text-sm font-extrabold hover:bg-sky-400/10 transition disabled:opacity-50');
    send.type = 'button';
    send.appendChild(el('i', 'fa-solid fa-paper-plane'));
    send.appendChild(el('span', '', T('Yetib keldim: kod yuborish')));
    const input = el('input', 'auth-input text-center tracking-[0.4em] font-mono text-lg');
    input.style.width = '7.5rem';
    input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 4; input.placeholder = '0000'; input.autocomplete = 'one-time-code';
    input.setAttribute('aria-label', T('Fermerdan olingan kod'));
    const sign = el('button', 'flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-sm font-extrabold hover:bg-emerald-400 transition disabled:opacity-50');
    sign.type = 'button';
    sign.appendChild(el('i', 'fa-solid fa-file-signature'));
    sign.appendChild(el('span', '', T(opts.kind === 'SHIPMENT' ? "Imzolash va yo'lga chiqish" : 'Imzolash')));
    sign.disabled = true;
    const status = el('p', 'text-xs font-semibold text-slate-300 min-h-[1rem]');
    input.addEventListener('input', function () { input.value = input.value.replace(/\D/g, '').slice(0, 4); sign.disabled = input.value.length !== 4; });

    send.addEventListener('click', async function () {
        send.disabled = true;
        try {
            const r = await authed('POST', EBOL_API[opts.kind].otp(opts.id));
            if (r && r.__queued) { send.disabled = false; return; }
            status.textContent = T('Kod {0} raqamiga yuborildi. Muddati: {1} gacha.', r.phone, new Date(r.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            input.focus();
            setTimeout(function () { send.disabled = false; }, (r.resendAfterSeconds || 60) * 1000); // serverdagi kutish vaqti bilan bir xil
        } catch (err) {
            if (err.status !== 401) { status.textContent = lcErr(err); showToast(lcErr(err), 5000, 'error'); }
            send.disabled = false;
        }
    });
    sign.addEventListener('click', async function () {
        sign.disabled = true;
        try {
            const r = await authed('POST', EBOL_API[opts.kind].sign(opts.id), { code: input.value });
            showToast(T('e-BOL imzolandi'), 3000, 'success');
            if (opts.onSigned) opts.onSigned(r);
        } catch (err) {
            if (err.status !== 401) { status.textContent = lcErr(err); showToast(lcErr(err), 5000, 'error'); }
            sign.disabled = input.value.length !== 4;
        }
    });
    row.appendChild(send); row.appendChild(input); row.appendChild(sign);
    box.appendChild(hint); box.appendChild(row); box.appendChild(status);
    return box;
}
