// @ts-check
/* ===== Unumdorlik: kuchsiz qurilmalarni aniqlash va «Yengil rejim» (html.perf-lite) =====
 * Tartib: 1) foydalanuvchi tanlovi (localStorage 'agrargo_perf': 'lite' | 'full'), 2) ?perf=lite|full,
 *         3) qurilma belgilari (CPU yadrolari, xotira, trafik tejash), 4) 1.5 s dan so'ng kadr tezligini o'lchash (past bo'lsa avtomatik yoqiladi).
 * Qo'shimcha: overlay (kabinet/rol sahifasi) ochiq bo'lsa `html.overlay-open` / `html.dash-open`, tab yashirin bo'lsa `html.tab-hidden`
 * — CSS (css/perf-layout.css) orqadagi animatsiyalarni to'xtatadi.
 */
(function () {
    'use strict';
    var KEY = 'agrargo_perf';
    var root = document.documentElement;

    /** @returns {string | null} */
    function stored() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
    /** @param {string | null} v */
    function store(v) { try { if (v) window.localStorage.setItem(KEY, v); else window.localStorage.removeItem(KEY); } catch (e) { /* maxfiy rejim */ } }

    /** @returns {boolean} qurilma belgilari bo'yicha kuchsizmi */
    function weakDevice() {
        var nav = /** @type {Navigator & { deviceMemory?: number, connection?: { saveData?: boolean } }} */ (navigator);
        if (nav.connection && nav.connection.saveData) return true;
        if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true;
        return typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2;
    }

    /** @type {Array<() => void>} */
    var listeners = [];
    var lite = false;
    /** @param {boolean} on */
    function apply(on) {
        lite = on;
        root.classList.toggle('perf-lite', on);
        listeners.forEach(function (fn) { try { fn(); } catch (e) { /* tinglovchi xatosi boshqalarga halaqit bermasin */ } });
    }

    var param = new URLSearchParams(location.search).get('perf');
    var pref = param === 'lite' || param === 'full' ? param : stored();
    apply(pref === 'lite' || (pref !== 'full' && (pref === 'auto-lite' || weakDevice())));

    var Perf = {
        /** @returns {boolean} */
        get lite() { return lite; },
        /** @param {boolean} on  foydalanuvchi aniq tanlovi (avtomatikani bekor qiladi) */
        set: function (on) { store(on ? 'lite' : 'full'); apply(on); },
        toggle: function () { this.set(!lite); },
        /** @param {() => void} fn */
        subscribe: function (fn) { listeners.push(fn); }
    };
    Object.assign(window, { Perf: Perf });

    // ---- Tab yashirin: animatsiyalar to'xtaydi ----
    document.addEventListener('visibilitychange', function () { root.classList.toggle('tab-hidden', document.hidden); });

    // ---- Overlay ochiq: orqadagi sahifa animatsiyalari to'xtaydi ----
    function syncOverlay() {
        var dash = document.getElementById('dashboard-view');
        var role = document.getElementById('role-page');
        var d = !!(dash && dash.classList.contains('open'));
        root.classList.toggle('dash-open', d);
        root.classList.toggle('overlay-open', d || !!(role && role.classList.contains('open')));
    }

    // ---- Menyudagi o'chirgich (Yangi Alifbo bilan bir xil ko'rinish) ----
    function syncSwitches() {
        document.querySelectorAll('[data-perf-toggle]').forEach(function (n) { n.setAttribute('aria-checked', String(lite)); n.classList.toggle('on', lite); });
    }
    Perf.subscribe(syncSwitches);
    document.addEventListener('click', function (e) {
        var t = e.target instanceof Element ? e.target.closest('[data-perf-toggle]') : null;
        if (t) Perf.toggle();
    }, true); // menyu stopPropagation qilsa ham ishlaydi

    document.addEventListener('DOMContentLoaded', function () {
        syncSwitches();
        syncOverlay();
        var mo = new MutationObserver(syncOverlay);
        ['dashboard-view', 'role-page'].forEach(function (id) {
            var n = document.getElementById(id);
            if (n) mo.observe(n, { attributes: true, attributeFilter: ['class'] });
        });
    });

    // ---- Kadr tezligini o'lchash: sahifa yuklangach bir marta (faqat "avtomatik" rejimda) ----
    if (pref === null && !lite && 'requestAnimationFrame' in window) {
        window.addEventListener('load', function () {
            setTimeout(function () {
                /** @type {number[]} */
                var dts = [];
                var last = 0;
                function tick(/** @type {number} */ t) {
                    if (document.hidden) return; // fon tabda o'lchash noto'g'ri bo'ladi
                    if (last) dts.push(t - last);
                    last = t;
                    if (dts.length < 50) { requestAnimationFrame(tick); return; }
                    dts.sort(function (a, b) { return a - b; });
                    var median = dts[dts.length >> 1];
                    if (median > 34 && stored() === null) { store('auto-lite'); apply(true); } // <30 kadr/s: keyingi tashriflarda ham yengil
                }
                requestAnimationFrame(tick);
            }, 1500);
        });
    }
})();
