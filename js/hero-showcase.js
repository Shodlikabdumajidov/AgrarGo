/* ===== Main (Hero): Interactive Character Showcase =====
 * P3.mp4 — Fermer (1-slayd), P2.mp4 — Haydovchi, P1.mp4 — Market egasi (repo ildizidagi videolar). Orqa fon shaffof: alpha kanalli WebM (images/showcase/p*.webm, tools/make-showcase-alpha.py); alpha qo'llamaydigan brauzerlarda (Safari) asl MP4.
 * Aktiv personaj katta ko'rinadi; < > tugmalari va nuqtalar orqali (hamda har 7.5 s da,
 * agar foydalanuvchi tegmasa) silliq fade + scale/slide bilan almashadi. Sarlavha, tushuntirish, CTA va urg'u rangi rolga mos o'zgaradi.
 * Matnlar o'zbekcha manba sifatida DOM'ga yoziladi: i18n engine (UZ/RU/EN) ularni avtomatik tarjima qiladi (i18n/src/41-hero-showcase.txt).
 */
(function () {
    'use strict';
    var root = document.getElementById('hero-showcase');
    if (!root) return;
    var header = document.getElementById('hero-header');
    var videos = Array.prototype.slice.call(root.querySelectorAll('.cs-video'));
    var dotsBox = root.querySelector('.cs-dots');
    var INTERVAL = 7500;

    // Shaffof orqa fon: VP9 alpha WebM (Chrome/Edge/Firefox). Safari alpha'ni ko'rsatmaydi: u yerda asl MP4 (oq fon CSS bilan karta ichiga singdiriladi)
    var isSafari = /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent);
    var test = document.createElement('video');
    var useAlpha = !isSafari && !!test.canPlayType && test.canPlayType('video/webm; codecs="vp9"') !== '';
    root.classList.toggle('cs-alpha', useAlpha); root.classList.toggle('cs-noalpha', !useAlpha);
    videos.forEach(function (v) { v.src = useAlpha ? v.dataset.webm : v.dataset.mp4; });

    // Slaydlar tartibi: 1) Fermer (P3 video — olmali dehqon), 2) Haydovchi (P2 — kuryer), 3) Market egasi (P1 — planshetli sotuvchi)
    var ROLES = [
        { key: 'farmer', name: 'Fermer', poster: 'images/showcase/p3.webp', tag: "Dehqon va bog'bonlar uchun", lead: "Hosilingizni to'g'ridan-to'g'ri", grad: 'xaridorga soting',
          sub: "Vositachisiz, o'z narxingizda soting: do'konlar e'loningizni darhol ko'radi, pul esa escrow orqali kafolatlanadi.", cta: 'Mahsulot joylash',
          go: function () { if (typeof onPostAdClick === 'function') onPostAdClick(); } },
        { key: 'driver', name: 'Haydovchi', poster: 'images/showcase/p2.webp', tag: 'Yuk tashuvchi va logistlar uchun', lead: "Bo'sh yo'lingizni", grad: 'daromadga aylantiring',
          sub: "Yo'nalishingizdagi tayyor yuklarni toping, o'z narxingizni taklif qiling va yo'l haqini kafolatli oling.", cta: 'Yuk topish',
          go: function () { var u = typeof currentUser === 'function' ? currentUser() : null; if (u && typeof openDashboard === 'function') openDashboard(u.role === 'DRIVER' ? 'loads' : undefined); else if (typeof openAuthModal === 'function') openAuthModal('register', 'DRIVER'); } },
        { key: 'market', name: 'Market egasi', poster: 'images/showcase/p1.webp', tag: "Bozor, do'kon va ulgurji xaridorlar uchun", lead: 'Yangi hosilni fermerdan', grad: 'bevosita xarid qiling',
          sub: "Sifatli mahsulotni to'g'ri narxda toping, PIN-kod bilan qabul qiling — pulingiz yuk topshirilguncha escrow'da xavfsiz.", cta: 'Xarid qilish',
          go: function () { if (typeof openCatalog === 'function') openCatalog(); } }
    ];


    var n = ROLES.length, idx = 0, timer = null, touched = false;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function set(id, text) { var e = document.getElementById(id); if (e) e.textContent = text; }

    // Nuqtalar
    ROLES.forEach(function (r, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'cs-dot'; b.setAttribute('role', 'tab'); b.setAttribute('aria-label', r.name); b.dataset.i = String(i);
        b.addEventListener('click', function () { go(i, true); });
        dotsBox.appendChild(b);
    });

    function play(v) { try { var p = v.play(); if (p && p.catch) p.catch(function () { /* autoplay bloklangan: poster ko'rinib turadi */ }); } catch (e) { /* */ } }
    function preloadNext() { var nv = videos[(idx + 1) % n]; if (nv && nv.preload !== 'auto') { nv.preload = 'auto'; try { nv.load(); } catch (e) { /* */ } } }

    function paintText(animate) {
        var r = ROLES[idx];
        var apply = function () {
            set('cs-tag', ''); var tag = document.getElementById('cs-tag');
            if (tag) { tag.innerHTML = '<i class="fa-solid fa-circle"></i> <span></span>'; tag.querySelector('span').textContent = r.tag; }
            set('cs-title-lead', r.lead); set('cs-title-grad', r.grad); set('cs-sub', r.sub);
            var cta = document.getElementById('cs-cta'); if (cta) cta.querySelector('span').textContent = r.cta;
        };
        var box = document.getElementById('cs-text-box') || header.querySelector('.lg\\:col-span-7');
        if (!animate || reduce || !box) { apply(); return; }
        box.classList.add('cs-swap');
        setTimeout(function () { apply(); box.classList.remove('cs-swap'); }, 220);
    }

    function paintState() {
        root.dataset.role = ROLES[idx].key; if (header) header.dataset.role = ROLES[idx].key;
        Array.prototype.forEach.call(dotsBox.children, function (d, i) { d.classList.toggle('on', i === idx); d.setAttribute('aria-selected', String(i === idx)); });
    }

    function go(to, user, dir) {
        to = ((to % n) + n) % n;
        if (to === idx) return;
        var from = idx; idx = to;
        var d = dir || (to > from || (from === n - 1 && to === 0) ? 1 : -1);
        var fv = videos[from], tv = videos[to];
        root.dataset.dir = d > 0 ? 'fwd' : 'back';
        fv.classList.remove('is-on'); fv.classList.add('is-out');
        tv.classList.remove('is-out'); try { tv.currentTime = 0; } catch (e) { /* */ } play(tv); tv.classList.add('is-on');
        setTimeout(function () { fv.classList.remove('is-out'); if (idx !== from) { try { fv.pause(); } catch (e) { /* */ } } }, reduce ? 0 : 700);
        paintState(); paintText(true); preloadNext();
        if (user) { touched = true; }
        restart();
    }

    function tick() { if (!document.hidden && !hovering && !reduce) go(idx + 1, false, 1); }
    function restart() { clearInterval(timer); if (!reduce) timer = setInterval(tick, INTERVAL); }

    var hovering = false;
    root.addEventListener('pointerenter', function () { hovering = true; });
    root.addEventListener('pointerleave', function () { hovering = false; });
    root.addEventListener('focusin', function () { hovering = true; });
    root.addEventListener('focusout', function () { hovering = false; });
    document.getElementById('cs-prev').addEventListener('click', function () { go(idx - 1, true, -1); });
    document.getElementById('cs-next').addEventListener('click', function () { go(idx + 1, true, 1); });
    root.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1, true, -1); } else if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1, true, 1); } });
    var cta = document.getElementById('cs-cta');
    if (cta) cta.addEventListener('click', function () { ROLES[idx].go(); });

    // Faqat ko'rinib turgan aktiv video o'ynaydi (batareya/CPU)
    document.addEventListener('visibilitychange', function () { var v = videos[idx]; if (document.hidden) { try { v.pause(); } catch (e) { /* */ } } else play(v); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { es.forEach(function (en) { var v = videos[idx]; if (en.isIntersecting) play(v); else { try { v.pause(); } catch (e) { /* */ } } }); }, { threshold: 0.1 }).observe(root);

    paintState(); paintText(false); play(videos[0]); preloadNext();
    window.addEventListener('load', function () { videos.forEach(function (v) { if (v.preload !== 'auto') { v.preload = 'auto'; } }); }); // keyingi videolar oldindan yuklanadi
    restart();
    window.HeroShowcase = { go: function (i) { go(i, true); }, stop: function () { clearInterval(timer); timer = null; }, index: function () { return idx; }, roles: ROLES.map(function (r) { return r.key; }) };
})();
