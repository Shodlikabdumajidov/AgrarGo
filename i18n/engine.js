/*
 * AgrarGo i18n (UZ / RU / EN)
 *
 * Arxitektura ("manba matn kalit" usuli, gettext kabi):
 *   - Manba til: o'zbekcha. Kod va HTML'dagi o'zbekcha matn o'zi kalit bo'lib xizmat qiladi.
 *   - Tarjimalar: i18n/ru.js va i18n/en.js  (window.I18N_DICTS.ru / .en = { "o'zbekcha matn": "tarjima" }).
 *     i18n/uz.js — barcha kalitlar ro'yxati (manba), tarjimon uchun.
 *   - O'zgaruvchan qismli matnlar uchun kalitda {0}, {1} ishlatiladi: "Jami: {0}" -> "Итого: {0}".
 *     Ichki qismlar (masalan, "12 soniya oldin") ham rekursiv tarjima qilinadi.
 *   - Statik HTML va JS yaratgan har qanday matn (tugma, modal, alert, xato) DOM kuzatuvchisi orqali avtomatik tarjima qilinadi;
 *     DOM'dan tashqari matnlar (confirm oynasi) uchun T("kalit", ...args) ishlatiladi.
 *   - Tanlangan til localStorage'da saqlanadi. Tarjimasi yo'q matn o'zbekcha ko'rinadi (sayt hech qachon bo'sh qolmaydi).
 *   - Tarjimani tekshirish: node i18n/check.js
 */
