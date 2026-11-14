// @ts-check
/* ===== «Yangi Alifbo»: yozish vaqtida eski lotin harflarini yangi alifboga avtomatik o'girish =====
 *   o' o‘ o` -> ö   O' O‘ O` -> Ö      g' g‘ g` -> ğ   G' G‘ G` -> Ğ
 *   sh -> ş  Sh/SH -> Ş                ch -> ç  Ch/CH -> Ç
 * Faqat interfeysda (frontend) ishlaydi: server ma'lumoti va tekshiruvlari o'zgarmaydi.
 *
 * Tuzilma (framework'dan mustaqil, tiplar JSDoc + `tsc --checkJs` bilan tekshiriladi):
 *   - convert(text)             toza funksiya (testlanadi)
 *   - NewAlphabet               holat ombori: enabled / set / toggle / subscribe / getSnapshot
 *                               (localStorage + «storage» hodisasi orqali tablararo sinxron;
 *                                subscribe/getSnapshot React'ning useSyncExternalStore bilan to'g'ridan-to'g'ri mos)
 *   - hujjat darajasidagi «input» tinglovchisi: kursor (selectionStart/End) kiritilgan joyda qoladi.
 */

/** @typedef {HTMLInputElement | HTMLTextAreaElement} TextField */

const STORAGE_KEY = 'agrargo_new_alphabet';
/** o/g dan keyin kelishi mumkin bo'lgan tutuq belgilari: ' ‘ ’ ʻ ʼ ` ´ ′ */
const APOSTROPHES = "'‘’ʻʼ`´′";
const APOSTROPHE_RE = new RegExp(`([oOgG])[${APOSTROPHES}]`, 'g');
const DIGRAPH_RE = /(sh|ch)/gi;

/** @type {Readonly<Record<string, string>>} */
const APOSTROPHE_MAP = Object.freeze({ o: 'ö', O: 'Ö', g: 'ğ', G: 'Ğ' });

/**
 * Matnni yangi alifboga o'giradi (idempotent: o'girilgan matn qayta o'zgarmaydi).
 * @param {string} text
 * @returns {string}
 */
function convert(text) {
    if (!text) return text;
    return text
        .replace(APOSTROPHE_RE, (_m, letter) => APOSTROPHE_MAP[/** @type {string} */ (letter)])
        .replace(DIGRAPH_RE, (m) => {
            const upper = m.charAt(0) !== m.charAt(0).toLowerCase(); // Sh / SH -> bosh harf; sh / sH -> kichik
            const isSh = m.charAt(0).toLowerCase() === 's';
            return isSh ? (upper ? 'Ş' : 'ş') : (upper ? 'Ç' : 'ç');
        });
}

// ---------- Holat ombori ----------

/** @returns {boolean} */
function readStored() {
    try { return window.localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; } // maxfiy rejim/blok: o'chiq
}

/** @type {Set<() => void>} */
const listeners = new Set();
let enabled = readStored();

function notify() {
    listeners.forEach((fn) => { try { fn(); } catch (e) { /* bitta tinglovchi xatosi boshqalarga halaqit bermasin */ } });
}

const NewAlphabet = {
    /** @returns {boolean} */
    get enabled() { return enabled; },
    /** useSyncExternalStore uchun */
    getSnapshot() { return enabled; },
    /**
     * @param {boolean} on
     */
    set(on) {
        const next = !!on;
        if (next === enabled) return;
        enabled = next;
        try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch (e) { /* saqlab bo'lmasa ham joriy sahifada ishlaydi */ }
        notify();
    },
    toggle() { this.set(!enabled); },
    /**
     * @param {() => void} fn
     * @returns {() => void} obunani bekor qilish
     */
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

// Boshqa tab (yoki oyna) o'zgartirsa — shu sahifa ham yangilanadi
window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = readStored();
    if (next !== enabled) { enabled = next; notify(); }
});

// ---------- Maydonlar ----------

/** Parol, telefon, kod, qidiruv, e-pochta va shu kabi qiymatlari aniq bo'lishi kerak maydonlar (id / name / autocomplete bo'yicha) */
const SKIP_NAME_RE = /(pass|pwd|phone|tel|otp|code|token|qr|plate|e-?mail|url|login|search|captcha|stir|inn|iban|card|account|username)/i;
const SKIP_INPUT_MODES = ['numeric', 'decimal', 'tel', 'email', 'url', 'search'];

