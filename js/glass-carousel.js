/*
 * Glassy Carousel V2: 3D «coverflow» karusel (vanilla JS, kutubxonasiz).
 * Markaziy karta kattaroq, to'liq ravshan va harakatlanuvchi kontur nuri bilan; yon kartalar kichikroq, rotateY bilan qiyshaygan, xira va yengil blur'da.
 * Boshqaruv: Oldingi/Keyingi tugmalari, swipe (touch/sichqoncha), klaviatura strelkalari (←/→, Home/End), nuqtalar.
 * Foydalanish: GlassCarousel.create({ slides: [HTMLElement...], label: 'aria-label', start: 0 }) -> { node, go(i), index(), destroy() }.
 * Har bir slayd ichidagi `.gc-detail` faqat markaziy kartada ko'rinadi (yon kartalarda `inert`), shu sabab tugmalar faqat faol kartada ishlaydi.
 */
(function () {
    'use strict';
    function mk(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
    function tt(s, a) { return typeof window.T === 'function' ? (a === undefined ? window.T(s) : window.T(s, a)) : s; }

    function create(opts) {
        var slides = opts.slides || [];
        var n = slides.length;
        var idx = Math.max(0, Math.min(n - 1, opts.start || 0));
        var swiped = false; // swipe tugagach brauzer yuboradigan «click» kartani qaytarib yubormasligi uchun
        var root = mk('section', 'gc');
        root.setAttribute('role', 'region');
        root.setAttribute('aria-roledescription', 'carousel');
        root.setAttribute('aria-label', opts.label || 'Karusel');
        root.tabIndex = 0;
        var stage = mk('div', 'gc-stage');
        stage.setAttribute('aria-live', 'polite');
        slides.forEach(function (s, i) {
            s.classList.add('gc-slide');
            s.setAttribute('role', 'group');
            s.setAttribute('aria-roledescription', 'slide');
            s.setAttribute('aria-label', (i + 1) + ' / ' + n);
            s.addEventListener('click', function (e) { if (swiped) { e.preventDefault(); e.stopPropagation(); return; } if (i !== idx) { e.preventDefault(); e.stopPropagation(); go(i); } }, true);
            stage.appendChild(s);
        });
        root.appendChild(stage);

        var nav = mk('div', 'gc-nav');
        var prev = mk('button', 'gc-btn gc-prev'); prev.type = 'button'; prev.setAttribute('aria-label', tt('Oldingi')); prev.textContent = '‹';
        var next = mk('button', 'gc-btn gc-next'); next.type = 'button'; next.setAttribute('aria-label', tt('Keyingi')); next.textContent = '›';
        var dots = mk('div', 'gc-dots'); dots.setAttribute('role', 'tablist');
        var count = mk('span', 'gc-count');
        var dotEls = slides.map(function (_, i) {
            var d = mk('button', 'gc-dot'); d.type = 'button'; d.setAttribute('role', 'tab'); d.setAttribute('aria-label', String(i + 1));
            d.addEventListener('click', function () { go(i); });
            if (n <= 12) dots.appendChild(d);
            return d;
        });
        nav.appendChild(prev); if (n <= 12) nav.appendChild(dots); nav.appendChild(count); nav.appendChild(next);
        if (n > 1) root.appendChild(nav);

        function layout() {
            var narrow = root.clientWidth && root.clientWidth < 640;
            var step = narrow ? 42 : 56; // % slayd kengligi
            slides.forEach(function (s, i) {
                var d = i - idx, a = Math.abs(d), sg = d < 0 ? -1 : 1;
                var active = d === 0;
                s.classList.toggle('is-active', active);
                s.classList.toggle('is-near', a === 1);
                s.style.zIndex = String(20 - a);
                s.style.transform = active
                    ? 'translate3d(0,0,0) scale(1.05)'
                    : 'translate3d(' + (sg * step * Math.min(a, 3)) + '%,0,' + (-120 * Math.min(a, 3)) + 'px) rotateY(' + (-sg * 38) + 'deg) scale(.9)';
                s.style.opacity = active ? '1' : a === 1 ? '.55' : a === 2 ? '.25' : '0';
                s.style.pointerEvents = a > 2 ? 'none' : '';
                s.setAttribute('aria-hidden', active ? 'false' : 'true');
                var det = s.querySelector('.gc-detail');
                if (det) { if (active) det.removeAttribute('inert'); else det.setAttribute('inert', ''); }
            });
            dotEls.forEach(function (d, i) { d.classList.toggle('on', i === idx); d.setAttribute('aria-selected', String(i === idx)); });
            count.textContent = (idx + 1) + ' / ' + n;
            prev.disabled = idx <= 0; next.disabled = idx >= n - 1;
        }
        function go(i) {
            i = Math.max(0, Math.min(n - 1, i));
            if (i === idx) return;
            idx = i; layout();
            if (opts.onChange) opts.onChange(idx);
        }
        prev.addEventListener('click', function () { go(idx - 1); });
        next.addEventListener('click', function () { go(idx + 1); });
        root.addEventListener('keydown', function (e) {
            if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
            else if (e.key === 'Home') { e.preventDefault(); go(0); }
            else if (e.key === 'End') { e.preventDefault(); go(n - 1); }
        });
        // Swipe (touch / sichqoncha): gorizontal siljish 45px dan oshsa o'tadi; vertikal scroll bloklanmaydi
        var sx = 0, sy = 0, tracking = false;
        stage.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' && e.button !== 0) return; sx = e.clientX; sy = e.clientY; tracking = true; });
        stage.addEventListener('pointerup', function (e) {
            if (!tracking) return; tracking = false;
            var dx = e.clientX - sx, dy = e.clientY - sy;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) { swiped = true; setTimeout(function () { swiped = false; }, 350); go(idx + (dx < 0 ? 1 : -1)); }
        });
        stage.addEventListener('pointercancel', function () { tracking = false; });
        var onResize = function () { layout(); };
        window.addEventListener('resize', onResize);
        layout();
        return { node: root, go: go, index: function () { return idx; }, destroy: function () { window.removeEventListener('resize', onResize); } };
    }
    window.GlassCarousel = { create: create };
})();