(function () {
    'use strict';
    var STORAGE_KEY = 'agrargo_lang';
    var LANGS = {
        uz: { name: "O'zbekcha", short: 'UZ', flag: '🇺🇿' },
        ru: { name: 'Русский', short: 'RU', flag: '🇷🇺' },
        en: { name: 'English', short: 'EN', flag: '🇬🇧' }
    };
    var dicts = window.I18N_DICTS = window.I18N_DICTS || {};
    var lang = 'uz';
    var compiled = {};
    var reverse = null;
    var misses = window.I18N_MISSES = {};      // tarjima topilmagan matnlar (dasturchi uchun: I18N.report())
    var TEXT_SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
    var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
    var textMap = new WeakMap();
    var attrMap = new WeakMap();
    var observer = null;
    var OBS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };

    function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
    function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function esc(s) { return s.replace(/[.*+?^$()|[\]\\]/g, '\\$&'); }

    function compile(l) {
        var d = dicts[l] || {};
        var list = [];
        Object.keys(d).forEach(function (key) {
            if (!/\{\d+\}/.test(key)) return;
            var order = [];
            var src = esc(key).replace(/\{(\d+)\}/g, function (_, n) { order.push(+n); return '(.+?)'; });
            list.push({ key: key, re: new RegExp('^' + src + '$'), order: order, weight: key.replace(/\{\d+\}/g, '').length });
        });
        list.sort(function (a, b) { return b.weight - a.weight; }); // aniqroq (uzunroq doimiy qismli) andoza birinchi
        compiled[l] = list;
    }

    function buildReverse() {
        reverse = {};
        ['ru', 'en'].forEach(function (l) {
            var d = dicts[l] || {};
            Object.keys(d).forEach(function (k) { if (!has(reverse, d[k]) && !/\{\d+\}/.test(k)) reverse[d[k]] = k; });
        });
    }

    function core(text, depth) {
        if (lang === 'uz') return text;
        var d = dicts[lang];
        if (!d) return text;
        if (has(d, text)) return d[text];
        if (depth > 3) return text;
        var pats = compiled[lang];
        for (var i = 0; i < pats.length; i++) {
            var m = pats[i].re.exec(text);
            if (!m) continue;
            var args = [];
            for (var j = 0; j < pats[i].order.length; j++) {
                var raw = m[j + 1], ws = /^(\s*)[\s\S]*?(\s*)$/.exec(raw);
                args[pats[i].order[j]] = ws[1] + core(norm(raw), (depth || 0) + 1) + ws[2];
            }
            return d[pats[i].key].replace(/\{(\d+)\}/g, function (_, n) { return args[+n] === undefined ? '' : args[+n]; });
        }
        return text;
    }

    function translate(raw) {
        if (lang === 'uz') return raw;
        var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
        var text = norm(m[2]);
        if (!text || !/[A-Za-zА-Яа-яЁё']{2,}/.test(text)) return raw;
        var out = core(text, 0);
        if (out === text && !has(dicts[lang] || {}, text) && /[A-Za-z']{3,}/.test(text) && text.length < 160) misses[text] = 1;
        return out === text ? raw : m[1] + out + m[3];
    }

    // Matn: foydalanuvchi ko'rayotgan qiymat (out) bizniki bo'lsa — manba (src) saqlanadi va til almashganda undan qayta tarjima qilinadi
    function sourceOf(data, entry) {
        if (entry && data === entry.out) return entry.src;
        if (reverse && has(reverse, data.trim())) {
            var k = reverse[data.trim()];
            var m = /^(\s*)/.exec(data), t2 = /(\s*)$/.exec(data);
            return m[1] + k + t2[1];
        }
        return data;
    }

    function skipped(node) {
        var p = node.nodeType === 3 ? node.parentElement : node;
        if (!p) return true;
        if (TEXT_SKIP[p.tagName]) return true;
        return !!(p.closest && p.closest('[translate="no"],.notranslate'));
    }

    function doText(node) {
        if (skipped(node)) return;
        var entry = textMap.get(node);
        var src = sourceOf(node.data, entry);
        if (!/[A-Za-zА-Яа-яЁё]{2,}/.test(src)) return;
        var out = translate(src);
        if (out !== node.data) node.data = out;
        textMap.set(node, { src: src, out: out });
    }

    function doAttrs(elm) {
        if (elm.nodeType !== 1 || (elm.closest && elm.closest('[translate="no"],.notranslate'))) return;
        var store = attrMap.get(elm);
        ATTRS.forEach(function (a) {
            if (!elm.hasAttribute(a)) return;
            var val = elm.getAttribute(a);
            var e = store && store[a];
            var src = e && e.out === val ? e.src : (reverse && has(reverse, val) ? reverse[val] : val);
            var out = translate(src);
            if (out !== val) elm.setAttribute(a, out);
            store = store || {};
            store[a] = { src: src, out: out };
        });
        if (store) attrMap.set(elm, store);
        if (elm.tagName === 'INPUT' && /^(button|submit|reset)$/.test(elm.type) && elm.value) {
            var e2 = attrMap.get(elm);
            var vs = (e2 && e2.__v && e2.__v.out === elm.value) ? e2.__v.src : elm.value;
            var vo = translate(vs);
            if (vo !== elm.value) elm.value = vo;
            e2 = e2 || {}; e2.__v = { src: vs, out: vo }; attrMap.set(elm, e2);
        }
    }

    function tree(root) {
        if (!root) return;
        if (root.nodeType === 3) return doText(root);
        if (root.nodeType !== 1) return;
        if (root.closest && root.closest('[translate="no"],.notranslate')) return;
        doAttrs(root);
        root.querySelectorAll('[placeholder],[title],[aria-label],[alt],input[type=button],input[type=submit]').forEach(doAttrs);
        var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var list = [];
        while (w.nextNode()) list.push(w.currentNode);
        list.forEach(doText);
    }

    function onMutations(records) {
        if (lang === 'uz' && !hasForeignState) return; // uz — manba til: tarjima kerak emas
        observer.disconnect();
        try {
            records.forEach(function (r) {
                if (r.type === 'childList') r.addedNodes.forEach(tree);
                else if (r.type === 'characterData') doText(r.target);
                else if (r.type === 'attributes') doAttrs(r.target);
            });
        } finally {
            observer.observe(document.documentElement, OBS);
        }
    }
    var hasForeignState = false; // til hech bo'lmaganda bir marta o'zgargan: manbaga qaytishda ham matnlar tiklanadi

    function refreshHead() {
        var srcTitle = window.I18N_TITLE_SRC || (window.I18N_TITLE_SRC = document.title);
        var titleOut = lang === 'uz' ? srcTitle : core(norm(srcTitle), 0);
        document.title = titleOut;
        var meta = document.querySelector('meta[name="description"]');
        if (meta) {
            var ms = meta.getAttribute('data-src') || meta.getAttribute('content');
            meta.setAttribute('data-src', ms);
            meta.setAttribute('content', lang === 'uz' ? ms : core(norm(ms), 0));
        }
    }

    function detect() {
        try { var s = localStorage.getItem(STORAGE_KEY); if (s && LANGS[s]) return s; } catch (e) {}
        var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'uz';
        nav = String(nav).slice(0, 2).toLowerCase();
        return LANGS[nav] ? nav : 'uz';
    }

    function paintSwitcher() {
        var cur = document.getElementById('lang-current');
        if (cur) cur.textContent = LANGS[lang].short;
        document.querySelectorAll('[data-lang]').forEach(function (b) {
            var on = b.getAttribute('data-lang') === lang;
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            b.classList.toggle('text-emerald-400', on);
        });
    }

    function setLang(l, silent) {
        if (!LANGS[l]) return;
        lang = l;
        if (l !== 'uz') hasForeignState = true;
        try { localStorage.setItem(STORAGE_KEY, l); } catch (e) {}
        document.documentElement.lang = l;
        if (l !== 'uz' && !compiled[l]) compile(l);
        if (!reverse) buildReverse();
        if (observer) observer.disconnect();
        tree(document.body);
        refreshHead();
        paintSwitcher();
        if (observer) observer.observe(document.documentElement, OBS);
        if (!silent) document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: l } }));
    }

    // Matn tarjimasi (DOM'dan tashqari: confirm va h.k.)
    function T(key) {
        var args = Array.prototype.slice.call(arguments, 1);
        var d = dicts[lang];
        var tpl = lang !== 'uz' && d && has(d, key) ? d[key] : key;
        return tpl.replace(/\{(\d+)\}/g, function (_, n) { return args[+n] === undefined ? '' : args[+n]; });
    }

    window.T = T;
    window.I18N = {
        LANGS: LANGS,
        get lang() { return lang; },
        setLang: setLang,
        T: T,
        translate: function (s) { return translate(s); },
        report: function () { return Object.keys(misses); }
    };

    function init() {
        if (!reverse) buildReverse();
        observer = new MutationObserver(onMutations);
        lang = detect();
        document.documentElement.lang = lang;
        if (lang !== 'uz') { hasForeignState = true; compile(lang); tree(document.body); }
        refreshHead();
        paintSwitcher();
        observer.observe(document.documentElement, OBS);
    }
    window.I18N.init = init;
})();