/**
 * Maydon o'girishga yaroqlimi: oddiy matn (<input type="text"> va <textarea>), parol/raqam/e-pochta/telefon/kod emas.
 * Alohida maydonni `data-no-alphabet` atributi bilan chiqarib tashlash mumkin.
 * @param {EventTarget | null} target
 * @returns {target is TextField}
 */
function isEligible(target) {
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return false;
    if (target.readOnly || target.disabled) return false;
    if (target instanceof HTMLInputElement && target.type !== 'text') return false; // password, number, tel, email, search, date, ...
    if (target.closest('[data-no-alphabet]')) return false;
    if (SKIP_INPUT_MODES.indexOf(target.inputMode) !== -1) return false;
    const hint = `${target.id} ${target.name} ${target.autocomplete}`;
    return !SKIP_NAME_RE.test(hint);
}

/** Oxirgi ma'lum qiymat: kiritilgan bo'lakni (prefiks/suffiks farqi bilan) topish uchun */
/** @type {WeakMap<TextField, string>} */
const lastValue = new WeakMap();

/**
 * Eski va yangi qiymat orasidagi o'zgargan oraliq [start, end) (yangi qiymatdagi o'rni).
 * @param {string} prev
 * @param {string} next
 * @returns {{ start: number, end: number }}
 */
function changedRange(prev, next) {
    const max = Math.min(prev.length, next.length);
    let p = 0;
    while (p < max && prev.charCodeAt(p) === next.charCodeAt(p)) p++;
    let s = 0;
    while (s < max - p && prev.charCodeAt(prev.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;
    return { start: p, end: next.length - s };
}

/**
 * Yangi kiritilgan bo'lak atrofini (har tomondan 1 belgi: «s|h», «o|'» juftliklari uchun) o'giradi va kursorni siljitadi.
 * @param {TextField} el
 * @param {string} prev
 */
function convertInserted(el, prev) {
    const next = el.value;
    const { start, end } = changedRange(prev, next);
    if (end <= start) return; // o'chirish yoki o'zgarish yo'q
    const a = Math.max(0, start - 1), b = Math.min(next.length, end + 1);
    const seg = next.slice(a, b);
    const conv = convert(seg);
    if (conv === seg) return;

    const selStart = el.selectionStart, selEnd = el.selectionEnd, dir = el.selectionDirection || 'none';
    /** @param {number} pos kursorning eski o'rni -> yangi o'rni */
    const map = (pos) => {
        if (pos <= a) return pos;
        if (pos >= b) return pos - (seg.length - conv.length);
        return a + convert(seg.slice(0, pos - a)).length;
    };
    el.setRangeText(conv, a, b, 'preserve');
    if (selStart !== null && selEnd !== null) el.setSelectionRange(map(selStart), map(selEnd), dir);
}

/** @param {Event} e */
function onInput(e) {
    if (!enabled) return;
    const el = e.target;
    if (!isEligible(el)) return;
    if (/** @type {InputEvent} */ (e).isComposing) return; // IME yozilmoqda: tugagach o'giriladi
    const prev = lastValue.get(el) ?? '';
    convertInserted(el, prev);
    lastValue.set(el, el.value);
}

/** @param {Event} e */
function onFocusIn(e) {
    if (isEligible(e.target)) lastValue.set(e.target, e.target.value);
}

/** @param {Event} e */
function onCompositionEnd(e) {
    if (!enabled || !isEligible(e.target)) return;
    const el = e.target;
    convertInserted(el, lastValue.get(el) ?? '');
    lastValue.set(el, el.value);
}

// Capture bosqichi: boshqa tinglovchilar (va React onChange) allaqachon o'girilgan qiymatni ko'radi
document.addEventListener('input', onInput, true);
document.addEventListener('focusin', onFocusIn, true);
document.addEventListener('compositionend', onCompositionEnd, true);

// ---------- Menyudagi o'chirgich (switch) ----------

function syncSwitches() {
    document.querySelectorAll('[data-new-alphabet-toggle]').forEach((node) => {
        node.setAttribute('aria-checked', String(enabled));
        node.classList.toggle('on', enabled);
    });
}
NewAlphabet.subscribe(syncSwitches);
// Capture bosqichi: menyu `event.stopPropagation()` qilsa ham bosish qabul qilinadi
document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-new-alphabet-toggle]') : null;
    if (t) NewAlphabet.toggle();
}, true);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncSwitches); else syncSwitches();

Object.assign(window, { NewAlphabet, convertNewAlphabet: convert });
if (typeof module !== 'undefined' && module.exports) module.exports = { convert, changedRange };
