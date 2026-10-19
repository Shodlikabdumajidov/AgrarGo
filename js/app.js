        AOS.init({
            duration: 800,
            once: false,
            mirror: true,
            offset: 80
        });

        // Sidebar logic
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        function toggleSidebar() {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('open');
        }

        // Custom Dropdown logic with animation
        const dropdownMenu = document.getElementById('custom-dropdown-menu');
        const dropdownIcon = document.getElementById('dropdown-icon');

        function toggleDropdown(event) {
            event.stopPropagation();
            dropdownMenu.classList.toggle('open');
            dropdownIcon.classList.toggle('rotate-180');
        }

        function selectOption(value) {
            document.getElementById('selected-text').innerText = value;
            if (typeof setMarketCategory === 'function') setMarketCategory(value === "Barcha yo'nalishlar" ? '' : value);
            dropdownMenu.classList.remove('open');
            dropdownIcon.classList.remove('rotate-180');
        }

        // Close dropdown when clicking outside
        window.addEventListener('click', function() {
            if (dropdownMenu.classList.contains('open')) {
                dropdownMenu.classList.remove('open');
                dropdownIcon.classList.remove('rotate-180');
            }
        });

        // ===== AUTH (Login / Register) =====
        const API_URL = 'http://localhost:3000'; // production'da backend manziliga almashtiring
        const TOKEN_KEY = 'agrargo_token';
        const USER_KEY = 'agrargo_user';

        const authModal = document.getElementById('auth-modal');
        const authAlert = document.getElementById('auth-alert');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');

        function storageGet(key) {
            try { return localStorage.getItem(key); } catch (e) { return null; }
        }
        function storageSet(key, value) {
            try { localStorage.setItem(key, value); } catch (e) {}
        }
        function storageRemove(key) {
            try { localStorage.removeItem(key); } catch (e) {}
        }

        let afterLoginAction = null; // kirgandan keyin bajariladigan amal

        // Sahifa skrolli: biror modal/panel/kabinet ochiq bo'lsa qulflanadi
        function syncScrollLock() {
            const open = ['auth-modal', 'product-modal', 'booking-modal', 'payment-modal', 'wh-modal', 'price-modal', 'rate-modal', 'face-modal', 'bd-modal', 'my-products-panel', 'dashboard-view', 'role-page', 'not-found'].some(function (id) {
                const node = document.getElementById(id);
                return node && node.classList.contains('open');
            });
            document.body.classList.toggle('overflow-hidden', open);
        }

        const REGIONS = ['Toshkent shahri', 'Toshkent viloyati', 'Andijon', 'Buxoro', "Farg'ona", 'Jizzax', 'Namangan', 'Navoiy',
            'Qashqadaryo', "Qoraqalpog'iston", 'Samarqand', 'Sirdaryo', 'Surxondaryo', 'Xorazm'];

        const ROLE_META = {
            FARMER: { label: 'Fermer', badge: 'AgrarGo Farm', icon: 'fa-seedling',
                regTitle: "Fermer sifatida ro'yxatdan o'tish", regSub: "Bepul ro'yxatdan o'ting va mahsulotingizni vositachisiz soting." },
            DRIVER: { label: 'Haydovchi', badge: 'AgrarGo Driver', icon: 'fa-truck-fast',
                regTitle: "Haydovchi sifatida ro'yxatdan o'tish", regSub: "Transport ma'lumotlaringizni kiriting va yuk buyurtmalarini oling." },
            DISPATCHER: { label: 'Dispetcher', badge: 'AgrarGo Ombor', icon: 'fa-warehouse', regTitle: '', regSub: '' },
            ADMIN: { label: 'Admin', badge: 'AgrarGo Admin', icon: 'fa-user-shield', regTitle: '', regSub: '' },
            MARKET: { label: 'Market', badge: 'AgrarGo Market', icon: 'fa-store',
                regTitle: "Market sifatida ro'yxatdan o'tish", regSub: "Kompaniyangiz nomidan fermerlardan bevosita xarid qiling." }
        };
        const REGISTER_FORM_IDS = { FARMER: 'register-form', DRIVER: 'register-driver-form', MARKET: 'register-market-form' };
        let authRole = 'FARMER';  // ro'yxatdan o'tish formasi uchun tanlangan rol
        let loginRole = null;     // sidebar orqali tanlangan bo'lsa, kirish shu rol bilan cheklanadi

        // Viloyat ro'yxatlari (yangi formalar uchun) bir joydan to'ldiriladi
        document.querySelectorAll('select[data-regions]').forEach(function (sel) {
            REGIONS.forEach(function (r) { sel.appendChild(new Option(r, r)); });
        });

        function openAuthModal(tab, role) {
            loginRole = role || null;
            if (role) authRole = role;
            switchAuthTab(tab || 'login');
            authModal.classList.add('open');
            syncScrollLock();
        }

        function setAuthRole(role) {
            authRole = role;
            switchAuthTab('register');
        }

        function closeAuthModal() {
            authModal.classList.remove('open');
            if (typeof clearResetFlow === 'function') { clearResetFlow(); hideAllPasswords(); } // kod va token xotirada qolmasin
            syncScrollLock();
        }

        function switchAuthTab(tab) {
            const isLogin = tab === 'login';
            const meta = ROLE_META[authRole];
            if (resetStep) {
                // Parolni tiklash oqimidan chiqish: tablar qaytadi, holat tozalanadi
                clearResetFlow();
                document.getElementById('auth-tabs').classList.remove('hidden');
            }
            loginForm.classList.toggle('hidden', !isLogin);
            Object.keys(REGISTER_FORM_IDS).forEach(function (r) {
                document.getElementById(REGISTER_FORM_IDS[r]).classList.toggle('hidden', isLogin || r !== authRole);
            });
            document.getElementById('tab-login').classList.toggle('active', isLogin);
            document.getElementById('tab-register').classList.toggle('active', !isLogin);
            document.getElementById('role-pills').classList.toggle('hidden', isLogin);
            document.querySelectorAll('.role-pill').forEach(function (b) { b.classList.toggle('active', b.dataset.role === authRole); });

            const showRole = !isLogin || loginRole;
            document.getElementById('auth-role-badge').innerText = showRole ? meta.badge : 'AgrarGo';
            document.getElementById('auth-role-icon').className = 'fa-solid ' + (showRole ? meta.icon : 'fa-user');
            document.getElementById('auth-title').innerText = isLogin
                ? (loginRole ? meta.label + ' sifatida kirish' : 'Kabinetga Kirish')
                : meta.regTitle;
            document.getElementById('auth-subtitle').innerText = isLogin
                ? 'Telefon raqamingiz va parolingiz bilan kiring.'
                : meta.regSub;
            hideAuthAlert();
        }

        function showAuthAlert(messages, type, target) {
            const box = target || authAlert;
            const list = Array.isArray(messages) ? messages : [messages];
            const isError = type !== 'success' && type !== 'info';
            box.className = 'mb-5 rounded-2xl px-4 py-3 text-sm font-medium border ' + (type === 'info'
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                : isError
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300');
            box.innerHTML = list.map(function (m) {
                const div = document.createElement('div');
                div.className = 'flex items-start gap-2';
                const icon = document.createElement('i');
                icon.className = 'fa-solid mt-0.5 ' + (type === 'info' ? 'fa-circle-info' : isError ? 'fa-circle-exclamation' : 'fa-circle-check');
                const span = document.createElement('span');
                span.textContent = m; // textContent: server xabari HTML sifatida talqin qilinmaydi
                div.appendChild(icon);
                div.appendChild(span);
                return div.outerHTML;
            }).join('');
        }

        function hideAuthAlert(target) {
            const box = target || authAlert;
            box.className = 'hidden';
            box.innerHTML = '';
        }

        // "90 123 45 67" / "+998901234567" / "998901234567" -> "+998901234567"
        function normalizePhone(raw) {
            let digits = String(raw).replace(/\D/g, '');
            if (digits.startsWith('998')) digits = digits.slice(3);
            return '+998' + digits;
        }

        function setLoading(form, loading) {
            const btn = form.querySelector('.auth-submit');
            const label = btn.querySelector('span');
            btn.disabled = loading;
            if (loading) {
                btn.dataset.label = label.innerText;
                label.innerText = 'Yuborilmoqda...';
            } else if (btn.dataset.label) {
                label.innerText = btn.dataset.label;
            }
        }

        function authRequest(path, payload, token) {
            return apiRequest('POST', path, payload, token);
        }

        async function apiRequest(method, path, payload, token, opts) {
            let res;
            try {
                const headers = {};
                if (payload !== undefined) headers['Content-Type'] = 'application/json';
                if (token) headers['Authorization'] = 'Bearer ' + token;
                res = await fetch(API_URL + path, {
                    method: method,
                    headers: headers,
                    body: payload !== undefined ? JSON.stringify(payload) : undefined
                });
            } catch (e) {
                // Oflayn navbat: tanlangan amallar IndexedDB'ga saqlanadi va aloqa tiklangach yuboriladi
                if (token && !(opts && opts.noQueue)) { const queued = await oqEnqueue(method, path, payload); if (queued) return queued; }
                console.error('[API xato]', method, path, '-> tarmoq xatosi (server ishlamayapti yoki CORS)', e);
                throw { status: 0, messages: ["Serverga ulanib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring."] };
            }
            let data = null;
            try { data = await res.json(); } catch (e) {}
            if (!res.ok) {
                const raw = data && data.message ? data.message : null;
                let messages;
                if (res.status === 400) messages = Array.isArray(raw) ? raw : [raw || "Ma'lumotlar noto'g'ri kiritilgan."];
                else if (res.status === 401) messages = [raw || "Telefon raqam yoki parol noto'g'ri."];
                else if (res.status === 403) messages = ["Bu amal faqat fermerlar uchun."];
                else if (res.status === 429) messages = [raw || "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring."];
                else if (res.status === 404) messages = ["E'lon topilmadi. U allaqachon o'chirilgan bo'lishi mumkin."];
                else if (res.status === 409) messages = [raw || "Bu telefon raqam allaqachon ro'yxatdan o'tgan."];
                else if (typeof raw === 'string' && res.status < 500) messages = [raw];
                else messages = ['Serverda xatolik yuz berdi (kod ' + res.status + "). Keyinroq qayta urinib ko'ring."];
                // Dasturchi uchun: server aniq nima qaytargani konsolda (parol yashiriladi)
                try {
                    const sent = payload && typeof payload === 'object' ? Object.assign({}, payload) : payload;
                    ['password', 'currentPassword', 'newPassword'].forEach(function (k) { if (sent && k in sent) sent[k] = '***'; });
                    console.error('[API xato]', method, path, '->', res.status, { yuborildi: sent, javob: data });
                } catch (e) {}
                if (res.status === 402 && data && data.code === 'SUBSCRIPTION_REQUIRED') setTimeout(handleSubscriptionRequired, 0);
                throw { status: res.status, messages: messages, raw: typeof raw === 'string' ? raw : null, code: data && data.code };
            }
            return data;
        }

        function saveSession(data) {
            storageSet(TOKEN_KEY, data.accessToken);
            rememberRole(data.user.role);
            saveUser(data.user);
        }

        function saveUser(user) {
            storageSet(USER_KEY, JSON.stringify(user));
            updateAuthButton();
        }

        function getStoredUser() {
            try { return JSON.parse(storageGet(USER_KEY)); } catch (e) { return null; }
        }

        function currentUser() {
            return storageGet(TOKEN_KEY) ? getStoredUser() : null;
        }

        // Qaysi rollarda ro'yxatdan o'tilgani eslab qolinadi: sidebar'dan rol tanlanganda kirish yoki ro'yxatdan o'tish oynasini aniqlaydi
        function rememberRole(role) {
            let roles = [];
            try { roles = JSON.parse(storageGet('agrargo_roles')) || []; } catch (e) {}
            if (roles.indexOf(role) === -1) roles.push(role);
            storageSet('agrargo_roles', JSON.stringify(roles));
        }

        function isRoleKnown(role) {
            try { return (JSON.parse(storageGet('agrargo_roles')) || []).indexOf(role) !== -1; } catch (e) { return false; }
        }

        function avatarNode(user, extraCls) {
            if (user.avatarUrl) {
                const img = el('img', 'w-full h-full object-cover ' + (extraCls || ''));
                img.src = API_URL + user.avatarUrl;
                img.alt = user.fullName;
                return img;
            }
            const initials = user.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
            return el('span', extraCls || '', initials || '?');
        }

        function updateAuthButton() {
            const user = currentUser();
            const avatarBox = document.getElementById('auth-nav-avatar');
            document.getElementById('auth-nav-label').innerText = user ? user.fullName : 'Kabinetga Kirish';
            document.getElementById('auth-nav-caret').classList.toggle('hidden', !user);
            if (user) {
                avatarBox.replaceChildren(avatarNode(user));
                document.getElementById('account-avatar').replaceChildren(avatarNode(user));
                document.getElementById('account-name').innerText = user.fullName;
                document.getElementById('account-sub').innerText = ROLE_META[user.role] ? ROLE_META[user.role].label + ' · ' + user.phone : user.phone;
                document.getElementById('account-products-item').classList.toggle('hidden', user.role !== 'FARMER');
            } else {
                avatarBox.replaceChildren(el('i', 'fa-solid fa-user text-sm'));
                closeAccountMenu();
            }
            if (typeof renderDashHeader === 'function') renderDashHeader();
            try { bnSync(); } catch (e) { /* pastki panel hali yaratilmagan */ }
            const al = document.getElementById('auth-nav-btn');
            al.setAttribute('aria-label', user ? user.fullName : 'Kabinetga Kirish');
            al.title = user ? user.fullName : 'Kabinetga Kirish';
        }

        // Sahifa ochilganda sessiya yangilanadi (rasm, rol ma'lumotlari); token yaroqsiz bo'lsa jimgina tozalanadi
        async function refreshSession() {
            const token = storageGet(TOKEN_KEY);
            if (!token) return;
            try {
                saveUser(await apiRequest('GET', '/profile', undefined, token));
            } catch (err) {
                if (err.status === 401) { storageRemove(TOKEN_KEY); storageRemove(USER_KEY); updateAuthButton(); }
            }
        }

        // ===== Account dropdown =====
        const accountMenu = document.getElementById('account-menu');

        function closeAccountMenu() {
            accountMenu.classList.remove('open');
            document.getElementById('auth-nav-caret').classList.remove('rotate-180');
        }

        function onAuthButtonClick(event) {
            event.stopPropagation();
            if (storageGet(TOKEN_KEY)) {
                const open = accountMenu.classList.toggle('open');
                document.getElementById('auth-nav-caret').classList.toggle('rotate-180', open);
            } else {
                openAuthModal('login');
            }
        }

        function logout() {
            stopTracker('');
            storageRemove(TOKEN_KEY);
            storageRemove(USER_KEY);
            closeAccountMenu();
            closeMyProducts();
            closeDashboard();
            updateAuthButton();
            showToast('Tizimdan chiqdingiz.');
        }

        window.addEventListener('click', closeAccountMenu);

        let toastTimer = null;
        // ===== Tovush effektlari (Web Audio API): qisqa, yoqimli signallar; sozlamalardan o'chiriladi =====
        const SFX_KEY = 'agrargo_sound';
        const sfx = {
            ctx: null,
            on: storageGet(SFX_KEY) !== 'off',
            ensure: function () {
                if (!this.ctx) {
                    const AC = window.AudioContext || window.webkitAudioContext;
                    if (!AC) return null;
                    try { this.ctx = new AC(); } catch (e) { return null; }
                }
                if (this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
                return this.ctx;
            },
            tone: function (freq, at, dur, o) {
                const c = this.ctx, opt = o || {};
                const osc = c.createOscillator(), g = c.createGain();
                osc.type = opt.type || 'sine';
                osc.frequency.setValueAtTime(freq, at);
                if (opt.to) osc.frequency.exponentialRampToValueAtTime(opt.to, at + dur);
                const vol = opt.vol || 0.14;
                g.gain.setValueAtTime(0.0001, at);
                g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
                g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
                osc.connect(g); g.connect(c.destination);
                osc.start(at); osc.stop(at + dur + 0.03);
            },
            play: function (name) {
                if (!this.on) return;
                const c = this.ensure();
                if (!c) return;
                const t = c.currentTime + 0.02, s = this;
                const seq = function (notes, step, dur, o) { notes.forEach(function (f, i) { s.tone(f, t + i * step, dur, o); }); };
                if (name === 'success') seq([523.25, 659.25, 783.99], 0.085, 0.22);
                else if (name === 'booking') seq([587.33, 880], 0.1, 0.26, { type: 'triangle', vol: 0.16 });
                else if (name === 'price') { s.tone(987.77, t, 0.14, { type: 'square', vol: 0.05 }); s.tone(1318.5, t + 0.09, 0.3, { type: 'square', vol: 0.05 }); }
                else if (name === 'subscription') { seq([523.25, 659.25, 783.99, 1046.5], 0.08, 0.34, { vol: 0.12 }); s.tone(1568, t + 0.3, 0.5, { vol: 0.05 }); }
                else if (name === 'warn') seq([440, 440], 0.16, 0.12, { type: 'triangle', vol: 0.12 });
                else if (name === 'error') s.tone(220, t, 0.28, { type: 'sawtooth', to: 150, vol: 0.07 });
                else if (name === 'sync') seq([659.25, 880, 1174.66], 0.07, 0.18, { type: 'triangle', vol: 0.12 });
                else s.tone(1200, t, 0.07, { vol: 0.08 });
            },
            set: function (on) {
                this.on = !!on;
                storageSet(SFX_KEY, on ? 'on' : 'off');
                document.querySelectorAll('[data-sfx-toggle]').forEach(function (b) { syncSoundToggle(b); });
                if (on) this.play('tick');
            }
        };
        function syncSoundToggle(b) {
            b.setAttribute('aria-pressed', String(sfx.on));
            b.title = sfx.on ? "Tovushni o'chirish" : 'Tovushni yoqish';
            b.setAttribute('aria-label', b.title);
            const i = b.querySelector('i');
            if (i) i.className = ['fa-solid', sfx.on ? 'fa-volume-high' : 'fa-volume-xmark'].join(' ');
        }

        // ===== Toast bildirishnomalar: glassmorphism, burchakda, o'zi yo'qoladi =====
        // type: 'success' (yashil) | 'error' (qizil) | 'warning' (sariq) | 'info'. Berilmasa matndan aniqlanadi.
        const TOAST_ICON = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
        function toastType(msg) {
            const m = String(msg).toLowerCase();
            if (/xato|bo'lmadi|noto'g'ri|ulanib bo'lmadi|rad etildi|bloklan|ruxsat yo'q|topilmadi|muvaffaqiyatsiz|tugadi|yaroqsiz|oshmasligi|faqat .* yuklang/.test(m)) return 'error';
            if (/ehtiyot|diqqat|oflayn|internet uzildi|kutilmoqda|ogohlantir|tavsiya/.test(m)) return 'warning';
            if (/saqlandi|yangilandi|tasdiqlandi|joylandi|qo'shildi|o'chirildi|olib tashlandi|nusxalandi|muvaffaqiyatli|yuborildi|yuklab olindi|sinxronlash|bajarildi|uzaytirildi|tayyor/.test(m)) return 'success';
            return 'info';
        }
        function showToast(message, duration, type) {
            const stack = document.getElementById('toast-stack');
            if (!stack) return;
            const kind = type || toastType(message);
            const t = el('div', ['toast-item', kind].join(' '));
            t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
            const ic = el('span', 'toast-ic');
            ic.appendChild(el('i', ['fa-solid', TOAST_ICON[kind]].join(' ')));
            t.appendChild(ic);
            t.appendChild(el('span', 'toast-msg', message));
            const x = el('button', 'toast-x');
            x.type = 'button'; x.setAttribute('aria-label', 'Yopish');
            x.appendChild(el('i', 'fa-solid fa-xmark'));
            t.appendChild(x);
            const life = duration || (kind === 'error' ? 5200 : 3400);
            const bar = el('i', 'toast-bar');
            bar.style.animationDuration = life + 'ms';
            t.appendChild(bar);
            let timer = null;
            const close = function () {
                clearTimeout(timer);
                t.classList.add('out');
                setTimeout(function () { t.remove(); }, 320);
            };
            const arm = function () { clearTimeout(timer); t.classList.remove('paused'); timer = setTimeout(close, life); };
            t.addEventListener('pointerenter', function () { clearTimeout(timer); t.classList.add('paused'); });
            t.addEventListener('pointerleave', arm);
            x.addEventListener('click', close);
            stack.appendChild(t);
            while (stack.children.length > 4) stack.firstChild.remove();
            arm();
            if (kind === 'error') sfx.play('error');
            else if (kind === 'warning') sfx.play('warn');
        }

        function onAuthSuccess(data, message) {
            saveSession(data);
            showAuthAlert(message, 'success');
            setTimeout(function () {
                closeAuthModal();
                loginForm.reset();
                Object.keys(REGISTER_FORM_IDS).forEach(function (r) { document.getElementById(REGISTER_FORM_IDS[r]).reset(); });
                hideAuthAlert();
                if (afterLoginAction) {
                    const action = afterLoginAction;
                    afterLoginAction = null;
                    action();
                }
            }, 1200);
        }

        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideAuthAlert();
            const phone = normalizePhone(loginForm.phone.value);
            const password = loginForm.password.value;
            const errors = [];
            if (!/^\+998\d{9}$/.test(phone)) errors.push("Telefon raqamni to'liq kiriting (9 ta raqam).");
            if (!password) errors.push('Parolni kiriting.');
            if (errors.length) return showAuthAlert(errors);

            setLoading(loginForm, true);
            try {
                const data = await authRequest('/auth/login', loginRole ? { phone: phone, password: password, role: loginRole } : { phone: phone, password: password });
                onAuthSuccess(data, 'Xush kelibsiz, ' + data.user.fullName + '!');
            } catch (err) {
                showAuthAlert(err.messages);
            } finally {
                setLoading(loginForm, false);
            }
        });

        // ===== PAROL: ko'rsatish/berkitish (ko'z), siyosat, tiklash =====
        const EYE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
        const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

        // Har bir parol maydoniga ko'z tugmasi qo'shadi (SVG: ikonka shrifti yuklanmasa ham ko'rinadi)
        function attachPasswordToggle(input) {
            if (input.dataset.pwToggle) return;
            input.dataset.pwToggle = '1';
            const wrap = document.createElement('div');
            wrap.className = 'relative';
            input.parentNode.insertBefore(wrap, input);
            wrap.appendChild(input);
            input.style.paddingRight = '3rem';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-400 transition';
            btn.setAttribute('aria-label', "Parolni ko'rsatish");
            btn.setAttribute('aria-pressed', 'false');
            btn.tabIndex = 0;
            btn.innerHTML = EYE_SVG;
            btn.addEventListener('click', function () {
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                btn.innerHTML = show ? EYE_OFF_SVG : EYE_SVG;
                btn.setAttribute('aria-label', show ? 'Parolni berkitish' : "Parolni ko'rsatish");
                btn.setAttribute('aria-pressed', show ? 'true' : 'false');
                input.focus();
            });
            wrap.appendChild(btn);
        }

        // Modal yopilganda ochiq qolgan parollar yana berkitiladi
        function hideAllPasswords() {
            document.querySelectorAll('input[data-pw-toggle]').forEach(function (input) {
                if (input.type === 'text') {
                    input.type = 'password';
                    const btn = input.parentNode.querySelector('button');
                    if (btn) { btn.innerHTML = EYE_SVG; btn.setAttribute('aria-label', "Parolni ko'rsatish"); btn.setAttribute('aria-pressed', 'false'); }
                }
            });
        }

        // Parol siyosati serverniki bilan bir xil (server baribir tekshiradi): kamida 8 belgi, harf va raqam, 72 baytdan oshmasin
        const COMMON_PASSWORDS = ['password1', 'password12', 'password123', 'password1234', 'qwerty123', 'qwerty1234', 'qwerty12345',
            'abcd1234', 'abc12345', 'a1234567', 'a12345678', 'q1w2e3r4', 'iloveyou1', 'welcome1', 'admin123', 'admin1234', 'agrargo1', 'agrargo123'];

        function passwordProblems(pw) {
            const problems = [];
            if (Array.from(pw).length < 8) problems.push("Parol kamida 8 ta belgidan iborat bo'lishi kerak");
            if (new TextEncoder().encode(pw).length > 72) problems.push("Parol juda uzun (ko'pi bilan 72 bayt)");
            if (!/\p{L}/u.test(pw)) problems.push("Parolda kamida bitta harf bo'lishi kerak");
            if (!/\d/.test(pw)) problems.push("Parolda kamida bitta raqam bo'lishi kerak");
            if (COMMON_PASSWORDS.indexOf(pw.toLowerCase()) !== -1) problems.push("Bu parol juda oddiy va ko'p ishlatiladi. Boshqasini tanlang");
            if (Array.from(pw).length >= 8 && new Set(Array.from(pw)).size < 4) problems.push('Parolda juda kam xil belgi bor');
            return problems;
        }

        // Yozayotganda yangilanadigan talablar ro'yxati
        function buildPasswordRules(input, list) {
            const rules = [
                ['Kamida 8 ta belgi', function (v) { return Array.from(v).length >= 8; }],
                ['Kamida bitta harf', function (v) { return /\p{L}/u.test(v); }],
                ['Kamida bitta raqam', function (v) { return /\d/.test(v); }]
            ];
            const items = rules.map(function (r) {
                const li = el('li', 'flex items-center gap-2 text-xs text-slate-500 transition');
                const mark = el('span', 'w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[10px]', '');
                li.appendChild(mark);
                li.appendChild(el('span', '', r[0]));
                list.appendChild(li);
                return { li: li, mark: mark, test: r[1] };
            });
            const update = function () {
                items.forEach(function (it) {
                    const ok = it.test(input.value);
                    it.li.className = 'flex items-center gap-2 text-xs transition ' + (ok ? 'text-emerald-400' : 'text-slate-500');
                    it.mark.textContent = ok ? '✓' : '';
                    it.mark.className = 'w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-black ' + (ok ? 'border-emerald-400 bg-emerald-500/20' : 'border-white/20');
                });
            };
            input.addEventListener('input', update);
            update();
        }

        document.querySelectorAll('input[type="password"]').forEach(attachPasswordToggle);
        buildPasswordRules(document.getElementById('np-password'), document.getElementById('np-rules'));

        // ----- Parolni tiklash (SMS) -----
        const forgotForm = document.getElementById('forgot-form');
        const verifyForm = document.getElementById('verify-form');
        const newpassForm = document.getElementById('newpass-form');
        const RESET_FORMS = { forgot: forgotForm, verify: verifyForm, newpass: newpassForm };
        const RESET_TEXT = {
            forgot: ['Parolni tiklash', 'Telefon raqamingizga SMS orqali tasdiqlash kodi yuboramiz.'],
            verify: ['Kodni tasdiqlang', ''],
            newpass: ["Yangi parol o'rnating", 'Kod tasdiqlandi. Endi yangi parol tanlang.']
        };
        const resetFlow = { phone: '', token: '', resendAt: 0, timer: null };
        let resetStep = null;

        const maskPhone = function (p) { return p.replace(/^(\+998)(\d{2})\d{3}(\d{2})(\d{2})$/, '$1 $2 *** $3 $4'); };

        function clearResetFlow() {
            clearInterval(resetFlow.timer);
            resetFlow.timer = null;
            resetFlow.phone = ''; resetFlow.token = ''; resetFlow.resendAt = 0;
            resetStep = null;
            // Tiklash bo'limlari faqat "Parolni unutdingizmi?" bosilganda ko'rinadi: chiqishda hammasi yashiriladi
            [forgotForm, verifyForm, newpassForm].forEach(function (f) { f.reset(); f.classList.add('hidden'); });
            document.getElementById('dev-code-note').classList.add('hidden');
        }

        function showResetStep(step) {
            resetStep = step;
            loginForm.classList.add('hidden');
            Object.keys(REGISTER_FORM_IDS).forEach(function (r) { document.getElementById(REGISTER_FORM_IDS[r]).classList.add('hidden'); });
            document.getElementById('auth-tabs').classList.add('hidden');
            document.getElementById('role-pills').classList.add('hidden');
            Object.keys(RESET_FORMS).forEach(function (k) { RESET_FORMS[k].classList.toggle('hidden', k !== step); });
            document.getElementById('auth-role-badge').innerText = 'Parolni tiklash';
            document.getElementById('auth-role-icon').className = 'fa-solid fa-key';
            document.getElementById('auth-title').innerText = RESET_TEXT[step][0];
            document.getElementById('auth-subtitle').innerText = step === 'verify'
                ? maskPhone(resetFlow.phone) + " raqamiga yuborilgan 6 xonali kodni kiriting."
                : RESET_TEXT[step][1];
            if (step !== 'verify') clearInterval(resetFlow.timer);
            hideAuthAlert();
            const focusId = { forgot: 'forgot-phone', verify: 'verify-code', newpass: 'np-password' }[step];
            setTimeout(function () { const n = document.getElementById(focusId); if (n) n.focus(); }, 50);
        }

        function openForgot() {
            const typed = loginForm.phone.value;
            clearResetFlow();
            forgotForm.phone.value = typed; // kirish oynasida terilgan raqam ko'chiriladi
            showResetStep('forgot');
        }

        function tickResend() {
            const btn = document.getElementById('resend-btn');
            const left = Math.max(0, Math.ceil((resetFlow.resendAt - Date.now()) / 1000));
            btn.disabled = left > 0;
            btn.innerText = left > 0 ? 'Qayta yuborish: ' + left + ' s' : 'Kodni qayta yuborish';
            if (left === 0) { clearInterval(resetFlow.timer); resetFlow.timer = null; }
        }

        // Kod so'raydi (birinchi marta yoki qayta); raqam ro'yxatdan o'tgan-o'tmaganidan qat'i nazar server bir xil javob beradi
        async function requestResetCode(phone) {
            const data = await authRequest('/auth/forgot-password', { phone: phone });
            resetFlow.phone = phone;
            resetFlow.resendAt = Date.now() + (data.resendAfterSeconds || 60) * 1000;
            const note = document.getElementById('dev-code-note');
            note.classList.toggle('hidden', !data.devCode); // faqat server test rejimida kodni qaytaradi
            if (data.devCode) document.getElementById('dev-code').innerText = data.devCode;
            return data;
        }

        forgotForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideAuthAlert();
            const phone = normalizePhone(forgotForm.phone.value);
            if (!/^\+998\d{9}$/.test(phone)) return showAuthAlert(PHONE_ERR);
            setLoading(forgotForm, true);
            try {
                const data = await requestResetCode(phone);
                showResetStep('verify');
                verifyForm.code.value = '';
                clearInterval(resetFlow.timer);
                tickResend();
                resetFlow.timer = setInterval(tickResend, 1000);
                showAuthAlert(data.message, 'info');
            } catch (err) {
                showAuthAlert(err.messages);
            } finally {
                setLoading(forgotForm, false);
            }
        });

        verifyForm.code.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 6); // faqat raqam (SMS'dan joylashtirilganda ham)
        });

        verifyForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideAuthAlert();
            const code = verifyForm.code.value.trim();
            if (!/^\d{6}$/.test(code)) return showAuthAlert('Kodni to\'liq kiriting (6 ta raqam).');
            setLoading(verifyForm, true);
            try {
                const data = await authRequest('/auth/verify-reset-code', { phone: resetFlow.phone, code: code });
                resetFlow.token = data.resetToken;
                showResetStep('newpass');
            } catch (err) {
                verifyForm.code.value = '';
                showAuthAlert(err.messages);
            } finally {
                setLoading(verifyForm, false);
            }
        });

        document.getElementById('resend-btn').addEventListener('click', async function () {
            hideAuthAlert();
            const btn = this;
            btn.disabled = true;
            try {
                const data = await requestResetCode(resetFlow.phone);
                verifyForm.code.value = '';
                clearInterval(resetFlow.timer);
                tickResend();
                resetFlow.timer = setInterval(tickResend, 1000);
                showAuthAlert(data.message, 'info');
            } catch (err) {
                showAuthAlert(err.messages);
                // Kutish muddati tugamagan bo'lsa (429): tugma qisqa vaqtdan keyin qayta yoqiladi
                resetFlow.resendAt = Date.now() + 5000;
                tickResend();
                resetFlow.timer = resetFlow.timer || setInterval(tickResend, 1000);
            }
        });

        newpassForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideAuthAlert();
            const pw = newpassForm.password.value;
            const problems = passwordProblems(pw);
            if (problems.length) return showAuthAlert(problems);
            if (pw !== newpassForm.confirm.value) return showAuthAlert('Parollar bir xil emas.');
            setLoading(newpassForm, true);
            try {
                await authRequest('/auth/reset-password', { resetToken: resetFlow.token, newPassword: pw });
                const phone = resetFlow.phone;
                clearResetFlow();
                hideAllPasswords();
                openAuthModal('login');
                loginForm.phone.value = phone.slice(4); // +998 dan keyingi 9 raqam
                loginForm.password.value = '';
                showAuthAlert('Parol yangilandi. Yangi parol bilan tizimga kiring.', 'success');
                loginForm.password.focus();
            } catch (err) {
                showAuthAlert(err.messages);
                // Tiklash sessiyasi tugagan bo'lsa jarayon qaytadan boshlanadi
                if (err.status === 400 && /sessiya/i.test(err.messages[0] || '')) {
                    setTimeout(function () { resetFlow.token = ''; showResetStep('forgot'); showAuthAlert(err.messages); }, 1800);
                }
            } finally {
                setLoading(newpassForm, false);
            }
        });

        // ===== HERO ORQA FON SLAYDERI =====
        (function () {
            const IMAGES = ['images/background.jpg', 'images/background2.jpg', 'images/background3.jpg', 'images/background4.jpg', 'images/background5.jpg', 'images/background6.jpg', 'images/background7.jpg'];
            const INTERVAL_MS = 10000;
            const panes = Array.prototype.slice.call(document.querySelectorAll('.hero-pane'));
            if (!panes.length) return;
            const ok = {};
            const shown = [null, null];
            const preload = function (src) {
                return new Promise(function (resolve) {
                    if (ok[src] !== undefined) return resolve(ok[src]);
                    const img = new Image();
                    img.onload = function () { ok[src] = true; resolve(true); };
                    img.onerror = function () { ok[src] = false; resolve(false); };
                    img.src = src;
                });
            };
            // Navbatdagi tasodifiy rasm: hozirgi va qarama-qarshi tomondagi rasmdan farqli
            const pick = function (i) {
                const pool = IMAGES.filter(function (src) { return ok[src] !== false && src !== shown[i] && src !== shown[1 - i]; });
                return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
            };
            const swap = async function (i) {
                const src = pick(i);
                if (!src || !(await preload(src))) return;
                const layers = panes[i].querySelectorAll('.hero-layer');
                const cur = panes[i].querySelector('.hero-layer.on');
                const next = cur === layers[0] ? layers[1] : layers[0];
                next.style.backgroundImage = 'url("' + src + '")';
                next.classList.add('on');
                if (cur) cur.classList.remove('on');
                shown[i] = src;
            };
            let timers = [];
            const start = function () {
                stop();
                // O'ng tomon 5 soniya kechikib almashadi: ikkala rasm bir vaqtda o'zgarmaydi
                timers = [setInterval(function () { swap(0); }, INTERVAL_MS)];
                timers.push(setTimeout(function () { timers.push(setInterval(function () { swap(1); }, INTERVAL_MS)); }, INTERVAL_MS / 2));
            };
            const stop = function () { timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers = []; };
            document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
            swap(0).then(function () { return swap(1); }).then(start);
        })();

        const PHONE_ERR = "Telefon raqamni to'liq kiriting (9 ta raqam).";
        const PASSWORD_ERR = "Parol kamida 8 ta belgidan iborat bo'lishi kerak.";

        // Har bir rol uchun: forma elementidan payload yig'adi va mijoz tomonida tekshiradi
        const REGISTER_CONFIG = {
            FARMER: {
                path: '/auth/farmer/register',
                collect: function (f) {
                    const payload = {
                        fullName: f.fullName.value.trim(), phone: normalizePhone(f.phone.value),
                        farmName: f.farmName.value.trim(), region: f.region.value,
                        district: f.district.value.trim(), password: f.password.value
                    };
                    const stir = f.stir.value.trim();
                    if (stir) payload.stir = stir; // STIR ixtiyoriy
                    const errors = [];
                    if (payload.fullName.length < 2) errors.push('Ism va familiyani kiriting.');
                    if (!/^\+998\d{9}$/.test(payload.phone)) errors.push(PHONE_ERR);
                    if (payload.farmName.length < 2) errors.push("Xo'jalik nomini kiriting.");
                    if (!payload.region) errors.push('Viloyatni tanlang.');
                    if (!payload.district) errors.push('Tumanni kiriting.');
                    if (stir && !/^\d{9}$/.test(stir)) errors.push("STIR 9 ta raqamdan iborat bo'lishi kerak.");
                    const pwProblem = passwordProblems(payload.password)[0];
                    if (pwProblem) errors.push(pwProblem);
                    return { payload: payload, errors: errors };
                }
            },
            DRIVER: {
                path: '/auth/driver/register',
                collect: function (f) {
                    const payload = {
                        fullName: f.fullName.value.trim(), phone: normalizePhone(f.phone.value),
                        vehicleType: f.vehicleType.value, plateNumber: f.plateNumber.value.trim(),
                        capacityKg: Number(f.capacityKg.value), region: f.region.value, password: f.password.value
                    };
                    const license = f.licenseNumber.value.trim();
                    if (license) payload.licenseNumber = license;
                    const errors = [];
                    if (payload.fullName.length < 2) errors.push('Ism va familiyani kiriting.');
                    if (!/^\+998\d{9}$/.test(payload.phone)) errors.push(PHONE_ERR);
                    if (!payload.vehicleType) errors.push('Transport turini tanlang.');
                    payload.plateNumber = maskPlate(payload.plateNumber);
                    if (!PLATE_RE.test(payload.plateNumber)) errors.push("Davlat raqamini to'g'ri kiriting: faqat KATTA lotin harflari va raqamlar (01A777AA yoki 70777AAA).");
                    if (!(payload.capacityKg > 0)) errors.push("Yuk sig'imini kiriting (kg).");
                    if (!payload.region) errors.push('Viloyatni tanlang.');
                    const pwProblem = passwordProblems(payload.password)[0];
                    if (pwProblem) errors.push(pwProblem);
                    return { payload: payload, errors: errors };
                }
            },
            MARKET: {
                path: '/auth/market/register',
                collect: function (f) {
                    const payload = {
                        fullName: f.fullName.value.trim(), phone: normalizePhone(f.phone.value),
                        companyName: f.companyName.value.trim(), region: f.region.value,
                        district: f.district.value.trim(), password: f.password.value
                    };
                    const address = f.address.value.trim();
                    const stir = f.stir.value.trim();
                    if (address) payload.address = address;
                    if (stir) payload.stir = stir;
                    const errors = [];
                    if (payload.fullName.length < 2) errors.push('Mas\'ul shaxs ismini kiriting.');
                    if (!/^\+998\d{9}$/.test(payload.phone)) errors.push(PHONE_ERR);
                    if (payload.companyName.length < 2) errors.push("Kompaniya nomini kiriting.");
                    if (!payload.region) errors.push('Viloyatni tanlang.');
                    if (!payload.district) errors.push('Tumanni kiriting.');
                    if (stir && !/^\d{9}$/.test(stir)) errors.push("STIR 9 ta raqamdan iborat bo'lishi kerak.");
                    const pwProblem = passwordProblems(payload.password)[0];
                    if (pwProblem) errors.push(pwProblem);
                    return { payload: payload, errors: errors };
                }
            }
        };

        Object.keys(REGISTER_CONFIG).forEach(function (role) {
            const form = document.getElementById(REGISTER_FORM_IDS[role]);
            const cfg = REGISTER_CONFIG[role];
            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                hideAuthAlert();
                const result = cfg.collect(form);
                if (result.errors.length) return showAuthAlert(result.errors);
                setLoading(form, true);
                try {
                    const data = await authRequest(cfg.path, result.payload);
                    onAuthSuccess(data, "Muvaffaqiyatli ro'yxatdan o'tdingiz!");
                } catch (err) {
                    showAuthAlert(err.messages);
                } finally {
                    setLoading(form, false);
                }
            });
        });

        // ===== E'LON JOYLASH / TAHRIRLASH =====
        const productModal = document.getElementById('product-modal');
        const productAlert = document.getElementById('product-alert');
        const productForm = document.getElementById('product-form');
        let editingProduct = null; // null = yangi e'lon, aks holda tahrirlanayotgan e'lon

        function onPostAdClick() {
            if (storageGet(TOKEN_KEY)) {
                openProductModal();
            } else {
                afterLoginAction = function () { openProductModal(); };
                openAuthModal('login');
                showAuthAlert("E'lon joylash uchun avval tizimga kiring.", 'info');
            }
        }

        function openProductModal(product) {
            editingProduct = product || null;
            hideAuthAlert(productAlert);
            productForm.reset();
            const f = productForm;
            if (product) {
                f.elements['name'].value = product.name;
                f.category.value = product.category;
                // Ro'yxatda yo'q kategoriya (eski ma'lumot) bo'lsa "Boshqa" tanlanadi
                if (f.category.value !== product.category) f.category.value = 'Boshqa';
                f.quantityKg.value = Number(product.quantityKg);
                f.pricePerKg.value = Number(product.pricePerKg);
                f.harvestDate.value = product.harvestDate ? product.harvestDate.slice(0, 10) : '';
            }
            document.getElementById('product-title').innerText = product ? "E'lonni tahrirlash" : "Yangi e'lon qo'shish";
            document.getElementById('product-subtitle').innerText = product
                ? "Ma'lumotlarni o'zgartirib, saqlang."
                : "Mahsulotingiz haqida ma'lumot kiriting.";
            document.getElementById('product-badge').innerText = product ? 'Tahrirlash' : "E'lon Joylash";
            document.getElementById('product-badge-icon').className = 'fa-solid ' + (product ? 'fa-pen' : 'fa-plus');
            const submitLabel = f.querySelector('.auth-submit span');
            submitLabel.innerText = product ? 'Saqlash' : "E'lonni joylash";
            delete f.querySelector('.auth-submit').dataset.label;
            productModal.classList.add('open');
            syncScrollLock();
        }

        function closeProductModal() {
            productModal.classList.remove('open');
            // Panel ochiq bo'lsa, sahifa skrolli baribir bloklanib turadi
            syncScrollLock();
        }

        // Token eskirgan/yaroqsiz: sessiyani tozalab, qayta kirishga yo'naltiramiz
        function handleSessionExpired(nextAction) {
            stopTracker('');
            storageRemove(TOKEN_KEY);
            storageRemove(USER_KEY);
            updateAuthButton();
            closeProductModal();
            closeMyProducts();
            closeDashboard();
            closeBookingModal();
            closePaymentModal();
            closeWhModal();
            afterLoginAction = nextAction || null; // kirgach shu amal qayta bajariladi
            openAuthModal('login');
            showAuthAlert('Sessiya tugagan. Iltimos, qayta kiring.', 'info');
        }

        productForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideAuthAlert(productAlert);
            const f = productForm;
            const payload = {
                name: f.elements['name'].value.trim(),
                category: f.category.value,
                quantityKg: Number(f.quantityKg.value),
                pricePerKg: Number(f.pricePerKg.value)
            };
            // Tahrirlashda sana tozalansa null yuboriladi (server sanani o'chiradi)
            if (f.harvestDate.value) payload.harvestDate = f.harvestDate.value;
            else if (editingProduct) payload.harvestDate = null;

            const errors = [];
            if (payload.name.length < 2) errors.push('Mahsulot nomini kiriting.');
            if (!payload.category) errors.push('Kategoriyani tanlang.');
            if (!(payload.quantityKg > 0)) errors.push("Vaznni kiriting (0 dan katta bo'lsin).");
            if (!(payload.pricePerKg > 0)) errors.push("Narxni kiriting (0 dan katta bo'lsin).");
            if (errors.length) return showAuthAlert(errors, 'error', productAlert);

            const token = storageGet(TOKEN_KEY);
            const editing = editingProduct;
            const retry = function () { openProductModal(editing); };
            if (!token) return handleSessionExpired(retry);

            setLoading(productForm, true);
            try {
                const saved = editing ? await apiRequest('PUT', '/products/' + editing.id, payload, token) : await apiRequest('POST', '/products', payload, token);
                if (saved && saved.__queued) { closeProductModal(); return; } // oflayn saqlandi: xabar allaqachon ko'rsatilgan
                showAuthAlert(editing ? "E'lon yangilandi!" : "E'lon muvaffaqiyatli joylandi!", 'success', productAlert);
                setTimeout(function () {
                    closeProductModal();
                    hideAuthAlert(productAlert);
                }, 1000);
                if (panel.classList.contains('open')) loadMyProducts();
            } catch (err) {
                if (err.status === 401) {
                    // Tahrirlashda kiritilgan qiymatlar yo'qolmasligi uchun forma qayta ochilganda eski holatga qaytadi
                    return handleSessionExpired(retry);
                }
                showAuthAlert(err.messages, 'error', productAlert);
            } finally {
                setLoading(productForm, false);
            }
        });

        // ===== MENING E'LONLARIM (offcanvas) =====
        const panel = document.getElementById('my-products-panel');
        const panelOverlay = document.getElementById('mp-overlay');
        const mpList = document.getElementById('mp-list');
        let myProducts = [];
        let mpFilter = 'ALL';
        let mpConfirmId = null; // o'chirish tasdig'i kutilayotgan e'lon

        const STATUS_META = {
            ACTIVE:   { label: 'Faol',      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
            ARCHIVED: { label: 'Arxivda',   cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
            BOOKED:   { label: 'Bron qilingan', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
            SOLD:     { label: 'Sotilgan',  cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
        };

        function formatNumber(n) {
            return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
        }

        function formatDate(iso) {
            if (!iso) return null;
            const d = new Date(iso);
            return String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.' + d.getUTCFullYear();
        }

        function el(tag, cls, text) {
            const node = document.createElement(tag);
            if (cls) node.className = cls;
            if (text !== undefined) node.textContent = text; // textContent: XSS'dan himoya
            return node;
        }

        function iconBtn(iconCls, label, cls, onClick) {
            const b = el('button', 'flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border transition ' + cls);
            b.type = 'button';
            const i = el('i', 'fa-solid ' + iconCls);
            b.appendChild(i);
            b.appendChild(el('span', '', label));
            b.addEventListener('click', onClick);
            return b;
        }

        function openMyProducts() {
            closeAccountMenu();
            panel.classList.add('open');
            panelOverlay.classList.add('open');
            syncScrollLock();
            loadMyProducts();
        }

        function closeMyProducts() {
            panel.classList.remove('open');
            panelOverlay.classList.remove('open');
            mpConfirmId = null;
            syncScrollLock();
        }

        function addProductFromPanel() {
            openProductModal();
        }

        async function loadMyProducts() {
            const token = storageGet(TOKEN_KEY);
            if (!token) return handleSessionExpired(openMyProducts);
            if (!myProducts.length) renderMpMessage('fa-spinner fa-spin', "E'lonlar yuklanmoqda...");
            try {
                myProducts = await apiRequest('GET', '/products', undefined, token);
                renderMyProducts();
            } catch (err) {
                if (err.status === 401) return handleSessionExpired(openMyProducts);
                renderMpMessage('fa-triangle-exclamation text-rose-400', err.messages[0], true);
            }
        }

        function renderMpMessage(icon, text, withRetry) {
            mpList.replaceChildren();
            if (icon.indexOf('fa-spinner') !== -1) { mpList.appendChild(skeleton('list')); return; }
            const box = el('div', 'text-center py-16 space-y-4 text-slate-300');
            box.appendChild(el('i', 'fa-solid text-4xl text-emerald-400 ' + icon));
            box.appendChild(el('p', 'text-sm font-medium', text));
            if (withRetry) {
                const b = el('button', 'px-5 py-2 rounded-xl border border-emerald-500/40 text-emerald-400 text-sm font-bold hover:bg-emerald-500/10 transition', 'Qayta urinish');
                b.type = 'button';
                b.addEventListener('click', loadMyProducts);
                box.appendChild(b);
            }
            mpList.appendChild(box);
        }

        function renderMyProducts() {
            const total = myProducts.length;
            document.getElementById('mp-count').innerText = total ? 'Jami: ' + total + " ta e'lon" : '';
            const items = mpFilter === 'ALL' ? myProducts : myProducts.filter(function (p) { return p.status === mpFilter; });

            if (!items.length) {
                if (!total) {
                    mpList.replaceChildren(emptyState({ art: 'listings', compact: true, title: "Hali e'lon qo'shmagansiz", text: "Mahsulotingizni joylang: do'konlar uni darhol ko'rib, bron qila boshlaydi.", cta: { label: "Birinchi e'loningizni joylang", icon: 'fa-plus', fn: function () { openProductModal(); } } }));
                } else {
                    renderMpMessage('fa-filter', "Bu holatdagi e'lonlar yo'q.");
                }
                return;
            }
            mpList.replaceChildren.apply(mpList, items.map(buildProductCard));
        }

        function buildProductCard(p) {
            const meta = STATUS_META[p.status] || STATUS_META.ACTIVE;
            const card = el('div', 'glass rounded-2xl border border-white/10 hover:border-emerald-500/40 transition p-4 space-y-3');

            const top = el('div', 'flex items-start justify-between gap-3');
            const titleBox = el('div', 'min-w-0');
            titleBox.appendChild(el('h3', 'font-extrabold text-white text-lg truncate', p.name));
            titleBox.appendChild(el('p', 'text-xs text-slate-400 font-semibold uppercase tracking-wider', p.category));
            top.appendChild(titleBox);
            top.appendChild(el('span', 'shrink-0 text-xs font-bold px-3 py-1 rounded-full border ' + meta.cls, meta.label));
            card.appendChild(top);

            const grid = el('div', 'grid grid-cols-3 gap-2 text-center');
            [['Vazni', formatNumber(p.quantityKg) + ' kg'],
             ['Narxi', formatNumber(p.pricePerKg) + " so'm/kg"],
             ['Jami', formatNumber(Number(p.quantityKg) * Number(p.pricePerKg)) + " so'm"]].forEach(function (row) {
                const cell = el('div', 'rounded-xl bg-slate-950/50 border border-white/5 px-2 py-2');
                cell.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-slate-500 font-bold', row[0]));
                cell.appendChild(el('div', 'text-xs font-bold text-emerald-300 break-words', row[1]));
                grid.appendChild(cell);
            });
            card.appendChild(grid);

            const harvest = formatDate(p.harvestDate);
            if (harvest) {
                const line = el('p', 'text-xs text-slate-400');
                line.appendChild(el('i', 'fa-solid fa-calendar-day text-emerald-400 mr-1.5'));
                line.appendChild(document.createTextNode("O'rim-yig'im: " + harvest));
                card.appendChild(line);
            }

            const actions = el('div', 'flex gap-2 pt-1');
            if (mpConfirmId === p.id) {
                const q = el('span', 'flex-1 self-center text-xs font-semibold text-rose-300', "O'chirishni tasdiqlaysizmi?");
                actions.appendChild(q);
                actions.appendChild(iconBtn('fa-check', 'Ha', 'border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25', function () { deleteProduct(p.id); }));
                actions.appendChild(iconBtn('fa-xmark', "Yo'q", 'border-white/15 text-slate-300 hover:bg-white/10', function () { mpConfirmId = null; renderMyProducts(); }));
            } else {
                actions.appendChild(iconBtn('fa-pen', 'Tahrirlash', 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10', function () { openProductModal(p); }));
                if (p.status === 'ACTIVE' || p.status === 'ARCHIVED') {
                    const archived = p.status === 'ARCHIVED';
                    actions.appendChild(iconBtn(archived ? 'fa-box-open' : 'fa-box-archive', archived ? 'Faollashtirish' : 'Arxivlash',
                        'border-white/15 text-slate-300 hover:bg-white/10', function () { toggleArchive(p); }));
                }
                actions.appendChild(iconBtn('fa-trash', "O'chirish", 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10', function () { mpConfirmId = p.id; renderMyProducts(); }));
            }
            card.appendChild(actions);
            return card;
        }

        async function toggleArchive(p) {
            const token = storageGet(TOKEN_KEY);
            if (!token) return handleSessionExpired(openMyProducts);
            const next = p.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
            try {
                await apiRequest('PUT', '/products/' + p.id, { status: next }, token);
                showToast(next === 'ARCHIVED' ? "E'lon arxivlandi." : "E'lon qayta faollashtirildi.");
                loadMyProducts();
            } catch (err) {
                if (err.status === 401) return handleSessionExpired(openMyProducts);
                showToast(err.messages[0]);
                if (err.status === 404) loadMyProducts();
            }
        }

        async function deleteProduct(id) {
            const token = storageGet(TOKEN_KEY);
            if (!token) return handleSessionExpired(openMyProducts);
            try {
                await apiRequest('DELETE', '/products/' + id, undefined, token);
                mpConfirmId = null;
                showToast("E'lon o'chirildi.");
                loadMyProducts();
            } catch (err) {
                if (err.status === 401) return handleSessionExpired(openMyProducts);
                mpConfirmId = null;
                showToast(err.messages[0]);
                loadMyProducts();
            }
        }

        document.getElementById('mp-chips').addEventListener('click', function (e) {
            const chip = e.target.closest('.mp-chip');
            if (!chip) return;
            mpFilter = chip.dataset.filter;
            document.querySelectorAll('.mp-chip').forEach(function (c) { c.classList.toggle('active', c === chip); });
            mpConfirmId = null;
            renderMyProducts();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (tourState.active || notFoundView.classList.contains('open')) return; // tur va 404 o'z Escape'ini boshqaradi: kabinet yopilmasin
            if (document.getElementById('bd-modal').classList.contains('open')) closeBdModal();
            else if (document.getElementById('face-modal').classList.contains('open')) closeFaceModal();
            else if (document.getElementById('rate-modal').classList.contains('open')) closeRateModal();
            else if (document.getElementById('price-modal').classList.contains('open')) closePriceModal();
            else if (whModal.classList.contains('open')) closeWhModal();
            else if (paymentModal.classList.contains('open')) closePaymentModal();
            else if (bookingModal.classList.contains('open')) closeBookingModal();
            else if (productModal.classList.contains('open')) closeProductModal();
            else if (authModal.classList.contains('open')) closeAuthModal();
            else if (panel.classList.contains('open')) closeMyProducts();
            else if (dashboardView.classList.contains('open')) closeDashboard();
            else closeAccountMenu();
        });

        // ===== MARKET (ochiq e'lonlar katalogi) =====
        const marketGrid = document.getElementById('market-grid');
        const marketState = { q: '', category: '', region: '', sort: 'newest', page: 1, minPrice: undefined, maxPrice: undefined, minQty: undefined, maxQty: undefined };
        const MARKET_LIMIT = 12;
        let marketRequestId = 0;

        const CATEGORY_ICONS = {
            'Sabzavot': 'fa-carrot', 'Meva': 'fa-apple-whole', 'Poliz': 'fa-leaf', 'Don': 'fa-wheat-awn', 'Boshqa': 'fa-box'
        };

        function scrollToMarket(focusFilters) {
            if (focusFilters) { // "Filtrlar" tugmasi: panelni ochib qo'yadi (telefonda yig'ilgan bo'ladi)
                const f = document.getElementById('market-filters');
                f.classList.remove('filters-collapsed');
                document.getElementById('filters-toggle').setAttribute('aria-expanded', 'true');
            }
            document.getElementById('market').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // stay=true: filtr panelidan bosilganda sahifa sakramaydi
        function setMarketCategory(category, stay) {
            marketState.category = category;
            marketState.page = 1;
            // Dropdown matni bilan sinxron (chip'dan olib tashlanganda ham)
            document.getElementById('selected-text').innerText = category || "Barcha yo'nalishlar";
            loadMarket();
            if (!stay) scrollToMarket();
        }

        function runMarketSearch(scroll) {
            marketState.q = document.getElementById('market-search').value.trim();
            marketState.page = 1;
            loadMarket();
            if (scroll) scrollToMarket();
        }

        let marketSearchTimer = null;
        document.getElementById('market-search').addEventListener('input', function () {
            clearTimeout(marketSearchTimer);
            marketSearchTimer = setTimeout(function () { runMarketSearch(false); }, 350);
        });
        document.getElementById('market-search').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { clearTimeout(marketSearchTimer); runMarketSearch(true); }
        });
        document.getElementById('market-search-btn').addEventListener('click', function () {
            clearTimeout(marketSearchTimer);
            runMarketSearch(true);
        });
        document.getElementById('market-region').addEventListener('change', function (e) {
            marketState.region = e.target.value;
            marketState.page = 1;
            loadMarket();
        });
        document.getElementById('market-sort').addEventListener('change', function (e) {
            marketState.sort = e.target.value;
            marketState.page = 1;
            loadMarket();
        });

        function clearMarketFilters() {
            marketState.q = ''; marketState.category = ''; marketState.region = ''; marketState.page = 1;
            marketState.minPrice = marketState.maxPrice = marketState.minQty = marketState.maxQty = undefined;
            priceSlider.reset(); qtySlider.reset();
            document.getElementById('market-search').value = '';
            document.getElementById('market-region').value = '';
            document.getElementById('selected-text').innerText = "Barcha yo'nalishlar";
            loadMarket();
        }

        function renderMarketChips() {
            const box = document.getElementById('market-chips');
            box.replaceChildren();
            const chips = [];
            if (marketState.q) chips.push(['fa-magnifying-glass', '"' + marketState.q + '"', function () {
                marketState.q = ''; document.getElementById('market-search').value = ''; marketState.page = 1; loadMarket();
            }]);
            if (marketState.category) chips.push(['fa-tag', marketState.category, function () { setMarketCategory(''); }]);
            if (marketState.region) chips.push(['fa-location-dot', marketState.region, function () {
                marketState.region = ''; document.getElementById('market-region').value = ''; marketState.page = 1; loadMarket();
            }]);
            if (marketState.minPrice !== undefined || marketState.maxPrice !== undefined) chips.push(['fa-coins', T('Narx: {0} — {1}', formatNumber(marketState.minPrice === undefined ? (marketRanges.price ? marketRanges.price.min : 0) : marketState.minPrice), formatNumber(marketState.maxPrice === undefined ? (marketRanges.price ? marketRanges.price.max : 0) : marketState.maxPrice)), function () {
                marketState.minPrice = marketState.maxPrice = undefined; priceSlider.reset(); marketState.page = 1; loadMarket();
            }]);
            if (marketState.minQty !== undefined || marketState.maxQty !== undefined) chips.push(['fa-weight-hanging', T('Miqdor: {0} — {1} kg', formatNumber(marketState.minQty === undefined ? (marketRanges.quantity ? marketRanges.quantity.min : 0) : marketState.minQty), formatNumber(marketState.maxQty === undefined ? (marketRanges.quantity ? marketRanges.quantity.max : 0) : marketState.maxQty)), function () {
                marketState.minQty = marketState.maxQty = undefined; qtySlider.reset(); marketState.page = 1; loadMarket();
            }]);
            if (!chips.length) {
                box.appendChild(el('span', 'text-sm text-slate-400 font-semibold', 'Barcha faol e\'lonlar'));
                return;
            }
            chips.forEach(function (c) {
                const b = el('button', 'flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/25 transition');
                b.type = 'button';
                b.title = "Filtrni olib tashlash";
                b.appendChild(el('i', 'fa-solid ' + c[0]));
                b.appendChild(el('span', 'max-w-[12rem] truncate', c[1]));
                b.appendChild(el('i', 'fa-solid fa-xmark text-[10px]'));
                b.addEventListener('click', c[2]);
                box.appendChild(b);
            });
            const clear = el('button', 'text-xs font-bold text-slate-400 hover:text-white underline underline-offset-2 ml-1', 'Hammasini tozalash');
            clear.type = 'button';
            clear.addEventListener('click', clearMarketFilters);
            box.appendChild(clear);
        }

        function renderMarketSkeleton() {
            marketGrid.replaceChildren();
            for (let i = 0; i < 8; i++) {
                const c = el('div', 'sk-card');
                c.setAttribute('aria-hidden', 'true');
                c.appendChild(sk('sk-round h-5 w-24'));
                c.appendChild(sk('h-7 w-3/4'));
                c.appendChild(sk('h-10 w-1/2'));
                c.appendChild(sk('h-16 w-full'));
                c.appendChild(sk('h-11 w-full'));
                marketGrid.appendChild(c);
            }
        }

        function renderMarketMessage(icon, title, text, actionLabel, action) {
            marketGrid.replaceChildren();
            document.getElementById('market-pagination').replaceChildren();
            const box = el('div', 'col-span-full text-center py-16 space-y-4');
            box.appendChild(icon.indexOf('fa-magnifying-glass') !== -1 ? emptyArt(actionLabel ? 'search' : 'listings') : el('i', 'fa-solid text-5xl text-emerald-400 ' + icon));
            box.appendChild(el('h3', 'text-xl font-bold text-white', title));
            box.appendChild(el('p', 'text-slate-400 text-sm max-w-md mx-auto', text));
            if (actionLabel) {
                const b = el('button', 'px-6 py-2.5 rounded-xl border border-emerald-500/40 text-emerald-400 text-sm font-bold hover:bg-emerald-500/10 transition', actionLabel);
                b.type = 'button';
                b.addEventListener('click', action);
                box.appendChild(b);
            }
            marketGrid.appendChild(box);
        }

        async function loadMarket() {
            const reqId = ++marketRequestId; // eski (kechikkan) javoblar yangisini bosib ketmasin
            renderMarketChips();
            syncMarketFilterUi();
            renderMarketSkeleton();
            document.getElementById('market-pagination').replaceChildren();
            const params = new URLSearchParams({ sort: marketState.sort, page: marketState.page, limit: MARKET_LIMIT });
            if (marketState.q) params.set('q', marketState.q);
            if (marketState.category) params.set('category', marketState.category);
            if (marketState.region) params.set('region', marketState.region);
            ['minPrice', 'maxPrice', 'minQty', 'maxQty'].forEach(function (k) { if (marketState[k] !== undefined) params.set(k, String(marketState[k])); });
            try {
                const data = await apiRequest('GET', '/marketplace?' + params.toString());
                if (reqId !== marketRequestId) return;
                renderMarket(data);
            } catch (err) {
                if (reqId !== marketRequestId) return;
                document.getElementById('market-count').innerText = '';
                renderMarketMessage('fa-triangle-exclamation text-rose-400', "E'lonlarni yuklab bo'lmadi", err.messages[0], 'Qayta urinish', loadMarket);
            }
        }

        function renderMarket(data) {
            const meta = data.meta;
            applyMarketRanges(meta.ranges);
            document.getElementById('market-count').innerText = meta.total
                ? 'Topildi: ' + meta.total + " ta e'lon"
                : '';
            if (!data.items.length) {
                const filtered = marketActiveFilterCount() > 0;
                if (meta.total > 0 && marketState.page > meta.totalPages) { marketState.page = meta.totalPages; return loadMarket(); }
                return renderMarketMessage('fa-magnifying-glass', filtered ? 'Hech narsa topilmadi' : "Hozircha e'lonlar yo'q",
                    filtered ? "So'rovingiz bo'yicha faol e'lon yo'q. Filtrlarni o'zgartirib ko'ring." : "Fermerlar e'lon joylashi bilan bu yerda ko'rinadi.",
                    filtered ? 'Filtrlarni tozalash' : null, clearMarketFilters);
            }
            marketGrid.replaceChildren.apply(marketGrid, data.items.map(buildMarketCard));
            renderMarketPagination(meta);
        }

        function buildMarketCard(p) {
            const card = el('article', 'glass hover-glow rounded-3xl border border-white/10 hover:border-emerald-500/50 p-6 flex flex-col gap-4');

            const top = el('div', 'flex items-center justify-between gap-2');
            const cat = el('span', 'inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider');
            cat.appendChild(el('i', 'fa-solid ' + (CATEGORY_ICONS[p.category] || 'fa-box')));
            cat.appendChild(el('span', '', p.category));
            top.appendChild(cat);
            if (p.farmer.isVerified) {
                const v = el('span', 'text-xs font-bold text-blue-400 flex items-center gap-1', 'Tasdiqlangan');
                v.insertBefore(el('i', 'fa-solid fa-circle-check'), v.firstChild);
                top.appendChild(v);
            }
            card.appendChild(top);

            card.appendChild(el('h3', 'text-xl font-extrabold text-white leading-snug break-words', p.name));

            const price = el('div', 'flex items-baseline gap-1.5');
            price.appendChild(el('span', 'text-3xl font-black text-emerald-400', formatNumber(p.pricePerKg)));
            price.appendChild(el('span', 'text-sm font-semibold text-slate-400', "so'm / kg"));
            card.appendChild(price);

            const facts = el('div', 'grid grid-cols-2 gap-2 text-center');
            [['Mavjud', formatNumber(p.quantityKg) + ' kg'],
             ['Jami', formatNumber(Number(p.quantityKg) * Number(p.pricePerKg)) + " so'm"]].forEach(function (f) {
                const cell = el('div', 'rounded-xl bg-slate-950/50 border border-white/5 px-2 py-2');
                cell.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-slate-500 font-bold', f[0]));
                cell.appendChild(el('div', 'text-xs font-bold text-slate-200 break-words', f[1]));
                facts.appendChild(cell);
            });
            card.appendChild(facts);

            const info = el('div', 'space-y-1.5 text-sm text-slate-300');
            const line = function (icon, text) {
                const row = el('div', 'flex items-start gap-2.5');
                row.appendChild(el('i', 'fa-solid ' + icon + ' text-emerald-400 mt-1 w-4 text-center text-xs'));
                row.appendChild(el('span', 'min-w-0 break-words', text));
                info.appendChild(row);
            };
            line('fa-tractor', p.farmer.farmName + ' · ' + p.farmer.fullName);
            line('fa-location-dot', p.farmer.region + ', ' + p.farmer.district);
            const harvest = formatDate(p.harvestDate);
            if (harvest) line('fa-calendar-day', "O'rim-yig'im: " + harvest);
            card.appendChild(info);

            const spacer = el('div', 'flex-1');
            card.appendChild(spacer);

            const lock = el('p', 'text-[11px] text-slate-500 flex items-center gap-1.5');
            lock.appendChild(el('i', 'fa-solid fa-lock'));
            lock.appendChild(document.createTextNode("Fermer kontakti bron qilingandan keyin ochiladi"));
            card.appendChild(lock);

            const btn = el('button', 'w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-extrabold py-3 rounded-2xl transition duration-200 shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2.5');
            btn.type = 'button';
            btn.appendChild(el('i', 'fa-solid fa-handshake'));
            btn.appendChild(el('span', '', 'Bron qilish'));
            btn.addEventListener('click', function () { onBookClick(p); });
            card.appendChild(btn);
            return card;
        }

        function renderMarketPagination(meta) {
            const nav = document.getElementById('market-pagination');
            nav.replaceChildren();
            if (meta.totalPages <= 1) return;
            const go = function (page) {
                marketState.page = page;
                loadMarket();
                scrollToMarket();
            };
            const btn = function (label, page, opts) {
                opts = opts || {};
                const b = el('button', 'min-w-[2.5rem] h-10 px-3 rounded-xl border text-sm font-bold transition ' + (opts.active
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                    : 'border-white/15 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/15 disabled:hover:text-slate-300'));
                b.type = 'button';
                b.textContent = label;
                if (opts.aria) b.setAttribute('aria-label', opts.aria);
                if (opts.active) b.setAttribute('aria-current', 'page');
                b.disabled = !!opts.disabled;
                if (!opts.disabled && !opts.active) b.addEventListener('click', function () { go(page); });
                return b;
            };
            nav.appendChild(btn('‹', meta.page - 1, { disabled: meta.page <= 1, aria: 'Oldingi sahifa' }));
            const pages = [];
            for (let i = 1; i <= meta.totalPages; i++) {
                if (i === 1 || i === meta.totalPages || Math.abs(i - meta.page) <= 1) pages.push(i);
                else if (pages[pages.length - 1] !== '...') pages.push('...');
            }
            pages.forEach(function (i) {
                if (i === '...') nav.appendChild(el('span', 'px-1 text-slate-500', '…'));
                else nav.appendChild(btn(String(i), i, { active: i === meta.page }));
            });
            nav.appendChild(btn('›', meta.page + 1, { disabled: meta.page >= meta.totalPages, aria: 'Keyingi sahifa' }));
        }

        // ===== ROL BO'YICHA NAVIGATSIYA (sidebar) =====
        function chooseRole(role) {
            if (sidebar.classList.contains('open')) toggleSidebar();
            const user = currentUser();
            const meta = ROLE_META[role];
            if (user) {
                if (user.role === role) return openDashboard();
                const mine = (ROLE_META[user.role] || { label: user.role }).label;
                showToast("Ushbu raqam allaqachon " + mine + " sifatida ro'yxatdan o'tgan. " + meta.label +
                    " sifatida foydalanish uchun tizimdan chiqib, boshqa raqam bilan ro'yxatdan o'ting.", 6500);
                return;
            }
            // Oldin shu rolda kirilgan bo'lsa — kirish oynasi, aks holda ro'yxatdan o'tish formasi
            const known = isRoleKnown(role);
            afterLoginAction = function () { openDashboard(); };
            openAuthModal(known ? 'login' : 'register', role);
            showAuthAlert(known
                ? meta.badge + " kabinetiga kirish uchun telefon raqam va parolingizni kiriting."
                : meta.badge + " uchun ma'lumotlarni to'ldirib, ro'yxatdan o'ting.", 'info');
        }

        // ===== KABINET (rolga mos boshqaruv sahifasi) =====
        const dashboardView = document.getElementById('dashboard-view');
        const dashContent = document.getElementById('dash-content');
        const DASH_TABS = {
            FARMER: [['overview', 'fa-gauge', 'Umumiy'], ['bookings', 'fa-inbox', 'Kelgan bronlar'],
                     ['shipments', 'fa-truck-ramp-box', 'Yuk tashish'], ['payments', 'fa-wallet', "To'lovlar"],
                     ['warehouse', 'fa-warehouse', 'Omborxona'], ['whorders', 'fa-clipboard-list', 'Ombor buyurtmalari'],
                     ['products', 'fa-boxes-stacked', "E'lonlarim"], ['prices', 'fa-arrow-trend-up', 'Bozor narxlari'], ['badges', 'fa-trophy', 'Ishonch badjlari'], ['subscription', 'fa-crown', 'Obuna'], ['profile', 'fa-id-card', 'Profil']],
            MARKET: [['overview', 'fa-gauge', 'Umumiy'], ['bookings', 'fa-clipboard-list', 'Mening bronlarim'],
                     ['shipments', 'fa-truck-ramp-box', 'Yuk tashish'], ['payments', 'fa-wallet', "To'lovlar"],
                     ['warehouse', 'fa-warehouse', 'Omborxona'], ['whorders', 'fa-clipboard-list', 'Ombor buyurtmalari'],
                     ['catalog', 'fa-store', 'Katalog'], ['prices', 'fa-arrow-trend-up', 'Bozor narxlari'], ['badges', 'fa-trophy', 'Ishonch badjlari'], ['subscription', 'fa-crown', 'Obuna'], ['profile', 'fa-id-card', 'Profil']],
            DRIVER: [['overview', 'fa-gauge', 'Umumiy'], ['loads', 'fa-boxes-packing', 'Mavjud yuklar'],
                     ['myloads', 'fa-truck-fast', 'Mening yuklarim'], ['eld', 'fa-clock-rotate-left', 'Harakat jurnali'], ['verify', 'fa-id-card-clip', 'Shaxsni tasdiqlash'], ['badges', 'fa-trophy', 'Darajalar va mukofotlar'], ['prices', 'fa-arrow-trend-up', 'Bozor narxlari'], ['subscription', 'fa-crown', 'Obuna'], ['profile', 'fa-id-card', 'Profil']],
            DISPATCHER: [['whboard', 'fa-table-columns', 'Zonalar'], ['whunits', 'fa-temperature-half', 'Kameralar'],
                     ['whorders', 'fa-clipboard-list', 'Buyurtmalar'], ['whinventory', 'fa-chart-pie', 'Inventarizatsiya'], ['prices', 'fa-arrow-trend-up', 'Bozor narxlari'], ['profile', 'fa-id-card', 'Profil']]
        };
        DASH_TABS.ADMIN = [['adm-dashboard', 'fa-chart-line', 'Boshqaruv paneli'], ['adm-users', 'fa-users', 'Foydalanuvchilar'],
                     ['adm-products', 'fa-boxes-stacked', "E'lonlar"], ['adm-shipments', 'fa-truck-fast', 'Yuk tashish'], ['adm-payments', 'fa-wallet', "To'lovlar"],
                     ['whboard', 'fa-warehouse', 'Ombor: zonalar'], ['whunits', 'fa-temperature-half', 'Kameralar'], ['whorders', 'fa-clipboard-list', 'Ombor buyurtmalari'],
                     ['whinventory', 'fa-chart-pie', 'Inventarizatsiya'], ['adm-reviews', 'fa-star', 'Sharhlar'], ['adm-kyc', 'fa-user-check', 'KYC arizalari'], ['adm-settings', 'fa-gear', 'Sayt sozlamalari'], ['adm-audit', 'fa-list-check', 'Audit jurnali'], ['prices', 'fa-arrow-trend-up', 'Bozor narxlari'],
                     ['profile', 'fa-id-card', 'Profil']];
        const BOOKING_STATUS = {
            PENDING:   { label: 'Kutilmoqda',      cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
            APPROVED:  { label: 'Tasdiqlangan',    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
            REJECTED:  { label: 'Rad etilgan',     cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
            CANCELLED: { label: 'Bekor qilingan',  cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
        };
        const VEHICLE_TYPES = ['Labo / Damas', 'Isuzu (kichik yuk)', 'Furgon', 'Fura (katta)', 'Sovutgichli (Ref)', 'Boshqa'];
        let dashTab = 'overview';
        let dashRenderId = 0;     // eski (kechikkan) javoblar yangi sahifani bosib ketmasin
        let dashBookingFilter = 'ALL';

        function renderDashHeader() {
            const user = currentUser();
            if (!user) return;
            const meta = ROLE_META[user.role] || { badge: 'AgrarGo', icon: 'fa-gauge' };
            document.getElementById('dash-role-icon').className = 'fa-solid ' + meta.icon;
            document.getElementById('dash-role-title').innerText = meta.badge;
            const av = el('span', 'w-8 h-8 rounded-full overflow-hidden bg-emerald-500/20 text-emerald-300 text-xs font-black flex items-center justify-center shrink-0');
            av.appendChild(avatarNode(user));
            document.getElementById('dash-user-chip').replaceChildren(av, el('span', 'truncate hidden sm:inline', user.fullName));
        }

        function openDashboard(tab) {
            const user = currentUser();
            if (!user) {
                afterLoginAction = function () { openDashboard(tab); };
                return openAuthModal('login');
            }
            if (!DASH_TABS[user.role]) return showToast("Bu rol uchun kabinet mavjud emas.");
            closeAccountMenu();
            dashBookingFilter = 'ALL'; // oldingi foydalanuvchining filtrlari qolib ketmasin
            dashShipFilter = 'ALL';
            dashPayFilter = 'ALL';
            payConfirm = null;
            dashLoadsRegion = '';
            whOrderFilter = 'ALL';
            whFarmerZone = 'ALL';
            whFeedState = { q: '', category: '', storageType: '', page: 1 };
            renderDashHeader();
            const nav = document.getElementById('dash-tabs');
            nav.replaceChildren.apply(nav, DASH_TABS[user.role].map(function (t) {
                const b = el('button', 'dash-tab flex items-center gap-2.5 px-4 py-3 rounded-xl border border-white/10 text-sm font-bold text-slate-300 hover:border-emerald-500/40 transition whitespace-nowrap');
                b.type = 'button';
                b.dataset.tab = t[0];
                b.appendChild(el('i', 'fa-solid w-4 text-center ' + t[1]));
                b.appendChild(el('span', '', t[2]));
                if (t[0] === 'bookings' || t[0] === 'loads' || t[0] === 'payments') {
                    const badge = el('span', 'hidden ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-400 text-slate-950 text-[11px] font-black items-center justify-center');
                    badge.id = 'dash-badge-' + t[0];
                    b.appendChild(badge);
                }
                b.addEventListener('click', function () { dashBookingFilter = 'ALL'; dashShipFilter = 'ALL'; dashPayFilter = 'ALL'; payConfirm = null; selectDashTab(t[0]); });
                return b;
            }));
            dashboardView.classList.add('open');
            dashboardView.setAttribute('aria-hidden', 'false');
            syncScrollLock();
            renderSubBanner();
            loadSubscription();
            selectDashTab(tab || (user.role === 'ADMIN' ? 'adm-dashboard' : isStaffRole(user) ? 'whboard' : 'overview'));
            setTimeout(function () { maybeStartTour(user); }, 1500); // birinchi kirishda interaktiv qo'llanma
        }

        function closeDashboard() {
            stopPricesBg();
            dashboardView.classList.remove('open');
            dashboardView.setAttribute('aria-hidden', 'true');
            syncScrollLock();
        }

        function selectDashTab(tab) {
            destroyCharts();
            if (tab === 'products') return openMyProducts();
            if (tab !== 'prices') stopPricesBg();
            if (tab === 'catalog') { closeDashboard(); return scrollToMarket(); }
            const user = currentUser();
            if (!user) return;
            dashTab = tab;
            try { bnSync(); } catch (e) {}
            document.querySelectorAll('.dash-tab').forEach(function (b) {
                const on = b.dataset.tab === tab;
                b.classList.toggle('active', on);
                if (on) b.scrollIntoView({ inline: 'center', block: 'nearest' }); // mobilda gorizontal tab satrida ko'rinib turadi
            });
            dashboardView.scrollTo({ top: 0 });
            renderSubBanner();
            if (tab === 'bookings') renderDashBookings(user);
            else if (tab === 'shipments' || tab === 'myloads') renderDashShipments(user);
            else if (tab === 'loads') renderDashLoads(user);
            else if (tab === 'eld') renderDashEld(user);
            else if (tab === 'warehouse') (user.role === 'FARMER' ? renderWhFarmer(user) : renderWhFeed(user));
            else if (tab === 'whorders') renderWhOrders(user);
            else if (tab === 'adm-dashboard' || (user.role === 'ADMIN' && tab === 'overview')) renderAdmDashboard(user);
            else if (tab === 'adm-users') renderAdmUsers(user);
            else if (tab === 'adm-products') renderAdmProducts(user);
            else if (tab === 'adm-shipments') renderAdmShipments(user);
            else if (tab === 'adm-payments') renderAdmPayments(user);
            else if (tab === 'adm-reviews') renderAdmReviews(user);
            else if (tab === 'adm-settings') renderAdmSettings(user);
            else if (tab === 'adm-audit') renderAdmAudit(user);
            else if (tab === 'whboard' || (isStaffRole(user) && tab === 'overview')) renderWhBoard(user);
            else if (tab === 'whunits') renderWhUnits(user);
            else if (tab === 'whinventory') renderWhInventory(user);
            else if (tab === 'payments') renderDashPayments(user);
            else if (tab === 'verify') renderDashVerify(user);
            else if (tab === 'badges') renderDashBadges(user);
            else if (tab === 'adm-kyc') renderAdmKyc(user);
            else if (tab === 'prices') renderDashPrices(user);
            else if (tab === 'subscription') renderDashSubscription(user);
            else if (tab === 'profile') renderDashProfile();
            else renderDashOverview(user);
        }

        function reopenDash() { openDashboard(dashTab); }

        // Tokenli so'rov: 401 kelsa sessiya tozalanib, qayta kirgach kabinet o'sha bo'limda ochiladi
        async function authed(method, path, payload) {
            const token = storageGet(TOKEN_KEY);
            if (!token) { handleSessionExpired(reopenDash); throw { status: 401, messages: [] }; }
            try {
                return await apiRequest(method, path, payload, token);
            } catch (err) {
                if (err.status === 401) handleSessionExpired(reopenDash);
                throw err;
            }
        }

        function dashMessage(icon, text, retry) {
            if (icon.indexOf('fa-spinner') !== -1) return skeleton(skeletonKindFor(text)); // yuklanish: aylanuvchi doira o'rniga skelet
            const box = el('div', 'glass rounded-3xl border border-white/10 text-center py-14 px-6 space-y-4');
            box.appendChild(el('i', 'fa-solid text-4xl text-emerald-400 ' + icon));
            box.appendChild(el('p', 'text-sm font-medium text-slate-300', text));
            if (retry) {
                const b = el('button', 'px-5 py-2 rounded-xl border border-emerald-500/40 text-emerald-400 text-sm font-bold hover:bg-emerald-500/10 transition', 'Qayta urinish');
                b.type = 'button';
                b.addEventListener('click', retry);
                box.appendChild(b);
            }
            return box;
        }

        function setTabBadge(tab, count) {
            const badge = document.getElementById('dash-badge-' + tab);
            if (!badge) return;
            badge.innerText = count;
            badge.classList.toggle('hidden', !count);
            badge.classList.toggle('flex', !!count);
        }

        function statCard(icon, label, value, tone) {
            const c = el('div', 'glass rounded-2xl border border-white/10 p-4 space-y-2');
            c.appendChild(el('i', 'fa-solid ' + icon + ' text-lg ' + tone));
            const v = el('div', 'text-2xl font-black text-white break-words');
            countUp(v, value);
            c.appendChild(v);
            c.appendChild(el('div', 'text-xs font-bold uppercase tracking-wider text-slate-400', label));
            return c;
        }

        function actionBtn(icon, label, primary, onClick) {
            const b = el('button', 'flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-extrabold transition active:scale-95 ' + (primary
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/25'
                : 'border border-white/15 text-slate-200 hover:border-emerald-500/50 hover:text-emerald-400'));
            b.type = 'button';
            b.appendChild(el('i', 'fa-solid ' + icon));
            b.appendChild(el('span', '', label));
            b.addEventListener('click', onClick);
            return b;
        }

        function sectionTitle(text, sub) {
            const box = el('div', 'space-y-1');
            box.appendChild(el('h3', 'text-lg font-extrabold text-white', text));
            if (sub) box.appendChild(el('p', 'text-sm text-slate-400', sub));
            return box;
        }

        async function renderDashOverview(user) {
            const rid = ++dashRenderId;
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', "Ma'lumotlar yuklanmoqda..."));
            try {
                const nodes = [];
                const hello = el('div', 'space-y-1');
                hello.appendChild(el('h2', 'text-2xl sm:text-3xl font-extrabold text-white', 'Salom, ' + user.fullName + '!'));
                hello.appendChild(el('p', 'text-slate-400 text-sm', (ROLE_META[user.role] || {}).badge + ' boshqaruv paneli'));
                const storedUser = getStoredUser();
                if ((user.role === 'FARMER' || user.role === 'MARKET') && storedUser && storedUser.coverUrl) nodes.push(buildCover(storedUser, false, true));
                nodes.push(hello);
                if (user.role === 'FARMER' || user.role === 'DRIVER' || user.role === 'MARKET') {
                    const trow = el('div', 'flex flex-wrap items-center gap-2');
                    nodes.push(trow);
                    loadTrustMe().then(function (t) {
                        if (!t || rid !== dashRenderId) return;
                        trow.appendChild(statusChip(t.status));
                        if (t.verified) { const v = el('span', ['tr-chip', 'NEW'].join(' ')); v.appendChild(el('i', 'fa-solid fa-circle-check')); v.appendChild(el('span', '', 'Tasdiqlangan')); trow.appendChild(v); }
                        const go = el('button', 'text-xs font-bold text-slate-300 hover:text-emerald-300 transition', T('{0}/{1} badjlar ochilgan', t.unlocked, t.total));
                        go.type = 'button';
                        go.addEventListener('click', function () { selectDashTab('badges'); });
                        trow.appendChild(go);
                    });
                }

                if (user.role === 'FARMER') {
                    const res = await Promise.all([authed('GET', '/products'), authed('GET', '/bookings/incoming')]);
                    if (rid !== dashRenderId) return;
                    const products = res[0], bookings = res[1];
                    const active = products.filter(function (p) { return p.status === 'ACTIVE'; });
                    const pending = bookings.filter(function (b) { return b.status === 'PENDING'; });
                    const approved = bookings.filter(function (b) { return b.status === 'APPROVED'; });
                    const stock = active.reduce(function (sum, p) { return sum + Number(p.quantityKg); }, 0);
                    setTabBadge('bookings', pending.length);
                    const stats = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-4');
                    stats.appendChild(statCard('fa-boxes-stacked', "Faol e'lonlar", String(active.length), 'text-emerald-400'));
                    stats.appendChild(statCard('fa-weight-hanging', 'Mavjud qoldiq', formatNumber(stock) + ' kg', 'text-blue-400'));
                    stats.appendChild(statCard('fa-hourglass-half', 'Kutilayotgan bronlar', String(pending.length), 'text-amber-400'));
                    stats.appendChild(statCard('fa-circle-check', 'Tasdiqlangan', String(approved.length), 'text-emerald-400'));
                    nodes.push(stats);
                    const actions = el('div', 'flex flex-wrap gap-3');
                    const addBtn = actionBtn('fa-plus', "Yangi e'lon qo'shish", true, function () { openProductModal(); });
                    addBtn.dataset.tour = 'primary';
                    actions.appendChild(addBtn);
                    actions.appendChild(actionBtn('fa-boxes-stacked', "Mening e'lonlarim", false, openMyProducts));
                    actions.appendChild(actionBtn('fa-truck-ramp-box', 'Yuk tashish', false, function () { selectDashTab('shipments'); }));
                    actions.appendChild(actionBtn('fa-wallet', "To'lovlar", false, function () { selectDashTab('payments'); }));
                    nodes.push(actions);
                    const farmerCharts = el('div');
                    farmerCharts.appendChild(chartSkeletonGrid());
                    nodes.push(farmerCharts);
                    nodes.push(buildWeatherWidget({ role: 'FARMER', user: user }));
                    buildRoleCharts('FARMER', bookings).then(function (c) { if (rid === dashRenderId) farmerCharts.replaceChildren(c); }).catch(function () { farmerCharts.replaceChildren(); });
                    nodes.push(sectionTitle('Tasdiqlashni kutayotgan bronlar', "Tasdiqlagandan keyin xaridorning telefon raqami ochiladi."));
                    if (pending.length) pending.slice(0, 5).forEach(function (b) { nodes.push(buildBookingCard(b, 'farmer')); });
                    else nodes.push(emptyState({ art: 'bookings', compact: true, title: "Yangi bron so'rovlari yo'q",
                        text: products.length ? "Do'konlar e'loningizni ko'rishi bilan bronlar shu yerda paydo bo'ladi." : "Hali e'lon qo'shmagansiz. Birinchi e'loningizni joylang: do'konlar bron qila boshlaydi.",
                        cta: { label: products.length ? "Yangi e'lon qo'shish" : "Birinchi e'loningizni joylang", icon: 'fa-plus', fn: function () { openProductModal(); } } }));
                } else if (user.role === 'MARKET') {
                    const bookings = await authed('GET', '/bookings/mine');
                    if (rid !== dashRenderId) return;
                    const count = function (st) { return bookings.filter(function (b) { return b.status === st; }).length; };
                    const approvedSum = bookings.filter(function (b) { return b.status === 'APPROVED'; })
                        .reduce(function (sum, b) { return sum + Number(b.totalPrice); }, 0);
                    const stats = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-4');
                    stats.appendChild(statCard('fa-hourglass-half', 'Kutilmoqda', String(count('PENDING')), 'text-amber-400'));
                    stats.appendChild(statCard('fa-circle-check', 'Tasdiqlangan', String(count('APPROVED')), 'text-emerald-400'));
                    stats.appendChild(statCard('fa-money-bill-wave', 'Tasdiqlangan summa', formatNumber(approvedSum) + " so'm", 'text-blue-400'));
                    stats.appendChild(statCard('fa-ban', 'Rad / bekor', String(count('REJECTED') + count('CANCELLED')), 'text-rose-400'));
                    nodes.push(stats);
                    const actions = el('div', 'flex flex-wrap gap-3');
                    const catBtn = actionBtn('fa-store', "Katalogga o'tish", true, function () { closeDashboard(); scrollToMarket(); });
                    catBtn.dataset.tour = 'primary';
                    actions.appendChild(catBtn);
                    actions.appendChild(actionBtn('fa-clipboard-list', 'Barcha bronlarim', false, function () { selectDashTab('bookings'); }));
                    actions.appendChild(actionBtn('fa-truck-ramp-box', 'Yuk tashish', false, function () { selectDashTab('shipments'); }));
                    actions.appendChild(actionBtn('fa-wallet', "To'lovlar", false, function () { selectDashTab('payments'); }));
                    nodes.push(actions);
                    const marketCharts = el('div');
                    marketCharts.appendChild(chartSkeletonGrid());
                    nodes.push(marketCharts);
                    buildRoleCharts('MARKET', bookings).then(function (c) { if (rid === dashRenderId) marketCharts.replaceChildren(c); }).catch(function () { marketCharts.replaceChildren(); });
                    nodes.push(sectionTitle("So'nggi bronlar"));
                    if (bookings.length) bookings.slice(0, 5).forEach(function (b) { nodes.push(buildBookingCard(b, 'market')); });
                    else nodes.push(emptyState({ art: 'bookings', compact: true, title: 'Hali bron qilmagansiz', text: "Katalogdan yangi mahsulot tanlab, fermerdan to'g'ridan-to'g'ri bron qiling.",
                        cta: { label: "Katalogga o'tish", icon: 'fa-store', fn: goCatalog } }));
                } else {
                    const res = await Promise.all([authed('GET', '/profile'), authed('GET', '/shipments/mine'), authed('GET', '/shipments/available'), authed('GET', '/shipments/eld?days=1').catch(function (e) { if (e.status === 401) throw e; return null; })]);
                    if (rid !== dashRenderId) return;
                    const u = res[0], mine = res[1], open = res[2];
                    saveUser(u);
                    const d = u.driver || {};
                    const active = mine.filter(function (x) { return x.status === 'LOADING' || x.status === 'IN_TRANSIT'; });
                    const delivered = mine.filter(function (x) { return x.status === 'DELIVERED'; });
                    setTabBadge('loads', open.length);
                    hello.appendChild(el('p', 'text-xs text-slate-500', [d.vehicleType, d.plateNumber, d.region].filter(Boolean).join(' · ')));
                    const stats = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-4');
                    stats.appendChild(statCard('fa-truck-fast', 'Faol yuk', String(active.length), 'text-blue-400'));
                    stats.appendChild(statCard('fa-circle-check', 'Yetkazilgan', String(delivered.length), 'text-emerald-400'));
                    stats.appendChild(statCard('fa-boxes-packing', "Mavjud yuklar", String(open.length), 'text-amber-400'));
                    stats.appendChild(statCard('fa-weight-hanging', "Yuk sig'imi", d.capacityKg ? formatNumber(d.capacityKg) + ' kg' : '—', 'text-rose-400'));
                    nodes.push(stats);
                    const actions = el('div', 'flex flex-wrap gap-3');
                    const loadsBtn = actionBtn('fa-boxes-packing', "Mavjud yuklarni ko'rish", true, function () { selectDashTab('loads'); });
                    loadsBtn.dataset.tour = 'primary';
                    actions.appendChild(loadsBtn);
                    actions.appendChild(actionBtn('fa-id-card', 'Profilni tahrirlash', false, function () { selectDashTab('profile'); }));
                    nodes.push(actions);
                    nodes.push(buildWeatherWidget({ role: 'DRIVER', user: user }));
                    if (res[3]) {
                        nodes.push(buildEldSummary(res[3], true));
                        nodes.push(actionBtn('fa-clock-rotate-left', "To'liq harakat jurnali", false, function () { selectDashTab('eld'); }));
                    }
                    nodes.push(sectionTitle('Faol yuk'));
                    if (active.length) active.forEach(function (x) { nodes.push(buildShipmentCard(x, 'driver-own')); });
                    else nodes.push(emptyState({ art: 'shipments', compact: true, title: "Hozir faol yuk yo'q", text: "To'lovi kafolatlangan yuklar ro'yxatidan o'zingizga mosini tanlang.",
                        cta: { label: "Mavjud yuklarni ko'rish", icon: 'fa-boxes-packing', fn: function () { selectDashTab('loads'); } } }));
                }
                dashContent.replaceChildren.apply(dashContent, nodes);
            } catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderDashOverview(user); }));
            }
        }

        // ----- Bronlar ro'yxati (fermer: kelgan, market: o'zi bergan) -----
        function formatDateTime(iso) {
            const d = new Date(iso);
            const p = function (n) { return String(n).padStart(2, '0'); };
            return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        }

        function buildBookingCard(b, side) {
            const meta = BOOKING_STATUS[b.status];
            const party = side === 'farmer' ? b.market : b.farmer;
            const partyName = side === 'farmer' ? party.companyName : party.farmName;
            const card = el('div', 'glass rounded-2xl border border-white/10 hover:border-emerald-500/40 transition p-5 space-y-4');

            const top = el('div', 'flex items-start justify-between gap-3');
            const title = el('div', 'min-w-0');
            title.appendChild(el('h4', 'font-extrabold text-white text-lg truncate', b.product.name));
            title.appendChild(el('p', 'text-xs text-slate-400 font-semibold uppercase tracking-wider', b.product.category));
            top.appendChild(title);
            top.appendChild(el('span', 'shrink-0 text-xs font-bold px-3 py-1 rounded-full border ' + meta.cls, meta.label));
            card.appendChild(top);

            const grid = el('div', 'grid grid-cols-3 gap-2 text-center');
            [['Miqdor', formatNumber(b.quantityKg) + ' kg'], ['Narx', formatNumber(b.pricePerKg) + " so'm/kg"], ['Jami', formatNumber(b.totalPrice) + " so'm"]].forEach(function (r) {
                const cell = el('div', 'rounded-xl bg-slate-950/50 border border-white/5 px-2 py-2');
                cell.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-slate-500 font-bold', r[0]));
                cell.appendChild(el('div', 'text-xs font-bold text-emerald-300 break-words', r[1]));
                grid.appendChild(cell);
            });
            card.appendChild(grid);
            if (b.breakdown && b.status !== 'REJECTED' && b.status !== 'CANCELLED') card.appendChild(bdChips(b.breakdown, side === 'farmer' ? 'FARMER' : 'MARKET', function () { openBdModal({ title: b.product.name, sub: b.product.category + ' · ' + T('{0} kg × {1}', formatNumber(b.quantityKg), bdMoney(Number(b.pricePerKg))), src: b.breakdown, role: side === 'farmer' ? 'FARMER' : 'MARKET', ctx: { quantityKg: b.quantityKg, pricePerKg: b.pricePerKg }, shipmentId: null }); }));

            const info = el('div', 'space-y-1.5 text-sm text-slate-300');
            const row = function (icon, text) {
                const r = el('div', 'flex items-start gap-2.5');
                r.appendChild(el('i', 'fa-solid ' + icon + ' text-emerald-400 mt-1 w-4 text-center text-xs'));
                r.appendChild(el('span', 'min-w-0 break-words', text));
                info.appendChild(r);
            };
            row(side === 'farmer' ? 'fa-store' : 'fa-tractor', partyName + ' · ' + party.region + ', ' + party.district);
            row('fa-clock', formatDateTime(b.createdAt));
            if (b.message) row('fa-comment', b.message);
            card.appendChild(info);

            if (b.status === 'APPROVED' && party.phone) {
                const contact = el('div', 'rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 flex items-center justify-between gap-3');
                const who = el('div', 'min-w-0');
                who.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-emerald-400 font-bold', 'Aloqa ochildi'));
                who.appendChild(el('div', 'text-sm font-bold text-white truncate', party.fullName));
                contact.appendChild(who);
                const call = el('a', 'shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 text-sm font-extrabold hover:bg-emerald-400 transition');
                call.href = 'tel:' + party.phone;
                call.appendChild(el('i', 'fa-solid fa-phone'));
                call.appendChild(el('span', '', party.phone));
                contact.appendChild(call);
                card.appendChild(contact);
            } else if (b.status === 'PENDING') {
                const lock = el('p', 'text-[11px] text-slate-500 flex items-center gap-1.5');
                lock.appendChild(el('i', 'fa-solid fa-lock'));
                lock.appendChild(document.createTextNode(side === 'farmer'
                    ? "Tasdiqlaganingizdan keyin xaridorning telefon raqami ochiladi."
                    : "Fermer tasdiqlagandan keyin telefon raqami ochiladi."));
                card.appendChild(lock);
            }

            if (b.payment && b.status !== 'REJECTED') card.appendChild(paymentStrip(b, side));

            if (b.status === 'PENDING') {
                const actions = el('div', 'flex gap-2');
                const btn = function (icon, label, cls, kind) {
                    const x = el('button', 'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition disabled:opacity-50 ' + cls);
                    x.type = 'button';
                    x.appendChild(el('i', 'fa-solid ' + icon));
                    x.appendChild(el('span', '', label));
                    x.addEventListener('click', function () { bookingAction(b.id, kind, x); });
                    return x;
                };
                if (side === 'farmer') {
                    actions.appendChild(btn('fa-check', 'Tasdiqlash', 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25', 'approve'));
                    actions.appendChild(btn('fa-xmark', 'Rad etish', 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10', 'reject'));
                } else {
                    actions.appendChild(btn('fa-ban', 'Bekor qilish', 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10', 'cancel'));
                }
                card.appendChild(actions);
            }
            return card;
        }

        const BOOKING_DONE_MSG = {
            approve: "Bron tasdiqlandi. Xaridorning telefon raqami ochildi, yuk tashish buyurtmasi yaratildi va to'lov kutilmoqda.",
            reject: "Bron rad etildi. Miqdor e'longa qaytarildi.",
            cancel: "Bron bekor qilindi. Miqdor e'longa qaytarildi."
        };

        async function bookingAction(id, kind, button) {
            button.disabled = true;
            try {
                const done = await authed('PATCH', '/bookings/' + id + '/' + kind);
                if (done && done.__queued) return;
                if (kind === 'approve') showSuccessCheck('Bron tasdiqlandi!', "Yuk tashish buyurtmasi yaratildi");
                else showToast(BOOKING_DONE_MSG[kind], 3500);
            } catch (err) {
                if (err.status === 401) return;
                showToast(err.messages[0], 4000);
            }
            selectDashTab(dashTab); // ro'yxat va hisoblagichlarni yangilaydi
            if (typeof loadMarket === 'function') loadMarket();
        }

        async function renderDashBookings(user) {
            const rid = ++dashRenderId;
            const side = user.role === 'FARMER' ? 'farmer' : 'market';
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Bronlar yuklanmoqda...'));
            let list;
            try {
                list = await authed('GET', side === 'farmer' ? '/bookings/incoming' : '/bookings/mine');
            } catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderDashBookings(user); }));
            }
            if (rid !== dashRenderId) return;
            if (side === 'farmer') setTabBadge('bookings', list.filter(function (b) { return b.status === 'PENDING'; }).length);

            const head = el('div', 'space-y-3');
            head.appendChild(el('h2', 'text-2xl font-extrabold text-white', side === 'farmer' ? 'Kelgan bronlar' : 'Mening bronlarim'));
            const chips = el('div', 'flex flex-wrap gap-2');
            [['ALL', 'Hammasi'], ['PENDING', 'Kutilmoqda'], ['APPROVED', 'Tasdiqlangan'], ['REJECTED', 'Rad etilgan'], ['CANCELLED', 'Bekor qilingan']].forEach(function (f) {
                const n = f[0] === 'ALL' ? list.length : list.filter(function (b) { return b.status === f[0]; }).length;
                const c = el('button', 'mp-chip px-4 py-1.5 rounded-full border border-white/15 text-xs font-bold text-slate-300 transition hover:border-emerald-500/50' + (dashBookingFilter === f[0] ? ' active' : ''), f[1] + ' (' + n + ')');
                c.type = 'button';
                c.addEventListener('click', function () { dashBookingFilter = f[0]; renderDashBookings(user); });
                chips.appendChild(c);
            });
            head.appendChild(chips);

            const items = dashBookingFilter === 'ALL' ? list : list.filter(function (b) { return b.status === dashBookingFilter; });
            const nodes = [head];
            if (items.length) items.forEach(function (b) { nodes.push(buildBookingCard(b, side)); });
            else nodes.push(list.length
                ? emptyState({ art: 'search', compact: true, title: "Bu holatdagi bronlar yo'q", text: 'Boshqa holatni tanlab ko\'ring.' })
                : side === 'farmer'
                    ? emptyState({ art: 'listings', title: "Hali bron so'rovlari kelmagan", text: "E'lon joylang: do'konlar uni ko'rib, bron qila boshlaydi.", cta: { label: "Birinchi e'loningizni joylang", icon: 'fa-plus', fn: function () { openProductModal(); } }, secondary: { label: "Mening e'lonlarim", icon: 'fa-boxes-stacked', fn: openMyProducts } })
                    : emptyState({ art: 'bookings', title: 'Hali bron qilmagansiz', text: "Katalogdan yangi mahsulot tanlab, fermerdan to'g'ridan-to'g'ri bron qiling.", cta: { label: "Katalogga o'tish", icon: 'fa-store', fn: goCatalog } }));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ===== OMBORXONA (Smart Warehouse / WMS) =====
        const WH_ZONES = {
            INBOUND:  { label: 'Qabul qilish',          short: 'Qabul',    icon: 'fa-dolly',          cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
            STORAGE:  { label: 'Saqlash',               short: 'Saqlash',  icon: 'fa-warehouse',      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
            SORTING:  { label: 'Saralash va qadoqlash', short: 'Saralash', icon: 'fa-boxes-packing',  cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
            OUTBOUND: { label: "Jo'natish",             short: "Jo'natish", icon: 'fa-truck-ramp-box', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' }
        };
        const WH_ZONE_ORDER = ['INBOUND', 'STORAGE', 'SORTING', 'OUTBOUND'];
        const WH_STATUS = {
            ANNOUNCED: { label: "E'lon qilindi, yo'lda", cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
            RECEIVED:  { label: 'Tekshiruv kutilmoqda',  cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
            ACTIVE:    { label: 'Omborda',               cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
            REJECTED:  { label: 'Rad etildi',            cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
            DEPLETED:  { label: "To'liq jo'natildi",     cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
        };
        const STORAGE_TYPES = {
            DRY:        { label: 'Quruq ombor',          icon: 'fa-sun' },
            COLD:       { label: 'Sovitkichli kamera',   icon: 'fa-snowflake' },
            VENTILATED: { label: 'Ventilyatsiyali ombor', icon: 'fa-wind' }
        };
        const CLIMATE_STATUS = {
            OK:      { label: "Me'yorda",        text: 'text-emerald-300', dot: 'bg-emerald-400' },
            WARN:    { label: 'Chegarada',       text: 'text-amber-300',   dot: 'bg-amber-400' },
            ALARM:   { label: 'Avariya!',        text: 'text-rose-300',    dot: 'bg-rose-500' },
            NO_DATA: { label: "Ma'lumot yo'q",   text: 'text-slate-400',   dot: 'bg-slate-500' }
        };
        const WH_CATEGORIES = ['Sabzavot', 'Meva', 'Poliz', 'Don', "Urug'lik", 'Qadoqlangan', 'Boshqa'];
        const WH_CAT_ICONS = { Sabzavot: 'fa-carrot', Meva: 'fa-apple-whole', Poliz: 'fa-leaf', Don: 'fa-wheat-awn', "Urug'lik": 'fa-seedling', Qadoqlangan: 'fa-box', Boshqa: 'fa-box' };
        const SIZE_LABELS = { SMALL: 'Kichik', MEDIUM: "O'rta", LARGE: 'Katta' };
        const WH_ORDER_STATUS = {
            PENDING:    { label: 'Kutilmoqda',    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
            PICKING:    { label: "Yig'ilmoqda",   cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
            PICKED:     { label: "Yig'ildi",      cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
            DISPATCHED: { label: "Yo'lda",        cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
            DELIVERED:  { label: 'Yetkazildi',    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
            CANCELLED:  { label: 'Bekor qilindi', cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
        };
        const WH_ORDER_STEPS = ['PENDING', 'PICKING', 'PICKED', 'DISPATCHED', 'DELIVERED'];
        const STAFF_ROLES = ['DISPATCHER', 'ADMIN'];
        const isStaffRole = function (u) { return !!u && STAFF_ROLES.indexOf(u.role) !== -1; };

        const money = function (n) { return formatNumber(Math.round(Number(n))) + " so'm"; };
        const kg = function (n) { return formatNumber(Number(n)) + ' kg'; };
        const moneyExact = function (n) { return formatNumber(Number(n)) + " so'm"; }; // tiyin aniqligi (escrow summalari)
        function timeAgo(iso) {
            const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
            if (s < 60) return 'hozirgina';
            if (s < 3600) return Math.floor(s / 60) + ' daqiqa oldin';
            if (s < 86400) return Math.floor(s / 3600) + ' soat oldin';
            return Math.floor(s / 86400) + ' kun oldin';
        }
        function whRefresh() { if (dashboardView.classList.contains('open')) selectDashTab(dashTab); }
        function whImg(url) { return /^\/uploads\//.test(url || '') ? API_URL + url : null; }

        // ----- Shtrix-kod / QR (vendor/ ichida, kerak bo'lganda yuklanadi) -----
        const BARCODE_LIBS = ['vendor/JsBarcode.code128.min.js', 'vendor/qrcode.js'];
        let barcodePromise = null;
        function loadScriptOnce(src) {
            return new Promise(function (resolve, reject) {
                const sc = document.createElement('script');
                sc.src = src; sc.async = true;
                sc.onload = resolve;
                sc.onerror = function () { sc.remove(); reject(new Error('script')); };
                document.head.appendChild(sc);
            });
        }
        function loadBarcodeLibs() {
            if (!barcodePromise) barcodePromise = Promise.all(BARCODE_LIBS.map(loadScriptOnce)).then(function () {
                if (typeof window.JsBarcode !== 'function' || typeof window.qrcode !== 'function') throw new Error('libs');
            }).catch(function (e) { barcodePromise = null; throw e; });
            return barcodePromise;
        }
        // Skaner uchun oq fon va bo'sh chekka (quiet zone) shart: SVG'ning o'zida beriladi
        function drawBarcodeSvg(code) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            window.JsBarcode(svg, code, { format: 'CODE128', width: 2, height: 80, displayValue: true, fontSize: 15, margin: 12, background: '#ffffff', lineColor: '#000000' });
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', 'Shtrix-kod ' + code);
            svg.removeAttribute('style');
            svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.maxWidth = '24rem'; svg.style.display = 'block'; svg.style.marginLeft = 'auto'; svg.style.marginRight = 'auto';
            return svg;
        }
        function drawQrSvg(code) {
            const qr = window.qrcode(0, 'M');
            qr.addData(code);
            qr.make();
            const svg = new DOMParser().parseFromString(qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }), 'image/svg+xml').documentElement;
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', 'QR kod ' + code);
            svg.removeAttribute('width'); svg.removeAttribute('height');
            svg.style.width = '100%'; svg.style.maxWidth = '13rem'; svg.style.height = 'auto'; svg.style.display = 'block'; svg.style.marginLeft = 'auto'; svg.style.marginRight = 'auto';
            return document.importNode(svg, true);
        }
        function printCodeLabel(code, title, sub) {
            const w = window.open('', '_blank', 'width=520,height=640');
            if (!w) return showToast("Chop etish oynasini ochib bo'lmadi. Brauzerda qalqib chiquvchi oynaga ruxsat bering.", 5000);
            const d = w.document;
            d.open();
            d.write('<!doctype html><meta charset="utf-8">');
            d.close();
            d.title = code;
            const css = d.createElement('link');
            css.rel = 'stylesheet'; css.href = new URL('vendor/label-print.css', location.href).href;
            d.head.appendChild(css);
            const lbl = d.createElement('div');
            lbl.className = 'lbl';
            const h = d.createElement('h1'); h.textContent = title;
            const sp = d.createElement('p'); sp.textContent = sub;
            const qr = d.createElement('div'); qr.className = 'qr';
            qr.appendChild(d.importNode(drawQrSvg(code), true));
            lbl.append(h, sp, d.importNode(drawBarcodeSvg(code), true), qr);
            const bp = d.createElement('p'); bp.className = 'noprint';
            const bb = d.createElement('button'); bb.textContent = T('Chop etish');
            bb.addEventListener('click', function () { w.print(); });
            bp.appendChild(bb);
            d.body.append(lbl, bp);
            css.onload = css.onerror = function () { setTimeout(function () { w.print(); }, 150); };
        }
        // Yuk yorlig'i: shtrix-kod va QR bitta ko'rinishda (dispetcher istalganini skanerlaydi)
        function buildCodeVisual(code, title, sub) {
            const box = el('div', 'space-y-3');
            const stage = el('div', 'rounded-2xl bg-white p-3 min-h-[8rem] flex flex-col items-center justify-center gap-3');
            stage.appendChild(el('span', 'text-xs text-slate-500', 'Yuklanmoqda...'));
            box.appendChild(stage);
            const tabs = el('div', 'flex gap-2 justify-center');
            let mode = 'barcode';
            const btns = {};
            const paint = function () {
                loadBarcodeLibs().then(function () {
                    if (!stage.isConnected) return;
                    stage.replaceChildren(mode === 'barcode' ? drawBarcodeSvg(code) : drawQrSvg(code));
                }).catch(function () {
                    stage.replaceChildren(el('span', 'text-xs text-rose-600 font-semibold', "Shtrix-kodni chizib bo'lmadi. Kodni matn ko'rinishida ishlating."));
                });
                Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('active', k === mode); });
            };
            [['barcode', 'fa-barcode', 'Shtrix-kod'], ['qr', 'fa-qrcode', 'QR kod']].forEach(function (t) {
                const b = el('button', 'mp-chip px-4 py-1.5 rounded-full border border-white/15 text-xs font-bold text-slate-300 transition hover:border-emerald-500/50 flex items-center gap-2');
                b.type = 'button';
                b.appendChild(el('i', 'fa-solid ' + t[1]));
                b.appendChild(el('span', '', t[2]));
                b.addEventListener('click', function () { mode = t[0]; paint(); });
                btns[t[0]] = b; tabs.appendChild(b);
            });
            box.appendChild(tabs);
            const row = el('div', 'flex items-center justify-center gap-2 flex-wrap');
            row.appendChild(el('code', 'text-sm font-mono font-bold text-slate-200 bg-slate-950/60 border border-white/10 rounded-lg px-3 py-1.5 break-all', code));
            const pr = el('button', 'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-extrabold border border-white/15 text-slate-200 hover:bg-white/10 transition');
            pr.type = 'button';
            pr.appendChild(el('i', 'fa-solid fa-print'));
            pr.appendChild(el('span', '', 'Yorliqni chop etish'));
            pr.addEventListener('click', function () {
                loadBarcodeLibs().then(function () { printCodeLabel(code, title || code, sub || ''); }).catch(function () { showToast("Kutubxonani yuklab bo'lmadi.", 4000); });
            });
            row.appendChild(pr);
            box.appendChild(row);
            paint();
            return box;
        }
        function openCodeLabel(code, title, sub) {
            openWhModal('Shtrix-kod / QR yorlig\'i', title || code, buildCodeVisual(code, title, sub), false);
        }
        // Kamera orqali skanerlash: faqat brauzer BarcodeDetector'ni qo'llasa ko'rsatiladi
        const cameraScanSupported = function () { return 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); };
        async function openCameraScan() {
            const box = el('div', 'space-y-3');
            const video = el('video', 'w-full rounded-2xl bg-black');
            video.setAttribute('playsinline', ''); video.muted = true;
            const hint = el('p', 'text-xs text-slate-400 text-center', 'Shtrix-kod yoki QR kodni kameraga yaqinlashtiring.');
            box.append(video, hint);
            let stream = null, stopped = false;
            const stop = function () { stopped = true; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); };
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
            } catch (e) { return showToast("Kameraga ruxsat berilmadi yoki kamera topilmadi. Kodni qo'lda kiriting.", 5000); }
            video.srcObject = stream;
            openWhModal('Kamera bilan skanerlash', '', box, false);
            try { await video.play(); } catch (e) {}
            let detector;
            try { detector = new window.BarcodeDetector({ formats: ['code_128', 'qr_code'] }); } catch (e) { detector = new window.BarcodeDetector(); }
            const tick = async function () {
                if (stopped) return;
                if (!video.isConnected) return stop(); // oyna yopilgan
                try {
                    const found = await detector.detect(video);
                    if (found.length && found[0].rawValue) {
                        stop(); closeWhModal();
                        return whDetailDialog(String(found[0].rawValue).slice(0, 80));
                    }
                } catch (e) {}
                setTimeout(tick, 250);
            };
            tick();
        }

        // ----- Umumiy oyna va forma yordamchilari -----
        const whModal = document.getElementById('wh-modal');
        function openWhModal(title, sub, bodyNode, wide) {
            document.getElementById('wh-title').textContent = title;
            const s = document.getElementById('wh-sub');
            s.textContent = sub || '';
            s.classList.toggle('hidden', !sub);
            hideAuthAlert(document.getElementById('wh-alert'));
            document.getElementById('wh-card').classList.toggle('max-w-3xl', !!wide);
            document.getElementById('wh-card').classList.toggle('max-w-lg', !wide);
            document.getElementById('wh-body').replaceChildren(bodyNode);
            whModal.classList.add('open');
            syncScrollLock();
            const first = bodyNode.querySelector && bodyNode.querySelector('input:not([type=hidden]), select, textarea');
            if (first) setTimeout(function () { first.focus(); }, 60);
        }
        function closeWhModal() { whModal.classList.remove('open'); syncScrollLock(); }

        // fields: [{ name, label, type: text|number|select|textarea|checkbox|file, options:[[v,l]], value, min, max, step, required, hint, placeholder }]
        function openWhForm(o) {
            const form = el('form', 'space-y-4');
            form.noValidate = true;
            const inputs = {};
            o.fields.forEach(function (f) {
                const wrap = el('div');
                if (f.type === 'checkbox') {
                    const lab = el('label', 'flex items-start gap-3 text-sm text-slate-300 cursor-pointer');
                    const cb = el('input', 'mt-1 accent-emerald-500');
                    cb.type = 'checkbox'; cb.checked = !!f.value;
                    lab.appendChild(cb); lab.appendChild(el('span', '', f.label));
                    wrap.appendChild(lab);
                    inputs[f.name] = cb;
                } else {
                    const lab = el('label', 'block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5', f.label + (f.required ? ' *' : ''));
                    wrap.appendChild(lab);
                    let inp;
                    if (f.type === 'select') {
                        inp = el('select', 'auth-input');
                        f.options.forEach(function (op) { inp.appendChild(new Option(op[1], op[0])); });
                        if (f.value !== undefined) inp.value = f.value;
                    } else if (f.type === 'textarea') {
                        inp = el('textarea', 'auth-input'); inp.rows = 3; if (f.value) inp.value = f.value;
                    } else {
                        inp = el('input', 'auth-input');
                        inp.type = f.type || 'text';
                        if (f.type === 'number') { inp.step = f.step || 'any'; if (f.min !== undefined) inp.min = f.min; if (f.max !== undefined) inp.max = f.max; inp.inputMode = 'decimal'; }
                        if (f.type === 'file') inp.accept = 'image/jpeg,image/png,image/webp';
                        if (f.value !== undefined && f.type !== 'file') inp.value = f.value;
                    }
                    if (f.placeholder) inp.placeholder = f.placeholder;
                    if (f.maxLength) inp.maxLength = f.maxLength;
                    lab.htmlFor = inp.id = 'whf-' + f.name;
                    wrap.appendChild(inp);
                    inputs[f.name] = inp;
                }
                if (f.hint) { const h = el('p', 'text-[11px] text-slate-500 mt-1.5', f.hint); wrap.appendChild(h); inputs[f.name]._hint = h; }
                form.appendChild(wrap);
            });
            if (o.onBuilt) o.onBuilt(inputs);
            const submit = el('button', 'auth-submit w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-extrabold py-3.5 rounded-2xl transition duration-200 shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2.5');
            submit.type = 'submit';
            submit.appendChild(el('i', 'fa-solid ' + (o.icon || 'fa-check')));
            submit.appendChild(el('span', '', o.submit || 'Saqlash'));
            form.appendChild(submit);
            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                const alertBox = document.getElementById('wh-alert');
                hideAuthAlert(alertBox);
                const values = {}, errors = [];
                o.fields.forEach(function (f) {
                    const inp = inputs[f.name];
                    if (f.type === 'checkbox') { values[f.name] = inp.checked; return; }
                    if (f.type === 'file') { values[f.name] = inp.files && inp.files[0] ? inp.files[0] : null; return; }
                    const raw = String(inp.value).trim();
                    if (f.type === 'number') {
                        if (raw === '') { if (f.required) errors.push(f.label + ' kiritilishi shart.'); values[f.name] = undefined; return; }
                        const n = Number(raw.replace(',', '.'));
                        if (!isFinite(n)) { errors.push(f.label + " son bo'lishi kerak."); return; }
                        if (f.min !== undefined && n < Number(f.min)) errors.push(f.label + ' kamida ' + f.min + ' bo\'lishi kerak.');
                        if (f.max !== undefined && n > Number(f.max)) errors.push(f.label + ' ko\'pi bilan ' + f.max + ' bo\'lishi kerak.');
                        values[f.name] = n;
                    } else {
                        if (f.required && !raw) errors.push(f.label + ' kiritilishi shart.');
                        values[f.name] = raw === '' ? undefined : raw;
                    }
                });
                if (errors.length) return showAuthAlert(errors, 'error', alertBox);
                setLoading(form, true);
                try {
                    const result = await o.onSubmit(values);
                    closeWhModal();
                    if (o.done) showToast(o.done, 3500);
                    whRefresh();
                    if (o.after) o.after(result);
                } catch (err) {
                    if (err.status !== 401) showAuthAlert(err.messages || [String(err.message || err)], 'error', alertBox);
                } finally {
                    setLoading(form, false);
                }
            });
            openWhModal(o.title, o.sub, form);
        }

        async function whUploadPhoto(id, file) {
            if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw { messages: ['Faqat JPG, PNG yoki WEBP rasm yuklang.'] };
            if (file.size > 3 * 1024 * 1024) throw { messages: ['Rasm hajmi 3 MB dan oshmasligi kerak.'] };
            const token = storageGet(TOKEN_KEY);
            if (!token) { handleSessionExpired(reopenDash); throw { status: 401, messages: [] }; }
            const fd = new FormData();
            fd.append('file', file);
            let res;
            try { res = await fetch(API_URL + '/warehouse/items/' + id + '/photo', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd }); }
            catch (e) { throw { messages: ["Serverga ulanib bo'lmadi."] }; }
            if (res.status === 401) { handleSessionExpired(reopenDash); throw { status: 401, messages: [] }; }
            if (!res.ok) {
                let data = null; try { data = await res.json(); } catch (e) {}
                const m = data && data.message ? (Array.isArray(data.message) ? data.message[0] : data.message) : "Rasmni yuklab bo'lmadi.";
                throw { messages: [res.status === 413 ? 'Rasm hajmi 3 MB dan oshmasligi kerak.' : m] };
            }
            return res.json();
        }

        // ----- Kichik vizual elementlar -----
        function whPill(text, cls, icon) {
            const p = el('span', 'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ' + cls);
            if (icon) p.appendChild(el('i', 'fa-solid ' + icon));
            p.appendChild(document.createTextNode(text));
            return p;
        }
        function whStat(label, value, tone) {
            const b = el('div', 'rounded-xl bg-slate-950/40 border border-white/5 px-3 py-2.5 min-w-0');
            b.appendChild(el('div', 'text-[10px] font-bold uppercase tracking-wider text-slate-500', label));
            b.appendChild(el('div', 'text-sm sm:text-base font-extrabold truncate ' + (tone || 'text-white'), value));
            return b;
        }
        function whZoneStepper(zone, status) {
            const idx = WH_ZONE_ORDER.indexOf(zone);
            const live = status === 'ACTIVE' || status === 'DEPLETED';
            const wrap = el('div', 'grid grid-cols-4 gap-1');
            WH_ZONE_ORDER.forEach(function (z, i) {
                const done = live ? i <= idx : (status === 'RECEIVED' || status === 'REJECTED') ? i === 0 : false;
                const col = el('div', 'flex flex-col items-center gap-1.5 text-center');
                const bar = el('div', 'h-1.5 w-full rounded-full ' + (done ? (i === idx ? 'bg-emerald-400' : 'bg-emerald-500/60') : 'bg-white/10'));
                col.appendChild(bar);
                col.appendChild(el('span', 'text-[10px] font-bold leading-tight ' + (i === idx && live ? 'text-emerald-300' : 'text-slate-500'), WH_ZONES[z].short));
                wrap.appendChild(col);
            });
            return wrap;
        }
        // Harorat/namlik shkalasi: me'yor oralig'i (yashil) va hozirgi ko'rsatkich (nuqta)
        function whGauge(label, unit, lo, hi, value, scaleMin, scaleMax) {
            const box = el('div', 'space-y-1');
            const row = el('div', 'flex justify-between text-[11px] font-semibold');
            row.appendChild(el('span', 'text-slate-400', label));
            row.appendChild(el('span', value === null || value === undefined ? 'text-slate-500' : 'text-white', value === null || value === undefined ? '—' : Number(value).toFixed(1) + unit));
            box.appendChild(row);
            const track = el('div', 'relative h-2 rounded-full bg-white/10');
            const pct = function (v) { return Math.max(0, Math.min(100, (v - scaleMin) / (scaleMax - scaleMin) * 100)); };
            const band = el('div', 'absolute top-0 bottom-0 rounded-full bg-emerald-500/35');
            band.style.left = pct(lo) + '%'; band.style.width = (pct(hi) - pct(lo)) + '%';
            track.appendChild(band);
            if (value !== null && value !== undefined) {
                const ok = value >= lo && value <= hi;
                const dot = el('div', 'absolute top-1/2 w-3.5 h-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-slate-900 ' + (ok ? 'bg-emerald-400' : 'bg-rose-500'));
                dot.style.left = pct(value) + '%';
                track.appendChild(dot);
            }
            box.appendChild(track);
            box.appendChild(el('div', 'text-[10px] text-slate-500', "Me'yor: " + lo + '–' + hi + unit));
            return box;
        }
        function whClimateBlock(it) {
            const c = it.climate, t = c.target, u = c.unit;
            const box = el('div', 'rounded-2xl bg-slate-950/40 border border-white/5 p-3.5 space-y-3');
            const head = el('div', 'flex items-center justify-between gap-2');
            const st = STORAGE_TYPES[it.storageType];
            const left = el('div', 'flex items-center gap-2 text-xs font-bold text-slate-200 min-w-0');
            left.appendChild(el('i', 'fa-solid text-emerald-400 ' + st.icon));
            left.appendChild(el('span', 'truncate', u ? u.name : st.label));
            head.appendChild(left);
            if (u) {
                const cs = CLIMATE_STATUS[u.status];
                const s = el('span', 'flex items-center gap-1.5 text-[11px] font-bold shrink-0 ' + cs.text);
                s.appendChild(el('span', 'w-2 h-2 rounded-full ' + cs.dot));
                s.appendChild(document.createTextNode(cs.label));
                head.appendChild(s);
            } else head.appendChild(el('span', 'text-[11px] text-slate-500 shrink-0', 'Kamera belgilanmagan'));
            box.appendChild(head);
            const g = el('div', 'grid grid-cols-2 gap-3');
            g.appendChild(whGauge('Harorat', ' °C', t.tempMinC, t.tempMaxC, u ? u.tempC : null, t.tempMinC - 8, t.tempMaxC + 8));
            g.appendChild(whGauge('Namlik', ' %', t.humidityMin, t.humidityMax, u ? u.humidity : null, 0, 100));
            box.appendChild(g);
            if (u && u.readingAt) box.appendChild(el('div', 'text-[10px] text-slate-500', 'Oxirgi o\'lchov: ' + timeAgo(u.readingAt)));
            return box;
        }
        function whExpiry(it) {
            if (!it.expiresAt) return null;
            const d = Math.ceil((new Date(it.expiresAt).getTime() - Date.now()) / 86400000);
            return { days: d, text: d <= 0 ? 'Muddati tugagan' : d + ' kun', tone: d <= 3 ? 'text-rose-300' : d <= 7 ? 'text-amber-300' : 'text-white' };
        }

        // ----- "Post" ko'rinishidagi yuk kartasi (ijtimoiy tarmoq uslubida) -----
        // mode: 'market' | 'owner'
        function buildWhPost(it, mode) {
            const card = el('article', 'glass rounded-3xl border border-white/10 hover:border-emerald-500/40 transition overflow-hidden flex flex-col');
            const head = el('div', 'flex items-center gap-3 px-5 pt-5');
            const av = el('div', 'w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-black flex items-center justify-center shrink-0', (it.farmer.farmName || '?').slice(0, 1).toUpperCase());
            head.appendChild(av);
            const who = el('div', 'min-w-0 flex-1');
            who.appendChild(el('div', 'font-extrabold text-white truncate', it.farmer.farmName));
            who.appendChild(el('div', 'text-xs text-slate-400 truncate', it.farmer.region + ' · ' + timeAgo(it.updatedAt)));
            head.appendChild(who);
            const z = WH_ZONES[it.zone];
            head.appendChild(whPill(z.short, z.cls, z.icon));
            card.appendChild(head);

            const photo = el('div', 'relative mt-4 aspect-[16/9] bg-gradient-to-br from-emerald-900/60 via-slate-900 to-slate-950 overflow-hidden');
            const src = whImg(it.photoUrl);
            if (src) {
                const img = el('img', 'w-full h-full object-cover');
                img.src = src; img.alt = it.name; img.loading = 'lazy';
                img.addEventListener('error', function () { img.remove(); });
                photo.appendChild(img);
            }
            const ph = el('div', 'absolute inset-0 flex items-center justify-center -z-0');
            ph.appendChild(el('i', 'fa-solid text-6xl text-emerald-500/25 ' + (WH_CAT_ICONS[it.category] || 'fa-box')));
            photo.insertBefore(ph, photo.firstChild);
            const chips = el('div', 'absolute left-3 top-3 flex flex-wrap gap-1.5');
            if (it.grade) chips.appendChild(whPill('Sifat ' + it.grade, 'bg-slate-950/70 text-emerald-300 border-emerald-500/40', 'fa-medal'));
            if (it.sizeClass) chips.appendChild(whPill(SIZE_LABELS[it.sizeClass], 'bg-slate-950/70 text-slate-200 border-white/20', 'fa-ruler'));
            photo.appendChild(chips);
            card.appendChild(photo);

            const body = el('div', 'p-5 space-y-4 flex-1 flex flex-col');
            const titleRow = el('div', 'space-y-1');
            titleRow.appendChild(el('h3', 'text-xl font-extrabold text-white', it.name));
            const meta = el('div', 'flex flex-wrap items-center gap-2 text-xs text-slate-400 font-semibold');
            meta.appendChild(document.createTextNode(it.category));
            if (it.packagingType) meta.appendChild(whPill(it.packagingType + (it.packageWeightKg ? ' · ' + Number(it.packageWeightKg) + ' kg' : ''), 'bg-white/5 text-slate-300 border-white/15', 'fa-box-open'));
            titleRow.appendChild(meta);
            if (it.description) titleRow.appendChild(el('p', 'text-sm text-slate-400 leading-relaxed', it.description));
            body.appendChild(titleRow);

            const stats = el('div', 'grid grid-cols-3 gap-2');
            stats.appendChild(whStat('Mavjud', kg(it.availableKg), 'text-emerald-300'));
            stats.appendChild(whStat('Narx / kg', money(it.pricePerKg)));
            const ex = whExpiry(it);
            stats.appendChild(whStat('Yaroqlilik', ex ? ex.text : '—', ex ? ex.tone : 'text-slate-400'));
            body.appendChild(stats);
            body.appendChild(whClimateBlock(it));
            body.appendChild(whZoneStepper(it.zone, it.status));

            if (mode === 'owner') {
                const st = WH_STATUS[it.status];
                const row = el('div', 'flex flex-wrap items-center gap-2');
                row.appendChild(whPill(st.label, st.cls));
                if (it.code) {
                    const cp = el('button', 'text-[11px] font-mono font-bold text-slate-300 bg-slate-950/60 border border-white/10 rounded-full px-3 py-1 flex items-center gap-1.5 hover:border-emerald-500/40 transition');
                    cp.type = 'button'; cp.title = "Shtrix-kod / QR'ni ko'rish";
                    cp.appendChild(el('i', 'fa-solid fa-barcode text-emerald-400'));
                    cp.appendChild(document.createTextNode(it.code));
                    cp.addEventListener('click', function () { openCodeLabel(it.code, it.name, it.farmer ? it.farmer.farmName : ''); });
                    row.appendChild(cp);
                }
                body.appendChild(row);
                const w = el('div', 'grid grid-cols-3 gap-2');
                w.appendChild(whStat("E'lon qilingan", kg(it.declaredWeightKg)));
                w.appendChild(whStat('Tortilgan', it.receivedWeightKg ? kg(it.receivedWeightKg) : '—'));
                w.appendChild(whStat('Yaroqsiz', kg(it.rejectedKg), Number(it.rejectedKg) > 0 ? 'text-rose-300' : 'text-white'));
                body.appendChild(w);
                if (it.inspectionNotes) body.appendChild(el('p', 'text-xs text-slate-400', 'Tekshiruv izohi: ' + it.inspectionNotes));
                if (Number(it.reservedKg) > 0) body.appendChild(el('p', 'text-xs font-semibold text-amber-300', kg(it.reservedKg) + ' marketlar buyurtmasi uchun zaxiralangan.'));
            }

            const actions = el('div', 'mt-auto pt-1 flex flex-wrap gap-2');
            const abtn = function (icon, label, primary, fn) {
                const b = el('button', 'flex-1 min-w-[8rem] flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-extrabold border transition active:scale-95 ' + (primary
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/25'
                    : 'border-white/15 text-slate-200 hover:bg-white/10'));
                b.type = 'button';
                b.appendChild(el('i', 'fa-solid ' + icon));
                b.appendChild(el('span', '', label));
                b.addEventListener('click', fn);
                return b;
            };
            if (mode === 'market') {
                actions.appendChild(abtn('fa-cart-shopping', 'Buyurtma berish', true, function () { whOrderDialog(it); }));
            } else {
                if (it.status !== 'DEPLETED' && it.status !== 'REJECTED') actions.appendChild(abtn('fa-camera', it.photoUrl ? "Rasmni almashtirish" : "Rasm qo'shish", false, function () { whPhotoDialog(it); }));
                if (it.status === 'ANNOUNCED') actions.appendChild(abtn('fa-ban', "E'lonni bekor qilish", false, function () { whCancelAnnouncement(it); }));
            }
            if (actions.childNodes.length) body.appendChild(actions);
            card.appendChild(body);
            return card;
        }

        // ----- Fermer: dialoglar -----
        function whAnnounceDialog() {
            openWhForm({
                title: 'Omborga yuk yuborish', sub: "Yukingiz haqida ma'lumot bering. Dispetcher qabul qilib, tortadi va sifatini tekshiradi.", icon: 'fa-paper-plane', submit: "E'lon qilish",
                fields: [
                    { name: 'name', label: 'Mahsulot nomi', required: true, placeholder: 'Masalan: Kartoshka (Sante)', maxLength: 80 },
                    { name: 'category', label: 'Toifa', type: 'select', options: WH_CATEGORIES.map(function (c) { return [c, c]; }), value: 'Sabzavot' },
                    { name: 'declaredWeightKg', label: "Taxminiy og'irlik (kg)", type: 'number', min: 1, max: 1000000, required: true, hint: "Haqiqiy og'irlik omborda tortilganda aniqlanadi." },
                    { name: 'pricePerKg', label: "Narx (so'm / kg)", type: 'number', min: 1, required: true },
                    { name: 'description', label: 'Izoh (ixtiyoriy)', type: 'textarea', hint: "Navi, hosil sanasi, qadoqlanishi..." },
                    { name: 'photo', label: 'Rasm (ixtiyoriy)', type: 'file', hint: 'JPG, PNG yoki WEBP, 3 MB gacha.' }
                ],
                onSubmit: async function (v) {
                    const created = await authed('POST', '/warehouse/items', { name: v.name, category: v.category, declaredWeightKg: v.declaredWeightKg, pricePerKg: v.pricePerKg, description: v.description });
                    if (v.photo) { try { await whUploadPhoto(created.id, v.photo); } catch (e) { showToast("E'lon qo'shildi, lekin rasm yuklanmadi: " + e.messages[0], 5000); } }
                },
                done: "E'lon qo'shildi. Yukni omborga olib boring."
            });
        }
        function whPhotoDialog(it) {
            openWhForm({
                title: 'Mahsulot rasmi', sub: it.name, icon: 'fa-camera', submit: 'Yuklash',
                fields: [{ name: 'photo', label: 'Rasm', type: 'file', required: true, hint: 'JPG, PNG yoki WEBP, 3 MB gacha.' }],
                onSubmit: async function (v) { if (!v.photo) throw { messages: ['Rasmni tanlang.'] }; await whUploadPhoto(it.id, v.photo); },
                done: 'Rasm yangilandi.'
            });
        }
        async function whCancelAnnouncement(it) {
            if (!window.confirm(T('"{0}" e\'lonini bekor qilasizmi?', it.name))) return;
            try { await authed('DELETE', '/warehouse/items/' + it.id); showToast("E'lon bekor qilindi."); whRefresh(); }
            catch (err) { if (err.status !== 401) showToast(err.raw || err.messages[0], 5000); }
        }

        // ----- Market: buyurtma -----
        function whOrderDialog(it) {
            const avail = Number(it.availableKg);
            openWhForm({
                title: 'Buyurtma berish', sub: it.name + ' · ' + it.farmer.farmName + ' · mavjud: ' + kg(avail), icon: 'fa-cart-shopping', submit: 'Buyurtma berish',
                fields: [
                    { name: 'quantityKg', label: 'Miqdor (kg)', type: 'number', min: 0.01, max: avail, required: true, hint: 'Jami: —' },
                    { name: 'note', label: 'Izoh (ixtiyoriy)', type: 'textarea', hint: "Masalan: ertalab soat 8 gacha yetkazing." }
                ],
                onBuilt: function (inputs) {
                    const q = inputs.quantityKg;
                    q.addEventListener('input', function () {
                        const n = Number(String(q.value).replace(',', '.'));
                        q._hint.textContent = 'Jami: ' + (isFinite(n) && n > 0 ? money(n * Number(it.pricePerKg)) : '—') + ' (narx: ' + money(it.pricePerKg) + ' / kg)';
                    });
                },
                onSubmit: async function (v) { await authed('POST', '/warehouse/orders', { itemId: it.id, quantityKg: v.quantityKg, note: v.note }); },
                done: "Buyurtma qabul qilindi. Miqdor siz uchun zaxiralandi."
            });
        }

        // ----- Fermer va market sahifalari -----
        let whFeedState = { q: '', category: '', storageType: '', page: 1 };
        let whFarmerZone = 'ALL';

        function whQuery(obj) {
            const p = Object.keys(obj).filter(function (k) { return obj[k] !== '' && obj[k] !== undefined && obj[k] !== null && obj[k] !== 'ALL'; })
                .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); });
            return p.length ? '?' + p.join('&') : '';
        }

        async function renderWhFarmer(user) {
            const rid = ++dashRenderId;
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Omborxona yuklanmoqda...'));
            let data;
            try { data = await authed('GET', '/warehouse/items/mine' + whQuery({ zone: whFarmerZone, limit: 30 })); }
            catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderWhFarmer(user); }));
            }
            if (rid !== dashRenderId) return;
            const head = el('div', 'space-y-3');
            const row = el('div', 'flex items-center justify-between gap-3 flex-wrap');
            row.appendChild(el('h2', 'text-2xl font-extrabold text-white', 'Omborxonadagi yuklarim'));
            const btns = el('div', 'flex gap-2');
            btns.appendChild(refreshButton(function () { renderWhFarmer(user); }));
            btns.appendChild(actionBtn('fa-paper-plane', 'Yuk yuborish', true, whAnnounceDialog));
            row.appendChild(btns);
            head.appendChild(row);
            head.appendChild(el('p', 'text-sm text-slate-400', "Omborga yuborgan yuklaringiz holati, zonasi va saqlash sharoiti (harorat, namlik) shu yerda ko'rinadi."));
            const chips = el('div', 'flex flex-wrap gap-2');
            [['ALL', 'Hammasi']].concat(WH_ZONE_ORDER.map(function (z) { return [z, WH_ZONES[z].label]; })).forEach(function (f) {
                const c = el('button', 'mp-chip px-4 py-1.5 rounded-full border border-white/15 text-xs font-bold text-slate-300 transition hover:border-emerald-500/50' + (whFarmerZone === f[0] ? ' active' : ''), f[1]);
                c.type = 'button';
                c.addEventListener('click', function () { whFarmerZone = f[0]; renderWhFarmer(user); });
                chips.appendChild(c);
            });
            head.appendChild(chips);
            const nodes = [head];
            if (data.items.length) {
                const grid = el('div', 'grid grid-cols-1 xl:grid-cols-2 gap-5');
                data.items.forEach(function (it) { grid.appendChild(buildWhPost(it, 'owner')); });
                nodes.push(grid);
                if (data.total > data.items.length) nodes.push(el('p', 'text-xs text-slate-500 text-center', 'Eng so\'nggi ' + data.items.length + ' ta yuk ko\'rsatildi (jami ' + data.total + ').'));
            } else nodes.push(whFarmerZone === 'ALL'
                ? emptyState({ art: 'warehouse', title: "Omborxonada yukingiz yo'q", text: "Hosilingizni sifat nazorati va sovutgichli saqlash uchun omborga yuboring: narx ko'tarilganda soting.", cta: { label: 'Omborga yuk yuborish', icon: 'fa-paper-plane', fn: whAnnounceDialog } })
                : emptyState({ art: 'search', compact: true, title: "Bu zonada yuklaringiz yo'q", text: 'Boshqa zonani tanlab ko\'ring.' }));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        let whSearchTimer = null;
        async function renderWhFeed(user, append) {
            const rid = ++dashRenderId;
            if (!append) dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Tayyor mahsulotlar yuklanmoqda...'));
            let data;
            try { data = await authed('GET', '/warehouse/feed' + whQuery({ q: whFeedState.q, category: whFeedState.category, storageType: whFeedState.storageType, page: whFeedState.page, limit: 12 })); }
            catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderWhFeed(user); }));
            }
            if (rid !== dashRenderId) return;
            const head = el('div', 'space-y-3');
            const row = el('div', 'flex items-center justify-between gap-3 flex-wrap');
            row.appendChild(el('h2', 'text-2xl font-extrabold text-white', "Omborxona: jo'natishga tayyor mahsulotlar"));
            row.appendChild(refreshButton(function () { whFeedState.page = 1; renderWhFeed(user); }));
            head.appendChild(row);
            head.appendChild(el('p', 'text-sm text-slate-400', "Sifati tekshirilgan, saralangan va jo'natish zonasida turgan yuklar. Kerakli postni tanlab, buyurtma bering."));
            const filters = el('div', 'grid grid-cols-1 sm:grid-cols-3 gap-3');
            const search = el('input', 'auth-input'); search.type = 'search'; search.placeholder = 'Mahsulot yoki xo\'jalik nomi...'; search.value = whFeedState.q; search.id = 'wh-search';
            search.addEventListener('input', function () {
                clearTimeout(whSearchTimer);
                whSearchTimer = setTimeout(function () { whFeedState.q = search.value.trim(); whFeedState.page = 1; renderWhFeed(user); }, 400);
            });
            const cat = el('select', 'auth-input'); cat.appendChild(new Option('Barcha toifalar', ''));
            WH_CATEGORIES.forEach(function (c) { cat.appendChild(new Option(c, c)); });
            cat.value = whFeedState.category;
            cat.addEventListener('change', function () { whFeedState.category = cat.value; whFeedState.page = 1; renderWhFeed(user); });
            const stor = el('select', 'auth-input'); stor.appendChild(new Option('Barcha saqlash turlari', ''));
            Object.keys(STORAGE_TYPES).forEach(function (k) { stor.appendChild(new Option(STORAGE_TYPES[k].label, k)); });
            stor.value = whFeedState.storageType;
            stor.addEventListener('change', function () { whFeedState.storageType = stor.value; whFeedState.page = 1; renderWhFeed(user); });
            filters.append(search, cat, stor);
            head.appendChild(filters);
            const nodes = [head];
            if (data.items.length) {
                const grid = el('div', 'grid grid-cols-1 xl:grid-cols-2 gap-5');
                data.items.forEach(function (it) { grid.appendChild(buildWhPost(it, 'market')); });
                nodes.push(grid);
                const pager = el('div', 'flex items-center justify-center gap-3');
                if (data.page > 1) { const b = actionBtn('fa-chevron-left', 'Oldingi', false, function () { whFeedState.page--; renderWhFeed(user); }); pager.appendChild(b); }
                pager.appendChild(el('span', 'text-xs font-bold text-slate-400', data.page + ' / ' + data.pages + ' · jami ' + data.total + ' ta'));
                if (data.page < data.pages) { const b = actionBtn('fa-chevron-right', 'Keyingi', false, function () { whFeedState.page++; renderWhFeed(user); }); pager.appendChild(b); }
                nodes.push(pager);
            } else nodes.push(whFeedState.q || whFeedState.category || whFeedState.storageType
                ? emptyState({ art: 'search', compact: true, title: 'Filtrga mos mahsulot topilmadi', text: "So'rovni o'zgartirib ko'ring.", cta: { label: 'Filtrlarni tozalash', icon: 'fa-filter-circle-xmark', fn: function () { whFeedState = { q: '', category: '', storageType: '', page: 1 }; renderWhFeed(user); } } })
                : emptyState({ art: 'warehouse', title: "Hozircha jo'natishga tayyor mahsulot yo'q", text: "Fermerlar yuk yuborib, u tekshiruvdan o'tgach mahsulotlar shu yerda ko'rinadi.", cta: { label: 'Yangilash', icon: 'fa-rotate', fn: function () { renderWhFeed(user); } } }));
            dashContent.replaceChildren.apply(dashContent, nodes);
            if (whFeedState.q) { const s = document.getElementById('wh-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
        }

        // ----- Buyurtmalar (hamma rollar uchun) -----
        let whOrderFilter = 'ALL';
        function whOrderStepper(o) {
            if (o.status === 'CANCELLED') {
                const b = el('div', 'rounded-xl border border-slate-500/30 bg-slate-500/10 px-4 py-2.5 text-sm text-slate-300 flex items-center gap-2');
                b.appendChild(el('i', 'fa-solid fa-ban text-slate-400'));
                b.appendChild(document.createTextNode('Buyurtma bekor qilingan, zaxira qaytarilgan.'));
                return b;
            }
            const idx = WH_ORDER_STEPS.indexOf(o.status);
            const wrap = el('div', 'grid grid-cols-5 gap-1');
            WH_ORDER_STEPS.forEach(function (s, i) {
                const col = el('div', 'flex flex-col items-center gap-1.5 text-center');
                col.appendChild(el('div', 'h-1.5 w-full rounded-full ' + (i <= idx ? (i === idx ? 'bg-emerald-400' : 'bg-emerald-500/60') : 'bg-white/10')));
                col.appendChild(el('span', 'text-[10px] font-bold leading-tight ' + (i === idx ? 'text-emerald-300' : 'text-slate-500'), WH_ORDER_STATUS[s].label));
                wrap.appendChild(col);
            });
            return wrap;
        }
        function whPartyLine(icon, label, name, sub, phone) {
            const row = el('div', 'flex items-center justify-between gap-3 rounded-xl bg-slate-950/40 border border-white/5 px-3.5 py-2.5');
            const l = el('div', 'min-w-0');
            l.appendChild(el('div', 'text-[10px] font-bold uppercase tracking-wider text-emerald-400', label));
            l.appendChild(el('div', 'text-sm font-bold text-white truncate', name));
            if (sub) l.appendChild(el('div', 'text-xs text-slate-400 break-words', sub));
            row.appendChild(l);
            if (phone) {
                const a = el('a', 'shrink-0 text-xs font-extrabold px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition');
                a.href = 'tel:' + phone; a.textContent = phone;
                row.appendChild(a);
            }
            return row;
        }
        function buildWhOrderCard(o, viewer) {
            const card = el('div', 'glass rounded-2xl border border-white/10 p-5 space-y-4');
            const top = el('div', 'flex items-start gap-4');
            const thumb = el('div', 'w-16 h-16 rounded-xl overflow-hidden bg-emerald-500/10 border border-white/10 flex items-center justify-center shrink-0');
            const src = whImg(o.item.photoUrl);
            if (src) { const im = el('img', 'w-full h-full object-cover'); im.src = src; im.alt = ''; im.addEventListener('error', function () { im.remove(); }); thumb.appendChild(im); }
            else thumb.appendChild(el('i', 'fa-solid text-xl text-emerald-400/60 ' + (WH_CAT_ICONS[o.item.category] || 'fa-box')));
            top.appendChild(thumb);
            const info = el('div', 'min-w-0 flex-1');
            info.appendChild(el('h4', 'font-extrabold text-white truncate', o.item.name));
            info.appendChild(el('p', 'text-xs text-slate-400 font-semibold', kg(o.quantityKg) + ' · ' + money(o.pricePerKg) + ' / kg'));
            info.appendChild(el('p', 'text-sm font-extrabold text-emerald-300', 'Jami: ' + money(o.totalPrice)));
            top.appendChild(info);
            const ms = WH_ORDER_STATUS[o.status];
            const right = el('div', 'shrink-0 text-right space-y-1.5');
            right.appendChild(el('span', 'inline-block text-xs font-bold px-3 py-1 rounded-full border ' + ms.cls, ms.label));
            right.appendChild(el('div', 'text-[11px] text-slate-500', formatDateTime(o.createdAt)));
            top.appendChild(right);
            card.appendChild(top);
            card.appendChild(whOrderStepper(o));

            const parties = el('div', 'space-y-2');
            if (viewer !== 'market') parties.appendChild(whPartyLine('', 'Xaridor', o.market.companyName, [o.market.region, o.market.district, o.market.address].filter(Boolean).join(', '), o.market.phone));
            if (viewer !== 'farmer') parties.appendChild(whPartyLine('', 'Fermer', o.farmer.farmName, o.farmer.region, viewer === 'ops' ? o.farmer.phone : null));
            if (o.driver) parties.appendChild(whPartyLine('', 'Haydovchi', o.driver.fullName, o.driver.vehicleType + ' · ' + o.driver.plateNumber, o.driver.phone));
            card.appendChild(parties);
            if (o.note) card.appendChild(el('p', 'text-xs text-slate-400', 'Izoh: ' + o.note));

            // Kafolatlangan to'lov (Escrow): market umumiy summani, fermer sof ulushini, dispetcher hammasini ko'radi
            if (o.payment) {
                const pr = el('div', 'rounded-xl bg-blue-500/5 border border-blue-500/20 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2');
                const pl = el('div', 'min-w-0');
                pl.appendChild(el('div', 'text-[10px] font-bold uppercase tracking-wider text-blue-300', "Kafolatlangan to'lov (Escrow)"));
                const amt = o.payment.amount != null ? moneyExact(o.payment.amount) : '';
                const line = viewer === 'farmer' ? 'Sizga: ' + moneyExact(o.payment.farmerAmount) + " · xizmat haqi: " + moneyExact(o.payment.feeAmount)
                    : viewer === 'ops' ? amt + ' · fermerga: ' + moneyExact(o.payment.farmerAmount) + ' · omborxona haqi: ' + moneyExact(o.payment.feeAmount)
                    : amt;
                pl.appendChild(el('div', 'text-sm font-bold text-white', line));
                pr.appendChild(pl);
                pr.appendChild(paymentPill(o.payment.status, true));
                card.appendChild(pr);
            }
            if (o.shipment) {
                const sm = SHIPMENT_STATUS[o.shipment.status];
                const sl = el('div', 'flex flex-wrap items-center gap-2 text-xs text-slate-400');
                sl.appendChild(el('i', 'fa-solid fa-truck-fast text-emerald-400'));
                sl.appendChild(document.createTextNode('Yuk tashish holati: '));
                sl.appendChild(el('span', 'font-bold px-2.5 py-0.5 rounded-full border ' + sm.cls, sm.label));
                card.appendChild(sl);
            }
            if (o.status === 'DISPATCHED' && o.shipment && viewer !== 'driver') card.appendChild(buildTrackPanel({ id: o.shipment.id }, { originKind: 'warehouse' }));
            if (o.awaitingConfirmation) {
                const ab = el('div', 'rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-200 flex items-start gap-2');
                ab.appendChild(el('i', 'fa-solid fa-hourglass-half mt-0.5'));
                ab.appendChild(document.createTextNode(viewer === 'farmer'
                    ? "Yuk yetkazildi. Xaridor yoki dispetcher tasdiqlagach pul hisobingizga o'tadi."
                    : "Haydovchi yukni yetkazganini bildirdi. Qabul qilinganini tasdiqlang: shundan so'ng pul fermerga o'tkaziladi."));
                card.appendChild(ab);
            } else if (o.payment && o.payment.status === 'RELEASED') {
                card.appendChild(el('p', 'text-xs font-semibold text-emerald-300 flex items-center gap-2', "✓ To'lov yakunlandi: mablag' fermerga o'tkazildi."));
            } else if (o.payment && o.payment.status === 'REFUNDED') {
                card.appendChild(el('p', 'text-xs font-semibold text-rose-300 flex items-center gap-2', "↩ Mablag' xaridorga qaytarildi."));
            }

            const act = el('div', 'flex flex-wrap gap-2');
            const mk = function (icon, label, primary, fn) {
                const b = el('button', 'flex-1 min-w-[9rem] flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-extrabold border transition disabled:opacity-50 ' + (primary
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400' : 'border-white/15 text-slate-200 hover:bg-white/10'));
                b.type = 'button';
                b.appendChild(el('i', 'fa-solid ' + icon));
                b.appendChild(el('span', '', label));
                b.addEventListener('click', function () { b.disabled = true; Promise.resolve(fn()).finally(function () { b.disabled = false; }); });
                return b;
            };
            const call = async function (method, path, body, msg) {
                try { await authed(method, path, body); showToast(msg, 3000); whRefresh(); }
                catch (err) { if (err.status !== 401) showToast(err.raw || err.messages[0], 5000); }
            };
            if (viewer === 'ops') {
                if (o.status === 'PENDING') act.appendChild(mk('fa-hand', "Yig'ishni boshlash", true, function () { return call('PATCH', '/warehouse/orders/' + o.id + '/picking', undefined, "Yig'ish boshlandi."); }));
                if (o.status === 'PICKING') act.appendChild(mk('fa-check-double', "Yig'ildi", true, function () { return call('PATCH', '/warehouse/orders/' + o.id + '/picked', undefined, "Buyurtma yig'ildi."); }));
                if (o.status === 'PICKED' && o.shipment && o.shipment.status === 'OPEN') act.appendChild(mk('fa-user-plus', 'Haydovchi biriktirish', true, function () { return whDispatchDialog(o); }));
                if (o.status === 'PICKED' && o.shipment && o.shipment.status === 'LOADING') act.appendChild(mk('fa-truck-fast', "Yuklandi: jo'natish", true, function () {
                    return window.confirm(T("Yuk haydovchiga yuklanganini tasdiqlaysizmi? Qoldiq kamayadi va yuk yo'lga chiqadi.")) ? call('PATCH', '/warehouse/orders/' + o.id + '/dispatch', undefined, "Yuk jo'natildi. GPS kuzatuv boshlandi.") : Promise.resolve();
                }));
                if (['PENDING', 'PICKING', 'PICKED'].indexOf(o.status) !== -1) act.appendChild(mk('fa-ban', 'Bekor qilish', false, function () { return window.confirm(T('Buyurtmani bekor qilasizmi?')) ? call('PATCH', '/warehouse/orders/' + o.id + '/cancel', undefined, 'Buyurtma bekor qilindi.') : Promise.resolve(); }));
                if (o.status === 'DISPATCHED' || o.awaitingConfirmation) act.appendChild(mk('fa-circle-check', o.awaitingConfirmation ? "Tasdiqlash: pulni o'tkazish" : 'Yetkazildi deb tasdiqlash', o.awaitingConfirmation, function () { return call('PATCH', '/warehouse/orders/' + o.id + '/deliver', undefined, "Tasdiqlandi. Mablag' fermerga o'tkazildi."); }));
                if (o.item.code) act.appendChild(mk('fa-barcode', 'Shtrix-kod / QR', false, function () { openCodeLabel(o.item.code, o.item.name, o.farmer.farmName); return Promise.resolve(); }));
            } else if (viewer === 'market') {
                if (['PENDING', 'PICKING'].indexOf(o.status) !== -1) act.appendChild(mk('fa-ban', 'Bekor qilish', false, function () { return window.confirm(T('Buyurtmani bekor qilasizmi?')) ? call('PATCH', '/warehouse/orders/' + o.id + '/cancel', undefined, 'Buyurtma bekor qilindi.') : Promise.resolve(); }));
                if (o.status === 'DISPATCHED' || o.awaitingConfirmation) act.appendChild(mk('fa-circle-check', o.awaitingConfirmation ? "Qabul qildim: pulni o'tkazish" : 'Qabul qildim', true, function () { return call('PATCH', '/warehouse/orders/' + o.id + '/deliver', undefined, "Qabul qilindi. Mablag' fermerga o'tkazildi. Rahmat!"); }));
            }
            if (act.childNodes.length) card.appendChild(act);
            return card;
        }

        async function whDispatchDialog(o) {
            let drivers;
            try { drivers = await authed('GET', '/warehouse/drivers'); } catch (err) { if (err.status !== 401) showToast(err.messages[0], 5000); return; }
            if (!drivers.length) return showToast("Hali ro'yxatdan o'tgan haydovchi yo'q.", 5000);
            openWhForm({
                title: 'Haydovchi biriktirish', sub: o.item.name + ' · ' + kg(o.quantityKg), icon: 'fa-user-plus', submit: 'Biriktirish',
                fields: [{ name: 'driverId', label: 'Haydovchi', type: 'select', required: true,
                    options: drivers.map(function (d) { return [d.id, d.fullName + ' · ' + d.plateNumber + ' · ' + kg(d.capacityKg) + trustText(d.trust) + (Number(d.capacityKg) < Number(o.quantityKg) ? ' (sig\'im yetmaydi)' : '')]; }) }],
                onSubmit: function (v) { return authed('PATCH', '/warehouse/orders/' + o.id + '/assign', { driverId: v.driverId }); },
                done: "Haydovchi biriktirildi. Yuk uning kabinetida ko'rinadi."
            });
        }

        async function renderWhOrders(user) {
            const rid = ++dashRenderId;
            const staff = isStaffRole(user);
            const viewer = staff ? 'ops' : user.role === 'MARKET' ? 'market' : user.role === 'DRIVER' ? 'driver' : 'farmer';
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Buyurtmalar yuklanmoqda...'));
            let list;
            try { list = await authed('GET', staff ? '/warehouse/orders' : '/warehouse/orders/mine'); }
            catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderWhOrders(user); }));
            }
            if (rid !== dashRenderId) return;
            const head = el('div', 'space-y-3');
            const row = el('div', 'flex items-center justify-between gap-3 flex-wrap');
            row.appendChild(el('h2', 'text-2xl font-extrabold text-white', 'Ombor buyurtmalari'));
            row.appendChild(refreshButton(function () { renderWhOrders(user); }));
            head.appendChild(row);
            const open = function (o) { return ['DELIVERED', 'CANCELLED'].indexOf(o.status) === -1 || o.awaitingConfirmation; };
            const chips = el('div', 'flex flex-wrap gap-2');
            [['ALL', 'Hammasi', list.length], ['OPEN', 'Faol', list.filter(open).length], ['DONE', 'Yakunlangan', list.filter(function (o) { return !open(o); }).length]].forEach(function (f) {
                const c = el('button', 'mp-chip px-4 py-1.5 rounded-full border border-white/15 text-xs font-bold text-slate-300 transition hover:border-emerald-500/50' + (whOrderFilter === f[0] ? ' active' : ''), f[1] + ' (' + f[2] + ')');
                c.type = 'button';
                c.addEventListener('click', function () { whOrderFilter = f[0]; renderWhOrders(user); });
                chips.appendChild(c);
            });
            head.appendChild(chips);
            const items = list.filter(function (o) { return whOrderFilter === 'ALL' || (whOrderFilter === 'OPEN' ? open(o) : !open(o)); });
            const nodes = [head];
            if (items.length) {
                const grid = el('div', 'grid grid-cols-1 xl:grid-cols-2 gap-4');
                items.forEach(function (o) { grid.appendChild(buildWhOrderCard(o, viewer)); });
                nodes.push(grid);
            } else nodes.push(list.length
                ? emptyState({ art: 'search', compact: true, title: "Bu holatdagi buyurtmalar yo'q", text: "Boshqa holatni tanlab ko'ring." })
                : viewer === 'market'
                    ? emptyState({ art: 'warehouse', title: 'Hali buyurtma bermagansiz', text: "Omborxonadan saralangan va sifat nazoratidan o'tgan mahsulotni buyurtma qiling.", cta: { label: "Omborxonaga o'tish", icon: 'fa-warehouse', fn: function () { selectDashTab('warehouse'); } } })
                    : emptyState({ art: 'bookings', title: 'Hali buyurtmalar yo\'q', text: viewer === 'driver' ? "Sizga biriktirilgan ombor jo'natmalari yo'q." : "Marketlar buyurtma berganda ular shu yerda ko'rinadi." }));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ----- Dispetcher: zonalar taxtasi -----
        async function whUnitOptions(item, forZone) {
            const units = await authed('GET', '/warehouse/units');
            const need = item.storageType;
            return units.map(function (u) {
                const free = Number(u.capacityKg) - Number(u.usedKg);
                const fits = u.type === need || need === 'DRY' || (need === 'VENTILATED' && u.type === 'COLD'); // serverdagi qoida bilan bir xil
                return [u.id, u.name + ' · ' + STORAGE_TYPES[u.type].label + ' · bo\'sh: ' + kg(Math.max(0, free)) + (fits ? '' : ' (mos emas)')];
            });
        }
        function whReceiveDialog(it) {
            openWhForm({
                title: 'Yukni qabul qilish', sub: it.name + ' · ' + it.farmer.farmName, icon: 'fa-dolly', submit: 'Qabul qilish va shtrix-kod berish',
                fields: [
                    { name: 'measuredWeightKg', label: "Tortilgan og'irlik (kg)", type: 'number', min: 0.01, required: true, value: Number(it.declaredWeightKg), hint: "E'lon qilingan: " + kg(it.declaredWeightKg) },
                    { name: 'rfidTag', label: 'RFID teg (ixtiyoriy)', hint: "Skaner bilan o'qing yoki qo'lda kiriting (4-64 belgi)." }
                ],
                onSubmit: function (v) { return authed('POST', '/warehouse/items/' + it.id + '/receive', { measuredWeightKg: v.measuredWeightKg, rfidTag: v.rfidTag }); },
                done: 'Yuk qabul qilindi va shtrix-kod berildi.',
                after: function (res) { if (res && res.code) setTimeout(function () { openCodeLabel(res.code, it.name, it.farmer.farmName); }, 300); }
            });
        }
        function whInspectDialog(it) {
            openWhForm({
                title: 'Sifat tekshiruvi', sub: it.name + ' · ' + kg(it.weightKg) + ' · ' + (it.code || ''), icon: 'fa-clipboard-check', submit: 'Natijani saqlash',
                fields: [
                    { name: 'decision', label: 'Qaror', type: 'select', options: [['accept', 'Qabul qilinadi'], ['reject', 'To\'liq rad etiladi']], value: 'accept' },
                    { name: 'grade', label: 'Sifat bahosi', type: 'select', options: [['A', 'A — a\'lo'], ['B', 'B — yaxshi'], ['C', 'C — qoniqarli']], value: 'A' },
                    { name: 'rejectedKg', label: 'Yaroqsiz miqdor (kg)', type: 'number', min: 0, max: Number(it.weightKg), value: 0, hint: "Tekshiruvda chiqarib tashlangan qism." },
                    { name: 'notes', label: 'Izoh', type: 'textarea' }
                ],
                onSubmit: function (v) {
                    const accept = v.decision === 'accept';
                    return authed('POST', '/warehouse/items/' + it.id + '/inspect', { accept: accept, grade: accept ? v.grade : undefined, rejectedKg: accept ? (v.rejectedKg || 0) : undefined, notes: v.notes });
                },
                done: 'Tekshiruv natijasi saqlandi.'
            });
        }
        async function whMoveDialog(it, zone) {
            const needUnit = zone === 'STORAGE' || (zone === 'OUTBOUND' && !it.unitId);
            let options = [];
            if (needUnit) {
                try { options = await whUnitOptions(it, zone); } catch (err) { if (err.status !== 401) showToast(err.messages[0], 5000); return; }
                if (!options.length) return showToast('Avval "Kameralar" bo\'limida kamera/ombor yarating.', 5000);
            }
            const fields = [];
            if (needUnit) fields.push({ name: 'unitId', label: zone === 'STORAGE' ? 'Qaysi kameraga' : 'Qaysi kamerada turadi', type: 'select', options: options, required: true });
            if (needUnit) fields.push({ name: 'override', type: 'checkbox', label: "Mos bo'lmasa ham majburan joylash (masalan, vaqtincha)" });
            openWhForm({
                title: WH_ZONES[zone].label + ' zonasiga', sub: it.name + ' · ' + kg(it.weightKg), icon: WH_ZONES[zone].icon, submit: "Ko'chirish",
                fields: fields.length ? fields : [{ name: 'noop', type: 'checkbox', label: "Yuk " + WH_ZONES[zone].label + " zonasiga o'tkaziladi. Davom etasizmi?", value: true }],
                onSubmit: function (v) { return authed('POST', '/warehouse/items/' + it.id + '/move', { zone: zone, unitId: v.unitId, override: v.override ? true : undefined }); },
                done: "Yuk " + WH_ZONES[zone].label + " zonasiga o'tkazildi."
            });
        }
        function whSortDialog(it) {
            openWhForm({
                title: 'Saralash va qadoqlash', sub: it.name + ' · mavjud: ' + kg(it.availableKg), icon: 'fa-boxes-packing', submit: 'Saqlash',
                fields: [
                    { name: 'sizeClass', label: "O'lcham sinfi (kalibrlash)", type: 'select', options: [['', '— o\'zgartirmaslik —'], ['SMALL', 'Kichik'], ['MEDIUM', "O'rta"], ['LARGE', 'Katta']], value: it.sizeClass || '' },
                    { name: 'rejectedKg', label: 'Yaroqsiz (chiqit) miqdor, kg', type: 'number', min: 0, max: Number(it.availableKg), hint: 'Saralashda chiqarib tashlangan mahsulot qoldiqdan ayriladi.' },
                    { name: 'packagingType', label: 'Qadoq turi (supermarket talabi)', placeholder: 'Masalan: Karton quti 10 kg', maxLength: 60, value: it.packagingType || '' },
                    { name: 'packageWeightKg', label: 'Bitta qadoq og\'irligi, kg', type: 'number', min: 0.01, max: 1000, value: it.packageWeightKg ? Number(it.packageWeightKg) : undefined }
                ],
                onSubmit: function (v) {
                    return authed('POST', '/warehouse/items/' + it.id + '/sort', { sizeClass: v.sizeClass || undefined, rejectedKg: v.rejectedKg, packagingType: v.packagingType, packageWeightKg: v.packageWeightKg });
                },
                done: 'Saralash natijasi saqlandi.'
            });
        }
        function whCountDialog(it) {
            openWhForm({
                title: 'Inventarizatsiya (sanash)', sub: it.name + ' · tizimda: ' + kg(it.weightKg) + (Number(it.reservedKg) > 0 ? ' · zaxira: ' + kg(it.reservedKg) : ''), icon: 'fa-list-check', submit: 'Qoldiqni tuzatish',
                fields: [
                    { name: 'countedKg', label: 'Haqiqiy sanalgan miqdor (kg)', type: 'number', min: Number(it.reservedKg) || 0, required: true, value: Number(it.weightKg) },
                    { name: 'note', label: 'Izoh', placeholder: 'Masalan: kamomad, qurib qolish' }
                ],
                onSubmit: function (v) { return authed('POST', '/warehouse/items/' + it.id + '/count', { countedKg: v.countedKg, note: v.note }); },
                done: 'Qoldiq tuzatildi va jurnalga yozildi.'
            });
        }
        async function whDetailDialog(code) {
            let it;
            try { it = await authed('GET', '/warehouse/scan/' + encodeURIComponent(code)); }
            catch (err) { if (err.status !== 401) showToast(err.status === 404 ? "Bu kod bo'yicha yuk topilmadi." : err.messages[0], 4500); return; }
            let full;
            try { full = await authed('GET', '/warehouse/items/' + it.id); } catch (err) { return; }
            const box = el('div', 'space-y-4');
            box.appendChild(buildWhOpsCard(full, true));
            if (full.code) {
                box.appendChild(sectionTitle('Shtrix-kod / QR'));
                box.appendChild(buildCodeVisual(full.code, full.name, full.farmer.farmName));
            }
            box.appendChild(sectionTitle('Harakatlar jurnali'));
            const list = el('div', 'rounded-2xl border border-white/10 divide-y divide-white/5 max-h-64 overflow-y-auto');
            const TYPE = { RECEIVE: 'Qabul qilindi', INSPECT_REJECT: 'Tekshiruvda chiqarildi', MOVE: "Zona o'zgardi", SORT_WASTE: 'Saralashda chiqit', DISPATCH: "Jo'natildi", ADJUST: 'Inventarizatsiya' };
            full.movements.forEach(function (m) {
                const r = el('div', 'flex items-center justify-between gap-3 px-4 py-2.5 text-sm');
                const l = el('div', 'min-w-0');
                l.appendChild(el('div', 'font-bold text-white', (TYPE[m.type] || m.type) + (m.toZone && m.fromZone !== m.toZone ? ': ' + (m.fromZone ? WH_ZONES[m.fromZone].short + ' → ' : '') + WH_ZONES[m.toZone].short : '')));
                l.appendChild(el('div', 'text-xs text-slate-500', formatDateTime(m.createdAt) + (m.note ? ' · ' + m.note : '')));
                r.appendChild(l);
                const d = Number(m.deltaKg);
                r.appendChild(el('span', 'shrink-0 font-extrabold ' + (d > 0 ? 'text-emerald-300' : d < 0 ? 'text-rose-300' : 'text-slate-500'), d === 0 ? '—' : (d > 0 ? '+' : '') + formatNumber(d) + ' kg'));
                list.appendChild(r);
            });
            box.appendChild(list);
            openWhModal('Yuk ma\'lumoti', it.code || '', box, true);
        }

        // Dispetcher uchun ixcham yuk kartasi va holatiga mos amallar
        function buildWhOpsCard(it, inModal) {
            const card = el('div', (inModal ? '' : 'glass ') + 'rounded-2xl border border-white/10 p-4 space-y-3 bg-slate-950/30');
            const top = el('div', 'flex items-start justify-between gap-2');
            const l = el('div', 'min-w-0');
            l.appendChild(el('div', 'font-extrabold text-white truncate', it.name));
            l.appendChild(el('div', 'text-xs text-slate-400 truncate', it.farmer.farmName + ' · ' + it.farmer.fullName));
            top.appendChild(l);
            const st = WH_STATUS[it.status];
            top.appendChild(whPill(st.label, st.cls));
            card.appendChild(top);
            if (it.code) {
                const c = el('button', 'text-[11px] font-mono font-bold text-slate-300 bg-slate-950/60 border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1.5 hover:border-emerald-500/40 transition');
                c.type = 'button'; c.title = "Batafsil ma'lumot";
                c.appendChild(el('i', 'fa-solid fa-barcode text-emerald-400'));
                c.appendChild(document.createTextNode(it.code));
                if (!inModal) c.addEventListener('click', function () { whDetailDialog(it.code); });
                card.appendChild(c);
            }
            const g = el('div', 'grid grid-cols-3 gap-2');
            g.appendChild(whStat('Qoldiq', kg(it.weightKg)));
            g.appendChild(whStat('Zaxira', kg(it.reservedKg || 0), Number(it.reservedKg) > 0 ? 'text-amber-300' : 'text-white'));
            g.appendChild(whStat('Sifat', it.grade || '—'));
            card.appendChild(g);
            const place = [];
            if (it.climate.unit) place.push(it.climate.unit.name);
            if (it.sizeClass) place.push(SIZE_LABELS[it.sizeClass]);
            if (it.packagingType) place.push(it.packagingType);
            const needs = STORAGE_TYPES[it.storageType];
            card.appendChild(el('div', 'text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1',
                'Talab: ' + needs.label + (place.length ? ' · ' + place.join(' · ') : '') + (whExpiry(it) ? ' · muddat: ' + whExpiry(it).text : '')));
            if (it.climate.unit && (it.climate.unit.status === 'ALARM' || it.climate.unit.status === 'WARN')) {
                card.appendChild(el('div', 'text-xs font-bold ' + CLIMATE_STATUS[it.climate.unit.status].text, '⚠ Kamera sharoiti: ' + CLIMATE_STATUS[it.climate.unit.status].label));
            }

            const act = el('div', 'flex flex-wrap gap-1.5');
            const b = function (label, icon, fn, primary) {
                const x = el('button', 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold border transition ' + (primary
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400' : 'border-white/15 text-slate-200 hover:bg-white/10'));
                x.type = 'button';
                x.appendChild(el('i', 'fa-solid ' + icon));
                x.appendChild(el('span', '', label));
                x.addEventListener('click', function () { if (inModal) closeWhModal(); fn(); });
                act.appendChild(x);
            };
            if (it.status === 'ANNOUNCED') b('Qabul qilish', 'fa-dolly', function () { whReceiveDialog(it); }, true);
            else if (it.status === 'RECEIVED') b('Sifat tekshiruvi', 'fa-clipboard-check', function () { whInspectDialog(it); }, true);
            else if (it.status === 'ACTIVE') {
                const z = it.zone;
                if (z === 'INBOUND') { b('Saqlashga', 'fa-warehouse', function () { whMoveDialog(it, 'STORAGE'); }, true); b('Saralashga', 'fa-boxes-packing', function () { whMoveDialog(it, 'SORTING'); }); }
                if (z === 'STORAGE') { b('Saralashga', 'fa-boxes-packing', function () { whMoveDialog(it, 'SORTING'); }); b("Jo'natishga", 'fa-truck-ramp-box', function () { whMoveDialog(it, 'OUTBOUND'); }, true); }
                if (z === 'SORTING') { b('Saralash / qadoq', 'fa-sliders', function () { whSortDialog(it); }, true); b('Saqlashga', 'fa-warehouse', function () { whMoveDialog(it, 'STORAGE'); }); b("Jo'natishga", 'fa-truck-ramp-box', function () { whMoveDialog(it, 'OUTBOUND'); }); }
                if (z === 'OUTBOUND') { b('Saqlashga qaytarish', 'fa-rotate-left', function () { whMoveDialog(it, 'STORAGE'); }); b('Saralashga', 'fa-boxes-packing', function () { whMoveDialog(it, 'SORTING'); }); }
                b('Sanash', 'fa-list-check', function () { whCountDialog(it); });
            }
            if (act.childNodes.length) card.appendChild(act);
            return card;
        }

        let whShowArchive = false;
        async function renderWhBoard(user) {
            const rid = ++dashRenderId;
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Ombor zonalari yuklanmoqda...'));
            let res;
            try { res = await Promise.all(WH_ZONE_ORDER.map(function (z) { return authed('GET', '/warehouse/items?zone=' + z + '&limit=50'); })); }
            catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderWhBoard(user); }));
            }
            if (rid !== dashRenderId) return;
            const head = el('div', 'space-y-3');
            const row = el('div', 'flex items-center justify-between gap-3 flex-wrap');
            row.appendChild(el('h2', 'text-2xl font-extrabold text-white', 'Ombor zonalari'));
            const rb = el('div', 'flex gap-2');
            rb.appendChild(refreshButton(function () { renderWhBoard(user); }));
            row.appendChild(rb);
            head.appendChild(row);

            const scan = el('form', 'flex gap-2');
            const sin = el('input', 'auth-input'); sin.placeholder = 'Shtrix-kod yoki RFID kodni skanerlang / kiriting...'; sin.autocomplete = 'off'; sin.maxLength = 80; sin.id = 'wh-scan';
            const sb = el('button', 'shrink-0 px-5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold hover:bg-emerald-400 transition flex items-center gap-2');
            sb.type = 'submit'; sb.appendChild(el('i', 'fa-solid fa-barcode')); sb.appendChild(el('span', 'hidden sm:inline', 'Topish'));
            scan.append(sin, sb);
            if (cameraScanSupported()) {
                const cb2 = el('button', 'shrink-0 px-4 rounded-xl border border-white/15 text-slate-200 font-extrabold hover:bg-white/10 transition flex items-center gap-2');
                cb2.type = 'button'; cb2.title = 'Kamera bilan skanerlash';
                cb2.appendChild(el('i', 'fa-solid fa-camera'));
                cb2.appendChild(el('span', 'hidden sm:inline', 'Kamera'));
                cb2.addEventListener('click', openCameraScan);
                scan.appendChild(cb2);
            }
            scan.addEventListener('submit', function (e) { e.preventDefault(); const v = sin.value.trim(); if (v) { whDetailDialog(v); sin.value = ''; } });
            head.appendChild(scan);
            const arch = el('label', 'flex items-center gap-2 text-xs text-slate-400 cursor-pointer w-fit');
            const cb = el('input', 'accent-emerald-500'); cb.type = 'checkbox'; cb.checked = whShowArchive;
            cb.addEventListener('change', function () { whShowArchive = cb.checked; renderWhBoard(user); });
            arch.append(cb, document.createTextNode("Rad etilgan va to'liq jo'natilganlarni ham ko'rsatish"));
            head.appendChild(arch);

            const cols = el('div', 'grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-4');
            WH_ZONE_ORDER.forEach(function (z, i) {
                const data = res[i];
                const items = data.items.filter(function (it) { return whShowArchive || (it.status !== 'REJECTED' && it.status !== 'DEPLETED'); });
                const col = el('section', 'rounded-3xl border border-white/10 bg-slate-900/40 p-4 space-y-3 min-w-0');
                const h = el('div', 'flex items-center justify-between gap-2');
                const t = el('div', 'flex items-center gap-2 font-extrabold text-white');
                t.appendChild(el('i', 'fa-solid text-emerald-400 ' + WH_ZONES[z].icon));
                t.appendChild(el('span', '', WH_ZONES[z].label));
                h.appendChild(t);
                h.appendChild(el('span', 'text-xs font-black px-2.5 py-1 rounded-full bg-white/10 text-slate-200', String(items.length)));
                col.appendChild(h);
                if (items.length) items.forEach(function (it) { col.appendChild(buildWhOpsCard(it, false)); });
                else col.appendChild(el('p', 'text-xs text-slate-500 text-center py-6', "Bu zonada yuk yo'q"));
                if (data.total > data.items.length) col.appendChild(el('p', 'text-[11px] text-slate-500 text-center', "Eng so'nggi " + data.items.length + ' ta ko\'rsatildi (jami ' + data.total + ')'));
                cols.appendChild(col);
            });
            dashContent.replaceChildren(head, cols);
        }

        // ----- Kameralar va harorat nazorati -----
        function whUnitCard(u) {
            const card = el('div', 'glass rounded-2xl border border-white/10 p-5 space-y-4');
            const top = el('div', 'flex items-start justify-between gap-3');
            const l = el('div', 'min-w-0');
            l.appendChild(el('h4', 'font-extrabold text-white truncate', u.name));
            const ty = STORAGE_TYPES[u.type];
            const sub = el('div', 'text-xs text-slate-400 font-semibold flex items-center gap-1.5');
            sub.appendChild(el('i', 'fa-solid text-emerald-400 ' + ty.icon));
            sub.appendChild(document.createTextNode(ty.label));
            l.appendChild(sub);
            top.appendChild(l);
            const cs = CLIMATE_STATUS[u.status];
            const pill = el('span', 'shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border border-white/10 bg-slate-950/50 ' + cs.text);
            pill.appendChild(el('span', 'w-2 h-2 rounded-full ' + cs.dot));
            pill.appendChild(document.createTextNode(cs.label));
            top.appendChild(pill);
            card.appendChild(top);

            const g = el('div', 'grid grid-cols-2 gap-4');
            g.appendChild(whGauge('Harorat', ' °C', u.target.tempMinC, u.target.tempMaxC, u.tempC, u.target.tempMinC - 8, u.target.tempMaxC + 8));
            g.appendChild(whGauge('Namlik', ' %', u.target.humidityMin, u.target.humidityMax, u.humidity, 0, 100));
            card.appendChild(g);
            if (u.readingAt) card.appendChild(el('div', 'text-[11px] text-slate-500', "Oxirgi o'lchov: " + timeAgo(u.readingAt)));

            const used = Number(u.usedKg), cap = Number(u.capacityKg), pct = Math.min(100, Math.round(used / cap * 100));
            const cb = el('div', 'space-y-1.5');
            const cr = el('div', 'flex justify-between text-[11px] font-semibold text-slate-400');
            cr.appendChild(el('span', '', "Band: " + kg(used) + ' (' + u.itemCount + ' ta yuk)'));
            cr.appendChild(el('span', '', "Sig'im: " + kg(cap)));
            cb.appendChild(cr);
            const tr = el('div', 'h-2 rounded-full bg-white/10 overflow-hidden');
            const fl = el('div', 'h-full rounded-full ' + (pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-500'));
            fl.style.width = pct + '%';
            tr.appendChild(fl); cb.appendChild(tr);
            card.appendChild(cb);

            const act = el('div', 'flex flex-wrap gap-2');
            const mk = function (icon, label, fn) {
                const b = el('button', 'flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-extrabold border border-white/15 text-slate-200 hover:bg-white/10 transition');
                b.type = 'button'; b.appendChild(el('i', 'fa-solid ' + icon)); b.appendChild(el('span', '', label));
                b.addEventListener('click', fn); act.appendChild(b);
            };
            mk('fa-temperature-half', "Ko'rsatkich kiritish", function () {
                openWhForm({
                    title: "Datchik ko'rsatkichi", sub: u.name, icon: 'fa-temperature-half', submit: 'Saqlash',
                    fields: [
                        { name: 'tempC', label: 'Harorat (°C)', type: 'number', min: -40, max: 60, required: true, value: u.tempC !== null ? Number(u.tempC) : undefined },
                        { name: 'humidity', label: 'Namlik (%)', type: 'number', min: 0, max: 100, required: true, value: u.humidity !== null ? Number(u.humidity) : undefined }
                    ],
                    onSubmit: function (v) { return authed('POST', '/warehouse/units/' + u.id + '/readings', { tempC: v.tempC, humidity: v.humidity }); },
                    done: "Ko'rsatkich saqlandi."
                });
            });
            mk('fa-flask', 'Datchik simulyatsiyasi', async function () {
                const r = function (a, b) { return Math.round((a + Math.random() * (b - a)) * 10) / 10; };
                const t = u.target;
                const tempC = r(t.tempMinC - 0.5, t.tempMaxC + 0.5), humidity = r(Math.max(0, t.humidityMin - 2), Math.min(100, t.humidityMax + 2));
                try { await authed('POST', '/warehouse/units/' + u.id + '/readings', { tempC: tempC, humidity: humidity }); showToast("Demo ko'rsatkich yuborildi: " + tempC + ' °C, ' + humidity + ' %', 3000); whRefresh(); }
                catch (err) { if (err.status !== 401) showToast(err.messages[0], 4000); }
            });
            card.appendChild(act);
            return card;
        }

        async function renderWhUnits(user) {
            const rid = ++dashRenderId;
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Kameralar yuklanmoqda...'));
            let units;
            try { units = await authed('GET', '/warehouse/units'); }
            catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderWhUnits(user); }));
            }
            if (rid !== dashRenderId) return;
            const head = el('div', 'flex items-center justify-between gap-3 flex-wrap');
            head.appendChild(el('h2', 'text-2xl font-extrabold text-white', 'Kameralar va harorat nazorati'));
            const bt = el('div', 'flex gap-2 flex-wrap');
            bt.appendChild(refreshButton(function () { renderWhUnits(user); }));
            bt.appendChild(actionBtn('fa-plus', 'Yangi kamera', true, function () {
                openWhForm({
                    title: 'Yangi kamera / ombor', icon: 'fa-plus', submit: 'Yaratish',
                    fields: [
                        { name: 'name', label: 'Nomi', required: true, maxLength: 60, placeholder: 'Masalan: Sovitkich kamera 3' },
                        { name: 'type', label: 'Turi', type: 'select', options: Object.keys(STORAGE_TYPES).map(function (k) { return [k, STORAGE_TYPES[k].label]; }), value: 'COLD' },
                        { name: 'capacityKg', label: "Sig'im (kg)", type: 'number', min: 1, required: true },
                        { name: 'tempMinC', label: 'Min harorat (°C) — ixtiyoriy', type: 'number', min: -30, max: 40 },
                        { name: 'tempMaxC', label: 'Max harorat (°C) — ixtiyoriy', type: 'number', min: -30, max: 40 },
                        { name: 'humidityMin', label: 'Min namlik (%) — ixtiyoriy', type: 'number', min: 0, max: 100 },
                        { name: 'humidityMax', label: 'Max namlik (%) — ixtiyoriy', type: 'number', min: 0, max: 100 }
                    ],
                    onSubmit: function (v) { return authed('POST', '/warehouse/units', { name: v.name, type: v.type, capacityKg: v.capacityKg, tempMinC: v.tempMinC, tempMaxC: v.tempMaxC, humidityMin: v.humidityMin, humidityMax: v.humidityMax }); },
                    done: 'Kamera yaratildi.'
                });
            }));
            head.appendChild(bt);
            const nodes = [head];
            if (units.length) {
                const grid = el('div', 'grid grid-cols-1 xl:grid-cols-2 gap-4');
                units.forEach(function (u) { grid.appendChild(whUnitCard(u)); });
                nodes.push(grid);
            } else {
                nodes.push(emptyState({ art: 'warehouse', title: 'Hali kamera/ombor yaratilmagan', text: "Quruq ombor va sovutgichli kameralarni bir bosishda yarating, keyin harorat/namlikni kuzating.",
                    cta: { label: 'Standart 4 ta joyni yaratish', icon: 'fa-wand-magic-sparkles', fn: async function () {
                        try { await authed('POST', '/warehouse/units/defaults'); showToast('Standart kameralar yaratildi.'); renderWhUnits(user); }
                        catch (err) { if (err.status !== 401) showToast(err.messages[0], 4000); }
                    } } }));
            }
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ----- Inventarizatsiya (WMS hisoboti) -----
        async function renderWhInventory(user) {
            const rid = ++dashRenderId;
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Inventarizatsiya yuklanmoqda...'));
            let inv;
            try { inv = await authed('GET', '/warehouse/inventory'); }
            catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderWhInventory(user); }));
            }
            if (rid !== dashRenderId) return;
            const nodes = [];
            const head = el('div', 'flex items-center justify-between gap-3 flex-wrap');
            head.appendChild(el('h2', 'text-2xl font-extrabold text-white', 'Inventarizatsiya (real vaqt)'));
            head.appendChild(refreshButton(function () { renderWhInventory(user); }));
            nodes.push(head);

            const stats = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-4');
            stats.appendChild(statCard('fa-weight-hanging', 'Jami qoldiq', kg(inv.totalKg), 'text-emerald-400'));
            stats.appendChild(statCard('fa-hourglass-half', 'Kutilayotgan yuklar', String((inv.awaiting.ANNOUNCED || 0) + (inv.awaiting.RECEIVED || 0)), 'text-amber-400'));
            const openN = Object.keys(inv.openOrders).reduce(function (a, k) { return a + inv.openOrders[k]; }, 0);
            stats.appendChild(statCard('fa-clipboard-list', 'Ochiq buyurtmalar', String(openN), 'text-blue-400'));
            stats.appendChild(statCard('fa-triangle-exclamation', 'Kamera ogohlantirishlari', String(inv.alarms.length), inv.alarms.length ? 'text-rose-400' : 'text-emerald-400'));
            nodes.push(stats);

            nodes.push(sectionTitle('Zonalar bo\'yicha qoldiq'));
            const maxKg = Math.max.apply(null, inv.byZone.map(function (z) { return Number(z.weightKg); }).concat([1]));
            const zb = el('div', 'glass rounded-2xl border border-white/10 p-5 space-y-4');
            inv.byZone.forEach(function (z) {
                const r = el('div', 'space-y-1.5');
                const t = el('div', 'flex justify-between text-sm font-bold');
                const n = el('span', 'flex items-center gap-2 text-slate-200');
                n.appendChild(el('i', 'fa-solid text-emerald-400 w-4 text-center ' + WH_ZONES[z.zone].icon));
                n.appendChild(document.createTextNode(WH_ZONES[z.zone].label + ' (' + z.itemCount + ' ta)'));
                t.appendChild(n);
                t.appendChild(el('span', 'text-white', kg(z.weightKg) + (Number(z.reservedKg) > 0 ? ' · zaxira ' + kg(z.reservedKg) : '')));
                r.appendChild(t);
                const tr = el('div', 'h-2 rounded-full bg-white/10 overflow-hidden');
                const f = el('div', 'h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300');
                f.style.width = Math.round(Number(z.weightKg) / maxKg * 100) + '%';
                tr.appendChild(f); r.appendChild(tr);
                zb.appendChild(r);
            });
            nodes.push(zb);

            const two = el('div', 'grid grid-cols-1 lg:grid-cols-2 gap-4');
            const catBox = el('div', 'glass rounded-2xl border border-white/10 p-5 space-y-3');
            catBox.appendChild(el('h3', 'font-extrabold text-white', "Toifalar bo'yicha"));
            if (inv.byCategory.length) inv.byCategory.forEach(function (c) {
                const r = el('div', 'flex justify-between text-sm');
                r.appendChild(el('span', 'text-slate-300 flex items-center gap-2', c.category + ' (' + c.itemCount + ')'));
                r.appendChild(el('span', 'font-bold text-white', kg(c.weightKg)));
                catBox.appendChild(r);
            }); else catBox.appendChild(el('p', 'text-sm text-slate-500', "Hozircha omborda mahsulot yo'q."));
            two.appendChild(catBox);
            const stBox = el('div', 'glass rounded-2xl border border-white/10 p-5 space-y-3');
            stBox.appendChild(el('h3', 'font-extrabold text-white', "Saqlash turlari bo'yicha"));
            if (inv.byStorageType.length) inv.byStorageType.forEach(function (c) {
                const r = el('div', 'flex justify-between text-sm');
                const n = el('span', 'text-slate-300 flex items-center gap-2');
                n.appendChild(el('i', 'fa-solid text-emerald-400 w-4 text-center ' + STORAGE_TYPES[c.storageType].icon));
                n.appendChild(document.createTextNode(STORAGE_TYPES[c.storageType].label + ' (' + c.itemCount + ')'));
                r.appendChild(n);
                r.appendChild(el('span', 'font-bold text-white', kg(c.weightKg)));
                stBox.appendChild(r);
            }); else stBox.appendChild(el('p', 'text-sm text-slate-500', "Ma'lumot yo'q."));
            two.appendChild(stBox);
            nodes.push(two);

            nodes.push(sectionTitle('Kamera ogohlantirishlari'));
            if (inv.alarms.length) {
                const box = el('div', 'space-y-2');
                inv.alarms.forEach(function (a) {
                    const cs = CLIMATE_STATUS[a.status];
                    const r = el('div', 'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ' + (a.status === 'ALARM' ? 'border-rose-500/40 bg-rose-500/10' : 'border-amber-500/30 bg-amber-500/10'));
                    r.appendChild(el('span', 'font-bold text-white', a.name));
                    r.appendChild(el('span', 'text-sm font-bold ' + cs.text, cs.label + (a.tempC !== null ? ' · ' + a.tempC + ' °C, ' + a.humidity + ' %' : '')));
                    box.appendChild(r);
                });
                nodes.push(box);
            } else nodes.push(dashMessage('fa-circle-check text-emerald-400', "Barcha kameralar me'yorda."));

            nodes.push(sectionTitle("Muddati yaqinlashayotgan yuklar", "3 kun ichida yoki o'tib ketgan"));
            if (inv.expiringSoon.length) {
                const box = el('div', 'glass rounded-2xl border border-white/10 divide-y divide-white/5');
                inv.expiringSoon.forEach(function (x) {
                    const d = Math.ceil((new Date(x.expiresAt).getTime() - Date.now()) / 86400000);
                    const r = el('div', 'flex items-center justify-between gap-3 px-4 py-3');
                    const l = el('div', 'min-w-0');
                    l.appendChild(el('div', 'font-bold text-white truncate', x.name));
                    l.appendChild(el('div', 'text-xs text-slate-500', (x.code || '') + ' · ' + WH_ZONES[x.zone].short + ' · ' + kg(x.weightKg)));
                    r.appendChild(l);
                    r.appendChild(el('span', 'shrink-0 text-sm font-extrabold ' + (d <= 0 ? 'text-rose-400' : 'text-amber-300'), d <= 0 ? 'Muddati tugagan' : d + ' kun qoldi'));
                    box.appendChild(r);
                });
                nodes.push(box);
            } else nodes.push(dashMessage('fa-calendar-check', "Muddati yaqin yuklar yo'q."));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ----- Kirish nuqtalari -----
        function openWarehouse() {
            const user = currentUser();
            if (sidebar.classList.contains('open')) toggleSidebar();
            if (!user) {
                afterLoginAction = openWarehouse;
                openAuthModal('login');
                showAuthAlert("Omborxonadan foydalanish uchun tizimga kiring yoki ro'yxatdan o'ting.", 'info');
                return;
            }
            openDashboard(user.role === 'ADMIN' ? 'adm-dashboard' : isStaffRole(user) ? 'whboard' : user.role === 'DRIVER' ? 'loads' : 'warehouse');
        }
        function openStaffHub() {
            if (sidebar.classList.contains('open')) toggleSidebar();
            const user = currentUser();
            if (isStaffRole(user)) return openDashboard(user.role === 'ADMIN' ? 'adm-dashboard' : 'whboard');
            if (user) return showToast("Dispetcher kabineti faqat ombor xodimlari uchun. Akkauntlar administrator tomonidan yaratiladi.", 5000);
            afterLoginAction = function () { const u = currentUser(); if (isStaffRole(u)) openDashboard('whboard'); };
            openAuthModal('login');
            showAuthAlert("Dispetcher akkauntlari administrator tomonidan yaratiladi. Telefon va parolingiz bilan kiring.", 'info');
        }

        // ===== SUPER ADMIN PANELI =====
        const ADM_ROLE_LABEL = { FARMER: 'Fermer', MARKET: 'Market', DRIVER: 'Haydovchi', DISPATCHER: 'Dispetcher', ADMIN: 'Admin' };
        const ADM_PRODUCT_STATUS = {
            ACTIVE: { label: 'Faol', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
            BOOKED: { label: 'Bron qilingan', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
            SOLD:   { label: 'Sotilgan', cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
        };
        const admState = {
            users: { role: '', active: '', q: '', page: 1 },
            products: { status: '', q: '', page: 1 },
            shipments: { status: '', page: 1 },
            payments: 'ALL',
            reviews: { state: '', page: 1 },
            audit: { entity: '', page: 1 }
        };
        let admSearchTimer = null;

        function admFilterBar(parts) {
            const bar = el('div', 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3');
            parts.forEach(function (p) { bar.appendChild(p); });
            return bar;
        }
        function admSelect(options, value, onChange) {
            const s = el('select', 'auth-input');
            options.forEach(function (o) { s.appendChild(new Option(o[1], o[0])); });
            s.value = value;
            s.addEventListener('change', function () { onChange(s.value); });
            return s;
        }
        function admSearch(value, placeholder, onChange) {
            const i = el('input', 'auth-input');
            i.type = 'search'; i.placeholder = placeholder; i.value = value; i.maxLength = 60;
            i.addEventListener('input', function () {
                clearTimeout(admSearchTimer);
                admSearchTimer = setTimeout(function () { onChange(i.value.trim()); }, 400);
            });
            return i;
        }
        function admPager(data, goto) {
            const row = el('div', 'flex items-center justify-center gap-3 flex-wrap');
            if (data.page > 1) row.appendChild(actionBtn('fa-chevron-left', 'Oldingi', false, function () { goto(data.page - 1); }));
            row.appendChild(el('span', 'text-xs font-bold text-slate-400', data.page + ' / ' + data.pages + ' · jami ' + data.total));
            if (data.page < data.pages) row.appendChild(actionBtn('fa-chevron-right', 'Keyingi', false, function () { goto(data.page + 1); }));
            return row;
        }
        // cols: [header, fn(row) -> Node|string]
        function admTable(cols, rows, empty) {
            const wrap = el('div', 'glass rounded-2xl border border-white/10 overflow-x-auto');
            if (!rows.length) { wrap.appendChild(el('p', 'text-sm text-slate-400 text-center py-10 px-4', empty)); return wrap; }
            const t = el('table', 'w-full text-sm text-left min-w-[44rem]');
            const hr = el('tr', 'text-[11px] uppercase tracking-wider text-slate-400');
            cols.forEach(function (c) { hr.appendChild(el('th', 'px-4 py-3 font-bold whitespace-nowrap', c[0])); });
            const th = el('thead', 'border-b border-white/10'); th.appendChild(hr); t.appendChild(th);
            const tb = el('tbody', 'divide-y divide-white/5');
            rows.forEach(function (r) {
                const tr = el('tr', 'text-slate-200 align-top');
                cols.forEach(function (c) {
                    const td = el('td', 'px-4 py-3');
                    const v = c[1](r);
                    if (v instanceof Node) td.appendChild(v); else td.textContent = v === null || v === undefined ? '—' : String(v);
                    tr.appendChild(td);
                });
                tb.appendChild(tr);
            });
            t.appendChild(tb); wrap.appendChild(t);
            return wrap;
        }
        function admBtn(icon, label, fn, tone) {
            const b = el('button', 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-extrabold border transition whitespace-nowrap ' + (tone === 'danger'
                ? 'border-rose-500/40 text-rose-300 hover:bg-rose-500/10' : tone === 'ok' ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10' : 'border-white/15 text-slate-200 hover:bg-white/10'));
            b.type = 'button'; b.appendChild(el('i', 'fa-solid ' + icon)); b.appendChild(el('span', '', label));
            b.addEventListener('click', fn);
            return b;
        }
        function admActions(btns) { const d = el('div', 'flex flex-wrap gap-1.5'); btns.forEach(function (b) { d.appendChild(b); }); return d; }
        async function admErrToast(err) { if (err.status !== 401) showToast(err.raw || err.messages[0], 5000); }
        async function admLoad(user, title, path, render, reload) {
            const rid = ++dashRenderId;
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Yuklanmoqda...'));
            let data;
            try { data = await authed('GET', path); }
            catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], reload));
            }
            if (rid !== dashRenderId) return;
            return data;
        }
        function admHead(title, onRefresh, extra) {
            const head = el('div', 'flex items-center justify-between gap-3 flex-wrap');
            head.appendChild(el('h2', 'text-2xl font-extrabold text-white', title));
            const b = el('div', 'flex gap-2 flex-wrap');
            b.appendChild(refreshButton(onRefresh));
            (extra || []).forEach(function (x) { b.appendChild(x); });
            head.appendChild(b);
            return head;
        }
        const admName = function (name, sub) {
            const d = el('div', 'min-w-0');
            d.appendChild(el('div', 'font-bold text-white', name));
            if (sub) d.appendChild(el('div', 'text-xs text-slate-400', sub));
            return d;
        };
        const admDate = function (iso) { return iso ? formatDateTime(iso) : '—'; };

        // ----- Boshqaruv paneli -----
        function admBars(entries, tone) {
            const total = Math.max(1, entries.reduce(function (a, e) { return a + e[1]; }, 0));
            const box = el('div', 'space-y-3');
            entries.forEach(function (e) {
                const row = el('div', 'space-y-1');
                const top = el('div', 'flex justify-between text-xs font-bold');
                top.appendChild(el('span', 'text-slate-300', e[0]));
                top.appendChild(el('span', 'text-white', String(e[1])));
                row.appendChild(top);
                const tr = el('div', 'h-2 rounded-full bg-white/10 overflow-hidden');
                const f = el('div', 'h-full rounded-full ' + (e[2] || tone || 'bg-emerald-500'));
                f.style.width = Math.round(e[1] / total * 100) + '%';
                tr.appendChild(f); row.appendChild(tr); box.appendChild(row);
            });
            return box;
        }
        function admPanel(title, body) {
            const p = el('div', 'glass rounded-2xl border border-white/10 p-5 space-y-4');
            p.appendChild(el('h3', 'font-extrabold text-white', title));
            p.appendChild(body);
            return p;
        }

        async function renderAdmDashboard(user) {
            const s = await admLoad(user, '', '/admin/stats', null, function () { renderAdmDashboard(user); });
            if (!s) return;
            const n = function (o, k) { return (o && o[k]) || 0; };
            const nodes = [admHead('Boshqaruv paneli', function () { renderAdmDashboard(user); })];
            const stats = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-4');
            stats.appendChild(statCard('fa-users', 'Foydalanuvchilar', String(s.users.total), 'text-emerald-400'));
            stats.appendChild(statCard('fa-user-lock', 'Bloklanganlar', String(s.users.blocked), s.users.blocked ? 'text-rose-400' : 'text-slate-400'));
            stats.appendChild(statCard('fa-boxes-stacked', "Faol e'lonlar", String(n(s.products, 'ACTIVE')), 'text-blue-400'));
            stats.appendChild(statCard('fa-inbox', 'Kutilayotgan bronlar', String(n(s.bookings, 'PENDING')), 'text-amber-400'));
            stats.appendChild(statCard('fa-truck-fast', 'Faol yuklar', String(n(s.shipments, 'LOADING') + n(s.shipments, 'IN_TRANSIT')), 'text-purple-400'));
            stats.appendChild(statCard('fa-wallet', "To'lovlar aylanmasi", money(s.payments.volume), 'text-emerald-400'));
            stats.appendChild(statCard('fa-shield-halved', "Escrow'da", money(s.payments.heldAmount), 'text-blue-400'));
            stats.appendChild(statCard('fa-warehouse', 'Ombor qoldig\'i', kg(s.warehouse.totalKg), 'text-amber-400'));
            nodes.push(stats);
            nodes.push(buildAdminCharts(s));

            const g = el('div', 'grid grid-cols-1 lg:grid-cols-2 gap-4');
            g.appendChild(admPanel('Foydalanuvchilar rollar bo\'yicha', admBars(Object.keys(ADM_ROLE_LABEL).map(function (r) { return [ADM_ROLE_LABEL[r], n(s.users.byRole, r)]; }))));

            const chart = el('div', 'flex items-end gap-1.5 h-32');
            const maxN = Math.max.apply(null, s.signups.map(function (d) { return d.total; }).concat([1]));
            s.signups.forEach(function (d) {
                const col = el('div', 'flex-1 flex flex-col items-center justify-end h-full gap-1 group');
                const bar = el('div', 'w-full rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-300 min-h-[3px]');
                bar.style.height = Math.max(3, Math.round(d.total / maxN * 100)) + '%';
                bar.title = d.date + ': ' + d.total;
                col.appendChild(bar);
                chart.appendChild(col);
            });
            const wrap = el('div', 'space-y-2');
            wrap.appendChild(chart);
            wrap.appendChild(el('div', 'flex justify-between text-[10px] text-slate-500', s.signups[0].date.slice(5) + '  →  ' + s.signups[s.signups.length - 1].date.slice(5)));
            g.appendChild(admPanel("So'nggi 14 kunda ro'yxatdan o'tganlar", wrap));

            g.appendChild(admPanel('Bronlar', admBars([['Kutilmoqda', n(s.bookings, 'PENDING'), 'bg-amber-400'], ['Tasdiqlangan', n(s.bookings, 'APPROVED')], ['Rad etilgan', n(s.bookings, 'REJECTED'), 'bg-rose-500'], ['Bekor qilingan', n(s.bookings, 'CANCELLED'), 'bg-slate-500']])));
            g.appendChild(admPanel('Yuklar', admBars(['OPEN', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'].map(function (k) { return [SHIPMENT_STATUS[k].label, n(s.shipments, k)]; }))));
            g.appendChild(admPanel("To'lovlar", admBars(['PENDING', 'HELD', 'RELEASED', 'REFUNDED', 'CANCELLED'].map(function (k) {
                const x = s.payments.byStatus[k]; return [PAYMENT_STATUS[k].short + (x ? ' · ' + money(x.amount) : ''), x ? x.count : 0];
            }))));
            g.appendChild(admPanel('Omborxona zonalari', admBars(s.warehouse.byZone.map(function (z) { return [WH_ZONES[z.zone].label + ' · ' + kg(z.weightKg), z.itemCount]; }))));
            nodes.push(g);

            const links = el('div', 'flex flex-wrap gap-3');
            links.appendChild(actionBtn('fa-users', 'Foydalanuvchilar', true, function () { selectDashTab('adm-users'); }));
            links.appendChild(actionBtn('fa-gear', 'Sayt sozlamalari', false, function () { selectDashTab('adm-settings'); }));
            links.appendChild(actionBtn('fa-clipboard-list', 'Audit jurnali', false, function () { selectDashTab('adm-audit'); }));
            nodes.push(links);
            nodes.push(el('p', 'text-xs text-slate-500', "Oxirgi 24 soatda audit jurnaliga yozilgan amallar: " + s.auditLast24h));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ----- Foydalanuvchilar -----
        const ADM_PROFILE_FIELDS = {
            FARMER: [['farmName', "Xo'jalik nomi", 'text'], ['region', 'Viloyat', 'region'], ['district', 'Tuman', 'text'], ['address', 'Manzil', 'text'], ['stir', 'STIR', 'stir']],
            DRIVER: [['vehicleType', 'Transport turi', 'vehicle'], ['plateNumber', 'Davlat raqami', 'plate'], ['capacityKg', "Yuk sig'imi (kg)", 'number'], ['region', 'Faoliyat viloyati', 'region'], ['licenseNumber', 'Haydovchilik guvohnomasi', 'text']],
            MARKET: [['companyName', "Kompaniya / do'kon nomi", 'text'], ['region', 'Viloyat', 'region'], ['district', 'Tuman', 'text'], ['address', 'Manzil', 'text'], ['stir', 'STIR', 'stir']]
        };
        function admStatusPill(active) {
            return whPill(active ? 'Faol' : 'Bloklangan', active ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30', active ? 'fa-circle-check' : 'fa-user-lock');
        }
        async function admEditUser(id) {
            let u;
            try { u = await authed('GET', '/admin/users/' + id); } catch (err) { return admErrToast(err); }
            const prof = u.farmer || u.driver || u.market || {};
            const defs = ADM_PROFILE_FIELDS[u.role] || [];
            const fields = [{ name: 'fullName', label: 'Ism va familiya', required: true, value: u.fullName, maxLength: 100 }];
            defs.forEach(function (d) {
                const f = { name: d[0], label: d[1], value: prof[d[0]] === null || prof[d[0]] === undefined ? '' : prof[d[0]] };
                if (d[2] === 'region') { f.type = 'select'; f.options = REGIONS.map(function (r) { return [r, r]; }); f.value = prof[d[0]] || REGIONS[0]; }
                else if (d[2] === 'vehicle') { f.type = 'select'; f.options = VEHICLE_TYPES.map(function (r) { return [r, r]; }); f.value = prof[d[0]] || VEHICLE_TYPES[0]; }
                else if (d[2] === 'number') { f.type = 'number'; f.min = 1; f.value = prof[d[0]] ? Number(prof[d[0]]) : undefined; }
                if (d[2] === 'stir') f.maxLength = 9;
                fields.push(f);
            });
            openWhForm({
                title: 'Foydalanuvchini tahrirlash', sub: ADM_ROLE_LABEL[u.role] + ' · ' + u.phone, icon: 'fa-floppy-disk', submit: 'Saqlash', fields: fields,
                onSubmit: function (v) {
                    const body = { fullName: v.fullName };
                    defs.forEach(function (d) { if (v[d[0]] !== undefined) body[d[0]] = v[d[0]]; });
                    return authed('PATCH', '/admin/users/' + id, body);
                },
                done: "Foydalanuvchi ma'lumotlari yangilandi."
            });
        }
        function admToggleUser(u) {
            const block = u.isActive;
            openWhForm({
                title: block ? 'Foydalanuvchini bloklash' : 'Foydalanuvchini faollashtirish', sub: u.fullName + ' · ' + u.phone, icon: block ? 'fa-user-lock' : 'fa-user-check', submit: block ? 'Bloklash' : 'Faollashtirish',
                fields: [{ name: 'reason', label: 'Sabab (audit jurnaliga yoziladi)', type: 'textarea', maxLength: 300 }]
                    .concat(block ? [{ name: 'info', type: 'checkbox', label: "Bloklangach foydalanuvchining barcha sessiyalari darhol yopiladi va kira olmaydi. Tasdiqlayman.", value: true }] : []),
                onSubmit: function (v) { return authed('PATCH', '/admin/users/' + u.id + '/status', { isActive: !block, reason: v.reason }); },
                done: block ? 'Foydalanuvchi bloklandi.' : 'Foydalanuvchi faollashtirildi.'
            });
        }
        function admPasswordDialog(u) {
            openWhForm({
                title: 'Parolni almashtirish', sub: u.fullName + ' · ' + u.phone, icon: 'fa-key', submit: "Parolni o'rnatish",
                fields: [{ name: 'password', label: 'Yangi parol', required: true, hint: 'Kamida 8 belgi, harf va raqam. Foydalanuvchining barcha sessiyalari yopiladi.', maxLength: 72 }],
                onSubmit: function (v) { return authed('POST', '/admin/users/' + u.id + '/password', { password: v.password }); },
                done: "Parol o'zgartirildi."
            });
        }
        function admStaffDialog() {
            openWhForm({
                title: "Xodim qo'shish", sub: "Dispetcher yoki administrator akkaunti yaratiladi.", icon: 'fa-user-plus', submit: 'Yaratish',
                fields: [
                    { name: 'fullName', label: 'Ism va familiya', required: true, maxLength: 100 },
                    { name: 'phone', label: 'Telefon (+998XXXXXXXXX)', required: true, placeholder: '+998901234567', maxLength: 13 },
                    { name: 'role', label: 'Rol', type: 'select', options: [['DISPATCHER', 'Dispetcher'], ['ADMIN', 'Admin']], value: 'DISPATCHER' },
                    { name: 'password', label: 'Vaqtinchalik parol', required: true, hint: 'Kamida 8 belgi, harf va raqam.', maxLength: 72 }
                ],
                onSubmit: function (v) { return authed('POST', '/admin/staff', { fullName: v.fullName, phone: v.phone.replace(/\s/g, ''), role: v.role, password: v.password }); },
                done: 'Xodim yaratildi.'
            });
        }

        async function renderAdmUsers(user) {
            const f = admState.users;
            const qs = whQuery({ role: f.role, active: f.active, q: f.q, page: f.page, limit: 15 });
            const d = await admLoad(user, '', '/admin/users' + qs, null, function () { renderAdmUsers(user); });
            if (!d) return;
            const again = function () { renderAdmUsers(user); };
            const nodes = [admHead('Foydalanuvchilar', again, [excelButton('/reports/admin.xlsx', XLSX_NAME('admin', new Date().toISOString().slice(0, 10))), actionBtn('fa-user-plus', "Xodim qo'shish", true, admStaffDialog)])];
            nodes.push(admFilterBar([
                admSearch(f.q, 'Ism, telefon, xo\'jalik yoki davlat raqami...', function (v) { f.q = v; f.page = 1; again(); }),
                admSelect([['', 'Barcha rollar']].concat(Object.keys(ADM_ROLE_LABEL).map(function (r) { return [r, ADM_ROLE_LABEL[r]]; })), f.role, function (v) { f.role = v; f.page = 1; again(); }),
                admSelect([['', 'Barcha holatlar'], ['true', 'Faol'], ['false', 'Bloklangan']], f.active, function (v) { f.active = v; f.page = 1; again(); })
            ]));
            nodes.push(admTable([
                ['Foydalanuvchi', function (u) { const n = admName(u.fullName, u.phone); if (u.isVerified) n.firstChild.appendChild(verifiedMark()); return n; }],
                ['Rol', function (u) { return ADM_ROLE_LABEL[u.role]; }],
                ['Tashkilot / hudud', function (u) { return [u.org, u.region].filter(Boolean).join(' · ') || '—'; }],
                ['Holat', function (u) { return admStatusPill(u.isActive); }],
                ["Ro'yxatdan o'tgan", function (u) { return admDate(u.createdAt); }],
                ['Amallar', function (u) {
                    const me = currentUser();
                    const b = [admBtn('fa-pen', 'Tahrirlash', function () { admEditUser(u.id); }), admBtn('fa-key', 'Parol', function () { admPasswordDialog(u); })];
                    if (!me || me.id !== u.id) b.push(admBtn(u.isActive ? 'fa-user-lock' : 'fa-user-check', u.isActive ? 'Bloklash' : 'Faollashtirish', function () { admToggleUser(u); }, u.isActive ? 'danger' : 'ok'));
                    const vb = admVerifyButton(u);
                    if (vb) b.push(vb);
                    return admActions(b);
                }]
            ], d.items, "Foydalanuvchilar topilmadi."));
            nodes.push(admPager(d, function (p) { f.page = p; again(); }));
            dashContent.replaceChildren.apply(dashContent, nodes);
            if (f.q) { const s = dashContent.querySelector('input[type=search]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
        }

        // ----- E'lonlar -----
        function admProductDialog(p) {
            openWhForm({
                title: "E'lonni tahrirlash", sub: p.farmer.farmName, icon: 'fa-floppy-disk', submit: 'Saqlash',
                fields: [
                    { name: 'name', label: 'Nomi', required: true, value: p.name, maxLength: 100 },
                    { name: 'category', label: 'Toifa', required: true, value: p.category, maxLength: 50 },
                    { name: 'quantityKg', label: 'Miqdor (kg)', type: 'number', min: 0.01, required: true, value: Number(p.quantityKg) },
                    { name: 'pricePerKg', label: "Narx (so'm / kg)", type: 'number', min: 0.01, required: true, value: Number(p.pricePerKg) },
                    { name: 'status', label: 'Holat', type: 'select', options: Object.keys(ADM_PRODUCT_STATUS).map(function (k) { return [k, ADM_PRODUCT_STATUS[k].label]; }), value: p.status },
                    { name: 'description', label: 'Tavsif', type: 'textarea', value: p.description || '', maxLength: 1000 }
                ],
                onSubmit: function (v) { return authed('PATCH', '/admin/products/' + p.id, { name: v.name, category: v.category, quantityKg: v.quantityKg, pricePerKg: v.pricePerKg, status: v.status, description: v.description }); },
                done: "E'lon yangilandi."
            });
        }
        async function renderAdmProducts(user) {
            const f = admState.products;
            const d = await admLoad(user, '', '/admin/products' + whQuery({ status: f.status, q: f.q, page: f.page, limit: 15 }), null, function () { renderAdmProducts(user); });
            if (!d) return;
            const again = function () { renderAdmProducts(user); };
            const nodes = [admHead("E'lonlar", again)];
            nodes.push(admFilterBar([
                admSearch(f.q, "Mahsulot yoki xo'jalik nomi...", function (v) { f.q = v; f.page = 1; again(); }),
                admSelect([['', 'Barcha holatlar']].concat(Object.keys(ADM_PRODUCT_STATUS).map(function (k) { return [k, ADM_PRODUCT_STATUS[k].label]; })), f.status, function (v) { f.status = v; f.page = 1; again(); })
            ]));
            nodes.push(admTable([
                ["E'lon", function (p) { return admName(p.name, p.category); }],
                ['Fermer', function (p) { return admName(p.farmer.farmName, p.farmer.fullName + ' · ' + p.farmer.phone); }],
                ['Miqdor', function (p) { return kg(p.quantityKg); }],
                ['Narx / kg', function (p) { return money(p.pricePerKg); }],
                ['Holat', function (p) { return whPill(ADM_PRODUCT_STATUS[p.status].label, ADM_PRODUCT_STATUS[p.status].cls); }],
                ['Bronlar', function (p) { return String(p.bookingCount); }],
                ['Amallar', function (p) {
                    return admActions([admBtn('fa-pen', 'Tahrirlash', function () { admProductDialog(p); }),
                        admBtn('fa-trash', "O'chirish", async function () {
                            if (!window.confirm(T("\"{0}\" e'lonini o'chirasizmi?", p.name))) return;
                            try { await authed('DELETE', '/admin/products/' + p.id); showToast("E'lon o'chirildi."); again(); } catch (err) { admErrToast(err); }
                        }, 'danger')]);
                }]
            ], d.items, "E'lonlar topilmadi."));
            nodes.push(admPager(d, function (p) { f.page = p; again(); }));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ----- Yuklar -----
        async function renderAdmShipments(user) {
            const f = admState.shipments;
            const d = await admLoad(user, '', '/admin/shipments' + whQuery({ status: f.status, page: f.page, limit: 15 }), null, function () { renderAdmShipments(user); });
            if (!d) return;
            const again = function () { renderAdmShipments(user); };
            const nodes = [admHead('Yuk tashish', again)];
            nodes.push(admFilterBar([admSelect([['', 'Barcha holatlar']].concat(Object.keys(SHIPMENT_STATUS).map(function (k) { return [k, SHIPMENT_STATUS[k].label]; })), f.status, function (v) { f.status = v; f.page = 1; again(); })]));
            nodes.push(admTable([
                ['Yuk', function (s) { return admName(s.cargoName, s.category + ' · ' + kg(s.weightKg) + (s.source === 'WAREHOUSE' ? ' · Omborxona' : '')); }],
                ["Yo'nalish", function (s) { return s.origin.region + ' → ' + s.destination.region; }],
                ['Fermer → Market', function (s) { return s.farmName + ' → ' + s.companyName; }],
                ['Haydovchi', function (s) { return s.driver ? admName(s.driver.fullName, s.driver.plateNumber) : '—'; }],
                ['Summa', function (s) { return s.price ? bdChips(s.price, 'ADMIN', function () { openShipmentPrice(s, 'ADMIN'); }) : '—'; }],
                ["To'lov", function (s) { return s.paymentStatus ? whPill(PAYMENT_STATUS[s.paymentStatus].short, PAYMENT_STATUS[s.paymentStatus].cls) : '—'; }],
                ['Holat', function (s) { return whPill(SHIPMENT_STATUS[s.status].label, SHIPMENT_STATUS[s.status].cls); }],
                ['Yangilangan', function (s) { return admDate(s.lastLocationAt || s.deliveredAt || s.createdAt); }]
            ], d.items, "Yuklar topilmadi."));
            nodes.push(admPager(d, function (p) { f.page = p; again(); }));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ----- To'lovlar -----
        function admPaymentAction(p, kind) {
            const release = kind === 'release';
            openWhForm({
                title: release ? "Pulni fermerga o'tkazish" : 'Pulni qaytarish / bekor qilish', sub: p.order.productName + ' · ' + money(p.amount), icon: release ? 'fa-hand-holding-dollar' : 'fa-rotate-left', submit: 'Tasdiqlash',
                fields: [{ name: 'reason', label: 'Izoh (tranzaksiya tarixiga yoziladi)', type: 'textarea', maxLength: 300 },
                    { name: 'ok', type: 'checkbox', label: "Bu amalni qaytarib bo'lmasligini tushunaman.", value: false }],
                onSubmit: function (v) {
                    if (!v.ok) throw { messages: ['Amalni tasdiqlash uchun katakchani belgilang.'] };
                    return authed('POST', '/payments/' + kind, { bookingId: p.bookingId, reason: v.reason });
                },
                done: release ? "Mablag' fermerga o'tkazildi." : 'Buyurtma bekor qilindi / mablag\' qaytarildi.'
            });
        }
        async function renderAdmPayments(user) {
            const list = await admLoad(user, '', '/payments', null, function () { renderAdmPayments(user); });
            if (!list) return;
            const again = function () { renderAdmPayments(user); };
            const sum = function (st) { return list.filter(function (p) { return p.status === st; }).reduce(function (s, p) { return s + Number(p.amount); }, 0); };
            const nodes = [admHead("To'lov tranzaksiyalari", again, [excelButton('/reports/admin.xlsx', XLSX_NAME('admin', new Date().toISOString().slice(0, 10)))])];
            const stats = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-4');
            stats.appendChild(statCard('fa-hourglass-half', "To'lov kutilmoqda", money(sum('PENDING')), 'text-amber-400'));
            stats.appendChild(statCard('fa-shield-halved', "Escrow'da", money(sum('HELD')), 'text-blue-400'));
            stats.appendChild(statCard('fa-circle-check', "To'langan", money(sum('RELEASED')), 'text-emerald-400'));
            stats.appendChild(statCard('fa-rotate-left', 'Qaytarilgan', money(sum('REFUNDED')), 'text-rose-400'));
            nodes.push(stats);
            const items = admState.payments === 'ALL' ? list : list.filter(function (p) { return p.status === admState.payments; });
            nodes.push(admFilterBar([admSelect([['ALL', 'Barcha holatlar']].concat(Object.keys(PAYMENT_STATUS).map(function (k) { return [k, PAYMENT_STATUS[k].short]; })), admState.payments, function (v) { admState.payments = v; again(); })]));
            nodes.push(admTable([
                ['Buyurtma', function (p) { return admName(p.order.productName, kg(p.order.quantityKg) + ' × ' + money(p.order.pricePerKg) + (p.source === 'WAREHOUSE' ? ' · Omborxona' : '')); }],
                ['Fermer → Market', function (p) { return (p.farmer ? p.farmer.name : '—') + ' → ' + (p.market ? p.market.name : '—'); }],
                ['Summa', function (p) { return bdChips(p.breakdown, 'ADMIN', function () { openPaymentDetail(p, 'ADMIN'); }); }],
                ['Holat', function (p) { return whPill(PAYMENT_STATUS[p.status].short, PAYMENT_STATUS[p.status].cls, PAYMENT_STATUS[p.status].icon); }],
                ['Yuk', function (p) { return p.shipmentStatus ? SHIPMENT_STATUS[p.shipmentStatus].label : '—'; }],
                ['Yangilangan', function (p) { return admDate(p.updatedAt); }],
                ['Amallar', function (p) {
                    const b = [admBtn('fa-receipt', 'Chek', function () { openPaymentDetail(p, 'ADMIN'); })];
                    if (p.actions.canRelease) b.push(admBtn('fa-hand-holding-dollar', "Fermerga o'tkazish", function () { admPaymentAction(p, 'release'); }, 'ok'));
                    if (p.actions.canRefund) b.push(admBtn('fa-rotate-left', p.status === 'PENDING' ? 'Bekor qilish' : 'Qaytarish', function () { admPaymentAction(p, 'refund'); }, 'danger'));
                    return b.length ? admActions(b) : '—';
                }]
            ], items, "To'lovlar topilmadi."));
            if (list.length >= 200) nodes.push(el('p', 'text-xs text-slate-500 text-center', "Eng so'nggi 200 ta tranzaksiya ko'rsatildi."));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ----- Sharhlar (moderatsiya) -----
        async function renderAdmReviews(user) {
            const f = admState.reviews;
            const d = await admLoad(user, '', '/admin/reviews' + whQuery({ state: f.state, page: f.page, limit: 15 }), null, function () { renderAdmReviews(user); });
            if (!d) return;
            const again = function () { renderAdmReviews(user); };
            const nodes = [admHead('Sharhlar', again)];
            nodes.push(el('p', 'text-sm text-slate-400', "Yashirilgan sharh asosiy sahifada ko'rinmaydi. Spam yoki nomaqbul sharhlarni yashiring yoki o'chiring."));
            nodes.push(admFilterBar([admSelect([['', 'Barcha sharhlar'], ['approved', 'Ochiq'], ['hidden', 'Yashirilgan']], f.state, function (v) { f.state = v; f.page = 1; again(); })]));
            nodes.push(admTable([
                ['Muallif', function (r) { return admName(r.author.fullName, ADM_ROLE_LABEL[r.role] + ' · ' + r.author.phone); }],
                ['Baho', function (r) { return starRow(r.rating); }],
                ['Izoh', function (r) { const x = el('div', 'max-w-xs sm:max-w-md whitespace-normal break-words text-slate-300'); x.textContent = r.comment; return x; }],
                ['Holat', function (r) { return r.isApproved ? whPill('Ochiq', 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30') : whPill('Yashirin', 'bg-slate-500/20 text-slate-300 border-slate-500/30'); }],
                ['Sana', function (r) { return admDate(r.createdAt); }],
                ['Amallar', function (r) {
                    return admActions([
                        admBtn(r.isApproved ? 'fa-eye-slash' : 'fa-eye', r.isApproved ? 'Yashirish' : "Ko'rsatish", async function () {
                            try { await authed('PATCH', '/admin/reviews/' + r.id, { isApproved: !r.isApproved }); again(); refreshLiveReviews(true); } catch (err) { admErrToast(err); }
                        }, r.isApproved ? undefined : 'ok'),
                        admBtn('fa-trash', "O'chirish", async function () {
                            if (!window.confirm(T("Sharhni butunlay o'chirasizmi?"))) return;
                            try { await authed('DELETE', '/admin/reviews/' + r.id); showToast("Sharh o'chirildi."); again(); refreshLiveReviews(true); } catch (err) { admErrToast(err); }
                        }, 'danger')]);
                }]
            ], d.items, 'Sharhlar topilmadi.'));
            nodes.push(admPager(d, function (pg) { f.page = pg; again(); }));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ----- Sayt sozlamalari -----
        async function renderAdmSettings(user) {
            const s = await admLoad(user, '', '/admin/settings', null, function () { renderAdmSettings(user); });
            if (!s) return;
            const nodes = [admHead('Sayt sozlamalari', function () { renderAdmSettings(user); })];
            nodes.push(el('p', 'text-sm text-slate-400', "Bu yerdagi o'zgarishlar saytning yuqori paneli va pastki qismida (footer) darhol ko'rinadi."));
            const form = el('form', 'glass rounded-3xl border border-white/10 p-6 space-y-5');
            form.noValidate = true;
            const alertBox = el('div', 'hidden'); alertBox.setAttribute('role', 'alert');
            form.appendChild(alertBox);
            const inputs = {};
            const addField = function (parent, name, label, value, o) {
                o = o || {};
                const wrap = el('div', o.cls || '');
                const lab = el('label', 'block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5', label);
                const inp = o.textarea ? el('textarea', 'auth-input') : el('input', 'auth-input');
                if (o.textarea) inp.rows = 3;
                inp.id = lab.htmlFor = 'set-' + name;
                inp.value = value || '';
                if (o.placeholder) inp.placeholder = o.placeholder;
                inp.maxLength = o.max || 200;
                wrap.appendChild(lab); wrap.appendChild(inp);
                if (o.hint) wrap.appendChild(el('p', 'text-[11px] text-slate-500 mt-1.5', o.hint));
                parent.appendChild(wrap);
                inputs[name] = inp;
            };
            const group = function (title) { const g = el('div', 'space-y-4'); g.appendChild(el('h3', 'font-extrabold text-white', title)); const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-4'); g.appendChild(grid); form.appendChild(g); return grid; };

            let grid = group('Aloqa');
            addField(grid, 'siteName', 'Sayt nomi', s.siteName, { max: 60 });
            addField(grid, 'supportEmail', 'Email', s.supportEmail, { placeholder: 'info@agrargo.uz', max: 120 });
            addField(grid, 'callCenterPhones', 'Call-center telefonlari', (s.callCenterPhones || []).join('\n'), { textarea: true, cls: 'sm:col-span-2', hint: 'Har bir raqam yangi qatordan (1 tadan 5 tagacha). Birinchisi sayt tepasida ko\'rsatiladi.', max: 300 });
            grid = group('Ijtimoiy tarmoqlar');
            addField(grid, 'telegramHandle', 'Telegram nomi', s.telegramHandle, { placeholder: '@agrargobot', max: 33 });
            addField(grid, 'telegramUrl', 'Telegram havolasi', s.telegramUrl, { placeholder: 'https://t.me/agrargobot' });
            addField(grid, 'instagramUrl', 'Instagram havolasi', s.instagramUrl, { placeholder: 'https://instagram.com/...' });
            addField(grid, 'facebookUrl', 'Facebook havolasi', s.facebookUrl, { placeholder: 'https://facebook.com/...' });
            addField(grid, 'youtubeUrl', 'YouTube havolasi', s.youtubeUrl, { placeholder: 'https://youtube.com/@...', cls: 'sm:col-span-2' });
            grid.parentNode.appendChild(el('p', 'text-[11px] text-slate-500', "Havolalar faqat https:// bilan boshlanishi kerak. Bo'sh qoldirilsa, belgi saytda ko'rinmaydi."));
            grid = group('Ish vaqti (har bir til uchun)');
            ['uz', 'ru', 'en'].forEach(function (l) { addField(grid, 'hours_' + l, l.toUpperCase(), (s.workingHours || {})[l], { max: 120 }); });
            grid = group('Manzil (har bir til uchun)');
            ['uz', 'ru', 'en'].forEach(function (l) { addField(grid, 'addr_' + l, l.toUpperCase(), (s.address || {})[l], { max: 120 }); });
            grid = group('Omborxona joylashuvi (yuk tashish boshlanadigan nuqta)');
            const regWrap = el('div');
            regWrap.appendChild(el('label', 'block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5', 'Viloyat'));
            const regSel = el('select', 'auth-input');
            regSel.id = 'set-warehouseRegion';
            REGIONS.forEach(function (r) { regSel.appendChild(new Option(r, r)); });
            regSel.value = REGIONS.indexOf(s.warehouseRegion) !== -1 ? s.warehouseRegion : REGIONS[0];
            regWrap.appendChild(regSel);
            grid.appendChild(regWrap);
            inputs.warehouseRegion = regSel;
            addField(grid, 'warehouseDistrict', 'Tuman / shahar', s.warehouseDistrict, { max: 80 });
            addField(grid, 'warehouseAddress', "Aniq manzil", s.warehouseAddress, { cls: 'sm:col-span-2', max: 150, hint: "Haydovchi omborxona yukini shu manzildan oladi. Yangi buyurtmalar uchun amal qiladi." });

            const submit = el('button', 'auth-submit w-full sm:w-auto sm:px-10 bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-60 text-slate-950 font-extrabold py-3.5 rounded-2xl transition shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2.5');
            submit.type = 'submit'; submit.appendChild(el('i', 'fa-solid fa-floppy-disk')); submit.appendChild(el('span', '', 'Saqlash'));
            form.appendChild(submit);
            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                hideAuthAlert(alertBox);
                const v = function (k) { return inputs[k].value.trim(); };
                const nullable = function (k) { return v(k) === '' ? null : v(k); };
                const phones = inputs.callCenterPhones.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
                const body = {
                    siteName: v('siteName'), callCenterPhones: phones, supportEmail: nullable('supportEmail'), telegramHandle: nullable('telegramHandle'),
                    telegramUrl: nullable('telegramUrl'), instagramUrl: nullable('instagramUrl'), facebookUrl: nullable('facebookUrl'), youtubeUrl: nullable('youtubeUrl'),
                    workingHours: { uz: v('hours_uz'), ru: v('hours_ru'), en: v('hours_en') }, address: { uz: v('addr_uz'), ru: v('addr_ru'), en: v('addr_en') },
                    warehouseRegion: v('warehouseRegion'), warehouseDistrict: v('warehouseDistrict'), warehouseAddress: nullable('warehouseAddress')
                };
                setLoading(form, true);
                try {
                    const row = await authed('PUT', '/admin/settings', body);
                    applySiteSettings(row);
                    showAuthAlert("Saqlandi. O'zgarishlar saytda darhol ko'rinadi.", 'success', alertBox);
                    showToast('Sayt sozlamalari yangilandi.');
                } catch (err) {
                    if (err.status !== 401) showAuthAlert(err.messages, 'error', alertBox);
                } finally { setLoading(form, false); }
            });
            nodes.push(form);
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ----- Audit jurnali -----
        async function renderAdmAudit(user) {
            const f = admState.audit;
            const d = await admLoad(user, '', '/admin/audit' + whQuery({ entity: f.entity, page: f.page, limit: 25 }), null, function () { renderAdmAudit(user); });
            if (!d) return;
            const again = function () { renderAdmAudit(user); };
            const nodes = [admHead('Audit jurnali', again)];
            nodes.push(admFilterBar([admSelect([['', 'Hammasi'], ['user', 'Foydalanuvchilar'], ['product', "E'lonlar"], ['settings', 'Sozlamalar'], ['warehouse', 'Omborxona'], ['payments', "To'lovlar"]], f.entity, function (v) { f.entity = v; f.page = 1; again(); })]));
            nodes.push(admTable([
                ['Vaqt', function (a) { return admDate(a.createdAt); }],
                ['Kim', function (a) { return admName(a.actorName, ADM_ROLE_LABEL[a.actorRole] || a.actorRole); }],
                ['Amal', function (a) { const c = el('code', 'text-xs text-emerald-300 break-all'); c.textContent = a.action; return c; }],
                ["Ob'ekt", function (a) { return a.entity + (a.entityId ? ' · ' + a.entityId.slice(0, 8) : ''); }],
                ['Tafsilot', function (a) { if (!a.details) return '—'; const c = el('code', 'text-[11px] text-slate-400 break-all'); c.textContent = JSON.stringify(a.details); return c; }]
            ], d.items, "Jurnal bo'sh."));
            nodes.push(admPager(d, function (p) { f.page = p; again(); }));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ===== GPS KUZATUV: xarita (Leaflet), haydovchi tracker'i va ELD jurnali =====
        const TRACK_POLL_MS = 10000;   // fermer/market xaritasi yangilanishi
        const TRACK_SEND_MS = 12000;   // haydovchi koordinata yuborish davri
        const TRACK_STALE_MS = 90000;  // shundan uzoq signal kelmasa "aloqa yo'q"
        const SIM_SPEED_KMH = 120;
        const LEAFLET_JS = { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', sri: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=' };
        const LEAFLET_CSS = { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', sri: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=' };
        const TRUCK_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2h2.6a2 2 0 0 1 1.6.8l2.1 2.8c.4.5.7 1.2.7 1.8V16a2 2 0 0 1-2 2h-.3a3 3 0 0 1-5.4 0H10.7a3 3 0 0 1-5.4 0H5a2 2 0 0 1-2-2V6zm12 4v3h4.9l-1.5-2a.5.5 0 0 0-.4-.2L15 10zM8 17.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm10.7 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>';

        let leafletPromise = null;
        // Xarita kutubxonasi faqat kerak bo'lganda (SRI bilan) yuklanadi
        function loadLeaflet() {
            if (window.L && window.L.map) return Promise.resolve(window.L);
            if (leafletPromise) return leafletPromise;
            leafletPromise = new Promise(function (resolve, reject) {
                const css = document.createElement('link');
                css.rel = 'stylesheet'; css.href = LEAFLET_CSS.src; css.integrity = LEAFLET_CSS.sri; css.crossOrigin = '';
                document.head.appendChild(css);
                const js = document.createElement('script');
                js.src = LEAFLET_JS.src; js.integrity = LEAFLET_JS.sri; js.crossOrigin = '';
                js.onload = function () { window.L && window.L.map ? resolve(window.L) : reject(new Error('Leaflet')); };
                js.onerror = function () { reject(new Error('Leaflet')); };
                document.head.appendChild(js);
            }).catch(function (e) { leafletPromise = null; throw e; });
            return leafletPromise;
        }

        function distanceKm(a, b) {
            const R = 6371.0088, rad = function (d) { return d * Math.PI / 180; };
            const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
            const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
            return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
        }

        function ageText(ms) {
            const s = Math.max(0, Math.round(ms / 1000));
            if (s < 5) return 'hozirgina';
            if (s < 60) return s + ' soniya oldin';
            if (s < 3600) return Math.floor(s / 60) + ' daqiqa oldin';
            return Math.floor(s / 3600) + ' soat oldin';
        }

        function fmtMin(m) {
            const h = Math.floor(m / 60), r = m % 60;
            return h ? h + ' soat ' + r + ' daq' : r + ' daq';
        }

        function fmtClock(iso) {
            return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
        }

        function osmLink(lat, lng) {
            return 'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(lat) + '&mlon=' + encodeURIComponent(lng) + '#map=14/' + encodeURIComponent(lat) + '/' + encodeURIComponent(lng);
        }

        // ----- Xarita paneli (fermer, market va haydovchi uchun) -----
        // opts.onData(data) — har bir muvaffaqiyatli yangilanishda chaqiriladi
        function buildTrackPanel(s, opts) {
            opts = opts || {};
            const box = el('div', 'rounded-2xl border border-white/10 bg-slate-950/40 overflow-hidden');
            const head = el('div', 'flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3');
            const title = el('div', 'flex items-center gap-2 text-sm font-extrabold text-white');
            title.appendChild(el('span', 'trk-live-dot'));
            title.appendChild(el('span', '', 'Jonli kuzatuv'));
            const demo = el('span', 'hidden text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40', 'Demo (simulyatsiya)');
            title.appendChild(demo);
            head.appendChild(title);
            const meta = el('div', 'text-xs text-slate-400 font-semibold', 'Joylashuv yuklanmoqda...');
            head.appendChild(meta);
            box.appendChild(head);

            const banner = el('div', 'hidden mx-4 mb-3 rounded-xl border px-3 py-2 text-xs font-semibold');
            banner.setAttribute('role', 'status');
            box.appendChild(banner);

            const mapBox = el('div', 'trk-map h-64 sm:h-80 w-full bg-slate-900');
            box.appendChild(mapBox);
            const foot = el('div', 'px-4 py-2.5 text-[11px] text-slate-500 leading-relaxed');
            box.appendChild(foot);

            let L = null, map = null, truck = null, trail = null, line = null, fitted = false;
            let data = null, fetchedAt = 0, timer = null, ticker = null, stopped = false, mapFailed = false, inflight = false;

            const alive = function () { return !stopped && box.isConnected; };
            const showBanner = function (text, tone) {
                if (!text) { banner.className = 'hidden'; return; }
                banner.className = 'mx-4 mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ' + (tone === 'warn'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : tone === 'err' ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    : 'border-blue-500/30 bg-blue-500/10 text-blue-300');
                banner.textContent = text;
            };
            const stop = function () {
                stopped = true;
                clearTimeout(timer);
                clearInterval(ticker);
                if (map) { try { map.remove(); } catch (e) {} map = null; }
            };
            const age = function () {
                if (!data || !data.location) return null;
                return new Date(data.serverTime) - new Date(data.location.recordedAt) + (Date.now() - fetchedAt);
            };

            const paintMeta = function () {
                if (!alive()) return stop();
                const loc = data && data.location;
                if (!loc) { meta.textContent = data ? "Haydovchi joylashuvi hali kelmadi" : 'Joylashuv yuklanmoqda...'; return; }
                const a = age();
                const parts = ['Oxirgi signal: ' + ageText(a)];
                if (loc.speedKmh !== null && loc.speedKmh !== undefined) parts.push(Math.round(loc.speedKmh) + ' km/soat');
                const dest = data.route.destination.center;
                if (dest) parts.push("Manzilgacha ≈ " + formatNumber(Math.round(distanceKm(loc, dest))) + ' km');
                meta.textContent = parts.join(' · ');
                demo.classList.toggle('hidden', loc.source !== 'SIMULATED');
                if (a > TRACK_STALE_MS) {
                    showBanner("Haydovchidan " + ageText(a) + " signal kelmadi: aloqa uzilgan yoki telefon o'chiq bo'lishi mumkin.", 'warn');
                    banner.dataset.kind = 'stale';
                } else if (banner.dataset.kind === 'stale') {
                    showBanner('');
                    banner.dataset.kind = '';
                }
            };

            const paintMap = function () {
                if (!data) return;
                const loc = data.location;
                const o = data.route.origin.center, d = data.route.destination.center;
                if (mapFailed || !map) {
                    if (mapFailed) {
                        mapBox.className = 'px-4 py-6 text-sm text-slate-300 space-y-2';
                        mapBox.replaceChildren();
                        mapBox.appendChild(el('p', '', "Xaritani yuklab bo'lmadi (internetni tekshiring)."));
                        if (loc) {
                            const a = el('a', 'text-emerald-400 font-bold underline break-all', loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5) + " — xaritada ochish");
                            a.href = osmLink(loc.lat, loc.lng); a.target = '_blank'; a.rel = 'noopener noreferrer';
                            mapBox.appendChild(a);
                        }
                    }
                    return;
                }
                const pts = [];
                if (o) pts.push([o.lat, o.lng]);
                if (d) pts.push([d.lat, d.lng]);
                const path = data.trail.map(function (p) { return [p.lat, p.lng]; });
                if (trail) trail.setLatLngs(path);
                if (line && o && d) line.setLatLngs([[o.lat, o.lng], [d.lat, d.lng]]);
                if (loc) {
                    const ll = [loc.lat, loc.lng];
                    if (!truck) truck = L.marker(ll, { icon: markerIcon(L, 'truck'), zIndexOffset: 1000, keyboard: false }).addTo(map);
                    else truck.setLatLng(ll);
                    pts.push(ll);
                }
                if (!fitted && pts.length) { map.fitBounds(pts, { padding: [36, 36], maxZoom: 12 }); fitted = true; }
                else if (loc && !map.getBounds().pad(-0.1).contains([loc.lat, loc.lng])) map.panTo([loc.lat, loc.lng]);
            };

            const initMap = function () {
                loadLeaflet().then(function (lib) {
                    if (!alive()) return;
                    L = lib;
                    map = L.map(mapBox, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
                    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(map);
                    map.setView([41.3, 64.6], 5);
                    const o = data && data.route.origin.center, d = data && data.route.destination.center;
                    line = L.polyline([], { color: '#94a3b8', weight: 3, opacity: 0.8, dashArray: '8 8' }).addTo(map);
                    trail = L.polyline([], { color: '#10b981', weight: 5, opacity: 0.95 }).addTo(map);
                    const tip = function (m, t) { m.bindTooltip(t, { direction: 'top', offset: [0, -12] }); };
                    if (o) tip(L.marker([o.lat, o.lng], { icon: markerIcon(L, opts.originKind || 'farm'), keyboard: false }).addTo(map), "Yuk olingan joy: " + data.route.origin.region);
                    if (d) tip(L.marker([d.lat, d.lng], { icon: markerIcon(L, 'store'), keyboard: false }).addTo(map), 'Yetkaziladi: ' + data.route.destination.region);
                    setTimeout(function () { if (map) { map.invalidateSize(); paintMap(); } }, 80);
                }).catch(function () { mapFailed = true; paintMap(); });
            };

            const schedule = function () { if (!stopped) timer = setTimeout(refresh, TRACK_POLL_MS); };
            async function refresh() {
                if (!alive()) return stop();
                if (document.hidden) return schedule();
                if (inflight) return;
                inflight = true;
                let res;
                try {
                    res = await authed('GET', '/shipments/' + s.id + '/location');
                } catch (err) {
                    inflight = false;
                    if (err.status === 401) return stop();
                    showBanner(err.raw || err.messages[0] || "Joylashuvni olib bo'lmadi.", 'err');
                    return schedule();
                }
                inflight = false;
                if (!alive()) return stop();
                const first = !data;
                data = res; fetchedAt = Date.now();
                if (first && !stopped) initMap();
                if (opts.onData) opts.onData(data);
                if (!data.tracking) {
                    stop();
                    showBanner("Yuk endi yo'lda emas (" + (SHIPMENT_STATUS[data.status] || {}).label + "). Ro'yxat yangilanmoqda...", 'info');
                    setTimeout(function () { if (dashboardView.classList.contains('open') && ['overview', 'shipments', 'myloads'].indexOf(dashTab) !== -1) selectDashTab(dashTab); }, 1200);
                    return;
                }
                if (!data.location) showBanner("Haydovchi hali joylashuv yubormadi. Birinchi nuqta kelishi bilan xaritada ko'rinadi.", 'info');
                else if (banner.dataset.kind !== 'stale') showBanner('');
                foot.textContent = data.route.approximate
                    ? "Marshrut viloyat markazlari orasida taxminiy chizilgan. Yashil chiziq — haydovchining haqiqiy yo'li."
                    : '';
                paintMeta();
                paintMap();
                schedule();
            }
            ticker = setInterval(paintMeta, 1000);
            timer = setTimeout(refresh, 0);
            box._stop = stop;
            box._refresh = function () { if (alive() && !inflight) { clearTimeout(timer); refresh(); } };
            return box;
        }

        // ----- Haydovchi: koordinata yuborish (brauzer GPS yoki demo simulyatsiya) -----
        const tracker = {
            shipmentId: null, mode: null, state: 'idle', message: '', lastSentAt: 0, lastFix: null, lastSentFixTs: 0,
            watchId: null, timer: null, busy: false, backoffUntil: 0, sim: null, wake: null, listeners: new Set()
        };
        function trackerEmit() { tracker.listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

        async function acquireWake() {
            try { if (navigator.wakeLock && !tracker.wake && !document.hidden) tracker.wake = await navigator.wakeLock.request('screen'); } catch (e) {}
            if (tracker.wake) tracker.wake.addEventListener('release', function () { tracker.wake = null; });
        }
        document.addEventListener('visibilitychange', function () { if (!document.hidden && tracker.state !== 'idle') acquireWake(); });

        function stopTracker(message) {
            if (tracker.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(tracker.watchId);
            clearInterval(tracker.timer);
            if (tracker.wake) { try { tracker.wake.release(); } catch (e) {} }
            Object.assign(tracker, { shipmentId: null, mode: null, state: 'idle', message: message || '', watchId: null, timer: null, lastFix: null, sim: null, wake: null, busy: false, lastSentAt: 0, lastSentFixTs: 0 });
            trackerEmit();
        }

        async function startTracker(shipmentId, mode) {
            stopTracker('');
            Object.assign(tracker, { shipmentId: shipmentId, mode: mode, state: 'searching', message: '' });
            if (mode === 'gps') {
                if (!navigator.geolocation || !window.isSecureContext) {
                    return stopTracker("Bu brauzerda GPS mavjud emas yoki sahifa xavfsiz (HTTPS) emas. Demo rejimidan foydalaning.");
                }
                tracker.watchId = navigator.geolocation.watchPosition(function (pos) {
                    const first = !tracker.lastFix;
                    tracker.lastFix = pos;
                    if (first) trackerTick();
                }, function (err) {
                    if (err.code === 1) return stopTracker("Geolokatsiya ruxsati rad etildi. Brauzer sozlamalarida ruxsat bering.");
                    tracker.state = 'searching';
                    tracker.message = 'GPS signali topilmadi. Ochiq joyga chiqing.';
                    trackerEmit();
                }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
            } else {
                try {
                    const info = await authed('GET', '/shipments/' + shipmentId + '/location');
                    if (tracker.shipmentId !== shipmentId) return;
                    const o = info.route.origin.center, d = info.route.destination.center;
                    if (!d || !(info.location || o)) return stopTracker("Demo uchun marshrut koordinatalari topilmadi.");
                    const from = info.location || o;
                    tracker.sim = { lat: from.lat, lng: from.lng, dest: d, lastAt: Date.now() };
                } catch (err) {
                    if (err.status !== 401) stopTracker(err.raw || err.messages[0]);
                    return;
                }
                trackerTick();
            }
            tracker.timer = setInterval(trackerTick, TRACK_SEND_MS);
            acquireWake();
            trackerEmit();
        }

        async function trackerTick() {
            if (tracker.busy || tracker.state === 'idle' || Date.now() < tracker.backoffUntil) return;
            const id = tracker.shipmentId;
            let payload;
            if (tracker.mode === 'gps') {
                const fix = tracker.lastFix;
                if (!fix) { tracker.state = 'searching'; trackerEmit(); return; }
                const c = fix.coords;
                if (c.accuracy > 500) { tracker.state = 'searching'; tracker.message = "GPS aniqligi past (" + Math.round(c.accuracy) + " m). Ochiq joyga chiqing."; trackerEmit(); return; }
                let ts = fix.timestamp;
                if (ts <= tracker.lastSentFixTs) {
                    if (Date.now() - ts > 40000) { tracker.state = 'searching'; tracker.message = 'Yangi GPS signali kutilmoqda...'; trackerEmit(); return; }
                    ts = Date.now(); // joyida turibdi: qurilma yangi nuqta bermadi, lekin oxirgi nuqta hali yangi
                } else tracker.lastSentFixTs = ts;
                payload = { lat: c.latitude, lng: c.longitude, timestamp: new Date(Math.min(ts, Date.now())).toISOString(), accuracyM: Math.round(c.accuracy), source: 'GPS' };
                if (typeof c.speed === 'number' && c.speed >= 0 && isFinite(c.speed)) payload.speedKmh = Math.min(300, Math.round(c.speed * 3.6));
            } else {
                const sim = tracker.sim;
                // Haqiqiy o'tgan vaqtga mos qadam: server "sakrash" deb rad etmasligi uchun
                const nowMs = Date.now();
                const stepKm = SIM_SPEED_KMH * Math.min(nowMs - sim.lastAt, 30000) / 3600000;
                sim.lastAt = nowMs;
                const left = distanceKm(sim, sim.dest);
                const moving = left > stepKm;
                if (moving) {
                    const f = stepKm / left;
                    sim.lat += (sim.dest.lat - sim.lat) * f;
                    sim.lng += (sim.dest.lng - sim.lng) * f;
                }
                payload = { lat: sim.lat, lng: sim.lng, timestamp: new Date().toISOString(), speedKmh: moving ? SIM_SPEED_KMH : 0, accuracyM: 5, source: 'SIMULATED' };
            }
            tracker.busy = true;
            try {
                await authed('POST', '/shipments/' + id + '/location', payload);
                if (tracker.shipmentId !== id) return;
                tracker.lastSentAt = Date.now();
                tracker.state = 'active';
                tracker.message = '';
            } catch (err) {
                if (tracker.shipmentId !== id) return;
                if (err.status === 401) return stopTracker('');
                if (err.status === 409 || err.status === 404) return stopTracker("Yuk endi yo'lda emas: joylashuv yuborish to'xtatildi.");
                if (err.status === 403) return stopTracker(err.raw || "Demo rejimi bu serverda o'chirilgan.");
                if (err.status === 429) { tracker.backoffUntil = Date.now() + 30000; tracker.message = "Juda tez yuborildi, biroz kutilmoqda."; }
                else if (err.status === 422) tracker.message = "GPS signali noaniq: oxirgi nuqta o'tkazib yuborildi.";
                else if (err.status === 0) tracker.message = "Aloqa yo'q. Internet qaytgach avtomatik davom etadi.";
                else tracker.message = err.raw || err.messages[0];
            } finally {
                tracker.busy = false;
                trackerEmit();
            }
        }

        // Haydovchi kartasi: boshqaruv + xarita
        function buildDriverTracking(s) {
            const wrap = el('div', 'space-y-3');
            const ctl = el('div', 'rounded-2xl border px-4 py-3 space-y-3');
            const line = el('div', 'flex items-start gap-3');
            const dot = el('span', 'mt-1.5 w-2.5 h-2.5 rounded-full shrink-0');
            const text = el('div', 'text-sm font-semibold min-w-0');
            line.append(dot, text);
            const btns = el('div', 'flex flex-wrap gap-2');
            ctl.append(line, btns);
            let simAllowed = false, seen = false, lastSent = 0, panel = null;

            const mkBtn = function (icon, label, primary, fn) {
                const b = el('button', 'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold border transition ' + (primary
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400' : 'border-white/15 text-slate-200 hover:bg-white/10'));
                b.type = 'button';
                b.appendChild(el('i', 'fa-solid ' + icon));
                b.appendChild(el('span', '', label));
                b.addEventListener('click', fn);
                return b;
            };
            const paint = function () {
                // Yangi nuqta yuborilgani zahoti xarita ham yangilanadi
                if (tracker.shipmentId === s.id && tracker.lastSentAt !== lastSent) { lastSent = tracker.lastSentAt; if (panel && panel._refresh) panel._refresh(); }
                if (ctl.isConnected) seen = true;
                else if (seen) { tracker.listeners.delete(paint); clearInterval(iv); return; }
                const mine = tracker.shipmentId === s.id && tracker.state !== 'idle';
                let tone, msg;
                if (mine && tracker.state === 'active') {
                    tone = 'ok';
                    msg = (tracker.mode === 'sim' ? 'Demo rejim: simulyatsiya qilingan harakat yuborilmoqda' : 'Joylashuv yuborilmoqda') + ' · oxirgi: ' + ageText(Date.now() - tracker.lastSentAt);
                } else if (mine) {
                    tone = 'warn';
                    msg = tracker.message || (tracker.mode === 'sim' ? 'Demo boshlanmoqda...' : 'GPS signali qidirilmoqda...');
                } else {
                    tone = 'off';
                    msg = tracker.message || "Joylashuv yuborilmayapti. Fermer va xaridor sizni xaritada ko'rishi uchun yoqing.";
                }
                if (mine && tracker.state === 'active' && tracker.message) msg += ' — ' + tracker.message;
                ctl.className = 'rounded-2xl border px-4 py-3 space-y-3 ' + (tone === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10' : tone === 'warn' ? 'border-amber-500/30 bg-amber-500/10' : 'border-rose-500/30 bg-rose-500/10');
                dot.className = 'mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ' + (tone === 'ok' ? 'bg-emerald-400 animate-pulse' : tone === 'warn' ? 'bg-amber-400 animate-pulse' : 'bg-rose-400');
                text.className = 'text-sm font-semibold min-w-0 ' + (tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-rose-300');
                text.textContent = msg;
                const nodes = [];
                if (mine) nodes.push(mkBtn('fa-stop', "Yuborishni to'xtatish", false, function () { stopTracker("Joylashuv yuborish to'xtatildi."); }));
                else {
                    nodes.push(mkBtn('fa-location-crosshairs', 'GPS orqali yuborish', true, function () { startTracker(s.id, 'gps'); }));
                    if (simAllowed) nodes.push(mkBtn('fa-flask', 'Demo (simulyatsiya)', false, function () { startTracker(s.id, 'sim'); }));
                }
                btns.replaceChildren.apply(btns, nodes);
            };
            const iv = setInterval(paint, 1000);
            tracker.listeners.add(paint);
            paint();

            wrap.appendChild(ctl);
            wrap.appendChild(el('p', 'text-[11px] text-slate-500', "Yo'lda ekranni yoqilgan va sahifani ochiq qoldiring: brauzer orqa fonda GPS'ni cheklashi mumkin."));
            panel = buildTrackPanel(s, { originKind: s.source === 'WAREHOUSE' ? 'warehouse' : 'farm', onData: function (d) { if (d.simulationAllowed !== simAllowed) { simAllowed = !!d.simulationAllowed; paint(); } } });
            wrap.appendChild(panel);
            return wrap;
        }

        // ----- ELD jurnali (haydovchi) -----
        function fmtDay(key) { const p = key.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }

        function buildEldSummary(eld, compact) {
            const todayKey = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
            const today = eld.days.find(function (d) { return d.date === todayKey; }) || { drivingMin: 0, stoppedMin: 0, distanceKm: 0, maxSpeedKmh: 0, stops: [], firstPingAt: null, lastPingAt: null, overLimit: false };
            const limit = eld.dailyDrivingLimitMinutes;
            const wrap = el('div', 'space-y-4');
            const card = el('div', 'glass rounded-3xl border border-white/10 p-5 space-y-4');
            const top = el('div', 'flex flex-wrap items-center justify-between gap-2');
            top.appendChild(el('h3', 'text-lg font-extrabold text-white', "Bugungi harakat jurnali (ELD)"));
            const cur = eld.current;
            const live = cur && cur.lastLocationAt && (Date.now() - new Date(cur.lastLocationAt)) < TRACK_STALE_MS;
            top.appendChild(el('span', 'text-xs font-bold px-3 py-1 rounded-full border ' + (live
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : cur
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-slate-500/20 text-slate-300 border-slate-500/30'),
                live ? "Yo'lda · signal bor" : cur ? "Yo'lda · signal yo'q" : "Faol yuk yo'q"));
            card.appendChild(top);

            const stats = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-3');
            stats.appendChild(statCard('fa-gauge-high', 'Haydash vaqti', fmtMin(today.drivingMin), 'text-emerald-400'));
            stats.appendChild(statCard('fa-pause', "To'xtash vaqti", fmtMin(today.stoppedMin), 'text-amber-400'));
            stats.appendChild(statCard('fa-road', 'Masofa', formatNumber(today.distanceKm) + ' km', 'text-blue-400'));
            stats.appendChild(statCard('fa-bolt', 'Maks. tezlik', today.maxSpeedKmh + ' km/soat', 'text-rose-400'));
            card.appendChild(stats);

            const pct = Math.min(100, Math.round(today.drivingMin / limit * 100));
            const bar = el('div', 'space-y-1.5');
            const barRow = el('div', 'flex justify-between text-xs font-bold text-slate-400');
            barRow.appendChild(el('span', '', 'Kunlik haydash chegarasi (' + fmtMin(limit) + ')'));
            barRow.appendChild(el('span', today.overLimit ? 'text-rose-400' : '', pct + '%'));
            bar.appendChild(barRow);
            const track = el('div', 'h-2.5 rounded-full bg-white/10 overflow-hidden');
            const fill = el('div', 'h-full rounded-full transition-all ' + (today.overLimit ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'));
            fill.style.width = pct + '%';
            track.appendChild(fill);
            bar.appendChild(track);
            if (today.overLimit) bar.appendChild(el('p', 'text-xs font-semibold text-rose-300', "Kunlik haydash chegarasidan oshdingiz. Dam oling: charchoq xavfli."));
            else if (pct >= 80) bar.appendChild(el('p', 'text-xs font-semibold text-amber-300', "Chegaraga yaqinlashyapsiz. Qisqa dam olishni rejalashtiring."));
            card.appendChild(bar);
            if (today.firstPingAt) card.appendChild(el('p', 'text-xs text-slate-500', 'Bugungi birinchi signal: ' + fmtClock(today.firstPingAt) + ' · oxirgisi: ' + fmtClock(today.lastPingAt) + ' (Toshkent vaqti)'));
            wrap.appendChild(card);
            if (compact) return wrap;

            wrap.appendChild(sectionTitle("So'nggi to'xtashlar", "Kamida 3 daqiqa joyida turgan holatlar"));
            if (eld.recentStops.length) {
                const list = el('div', 'glass rounded-2xl border border-white/10 divide-y divide-white/5');
                eld.recentStops.forEach(function (st) {
                    const row = el('div', 'flex items-center justify-between gap-3 px-4 py-3');
                    const left = el('div', 'min-w-0');
                    left.appendChild(el('div', 'text-sm font-bold text-white', fmtDay(new Date(new Date(st.startedAt).getTime() + 5 * 3600000).toISOString().slice(0, 10)) + ' · ' + fmtClock(st.startedAt) + '–' + fmtClock(st.endedAt)));
                    left.appendChild(el('div', 'text-xs text-slate-400', fmtMin(st.durationMin)));
                    row.appendChild(left);
                    const a = el('a', 'shrink-0 text-xs font-bold text-emerald-400 hover:underline', 'Xaritada');
                    a.href = osmLink(st.lat, st.lng); a.target = '_blank'; a.rel = 'noopener noreferrer';
                    row.appendChild(a);
                    list.appendChild(row);
                });
                wrap.appendChild(list);
            } else wrap.appendChild(dashMessage('fa-pause', "So'nggi kunlarda to'xtashlar qayd etilmagan."));

            wrap.appendChild(sectionTitle("Kunlar bo'yicha", "Toshkent vaqti (UTC+5), so'nggi 7 kun"));
            if (eld.days.length) {
                const tbl = el('div', 'glass rounded-2xl border border-white/10 overflow-x-auto');
                const t = el('table', 'w-full text-sm text-left min-w-[30rem]');
                const hr = el('tr', 'text-xs uppercase tracking-wider text-slate-400');
                ['Sana', 'Haydash', "To'xtash", 'Masofa', "To'xtashlar"].forEach(function (h) { hr.appendChild(el('th', 'px-4 py-3 font-bold', h)); });
                const thead = el('thead'); thead.appendChild(hr); t.appendChild(thead);
                const tb = el('tbody', 'divide-y divide-white/5');
                eld.days.forEach(function (d) {
                    const r = el('tr', 'text-slate-200');
                    r.appendChild(el('td', 'px-4 py-3 font-bold text-white', fmtDay(d.date)));
                    r.appendChild(el('td', 'px-4 py-3 ' + (d.overLimit ? 'text-rose-400 font-bold' : ''), fmtMin(d.drivingMin) + (d.overLimit ? ' ⚠' : '')));
                    r.appendChild(el('td', 'px-4 py-3', fmtMin(d.stoppedMin)));
                    r.appendChild(el('td', 'px-4 py-3', formatNumber(d.distanceKm) + ' km'));
                    r.appendChild(el('td', 'px-4 py-3', String(d.stops.length)));
                    tb.appendChild(r);
                });
                t.appendChild(tb); tbl.appendChild(t); wrap.appendChild(tbl);
            } else wrap.appendChild(emptyState({ art: 'shipments', compact: true, title: "Hali harakat jurnali yo'q", text: "Yukni yo'lga olib chiqqaningizda joylashuv avtomatik yozib boriladi." }));
            if (eld.truncated) wrap.appendChild(el('p', 'text-xs text-amber-300', "Jurnal juda katta: eng so'nggi yozuvlar ko'rsatildi."));
            return wrap;
        }

        async function renderDashEld(user) {
            const rid = ++dashRenderId;
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Jurnal yuklanmoqda...'));
            let eld;
            try {
                eld = await authed('GET', '/shipments/eld?days=7');
            } catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderDashEld(user); }));
            }
            if (rid !== dashRenderId) return;
            const head = el('div', 'flex items-center justify-between gap-3 flex-wrap');
            head.appendChild(el('h2', 'text-2xl font-extrabold text-white', 'Harakat jurnali (ELD)'));
            head.appendChild(refreshButton(function () { renderDashEld(user); }));
            dashContent.replaceChildren(head, buildEldSummary(eld, false));
        }

        // ----- Yuk tashish (Shipments) -----
        const SHIPMENT_STEPS = [
            { key: 'OPEN',       label: 'Haydovchi kutilmoqda', icon: 'fa-hourglass-half' },
            { key: 'LOADING',    label: 'Yuklanmoqda',          icon: 'fa-boxes-packing' },
            { key: 'IN_TRANSIT', label: "Yo'lda",               icon: 'fa-truck-fast' },
            { key: 'DELIVERED',  label: 'Yetkazib berildi',     icon: 'fa-circle-check' }
        ];
        const SHIPMENT_STATUS = {
            OPEN:       { label: 'Haydovchi kutilmoqda', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
            LOADING:    { label: 'Yuklanmoqda',          cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
            IN_TRANSIT: { label: "Yo'lda",               cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
            DELIVERED:  { label: 'Yetkazib berildi',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
            CANCELLED:  { label: 'Bekor qilingan',       cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
        };
        // Yuk belgisi marshrut chizig'ida shu foizda turadi
        const SHIPMENT_PROGRESS = { OPEN: 0, LOADING: 12, IN_TRANSIT: 58, DELIVERED: 100, CANCELLED: 0 };
        let dashShipFilter = 'ALL';

        function routeEnd(icon, title, place, align) {
            const box = el('div', 'min-w-0 flex-1 ' + align);
            const head = el('div', 'text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5 ' + (align === 'text-right' ? 'justify-end' : ''));
            head.appendChild(el('i', 'fa-solid text-emerald-400 ' + icon));
            head.appendChild(el('span', '', title));
            box.appendChild(head);
            box.appendChild(el('div', 'font-extrabold text-white text-sm sm:text-base break-words', place.region));
            box.appendChild(el('div', 'text-xs text-slate-400 break-words', place.district + (place.address ? ' · ' + place.address : '')));
            return box;
        }

        function shipmentRoute(s) {
            const pct = SHIPMENT_PROGRESS[s.status] / 100;
            const box = el('div', 'space-y-2');
            const ends = el('div', 'flex items-start justify-between gap-4');
            ends.appendChild(routeEnd('fa-location-dot', 'Yuk olinadi', s.origin, 'text-left'));
            ends.appendChild(routeEnd('fa-flag-checkered', 'Yetkaziladi', s.destination, 'text-right'));
            box.appendChild(ends);

            const track = el('div', 'relative h-9 mx-1');
            track.appendChild(el('div', 'absolute left-3 right-3 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/10'));
            const fill = el('div', 'absolute left-3 top-1/2 -translate-y-1/2 h-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-1000');
            fill.style.width = 'calc((100% - 1.5rem) * ' + pct + ')';
            track.appendChild(fill);
            track.appendChild(el('div', 'absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20'));
            track.appendChild(el('div', 'absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 ' + (s.status === 'DELIVERED' ? 'bg-emerald-400 border-emerald-400' : 'border-white/30 bg-slate-900')));
            const truck = el('div', 'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-slate-900 border border-emerald-400 text-emerald-300 flex items-center justify-center text-sm shadow-lg shadow-emerald-500/30 transition-all duration-1000');
            truck.style.left = 'calc(0.75rem + (100% - 1.5rem) * ' + pct + ')';
            truck.appendChild(el('i', 'fa-solid fa-truck'));
            track.appendChild(truck);
            box.appendChild(track);
            return box;
        }

        function shipmentStepper(s) {
            const idx = SHIPMENT_STEPS.findIndex(function (x) { return x.key === s.status; });
            const wrap = el('div', 'relative grid grid-cols-4 gap-1');
            wrap.appendChild(el('div', 'absolute top-[18px] left-[12.5%] right-[12.5%] h-0.5 bg-white/10'));
            const bar = el('div', 'absolute top-[18px] left-[12.5%] h-0.5 bg-emerald-400 transition-all duration-1000');
            bar.style.width = 'calc(75% * ' + (idx / 3) + ')';
            wrap.appendChild(bar);
            SHIPMENT_STEPS.forEach(function (st, i) {
                const reached = i <= idx;
                const current = i === idx && s.status !== 'DELIVERED';
                const done = reached && !current;
                const col = el('div', 'relative flex flex-col items-center text-center gap-1');
                const circle = el('div', 'w-9 h-9 rounded-full flex items-center justify-center text-sm border-2 z-10 ' + (done
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                    : current ? 'bg-slate-900 border-emerald-400 text-emerald-300 ring-4 ring-emerald-500/20 animate-pulse'
                    : 'bg-slate-900 border-white/15 text-slate-500'));
                circle.appendChild(el('i', 'fa-solid ' + (done ? 'fa-check' : st.icon)));
                col.appendChild(circle);
                col.appendChild(el('div', 'text-[10px] sm:text-xs font-bold leading-tight ' + (reached ? 'text-white' : 'text-slate-500'), st.label));
                if (reached) {
                    const evs = s.events.filter(function (e) { return e.status === st.key; });
                    if (evs.length) col.appendChild(el('div', 'text-[10px] text-slate-400', formatDateTime(evs[evs.length - 1].createdAt)));
                }
                wrap.appendChild(col);
            });
            return wrap;
        }

        function partyBox(title, name, sub, phone, address) {
            const box = el('div', 'rounded-xl bg-slate-950/50 border border-white/10 px-4 py-3 flex items-center justify-between gap-3');
            const who = el('div', 'min-w-0');
            who.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-emerald-400 font-bold', title));
            who.appendChild(el('div', 'text-sm font-bold text-white truncate', name));
            if (sub) who.appendChild(el('div', 'text-xs text-slate-400 truncate', sub));
            if (address) who.appendChild(el('div', 'text-xs text-slate-400 break-words', address));
            box.appendChild(who);
            if (phone) {
                const call = el('a', 'shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs sm:text-sm font-extrabold hover:bg-emerald-400 transition');
                call.href = 'tel:' + phone;
                call.appendChild(el('i', 'fa-solid fa-phone'));
                call.appendChild(el('span', '', phone));
                box.appendChild(call);
            }
            return box;
        }

        const SHIPMENT_DONE_MSG = {
            accept: "Yuk sizga biriktirildi. Manzil va aloqa ma'lumotlari ochildi.",
            release: "Yuk qaytarildi va boshqa haydovchilar uchun ochiq.",
            LOADING: "Yo'lga chiqdingiz. Holat: Yo'lda.",
            IN_TRANSIT: "Yuk yetkazib berildi. Rahmat!"
        };

        async function shipmentAction(s, kind, button) {
            button.disabled = true;
            try {
                const done = kind === 'advance' ? await authed('PATCH', '/shipments/' + s.id + '/advance') : await authed('POST', '/shipments/' + s.id + '/' + kind);
                if (done && done.__queued) { button.disabled = false; return; }
                showToast(SHIPMENT_DONE_MSG[kind === 'advance' ? s.status : kind], 3500);
                if (kind === 'accept') { dashShipFilter = 'ALL'; return selectDashTab('myloads'); }
                if (kind === 'advance' && s.status === 'LOADING') startTracker(s.id, 'gps'); // yo'lga chiqdi: joylashuv yuborish boshlanadi
                if (kind === 'advance' && s.status === 'IN_TRANSIT') stopTracker('');
            } catch (err) {
                if (err.status === 401) return;
                showToast(err.messages[0], 5000);
            }
            selectDashTab(dashTab);
        }

        // viewer: 'driver-open' | 'driver-own' | 'farmer' | 'market'
        function buildShipmentCard(s, viewer) {
            const meta = SHIPMENT_STATUS[s.status];
            const card = el('div', 'glass rounded-2xl border border-white/10 hover:border-emerald-500/40 transition p-5 space-y-5');

            const top = el('div', 'flex items-start justify-between gap-3');
            const title = el('div', 'min-w-0');
            title.appendChild(el('h4', 'font-extrabold text-white text-lg truncate', s.cargoName));
            const sub = el('p', 'text-xs text-slate-400 font-semibold uppercase tracking-wider');
            sub.appendChild(document.createTextNode(s.category + ' · '));
            sub.appendChild(el('span', 'text-emerald-300', formatNumber(s.weightKg) + ' kg'));
            title.appendChild(sub);
            top.appendChild(title);
            const badges = el('div', 'shrink-0 flex flex-col items-end gap-1.5');
            badges.appendChild(el('span', 'text-xs font-bold px-3 py-1 rounded-full border ' + meta.cls, meta.label));
            if (s.urgent) {
                const ub = el('span', 'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300');
                ub.appendChild(el('i', 'fa-solid fa-bolt'));
                ub.appendChild(el('span', '', 'Shoshilinch'));
                badges.appendChild(ub);
            }
            if (s.source === 'WAREHOUSE') {
                const wb = el('span', 'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300');
                wb.appendChild(el('i', 'fa-solid fa-warehouse'));
                wb.appendChild(el('span', '', 'Omborxona'));
                badges.appendChild(wb);
            }
            if (s.paymentStatus && s.status !== 'CANCELLED') badges.appendChild(paymentPill(s.paymentStatus, true));
            top.appendChild(badges);
            card.appendChild(top);

            card.appendChild(shipmentRoute(s));
            if (s.price && s.status !== 'CANCELLED') card.appendChild(buildPriceStrip(s, viewer));
            if (s.status === 'CANCELLED') {
                const banner = el('div', 'rounded-xl border border-slate-500/30 bg-slate-500/10 px-4 py-3 text-sm text-slate-300 flex items-center gap-3');
                banner.appendChild(el('i', 'fa-solid fa-ban text-slate-400'));
                banner.appendChild(el('span', '', "Buyurtma bekor qilingan, yuk tashish to'xtatilgan."));
                card.appendChild(banner);
            } else if (viewer !== 'driver-open') {
                card.appendChild(shipmentStepper(s));
            }

            if (s.status === 'IN_TRANSIT' && viewer !== 'driver-open') {
                card.appendChild(viewer === 'driver-own' ? buildDriverTracking(s) : buildTrackPanel(s, { originKind: s.source === 'WAREHOUSE' ? 'warehouse' : 'farm' }));
            } else if (s.status === 'LOADING' && (viewer === 'farmer' || viewer === 'market')) {
                const wait = el('p', 'text-xs text-slate-400 flex items-center gap-2');
                wait.appendChild(el('i', 'fa-solid fa-map-location-dot text-emerald-400'));
                wait.appendChild(document.createTextNode(s.source === 'WAREHOUSE' ? "Dispetcher yuklanganini tasdiqlab jo'natgach, jonli xarita shu yerda paydo bo'ladi." : "Haydovchi yo'lga chiqqach, jonli xarita shu yerda paydo bo'ladi."));
                card.appendChild(wait);
            }
            // Kontaktlar: faqat backend ruxsat bergan bo'lsa to'ldiriladi
            const people = el('div', 'space-y-2');
            if (viewer === 'driver-own') {
                if (s.farmer) people.appendChild(partyBox('Yuk olinadigan joy', s.farmer.farmName, s.farmer.fullName, s.farmer.phone, s.origin.address));
                if (s.market) people.appendChild(partyBox('Yetkaziladigan joy', s.market.companyName, s.market.fullName, s.market.phone, s.destination.address));
            } else if (viewer === 'farmer' || viewer === 'market') {
                if (viewer === 'farmer' && s.market) people.appendChild(partyBox('Xaridor', s.market.companyName, s.market.fullName, s.market.phone));
                if (viewer === 'market' && s.farmer) people.appendChild(partyBox(s.source === 'WAREHOUSE' ? 'Omborxona' : 'Fermer', s.farmer.farmName, s.farmer.fullName, s.farmer.phone));
                if (s.driver) people.appendChild(decorateDriverBox(partyBox('Haydovchi', s.driver.fullName, s.driver.vehicleType + ' · ' + s.driver.plateNumber, s.driver.phone), s.driver.trust));
                else {
                    const wait = el('p', 'text-xs text-slate-400 flex items-center gap-2');
                    wait.appendChild(el('i', 'fa-solid fa-hourglass-half text-amber-400'));
                    wait.appendChild(document.createTextNode('Haydovchi hali biriktirilmagan. Biriktirilganda ma\'lumotlari shu yerda ko\'rinadi.'));
                    people.appendChild(wait);
                }
            } else {
                const lock = el('p', 'text-[11px] text-slate-500 flex items-center gap-1.5');
                lock.appendChild(el('i', 'fa-solid fa-lock'));
                lock.appendChild(document.createTextNode("Aniq manzil va aloqa ma'lumotlari yukni biriktirgandan keyin ochiladi."));
                people.appendChild(lock);
                if (s.paymentStatus !== 'HELD') {
                    const unpaid = el('p', 'text-xs font-semibold text-amber-300 flex items-center gap-2');
                    unpaid.appendChild(el('i', 'fa-solid fa-hourglass-half'));
                    unpaid.appendChild(document.createTextNode("Xaridor to'lovi kutilmoqda. To'lov escrow'ga o'tgach yukni olish mumkin."));
                    people.appendChild(unpaid);
                } else {
                    const safe = el('p', 'text-xs font-semibold text-blue-300 flex items-center gap-2');
                    safe.appendChild(el('i', 'fa-solid fa-shield-halved'));
                    safe.appendChild(document.createTextNode("To'lov kafolatlangan: yetkazganingizdan keyin pul fermerga o'tadi."));
                    people.appendChild(safe);
                }
                if (s.fitsCapacity === false) {
                    const warn = el('p', 'text-xs font-semibold text-amber-300 flex items-center gap-2');
                    warn.appendChild(el('i', 'fa-solid fa-triangle-exclamation'));
                    warn.appendChild(document.createTextNode("Yuk transportingiz sig'imidan og'ir."));
                    people.appendChild(warn);
                }
            }
            if (people.childNodes.length) card.appendChild(people);
            if (s.deliveredAt) card.appendChild(el('p', 'text-xs text-emerald-400 font-semibold', 'Yetkazib berilgan: ' + formatDateTime(s.deliveredAt)));

            const btn = function (icon, label, cls, kind) {
                const b = el('button', 'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-extrabold border transition disabled:opacity-50 disabled:cursor-not-allowed ' + cls);
                b.type = 'button';
                b.appendChild(el('i', 'fa-solid ' + icon));
                b.appendChild(el('span', '', label));
                b.addEventListener('click', function () { shipmentAction(s, kind, b); });
                return b;
            };
            const actions = el('div', 'flex flex-wrap gap-2');
            if (viewer === 'driver-open') {
                const take = btn('fa-hand', 'Yukni olish', 'bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/25', 'accept');
                if (s.fitsCapacity === false || s.paymentStatus !== 'HELD') take.disabled = true;
                actions.appendChild(take);
            } else if (viewer === 'driver-own' && s.status === 'LOADING') {
                if (s.source === 'WAREHOUSE') {
                    const note = el('p', 'w-full rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-xs font-semibold text-teal-200 flex items-start gap-2');
                    note.appendChild(el('i', 'fa-solid fa-warehouse mt-0.5'));
                    note.appendChild(document.createTextNode("Omborxonaga boring: dispetcher yukni yuklab, jo'natishni tasdiqlaydi. Shundan so'ng GPS kuzatuv va harakat jurnali ishga tushadi."));
                    actions.appendChild(note);
                } else actions.appendChild(btn('fa-truck-fast', "Yo'lga chiqdim", 'bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/25', 'advance'));
                actions.appendChild(btn('fa-rotate-left', 'Qaytarish', 'border-white/15 text-slate-300 hover:bg-white/10', 'release'));
            } else if (viewer === 'driver-own' && s.status === 'IN_TRANSIT') {
                actions.appendChild(btn('fa-circle-check', 'Yetkazib berdim', 'bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/25', 'advance'));
            }
            if (actions.childNodes.length) card.appendChild(actions);
            if (viewer !== 'driver-open' && s.status !== 'CANCELLED') card.appendChild(buildDocActions(s));
            if (viewer !== 'driver-open' && s.status === 'DELIVERED') card.appendChild(buildRateActions(s, viewer));
            return card;
        }

        function refreshButton(onClick) {
            const b = el('button', 'flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-slate-300 text-sm font-bold hover:border-emerald-500/50 hover:text-emerald-400 transition');
            b.type = 'button';
            b.appendChild(el('i', 'fa-solid fa-rotate'));
            b.appendChild(el('span', '', 'Yangilash'));
            b.addEventListener('click', onClick);
            return b;
        }

        // Mening yuklarim (haydovchi) / Yuk tashish (fermer, market)
        async function renderDashShipments(user) {
            const rid = ++dashRenderId;
            const driver = user.role === 'DRIVER';
            const viewer = driver ? 'driver-own' : user.role === 'FARMER' ? 'farmer' : 'market';
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Yuklar yuklanmoqda...'));
            let list;
            try {
                const both = await Promise.all([authed('GET', '/shipments/mine'), authed('GET', '/ratings/mine').catch(function () { return ratingsMine; })]);
                list = both[0]; ratingsMine = both[1];
            } catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderDashShipments(user); }));
            }
            if (rid !== dashRenderId) return;

            const head = el('div', 'space-y-3');
            const row = el('div', 'flex items-center justify-between gap-3 flex-wrap');
            row.appendChild(el('h2', 'text-2xl font-extrabold text-white', driver ? 'Mening yuklarim' : 'Yuk tashish'));
            row.appendChild(refreshButton(function () { renderDashShipments(user); }));
            head.appendChild(row);
            if (!driver) head.appendChild(el('p', 'text-sm text-slate-400', "Tasdiqlangan bronlar uchun yuk tashish buyurtmalari va ularning holati."));
            const chips = el('div', 'flex flex-wrap gap-2');
            const isActive = function (s) { return s.status !== 'DELIVERED' && s.status !== 'CANCELLED'; };
            [['ALL', 'Hammasi', list.length], ['ACTIVE', 'Faol', list.filter(isActive).length], ['DELIVERED', 'Yakunlangan', list.filter(function (s) { return !isActive(s); }).length]].forEach(function (f) {
                const c = el('button', 'mp-chip px-4 py-1.5 rounded-full border border-white/15 text-xs font-bold text-slate-300 transition hover:border-emerald-500/50' + (dashShipFilter === f[0] ? ' active' : ''), f[1] + ' (' + f[2] + ')');
                c.type = 'button';
                c.addEventListener('click', function () { dashShipFilter = f[0]; renderDashShipments(user); });
                chips.appendChild(c);
            });
            head.appendChild(chips);

            const items = list.filter(function (s) {
                return dashShipFilter === 'ALL' || (dashShipFilter === 'ACTIVE' ? isActive(s) : !isActive(s));
            });
            const nodes = [head];
            if (items.length) items.forEach(function (s) { nodes.push(buildShipmentCard(s, viewer)); });
            else nodes.push(list.length
                ? emptyState({ art: 'search', compact: true, title: "Bu holatdagi yuklar yo'q", text: "Boshqa holatni tanlab ko'ring." })
                : driver
                    ? emptyState({ art: 'shipments', title: 'Hali yuk biriktirmagansiz', text: "To'lovi kafolatlangan yuklar ro'yxatidan o'zingizga mosini tanlang.", cta: { label: "Mavjud yuklarni ko'rish", icon: 'fa-boxes-packing', fn: function () { selectDashTab('loads'); } } })
                    : user.role === 'FARMER'
                        ? emptyState({ art: 'shipments', title: "Hali yuk tashish buyurtmalari yo'q", text: "Bronni tasdiqlaganingizda yuk tashish buyurtmasi avtomatik yaratiladi.", cta: { label: "Kelgan bronlarni ko'rish", icon: 'fa-inbox', fn: function () { selectDashTab('bookings'); } } })
                        : emptyState({ art: 'shipments', title: "Hali yuk tashish buyurtmalari yo'q", text: "Fermer bronni tasdiqlaganda yuk tashish buyurtmasi avtomatik yaratiladi.", cta: { label: "Katalogga o'tish", icon: 'fa-store', fn: goCatalog } }));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // Mavjud yuklar (haydovchi): bo'sh yuklarni ko'rish va biriktirish
        let dashLoadsRegion = '';
        async function renderDashLoads(user) {
            const rid = ++dashRenderId;
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', "Bo'sh yuklar yuklanmoqda..."));
            let list;
            try {
                list = await authed('GET', '/shipments/available' + (dashLoadsRegion ? '?originRegion=' + encodeURIComponent(dashLoadsRegion) : ''));
            } catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderDashLoads(user); }));
            }
            if (rid !== dashRenderId) return;
            setTabBadge('loads', list.length);

            const head = el('div', 'space-y-3');
            const row = el('div', 'flex items-center justify-between gap-3 flex-wrap');
            row.appendChild(el('h2', 'text-2xl font-extrabold text-white', 'Mavjud yuklar'));
            row.appendChild(refreshButton(function () { renderDashLoads(user); }));
            head.appendChild(row);
            head.appendChild(el('p', 'text-sm text-slate-400', "Yukni biriktirganingizdan keyin manzil va aloqa ma'lumotlari ochiladi. Bir vaqtda bitta yuk olib yura olasiz."));
            const select = el('select', 'auth-input !w-auto min-w-[14rem]');
            select.setAttribute('aria-label', 'Yuk olinadigan viloyat');
            select.appendChild(new Option('Barcha hududlardan', ''));
            REGIONS.forEach(function (r) { select.appendChild(new Option(r + ' dan', r)); });
            select.value = dashLoadsRegion;
            select.addEventListener('change', function () { dashLoadsRegion = select.value; renderDashLoads(user); });
            head.appendChild(select);

            const nodes = [head];
            if (list.length) list.forEach(function (s) { nodes.push(buildShipmentCard(s, 'driver-open')); });
            else nodes.push(dashLoadsRegion
                ? emptyState({ art: 'search', compact: true, title: "Bu hududdan bo'sh yuk yo'q", text: "Boshqa hududni tanlab ko'ring.", cta: { label: 'Barcha hududlar', icon: 'fa-globe', fn: function () { dashLoadsRegion = ''; renderDashLoads(user); } } })
                : emptyState({ art: 'shipments', title: "Hozircha bo'sh yuklar yo'q", text: "Fermer bronni tasdiqlaganda yangi yuk shu yerda paydo bo'ladi.", cta: { label: 'Yangilash', icon: 'fa-rotate', fn: function () { renderDashLoads(user); } } }));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ----- To'lovlar (kafolatlangan to'lov / escrow) -----
        const PAYMENT_STATUS = {
            PENDING:   { label: "To'lov kutilmoqda",                    short: 'Kutilmoqda', icon: 'fa-hourglass-half', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
            HELD:      { label: "Mablag' xavfsiz saqlanmoqda (Escrow)", short: 'Escrow',     icon: 'fa-shield-halved',  cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
            RELEASED:  { label: "To'landi",                             short: "To'landi",   icon: 'fa-circle-check',   cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
            REFUNDED:  { label: 'Xaridorga qaytarilgan',                short: 'Qaytarilgan', icon: 'fa-rotate-left',   cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
            CANCELLED: { label: 'Bekor qilingan',                       short: 'Bekor',      icon: 'fa-ban',            cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
        };
        const PAYMENT_EVENT_LABEL = {
            PENDING: "To'lov kutilmoqda", HELD: "Mablag' escrow'ga o'tkazildi", RELEASED: "Mablag' fermerga o'tkazildi",
            REFUNDED: "Mablag' xaridorga qaytarildi", CANCELLED: "To'lanmagan buyurtma bekor qilindi"
        };
        const PAYMENT_ACTOR = { MARKET: 'Xaridor', FARMER: 'Fermer', ADMIN: 'Administrator', SYSTEM: 'Tizim' };
        const PAYMENT_STEPS = [
            { key: 'PENDING',  label: "To'lov kutilmoqda",    icon: 'fa-hourglass-half' },
            { key: 'HELD',     label: "Escrow'da saqlanmoqda", icon: 'fa-shield-halved' },
            { key: 'RELEASED', label: "To'landi",              icon: 'fa-circle-check' }
        ];
        let dashPayFilter = 'ALL';
        let dashPayList = [];
        let payConfirm = null; // inline tasdiq kutilayotgan amal: { bookingId, kind }

        function paymentPill(status, compact) {
            const m = PAYMENT_STATUS[status];
            const pill = el('span', 'inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ' + m.cls);
            pill.appendChild(el('i', 'fa-solid ' + m.icon));
            pill.appendChild(el('span', '', compact ? "To'lov: " + m.short : m.label));
            return pill;
        }

        function paymentStepper(p) {
            const idx = PAYMENT_STEPS.findIndex(function (x) { return x.key === p.status; });
            const wrap = el('div', 'relative grid grid-cols-3 gap-1');
            wrap.appendChild(el('div', 'absolute top-[18px] left-[16.6%] right-[16.6%] h-0.5 bg-white/10'));
            const bar = el('div', 'absolute top-[18px] left-[16.6%] h-0.5 bg-emerald-400 transition-all duration-1000');
            bar.style.width = 'calc(66.8% * ' + (idx / 2) + ')';
            wrap.appendChild(bar);
            PAYMENT_STEPS.forEach(function (st, i) {
                const reached = i <= idx;
                const current = i === idx && p.status !== 'RELEASED';
                const done = reached && !current;
                const col = el('div', 'relative flex flex-col items-center text-center gap-1');
                const circle = el('div', 'w-9 h-9 rounded-full flex items-center justify-center text-sm border-2 z-10 ' + (done
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                    : current ? 'bg-slate-900 border-blue-400 text-blue-300 ring-4 ring-blue-500/20' + (p.status === 'HELD' ? '' : ' animate-pulse')
                    : 'bg-slate-900 border-white/15 text-slate-500'));
                circle.appendChild(el('i', 'fa-solid ' + (done ? 'fa-check' : st.icon)));
                col.appendChild(circle);
                col.appendChild(el('div', 'text-[10px] sm:text-xs font-bold leading-tight ' + (reached ? 'text-white' : 'text-slate-500'), st.label));
                const when = st.key === 'HELD' ? p.heldAt : st.key === 'RELEASED' ? p.releasedAt : p.createdAt;
                if (reached && when) col.appendChild(el('div', 'text-[10px] text-slate-400', formatDateTime(when)));
                wrap.appendChild(col);
            });
            return wrap;
        }

        // Bron kartalaridagi qisqa to'lov holati va (xaridor uchun) "To'lash" tugmasi
        function paymentStrip(b, side) {
            const pay = b.payment;
            const strip = el('div', 'rounded-xl bg-slate-950/50 border border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3');
            const left = el('div', 'space-y-1.5 min-w-0');
            left.appendChild(paymentPill(pay.status, false));
            if (pay.status === 'PENDING') {
                left.appendChild(el('p', 'text-[11px] text-slate-400', side === 'market'
                    ? "Yuk faqat to'lov escrow'ga o'tgandan keyin yo'lga chiqadi."
                    : "Xaridor to'lovini kutmoqda. To'lov kafolatlangach yuk haydovchiga ochiladi."));
            } else if (pay.status === 'HELD') {
                left.appendChild(el('p', 'text-[11px] text-slate-400', side === 'farmer'
                    ? "Pul kafolatlangan: yukni xotirjam yuklashingiz mumkin. Yetkazilgach hisobingizga o'tadi."
                    : "Mablag' yetkazib berilguncha xavfsiz saqlanadi."));
            }
            strip.appendChild(left);
            if (side === 'market' && pay.status === 'PENDING' && b.status === 'APPROVED') {
                const payBtn = el('button', 'shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-extrabold transition active:scale-95 shadow-lg shadow-emerald-500/25');
                payBtn.type = 'button';
                payBtn.appendChild(el('i', 'fa-solid fa-wallet'));
                payBtn.appendChild(el('span', '', "To'lash"));
                payBtn.addEventListener('click', function () {
                    openPaymentModal({ bookingId: b.id, amount: pay.amount, currency: pay.currency, provider: pay.provider, productName: b.product.name });
                });
                strip.appendChild(payBtn);
            }
            return strip;
        }

        // ----- To'lov oynasi (xaridor) -----
        const paymentModal = document.getElementById('payment-modal');
        const paymentAlert = document.getElementById('payment-alert');
        let paymentInfo = null;

        function openPaymentModal(info) {
            paymentInfo = info;
            hideAuthAlert(paymentAlert);
            document.getElementById('payment-summary').replaceChildren(
                el('div', 'font-extrabold text-white text-lg', info.productName),
                el('div', 'text-3xl font-black text-emerald-400', formatNumber(info.amount) + ' ' + (info.currency === 'UZS' ? "so'm" : info.currency))
            );
            document.getElementById('payment-test-note').classList.toggle('hidden', info.provider !== 'simulated');
            document.getElementById('payment-submit').querySelector('span').innerText = "To'lash — " + formatNumber(info.amount) + " so'm";
            paymentModal.classList.add('open');
            syncScrollLock();
        }

        function closePaymentModal() {
            paymentModal.classList.remove('open');
            syncScrollLock();
        }

        document.getElementById('payment-submit').addEventListener('click', async function () {
            if (!paymentInfo) return;
            const btn = this;
            hideAuthAlert(paymentAlert);
            btn.disabled = true;
            try {
                await authed('POST', '/payments/init', { bookingId: paymentInfo.bookingId });
                closePaymentModal();
                showSuccessCheck("To'lov Escrow'ga o'tdi", "Mablag' xavfsiz saqlanmoqda");
                showToast("Mablag' escrow'ga o'tkazildi va xavfsiz saqlanmoqda. Yuk yetkazilgach fermerga o'tadi.", 5000);
                if (dashboardView.classList.contains('open')) selectDashTab(dashTab);
            } catch (err) {
                if (err.status !== 401) showAuthAlert(err.messages, 'error', paymentAlert);
            } finally {
                btn.disabled = false;
            }
        });

        const PAYMENT_DONE_MSG = {
            release_FARMER: "Mablag' hisobingizga o'tkazildi.",
            release_MARKET: "Qabul tasdiqlandi. Mablag' fermerga o'tkazildi. Rahmat!",
            release_ADMIN: "Mablag' fermerga o'tkazildi.",
            refund_PENDING: "To'lanmagan buyurtma bekor qilindi. Miqdor e'longa qaytarildi.",
            refund_HELD: "Buyurtma bekor qilindi, mablag' xaridorga qaytarildi."
        };

        async function paymentAction(kind, p, viewer, button) {
            button.disabled = true;
            try {
                await authed('POST', '/payments/' + kind, { bookingId: p.bookingId });
                payConfirm = null;
                showToast(PAYMENT_DONE_MSG[kind === 'release' ? 'release_' + viewer : 'refund_' + p.status], 4500);
            } catch (err) {
                if (err.status === 401) return;
                payConfirm = null;
                showToast(err.messages[0], 5000);
            }
            selectDashTab(dashTab);
        }

        function buildPaymentCard(p, viewer) {
            const card = el('div', 'glass rounded-2xl border border-white/10 hover:border-emerald-500/40 transition p-5 space-y-4');

            const top = el('div', 'flex items-start justify-between gap-3');
            const title = el('div', 'min-w-0');
            title.appendChild(el('h4', 'font-extrabold text-white text-lg truncate', p.order.productName));
            if (p.source === 'WAREHOUSE') {
                const wb = el('span', 'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300 mb-1');
                wb.appendChild(el('i', 'fa-solid fa-warehouse'));
                wb.appendChild(el('span', '', 'Omborxona buyurtmasi'));
                title.appendChild(wb);
            }
            title.appendChild(el('p', 'text-xs text-slate-400 font-semibold uppercase tracking-wider', p.order.category + ' · ' + formatNumber(p.order.quantityKg) + ' kg × ' + formatNumber(p.order.pricePerKg) + " so'm"));
            top.appendChild(title);
            const money = el('div', 'text-right shrink-0');
            // Rolga mos asosiy summa: fermer — o'z ulushi (mahsulot), market — jami to'lov
            money.appendChild(el('div', 'text-xl font-black text-emerald-400', viewer === 'farmer' ? bdMoney(p.productPrice - (p.feeAmount ? Number(p.feeAmount) : 0)) : bdMoney(p.totalPrice)));
            money.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-slate-500 font-bold', viewer === 'farmer' ? 'Sizning ulushingiz' : "Jami to'lov"));
            if (p.source === 'WAREHOUSE' && p.farmerAmount != null) {
                money.appendChild(el('div', 'text-[11px] text-slate-400 font-semibold', "Fermerga: " + moneyExact(p.farmerAmount)));
                money.appendChild(el('div', 'text-[11px] text-slate-500', "Xizmat haqi: " + moneyExact(p.feeAmount)));
            }
            top.appendChild(money);
            card.appendChild(top);
            card.appendChild(bdChips(p.breakdown, viewer === 'farmer' ? 'FARMER' : 'MARKET', function () { openPaymentDetail(p, viewer === 'farmer' ? 'FARMER' : 'MARKET'); }));

            const party = viewer === 'farmer' ? p.market : p.farmer;
            const line = el('div', 'flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-300');
            const who = el('span', 'flex items-center gap-2');
            who.appendChild(el('i', 'fa-solid text-emerald-400 text-xs ' + (viewer === 'farmer' ? 'fa-store' : 'fa-tractor')));
            who.appendChild(document.createTextNode((viewer === 'farmer' ? 'Xaridor: ' : 'Fermer: ') + party.name + ' · ' + party.region));
            line.appendChild(who);
            card.appendChild(line);

            if (p.status === 'REFUNDED' || p.status === 'CANCELLED') {
                const banner = el('div', 'rounded-xl border px-4 py-3 flex items-center gap-3 ' + PAYMENT_STATUS[p.status].cls);
                banner.appendChild(el('i', 'fa-solid text-lg ' + PAYMENT_STATUS[p.status].icon));
                const txt = el('div', 'min-w-0');
                txt.appendChild(el('div', 'text-sm font-extrabold', PAYMENT_STATUS[p.status].label));
                txt.appendChild(el('div', 'text-xs opacity-80', p.status === 'REFUNDED'
                    ? (p.refundedAt ? formatDateTime(p.refundedAt) + " da mablag' xaridorga qaytarilgan" : "Mablag' xaridorga qaytarilgan")
                    : "Pul harakati bo'lmagan: to'lov amalga oshirilmagan"));
                banner.appendChild(txt);
                card.appendChild(banner);
            } else {
                card.appendChild(paymentStepper(p));
            }

            if (p.shipmentStatus) {
                const ship = el('div', 'flex items-center gap-2 text-xs text-slate-400');
                ship.appendChild(el('i', 'fa-solid fa-truck-fast text-emerald-400'));
                ship.appendChild(document.createTextNode('Yuk holati: '));
                ship.appendChild(el('span', 'font-bold px-2.5 py-0.5 rounded-full border ' + SHIPMENT_STATUS[p.shipmentStatus].cls, SHIPMENT_STATUS[p.shipmentStatus].label));
                card.appendChild(ship);
            }

            const a = p.actions;
            if (p.source === 'WAREHOUSE' && p.status === 'HELD') {
                const hint = el('p', 'text-[11px] text-slate-400 flex items-start gap-1.5');
                hint.appendChild(el('i', 'fa-solid fa-circle-info mt-0.5'));
                hint.appendChild(document.createTextNode("Ombor buyurtmasi: pul yuk yetkazilib, xaridor yoki dispetcher tasdiqlagach chiqariladi (\"Ombor buyurtmalari\" bo'limida)."));
                card.appendChild(hint);
            }
            // Nega hozir chiqarib bo'lmaydi: tushuntirish (masalan, xaridor tasdiqlashi uchun kutish muddati)
            if (p.status === 'HELD' && !a.canRelease && a.releaseBlockedReason) {
                const hint = el('p', 'text-[11px] text-slate-500 flex items-start gap-1.5');
                hint.appendChild(el('i', 'fa-solid fa-circle-info mt-0.5'));
                hint.appendChild(document.createTextNode(a.releaseBlockedReason));
                card.appendChild(hint);
            }

            const confirming = payConfirm && payConfirm.bookingId === p.bookingId ? payConfirm.kind : null;
            const actions = el('div', 'flex flex-wrap gap-2');
            const btn = function (icon, label, cls, onClick) {
                const b = el('button', 'flex-1 min-w-[10rem] flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-extrabold border transition disabled:opacity-50 ' + cls);
                b.type = 'button';
                b.appendChild(el('i', 'fa-solid ' + icon));
                b.appendChild(el('span', '', label));
                b.addEventListener('click', function () { onClick(b); });
                return b;
            };
            if (confirming) {
                actions.appendChild(el('span', 'w-full text-xs font-semibold text-amber-300', confirming === 'release'
                    ? "Pulni fermerga o'tkazishni tasdiqlaysizmi? Bu amalni qaytarib bo'lmaydi."
                    : (p.status === 'HELD' ? "Buyurtmani bekor qilib, pulni qaytarishni tasdiqlaysizmi?" : "To'lanmagan buyurtmani bekor qilishni tasdiqlaysizmi?")));
                actions.appendChild(btn('fa-check', 'Ha, tasdiqlayman', 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25', function (b) { paymentAction(confirming, p, viewer === 'farmer' ? 'FARMER' : 'MARKET', b); }));
                actions.appendChild(btn('fa-xmark', "Yo'q", 'border-white/15 text-slate-300 hover:bg-white/10', function () { payConfirm = null; renderPaymentsView(currentUser()); }));
            } else {
                if (a.canPay) actions.appendChild(btn('fa-wallet', "To'lash", 'bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/25', function () {
                    openPaymentModal({ bookingId: p.bookingId, amount: p.amount, currency: p.currency, provider: p.provider, productName: p.order.productName });
                }));
                if (a.canRelease) actions.appendChild(btn('fa-hand-holding-dollar', viewer === 'market' ? "Yuk qabul qilindi: pulni o'tkazish" : 'Pulni olish', 'bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/25', function () {
                    payConfirm = { bookingId: p.bookingId, kind: 'release' }; renderPaymentsView(currentUser());
                }));
                if (a.canRefund) actions.appendChild(btn('fa-rotate-left', p.status === 'PENDING' ? 'Buyurtmani bekor qilish' : (viewer === 'market' ? 'Bekor qilib pulni qaytarish' : 'Pulni qaytarish'), 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10', function () {
                    payConfirm = { bookingId: p.bookingId, kind: 'refund' }; renderPaymentsView(currentUser());
                }));
            }
            if (actions.childNodes.length) card.appendChild(actions);

            // Tranzaksiyalar tarixi
            const details = el('details', 'group rounded-xl bg-slate-950/40 border border-white/5');
            const summary = el('summary', 'cursor-pointer select-none px-4 py-2.5 text-xs font-bold text-slate-300 flex items-center justify-between');
            summary.appendChild(el('span', '', 'Tranzaksiyalar tarixi (' + p.events.length + ')'));
            summary.appendChild(el('i', 'fa-solid fa-chevron-down text-[10px] transition group-open:rotate-180'));
            details.appendChild(summary);
            const list = el('ol', 'px-4 pb-3 pt-1 space-y-2.5 border-t border-white/5');
            p.events.forEach(function (e) {
                const row = el('li', 'flex items-start gap-3 text-xs');
                row.appendChild(el('span', 'mt-1 w-2 h-2 rounded-full shrink-0 ' + (e.status === 'RELEASED' ? 'bg-emerald-400' : e.status === 'HELD' ? 'bg-blue-400' : e.status === 'PENDING' ? 'bg-amber-400' : 'bg-rose-400')));
                const txt = el('div', 'min-w-0');
                txt.appendChild(el('div', 'font-bold text-slate-200', PAYMENT_EVENT_LABEL[e.status]));
                txt.appendChild(el('div', 'text-slate-500', formatDateTime(e.createdAt) + ' · ' + (PAYMENT_ACTOR[e.actor] || e.actor || '')));
                if (e.note) txt.appendChild(el('div', 'text-slate-400 break-words', e.note));
                row.appendChild(txt);
                list.appendChild(row);
            });
            details.appendChild(list);
            card.appendChild(details);
            return card;
        }

        async function renderDashPayments(user) {
            const rid = ++dashRenderId;
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', "To'lovlar yuklanmoqda..."));
            try {
                dashPayList = await authed('GET', '/payments');
            } catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderDashPayments(user); }));
            }
            if (rid !== dashRenderId) return;
            payConfirm = null;
            renderPaymentsView(user);
        }

        // Ro'yxatni qayta chizadi (so'rovsiz): filtr va inline tasdiq almashganda
        function renderPaymentsView(user) {
            if (!user || dashTab !== 'payments') return;
            const viewer = user.role === 'FARMER' ? 'farmer' : 'market';
            const list = dashPayList;
            const sum = function (st) {
                return list.filter(function (p) { return p.status === st; }).reduce(function (s, p) { return s + Number(p.amount); }, 0);
            };
            setTabBadge('payments', viewer === 'market' ? list.filter(function (p) { return p.actions.canPay; }).length : 0);

            const nodes = [];
            const head = el('div', 'flex items-center justify-between gap-3 flex-wrap');
            head.appendChild(el('h2', 'text-2xl font-extrabold text-white', "To'lovlar"));
            head.appendChild(refreshButton(function () { renderDashPayments(user); }));
            nodes.push(head);
            if (viewer === 'market') nodes.push(marketReportBar());

            const info = el('div', 'rounded-2xl bg-blue-500/10 border border-blue-500/25 px-4 py-3 flex items-start gap-3 text-sm text-blue-200');
            info.appendChild(el('i', 'fa-solid fa-shield-halved mt-0.5 text-blue-300'));
            info.appendChild(el('span', '', "Kafolatlangan to'lov (Escrow): xaridor to'lagan mablag' yuk yetkazib berilguncha platformada xavfsiz saqlanadi va tasdiqlangach fermerga o'tadi." +
                (list.some(function (p) { return p.provider === 'simulated'; }) ? " Test rejimi: haqiqiy pul harakati yo'q." : '')));
            nodes.push(info);

            const stats = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-4');
            stats.appendChild(statCard('fa-hourglass-half', viewer === 'market' ? "To'lanishi kerak" : "To'lov kutilmoqda", formatNumber(sum('PENDING')) + " so'm", 'text-amber-400'));
            stats.appendChild(statCard('fa-shield-halved', viewer === 'market' ? "Escrow'da" : "Escrow'da (kafolatlangan)", formatNumber(sum('HELD')) + " so'm", 'text-blue-400'));
            stats.appendChild(statCard('fa-circle-check', viewer === 'market' ? "To'langan" : 'Qabul qilingan', formatNumber(sum('RELEASED')) + " so'm", 'text-emerald-400'));
            stats.appendChild(statCard('fa-rotate-left', 'Qaytarilgan', formatNumber(sum('REFUNDED')) + " so'm", 'text-rose-400'));
            nodes.push(stats);

            const chips = el('div', 'flex flex-wrap gap-2');
            const groups = { ALL: null, PENDING: ['PENDING'], HELD: ['HELD'], RELEASED: ['RELEASED'], CLOSED: ['REFUNDED', 'CANCELLED'] };
            [['ALL', 'Hammasi'], ['PENDING', 'Kutilmoqda'], ['HELD', "Escrow'da"], ['RELEASED', "To'langan"], ['CLOSED', 'Qaytarilgan / bekor']].forEach(function (f) {
                const n = groups[f[0]] ? list.filter(function (p) { return groups[f[0]].indexOf(p.status) !== -1; }).length : list.length;
                const c = el('button', 'mp-chip px-4 py-1.5 rounded-full border border-white/15 text-xs font-bold text-slate-300 transition hover:border-emerald-500/50' + (dashPayFilter === f[0] ? ' active' : ''), f[1] + ' (' + n + ')');
                c.type = 'button';
                c.addEventListener('click', function () { dashPayFilter = f[0]; payConfirm = null; renderPaymentsView(user); });
                chips.appendChild(c);
            });
            nodes.push(chips);

            const items = groups[dashPayFilter] ? list.filter(function (p) { return groups[dashPayFilter].indexOf(p.status) !== -1; }) : list;
            if (items.length) items.forEach(function (p) { nodes.push(buildPaymentCard(p, viewer)); });
            else nodes.push(list.length
                ? emptyState({ art: 'search', compact: true, title: "Bu holatdagi to'lovlar yo'q", text: "Boshqa holatni tanlab ko'ring." })
                : viewer === 'farmer'
                    ? emptyState({ art: 'payments', title: "Hali to'lovlar yo'q", text: "Bron tasdiqlanganda to'lov avtomatik yaratiladi va Escrow'da xavfsiz saqlanadi.", cta: { label: "Kelgan bronlarni ko'rish", icon: 'fa-inbox', fn: function () { selectDashTab('bookings'); } }, secondary: { label: "E'lon qo'shish", icon: 'fa-plus', fn: function () { openProductModal(); } } })
                    : emptyState({ art: 'payments', title: "Hali to'lovlar yo'q", text: "Bron tasdiqlanganda to'lov avtomatik yaratiladi va Escrow'da xavfsiz saqlanadi.", cta: { label: "Katalogga o'tish", icon: 'fa-store', fn: goCatalog } }));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ----- Profil -----
        const PROFILE_FIELDS = {
            FARMER: { key: 'farmer', fields: [['farmName', "Xo'jalik nomi", 'text', true], ['region', 'Viloyat', 'region', true], ['district', 'Tuman', 'text', true],
                ['address', 'Manzil (ixtiyoriy)', 'text', false], ['stir', 'STIR (ixtiyoriy)', 'stir', false]] },
            DRIVER: { key: 'driver', fields: [['vehicleType', 'Transport turi', 'vehicle', true], ['plateNumber', 'Davlat raqami', 'plate', true],
                ['capacityKg', "Yuk sig'imi (kg)", 'number', true], ['region', 'Faoliyat viloyati', 'region', true], ['licenseNumber', 'Haydovchilik guvohnomasi (ixtiyoriy)', 'text', false]] },
            MARKET: { key: 'market', fields: [['companyName', "Kompaniya / do'kon nomi", 'text', true], ['region', 'Viloyat', 'region', true],
                ['district', 'Tuman', 'text', true], ['address', 'Manzil (ixtiyoriy)', 'text', false], ['stir', 'STIR (ixtiyoriy)', 'stir', false]] }
        };

        async function renderDashProfile() {
            const rid = ++dashRenderId;
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Profil yuklanmoqda...'));
            let u;
            try {
                u = await authed('GET', '/profile');
            } catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], renderDashProfile));
            }
            if (rid !== dashRenderId) return;
            saveUser(u);
            dashContent.replaceChildren(buildAvatarCard(u), buildProfileForm(u), buildSoundCard(), buildTelegramCard(), buildPasswordForm());
        }

        function buildAvatarRow(u) {
            const card = el('div', 'glass rounded-3xl border border-white/10 p-6 flex flex-col sm:flex-row items-center gap-6');
            const av = el('div', 'w-28 h-28 rounded-3xl overflow-hidden bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-300 text-3xl font-black flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/10');
            av.appendChild(avatarNode(u));
            card.appendChild(av);

            const info = el('div', 'flex-1 text-center sm:text-left space-y-1.5 min-w-0');
            info.appendChild(el('h2', 'text-2xl font-extrabold text-white truncate', u.fullName));
            const role = el('div', 'inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider');
            role.appendChild(el('i', 'fa-solid ' + (ROLE_META[u.role] || {}).icon));
            role.appendChild(el('span', '', (ROLE_META[u.role] || {}).label));
            info.appendChild(role);
            info.appendChild(el('p', 'text-sm text-slate-400', u.phone));
            card.appendChild(info);

            const actions = el('div', 'flex flex-col gap-2 w-full sm:w-auto');
            const input = el('input', 'hidden');
            input.type = 'file';
            input.accept = 'image/jpeg,image/png,image/webp';
            input.addEventListener('change', function () { if (input.files[0]) uploadAvatar(input.files[0]); });
            actions.appendChild(input);
            actions.appendChild(actionBtn('fa-camera', u.avatarUrl ? "Rasmni o'zgartirish" : 'Rasm yuklash', true, function () { input.click(); }));
            if (u.avatarUrl) actions.appendChild(actionBtn('fa-trash', "Rasmni o'chirish", false, removeAvatar));
            actions.appendChild(el('p', 'text-[11px] text-slate-500 text-center', 'JPG, PNG yoki WEBP, 2 MB gacha'));
            card.appendChild(actions);
            return card;
        }

        async function uploadAvatar(file) {
            if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return showToast('Faqat JPG, PNG yoki WEBP rasm yuklang.', 4000);
            if (file.size > 2 * 1024 * 1024) return showToast('Rasm hajmi 2 MB dan oshmasligi kerak.', 4000);
            const token = storageGet(TOKEN_KEY);
            if (!token) return handleSessionExpired(reopenDash);
            const fd = new FormData();
            fd.append('file', file);
            let res;
            try {
                res = await fetch(API_URL + '/profile/avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
            } catch (e) {
                return showToast("Serverga ulanib bo'lmadi. Qayta urinib ko'ring.", 4000);
            }
            if (res.status === 401) return handleSessionExpired(reopenDash);
            let data = null;
            try { data = await res.json(); } catch (e) {}
            if (!res.ok) {
                const msg = data && data.message ? (Array.isArray(data.message) ? data.message[0] : data.message) : "Rasmni yuklab bo'lmadi.";
                return showToast(res.status === 413 ? 'Rasm hajmi 2 MB dan oshmasligi kerak.' : msg, 4000);
            }
            saveUser(data);
            showToast('Profil rasmi yangilandi.');
            renderDashProfile();
        }

        async function removeAvatar() {
            try {
                saveUser(await authed('DELETE', '/profile/avatar'));
                showToast("Profil rasmi o'chirildi.");
                renderDashProfile();
            } catch (err) {
                if (err.status !== 401) showToast(err.messages[0], 4000);
            }
        }

        function buildProfileForm(u) {
            const cfg = PROFILE_FIELDS[u.role];
            if (!cfg) { // ombor xodimi: profil ma'lumotlari administrator tomonidan boshqariladi
                const info = el('div', 'glass rounded-3xl border border-white/10 p-6 space-y-2');
                info.appendChild(sectionTitle("Xodim ma'lumotlari"));
                info.appendChild(el('p', 'text-sm text-slate-300', u.fullName + ' · ' + u.phone));
                info.appendChild(el('p', 'text-xs text-slate-500', "Ombor xodimi akkaunti administrator tomonidan boshqariladi. Parolni quyidagi bo'limda o'zgartirishingiz mumkin."));
                return info;
            }
            const profile = u[cfg.key] || {};
            const form = el('form', 'glass rounded-3xl border border-white/10 p-6 space-y-5');
            form.noValidate = true;
            form.appendChild(sectionTitle('Shaxsiy va ' + (u.role === 'DRIVER' ? 'transport' : u.role === 'MARKET' ? 'kompaniya' : "xo'jalik") + " ma'lumotlari"));
            const alertBox = el('div', 'hidden', '');
            alertBox.setAttribute('role', 'alert');
            form.appendChild(alertBox);

            const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-4');
            const inputs = {};
            const addField = function (name, label, type, value, readonly) {
                const wrap = el('div', type === 'text' && name === 'address' ? 'sm:col-span-2' : '');
                const lab = el('label', 'block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5', label);
                lab.htmlFor = 'pf-' + name;
                wrap.appendChild(lab);
                let input;
                if (type === 'region' || type === 'vehicle') {
                    input = el('select', 'auth-input');
                    const list = type === 'region' ? REGIONS : VEHICLE_TYPES;
                    const options = list.indexOf(value) === -1 && value ? [value].concat(list) : list;
                    options.forEach(function (o) { input.appendChild(new Option(o, o)); });
                    input.value = value || options[0];
                } else {
                    input = el('input', 'auth-input' + (readonly ? ' opacity-60 cursor-not-allowed' : ''));
                    input.type = type === 'number' ? 'number' : 'text';
                    if (type === 'number') { input.min = '0'; input.step = '1'; }
                    if (type === 'stir') { input.maxLength = 9; input.inputMode = 'numeric'; }
                    if (type === 'plate') bindPlateMask(input);
                    input.value = value === null || value === undefined ? '' : (type === 'number' ? Number(value) : value);
                    if (readonly) { input.readOnly = true; input.tabIndex = -1; }
                }
                input.id = 'pf-' + name;
                inputs[name] = input;
                wrap.appendChild(input);
                if (readonly) wrap.appendChild(el('p', 'text-[11px] text-slate-500 mt-1.5', "Telefon raqam akkaunt identifikatori bo'lgani uchun o'zgartirilmaydi."));
                grid.appendChild(wrap);
            };
            addField('fullName', u.role === 'MARKET' ? "Mas'ul shaxs (ism va familiya)" : 'Ism va familiya', 'text', u.fullName, false);
            addField('phone', 'Telefon raqam', 'text', u.phone, true);
            cfg.fields.forEach(function (f) { addField(f[0], f[1], f[2], profile[f[0]], false); });
            form.appendChild(grid);

            const submit = el('button', 'auth-submit w-full sm:w-auto sm:px-10 bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-extrabold py-3.5 rounded-2xl transition duration-200 shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2.5');
            submit.type = 'submit';
            submit.appendChild(el('i', 'fa-solid fa-floppy-disk'));
            submit.appendChild(el('span', '', "O'zgarishlarni saqlash"));
            form.appendChild(submit);

            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                hideAuthAlert(alertBox);
                const payload = { fullName: inputs.fullName.value.trim() };
                const errors = [];
                if (payload.fullName.length < 2) errors.push('Ism va familiyani kiriting.');
                cfg.fields.forEach(function (f) {
                    const raw = inputs[f[0]].value.trim();
                    if (f[3] && !raw) { errors.push(f[1] + ' bo\'sh bo\'lmasligi kerak.'); return; }
                    if (f[2] === 'number') { payload[f[0]] = Number(raw); if (!(payload[f[0]] > 0)) errors.push(f[1] + " 0 dan katta bo'lishi kerak."); }
                    else payload[f[0]] = raw;
                    if (f[2] === 'stir' && raw && !/^\d{9}$/.test(raw)) errors.push("STIR 9 ta raqamdan iborat bo'lishi kerak.");
                    if (f[2] === 'plate' && !PLATE_RE.test(raw)) errors.push("Davlat raqamini to'g'ri kiriting: faqat KATTA lotin harflari va raqamlar (01A777AA yoki 70777AAA).");
                });
                if (errors.length) return showAuthAlert(errors, 'error', alertBox);

                setLoading(form, true);
                try {
                    const updated = await authed('PATCH', '/profile', payload);
                    saveUser(updated);
                    showToast('Profil yangilandi.');
                    renderDashProfile();
                } catch (err) {
                    if (err.status !== 401) showAuthAlert(err.messages, 'error', alertBox);
                } finally {
                    setLoading(form, false);
                }
            });
            return form;
        }

        // ----- Telegram bot: xabarnomalarni ulash / uzish -----
        function buildTelegramCard() {
            const card = el('div', 'glass rounded-3xl border border-white/10 p-6 space-y-4');
            const head = el('div', 'flex items-center gap-3');
            head.appendChild(el('i', 'fa-brands fa-telegram text-3xl text-sky-400'));
            const ht = el('div', 'min-w-0');
            ht.appendChild(el('h3', 'text-lg font-extrabold text-white', 'Telegram xabarnomalar'));
            ht.appendChild(el('p', 'text-xs text-slate-400', "Bron, to'lov (Escrow) va yuk holati haqidagi xabarlar Telegramga keladi."));
            head.appendChild(ht);
            card.appendChild(head);
            const body = el('div', 'space-y-3');
            body.appendChild(el('p', 'text-sm text-slate-400', 'Yuklanmoqda...'));
            card.appendChild(body);
            let timer = null;
            const stopPoll = function () { if (timer) { clearInterval(timer); timer = null; } };
            const btn = function (icon, label, cls, fn) {
                const b = el('button', 'flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extrabold border transition disabled:opacity-60 ' + cls);
                b.type = 'button';
                b.appendChild(el('i', 'fa-solid ' + icon));
                b.appendChild(el('span', '', label));
                b.addEventListener('click', function () { b.disabled = true; Promise.resolve(fn()).finally(function () { b.disabled = false; }); });
                return b;
            };
            const load = async function () {
                let st;
                try { st = await authed('GET', '/profile/telegram'); }
                catch (err) { if (err.status !== 401) body.replaceChildren(el('p', 'text-sm text-rose-300', err.messages[0])); return; }
                if (!card.isConnected) return;
                paint(st);
            };
            const paint = function (st) {
                stopPoll();
                const nodes = [];
                if (st.linked) {
                    const ok = el('div', 'flex flex-wrap items-center gap-3');
                    const badge = el('span', 'inline-flex items-center gap-2 text-sm font-extrabold px-4 py-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 text-emerald-300');
                    badge.appendChild(el('i', 'fa-solid fa-circle-check'));
                    badge.appendChild(el('span', '', 'Telegram ulangan'));
                    ok.appendChild(badge);
                    if (st.linkedAt) ok.appendChild(el('span', 'text-xs text-slate-500', formatDateTime(st.linkedAt)));
                    nodes.push(ok);
                    nodes.push(btn('fa-link-slash', 'Uzish', 'border-rose-500/40 text-rose-300 hover:bg-rose-500/10', async function () {
                        if (!window.confirm(T('Telegramni uzasizmi? Xabarnomalar kelmay qoladi.'))) return;
                        try { paint(await authed('DELETE', '/profile/telegram')); showToast('Telegram uzildi.', 3000); }
                        catch (err) { if (err.status !== 401) showToast(err.messages[0], 5000); }
                    }));
                } else if (!st.enabled) {
                    nodes.push(el('p', 'text-sm text-amber-300', 'Telegram bot hozircha sozlanmagan. Keyinroq urinib ko\'ring.'));
                } else {
                    nodes.push(el('p', 'text-sm text-slate-300', "Botni ulash uchun tugmani bosing, Telegramda ochilgan chatda \"Start\" tugmasini bosing."));
                    nodes.push(btn('fa-paper-plane', 'Telegram botni ulash', 'bg-sky-500 border-sky-500 text-white hover:bg-sky-400 shadow-lg shadow-sky-500/25', async function () {
                        let link;
                        try { link = await authed('POST', '/profile/telegram/link'); }
                        catch (err) { if (err.status !== 401) showToast(err.raw || err.messages[0], 5000); return; }
                        const opened = window.open(link.url, '_blank', 'noopener');
                        const info = el('div', 'rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100 space-y-1.5');
                        info.appendChild(el('p', '', opened ? "Telegram ochildi. Botda \"Start\" tugmasini bosing, ulanish avtomatik aniqlanadi." : "Telegramni ochish uchun quyidagi havolani bosing:"));
                        const a = el('a', 'inline-block font-bold underline break-all', link.url);
                        a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
                        info.appendChild(a);
                        info.appendChild(el('p', 'text-xs text-sky-200/70', "Havola " + Math.round((new Date(link.expiresAt) - Date.now()) / 60000) + " daqiqa amal qiladi va bir marta ishlaydi."));
                        body.appendChild(info);
                        const until = new Date(link.expiresAt).getTime();
                        stopPoll();
                        timer = setInterval(async function () {
                            if (!card.isConnected || Date.now() > until) return stopPoll();
                            try {
                                const cur = await authed('GET', '/profile/telegram');
                                if (cur.linked && card.isConnected) { paint(cur); showToast('Telegram muvaffaqiyatli ulandi!', 3500); }
                            } catch (e) {}
                        }, 3000);
                    }));
                }
                body.replaceChildren.apply(body, nodes);
            };
            load();
            return card;
        }

        function buildPasswordForm() {
            const form = el('form', 'glass rounded-3xl border border-white/10 p-6 space-y-5');
            form.noValidate = true;
            form.setAttribute('autocomplete', 'off');
            form.appendChild(sectionTitle("Parolni o'zgartirish", "Xavfsizlik uchun joriy parolingizni kiriting. O'zgartirgach, boshqa qurilmalardagi sessiyalar yopiladi."));
            const alertBox = el('div', 'hidden', '');
            alertBox.setAttribute('role', 'alert');
            form.appendChild(alertBox);

            const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-4');
            const inputs = {};
            const addPw = function (name, label, autocomplete, span) {
                const wrap = el('div', span ? 'sm:col-span-2' : '');
                const lab = el('label', 'block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5', label);
                lab.htmlFor = 'cp-' + name;
                wrap.appendChild(lab);
                const input = el('input', 'auth-input');
                input.type = 'password';
                input.id = 'cp-' + name;
                input.autocomplete = autocomplete;
                input.maxLength = 72;
                wrap.appendChild(input);
                attachPasswordToggle(input);
                inputs[name] = input;
                grid.appendChild(wrap);
                return wrap;
            };
            addPw('current', 'Joriy parol', 'current-password', true);
            const newWrap = addPw('next', 'Yangi parol', 'new-password', false);
            addPw('confirm', 'Yangi parolni takrorlang', 'new-password', false);
            const rules = el('ul', 'space-y-1 mt-2');
            newWrap.appendChild(rules);
            buildPasswordRules(inputs.next, rules);
            form.appendChild(grid);

            const submit = el('button', 'auth-submit w-full sm:w-auto sm:px-10 bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-extrabold py-3.5 rounded-2xl transition duration-200 shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2.5');
            submit.type = 'submit';
            submit.appendChild(el('i', 'fa-solid fa-key'));
            submit.appendChild(el('span', '', "Parolni yangilash"));
            form.appendChild(submit);

            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                hideAuthAlert(alertBox);
                const cur = inputs.current.value, next = inputs.next.value;
                const errors = [];
                if (!cur) errors.push('Joriy parolni kiriting.');
                const problems = passwordProblems(next);
                if (problems.length) errors.push(problems[0]);
                else if (next === cur) errors.push("Yangi parol joriy paroldan farq qilishi kerak.");
                if (next !== inputs.confirm.value) errors.push('Yangi parollar mos kelmadi.');
                if (errors.length) return showAuthAlert(errors, 'error', alertBox);

                setLoading(form, true);
                try {
                    const data = await authed('POST', '/auth/change-password', { currentPassword: cur, newPassword: next });
                    if (data && data.accessToken) storageSet(TOKEN_KEY, data.accessToken);
                    form.reset();
                    hideAllPasswords();
                    inputs.next.dispatchEvent(new Event('input'));
                    showAuthAlert("Parol muvaffaqiyatli o'zgartirildi. Boshqa qurilmalardagi sessiyalar yopildi.", 'success', alertBox);
                    showToast("Parol yangilandi.");
                } catch (err) {
                    if (err.status !== 401) showAuthAlert(err.messages, 'error', alertBox);
                } finally {
                    setLoading(form, false);
                }
            });
            return form;
        }

        // ===== B2B BRON (supermarket, qisman miqdor) =====
        const bookingModal = document.getElementById('booking-modal');
        const bookingForm = document.getElementById('booking-form');
        const bookingAlert = document.getElementById('booking-alert');
        let bookingProduct = null;

        function onBookClick(p) {
            const user = currentUser();
            if (!user) {
                afterLoginAction = function () { onBookClick(p); };
                openAuthModal(isRoleKnown('MARKET') ? 'login' : 'register', 'MARKET');
                showAuthAlert("Bron qilish uchun Market akkaunti kerak. Kiring yoki ro'yxatdan o'ting.", 'info');
                return;
            }
            if (user.role !== 'MARKET') {
                const mine = (ROLE_META[user.role] || { label: user.role }).label;
                showToast("Bron qilish faqat Market akkauntlari uchun. Siz " + mine + " sifatida kirgansiz.", 5000);
                return;
            }
            openBookingModal(p);
        }

        function updateBookingTotal() {
            const qty = Number(document.getElementById('booking-qty').value);
            document.getElementById('booking-total').innerText = formatNumber(qty > 0 && bookingProduct ? qty * Number(bookingProduct.pricePerKg) : 0) + " so'm";
        }

        function openBookingModal(p) {
            bookingProduct = p;
            bookingForm.reset();
            hideAuthAlert(bookingAlert);
            const summary = document.getElementById('booking-summary');
            summary.replaceChildren(
                el('div', 'font-extrabold text-white text-lg', p.name),
                el('div', 'text-xs text-slate-400', p.farmer.farmName + ' · ' + p.farmer.region + ', ' + p.farmer.district),
                el('div', 'text-sm text-emerald-300 font-bold', formatNumber(p.pricePerKg) + " so'm / kg")
            );
            const qty = document.getElementById('booking-qty');
            qty.max = Number(p.quantityKg);
            document.getElementById('booking-hint').innerText = 'Mavjud: ' + formatNumber(p.quantityKg) + ' kg. Qisman miqdor bron qilishingiz mumkin.';
            updateBookingTotal();
            bookingModal.classList.add('open');
            syncScrollLock();
        }

        function closeBookingModal() {
            bookingModal.classList.remove('open');
            syncScrollLock();
        }

        document.getElementById('booking-qty').addEventListener('input', updateBookingTotal);

        bookingForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideAuthAlert(bookingAlert);
            const p = bookingProduct;
            const quantityKg = Number(bookingForm.quantityKg.value);
            const errors = [];
            if (!(quantityKg > 0)) errors.push("Miqdorni kiriting (0 dan katta bo'lsin).");
            else if (quantityKg > Number(p.quantityKg)) errors.push("Mavjud miqdordan (" + formatNumber(p.quantityKg) + " kg) ko'p bron qilib bo'lmaydi.");
            if (errors.length) return showAuthAlert(errors, 'error', bookingAlert);

            const token = storageGet(TOKEN_KEY);
            if (!token) return handleSessionExpired(function () { onBookClick(p); });
            const payload = { productId: p.id, quantityKg: quantityKg };
            const message = bookingForm.message.value.trim();
            if (message) payload.message = message;
            if (document.getElementById('booking-urgent').checked) payload.urgent = true;

            setLoading(bookingForm, true);
            try {
                await apiRequest('POST', '/bookings', payload, token);
                closeBookingModal();
                showToast("Bron so'rovi yuborildi. Fermer tasdiqlagach telefon raqamlar ochiladi.", 4500, 'success');
                sfx.play('booking');
                loadMarket(); // qoldiq kamaygan holda yangilanadi
            } catch (err) {
                if (err.status === 401) return handleSessionExpired(function () { onBookClick(p); });
                showAuthAlert(err.messages, 'error', bookingAlert);
                if (err.status === 404 || err.status === 409) loadMarket(); // eskirgan qoldiqni yangilaymiz
            } finally {
                setLoading(bookingForm, false);
            }
        });

        // ===== SAYT SOZLAMALARI (admin panelidan boshqariladi) va TIL ALMASHTIRGICH =====
        let siteSettings = null, siteSettingsAt = 0;
        const SOCIAL_ICONS = { telegramUrl: ['fa-telegram', 'Telegram'], instagramUrl: ['fa-instagram', 'Instagram'], facebookUrl: ['fa-facebook', 'Facebook'], youtubeUrl: ['fa-youtube', 'YouTube'] };
        const safeHttps = function (u) { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch (e) { return null; } };

        function applySiteSettings(st) {
            if (!st) return;
            siteSettings = st;
            const lang = (window.I18N && I18N.lang) || 'uz';
            const set = function (id, text) { const n = document.getElementById(id); if (n) n.textContent = text; return n; };
            if (st.siteName) set('site-name', st.siteName);
            // Yuqori panel: telegram va birinchi telefon
            const tg = document.getElementById('site-telegram');
            const tgUrl = st.telegramUrl && safeHttps(st.telegramUrl);
            tg.style.display = tgUrl ? '' : 'none'; // responsiv 'hidden sm:flex' sinfi saqlanadi
            if (tgUrl) { tg.href = tgUrl; set('site-telegram-text', st.telegramHandle || 'Telegram'); }
            const phones = (st.callCenterPhones || []).filter(Boolean);
            const ph = document.getElementById('site-phone');
            ph.style.display = phones.length ? '' : 'none';
            if (phones.length) { ph.href = 'tel:' + phones[0].replace(/[^\d+]/g, ''); set('site-phone-text', phones[0]); }
            // Footer
            const box = document.getElementById('site-phones');
            box.replaceChildren();
            phones.forEach(function (p) {
                const a = el('a', 'hover:text-emerald-400 transition', p);
                a.href = 'tel:' + p.replace(/[^\d+]/g, '');
                box.appendChild(a);
            });
            set('site-address', (st.address && (st.address[lang] || st.address.uz)) || '');
            const em = document.getElementById('site-email');
            document.getElementById('site-email-row').classList.toggle('hidden', !st.supportEmail);
            document.getElementById('site-email-row').classList.toggle('flex', !!st.supportEmail);
            if (st.supportEmail) { em.textContent = st.supportEmail; em.href = 'mailto:' + st.supportEmail; }
            const hours = st.workingHours && (st.workingHours[lang] || st.workingHours.uz);
            document.getElementById('site-hours-row').classList.toggle('hidden', !hours);
            document.getElementById('site-hours-row').classList.toggle('flex', !!hours);
            set('site-hours', hours || '');
            // "Hamkorlik / Aloqa" bloki
            const cph = document.getElementById('contact-phone');
            if (cph) {
                cph.style.display = phones.length ? '' : 'none';
                if (phones.length) { cph.href = 'tel:' + phones[0].replace(/[^\d+]/g, ''); set('contact-phone-text', phones[0]); }
                const ctg = document.getElementById('contact-telegram');
                ctg.style.display = tgUrl ? '' : 'none';
                if (tgUrl) { ctg.href = tgUrl; set('contact-telegram-text', st.telegramHandle || 'Telegram'); }
                const cem = document.getElementById('contact-email');
                cem.style.display = st.supportEmail ? '' : 'none';
                if (st.supportEmail) { cem.href = 'mailto:' + st.supportEmail; set('contact-email-text', st.supportEmail); }
            }
            const soc = document.getElementById('site-social');
            soc.replaceChildren();
            Object.keys(SOCIAL_ICONS).forEach(function (k) {
                const url = st[k] && safeHttps(st[k]);
                if (!url) return;
                const a = el('a', 'w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 transition');
                a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', SOCIAL_ICONS[k][1]);
                a.appendChild(el('i', 'fa-brands ' + SOCIAL_ICONS[k][0]));
                soc.appendChild(a);
            });
        }

        async function loadSiteSettings() {
            try {
                const res = await fetch(API_URL + '/settings/public', { cache: 'no-store' });
                if (res.ok) { applySiteSettings(await res.json()); siteSettingsAt = Date.now(); }
            } catch (e) { /* server yo'q: standart (HTML'dagi) ma'lumotlar qoladi */ }
        }
        // Boshqa oynada admin o'zgartirgan bo'lsa, sahifaga qaytganda yangilanadi
        document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - siteSettingsAt > 30000) loadSiteSettings(); });
        window.addEventListener('focus', function () { if (Date.now() - siteSettingsAt > 30000) loadSiteSettings(); });

        (function () {
            const btn = document.getElementById('lang-btn'), menu = document.getElementById('lang-menu');
            const close = function () { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); };
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const open = menu.classList.toggle('hidden') === false;
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
            menu.querySelectorAll('[data-lang]').forEach(function (b) {
                b.addEventListener('click', function () { I18N.setLang(b.getAttribute('data-lang')); close(); });
            });
            document.addEventListener('click', close);
            document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
        })();
        document.addEventListener('i18n:change', function () { applySiteSettings(siteSettings); });

        I18N.init();
        loadSiteSettings();
        updateAuthButton();
        refreshSession();

        // ===== ROL SAHIFALARI (tanishtiruv) VA JONLI SHARHLAR =====
        const ROLE_PAGES = {
            FARMER: {
                slug: 'farmer', icon: 'fa-seedling', badge: 'AgrarGo Farm', title: 'Fermerlar uchun AgrarGo',
                lead: "Hosilingizni vositachilarsiz, adolatli narxda va kafolatlangan to'lov bilan soting.",
                problems: [
                    ['fa-scale-unbalanced', 'Vositachilar narxni tushiradi', "Dehqon mahsulotini arzon topshirar, vositachi esa uni bozorda bir necha baravar qimmat sotardi."],
                    ['fa-magnifying-glass', 'Xaridor topish qiyin', "Hosil pishganda xaridor izlash, telefonlashish va bozorga qatnashga ko'p vaqt ketardi."],
                    ['fa-hand-holding-dollar', "To'lov xavfi", "Mahsulot topshirilgach pul kechikishi yoki umuman to'lanmasligi holatlari uchrardi."],
                    ['fa-box-open', "Hosil saqlanmay nobud bo'lardi", "Sovutgich va ombor yo'qligi sababli mahsulotni narx tushganda ham zudlik bilan sotishga to'g'ri kelardi."]
                ],
                solutions: [
                    ['fa-store', "To'g'ridan-to'g'ri bozor", "E'lon joylashtiring: supermarketlar va do'konlar sizning narxingizda bron qiladi."],
                    ['fa-shield-halved', "Kafolatlangan to'lov (Escrow)", "Xaridor puli yuk yetkazilguncha xavfsiz saqlanadi va tasdiqlangach hisobingizga o'tadi."],
                    ['fa-truck-fast', 'Yuk tashish avtomatik', "Bron tasdiqlanishi bilan haydovchi biriktiriladi, yukni jonli xaritada kuzatasiz."],
                    ['fa-warehouse', 'Omborxona va sovutgichlar', "Hosilni sifat nazorati bilan omborda saqlang va narx ko'tarilganda soting."]
                ],
                future: [
                    ['fa-chart-line', 'Narx tahlili va prognoz', "Hududlar bo'yicha narx dinamikasi va talabga asoslangan tavsiyalar."],
                    ['fa-coins', 'Fermerlar uchun mikromoliya', "Kelgusi hosil ta'minoti asosida urug' va o'g'it uchun qulay moliyalashtirish."],
                    ['fa-mobile-screen', "Mobil ilova va tezkor e'lon", "Telefon orqali bir necha soniyada e'lon joylash va xabarnomalar."]
                ]
            },
            DRIVER: {
                slug: 'driver', icon: 'fa-truck-fast', badge: 'AgrarGo Driver', title: 'Haydovchilar uchun AgrarGo',
                lead: "Bo'sh yurmang: to'lovi kafolatlangan yuklarni toping, yo'lda GPS bilan himoyalaning.",
                problems: [
                    ['fa-road', "Bo'sh qaytish", "Yuk topilmay, mashina yo'lning yarmida bo'sh qaytar va yoqilg'i zarar bo'lardi."],
                    ['fa-circle-question', 'Noaniq buyurtmalar', "Yukning og'irligi, manzili va narxi kelishilmasdan ish boshlanardi."],
                    ['fa-hourglass-half', "To'lovni kutish", "Yetkazilgach pulni olish uchun haftalab qo'ng'iroq qilishga to'g'ri kelardi."],
                    ['fa-file-circle-xmark', "Hisobsiz yo'l", "Reyslar, soatlar va masofa qo'lda yozilar, bahsli holatlar isbotsiz qolardi."]
                ],
                solutions: [
                    ['fa-boxes-packing', "Mavjud yuklar ro'yxati", "Hududingizdagi tasdiqlangan va to'lovi kafolatlangan yuklarni tanlab oling."],
                    ['fa-shield-halved', "To'lov kafolati", "Yuk faqat mablag' Escrow'ga o'tgandan keyin olinadi: pulingiz xavfsiz."],
                    ['fa-location-crosshairs', 'GPS kuzatuv va ELD jurnali', "Harakatingiz avtomatik yoziladi, fermer va market yukni jonli ko'radi."],
                    ['fa-warehouse', 'Omborxona yuklari', "Omborxonadan ham yuklar chiqadi: dispetcher yuklab tasdiqlagach yo'lga chiqasiz."]
                ],
                future: [
                    ['fa-arrows-rotate', 'Qaytish yuklarini birlashtirish', "Marshrutingiz bo'yicha qaytish yukini avtomatik taklif qilish."],
                    ['fa-medal', 'Reyting va bonus tizimi', "Vaqtida yetkazgan haydovchilar uchun mukofot va ustuvor yuklar."],
                    ['fa-gas-pump', "Yoqilg'i va ta'mirlash hamkorlari", "Hamkor shoxobchalarda chegirmalar va xizmat."]
                ]
            },
            MARKET: {
                slug: 'market', icon: 'fa-store', badge: 'AgrarGo Market', title: "Marketlar va do'konlar uchun AgrarGo",
                lead: "Yangi mahsulotni fermerdan bevosita, shaffof narx va xavfsiz to'lov bilan xarid qiling.",
                problems: [
                    ['fa-triangle-exclamation', 'Sifat va muddat kafolatsiz', "Mahsulot sifati va yetib kelish vaqti ko'pincha kafolatlanmasdi."],
                    ['fa-layer-group', 'Qimmat vositachilik', "Zanjirdagi har bir vositachi narxni oshirib yuborardi."],
                    ['fa-lock-open', "To'lovda ishonchsizlik", "Oldindan to'lash xavfli, keyin to'lash esa fermer uchun noqulay edi."],
                    ['fa-eye-slash', "Yukni kuzatib bo'lmasdi", "Buyurtma qayerdaligi noma'lum, zaxirani rejalash qiyin edi."]
                ],
                solutions: [
                    ['fa-handshake', 'Fermerdan bevosita xarid', "Katalogdan mahsulot tanlab, qo'ng'iroqsiz bron qiling."],
                    ['fa-shield-halved', "Escrow: xavfsiz to'lov", "Pul yuk yetkazilguncha muzlatiladi va qabul qilganingizdan keyingina fermerga o'tadi."],
                    ['fa-bell', 'Jonli kuzatuv va xabarnoma', "Yuk xaritada ko'rinadi, holat o'zgarishi Telegramga keladi."],
                    ['fa-barcode', 'Sifat nazoratidagi omborxona', "Saralangan, qadoqlangan va shtrix-kodli mahsulotlarni ombordan buyurtma qiling."]
                ],
                future: [
                    ['fa-calendar-check', 'Doimiy shartnoma va takroriy buyurtma', "Haftalik avtomatik buyurtmalar va barqaror narx kelishuvlari."],
                    ['fa-file-invoice', 'Hisob-faktura va ERP integratsiyasi', "Buxgalteriya va zaxira tizimlari bilan bog'lanish."],
                    ['fa-certificate', 'Sertifikatlangan mahsulotlar', "Organik va sifat sertifikatli yetkazib beruvchilar bo'yicha filtr."]
                ]
            }
        };
        const RP_THEME = {
            FARMER: { text: 'text-emerald-400', soft: 'bg-emerald-500/10 border-emerald-500/30', grad: 'from-emerald-500/25 via-teal-500/10', btn: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950', avatar: 'bg-emerald-500/20 text-emerald-300' },
            DRIVER: { text: 'text-blue-400', soft: 'bg-blue-500/10 border-blue-500/30', grad: 'from-blue-500/25 via-indigo-500/10', btn: 'bg-blue-500 hover:bg-blue-400 text-slate-950', avatar: 'bg-blue-500/20 text-blue-300' },
            MARKET: { text: 'text-amber-400', soft: 'bg-amber-500/10 border-amber-500/30', grad: 'from-amber-500/25 via-orange-500/10', btn: 'bg-amber-500 hover:bg-amber-400 text-slate-950', avatar: 'bg-amber-500/20 text-amber-300' }
        };
        const REVIEW_ROLES = ['FARMER', 'DRIVER', 'MARKET'];
        const rolePage = document.getElementById('role-page');
        const rpContent = document.getElementById('rp-content');
        let rpRole = null;
        let rpReviewLimit = 6;

        function starRow(rating, cls) {
            const row = el('span', 'inline-flex gap-0.5 ' + (cls || 'text-sm'));
            row.setAttribute('role', 'img');
            row.setAttribute('aria-label', rating + ' / 5');
            for (let i = 1; i <= 5; i++) row.appendChild(el('i', 'fa-solid fa-star ' + (i <= Math.round(rating) ? 'text-amber-400' : 'text-slate-600')));
            return row;
        }

        function fetchReviews(role, limit) {
            return apiRequest('GET', '/reviews?limit=' + limit + (role ? '&role=' + role : ''));
        }

        function buildReviewCard(r, isNew) {
            const th = RP_THEME[r.role] || RP_THEME.FARMER;
            const card = el('article', 'glass p-6 rounded-3xl border border-white/10 hover:border-purple-500/40 transition duration-300 flex flex-col justify-between gap-5' + (isNew ? ' review-new' : ''));
            card.dataset.id = r.id;
            const top = el('div', 'space-y-3');
            top.appendChild(starRow(r.rating));
            const q = el('p', 'text-slate-300 text-sm leading-relaxed whitespace-pre-line break-words');
            q.textContent = '"' + r.comment + '"'; // textContent: foydalanuvchi matni HTML sifatida talqin qilinmaydi
            top.appendChild(q);
            card.appendChild(top);
            const who = el('div', 'flex items-center gap-3 pt-4 border-t border-white/10');
            who.appendChild(el('div', 'w-11 h-11 rounded-full font-bold flex items-center justify-center text-base shrink-0 ' + th.avatar, (r.name || '?').slice(0, 1).toUpperCase()));
            const meta = el('div', 'min-w-0');
            meta.appendChild(el('h4', 'font-bold text-white text-sm truncate', r.name));
            const sub = el('p', 'text-xs text-slate-400 truncate');
            sub.appendChild(el('span', '', ROLE_META[r.role].label));
            if (r.region) { sub.appendChild(document.createTextNode(' · ')); sub.appendChild(el('span', '', r.region)); }
            sub.appendChild(document.createTextNode(' · '));
            sub.appendChild(el('span', '', timeAgo(r.createdAt)));
            meta.appendChild(sub);
            who.appendChild(meta);
            card.appendChild(who);
            return card;
        }

        function buildRatingSummary(stats, role) {
            const box = el('div', 'glass rounded-3xl border border-white/10 p-6 grid sm:grid-cols-[auto_minmax(0,1fr)] gap-6 items-center');
            const own = role ? stats.byRole[role] : stats;
            const big = el('div', 'text-center sm:pr-6 sm:border-r border-white/10 space-y-1');
            big.appendChild(el('div', 'text-5xl font-black text-white', own.count ? own.average.toFixed(1).replace('.', ',') : '—'));
            big.appendChild(starRow(own.average, 'text-base justify-center'));
            big.appendChild(el('div', 'text-xs text-slate-400 font-semibold', own.count + ' ta baho'));
            box.appendChild(big);
            const right = el('div', 'space-y-3 min-w-0');
            const bars = el('div', 'space-y-1.5');
            own.distribution.slice().reverse().forEach(function (d) {
                const row = el('div', 'flex items-center gap-3 text-xs text-slate-400');
                row.appendChild(el('span', 'w-3 text-right font-bold', String(d.rating)));
                row.appendChild(el('i', 'fa-solid fa-star text-amber-400 text-[10px]'));
                const track = el('div', 'flex-1 h-2 rounded-full bg-white/10 overflow-hidden');
                const fill = el('div', 'h-full rounded-full bg-amber-400 transition-all duration-700');
                fill.style.width = (own.count ? Math.round(d.count / own.count * 100) : 0) + '%';
                track.appendChild(fill);
                row.appendChild(track);
                row.appendChild(el('span', 'w-8 text-right', String(d.count)));
                bars.appendChild(row);
            });
            right.appendChild(bars);
            if (!role) {
                const chips = el('div', 'flex flex-wrap gap-2 pt-1');
                REVIEW_ROLES.forEach(function (r) {
                    const g = stats.byRole[r];
                                        const chip = el('span', ['text-[11px] font-bold px-3 py-1 rounded-full border', RP_THEME[r].soft, RP_THEME[r].text].join(' '));
                    chip.appendChild(el('span', '', ROLE_META[r].label));
                    chip.appendChild(document.createTextNode(': ' + (g.count ? g.average.toFixed(1).replace('.', ',') + ' (' + g.count + ')' : '—')));
                    chips.appendChild(chip);
                });
                right.appendChild(chips);
            }
            box.appendChild(right);
            return box;
        }

        // --- Asosiy sahifadagi jonli lenta ---
        const reviewsLive = { ids: null, busy: false, timer: null };
        let reviewsChannel = null;
        try { reviewsChannel = new BroadcastChannel('agrargo-reviews'); } catch (e) {}

        async function refreshLiveReviews(force) {
            if (reviewsLive.busy) return;
            if (!force && document.visibilityState === 'hidden') return;
            const feed = document.getElementById('reviews-feed');
            const sum = document.getElementById('reviews-summary');
            if (!feed || !sum) return;
            if (!feed.childNodes.length) feed.replaceChildren.apply(feed, reviewSkeletonCards(3)); // birinchi yuklanishda skelet
            reviewsLive.busy = true;
            try {
                const data = await fetchReviews('', 6);
                const firstLoad = reviewsLive.ids === null;
                const known = reviewsLive.ids || new Set();
                const cards = data.items.map(function (r) { return buildReviewCard(r, !firstLoad && !known.has(r.id)); });
                reviewsLive.ids = new Set(data.items.map(function (r) { return r.id; }));
                if (data.items.length) {
                    feed.replaceChildren.apply(feed, cards);
                    sum.replaceChildren(buildRatingSummary(data.stats, ''));
                } else {
                    const empty = el('div', 'md:col-span-2 lg:col-span-3 text-center glass rounded-3xl border border-white/10 p-10 space-y-2');
                    empty.appendChild(el('i', 'fa-regular fa-comment-dots text-4xl text-slate-500'));
                    empty.appendChild(el('p', 'text-slate-300 font-semibold', "Hali sharhlar yo'q. Birinchi bo'lib fikringizni qoldiring!"));
                    feed.replaceChildren(empty);
                    sum.replaceChildren();
                }
                if (rolePage.classList.contains('open') && rpRole) renderRoleReviews(rpRole);
            } catch (e) { /* tarmoq xatosi: oldingi ko'rinish qoladi, keyingi urinishda yangilanadi */ }
            finally { reviewsLive.busy = false; }
        }
        function startLiveReviews() {
            refreshLiveReviews(true);
            reviewsLive.timer = setInterval(function () { refreshLiveReviews(false); }, 15000);
            document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refreshLiveReviews(false); });
            if (reviewsChannel) reviewsChannel.onmessage = function () { refreshLiveReviews(true); };
        }

        // --- Rol sahifasi ---
        function openRolePage(role, toForm) {
            if (!ROLE_PAGES[role]) return;
            if (sidebar.classList.contains('open')) toggleSidebar();
            rpRole = role;
            rpReviewLimit = 6;
            const pg = ROLE_PAGES[role], th = RP_THEME[role];

            const chip = document.getElementById('rp-chip');
            chip.replaceChildren(el('i', 'fa-solid ' + pg.icon), el('span', '', pg.badge));
            const user = currentUser();
            const own = !!user && user.role === role;
            const cta = function () { roleCta(role); };
            const topBtn = document.getElementById('rp-cta-top');
            topBtn.textContent = own ? "Kabinetga o'tish" : "Ro'yxatdan o'tish / Kirish";
            topBtn.onclick = cta;

            const nodes = [];
            // Hero
            const hero = el('section', 'relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br ' + th.grad + ' to-transparent p-8 sm:p-14 text-center sm:text-left');
            const hi = el('div', 'flex flex-col sm:flex-row items-center gap-8');
            const ic = el('div', 'w-24 h-24 shrink-0 rounded-3xl border flex items-center justify-center text-5xl ' + th.soft + ' ' + th.text);
            ic.appendChild(el('i', 'fa-solid ' + pg.icon));
            hi.appendChild(ic);
            const ht = el('div', 'space-y-4');
            ht.appendChild(el('span', 'inline-block text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full border ' + th.soft + ' ' + th.text, pg.badge));
            const h1 = el('h1', 'text-3xl sm:text-5xl font-extrabold tracking-tight text-white', pg.title);
            h1.id = 'rp-title';
            ht.appendChild(h1);
            ht.appendChild(el('p', 'text-slate-300 text-lg max-w-2xl leading-relaxed', pg.lead));
            const hb = el('button', 'px-7 py-3.5 rounded-2xl font-extrabold transition shadow-xl ' + th.btn, own ? "Kabinetga o'tish" : "Ro'yxatdan o'tish / Kirish");
            hb.type = 'button';
            hb.addEventListener('click', cta);
            ht.appendChild(hb);
            hi.appendChild(ht);
            hero.appendChild(hi);
            nodes.push(hero);

            const section = function (icon, title, sub, tone, items, numbered) {
                const sec = el('section', 'space-y-8');
                const head = el('div', 'space-y-2 text-center sm:text-left');
                const badge = el('div', 'inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest ' + tone.text);
                badge.appendChild(el('i', 'fa-solid ' + icon));
                badge.appendChild(el('span', '', sub));
                head.appendChild(badge);
                head.appendChild(el('h2', 'text-2xl sm:text-4xl font-extrabold text-white tracking-tight', title));
                sec.appendChild(head);
                const grid = el('div', 'grid grid-cols-1 ' + (items.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2') + ' gap-5');
                items.forEach(function (it, i) {
                    const c = el('div', 'glass rounded-3xl border p-6 space-y-3 transition duration-300 hover:-translate-y-1 ' + tone.card);
                    const row = el('div', 'flex items-center gap-3');
                    const bi = el('div', 'w-11 h-11 rounded-2xl flex items-center justify-center text-lg shrink-0 ' + tone.icon);
                    bi.appendChild(el('i', 'fa-solid ' + it[0]));
                    row.appendChild(bi);
                    row.appendChild(el('h3', 'font-extrabold text-white leading-snug', it[1]));
                    if (numbered) row.appendChild(el('span', ['ml-auto text-xs font-black px-2.5 py-1 rounded-full', tone.icon].join(' '), String(i + 1)));
                    c.appendChild(row);
                    c.appendChild(el('p', 'text-sm text-slate-400 leading-relaxed', it[2]));
                    grid.appendChild(c);
                });
                sec.appendChild(grid);
                return sec;
            };
            nodes.push(section('fa-triangle-exclamation', 'Avval qanday edi?', 'Oldingi muammolar', { text: 'text-rose-400', card: 'border-rose-500/15 hover:border-rose-500/40', icon: 'bg-rose-500/15 text-rose-300' }, pg.problems));
            nodes.push(section('fa-circle-check', 'AgrarGo foydalari va yechimlari', 'Endi esa', { text: th.text, card: 'border-emerald-500/15 hover:border-emerald-500/40', icon: 'bg-emerald-500/15 text-emerald-300' }, pg.solutions));
            nodes.push(section('fa-rocket', 'Kelajak rejalari', 'Tez orada', { text: 'text-sky-400', card: 'border-sky-500/15 hover:border-sky-500/40', icon: 'bg-sky-500/15 text-sky-300' }, pg.future, true));

            const rev = el('section', 'space-y-8 scroll-mt-24');
            rev.id = 'rp-reviews';
            const rh = el('div', 'space-y-2 text-center sm:text-left');
            const rb = el('div', 'inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-purple-400');
            rb.appendChild(el('i', 'fa-solid fa-star'));
            rb.appendChild(el('span', '', 'Baholash va sharhlar'));
            rh.appendChild(rb);
            rh.appendChild(el('h2', 'text-2xl sm:text-4xl font-extrabold text-white tracking-tight', 'Foydalanuvchilar fikri'));
            rev.appendChild(rh);
            const list = el('div', 'space-y-6');
            list.id = 'rp-review-list';
            rev.appendChild(list);
            const formBox = el('div');
            formBox.id = 'rp-review-form';
            rev.appendChild(formBox);
            nodes.push(rev);

            rpContent.replaceChildren.apply(rpContent, nodes);
            rolePage.classList.add('open');
            rolePage.setAttribute('aria-hidden', 'false');
            rolePage.scrollTo({ top: 0 });
            syncScrollLock();
            startRoleBg(role);
            if (location.hash !== '#role-' + pg.slug) { try { history.replaceState(null, '', '#role-' + pg.slug); } catch (e) {} }
            renderRoleReviews(role);
            renderReviewForm(role);
            if (toForm) setTimeout(function () { const f = document.getElementById('rp-review-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 450);
        }

        function closeRolePage() {
            rolePage.classList.remove('open');
            rolePage.setAttribute('aria-hidden', 'true');
            rpRole = null;
            stopRoleBg();
            syncScrollLock();
            if (/^#role-/.test(location.hash)) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
        }

        // Rolga mos "Ro'yxatdan o'tish / Kirish" harakati (mavjud kirish oqimi)
        function roleCta(role) {
            closeRolePage();
            chooseRole(role);
        }

        async function renderRoleReviews(role) {
            const list = document.getElementById('rp-review-list');
            if (!list || rpRole !== role) return;
            if (!list.childNodes.length) {
                const g = el('div', 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5');
                reviewSkeletonCards(3).forEach(function (c) { g.appendChild(c); });
                list.appendChild(g);
            }
            let data;
            try { data = await fetchReviews(role, rpReviewLimit); }
            catch (e) { if (!list.childNodes.length) list.replaceChildren(el('p', 'text-sm text-rose-300', "Sharhlarni yuklab bo'lmadi. Keyinroq urinib ko'ring.")); return; }
            if (rpRole !== role) return;
            const nodes = [buildRatingSummary(data.stats, role)];
            if (data.items.length) {
                const grid = el('div', 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5');
                data.items.forEach(function (r) { grid.appendChild(buildReviewCard(r, false)); });
                nodes.push(grid);
                if (data.stats.byRole[role].count > data.items.length) {
                    const more = el('button', 'mx-auto block px-6 py-2.5 rounded-xl border border-white/15 text-slate-200 font-bold text-sm hover:bg-white/10 transition', "Yana ko'rsatish");
                    more.type = 'button';
                    more.addEventListener('click', function () { rpReviewLimit = Math.min(50, rpReviewLimit + 6); renderRoleReviews(role); });
                    nodes.push(more);
                }
            } else nodes.push(el('p', 'text-center text-slate-400 text-sm', "Bu rol bo'yicha hali sharhlar yo'q. Birinchi bo'ling!"));
            list.replaceChildren.apply(list, nodes);
        }

        // --- Baholash formasi ---
        async function renderReviewForm(role) {
            const box = document.getElementById('rp-review-form');
            if (!box || rpRole !== role) return;
            const user = currentUser();
            const card = el('div', 'glass rounded-3xl border border-white/10 p-6 sm:p-8 space-y-5');
            card.appendChild(el('h3', 'text-xl font-extrabold text-white', 'Fikringizni qoldiring'));
            const info = function (text, btnText, fn) {
                card.appendChild(el('p', 'text-sm text-slate-300', text));
                if (btnText) {
                    const b = el('button', 'px-6 py-3 rounded-xl font-extrabold transition ' + RP_THEME[role].btn, btnText);
                    b.type = 'button';
                    b.addEventListener('click', fn);
                    card.appendChild(b);
                }
                box.replaceChildren(card);
            };
            if (!user) {
                return info("Sharh qoldirish uchun shu rol sifatida tizimga kiring yoki ro'yxatdan o'ting.", "Kirish / Ro'yxatdan o'tish", function () {
                    const known = isRoleKnown(role);
                    closeRolePage();
                    afterLoginAction = function () { openRolePage(role, true); };
                    openAuthModal(known ? 'login' : 'register', role);
                });
            }
            if (user.role !== role) {
                const mine = REVIEW_ROLES.indexOf(user.role) !== -1;
                return info(mine ? "Bu sahifada faqat shu rol vakillari sharh qoldira oladi. Siz boshqa rol sifatida kirgansiz." : "Sharhni faqat fermer, haydovchi va marketlar qoldira oladi.",
                    mine ? "O'z sahifamga o'tish" : null, function () { openRolePage(user.role, true); });
            }

            // O'zining sharhini yuklash (tahrirlash uchun)
            let existing = null;
            const token = storageGet(TOKEN_KEY);
            try { existing = (await apiRequest('GET', '/reviews/mine', undefined, token)).review; }
            catch (err) { if (err.status === 401) return handleSessionExpired(function () { openRolePage(role, true); }); }
            if (rpRole !== role) return;

            let rating = existing ? existing.rating : 0;
            const alertBox = el('div', 'hidden'); alertBox.setAttribute('role', 'alert');
            card.appendChild(alertBox);
            if (existing) {
                card.appendChild(el('p', 'text-xs font-semibold ' + (existing.isApproved ? 'text-emerald-300' : 'text-amber-300'),
                    existing.isApproved ? "Sizning sharhingiz saytda ko'rinib turibdi. Uni yangilashingiz mumkin." : 'Sharhingiz moderator tasdiqlashini kutmoqda.'));
            }
            const form = el('form', 'space-y-5');
            form.noValidate = true;
            const starsWrap = el('div', 'space-y-2');
            starsWrap.appendChild(el('label', 'block text-xs font-bold text-slate-300 uppercase tracking-wider', 'Baho'));
            const stars = el('div', 'flex gap-1.5 text-3xl');
            stars.setAttribute('role', 'radiogroup');
            stars.setAttribute('aria-label', 'Baho');
            const starBtns = [];
            const paintStars = function (hover) {
                const v = hover || rating;
                starBtns.forEach(function (b, i) {
                    b.firstChild.className = 'fa-solid fa-star ' + (i < v ? 'text-amber-400' : 'text-slate-600');
                    b.setAttribute('aria-checked', String(i + 1 === rating));
                    b.tabIndex = (rating ? i + 1 === rating : i === 0) ? 0 : -1;
                });
            };
            for (let i = 1; i <= 5; i++) {
                const b = el('button', 'star-btn');
                b.type = 'button';
                b.setAttribute('role', 'radio');
                b.setAttribute('aria-label', i + ' / 5');
                b.appendChild(el('i', 'fa-solid fa-star'));
                b.addEventListener('click', function () { rating = i; paintStars(); });
                b.addEventListener('mouseenter', function () { paintStars(i); });
                b.addEventListener('mouseleave', function () { paintStars(); });
                b.addEventListener('keydown', function (e) {
                    let next = null;
                    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(5, (rating || 0) + 1);
                    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(1, (rating || 2) - 1);
                    if (next) { e.preventDefault(); rating = next; paintStars(); starBtns[next - 1].focus(); }
                });
                starBtns.push(b);
                stars.appendChild(b);
            }
            paintStars();
            starsWrap.appendChild(stars);
            form.appendChild(starsWrap);

            const cwrap = el('div');
            const clab = el('label', 'block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5', 'Izohingiz');
            clab.htmlFor = 'review-comment';
            const ta = el('textarea', 'auth-input resize-none');
            ta.id = 'review-comment'; ta.rows = 4; ta.maxLength = 500;
            ta.placeholder = 'AgrarGo sizga qanday yordam berdi? Nimani yaxshilash mumkin?';
            ta.value = existing ? existing.comment : '';
            const counter = el('p', 'text-[11px] text-slate-500 mt-1.5 text-right');
            const count = function () { counter.textContent = ta.value.length + ' / 500'; };
            ta.addEventListener('input', count); count();
            cwrap.append(clab, ta, counter);
            form.appendChild(cwrap);

            const submit = el('button', 'auth-submit w-full sm:w-auto sm:px-10 font-extrabold py-3.5 rounded-2xl transition shadow-xl flex items-center justify-center gap-2.5 disabled:opacity-60 ' + RP_THEME[role].btn);
            submit.type = 'submit';
            submit.appendChild(el('i', 'fa-solid fa-paper-plane'));
            submit.appendChild(el('span', '', existing ? 'Sharhni yangilash' : 'Sharh yuborish'));
            const actions = el('div', 'flex flex-wrap items-center gap-3');
            actions.appendChild(submit);
            if (existing) {
                const del = el('button', 'px-5 py-3 rounded-2xl border border-rose-500/40 text-rose-300 font-bold text-sm hover:bg-rose-500/10 transition', "Sharhni o'chirish");
                del.type = 'button';
                del.addEventListener('click', async function () {
                    if (!window.confirm(T("Sharhingizni o'chirasizmi?"))) return;
                    try { await apiRequest('DELETE', '/reviews/mine', undefined, token); showToast("Sharh o'chirildi."); afterReviewChange(role); }
                    catch (err) { if (err.status === 401) return handleSessionExpired(function () { openRolePage(role, true); }); showToast(err.raw || err.messages[0], 5000); }
                });
                actions.appendChild(del);
            }
            form.appendChild(actions);
            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                hideAuthAlert(alertBox);
                const comment = ta.value.trim();
                const errors = [];
                if (!rating) errors.push('Iltimos, yulduzchalar bilan baho bering.');
                if (comment.length < 10) errors.push("Izoh kamida 10 ta belgidan iborat bo'lishi kerak.");
                if (errors.length) return showAuthAlert(errors, 'error', alertBox);
                setLoading(form, true);
                try {
                    const res = await apiRequest('POST', '/reviews', { rating: rating, comment: comment }, token);
                    showToast(res.isApproved ? "Rahmat! Sharhingiz saytda paydo bo'ldi." : "Rahmat! Sharhingiz moderator tasdiqlagach ko'rinadi.", 4500);
                    afterReviewChange(role);
                } catch (err) {
                    if (err.status === 401) return handleSessionExpired(function () { openRolePage(role, true); });
                    showAuthAlert(err.status === 429 ? "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." : err.messages, 'error', alertBox);
                } finally { setLoading(form, false); }
            });
            card.appendChild(form);
            box.replaceChildren(card);
        }

        function afterReviewChange(role) {
            if (reviewsChannel) { try { reviewsChannel.postMessage('changed'); } catch (e) {} }
            refreshLiveReviews(true);
            renderRoleReviews(role);
            renderReviewForm(role);
        }

        // Chuqur havola (#role-farmer) va Escape
        function routeRoleHash() {
            const m = /^#role-(farmer|driver|market)$/.exec(location.hash);
            if (m) { const role = m[1].toUpperCase(); if (rpRole !== role) openRolePage(role); }
            else if (rpRole) closeRolePage();
        }
        window.addEventListener('hashchange', routeRoleHash);
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' || !rolePage.classList.contains('open')) return;
            if (['auth-modal', 'wh-modal', 'booking-modal', 'payment-modal'].some(function (id) { return document.getElementById(id).classList.contains('open'); })) return;
            closeRolePage();
        });

        // ===== PWA: o'rnatish, oflayn holat, yangilanish =====
        let deferredInstall = null;
        const isStandalone = function () { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; };
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const PWA_DISMISS_KEY = 'agrargo_pwa_dismissed';
        const pwaDismissedRecently = function () { try { return Date.now() - Number(localStorage.getItem(PWA_DISMISS_KEY) || 0) < 7 * 86400000; } catch (e) { return false; } };

        function pwaNotice(id, icon, text, buttons) {
            const old = document.getElementById(id);
            if (old) old.remove();
            const box = el('div', 'fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-[24rem] z-[55] glass rounded-2xl border border-emerald-500/30 shadow-2xl shadow-black/50 p-4 space-y-3');
            box.id = id;
            box.setAttribute('role', 'status');
            const row = el('div', 'flex items-start gap-3');
            const ic = el('div', 'w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0');
            ic.appendChild(el('i', 'fa-solid ' + icon));
            row.appendChild(ic);
            row.appendChild(el('p', 'text-sm text-slate-200 leading-relaxed', text));
            box.appendChild(row);
            const act = el('div', 'flex gap-2 justify-end');
            buttons.forEach(function (b) {
                const x = el('button', 'px-4 py-2 rounded-xl text-sm font-extrabold transition ' + (b.primary ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'border border-white/15 text-slate-300 hover:bg-white/10'), b.label);
                x.type = 'button';
                x.addEventListener('click', function () { box.remove(); if (b.fn) b.fn(); });
                act.appendChild(x);
            });
            box.appendChild(act);
            document.body.appendChild(box);
        }

        function updateInstallUi() {
            const btn = document.getElementById('pwa-install-sidebar');
            if (btn) btn.style.display = !isStandalone() && (deferredInstall || isIos) ? 'flex' : 'none';
        }
        function dismissInstall() { try { localStorage.setItem(PWA_DISMISS_KEY, String(Date.now())); } catch (e) {} }
        function showInstallBanner() {
            if (isStandalone() || pwaDismissedRecently() || !(deferredInstall || isIos) || document.getElementById('pwa-banner')) return;
            pwaNotice('pwa-banner', 'fa-download', "AgrarGo ilovasini o'rnating: tezroq ochiladi va oflayn ham ishlaydi.", [
                { label: 'Keyinroq', fn: dismissInstall },
                { label: "O'rnatish", primary: true, fn: installApp }
            ]);
        }
        async function installApp() {
            if (sidebar.classList.contains('open')) toggleSidebar();
            if (deferredInstall) {
                const ev = deferredInstall;
                deferredInstall = null;
                try { ev.prompt(); const res = await ev.userChoice; if (res.outcome !== 'accepted') dismissInstall(); } catch (e) {}
                updateInstallUi();
            } else if (isIos) {
                pwaNotice('pwa-ios-help', 'fa-arrow-up-from-bracket', "Safari'da pastdagi «Ulashish» tugmasini bosing, so'ng «Bosh ekranga qo'shish» ni tanlang.", [{ label: 'Tushunarli', primary: true }]);
            } else showToast("Brauzer menyusidan «Ilovani o'rnatish» yoki «Bosh ekranga qo'shish» ni tanlang.", 5000);
        }
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault(); // brauzerning standart bannerini o'zimiz boshqaramiz
            deferredInstall = e;
            updateInstallUi();
            setTimeout(showInstallBanner, 5000);
        });
        window.addEventListener('appinstalled', function () {
            deferredInstall = null;
            const b = document.getElementById('pwa-banner'); if (b) b.remove();
            updateInstallUi();
            showToast("AgrarGo ilovasi o'rnatildi!", 4000);
        });
        if (isIos && !isStandalone()) setTimeout(showInstallBanner, 8000);
        updateInstallUi();

        // Oflayn indikator
        (function () {
            const pill = el('div', 'fixed top-3 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full bg-amber-500 text-slate-950 text-xs font-extrabold shadow-xl items-center gap-2');
            pill.id = 'offline-pill';
            pill.setAttribute('role', 'status');
            pill.appendChild(el('i', 'fa-solid fa-wifi'));
            pill.appendChild(el('span', '', "Oflayn rejim: ma'lumotlar yangilanmaydi"));
            pill.style.display = 'none';
            document.body.appendChild(pill);
            const sync = function () { pill.style.display = navigator.onLine ? 'none' : 'flex'; };
            window.addEventListener('offline', sync);
            window.addEventListener('online', function () { sync(); showToast('Aloqa tiklandi.', 2500); refreshLiveReviews(true); });
            sync();
        })();

        // Service Worker (faqat https yoki localhost'da ishlaydi)
        if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
            window.addEventListener('load', function () {
                const hadController = !!navigator.serviceWorker.controller;
                navigator.serviceWorker.register('sw.js').then(function (reg) {
                    reg.addEventListener('updatefound', function () {
                        const sw = reg.installing;
                        if (!sw) return;
                        sw.addEventListener('statechange', function () {
                            if (sw.state === 'installed' && hadController) {
                                pwaNotice('pwa-update', 'fa-rotate', 'AgrarGo yangi versiyasi tayyor. Yangilash uchun sahifani qayta yuklang.', [
                                    { label: 'Keyinroq' }, { label: 'Yangilash', primary: true, fn: function () { location.reload(); } }
                                ]);
                            }
                        });
                    });
                }).catch(function () { /* SW o'rnatilmasa sayt odatdagidek ishlaydi */ });
            });
        }


        // ===== UI/UX: bo'limlarga silliq o'tish, akkordeon, karusel, effektlar =====
        // Silliq skroll: yuqori menyu, sidebar, tarif tugmalari va footer havolalari
        function scrollToSection(sel, fromSidebar) {
            const target = document.querySelector(sel);
            if (!target) return;
            if (fromSidebar && sidebar.classList.contains('open')) toggleSidebar();
            if (rolePage && rolePage.classList.contains('open')) closeRolePage();
            const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
            try { history.replaceState(null, '', sel); } catch (e) {}
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
            target.classList.remove('sec-flash');
            void target.offsetWidth; // animatsiyani qayta ishga tushirish
            target.classList.add('sec-flash');
        }
        document.addEventListener('click', function (e) {
            const a = e.target.closest('[data-scroll]');
            if (!a) return;
            e.preventDefault();
            scrollToSection(a.getAttribute('data-scroll'), !!a.closest('#sidebar'));
        });

        // Yuqori menyuda hozirgi bo'lim ajratib ko'rsatiladi
        (function () {
            const links = Array.prototype.slice.call(document.querySelectorAll('.top-link[data-scroll]'));
            if (!links.length || !('IntersectionObserver' in window)) return;
            const map = {};
            links.forEach(function (l) { map[l.getAttribute('data-scroll')] = l; });
            const io = new IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                    if (!en.isIntersecting) return;
                    links.forEach(function (l) { l.classList.remove('active'); l.removeAttribute('aria-current'); });
                    const l = map['#' + en.target.id];
                    if (l) { l.classList.add('active'); l.setAttribute('aria-current', 'true'); }
                });
            }, { rootMargin: '-35% 0px -55% 0px' });
            Object.keys(map).forEach(function (sel) { const t = document.querySelector(sel); if (t) io.observe(t); });
        })();

        // "Tizim qanday ishlaydi?": rol tablari (klaviatura bilan ham)
        (function () {
            const tabs = Array.prototype.slice.call(document.querySelectorAll('.how-tab'));
            const select = function (tab, focus) {
                tabs.forEach(function (t) {
                    const on = t === tab;
                    t.classList.toggle('active', on);
                    t.setAttribute('aria-selected', String(on));
                    t.tabIndex = on ? 0 : -1;
                    const panel = document.getElementById('how-panel-' + t.dataset.how);
                    if (panel) panel.hidden = !on;
                });
                if (focus) tab.focus();
                if (window.AOS && AOS.refresh) AOS.refresh();
            };
            tabs.forEach(function (t, i) {
                t.addEventListener('click', function () { select(t); });
                t.addEventListener('keydown', function (e) {
                    const k = e.key;
                    if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); select(tabs[(i + (k === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true); }
                    else if (k === 'Home') { e.preventDefault(); select(tabs[0], true); }
                    else if (k === 'End') { e.preventDefault(); select(tabs[tabs.length - 1], true); }
                });
            });
        })();

        // FAQ akkordeon: bir vaqtda bitta savol ochiq
        (function () {
            const list = document.getElementById('faq-list');
            if (!list) return;
            list.addEventListener('click', function (e) {
                const btn = e.target.closest('.faq-q');
                if (!btn) return;
                const item = btn.closest('.faq-item');
                const open = !item.classList.contains('open');
                list.querySelectorAll('.faq-item.open').forEach(function (it) {
                    it.classList.remove('open');
                    it.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
                });
                if (open) { item.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
            });
        })();

        // Hamkorlar karuseli. Haqiqiy hamkor qo'shish: logo — rasm manzili (https:// yoki papka ichida), name va type matni
        const PARTNERS = [
            { name: 'Supermarket tarmog\'i', type: 'Chakana savdo', icon: 'fa-store' },
            { name: 'Logistika kompaniyasi', type: 'Yuk tashish', icon: 'fa-truck-fast' },
            { name: 'Sovutgichli omborlar', type: 'Saqlash va sovutish', icon: 'fa-snowflake' },
            { name: 'Agro-kooperativ', type: 'Fermerlar uyushmasi', icon: 'fa-wheat-awn' },
            { name: "To'lov xizmati", type: 'Xavfsiz to\'lovlar', icon: 'fa-credit-card' },
            { name: 'Sug\'urta kompaniyasi', type: 'Yuk sug\'urtasi', icon: 'fa-umbrella' },
            { name: 'Qadoqlash ishlab chiqaruvchisi', type: 'Qadoq va yorliqlar', icon: 'fa-box-open' },
            { name: 'Mobil aloqa operatori', type: 'Aloqa va SMS', icon: 'fa-tower-cell' }
        ];
        (function () {
            const track = document.getElementById('partners-track');
            if (!track) return;
            const build = function (p, hidden) {
                const card = el('div', 'partner');
                if (hidden) card.setAttribute('aria-hidden', 'true');
                const logo = el('div', 'partner-logo');
                if (p.logo && /^(https:\/\/|partners\/)/.test(p.logo)) {
                    const im = el('img'); im.src = p.logo; im.alt = ''; im.loading = 'lazy';
                    im.addEventListener('error', function () { im.remove(); logo.appendChild(el('i', 'fa-solid ' + p.icon)); });
                    logo.appendChild(im);
                } else logo.appendChild(el('i', 'fa-solid ' + p.icon));
                card.appendChild(logo);
                const txt = el('div', 'min-w-0');
                txt.appendChild(el('b', '', p.name));
                txt.appendChild(el('small', '', p.type));
                card.appendChild(txt);
                return card;
            };
            // Ikki nusxa: -50% siljish uzluksiz (sakrashsiz) takrorlanadi; ikkinchisi ekran o'qigichlardan yashirin
            PARTNERS.forEach(function (p) { track.appendChild(build(p, false)); });
            PARTNERS.forEach(function (p) { track.appendChild(build(p, true)); });
        })();

        // Kartalarda yorug'lik kursor ortidan yuradi (faqat sichqoncha bor qurilmalarda)
        if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            let fxRaf = 0;
            document.addEventListener('pointermove', function (e) {
                const card = e.target.closest && e.target.closest('.fx-card, .hover-glow');
                if (!card || fxRaf) return;
                fxRaf = requestAnimationFrame(function () {
                    fxRaf = 0;
                    const r = card.getBoundingClientRect();
                    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
                    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
                });
            }, { passive: true });

            // 3D logotip: sichqoncha tomon biroz og'adi
            const stage = document.querySelector('.logo-stage');
            const tilt = document.querySelector('.logo-tilt');
            if (stage && tilt) {
                const hero = stage.closest('header');
                hero.addEventListener('pointermove', function (e) {
                    const r = stage.getBoundingClientRect();
                    const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
                    const dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
                    tilt.style.transform = `rotateX(${(-dy * 16).toFixed(2)}deg) rotateY(${(dx * 22).toFixed(2)}deg)`;
                }, { passive: true });
                hero.addEventListener('pointerleave', function () { tilt.style.transform = ''; });
            }
        }

        document.body.classList.add('page-ready');


        // ===== UX: bo'sh holatlar, diagrammalar, 404 va onboarding =====

        // ----- Bo'sh holatlar: qora-emerald illyustratsiyalar (SVG) -----
        const EMPTY_DEFS = '<defs><linearGradient id="ea-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ee7b7"/><stop offset="1" stop-color="#059669"/></linearGradient>'
            + '<radialGradient id="ea-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#10B981" stop-opacity=".35"/><stop offset="1" stop-color="#10B981" stop-opacity="0"/></radialGradient></defs>'
            + '<circle class="pulse" cx="110" cy="80" r="70" fill="url(#ea-glow)"/><ellipse cx="110" cy="152" rx="72" ry="8" fill="rgba(16,185,129,.18)"/>';
        const GLASS = 'fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.22)" stroke-width="1.5"';
        const GLASS_ROUND = [GLASS, 'stroke-linejoin="round"'].join(' ');
        const EMPTY_ART = {
            listings: '<rect x="58" y="90" width="104" height="58" rx="11" ' + GLASS + '/><path d="M58 110h104M58 129h104" stroke="rgba(255,255,255,.14)" stroke-width="1.5"/>'
                + '<path d="M110 90V58" stroke="url(#ea-g)" stroke-width="4" stroke-linecap="round"/><path d="M110 72c-24-2-32-17-32-28 19 0 32 9 32 28z" fill="url(#ea-g)"/><path d="M110 62c21 0 32-15 32-26-19 0-32 9-32 26z" fill="url(#ea-g)" opacity=".8"/>'
                + '<circle cx="164" cy="64" r="15" fill="url(#ea-g)"/><path d="M164 56v16M156 64h16" stroke="#022c22" stroke-width="3.2" stroke-linecap="round"/>',
            shipments: '<rect x="36" y="72" width="82" height="52" rx="9" ' + GLASS + '/><path d="M118 86h28l17 19v19h-45z" fill="url(#ea-g)"/><path d="M126 91h16l11 13h-27z" fill="#022c22" opacity=".5"/>'
                + '<circle cx="66" cy="128" r="12" fill="#0f172a" stroke="#34d399" stroke-width="3"/><circle cx="66" cy="128" r="3.5" fill="#34d399"/><circle cx="143" cy="128" r="12" fill="#0f172a" stroke="#34d399" stroke-width="3"/><circle cx="143" cy="128" r="3.5" fill="#34d399"/>'
                + '<path d="M24 146h172" stroke="rgba(148,163,184,.4)" stroke-width="2.5" stroke-dasharray="10 8" stroke-linecap="round"/><path d="M178 52c-10 0-17 7-17 16 0 12 17 26 17 26s17-14 17-26c0-9-7-16-17-16z" fill="url(#ea-g)"/><circle cx="178" cy="68" r="6" fill="#022c22"/>',
            payments: '<rect x="48" y="66" width="112" height="76" rx="15" ' + GLASS + '/><path d="M48 86h112" stroke="rgba(255,255,255,.14)" stroke-width="1.5"/><rect x="124" y="98" width="46" height="26" rx="9" fill="rgba(16,185,129,.2)" stroke="#34d399" stroke-width="2"/><circle cx="138" cy="111" r="4.5" fill="#34d399"/>'
                + '<circle cx="150" cy="56" r="22" fill="url(#ea-g)"/><circle cx="150" cy="56" r="15" fill="none" stroke="#022c22" stroke-width="2.5" opacity=".6"/><path d="M141 56l7 7 12-13" stroke="#022c22" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
            warehouse: '<path d="M38 88L110 48l72 40v58H38z" ' + GLASS_ROUND + '/><path d="M38 88L110 48l72 40" fill="none" stroke="url(#ea-g)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
                + '<rect x="84" y="102" width="52" height="44" rx="5" fill="rgba(16,185,129,.16)" stroke="#34d399" stroke-width="2"/><path d="M84 116h52M84 130h52" stroke="#34d399" stroke-width="1.6" opacity=".7"/>'
                + '<rect x="148" y="124" width="22" height="22" rx="4" fill="url(#ea-g)" opacity=".9"/><rect x="50" y="128" width="22" height="18" rx="4" fill="url(#ea-g)" opacity=".7"/>',
            bookings: '<rect x="68" y="42" width="84" height="106" rx="13" ' + GLASS + '/><rect x="94" y="33" width="32" height="18" rx="7" fill="url(#ea-g)"/>'
                + '<path d="M82 74l6 6 10-11M82 100l6 6 10-11M82 126l6 6 10-11" fill="none" stroke="#34d399" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'
                + '<path d="M106 76h34M106 102h34M106 128h24" stroke="rgba(255,255,255,.3)" stroke-width="4" stroke-linecap="round"/>',
            search: '<circle cx="100" cy="76" r="34" ' + GLASS + '/><circle cx="100" cy="76" r="34" fill="none" stroke="url(#ea-g)" stroke-width="8"/><path d="M126 102l34 34" stroke="url(#ea-g)" stroke-width="11" stroke-linecap="round"/>'
                + '<path d="M86 70c4-8 14-10 22-5" stroke="rgba(255,255,255,.4)" stroke-width="3.5" stroke-linecap="round" fill="none"/>'
        };
        function emptyArt(kind) {
            const svg = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 165" class="empty-art" aria-hidden="true" focusable="false">' + EMPTY_DEFS + (EMPTY_ART[kind] || EMPTY_ART.search) + '</svg>', 'image/svg+xml').documentElement;
            return document.importNode(svg, true);
        }
        // o: { art, title, text, cta: { label, icon, fn }, secondary: { label, icon, fn }, compact }
        function emptyState(o) {
            const box = el('div', ['empty-state glass rounded-3xl border border-white/10 text-center px-6 space-y-5', o.compact ? 'empty-compact py-9' : 'py-14'].join(' '));
            box.appendChild(emptyArt(o.art));
            const txt = el('div', 'relative space-y-2 max-w-md mx-auto');
            txt.appendChild(el('h3', 'text-xl sm:text-2xl font-extrabold text-white', o.title));
            if (o.text) txt.appendChild(el('p', 'text-sm text-slate-400 leading-relaxed', o.text));
            box.appendChild(txt);
            if (o.cta || o.secondary) {
                const row = el('div', 'relative flex flex-wrap items-center justify-center gap-3 pt-1');
                if (o.cta) {
                    const b = el('button', 'cta-big');
                    b.type = 'button';
                    b.appendChild(el('i', 'fa-solid ' + (o.cta.icon || 'fa-plus')));
                    b.appendChild(el('span', '', o.cta.label));
                    b.addEventListener('click', o.cta.fn);
                    row.appendChild(b);
                }
                if (o.secondary) {
                    const s2 = el('button', 'cta-ghost');
                    s2.type = 'button';
                    s2.appendChild(el('i', 'fa-solid ' + (o.secondary.icon || 'fa-arrow-right')));
                    s2.appendChild(el('span', '', o.secondary.label));
                    s2.addEventListener('click', o.secondary.fn);
                    row.appendChild(s2);
                }
                box.appendChild(row);
            }
            return box;
        }
        const goCatalog = function () { closeDashboard(); scrollToMarket(); };

        // ----- Jonli raqamlar (statistika) -----
        function countUp(node, value) {
            const m = /^(\D*?)(\d[\d\s  ]*(?:[.,]\d+)?)(.*)$/.exec(String(value));
            const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (!m || reduce) { node.textContent = value; return; }
            const target = parseFloat(m[2].replace(/[\s  ]/g, '').replace(',', '.'));
            if (!isFinite(target) || target === 0 || target > 1e13) { node.textContent = value; return; }
            node.textContent = '';
            const pre = document.createTextNode(m[1]);
            const num = el('span', 'stat-num', formatNumber(0));
            const post = document.createTextNode(m[3]);
            node.append(pre, num, post);
            const t0 = performance.now(), dur = 900;
            const frac = /[.,]\d+$/.test(m[2]);
            const step = function (now) {
                if (!node.isConnected && now - t0 > 50) { return; }
                const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
                num.textContent = formatNumber(frac ? target * e : Math.round(target * e));
                if (k < 1) requestAnimationFrame(step);
                else node.textContent = value; // oxirida aniq asl matn
            };
            requestAnimationFrame(step);
        }

        // ----- Diagrammalar (Chart.js, lazy) -----
        let chartLibPromise = null;
        function loadChartLib() {
            if (window.Chart) return Promise.resolve(window.Chart);
            if (!chartLibPromise) chartLibPromise = loadScriptOnce('vendor/chart.umd.js').then(function () {
                const C = window.Chart;
                C.defaults.color = '#94a3b8';
                C.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
                C.defaults.font.weight = '600';
                C.defaults.borderColor = 'rgba(255,255,255,.07)';
                C.defaults.plugins.legend.labels.usePointStyle = true;
                C.defaults.plugins.legend.labels.boxWidth = 8;
                C.defaults.plugins.tooltip.backgroundColor = 'rgba(2,6,23,.94)';
                C.defaults.plugins.tooltip.borderColor = 'rgba(16,185,129,.4)';
                C.defaults.plugins.tooltip.borderWidth = 1;
                C.defaults.plugins.tooltip.padding = 12;
                C.defaults.plugins.tooltip.cornerRadius = 12;
                C.defaults.plugins.tooltip.titleColor = '#fff';
                return C;
            }).catch(function (e) { chartLibPromise = null; throw e; });
            return chartLibPromise;
        }
        let liveCharts = [];
        function destroyCharts() { liveCharts.forEach(function (c) { try { c.destroy(); } catch (e) {} }); liveCharts = []; }
        const CHART_COLORS = { emerald: '#10B981', teal: '#14b8a6', blue: '#3b82f6', amber: '#f59e0b', rose: '#f43f5e', purple: '#a855f7', slate: '#64748b', lime: '#84cc16' };
        const chartLocale = function () { const l = (window.I18N && I18N.lang) || 'uz'; return l === 'ru' ? 'ru-RU' : l === 'en' ? 'en-US' : 'uz-UZ'; };
        // Uzbek tilida brauzer oy nomini "M05" deb qaytaradi: o'zbekcha qisqa nomlar o'zimizda
        const UZ_MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
        const monthShort = function (d) { return ((window.I18N && I18N.lang) || 'uz') === 'uz' ? UZ_MONTHS[d.getMonth()] : d.toLocaleDateString(chartLocale(), { month: 'short' }); };
        function recentMonths(n) {
            const out = [], now = new Date();
            for (let i = n - 1; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                out.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: monthShort(d) });
            }
            return out;
        }
        const monthKey = function (iso) { const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
        function barGradient(ctx, c1, c2) {
            const a = ctx.chart.chartArea;
            if (!a) return c1;
            const g = ctx.chart.ctx.createLinearGradient(0, a.bottom, 0, a.top);
            g.addColorStop(0, c2); g.addColorStop(1, c1);
            return g;
        }
        // build(Chart) -> konfiguratsiya; hasData=false bo'lsa diagramma o'rniga qisqa izoh
        function chartCard(title, sub, hasData, build, opts) {
            opts = opts || {};
            const card = el('div', ['chart-card glass rounded-3xl border border-white/10 p-5', opts.cls || ''].join(' '));
            const head = el('div', 'space-y-0.5');
            head.appendChild(el('h3', 'font-extrabold text-white', title));
            if (sub) head.appendChild(el('p', 'text-xs text-slate-400', sub));
            card.appendChild(head);
            const box = el('div', 'chart-box' + (opts.tall ? ' tall' : ''));
            card.appendChild(box);
            if (hasData) {
                const bars = el('div', 'sk-bars absolute inset-0');
                bars.setAttribute('aria-hidden', 'true');
                [40, 68, 32, 82, 54, 92].forEach(function (h) { const b = sk(''); b.style.height = h + '%'; bars.appendChild(b); });
                box.appendChild(bars);
            }
            if (!hasData) {
                const e = el('div', 'chart-empty');
                e.appendChild(el('i', 'fa-solid fa-chart-simple text-2xl text-emerald-400/60'));
                e.appendChild(el('span', '', opts.emptyText || "Ma'lumot paydo bo'lishi bilan diagramma shu yerda ko'rinadi."));
                box.appendChild(e);
                return card;
            }
            const canvas = el('canvas');
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', title);
            box.appendChild(canvas);
            loadChartLib().then(function (Chart) {
                setTimeout(function () {
                    if (!canvas.isConnected) return;
                    const cfg = build(Chart);
                    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false }, cfg.options || {});
                    liveCharts.push(new Chart(canvas, cfg));
                    const ph = box.querySelector('.sk-bars'); if (ph) ph.remove();
                }, 30);
            }).catch(function () {
                box.replaceChildren(el('div', 'chart-empty', "Diagrammani yuklab bo'lmadi."));
            });
            return card;
        }
        const moneyShort = function (v) {
            v = Number(v);
            if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1).replace('.', ',') + ' mlrd';
            if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' mln';
            if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + ' ming';
            return String(Math.round(v));
        };
        function barChartCard(title, sub, labels, datasets, opts) {
            opts = opts || {};
            const has = datasets.some(function (d) { return d.data.some(function (v) { return v > 0; }); });
            return chartCard(title, sub, has, function () {
                return {
                    type: 'bar',
                    data: { labels: labels, datasets: datasets.map(function (d, i) {
                        const col = d.color || CHART_COLORS.emerald;
                        return { label: T(d.label), data: d.data, borderRadius: 8, borderSkipped: false, maxBarThickness: 38,
                            backgroundColor: function (ctx) { return barGradient(ctx, col, col + '55'); }, hoverBackgroundColor: col };
                    }) },
                    options: {
                        interaction: { mode: 'index', intersect: false },
                        plugins: { legend: { display: datasets.length > 1 }, tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + (opts.fmt ? opts.fmt(c.parsed.y) : formatNumber(c.parsed.y)); } } } },
                        scales: { x: { stacked: !!opts.stacked, grid: { display: false } }, y: { stacked: !!opts.stacked, beginAtZero: true, ticks: { callback: function (v) { return opts.axis ? opts.axis(v) : formatNumber(v); }, maxTicksLimit: 6 } } }
                    }
                };
            }, opts);
        }
        // Doughnut: items = [[yorliq, qiymat, rang]]
        function doughnutCard(title, sub, items, opts) {
            opts = opts || {};
            const shown = items.filter(function (x) { return x[1] > 0; });
            const total = shown.reduce(function (s, x) { return s + x[1]; }, 0);
            return chartCard(title, sub, shown.length > 0, function () {
                return {
                    type: 'doughnut',
                    data: { labels: shown.map(function (x) { return T(x[0]); }), datasets: [{ data: shown.map(function (x) { return x[1]; }), backgroundColor: shown.map(function (x) { return x[2]; }), borderColor: 'rgba(2,6,23,.9)', borderWidth: 3, hoverOffset: 10 }] },
                    options: {
                        cutout: '66%',
                        plugins: { legend: { position: 'bottom', labels: { padding: 14 } },
                            tooltip: { callbacks: { label: function (c) { return ' ' + c.label + ': ' + (opts.fmt ? opts.fmt(c.parsed) : formatNumber(c.parsed)) + ' (' + Math.round(c.parsed / total * 100) + '%)'; } } } }
                    }
                };
            }, opts);
        }
        // Savdo/xarid oylik qatorlari (to'lovlardan): rol bo'yicha farmerAmount yoki amount
        function monthlyFromPayments(list, statuses, dateField, pick) {
            const months = recentMonths(6), sums = {};
            list.forEach(function (p) {
                if (statuses.indexOf(p.status) === -1 || !p[dateField]) return;
                const k = monthKey(p[dateField]);
                sums[k] = (sums[k] || 0) + Number(pick(p));
            });
            return { labels: months.map(function (m) { return m.label; }), data: months.map(function (m) { return sums[m.key] || 0; }) };
        }
        const BOOKING_COLORS = [['Kutilmoqda', 'PENDING', CHART_COLORS.amber], ['Tasdiqlangan', 'APPROVED', CHART_COLORS.emerald], ['Rad etilgan', 'REJECTED', CHART_COLORS.rose], ['Bekor qilingan', 'CANCELLED', CHART_COLORS.slate]];
        const bookingSlices = function (counter) { return BOOKING_COLORS.map(function (b) { return [b[0], counter(b[1]), b[2]]; }); };
        const WH_ORDER_COLORS = [['Kutilmoqda', 'PENDING', CHART_COLORS.amber], ["Yig'ilmoqda", 'PICKING', CHART_COLORS.blue], ["Yig'ildi", 'PICKED', CHART_COLORS.purple], ["Yo'lda", 'DISPATCHED', CHART_COLORS.teal], ['Yetkazildi', 'DELIVERED', CHART_COLORS.emerald], ['Bekor qilindi', 'CANCELLED', CHART_COLORS.slate]];

        // Fermer / market kabinetidagi diagrammalar bloki
        async function buildRoleCharts(role, bookings) {
            const safe = function (p) { return p.catch(function (e) { if (e.status === 401) throw e; return null; }); };
            const wrap = el('div', 'grid grid-cols-1 lg:grid-cols-3 gap-4');
            const pays = (await safe(authed('GET', '/payments'))) || [];
            if (role === 'FARMER') {
                const items = (await safe(authed('GET', '/warehouse/items/mine?limit=50'))) || { items: [] };
                const mo = monthlyFromPayments(pays, ['RELEASED'], 'releasedAt', function (p) { return p.farmerAmount != null ? p.farmerAmount : p.amount; });
                wrap.appendChild(barChartCard('Oylik savdolar', "So'nggi 6 oy: hisobingizga o'tgan mablag'", mo.labels, [{ label: 'Savdo summasi', data: mo.data }], { fmt: money, axis: moneyShort, cls: 'lg:col-span-2', emptyText: "Birinchi savdo amalga oshgach oylik diagramma shu yerda ko'rinadi." }));
                wrap.appendChild(doughnutCard('Bronlar taqsimoti', 'Holat bo\'yicha', bookingSlices(function (st) { return bookings.filter(function (b) { return b.status === st; }).length; })));
                const zones = WH_ZONE_ORDER.map(function (z) { return [WH_ZONES[z].label, items.items.filter(function (it) { return it.zone === z && it.status !== 'REJECTED'; }).reduce(function (s, it) { return s + Number(it.weightKg || 0); }, 0), [CHART_COLORS.blue, CHART_COLORS.emerald, CHART_COLORS.amber, CHART_COLORS.purple][WH_ZONE_ORDER.indexOf(z)] || CHART_COLORS.teal]; });
                wrap.appendChild(doughnutCard('Ombor qoldiqlari', 'Zonalar bo\'yicha, kg', zones, { fmt: kg, cls: 'lg:col-span-3', emptyText: "Omborga yuk yuborganingizda qoldiqlar shu yerda ko'rinadi." }));
            } else {
                const orders = (await safe(authed('GET', '/warehouse/orders/mine'))) || [];
                const paid = monthlyFromPayments(pays, ['RELEASED'], 'releasedAt', function (p) { return p.amount; });
                const held = monthlyFromPayments(pays, ['HELD'], 'heldAt', function (p) { return p.amount; });
                wrap.appendChild(barChartCard('Oylik xaridlar', "So'nggi 6 oy: to'langan va Escrow'dagi summa", paid.labels, [{ label: "To'langan", data: paid.data, color: CHART_COLORS.emerald }, { label: "Escrow'da", data: held.data, color: CHART_COLORS.blue }], { fmt: money, axis: moneyShort, stacked: true, cls: 'lg:col-span-2', emptyText: "Birinchi xarid amalga oshgach oylik diagramma shu yerda ko'rinadi." }));
                wrap.appendChild(doughnutCard('Bronlar taqsimoti', "Holat bo'yicha", bookingSlices(function (st) { return bookings.filter(function (b) { return b.status === st; }).length; })));
                wrap.appendChild(doughnutCard('Ombor buyurtmalari', "Holat bo'yicha", WH_ORDER_COLORS.map(function (c) { return [c[0], orders.filter(function (o) { return o.status === c[1]; }).length, c[2]]; }), { cls: 'lg:col-span-3', emptyText: "Omborxonadan buyurtma berganingizda taqsimot shu yerda ko'rinadi." }));
            }
            return wrap;
        }

        // Admin: platforma bo'yicha diagrammalar
        function buildAdminCharts(s) {
            const wrap = el('div', 'grid grid-cols-1 lg:grid-cols-3 gap-4');
            const months = recentMonths(6);
            const monthly = (s.monthly || []).map(function (m, i) { return { label: months[i] ? months[i].label : m.month, sales: Number(m.sales), bookings: m.bookings }; });
            const has = monthly.some(function (m) { return m.sales > 0 || m.bookings > 0; });
            wrap.appendChild(chartCard('Oylik savdolar va bronlar', "Chiqarilgan to'lovlar (ustun) va yangi bronlar soni (chiziq)", has, function () {
                return {
                    data: {
                        labels: monthly.map(function (m) { return m.label; }),
                        datasets: [
                            { type: 'bar', label: T('Savdo summasi'), data: monthly.map(function (m) { return m.sales; }), borderRadius: 8, borderSkipped: false, maxBarThickness: 42, yAxisID: 'y',
                                backgroundColor: function (ctx) { return barGradient(ctx, CHART_COLORS.emerald, CHART_COLORS.emerald + '44'); } },
                            { type: 'line', label: T('Bronlar soni'), data: monthly.map(function (m) { return m.bookings; }), yAxisID: 'y1', borderColor: CHART_COLORS.amber, backgroundColor: CHART_COLORS.amber, tension: .35, pointRadius: 4, pointHoverRadius: 7, borderWidth: 3 }
                        ]
                    },
                    options: {
                        interaction: { mode: 'index', intersect: false },
                        plugins: { tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + (c.dataset.yAxisID === 'y' ? money(c.parsed.y) : formatNumber(c.parsed.y)); } } } },
                        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, position: 'left', ticks: { callback: moneyShort, maxTicksLimit: 6 } }, y1: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { precision: 0, maxTicksLimit: 6 } } }
                    }
                };
            }, { cls: 'lg:col-span-2', tall: true }));
            const n = function (o, k) { return (o && o[k]) || 0; };
            wrap.appendChild(doughnutCard('Bronlar taqsimoti', "Holat bo'yicha", bookingSlices(function (st) { return n(s.bookings, st); }), { tall: true }));
            wrap.appendChild(barChartCard("Ombor qoldig'i", 'Zonalar bo\'yicha, kg', s.warehouse.byZone.map(function (z) { return T(WH_ZONES[z.zone].label); }), [{ label: 'Qoldiq (kg)', data: s.warehouse.byZone.map(function (z) { return Number(z.weightKg); }), color: CHART_COLORS.teal }], { fmt: kg, cls: 'lg:col-span-2', emptyText: "Omborga yuk qabul qilinganda qoldiqlar shu yerda ko'rinadi." }));
            wrap.appendChild(doughnutCard('Foydalanuvchilar', "Rollar bo'yicha", Object.keys(ADM_ROLE_LABEL).map(function (r, i) { return [ADM_ROLE_LABEL[r], n(s.users.byRole, r), [CHART_COLORS.emerald, CHART_COLORS.amber, CHART_COLORS.blue, CHART_COLORS.purple, CHART_COLORS.rose][i]]; })));
            return wrap;
        }

        // ----- 404: mavjud bo'lmagan havola -----
        const notFoundView = document.getElementById('not-found');
        function showNotFound() {
            if (notFoundView.classList.contains('open')) return;
            notFoundView.classList.add('open');
            notFoundView.setAttribute('aria-hidden', 'false');
            syncScrollLock();
            const b = document.getElementById('nf-home');
            if (b) setTimeout(function () { b.focus({ preventScroll: true }); }, 350);
        }
        function closeNotFound(toHash) {
            notFoundView.classList.remove('open');
            notFoundView.setAttribute('aria-hidden', 'true');
            syncScrollLock();
            // Noto'g'ri yo'l/hash olib tashlanadi (qayta 404 chiqmasligi uchun)
            try { history.replaceState(null, '', (location.pathname.replace(/[^\/]*$/, '') || '/') + location.search); } catch (e) {}
            if (toHash) scrollToSection(toHash); // ikki silliq skrollni aralashtirmaslik uchun faqat bittasi
            else window.scrollTo({ top: 0 });
        }
        // Noma'lum #havola yoki noto'g'ri yo'l (SPA qayta yo'naltirish bo'lgan hostingda) 404 ko'rsatadi
        function isUnknownRoute() {
            const path = location.pathname;
            if (!/(\/|\/index\.html)$/.test(path)) return true;
            const h = location.hash;
            if (!h || h === '#') return false;
            if (/^#role-(farmer|driver|market)$/.test(h)) return false;
            let id; try { id = decodeURIComponent(h.slice(1)); } catch (e) { return true; }
            return !document.getElementById(id);
        }
        function routeNotFound() {
            if (isUnknownRoute()) showNotFound();
            else if (notFoundView.classList.contains('open')) { notFoundView.classList.remove('open'); notFoundView.setAttribute('aria-hidden', 'true'); syncScrollLock(); }
        }
        window.addEventListener('hashchange', routeNotFound);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && notFoundView.classList.contains('open')) closeNotFound(); });

        // ----- Onboarding: birinchi kirishdagi interaktiv tur -----
        const TOUR_KEY = 'agrargo_tour_v1_';
        const tabStep = function (tab, title, text) { return { sel: '.dash-tab[data-tab="' + tab + '"]', title: title, text: text }; };
        const TOUR_STEPS = {
            FARMER: [
                { sel: '#dash-content [data-tour="primary"]', title: "1. Bu yerdan e'lon qo'shasiz", text: "Mahsulot turi, miqdori va narxini kiriting: do'konlar e'loningizni darhol ko'radi." },
                tabStep('bookings', "2. Bronlarni shu yerda tasdiqlaysiz", "Market bron qilganda xabar keladi. Tasdiqlagach yuk tashish buyurtmasi avtomatik yaratiladi."),
                tabStep('shipments', '3. Bu yerdan yuklaringizni kuzatasiz', "Haydovchi, yuk holati va jonli xarita shu bo'limda."),
                tabStep('payments', "4. To'lovlar va Escrow", "Xaridor puli xavfsiz saqlanadi va yuk yetkazilgach hisobingizga o'tadi."),
                tabStep('warehouse', '5. Omborxona', "Hosilni sifat nazorati bilan saqlang va narx ko'tarilganda soting."),
                tabStep('profile', '6. Profil va Telegram', "Ma'lumotlaringizni yangilang va Telegram botni ulab, xabarnomalarni oling.")
            ],
            MARKET: [
                { sel: '#dash-content [data-tour="primary"]', title: '1. Bu yerdan mahsulot tanlaysiz', text: "Katalogda fermerlarning e'lonlarini ko'ring, filtrlang va bron qiling." },
                tabStep('bookings', '2. Bronlaringiz shu yerda', "Barcha bronlar, ularning holati va fermer aloqa ma'lumotlari."),
                tabStep('shipments', '3. Bu yerdan yuklarni kuzatasiz', "Yuk yo'lga chiqqach jonli xaritada ko'rasiz."),
                tabStep('payments', '4. Xavfsiz to\'lov (Escrow)', "Pul yuk yetkazilguncha muzlatiladi va qabul qilganingizdan keyin fermerga o'tadi."),
                tabStep('warehouse', '5. Omborxonadan buyurtma', "Saralangan va shtrix-kodli mahsulotlarni to'g'ridan-to'g'ri ombordan oling."),
                tabStep('profile', '6. Profil va Telegram', "Telegram botni ulab, bron va yuk holati xabarlarini oling.")
            ],
            DRIVER: [
                { sel: '#dash-content [data-tour="primary"]', title: "1. Bu yerdan yuklarni ko'rasiz", text: "Hududingizdagi to'lovi kafolatlangan yuklar ro'yxati." },
                tabStep('myloads', "2. Mening yuklarim", "Qabul qilgan yuklaringiz, yo'lga chiqish va yetkazish tugmalari shu yerda."),
                tabStep('eld', '3. Harakat jurnali (ELD)', "GPS orqali yozilgan haydash va dam olish vaqtlari."),
                tabStep('profile', '4. Profil', "Transport ma'lumotlari va Telegram xabarnomalar.")
            ],
            DISPATCHER: [
                tabStep('whboard', '1. Ombor zonalari', "Yukni qabul qilish, tekshirish, saqlash va jo'natish zonalari bo'yicha boshqaring."),
                tabStep('whunits', '2. Kameralar', "Harorat va namlik ko'rsatkichlarini kuzating."),
                tabStep('whorders', '3. Buyurtmalar', "Market buyurtmalarini yig'ing, haydovchi biriktiring va jo'nating."),
                tabStep('whinventory', '4. Inventarizatsiya', "Qoldiq va muddati yaqin yuklar hisobi.")
            ],
            ADMIN: [
                tabStep('adm-dashboard', '1. Boshqaruv paneli', "Platforma bo'yicha statistika va diagrammalar."),
                tabStep('adm-users', '2. Foydalanuvchilar', "Akkauntlarni qidirish, tahrirlash va bloklash."),
                tabStep('adm-reviews', '3. Sharhlar', "Spam yoki nomaqbul sharhlarni yashirish va o'chirish."),
                tabStep('adm-settings', '4. Sayt sozlamalari', "Aloqa, ijtimoiy tarmoqlar va omborxona joylashuvi.")
            ]
        };
        const tourState = { steps: [], i: 0, user: null, active: false };
        const tourSeen = function (u) { try { return localStorage.getItem(TOUR_KEY + u.id) === '1'; } catch (e) { return true; } };
        const tourMark = function (u) { try { localStorage.setItem(TOUR_KEY + u.id, '1'); } catch (e) {} };
        function maybeStartTour(user) {
            if (!user || tourSeen(user) || tourState.active || !dashboardView.classList.contains('open')) return;
            startTour(user);
        }
        function replayTour() {
            const user = currentUser();
            if (!user) return;
            closeAccountMenu();
            if (!dashboardView.classList.contains('open')) openDashboard();
            setTimeout(function () { startTour(user); }, 900);
        }
        function tourVisible(sel) {
            const n = document.querySelector(sel);
            if (!n) return null;
            const r = n.getBoundingClientRect();
            return r.width > 0 && r.height > 0 ? n : null;
        }
        function startTour(user) {
            if (tourState.active) return;
            const list = TOUR_STEPS[user.role] || [];
            const steps = [{ title: T('Xush kelibsiz, {0}!', user.fullName.split(' ')[0]), text: T("AgrarGo kabinetiga xush kelibsiz. 1 daqiqada asosiy bo'limlarni ko'rsatamiz."), raw: true }]
                .concat(list.filter(function (s) { return tourVisible(s.sel); }))
                .concat([{ title: T('Hammasi tayyor!'), text: T("Qo'llanmani istalgan payt hisob menyusidagi \"Qo'llanma\" tugmasi orqali qayta ko'rishingiz mumkin."), raw: true }]);
            tourState.steps = steps; tourState.i = 0; tourState.user = user; tourState.active = true;
            let layer = document.getElementById('tour-layer');
            if (!layer) {
                layer = el('div'); layer.id = 'tour-layer'; layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true'); layer.setAttribute('aria-label', 'Qo\'llanma');
                layer.innerHTML = '<div class="tour-dim"></div><div class="tour-spot center"></div><div class="tour-tip" aria-live="polite"></div>';
                document.body.appendChild(layer);
                window.addEventListener('resize', tourReposition);
                dashboardView.addEventListener('scroll', tourReposition, { passive: true });
                document.addEventListener('keydown', tourKeys);
            }
            layer.hidden = false;
            showTourStep(0);
        }
        function finishTour(skipped) {
            if (!tourState.active) return;
            tourMark(tourState.user);
            tourState.active = false;
            const layer = document.getElementById('tour-layer');
            if (layer) layer.hidden = true;
            const tip = layer && layer.querySelector('.tour-tip'); if (tip) tip.classList.remove('show');
            if (!skipped) showToast('Qo\'llanma yakunlandi. Muvaffaqiyatlar!', 3000);
        }
        function tourKeys(e) {
            if (!tourState.active) return;
            if (e.key === 'Escape') { e.preventDefault(); finishTour(true); }
            else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (e.target.closest && e.target.closest('.tour-back, .tour-skip')) return; e.preventDefault(); showTourStep(tourState.i + 1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); showTourStep(tourState.i - 1); }
        }
        function showTourStep(i) {
            const steps = tourState.steps;
            if (i >= steps.length) return finishTour(false);
            if (i < 0) i = 0;
            tourState.i = i;
            const s = steps[i];
            const layer = document.getElementById('tour-layer');
            const tip = layer.querySelector('.tour-tip');
            tip.classList.remove('show');
            const last = i === steps.length - 1;
            tip.replaceChildren();
            tip.appendChild(el('div', 'tour-step', T('{0} / {1}', i + 1, steps.length)));
            tip.appendChild(el('h4', '', s.raw ? s.title : T(s.title)));
            tip.appendChild(el('p', '', s.raw ? s.text : T(s.text)));
            const dots = el('div', 'tour-dots');
            steps.forEach(function (_, k) { dots.appendChild(el('i', k === i ? 'on' : '')); });
            tip.appendChild(dots);
            const act = el('div', 'tour-actions');
            const skip = el('button', 'tour-skip', last ? '' : 'O\'tkazib yuborish'); skip.type = 'button';
            if (last) skip.style.visibility = 'hidden';
            skip.addEventListener('click', function () { finishTour(true); });
            const right = el('div', 'flex gap-2');
            if (i > 0) { const back = el('button', 'tour-btn tour-back', 'Orqaga'); back.type = 'button'; back.addEventListener('click', function () { showTourStep(i - 1); }); right.appendChild(back); }
            const next = el('button', 'tour-btn tour-next', last ? 'Boshladik!' : 'Keyingi'); next.type = 'button';
            next.addEventListener('click', function () { showTourStep(i + 1); });
            right.appendChild(next);
            act.append(skip, right);
            tip.appendChild(act);
            const target = s.sel ? tourVisible(s.sel) : null;
            if (target) target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
            setTimeout(function () { tourReposition(); tip.classList.add('show'); next.focus({ preventScroll: true }); }, target ? 380 : 60);
        }
        function tourReposition() {
            if (!tourState.active) return;
            const s = tourState.steps[tourState.i];
            const layer = document.getElementById('tour-layer');
            const spot = layer.querySelector('.tour-spot'), tip = layer.querySelector('.tour-tip');
            const target = s.sel ? tourVisible(s.sel) : null;
            const vw = window.innerWidth, vh = window.innerHeight;
            const dock = vw <= 640;
            tip.classList.toggle('dock', dock);
            if (!target) {
                spot.classList.add('center');
                spot.style.cssText = 'top:' + (vh / 2) + 'px;left:' + (vw / 2) + 'px;width:0;height:0';
                if (!dock) { tip.style.top = Math.max(16, vh / 2 - tip.offsetHeight / 2) + 'px'; tip.style.left = Math.max(16, vw / 2 - tip.offsetWidth / 2) + 'px'; }
                return;
            }
            const r = target.getBoundingClientRect(), pad = 8;
            spot.classList.remove('center');
            spot.style.top = (r.top - pad) + 'px'; spot.style.left = (r.left - pad) + 'px';
            spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
            if (dock) return;
            const tw = tip.offsetWidth, th = tip.offsetHeight;
            let top = r.bottom + pad + 14;
            if (top + th > vh - 12) top = Math.max(12, r.top - pad - 14 - th);
            let left = r.left + r.width / 2 - tw / 2;
            left = Math.min(Math.max(12, left), vw - tw - 12);
            // yon tomonda joylashgan (vertikal menyu) elementlar: tooltip o'ng tomonga
            if (r.left < 260 && r.width < 280 && r.height < 80 && vw > 900) { left = r.right + pad + 16; top = Math.min(Math.max(12, r.top + r.height / 2 - th / 2), vh - th - 12); }
            tip.style.top = top + 'px'; tip.style.left = left + 'px';
        }


        // ===== Premium UX II =====

        // ----- Rol sahifalari: 10 soniyada almashadigan fon slayderi -----
        // Fayl nomlarida harf registriga e'tibor bering (Driver*.jpg bosh harf bilan)
        const ROLE_BG = {
            FARMER: ['images/farming.jpg', 'images/farming2.jpg', 'images/farming3.jpg', 'images/farming4.jpg', 'images/farming5.jpg', 'images/farming6.jpg'],
            MARKET: ['images/market.jpg', 'images/market2.jpg', 'images/market3.jpg', 'images/market4.jpg', 'images/market5.jpg', 'images/market6.jpg', 'images/market7.jpg'],
            DRIVER: ['images/Driver.jpg', 'images/Driver2.jpg', 'images/Driver3.jpg', 'images/Driver4.jpg', 'images/Driver5.jpg', 'images/Driver6.jpg', 'images/Driver7.jpg', 'images/Driver8.jpg', 'images/Driver9.jpg']
        };
        const ROLE_BG_INTERVAL = 10000;
        const roleBg = { timer: null, role: null, idx: 0, loaded: {} };
        function roleBgPreload(src) {
            return new Promise(function (resolve) {
                if (roleBg.loaded[src] !== undefined) return resolve(roleBg.loaded[src]);
                const im = new Image();
                im.onload = function () { roleBg.loaded[src] = true; resolve(true); };
                im.onerror = function () { roleBg.loaded[src] = false; resolve(false); };
                im.src = src;
            });
        }
        async function roleBgShow(role) {
            const list = ROLE_BG[role] || [];
            // Yuklanmagan (yo'q) rasm o'tkazib yuboriladi
            for (let tries = 0; tries < list.length; tries++) {
                const src = list[roleBg.idx % list.length];
                roleBg.idx++;
                if (!(await roleBgPreload(src))) continue;
                if (roleBg.role !== role) return; // sahifa yopilgan yoki boshqa rolga o'tilgan
                const layers = rolePage.querySelectorAll('.rp-bg-layer');
                const cur = rolePage.querySelector('.rp-bg-layer.on');
                const next = cur === layers[0] ? layers[1] : layers[0];
                next.style.backgroundImage = 'url("' + src + '")';
                next.classList.add('on');
                if (cur) cur.classList.remove('on');
                return;
            }
        }
        function stopRoleBg() { clearInterval(roleBg.timer); roleBg.timer = null; }
        function startRoleBg(role) {
            stopRoleBg();
            roleBg.role = role;
            roleBg.idx = Math.floor(Math.random() * (ROLE_BG[role] || [1]).length);
            rolePage.querySelectorAll('.rp-bg-layer').forEach(function (l) { l.classList.remove('on'); l.style.backgroundImage = ''; });
            roleBgShow(role);
            roleBg.timer = setInterval(function () { if (!document.hidden) roleBgShow(role); }, ROLE_BG_INTERVAL);
        }

        // ----- Skelet yuklanishlar (shisha, pulsatsiyalanuvchi) -----
        const sk = function (cls) { return el('div', ['sk', cls].join(' ')); };
        function skCardRow() {
            const c = el('div', 'sk-card');
            const top = el('div', 'flex items-center gap-4');
            top.appendChild(sk('sk-round w-12 h-12 shrink-0'));
            const lines = el('div', 'flex-1 grid gap-2');
            lines.appendChild(sk('h-4 w-2/3'));
            lines.appendChild(sk('h-3 w-1/3'));
            top.appendChild(lines);
            c.appendChild(top);
            c.appendChild(sk('h-3 w-full'));
            c.appendChild(sk('h-3 w-5/6'));
            const act = el('div', 'flex gap-3 pt-1');
            act.appendChild(sk('h-10 w-32'));
            act.appendChild(sk('h-10 w-24'));
            c.appendChild(act);
            return c;
        }
        function skStats(n) {
            const g = el('div', 'grid grid-cols-2 lg:grid-cols-4 gap-4');
            for (let i = 0; i < (n || 4); i++) {
                const c = el('div', 'sk-card');
                c.appendChild(sk('h-5 w-5'));
                c.appendChild(sk('h-8 w-3/4'));
                c.appendChild(sk('h-3 w-1/2'));
                g.appendChild(c);
            }
            return g;
        }
        function skChartTile(cls) {
            const c = el('div', ['sk-card', cls || ''].join(' '));
            c.appendChild(sk('h-4 w-1/3'));
            const bars = el('div', 'sk-bars h-52');
            [45, 70, 35, 85, 55, 95].forEach(function (h) { const b = sk(''); b.style.height = h + '%'; bars.appendChild(b); });
            c.appendChild(bars);
            return c;
        }
        function chartSkeletonGrid() {
            const g = el('div', 'grid grid-cols-1 lg:grid-cols-3 gap-4');
            g.appendChild(skChartTile('lg:col-span-2'));
            g.appendChild(skChartTile());
            return g;
        }
        function skeleton(kind) {
            const root = el('div', 'space-y-5');
            root.setAttribute('role', 'status');
            root.setAttribute('aria-busy', 'true');
            root.setAttribute('aria-label', T('Yuklanmoqda...'));
            const head = el('div', 'flex items-center justify-between gap-3');
            head.appendChild(sk('h-8 w-56'));
            head.appendChild(sk('h-10 w-28'));
            root.appendChild(head);
            if (kind === 'overview') {
                root.appendChild(skStats(4));
                root.appendChild(chartSkeletonGrid());
                root.appendChild(skCardRow());
            } else if (kind === 'grid') {
                const chips = el('div', 'flex gap-2 flex-wrap');
                for (let i = 0; i < 4; i++) chips.appendChild(sk(i % 2 ? 'sk-round h-9 w-28' : 'sk-round h-9 w-24'));
                root.appendChild(chips);
                const g = el('div', 'grid grid-cols-1 xl:grid-cols-2 gap-4');
                for (let i = 0; i < 4; i++) g.appendChild(skCardRow());
                root.appendChild(g);
            } else if (kind === 'table') {
                root.appendChild(skStats(4));
                const t = el('div', 'sk-card');
                for (let i = 0; i < 6; i++) {
                    const r = el('div', 'flex items-center gap-4');
                    r.appendChild(sk('sk-round w-9 h-9 shrink-0'));
                    r.appendChild(sk('h-4 flex-1'));
                    r.appendChild(sk('h-4 w-24 hidden sm:block'));
                    r.appendChild(sk('h-7 w-20'));
                    t.appendChild(r);
                }
                root.appendChild(t);
            } else {
                for (let i = 0; i < 3; i++) root.appendChild(skCardRow());
            }
            return root;
        }
        function skeletonKindFor(text) {
            if (/Ma'lumotlar yuklanmoqda/.test(text)) return 'overview';
            if (/^Yuklanmoqda/.test(text)) return 'table';
            if (/Omborxona|Tayyor mahsulot|Buyurtmalar|Ombor zonalari|Kameralar|Inventarizatsiya|Bo'sh yuklar/.test(text)) return 'grid';
            return 'list';
        }
        function reviewSkeletonCards(n) {
            const out = [];
            for (let i = 0; i < n; i++) {
                const c = el('div', 'sk-card');
                c.setAttribute('aria-hidden', 'true');
                c.appendChild(sk('h-4 w-24'));
                c.appendChild(sk('h-3 w-full'));
                c.appendChild(sk('h-3 w-5/6'));
                c.appendChild(sk('h-3 w-2/3'));
                const who = el('div', 'flex items-center gap-3 pt-3');
                who.appendChild(sk('sk-round w-11 h-11'));
                const l = el('div', 'grid gap-2 flex-1'); l.appendChild(sk('h-3 w-1/2')); l.appendChild(sk('h-3 w-1/3'));
                who.appendChild(l);
                c.appendChild(who);
                out.push(c);
            }
            return out;
        }

        // ----- Xarita belgilari: och yashil SVG pinlar (yuk mashinasi, omborxona, ferma, do'kon) -----
        const MARKER_GLYPHS = {
            warehouse: '<path d="M12 3 2 9v12h20V9L12 3zM8 11h8v2H8v-2zm0 4h8v2H8v-2z"/>',
            farm: '<path d="M12 3 3 9v12h18V9l-9-6zm0 3.2L18 10v9h-3v-5H9v5H6v-9l6-3.8z"/>',
            store: '<path d="M3 9 5 4h14l2 5v2a2.5 2.5 0 0 1-4.5 1.5 2.5 2.5 0 0 1-4.5 0A2.5 2.5 0 0 1 7.5 12.5 2.5 2.5 0 0 1 3 11V9zm2 5.5h14V20H5v-5.5z"/>'
        };
        const MARKER_DEFS = '<defs><linearGradient id="agm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bbf7d0"/><stop offset="1" stop-color="#34d399"/></linearGradient></defs>';
        function markerHtml(kind) {
            if (kind === 'truck') {
                return '<div class="agm-truck"><span class="agm-pulse"></span><svg viewBox="0 0 48 48" aria-hidden="true">' + MARKER_DEFS
                    + '<circle cx="24" cy="24" r="21" fill="url(#agm-g)" stroke="#ecfdf5" stroke-width="3"/><g transform="translate(11 11) scale(1.1)" fill="#022c22">'
                    + TRUCK_SVG.replace(/^<svg[^>]*>|<\/svg>$/g, '') + '</g></svg></div>';
            }
            return '<div class="agm"><svg viewBox="0 0 48 58" aria-hidden="true">' + MARKER_DEFS
                + '<path d="M24 56S4 37 4 22a20 20 0 0 1 40 0c0 15-20 34-20 34z" fill="url(#agm-g)" stroke="#ecfdf5" stroke-width="2.5" stroke-linejoin="round"/>'
                + '<circle cx="24" cy="22" r="13" fill="rgba(2,44,34,.16)"/><g transform="translate(12 10) scale(1)" fill="#022c22">' + (MARKER_GLYPHS[kind] || MARKER_GLYPHS.store) + '</g></svg></div>';
        }
        function markerIcon(L, kind) {
            return kind === 'truck'
                ? L.divIcon({ className: '', html: markerHtml('truck'), iconSize: [46, 46], iconAnchor: [23, 23] })
                : L.divIcon({ className: '', html: markerHtml(kind), iconSize: [44, 54], iconAnchor: [22, 52], tooltipAnchor: [0, -46] });
        }

        // ----- Suv to'lqini (ripple) -----
        (function () {
            const SEL = 'button.bg-emerald-500, button.bg-amber-400, button.bg-amber-500, button.bg-blue-500, button.bg-sky-500, .cta-big, .cta-ghost, .tour-btn, .auth-submit, .tariff-cta, .cover-btn, .fchip, .how-tab, .mp-chip, button[class*="border-white/15"], button[class*="border-emerald-500/"]';
            document.addEventListener('pointerdown', function (e) {
                if (e.button > 0) return;
                const btn = e.target.closest && e.target.closest(SEL);
                if (!btn || btn.disabled || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
                if (!btn.classList.contains('ripple-host')) {
                    btn.classList.add('ripple-host');
                    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
                }
                const r = btn.getBoundingClientRect();
                const size = Math.max(r.width, r.height) * 2.2;
                const dot = el('span', 'ripple');
                const solid = /bg-(emerald|amber|blue|sky)-[45]00|cta-big|tour-next|tariff-cta-primary|auth-submit/.test(btn.className);
                dot.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (e.clientX - r.left - size / 2) + 'px;top:' + (e.clientY - r.top - size / 2) + 'px;background:' + (solid ? 'rgba(255,255,255,.5)' : 'rgba(52,211,153,.35)');
                btn.appendChild(dot);
                dot.addEventListener('animationend', function () { dot.remove(); });
            }, { passive: true });
        })();

        // ----- Muvaffaqiyat animatsiyasi (check) -----
        function showSuccessCheck(title, sub, sound) {
            sfx.play(sound || 'success');
            const old = document.getElementById('success-burst');
            if (old) old.remove();
            const root = el('div');
            root.id = 'success-burst';
            root.setAttribute('role', 'status');
            const card = el('div', 'sb-card');
            card.style.position = 'relative';
            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('viewBox', '0 0 120 120');
            svg.setAttribute('class', 'sb-circle');
            svg.setAttribute('aria-hidden', 'true');
            svg.innerHTML = '<defs><linearGradient id="sb-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ee7b7"/><stop offset="1" stop-color="#059669"/></linearGradient></defs>'
                + '<circle class="fillc" cx="60" cy="60" r="46" fill="url(#sb-g)"/><circle class="ring" cx="60" cy="60" r="52" fill="none" stroke="#a7f3d0" stroke-width="4" stroke-linecap="round" transform="rotate(-90 60 60)"/>'
                + '<path class="tick" d="M38 62l15 15 30-33" fill="none" stroke="#022c22" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>';
            card.appendChild(svg);
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2, d = 70 + (i % 3) * 14;
                const s = el('i', 'sb-spark');
                s.style.left = 'calc(50% - 4px)'; s.style.top = '3.2rem';
                s.style.setProperty('--dx', Math.round(Math.cos(a) * d) + 'px');
                s.style.setProperty('--dy', Math.round(Math.sin(a) * d) + 'px');
                s.style.animationDelay = (0.55 + (i % 4) * 0.04) + 's';
                card.appendChild(s);
            }
            card.appendChild(el('div', 'sb-title', title));
            if (sub) card.appendChild(el('div', 'sb-sub', sub));
            root.appendChild(card);
            document.body.appendChild(root);
            setTimeout(function () { root.remove(); }, 2200);
        }

        // ----- Profil muqovasi (cover banner) -----
        const COVER_ROLES = ['FARMER', 'MARKET'];
        function buildCover(u, editable, slim) {
            const box = el('div', 'cover' + (slim ? ' cover-slim' : '') + (u.coverUrl ? ' has-img' : ''));
            if (u.coverUrl) {
                const im = el('img', 'cover-img');
                im.src = API_URL + u.coverUrl; im.alt = ''; im.loading = 'lazy';
                im.addEventListener('error', function () { im.remove(); box.classList.remove('has-img'); });
                box.appendChild(im);
            } else box.appendChild(el('div', 'cover-pattern'));
            if (editable) {
                const act = el('div', 'cover-actions');
                const input = el('input', 'hidden');
                input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
                input.addEventListener('change', function () { if (input.files[0]) uploadCover(input.files[0]); });
                const up = el('button', 'cover-btn');
                up.type = 'button';
                up.appendChild(el('i', 'fa-solid fa-image'));
                up.appendChild(el('span', '', u.coverUrl ? "Muqovani o'zgartirish" : 'Muqova yuklash'));
                up.addEventListener('click', function () { input.click(); });
                act.append(input, up);
                if (u.coverUrl) {
                    const del = el('button', 'cover-btn');
                    del.type = 'button';
                    del.setAttribute('aria-label', "Muqovani olib tashlash");
                    del.appendChild(el('i', 'fa-solid fa-trash'));
                    del.addEventListener('click', removeCover);
                    act.appendChild(del);
                }
                box.appendChild(act);
            }
            return box;
        }
        async function uploadCover(file) {
            if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return showToast('Faqat JPG, PNG yoki WEBP rasm yuklang.', 4000);
            if (file.size > 4 * 1024 * 1024) return showToast('Muqova hajmi 4 MB dan oshmasligi kerak.', 4000);
            const token = storageGet(TOKEN_KEY);
            if (!token) return handleSessionExpired(reopenDash);
            const fd = new FormData();
            fd.append('file', file);
            let res;
            try { res = await fetch(API_URL + '/profile/cover', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd }); }
            catch (e) { return showToast("Serverga ulanib bo'lmadi. Qayta urinib ko'ring.", 4000); }
            if (res.status === 401) return handleSessionExpired(reopenDash);
            let data = null; try { data = await res.json(); } catch (e) {}
            if (!res.ok) {
                const msg = data && data.message ? (Array.isArray(data.message) ? data.message[0] : data.message) : "Muqovani yuklab bo'lmadi.";
                return showToast(res.status === 413 ? 'Muqova hajmi 4 MB dan oshmasligi kerak.' : msg, 4500);
            }
            saveUser(data);
            showToast('Muqova yangilandi.');
            renderDashProfile();
        }
        async function removeCover() {
            try { saveUser(await authed('DELETE', '/profile/cover')); showToast('Muqova olib tashlandi.'); renderDashProfile(); }
            catch (err) { if (err.status !== 401) showToast(err.messages[0], 4000); }
        }
        // Profil kartasi: muqova + ustiga chiqib turuvchi avatar (faqat fermer va market)
        function buildAvatarCard(u) {
            const row = buildAvatarRow(u);
            if (COVER_ROLES.indexOf(u.role) === -1) return row;
            const wrap = el('div', 'glass rounded-3xl border border-white/10 overflow-hidden');
            wrap.appendChild(buildCover(u, true, false));
            row.className = 'px-6 pb-6 pt-0 flex flex-col sm:flex-row items-center sm:items-end gap-6';
            const av = row.firstChild;
            av.className += ' -mt-14 sm:-mt-16 relative z-[1] ring-4 ring-slate-950';
            wrap.appendChild(row);
            const note = el('p', 'px-6 pb-4 text-[11px] text-slate-500', 'Muqova: JPG, PNG yoki WEBP, 4 MB gacha. Tavsiya: keng (3:1) rasm.');
            wrap.appendChild(note);
            return wrap;
        }

        // ----- Katalog: kategoriya pufakchalari va suriluvchi shkalalar -----
        const marketRanges = { price: null, quantity: null };
        const FILTER_CATS = [['', 'Hammasi', 'fa-border-all'], ['Sabzavot', 'Sabzavot', 'fa-carrot'], ['Meva', 'Meva', 'fa-apple-whole'], ['Poliz', 'Poliz', 'fa-leaf'], ['Don', 'Don', 'fa-wheat-awn'], ['Boshqa', 'Boshqa', 'fa-box']];
        const niceStep = function (range) {
            const raw = Math.max(range / 200, 1);
            const p = Math.pow(10, Math.floor(Math.log10(raw)));
            const m = raw / p;
            return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
        };
        // cfg: { label, fmt(v), onChange(lo|undefined, hi|undefined) }
        function buildRangeSlider(cfg) {
            const wrap = el('div', 'rs-wrap');
            const head = el('div', 'rs-head');
            head.appendChild(el('span', '', cfg.label));
            const val = el('span', 'rs-val', '—');
            head.appendChild(val);
            wrap.appendChild(head);
            const rs = el('div', 'rs');
            rs.classList.add('disabled');
            rs.appendChild(el('div', 'rs-track'));
            const fill = el('div', 'rs-fill');
            rs.appendChild(fill);
            const lo = el('input'), hi = el('input');
            [lo, hi].forEach(function (i, k) { i.type = 'range'; i.setAttribute('aria-label', cfg.label + (k ? ' (maks.)' : ' (min.)')); rs.appendChild(i); });
            wrap.appendChild(rs);
            let bmin = 0, bmax = 0, timer = null;
            const paint = function () {
                const a = Number(lo.value), b = Number(hi.value), span = (bmax - bmin) || 1;
                fill.style.left = ((a - bmin) / span * 100) + '%';
                fill.style.width = ((b - a) / span * 100) + '%';
                val.textContent = cfg.fmt(a) + ' — ' + cfg.fmt(b);
                lo.style.zIndex = a > bmax - span * 0.12 ? 5 : 3; // chetda ikkala tutqich ustma-ust tushsa ham ushlab olinadi
            };
            const emit = function () {
                clearTimeout(timer);
                timer = setTimeout(function () {
                    const a = Number(lo.value), b = Number(hi.value);
                    cfg.onChange(a <= bmin ? undefined : a, b >= bmax ? undefined : b);
                }, 280);
            };
            lo.addEventListener('input', function () { if (Number(lo.value) > Number(hi.value)) lo.value = hi.value; paint(); emit(); });
            hi.addEventListener('input', function () { if (Number(hi.value) < Number(lo.value)) hi.value = lo.value; paint(); emit(); });
            return {
                node: wrap,
                // Chegaralar API'dan keladi (filtrdan mustaqil); tanlangan qiymat chegaraga moslanadi
                setBounds: function (min, max, curLo, curHi) {
                    min = Math.floor(Number(min)); max = Math.ceil(Number(max));
                    const usable = isFinite(min) && isFinite(max) && max > min;
                    rs.classList.toggle('disabled', !usable);
                    if (!usable) { val.textContent = isFinite(min) && min === max ? cfg.fmt(min) : '—'; return; }
                    bmin = min; bmax = max;
                    const step = niceStep(max - min);
                    [lo, hi].forEach(function (i) { i.min = min; i.max = max; i.step = step; });
                    lo.value = curLo === undefined ? min : Math.min(Math.max(curLo, min), max);
                    hi.value = curHi === undefined ? max : Math.min(Math.max(curHi, min), max);
                    paint();
                },
                reset: function () { if (bmax > bmin) { lo.value = bmin; hi.value = bmax; paint(); } }
            };
        }
        const priceSlider = buildRangeSlider({ label: "Narx (so'm / kg)", fmt: function (v) { return formatNumber(v); }, onChange: function (a, b) { marketState.minPrice = a; marketState.maxPrice = b; marketState.page = 1; loadMarket(); } });
        const qtySlider = buildRangeSlider({ label: 'Mavjud miqdor (kg)', fmt: function (v) { return formatNumber(v); }, onChange: function (a, b) { marketState.minQty = a; marketState.maxQty = b; marketState.page = 1; loadMarket(); } });
        let marketFiltersBuilt = false;
        function buildMarketFilters() {
            if (marketFiltersBuilt) return;
            marketFiltersBuilt = true;
            const cats = document.getElementById('market-cat-chips');
            FILTER_CATS.forEach(function (c) {
                const b = el('button', 'fchip');
                b.type = 'button';
                b.dataset.cat = c[0];
                b.setAttribute('aria-pressed', 'false');
                b.appendChild(el('i', 'fa-solid ' + c[2]));
                b.appendChild(el('span', '', c[1]));
                b.addEventListener('click', function () { setMarketCategory(c[0], true); });
                cats.appendChild(b);
            });
            const sl = document.getElementById('market-sliders');
            sl.append(priceSlider.node, qtySlider.node);
            document.getElementById('filters-toggle').addEventListener('click', function () {
                const f = document.getElementById('market-filters');
                const collapsed = f.classList.toggle('filters-collapsed');
                document.getElementById('filters-toggle').setAttribute('aria-expanded', String(!collapsed));
            });
            if (window.innerWidth <= 640) document.getElementById('market-filters').classList.add('filters-collapsed');
            document.getElementById('filters-reset').addEventListener('click', clearMarketFilters);
        }
        function marketActiveFilterCount() {
            return ['q', 'category', 'region'].filter(function (k) { return marketState[k]; }).length
                + (marketState.minPrice !== undefined || marketState.maxPrice !== undefined ? 1 : 0)
                + (marketState.minQty !== undefined || marketState.maxQty !== undefined ? 1 : 0);
        }
        function syncMarketFilterUi() {
            buildMarketFilters();
            document.querySelectorAll('#market-cat-chips .fchip').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.cat === (marketState.category || ''))); });
            const n = marketActiveFilterCount();
            const badge = document.getElementById('filters-count');
            badge.textContent = String(n);
            badge.style.display = n ? 'inline-flex' : 'none';
            document.getElementById('filters-reset').style.display = n ? '' : 'none';
        }
        function applyMarketRanges(ranges) {
            if (!ranges) return;
            const changed = JSON.stringify(ranges) !== JSON.stringify(marketRanges);
            if (!changed) return;
            marketRanges.price = ranges.price; marketRanges.quantity = ranges.quantity;
            priceSlider.setBounds(ranges.price.min, ranges.price.max, marketState.minPrice, marketState.maxPrice);
            qtySlider.setBounds(ranges.quantity.min, ranges.quantity.max, marketState.minQty, marketState.maxQty);
        }
        buildMarketFilters();

        loadMarket(); // filtr yordamchilari (priceSlider...) e'lon qilingandan keyin
        // ===== Obuna va 1 oylik bepul sinov =====
        const SUB_ROLES = ['FARMER', 'DRIVER', 'MARKET'];
        const SUB_MONTHS = [1, 3, 6, 12];
        const SUB_BLOCKED = {
            FARMER: "E'lon berish va ombor e'lonlari",
            MARKET: 'Yuk bron qilish',
            DRIVER: 'Yuklarni qabul qilish'
        };
        const SUB_PERKS = {
            FARMER: ["Cheksiz e'lon joylash", "Omborxonaga yuk topshirish", "To'lov kafolati (Escrow) va GPS kuzatuv"],
            MARKET: ["Fermerlardan to'g'ridan-to'g'ri bron qilish", "Escrow to'lov va yuk kuzatuvi", "Omborxona buyurtmalari va hisobotlar"],
            DRIVER: ["To'lovi kafolatlangan yuklarni qabul qilish", "GPS va harakat jurnali (ELD)", "Marshrut va daromad statistikasi"]
        };
        let subState = null;
        let subRedirectAt = 0;

        function subApplies(user) { return !!user && SUB_ROLES.indexOf(user.role) !== -1; }
        function addDaysTo(d, n) { return new Date(d.getTime() + n * 86400000); }
        function subMoney(n) { return T('{0} so\'m', formatNumber(n)); }

        async function loadSubscription() {
            const user = currentUser();
            if (!subApplies(user)) { subState = null; renderSubBanner(); return null; }
            try { subState = await authed('GET', '/subscription'); } catch (err) { return subState; }
            renderSubBanner();
            return subState;
        }

        // 402 (sinov/obuna tugagan): ochiq oynalar yopilib, foydalanuvchi to'lov sahifasiga yo'naltiriladi
        function handleSubscriptionRequired() {
            const now = Date.now();
            if (now - subRedirectAt < 1500) return;
            subRedirectAt = now;
            const user = currentUser();
            if (!subApplies(user)) return;
            subState = Object.assign({}, subState || {}, { state: 'EXPIRED', hasAccess: false, daysLeft: 0, expiringSoon: false });
            [closeProductModal, closeBookingModal, closeMyProducts, closeWhModal].forEach(function (fn) { try { fn(); } catch (e) {} });
            showToast("Bepul sinov muddati tugadi. Davom etish uchun obunani uzaytiring.");
            openDashboard('subscription');
        }

        // Banner holati: null (ko'rsatilmaydi) | { tone: '', 'warn', 'bad', icon, title, sub, frac }
        function subBannerModel(s, user) {
            if (!s || s.state === 'EXEMPT') return null;
            const until = formatDate(s.accessEndsAt);
            if (s.state === 'EXPIRED') {
                return { tone: 'bad', icon: 'fa-lock', title: 'Bepul sinov muddati tugadi',
                    sub: T("{0} bloklangan. Davom etish uchun obunani uzaytiring.", T(SUB_BLOCKED[user.role] || '')), frac: 0 };
            }
            if (s.expiringSoon) {
                const title = s.state === 'TRIAL' ? T('Sinov muddati {0} kunda tugaydi', s.daysLeft) : T('Obuna {0} kunda tugaydi', s.daysLeft);
                return { tone: 'warn', icon: 'fa-hourglass-half', title: title, sub: T('{0} dan keyin asosiy funksiyalar bloklanadi.', until), frac: s.daysLeft / 30 };
            }
            if (s.state === 'TRIAL') {
                return { tone: '', icon: 'fa-gift', title: T('Bepul sinov: {0} kun qoldi', s.daysLeft), sub: T('Sinov {0} da tugaydi.', until), frac: s.daysLeft / 30 };
            }
            return null; // pullik obuna faol va uzoq muddatli
        }

        function renderSubBanner() {
            const slot = document.getElementById('sub-banner-slot');
            if (!slot) return;
            const user = currentUser();
            const m = subApplies(user) ? subBannerModel(subState, user) : null;
            // Tab yonidagi indikator nuqta
            document.querySelectorAll('.dash-tab[data-tab="subscription"] .sub-tab-dot').forEach(function (d) { d.remove(); });
            const tab = document.querySelector('.dash-tab[data-tab="subscription"]');
            if (tab && m && m.tone) tab.appendChild(el('span', ['sub-tab-dot', m.tone].join(' ')));
            if (!m || dashTab === 'subscription') { slot.replaceChildren(); return; }
            const box = el('div', ['sub-banner', m.tone].join(' '));
            box.setAttribute('role', 'status');
            box.appendChild(el('span', 'sb-ico', ''));
            box.firstChild.appendChild(el('i', ['fa-solid', m.icon].join(' ')));
            const txt = el('div', 'min-w-0 flex-1 basis-56');
            txt.appendChild(el('div', 'font-extrabold text-white', m.title));
            txt.appendChild(el('div', 'text-sm text-slate-300', m.sub));
            if (m.frac > 0) {
                const bar = el('div', 'sub-bar');
                const fill = el('i');
                fill.style.width = Math.round(Math.min(1, m.frac) * 100) + '%';
                bar.appendChild(fill);
                txt.appendChild(bar);
            }
            box.appendChild(txt);
            const go = el('button', ['px-5 py-2.5 rounded-xl text-sm font-extrabold transition active:scale-95', m.tone === 'bad' ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'].join(' '), 'Obunani uzaytirish');
            go.type = 'button';
            go.addEventListener('click', function () { selectDashTab('subscription'); });
            box.appendChild(go);
            slot.replaceChildren(box);
        }

        function subRing(s) {
            const C = 2 * Math.PI * 52;
            const frac = Math.min(1, (s.daysLeft || 0) / 30);
            const tone = s.state === 'EXPIRED' ? 'bad' : s.expiringSoon ? 'warn' : '';
            const wrap = el('div', ['sub-ring', tone].join(' '));
            wrap.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="52" fill="none" stroke-width="9"/><circle class="val" cx="60" cy="60" r="52" fill="none" stroke-width="9" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/></svg>';
            const mid = el('div', 'mid');
            mid.appendChild(el('div', 'text-4xl font-black text-white', String(s.daysLeft || 0)));
            mid.appendChild(el('div', 'text-[11px] font-bold uppercase tracking-wider text-slate-400', 'kun qoldi'));
            wrap.appendChild(mid);
            requestAnimationFrame(function () { requestAnimationFrame(function () {
                const v = wrap.querySelector('.val'); if (v) v.setAttribute('stroke-dashoffset', (C * (1 - frac)).toFixed(1));
            }); });
            return wrap;
        }

        async function renderDashSubscription(user) {
            const rid = ++dashRenderId;
            renderSubBanner();
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', "Obuna ma'lumotlari yuklanmoqda..."));
            let s, hist;
            try {
                s = await authed('GET', '/subscription');
                hist = subApplies(user) ? await authed('GET', '/subscription/history') : [];
            } catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderDashSubscription(user); }));
            }
            if (rid !== dashRenderId) return;
            subState = s;
            renderSubBanner();
            const nodes = [];
            nodes.push(sectionTitle('Obuna', "Tarifingiz, sinov muddati va to'lov tarixi"));

            const head = el('div', 'glass rounded-3xl border border-white/10 p-6 flex flex-wrap items-center gap-6');
            if (s.state === 'EXEMPT') {
                head.appendChild(el('i', 'fa-solid fa-shield-halved text-4xl text-emerald-400'));
                head.appendChild(el('p', 'text-slate-300 font-medium flex-1', "Sizning rolingiz uchun obuna talab qilinmaydi."));
                nodes.push(head); dashContent.replaceChildren.apply(dashContent, nodes); return;
            }
            head.appendChild(subRing(s));
            const info = el('div', 'min-w-0 flex-1 basis-60 space-y-2');
            const stLabel = { TRIAL: 'Bepul sinov', ACTIVE: 'Obuna faol', EXPIRED: 'Muddati tugagan' }[s.state];
            const stCls = { TRIAL: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', ACTIVE: 'bg-sky-500/15 text-sky-300 border-sky-500/30', EXPIRED: 'bg-rose-500/15 text-rose-300 border-rose-500/30' }[s.state];
            info.appendChild(el('span', ['inline-block px-3 py-1 rounded-full border text-xs font-extrabold uppercase tracking-wider', stCls].join(' '), stLabel));
            info.appendChild(el('div', 'text-2xl font-black text-white', T('{0} / oy', subMoney(s.priceUzs))));
            const lines = [];
            if (s.trialEndsAt) lines.push(T('Sinov tugashi: {0}', formatDate(s.trialEndsAt)));
            if (s.subscriptionEndsAt) lines.push(T('Obuna tugashi: {0}', formatDate(s.subscriptionEndsAt)));
            lines.forEach(function (l) { info.appendChild(el('div', 'text-sm text-slate-400', l)); });
            if (s.state === 'EXPIRED') info.appendChild(el('div', 'text-sm text-rose-300 font-semibold', T('{0} bloklangan.', T(SUB_BLOCKED[user.role]))));
            head.appendChild(info);
            nodes.push(head);

            // Muddat tanlash
            const pick = el('div', 'glass rounded-3xl border border-white/10 p-6 space-y-5');
            pick.appendChild(el('h4', 'font-extrabold text-white', 'Obunani uzaytirish'));
            const monthSel = el('select', 'auth-input');
            monthSel.id = 'sub-months';
            monthSel.setAttribute('aria-label', 'Obuna muddati');
            SUB_MONTHS.forEach(function (m) {
                const o = el('option', '', T('{0} oy', m) + ' — ' + subMoney(s.priceUzs * m));
                o.value = String(m);
                monthSel.appendChild(o);
            });
            let months = 1;
            const total = el('div', 'text-3xl font-black text-emerald-300');
            const until = el('div', 'text-sm text-slate-400');
            const base = s.accessEndsAt && new Date(s.accessEndsAt) > new Date() ? new Date(s.accessEndsAt) : new Date();
            const sync = function () {
                total.textContent = subMoney(s.priceUzs * months);
                until.textContent = T('Yangi muddat: {0} gacha', formatDate(addDaysTo(base, 30 * months).toISOString()));
            };
            monthSel.addEventListener('change', function () { months = Number(monthSel.value); sync(); });
            const pickRow = el('div', 'max-w-sm');
            pickRow.appendChild(el('label', 'block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5', 'Obuna muddati'));
            pickRow.lastChild.htmlFor = 'sub-months';
            pickRow.appendChild(monthSel);
            pick.appendChild(pickRow);
            const foot = el('div', 'flex flex-wrap items-end justify-between gap-4');
            const sum = el('div', 'space-y-1');
            sum.appendChild(el('div', 'text-xs font-bold uppercase tracking-wider text-slate-400', 'Jami'));
            sum.appendChild(total);
            sum.appendChild(until);
            foot.appendChild(sum);
            const pay = el('button', 'px-8 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-lg shadow-emerald-500/25 transition active:scale-95 disabled:opacity-60');
            pay.type = 'button';
            pay.appendChild(el('i', 'fa-solid fa-lock mr-2'));
            pay.appendChild(el('span', '', "To'lash"));
            pay.addEventListener('click', async function () {
                pay.disabled = true;
                try {
                    const r = await authed('POST', '/subscription/pay', { months: months });
                    subState = Object.assign({}, subState, r.subscription);
                    showSuccessCheck('Obuna uzaytirildi!', T('{0} gacha faol', formatDate(r.subscription.accessEndsAt)), 'subscription');
                    renderDashSubscription(currentUser());
                } catch (err) {
                    if (err.status !== 401) showToast(err.messages[0]);
                    pay.disabled = false;
                }
            });
            foot.appendChild(pay);
            pick.appendChild(foot);
            pick.appendChild(el('p', 'text-xs text-slate-500', "Hozircha to'lov simulyatsiya rejimida: haqiqiy pul yechilmaydi. Qolgan sinov kunlari yo'qolmaydi."));
            sync();
            nodes.push(pick);

            // Tarifga nimalar kiradi
            const perks = el('div', 'glass rounded-3xl border border-white/10 p-6 space-y-3');
            perks.appendChild(el('h4', 'font-extrabold text-white', 'Tarifga kiradi'));
            const ul = el('ul', 'tariff-list');
            (SUB_PERKS[user.role] || []).forEach(function (p) {
                const li = el('li');
                li.appendChild(el('i', 'fa-solid fa-check'));
                li.appendChild(el('span', '', p));
                ul.appendChild(li);
            });
            perks.appendChild(ul);
            nodes.push(perks);

            // To'lov tarixi
            const hbox = el('div', 'glass rounded-3xl border border-white/10 p-6 space-y-3');
            hbox.appendChild(el('h4', 'font-extrabold text-white', "To'lov tarixi"));
            if (!hist.length) hbox.appendChild(el('p', 'text-sm text-slate-400', "Hali to'lovlar yo'q. Sinov muddati davomida hammasi bepul."));
            hist.forEach(function (h) {
                const row = el('div', 'flex flex-wrap items-center justify-between gap-2 py-2.5 border-t border-white/10 text-sm');
                const l = el('div', 'min-w-0');
                l.appendChild(el('div', 'font-bold text-slate-100', T('{0} oy', h.months)));
                l.appendChild(el('div', 'text-xs text-slate-400', T('{0} — {1}', formatDate(h.periodStart), formatDate(h.periodEnd))));
                row.appendChild(l);
                row.appendChild(el('div', 'font-extrabold text-emerald-300', subMoney(h.amountUzs)));
                hbox.appendChild(row);
            });
            nodes.push(hbox);
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // ===== Bozor narxlari =====
        const PRICE_STAFF = ['ADMIN', 'DISPATCHER'];
        const priceState = { q: '', rid: 0, items: [], markets: null, timer: null, bgTimer: null, bgIdx: 0 };
        const priceModal = document.getElementById('price-modal');
        const priceForm = document.getElementById('price-form');
        const priceAlert = document.getElementById('price-alert');

        // Orqa fon: Market roli rasmlari (market.jpg ... market7.jpg), har 10 soniyada silliq almashadi
        async function priceBgShow() {
            const list = ROLE_BG.MARKET;
            const wrap = document.getElementById('pr-bg');
            for (let tries = 0; tries < list.length; tries++) {
                const src = list[priceState.bgIdx % list.length];
                priceState.bgIdx++;
                if (!(await roleBgPreload(src))) continue;
                if (!priceState.bgTimer) return;
                const layers = wrap.querySelectorAll('.rp-bg-layer');
                const cur = wrap.querySelector('.rp-bg-layer.on');
                const next = cur === layers[0] ? layers[1] : layers[0];
                next.style.backgroundImage = 'url("' + src + '")';
                next.classList.add('on');
                if (cur) cur.classList.remove('on');
                return;
            }
        }
        function startPricesBg() {
            if (priceState.bgTimer) return;
            const wrap = document.getElementById('pr-bg');
            wrap.classList.remove('pr-off');
            priceState.bgIdx = Math.floor(Math.random() * ROLE_BG.MARKET.length);
            priceState.bgTimer = setInterval(function () { if (!document.hidden) priceBgShow(); }, ROLE_BG_INTERVAL);
            priceBgShow();
        }
        function stopPricesBg() {
            clearInterval(priceState.bgTimer);
            priceState.bgTimer = null;
            const wrap = document.getElementById('pr-bg');
            if (!wrap) return;
            wrap.classList.add('pr-off');
            wrap.querySelectorAll('.rp-bg-layer').forEach(function (l) { l.classList.remove('on'); l.style.backgroundImage = ''; });
        }

        function priceHue(s) {
            let h = 0;
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
            return h;
        }

        function buildPriceCard(p, i) {
            const c = el('article', 'pr-card');
            c.style.setProperty('--i', String(Math.min(i, 12)));
            const imgBox = el('div', 'pr-img');
            const placeholder = function () {
                const ph = el('div', 'pr-ph', p.productName.charAt(0).toUpperCase());
                ph.style.setProperty('--h', String(priceHue(p.productName)));
                imgBox.replaceChildren(ph);
            };
            if (p.image) {
                const im = el('img');
                im.src = API_URL + p.image; im.alt = p.productName; im.loading = 'lazy';
                im.addEventListener('error', placeholder);
                imgBox.appendChild(im);
            } else placeholder();
            c.appendChild(imgBox);

            const body = el('div', 'p-5 flex flex-col gap-3 flex-1');
            const mk = el('div', 'flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300');
            mk.appendChild(el('i', 'fa-solid fa-location-dot'));
            mk.appendChild(el('span', 'min-w-0 break-words', p.marketName));
            body.appendChild(mk);
            body.appendChild(el('h3', 'text-xl font-extrabold text-white break-words', p.productName));

            const row = el('div', 'flex items-end justify-between gap-3 mt-auto pt-3 border-t border-white/10');
            const left = el('div', 'space-y-1 min-w-0');
            left.appendChild(el('div', 'text-sm text-slate-400', T("Kecha: {0} so'm", formatNumber(p.priceYesterday))));
            left.appendChild(el('div', 'text-lg font-black text-white', T("Bugun: {0} so'm", formatNumber(p.priceToday))));
            row.appendChild(left);
            const pct = Math.abs(p.changePercent);
            const sign = p.trend === 'up' ? '+' : p.trend === 'down' ? '-' : '';
            const t = el('span', ['pr-trend', p.trend].join(' '));
            t.title = p.trend === 'up' ? T('Narx oshgan') : p.trend === 'down' ? T('Narx tushgan') : T("Narx o'zgarmagan");
            t.appendChild(el('i', ['fa-solid', p.trend === 'up' ? 'fa-arrow-up' : p.trend === 'down' ? 'fa-arrow-down' : 'fa-minus'].join(' ')));
            t.appendChild(el('span', '', sign + formatNumber(pct) + '%'));
            row.appendChild(t);
            body.appendChild(row);
            body.appendChild(el('div', 'text-[11px] text-slate-500', T('Yangilandi: {0}', formatDate(p.createdAt))));
            c.appendChild(body);
            return c;
        }

        async function loadPrices() {
            const box = document.getElementById('pr-results');
            const count = document.getElementById('pr-count');
            if (!box) return;
            const rid = ++priceState.rid;
            if (!priceState.items.length) {
                const g = el('div', 'pr-grid');
                for (let i = 0; i < 6; i++) g.appendChild(el('div', 'sk-card h-80'));
                box.replaceChildren(g);
            }
            let items;
            try {
                items = await authed('GET', '/market-prices' + (priceState.q ? '?q=' + encodeURIComponent(priceState.q) : ''));
            } catch (err) {
                if (err.status === 401 || rid !== priceState.rid) return;
                return box.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], loadPrices));
            }
            if (rid !== priceState.rid) return;
            priceState.items = items;
            count.textContent = items.length ? T('Topildi: {0}', items.length) : '';
            if (!items.length) {
                return box.replaceChildren(emptyState({ art: 'listings', compact: true,
                    title: priceState.q ? 'Hech narsa topilmadi' : "Bozor narxlari hali kiritilmagan",
                    text: priceState.q ? "Boshqa bozor yoki mahsulot nomini yozib ko'ring." : "Narxlar dispetcher yoki administrator tomonidan kiritiladi." }));
            }
            const grid = el('div', 'pr-grid');
            items.forEach(function (p, i) { grid.appendChild(buildPriceCard(p, i)); });
            box.replaceChildren(grid);
        }

        function renderDashPrices(user) {
            dashRenderId++;
            priceState.q = '';
            priceState.items = [];
            const nodes = [];
            const head = el('div', 'flex flex-wrap items-end justify-between gap-4');
            head.appendChild(sectionTitle('Bozor narxlari', "Toshkent, Samarqand va Jizzax bozorlaridagi bugungi narxlar"));
            if (PRICE_STAFF.indexOf(user.role) !== -1) {
                const add = actionBtn('fa-plus', 'Yangi narx kiritish', true, openPriceModal);
                add.id = 'pr-add';
                head.appendChild(add);
            }
            nodes.push(head);
            const sw = el('div', 'pr-search');
            sw.appendChild(el('i', 'fa-solid fa-magnifying-glass'));
            const input = el('input');
            input.type = 'search'; input.id = 'pr-search'; input.maxLength = 80; input.autocomplete = 'off';
            input.placeholder = "Bozor yoki mahsulot nomi bo'yicha qidiring...";
            input.setAttribute('aria-label', 'Qidiruv');
            input.addEventListener('input', function () {
                clearTimeout(priceState.timer);
                priceState.timer = setTimeout(function () { priceState.q = input.value.trim(); loadPrices(); }, 250);
            });
            sw.appendChild(input);
            nodes.push(sw);
            const count = el('div', 'text-sm font-semibold text-slate-300');
            count.id = 'pr-count';
            nodes.push(count);
            const res = el('div');
            res.id = 'pr-results';
            nodes.push(res);
            dashContent.replaceChildren.apply(dashContent, nodes);
            startPricesBg();
            loadPrices();
        }

        // ----- Yangi narx kiritish oynasi -----
        async function openPriceModal() {
            hideAuthAlert(priceAlert);
            priceForm.reset();
            resetPriceDrop();
            const dl = document.getElementById('pr-product-list');
            dl.replaceChildren.apply(dl, Array.from(new Set(priceState.items.map(function (p) { return p.productName; }))).map(function (n) { const o = el('option'); o.value = n; return o; }));
            priceModal.classList.add('open');
            syncScrollLock();
            if (!priceState.markets) {
                try { priceState.markets = await authed('GET', '/market-prices/markets'); } catch (err) { return showAuthAlert(err.messages || ["Bozorlar ro'yxatini yuklab bo'lmadi."], 'error', priceAlert); }
            }
            const sel = document.getElementById('pr-market');
            if (sel.options.length < 2) {
                priceState.markets.forEach(function (g) {
                    const og = el('optgroup');
                    og.label = g.region;
                    g.markets.forEach(function (m) { const o = el('option', '', m); o.value = m; og.appendChild(o); });
                    sel.appendChild(og);
                });
            }
        }
        function closePriceModal() {
            priceModal.classList.remove('open');
            syncScrollLock();
        }
        function resetPriceDrop() {
            const d = document.getElementById('pr-drop');
            d.querySelectorAll('img').forEach(function (i) { i.remove(); });
            d.firstElementChild.classList.remove('hidden');
            document.getElementById('pr-drop-text').textContent = T('Rasm tanlang yoki shu yerga tashlang (JPG, PNG, WEBP, 3 MB gacha)');
        }
        function showPriceFile(file) {
            const d = document.getElementById('pr-drop');
            resetPriceDrop();
            if (!file) return;
            d.firstElementChild.classList.add('hidden');
            const im = el('img'); im.alt = '';
            im.src = URL.createObjectURL(file);
            im.addEventListener('load', function () { URL.revokeObjectURL(im.src); });
            d.insertBefore(im, d.firstElementChild);
            document.getElementById('pr-drop-text').textContent = file.name;
        }
        (function () {
            const input = document.getElementById('pr-file');
            const drop = document.getElementById('pr-drop');
            const check = function (f) {
                if (!f) return true;
                if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { showAuthAlert(['Faqat JPG, PNG yoki WEBP rasm yuklang.'], 'error', priceAlert); return false; }
                if (f.size > 3 * 1024 * 1024) { showAuthAlert(['Rasm hajmi 3 MB dan oshmasligi kerak.'], 'error', priceAlert); return false; }
                hideAuthAlert(priceAlert);
                return true;
            };
            input.addEventListener('change', function () {
                const f = input.files[0];
                if (!check(f)) { input.value = ''; return resetPriceDrop(); }
                showPriceFile(f);
            });
            ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); }); });
            ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); }); });
            drop.addEventListener('drop', function (e) {
                const f = e.dataTransfer && e.dataTransfer.files[0];
                if (!f || !check(f)) return;
                try { const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files; } catch (err) {}
                showPriceFile(f);
            });
        })();
        priceForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideAuthAlert(priceAlert);
            const market = document.getElementById('pr-market').value;
            const product = document.getElementById('pr-product').value.trim();
            const price = Number(document.getElementById('pr-price').value);
            const errors = [];
            if (!market) errors.push('Bozorni tanlang.');
            if (product.length < 2) errors.push('Mahsulot nomini kiriting.');
            if (!Number.isInteger(price) || price < 1) errors.push("Bugungi narxni butun son (so'm) ko'rinishida kiriting.");
            if (errors.length) return showAuthAlert(errors, 'error', priceAlert);
            const token = storageGet(TOKEN_KEY);
            if (!token) return handleSessionExpired(reopenDash);
            const fd = new FormData();
            fd.append('marketName', market); fd.append('productName', product); fd.append('priceToday', String(price));
            const file = document.getElementById('pr-file').files[0];
            if (file) fd.append('image', file);
            setLoading(priceForm, true);
            let res;
            try { res = await fetch(API_URL + '/market-prices', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd }); }
            catch (err) { setLoading(priceForm, false); return showAuthAlert(["Serverga ulanib bo'lmadi. Qayta urinib ko'ring."], 'error', priceAlert); }
            let data = null; try { data = await res.json(); } catch (err) {}
            setLoading(priceForm, false);
            if (res.status === 401) { closePriceModal(); return handleSessionExpired(reopenDash); }
            if (!res.ok) {
                const msg = res.status === 413 ? ['Rasm hajmi 3 MB dan oshmasligi kerak.'] : res.status === 403 ? ["Narx kiritish faqat administrator va dispetcher uchun."]
                    : (data && data.message ? [].concat(data.message) : ["Narxni saqlab bo'lmadi."]);
                return showAuthAlert(msg, 'error', priceAlert);
            }
            closePriceModal();
            showSuccessCheck('Narx saqlandi!', data.productName + ': ' + formatNumber(data.priceYesterday) + ' → ' + formatNumber(data.priceToday), 'price');
            if (dashTab === 'prices') loadPrices();
        });

        // ===== Custom Dropdown: barcha <select> avtomatik shu komponentga o'tadi =====
        // Asl <select> DOM'da qoladi (yashirin): mavjud kod `.value`, `.options`, `change`, `form.reset()` bilan ishlashda davom etadi.
        // Select'ga `data-native` qo'shilsa brauzerning standart menyusi saqlanadi.
        const DS = { open: null, uid: 0 };
        const DS_CHEV = '<svg class="ds-chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7.5l5 5 5-5"/></svg>';
        const DS_TICK = '<svg class="ds-tick" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>';
        const DS_SIZING = /^(sm:|md:|lg:|xl:)?!?(w-|min-w-|max-w-|flex-|grow|shrink)/;
        const DS_VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        const DS_INDEX = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

        function dsEnhance(select) {
            if (select.__ds || select.hasAttribute('data-native') || select.multiple || select.size > 1 || !select.parentNode) return;
            const id = ++DS.uid;
            const classes = select.className.split(/\s+/).filter(Boolean);
            const wrap = el('div', ['ds'].concat(classes.filter(function (c) { return DS_SIZING.test(c); })).join(' '));
            const trig = el('button', ['ds-trigger'].concat(classes.filter(function (c) { return !DS_SIZING.test(c); })).join(' '));
            trig.type = 'button';
            trig.id = 'ds-t' + id;
            trig.setAttribute('role', 'combobox');
            trig.setAttribute('aria-haspopup', 'listbox');
            trig.setAttribute('aria-expanded', 'false');
            trig.setAttribute('aria-controls', 'ds-l' + id);
            const lab = el('span', 'ds-label');
            trig.appendChild(lab);
            trig.insertAdjacentHTML('beforeend', DS_CHEV);
            select.parentNode.insertBefore(wrap, select);
            wrap.appendChild(select);
            wrap.appendChild(trig);
            select.className = 'ds-native';
            select.tabIndex = -1;
            select.setAttribute('aria-hidden', 'true');

            let pop = null, items = [], active = -1, typed = '', typedAt = 0;

            const sync = function () {
                const o = select.options[select.selectedIndex];
                lab.textContent = o ? o.textContent.trim() || ' ' : ' ';
                trig.classList.toggle('ds-empty', !o || o.value === '');
                trig.disabled = select.disabled;
                wrap.classList.toggle('ds-hidden', select.hidden);
                const al = select.getAttribute('aria-label');
                if (al) trig.setAttribute('aria-label', al);
            };
            const place = function () {
                if (!pop) return;
                if (!trig.isConnected) return api.close();
                const r = trig.getBoundingClientRect();
                const vh = window.innerHeight, below = vh - r.bottom - 12, above = r.top - 12;
                pop.style.maxHeight = '18rem';
                const h = Math.min(pop.scrollHeight, 288);
                const up = below < Math.min(h, 200) && above > below;
                pop.classList.toggle('up', up);
                pop.style.maxHeight = Math.max(120, Math.min(288, up ? above : below)) + 'px';
                const w = Math.max(r.width, 180);
                pop.style.width = w + 'px';
                pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
                if (up) { pop.style.top = 'auto'; pop.style.bottom = (vh - r.top + 6) + 'px'; }
                else { pop.style.bottom = 'auto'; pop.style.top = (r.bottom + 6) + 'px'; }
            };
            const setActive = function (i, scroll) {
                if (active >= 0 && items[active]) items[active].node.classList.remove('act');
                active = i;
                if (i < 0 || !items[i]) return trig.removeAttribute('aria-activedescendant');
                items[i].node.classList.add('act');
                trig.setAttribute('aria-activedescendant', items[i].node.id);
                if (scroll) items[i].node.scrollIntoView({ block: 'nearest' });
            };
            const move = function (from, step) {
                for (let i = from + step; i >= 0 && i < items.length; i += step) if (!items[i].opt.disabled) return i;
                return from;
            };
            const choose = function (opt) {
                if (opt.disabled) return;
                const changed = select.selectedIndex !== opt.index;
                select.selectedIndex = opt.index;
                api.close(true);
                if (changed) {
                    select.dispatchEvent(new Event('input', { bubbles: true }));
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            };
            const render = function () {
                pop.replaceChildren();
                items = [];
                const addOpt = function (opt) {
                    const n = el('div', ['ds-opt', opt.value === '' ? 'ds-ph' : ''].join(' '));
                    n.id = 'ds-o' + id + '-' + items.length;
                    n.setAttribute('role', 'option');
                    n.setAttribute('aria-selected', String(opt.selected));
                    if (opt.disabled) n.setAttribute('aria-disabled', 'true');
                    n.appendChild(el('span', 'ds-opt-text', opt.textContent.trim()));
                    if (opt.selected) n.insertAdjacentHTML('beforeend', DS_TICK);
                    const idx = items.length;
                    n.addEventListener('click', function () { choose(opt); });
                    n.addEventListener('pointermove', function () { if (active !== idx && !opt.disabled) setActive(idx, false); });
                    items.push({ opt: opt, node: n });
                    pop.appendChild(n);
                };
                Array.prototype.forEach.call(select.children, function (c) {
                    if (c.tagName === 'OPTGROUP') {
                        const g = el('div', 'ds-group', c.label);
                        g.setAttribute('role', 'presentation');
                        pop.appendChild(g);
                        Array.prototype.forEach.call(c.children, addOpt);
                    } else if (c.tagName === 'OPTION') addOpt(c);
                });
                setActive(items.findIndex(function (it) { return it.opt.selected; }), true);
            };

            const api = {
                trig: trig, sync: sync, place: place,
                get pop() { return pop; },
                open: function () {
                    if (trig.disabled || pop) return;
                    if (DS.open) DS.open.close();
                    pop = el('div', 'ds-pop');
                    pop.id = 'ds-l' + id;
                    pop.setAttribute('role', 'listbox');
                    const al = trig.getAttribute('aria-label');
                    if (al) pop.setAttribute('aria-label', al);
                    pop.addEventListener('pointerdown', function (e) { e.preventDefault(); }); // fokus trigger'da qoladi
                    document.body.appendChild(pop);
                    render();
                    trig.setAttribute('aria-expanded', 'true');
                    DS.open = api;
                    place();
                    if (active >= 0) items[active].node.scrollIntoView({ block: 'nearest' });
                },
                close: function (refocus) {
                    if (!pop) return;
                    pop.remove();
                    pop = null; items = []; active = -1;
                    trig.setAttribute('aria-expanded', 'false');
                    trig.removeAttribute('aria-activedescendant');
                    if (DS.open === api) DS.open = null;
                    if (refocus) trig.focus();
                }
            };
            select.__ds = api;

            trig.addEventListener('click', function () { if (pop) api.close(); else api.open(); });
            trig.addEventListener('keydown', function (e) {
                const k = e.key;
                if (!pop) {
                    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); api.open(); }
                    return;
                }
                if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); return api.close(true); } // modal/kabinet yopilmasin
                if (k === 'Tab') return api.close();
                if (k === 'ArrowDown') setActive(move(active < 0 ? -1 : active, 1), true);
                else if (k === 'ArrowUp') setActive(move(active < 0 ? items.length : active, -1), true);
                else if (k === 'Home') setActive(move(-1, 1), true);
                else if (k === 'End') setActive(move(items.length, -1), true);
                else if (k === 'PageDown') setActive(move(Math.min(items.length - 1, active + 7), 1) , true);
                else if (k === 'PageUp') setActive(move(Math.max(0, active - 7), -1), true);
                else if (k === 'Enter' || k === ' ') { if (active >= 0) choose(items[active].opt); }
                else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { // harf bo'yicha qidirish
                    const now = Date.now();
                    typed = (now - typedAt > 600 ? '' : typed) + k.toLowerCase();
                    typedAt = now;
                    const from = typed.length === 1 ? active + 1 : active;
                    for (let n = 0; n < items.length; n++) {
                        const i = (from + n + items.length) % items.length;
                        if (!items[i].opt.disabled && items[i].opt.textContent.trim().toLowerCase().indexOf(typed) === 0) { setActive(i, true); break; }
                    }
                    return;
                } else return;
                e.preventDefault();
            });

            // Dasturiy o'zgarishlar (select.value = ..., selectedIndex = ..., focus()) ham ko'rinishga yetib boradi
            Object.defineProperty(select, 'value', { configurable: true, get: function () { return DS_VALUE.get.call(this); }, set: function (v) { DS_VALUE.set.call(this, v); sync(); } });
            Object.defineProperty(select, 'selectedIndex', { configurable: true, get: function () { return DS_INDEX.get.call(this); }, set: function (v) { DS_INDEX.set.call(this, v); sync(); } });
            select.focus = function (o) { trig.focus(o); };
            if (select.id) document.querySelectorAll('label[for="' + select.id + '"]').forEach(function (l) { l.addEventListener('click', function () { trig.focus(); }); });
            select.addEventListener('change', sync);
            new MutationObserver(function () { sync(); if (pop) { render(); place(); } })
                .observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'aria-label'] });
            sync();
        }

        document.addEventListener('pointerdown', function (e) {
            const o = DS.open;
            if (o && !o.pop.contains(e.target) && !o.trig.contains(e.target)) o.close();
        }, true);
        window.addEventListener('scroll', function (e) { if (DS.open && !DS.open.pop.contains(e.target)) DS.open.place(); }, true);
        window.addEventListener('resize', function () { if (DS.open) DS.open.place(); });
        document.addEventListener('reset', function (e) {
            setTimeout(function () { e.target.querySelectorAll && e.target.querySelectorAll('select.ds-native').forEach(function (s) { if (s.__ds) s.__ds.sync(); }); }, 0);
        }, true);
        new MutationObserver(function (recs) {
            recs.forEach(function (r) {
                r.addedNodes.forEach(function (n) {
                    if (n.nodeType !== 1) return;
                    if (n.tagName === 'SELECT') dsEnhance(n);
                    else if (n.querySelectorAll) n.querySelectorAll('select').forEach(dsEnhance);
                });
            });
        }).observe(document.body, { childList: true, subtree: true });
        document.querySelectorAll('select').forEach(dsEnhance);

        // ===== Fayl yuklab olish (PDF / XLSX): tokenli so'rov -> blob =====
        async function downloadFile(path, fallbackName, btn) {
            const token = storageGet(TOKEN_KEY);
            if (!token) return handleSessionExpired(reopenDash);
            if (btn) btn.disabled = true;
            try {
                let res;
                try { res = await fetch(API_URL + path, { headers: { Authorization: 'Bearer ' + token } }); }
                catch (e) { throw { status: 0, message: "Serverga ulanib bo'lmadi. Internet aloqasini tekshiring." }; }
                if (res.status === 401) return handleSessionExpired(reopenDash);
                if (!res.ok) {
                    let msg = res.status === 404 ? 'Hujjat topilmadi (to\'lov hali boshlanmagan bo\'lishi mumkin).' : "Faylni yuklab bo'lmadi.";
                    try { const j = await res.json(); if (j && j.message) msg = [].concat(j.message)[0]; } catch (e) {}
                    throw { status: res.status, message: msg };
                }
                const blob = await res.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = fallbackName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
                showToast('Fayl yuklab olindi', 2800, 'success');
            } catch (err) {
                showToast(err.message || "Faylni yuklab bo'lmadi.", 4800, 'error');
            } finally {
                if (btn) btn.disabled = false;
            }
        }
        function docButton(icon, label, cls, path, name) {
            const b = el('button', ['flex-1 min-w-[8.5rem] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold border transition disabled:opacity-50', cls].join(' '));
            b.type = 'button';
            b.appendChild(el('i', ['fa-solid', icon].join(' ')));
            b.appendChild(el('span', '', label));
            b.addEventListener('click', function () { downloadFile(path, name, b); });
            return b;
        }
        // TTN va chek tugmalari (yuk kartochkasi uchun)
        function buildDocActions(s) {
            const row = el('div', 'flex flex-wrap gap-2 pt-1 border-t border-white/10');
            const code = s.id.slice(0, 8).toUpperCase();
            row.appendChild(docButton('fa-file-pdf', 'TTN yuklab olish (PDF)', 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10', '/documents/ttn/' + s.id, 'TTN-' + code + '.pdf'));
            if (s.paymentStatus) row.appendChild(docButton('fa-receipt', 'Chek (PDF)', 'border-sky-500/40 text-sky-300 hover:bg-sky-500/10', '/documents/receipt/' + s.id, 'Chek-' + code + '.pdf'));
            return row;
        }
        const XLSX_NAME = function (kind, suffix) { return 'AgrarGo-' + kind + '-' + suffix + '.xlsx'; };
        function excelButton(path, name) {
            const b = actionBtn('fa-file-excel', "Excel'ga yuklash (.xlsx)", false, function () { downloadFile(path, name, b); });
            b.classList.add('!border-emerald-500/40', '!text-emerald-300');
            return b;
        }
        // Market: oy tanlab hisobot yuklash
        function marketReportBar() {
            const wrap = el('div', 'flex flex-wrap items-end gap-3 glass rounded-2xl border border-white/10 p-4');
            const sel = el('select', 'auth-input');
            sel.id = 'rep-month';
            sel.setAttribute('aria-label', 'Hisobot davri');
            const now = new Date();
            for (let i = 0; i < 12; i++) {
                const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
                const v = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
                const o = el('option', '', v); o.value = v; sel.appendChild(o);
            }
            const all = el('option', '', 'Barcha vaqt'); all.value = 'all'; sel.appendChild(all);
            const f = el('div', 'min-w-[11rem]');
            f.appendChild(el('label', 'block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5', 'Hisobot davri'));
            f.lastChild.htmlFor = 'rep-month';
            f.appendChild(sel);
            wrap.appendChild(f);
            const btn = excelButton('/reports/market.xlsx', 'AgrarGo-market.xlsx');
            btn.addEventListener('click', function (e) { e.stopImmediatePropagation(); downloadFile('/reports/market.xlsx?month=' + encodeURIComponent(sel.value), XLSX_NAME('market', sel.value), btn); }, true);
            wrap.appendChild(btn);
            wrap.appendChild(el('p', 'text-xs text-slate-400 basis-full', "Fayl: xulosa, bronlar, to'lovlar (Escrow holati bilan) va ombor buyurtmalari."));
            return wrap;
        }

        // ===== Mintaqaviy agro-ob-havo vidjeti (Open-Meteo; tarmoq bo'lmasa keshdan / zaxira ma'lumotdan) =====
        const WX_COORDS = {
            'Toshkent shahri': [41.31, 69.24], 'Toshkent viloyati': [41.47, 69.58], 'Andijon': [40.78, 72.34], 'Buxoro': [39.77, 64.42],
            "Farg'ona": [40.38, 71.78], 'Jizzax': [40.12, 67.83], 'Namangan': [41.0, 71.67], 'Navoiy': [40.1, 65.37],
            'Qashqadaryo': [38.86, 65.79], "Qoraqalpog'iston": [42.46, 59.61], 'Samarqand': [39.65, 66.96], 'Sirdaryo': [40.49, 68.78],
            'Surxondaryo': [37.22, 67.28], 'Xorazm': [41.55, 60.63]
        };
        const WX_TTL = 3 * 3600 * 1000, WX_STALE = 24 * 3600 * 1000;
        const WX_KIND = function (code) {
            if (code >= 95) return { k: 'storm', ic: 'fa-cloud-bolt', t: 'Momaqaldiroq' };
            if (code >= 85 || (code >= 71 && code <= 77)) return { k: 'snow', ic: 'fa-snowflake', t: 'Qor' };
            if ((code >= 80 && code <= 82) || (code >= 61 && code <= 67)) return { k: 'rain', ic: 'fa-cloud-showers-heavy', t: "Yomg'ir" };
            if (code >= 51 && code <= 57) return { k: 'rain', ic: 'fa-cloud-rain', t: "Mayda yomg'ir" };
            if (code === 45 || code === 48) return { k: 'fog', ic: 'fa-smog', t: 'Tuman' };
            if (code === 3) return { k: 'cloud', ic: 'fa-cloud', t: 'Bulutli' };
            if (code === 1 || code === 2) return { k: 'part', ic: 'fa-cloud-sun', t: 'Qisman bulutli' };
            return { k: 'clear', ic: 'fa-sun', t: 'Ochiq' };
        };
        // Zaxira (tarmoq ham, kesh ham bo'lmaganda): oy bo'yicha o'rtacha iqlim, yog'in yo'q deb olinadi
        function wxFallback(region, now) {
            const HIGH = [4, 8, 15, 22, 28, 34, 36, 34, 29, 21, 13, 6];
            const off = { 'Surxondaryo': 3, 'Qashqadaryo': 2, 'Buxoro': 2, 'Xorazm': 0, "Qoraqalpog'iston": -2, 'Samarqand': -1, 'Namangan': 0, "Farg'ona": 1, 'Andijon': 0, 'Jizzax': 1, 'Navoiy': 1, 'Sirdaryo': 1 }[region] || 0;
            const days = [];
            for (let i = 0; i < 5; i++) {
                const d = new Date(now.getTime() + i * 86400000);
                const wob = [0, 1, -1, 2, 0][i];
                const hi = HIGH[d.getMonth()] + off + wob;
                days.push({ date: d.toISOString().slice(0, 10), code: 1, tmax: hi, tmin: hi - 11, precip: 0, snow: 0, wind: 14 });
            }
            return days;
        }
        function wxParse(j) {
            const d = j && j.daily;
            if (!d || !d.time) throw new Error('bad');
            return d.time.map(function (t, i) {
                return { date: t, code: d.weather_code[i], tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], precip: d.precipitation_sum[i] || 0, snow: d.snowfall_sum[i] || 0, wind: d.wind_speed_10m_max[i] || 0 };
            }).slice(0, 5);
        }
        // Natija: { days, source: 'live' | 'cache' | 'fallback' }
        async function loadWeather(region) {
            const key = 'agrargo_wx_' + region;
            let cached = null;
            try { cached = JSON.parse(storageGet(key)); } catch (e) {}
            if (cached && Date.now() - cached.at < WX_TTL && navigator.onLine !== false) return { days: cached.days, source: 'live' };
            const c = WX_COORDS[region] || WX_COORDS['Toshkent shahri'];
            try {
                const ctl = new AbortController();
                const to = setTimeout(function () { ctl.abort(); }, 7000);
                const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + c[0] + '&longitude=' + c[1]
                    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max&timezone=Asia%2FTashkent&forecast_days=5&wind_speed_unit=kmh';
                const res = await fetch(url, { signal: ctl.signal });
                clearTimeout(to);
                if (!res.ok) throw new Error('http');
                const days = wxParse(await res.json());
                storageSet(key, JSON.stringify({ at: Date.now(), days: days }));
                return { days: days, source: 'live' };
            } catch (e) {
                if (cached && Date.now() - cached.at < WX_STALE) return { days: cached.days, source: 'cache' };
                return { days: wxFallback(region, new Date()), source: 'fallback' };
            }
        }

        // Agro-logistik maslahatlar (sof funksiya: kunlar + rol -> ro'yxat). role: 'FARMER' | 'DRIVER' | boshqa
        function wxAdvice(days, role, dayLabel) {
            const groups = {};
            days.forEach(function (d, i) {
                const kind = WX_KIND(d.code).k;
                const lab = dayLabel(d, i);
                const add = function (key, extra) { (groups[key] = groups[key] || { days: [], extra: extra }).days.push(lab); };
                if (kind === 'storm') add('storm');
                if (kind === 'snow' || d.snow > 0.2) add('snow');
                else if (kind === 'rain' || d.precip >= 1) add('rain');
                if (d.tmin <= 0) add('frost', Math.round(d.tmin));
                if (d.tmax >= 36) add('heat', Math.round(d.tmax));
                if (d.wind >= 45) add('wind');
            });
            const out = [];
            const days_ = function (g) { return g.days.join(', '); };
            if (groups.storm) out.push({ level: 'danger', icon: 'fa-cloud-bolt', text: T("{0}: momaqaldiroq kutilmoqda. Yo'lga chiqishni kechiktirish yoki xavfsiz joyda to'xtash tavsiya etiladi.", days_(groups.storm)) });
            if (groups.snow) out.push({ level: 'danger', icon: 'fa-snowflake', text: T("{0}: qor kutilmoqda. Yukni yopiq kuzovda tashish tavsiya etiladi, yo'llarda ehtiyot bo'ling.", days_(groups.snow)) });
            if (groups.rain) out.push({ level: 'warn', icon: 'fa-cloud-rain', text: T("{0}: yomg'ir kutilmoqda. Yukni yopiq kuzovda tashish tavsiya etiladi.", days_(groups.rain)) });
            if (groups.frost) {
                out.push({ level: 'danger', icon: 'fa-temperature-arrow-down', text: T("{0}: muzlama xavfi ({1}°C gacha). Yo'llarda muzlama xavfi bor, tezlikni kamaytiring.", days_(groups.frost), groups.frost.extra) });
                if (role === 'FARMER') out.push({ level: 'warn', icon: 'fa-seedling', text: T("Sovuqda nozik ekin va mahsulotlarni himoya qiling, tashishda izolyatsiyalangan kuzovdan foydalaning.") });
            }
            if (groups.heat) out.push({ level: 'warn', icon: 'fa-temperature-arrow-up', text: T("{0}: jazirama ({1}°C). Tez buziladigan mahsulotlarni sovutgichli yoki soyali kuzovda tashing.", days_(groups.heat), groups.heat.extra) });
            if (groups.wind) out.push({ level: 'warn', icon: 'fa-wind', text: T("{0}: kuchli shamol kutilmoqda. Ochiq kuzovdagi yukni mahkam bog'lang.", days_(groups.wind)) });
            if (!out.length) out.push({ level: 'ok', icon: 'fa-circle-check', text: T("Yaqin kunlarda xavfli ob-havo kutilmayapti. Yuk tashish uchun qulay.") });
            return out;
        }

        function wxRegionFor(user) {
            const saved = storageGet('agrargo_wx_region');
            if (saved && WX_COORDS[saved]) return saved;
            const u = user || getStoredUser() || {};
            const p = u.farmer || u.driver || u.market;
            if (p && p.region && WX_COORDS[p.region]) return p.region;
            return 'Toshkent shahri';
        }

        function buildWeatherWidget(opts) {
            const o = opts || {};
            const role = o.role || null;
            const box = el('section', 'wx space-y-4');
            box.setAttribute('aria-label', 'Ob-havo');
            const head = el('div', 'flex flex-wrap items-center justify-between gap-3');
            const ttl = el('div', 'space-y-0.5');
            ttl.appendChild(el('h3', 'text-lg font-extrabold text-white flex items-center gap-2', ''));
            ttl.firstChild.appendChild(el('i', 'fa-solid fa-cloud-sun text-amber-300'));
            ttl.firstChild.appendChild(el('span', '', 'Agro ob-havo: 5 kunlik prognoz'));
            const src = el('p', 'text-xs text-slate-400');
            ttl.appendChild(src);
            head.appendChild(ttl);
            const sel = el('select', 'auth-input sm:!w-auto sm:min-w-[13rem]');
            sel.setAttribute('aria-label', 'Viloyat');
            Object.keys(WX_COORDS).forEach(function (r) { const op = el('option', '', r); op.value = r; sel.appendChild(op); });
            const region = wxRegionFor(o.user);
            sel.value = region;
            head.appendChild(sel);
            box.appendChild(head);
            const body = el('div', 'space-y-4');
            box.appendChild(body);

            const locale = { uz: 'uz', ru: 'ru', en: 'en' }[(window.I18N && I18N.lang) || 'uz'] || 'uz';
            const dayName = function (d, i) {
                if (i === 0) return T('Bugun');
                if (i === 1) return T('Ertaga');
                const wd = new Date(d.date + 'T12:00:00').getDay();
                if (locale === 'uz') return ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'][wd]; // ICU'da 'uz' bo'lmasa ham to'g'ri chiqadi
                try { return new Date(d.date + 'T12:00:00').toLocaleDateString(locale, { weekday: 'short' }); } catch (e) { return d.date.slice(5); }
            };
            let seq = 0;
            const load = async function () {
                const my = ++seq;
                body.replaceChildren(el('div', 'sk-card h-72'));
                const r = await loadWeather(sel.value);
                if (my !== seq) return;
                src.textContent = r.source === 'live' ? T("Open-Meteo: jonli ma'lumot") : r.source === 'cache' ? T("Oxirgi saqlangan ma'lumot (tarmoq yo'q)") : T("Taxminiy zaxira ma'lumot (tarmoq yo'q)");
                const advice = wxAdvice(r.days, role, dayName);
                const grid = el('div', 'wx-days');
                r.days.forEach(function (d, i) {
                    const k = WX_KIND(d.code);
                    const risky = d.tmin <= 0 || d.precip >= 1 || d.snow > 0.2 || d.tmax >= 36 || d.wind >= 45 || k.k === 'storm';
                    const c = el('div', ['wx-day', i === 0 ? 'today' : '', risky ? 'risk' : ''].join(' '));
                    c.appendChild(el('div', 'text-xs font-bold uppercase tracking-wider text-slate-300', dayName(d, i)));
                    const ic = el('span', 'wx-ic');
                    ic.title = T(k.t);
                    ic.appendChild(el('i', ['fa-solid', k.ic, k.k === 'clear' ? 'text-amber-300' : k.k === 'snow' ? 'text-sky-200' : k.k === 'rain' || k.k === 'storm' ? 'text-sky-400' : 'text-slate-300'].join(' ')));
                    c.appendChild(ic);
                    c.appendChild(el('div', 'text-base font-black text-white', Math.round(d.tmax) + '°'));
                    c.appendChild(el('div', 'text-xs font-semibold text-slate-400', Math.round(d.tmin) + '°'));
                    c.appendChild(el('div', 'text-[11px] text-sky-300 mt-1 min-h-[1rem]', d.precip >= 0.1 ? T('{0} mm', d.precip.toFixed(1)) : ''));
                    grid.appendChild(c);
                });
                const list = el('div', 'space-y-2');
                advice.forEach(function (a) {
                    const row = el('div', ['wx-adv', a.level === 'danger' ? 'danger' : a.level === 'ok' ? 'ok' : ''].join(' '));
                    row.appendChild(el('i', ['fa-solid', a.icon, 'mt-0.5'].join(' ')));
                    row.appendChild(el('span', 'min-w-0', a.text));
                    list.appendChild(row);
                });
                body.replaceChildren(grid, list);
            };
            sel.addEventListener('change', function () { storageSet('agrargo_wx_region', sel.value); load(); });
            box.__load = load;
            load();
            return box;
        }
        // Bosh sahifa: bo'lim ko'ringanda yuklanadi (keraksiz tarmoq so'rovi bo'lmasin)
        (function () {
            const host = document.getElementById('weather-landing');
            if (!host) return;
            const start = function () { host.replaceChildren(buildWeatherWidget({ role: (getStoredUser() || {}).role })); };
            if (!('IntersectionObserver' in window)) return start();
            const io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: '300px' });
            io.observe(host);
        })();

        // ===== PWA oflayn so'rovlar navbati (IndexedDB) =====
        // Internet yo'q (dalada) bo'lsa fermer/haydovchi amallari qotmasdan mahalliy saqlanadi va aloqa tiklangach serverga yuboriladi.
        const OQ_ROUTES = [
            ['POST', /^\/products$/, "E'lon yaratish"], ['PUT', /^\/products\/[\w-]+$/, "E'lonni tahrirlash"], ['DELETE', /^\/products\/[\w-]+$/, "E'lonni o'chirish"],
            ['PATCH', /^\/bookings\/[\w-]+\/(approve|reject)$/, 'Bronga javob'],
            ['POST', /^\/shipments\/[\w-]+\/(accept|release)$/, 'Yuk amali'], ['PATCH', /^\/shipments\/[\w-]+\/advance$/, 'Yuk holati'],
            ['POST', /^\/shipments\/[\w-]+\/location$/, 'GPS nuqtasi'], ['POST', /^\/warehouse\/items$/, 'Omborga yuk e\'loni']
        ];
        const OQ_MAX_GPS = 200;
        const oq = { db: null, busy: false, count: 0 };
        function oqRoute(method, path) {
            return OQ_ROUTES.find(function (r) { return r[0] === method && r[1].test(path); }) || null;
        }
        function oqDb() {
            if (oq.db) return Promise.resolve(oq.db);
            return new Promise(function (resolve) {
                if (!window.indexedDB) return resolve(null);
                let rq;
                try { rq = indexedDB.open('agrargo-offline', 1); } catch (e) { return resolve(null); }
                rq.onupgradeneeded = function () { rq.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true }); };
                rq.onsuccess = function () { oq.db = rq.result; resolve(oq.db); };
                rq.onerror = rq.onblocked = function () { resolve(null); };
            });
        }
        function oqTx(mode, fn) {
            return oqDb().then(function (db) {
                if (!db) return null;
                return new Promise(function (resolve) {
                    let out;
                    const tx = db.transaction('queue', mode);
                    const st = tx.objectStore('queue');
                    out = fn(st);
                    tx.oncomplete = function () { resolve(out && 'result' in out ? out.result : out); };
                    tx.onerror = tx.onabort = function () { resolve(null); };
                });
            });
        }
        const oqAll = function () { return oqTx('readonly', function (s) { return s.getAll(); }).then(function (r) { return r || []; }); };
        const oqDel = function (id) { return oqTx('readwrite', function (s) { return s.delete(id); }); };
        function oqRefresh() {
            return oqAll().then(function (items) {
                const u = currentUser();
                oq.count = items.filter(function (i) { return u && i.userId === u.id; }).length;
                oqPill();
                return items;
            });
        }
        function oqPill(state) {
            let p = document.getElementById('oq-pill');
            if (!p) {
                p = el('div', 'oq-pill');
                p.id = 'oq-pill';
                p.setAttribute('role', 'status');
                document.body.appendChild(p);
            }
            const offline = navigator.onLine === false;
            p.classList.toggle('sync', state === 'sync');
            if (state === 'sync') { p.replaceChildren(el('i', 'fa-solid fa-rotate fa-spin'), el('span', '', 'Sinxronlanmoqda...')); p.classList.add('show'); return; }
            if (!offline && !oq.count) { p.classList.remove('show'); return; }
            const parts = [el('i', ['fa-solid', offline ? 'fa-wifi' : 'fa-cloud-arrow-up'].join(' '))];
            parts.push(el('span', '', offline ? T('Oflayn rejim') : T('Yuborilmoqda')));
            if (oq.count) parts.push(el('span', 'opacity-80', T('· {0} ta amal kutmoqda', oq.count)));
            p.replaceChildren.apply(p, parts);
            p.classList.add('show');
        }
        // apiRequest tarmoq xatosida chaqiradi: amalni saqlab, marker qaytaradi (yo'q bo'lsa null)
        async function oqEnqueue(method, path, payload) {
            const route = oqRoute(method, path), u = currentUser();
            if (!route || !u) return null;
            const gps = /\/location$/.test(path);
            if (gps) {
                const items = await oqAll();
                const mine = items.filter(function (i) { return /\/location$/.test(i.path) && i.userId === u.id; });
                if (mine.length >= OQ_MAX_GPS) await oqDel(mine[0].id); // GPS: eng eskilari tashlab yuboriladi
            }
            const ok = await oqTx('readwrite', function (s) { return s.add({ method: method, path: path, payload: payload === undefined ? null : payload, userId: u.id, label: route[2], createdAt: Date.now(), gps: gps }); });
            if (ok === null) return null;
            await oqRefresh();
            if (!gps) showToast(T("Oflayn saqlandi: «{0}». Internet tiklanganda avtomatik yuboriladi.", route[2]), 4800, 'warning');
            try { navigator.serviceWorker.ready.then(function (r) { if (r.sync) r.sync.register('agrargo-flush'); }); } catch (e) {}
            return { __queued: true };
        }
        async function oqFlush() {
            if (oq.busy || navigator.onLine === false) return;
            const token = storageGet(TOKEN_KEY), u = currentUser();
            if (!token || !u) return;
            oq.busy = true;
            let synced = 0, dropped = 0;
            try {
                const items = (await oqAll()).filter(function (i) { return i.userId === u.id; }).sort(function (a, b) { return a.id - b.id; });
                if (!items.length) return;
                oqPill('sync');
                for (const it of items) {
                    try {
                        await apiRequest(it.method, it.path, it.payload === null ? undefined : it.payload, token, { noQueue: true });
                        await oqDel(it.id);
                        if (!it.gps) synced++;
                    } catch (err) {
                        if (err.status === 0 || err.status >= 500 || err.status === 401 || err.status === 429) break; // keyinroq qayta uriniladi
                        await oqDel(it.id); // 4xx: ma'lumot eskirgan (masalan, bron allaqachon hal qilingan)
                        if (!it.gps) dropped++;
                    }
                }
            } finally {
                oq.busy = false;
                await oqRefresh();
            }
            if (synced) {
                showToast("Oflayn saqlangan ma'lumotlar server bilan sinxronlashtirildi", 4200, 'success');
                sfx.play('sync');
                if (dashboardView.classList.contains('open')) selectDashTab(dashTab);
                if (typeof loadMarket === 'function') loadMarket();
            }
            if (dropped) showToast(T("{0} ta oflayn amal bajarilmadi (ma'lumot allaqachon o'zgargan).", dropped), 5200, 'warning');
        }
        window.addEventListener('online', function () { showToast('Internet aloqasi tiklandi', 2600, 'info'); oqPill(); oqFlush(); });
        window.addEventListener('offline', function () { showToast("Internet uzildi. Amallar oflayn saqlanadi va keyin yuboriladi.", 4200, 'warning'); oqPill(); });
        if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'flush-queue') oqFlush(); });
        setInterval(function () { if (oq.count) oqFlush(); }, 30000);
        setTimeout(function () { oqRefresh().then(function () { if (oq.count) oqFlush(); }); }, 2500);

        // ----- Tovush sozlamasi (profil) -----
        function buildSoundCard() {
            const card = el('div', 'glass rounded-3xl border border-white/10 p-6 flex flex-wrap items-center justify-between gap-4');
            const l = el('div', 'space-y-1 min-w-0');
            l.appendChild(el('h4', 'font-extrabold text-white flex items-center gap-2', ''));
            l.firstChild.appendChild(el('i', 'fa-solid fa-music text-emerald-400'));
            l.firstChild.appendChild(el('span', '', 'Tovush effektlari'));
            l.appendChild(el('p', 'text-sm text-slate-400', "Muhim amallar (bron, narx, obuna to'lovi) bajarilganda qisqa signal chalinadi."));
            card.appendChild(l);
            const r = el('div', 'flex items-center gap-3');
            const test = el('button', 'px-4 py-2 rounded-xl border border-white/15 text-slate-300 text-sm font-bold hover:border-emerald-500/50 hover:text-emerald-400 transition', 'Tinglab ko\'rish');
            test.type = 'button';
            test.addEventListener('click', function () { const was = sfx.on; sfx.on = true; sfx.play('success'); sfx.on = was; if (!was) showToast("Tovush hozir o'chirilgan", 2400, 'info'); });
            r.appendChild(test);
            const sw = el('button', 'w-12 h-12 rounded-2xl border border-emerald-500/40 text-emerald-300 text-lg hover:bg-emerald-500/10 transition');
            sw.type = 'button';
            sw.dataset.sfxToggle = '1';
            sw.appendChild(el('i', 'fa-solid fa-volume-high'));
            syncSoundToggle(sw);
            sw.addEventListener('click', function () { sfx.set(!sfx.on); });
            r.appendChild(sw);
            card.appendChild(r);
            return card;
        }

        document.querySelectorAll('[data-sfx-toggle]').forEach(syncSoundToggle);
        // ===== Davlat raqami maskasi: faqat KATTA lotin harflari va raqamlar (01A777AA yoki 70777AAA) =====
        const PLATE_RE = /^\d{2}(?:[A-Z]\d{3}[A-Z]{2}|\d{3}[A-Z]{3})$/;
        function maskPlate(raw) {
            const chars = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
            let out = '';
            for (let i = 0; i < chars.length && out.length < 8; i++) {
                const ch = chars[i], isDigit = ch >= '0' && ch <= '9', pos = out.length;
                let ok;
                if (pos < 2) ok = isDigit;
                else if (pos === 2) ok = true; // harf (01A777AA) yoki raqam (70777AAA)
                else if (/[A-Z]/.test(out[2])) ok = pos <= 5 ? isDigit : !isDigit; // 01A 777 AA
                else ok = pos <= 4 ? isDigit : !isDigit; // 70 777 AAA
                if (ok) out += ch;
            }
            return out;
        }
        function bindPlateMask(input) {
            if (!input || input.__plate) return;
            input.__plate = true;
            input.maxLength = 8;
            input.placeholder = '01A777AA';
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.setAttribute('autocapitalize', 'characters');
            input.setAttribute('aria-describedby', 'plate-hint');
            input.title = '01A777AA yoki 70777AAA';
            const apply = function () {
                const v = maskPlate(input.value);
                if (v !== input.value) { input.value = v; try { input.setSelectionRange(v.length, v.length); } catch (e) {} }
            };
            input.addEventListener('input', apply);
            input.addEventListener('paste', function (e) {
                e.preventDefault();
                const t = (e.clipboardData || window.clipboardData).getData('text');
                const a = input.selectionStart || 0, b = input.selectionEnd || 0;
                input.value = maskPlate(input.value.slice(0, a) + t + input.value.slice(b));
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            apply();
        }
        bindPlateMask(document.getElementById('drv-plateNumber'));

        // ===== Ishonchlilik statusi, badjlar =====
        const BADGE_META = {
            verified_pro: ['Tasdiqlangan Haydovchi (Verified Pro)', "ID karta, guvohnoma, tex-pasport va Face ID'dan muvaffaqiyatli o'ting."],
            speedy: ['Eng Tezkor (Speedy Delivery)', "10 ta yukni o'z vaqtida yoki tezroq yetkazing."],
            safe_hauler: ['Eng Xavfsiz (Safe Hauler)', "25 ta qatnovda yukka biror marta zarar yetkazmang."],
            rookie: ['Boshlovchi Haydovchi (Rookie Driver)', "Birinchi muvaffaqiyatli reysni yakunlang."],
            master_driver: ['Usta Haydovchi (Master Driver)', "25 ta muvaffaqiyatli reys bajaring."],
            legendary_pro: ['Afsonaviy Haydovchi (Legendary Pro)', "100 ta reys va 4.9+ reytingga erishing."],
            night_rider: ['Kecha Qahramoni (Night Rider)', "Tunda (22:00–06:00) 5 ta uzoq (200+ km) reysga chiqing."],
            reefer_expert: ['Muzqaymoq Ustasi (Reefer Expert)', "Sovutgichli (Reefer) tirkama bilan 10 ta sifatli yetkazib bering."],
            eco_return: ['Qaytmas Eko-Haydovchi (Eco-Return)', "Bo'sh qaytmasdan, qaytishda 10 marta yuk topib tashing."],
            top_rated: ['Yil Haydovchisi (Top Rated)', "50 ta 5 yulduzli baho oling."],
            long_distance: ["Uzoq Yo'l Ustasi (Long Distance)", "Jami 3000+ km masofani bosib o'ting."],
            eld_master: ['Intizomli Operator (ELD Master)', "ELD jurnalini 14 kun uzluksiz to'liq yuriting."],
            friendly: ["Do'stona Muloqot (Friendly Driver)", "Mijozlardan 15 ta «Juda xushmuomala» tegi oling."],
            emergency: ['Favqulodda Yordamchi (Emergency Transporter)', "Shoshilinch bronlarni 5 marta muvaffaqiyatli bajaring."],
            vip_champion: ['AgrarGo Faxri (VIP Champion)', "Hujjatlar tasdiqlangan, 1 yillik faol obuna va 50+ reys."],
            quality_guarantee: ['Sifat Kafolati', "10 va undan ko'p baho, o'rtacha 4.7+."],
            big_harvest: ["Katta Hosil do'sti", "Jami 50 000 kg (50 tonna) yukni yetkazing."],
            honest_farmer: ['Halol Fermer', "Tasdiqlangan, 10 ta bitim, bronlarni rad etish ulushi 10% dan kam."],
            fast_loader: ['Tezkor Yuklovchi', "10 ta bronni 2 soat ichida tasdiqlang."],
            escrow_master: ["Kafolatlangan To'lovchi (Escrow Master)", "10 ta to'lov Escrow'ga o'tgan va birortasi qaytarilmagan."],
            bulk_buyer: ['Ulgurji Xaridor', "Jami 20 000 kg yukni qabul qiling."],
            reliable_partner: ['Ishonchli Hamkor', "10 ta bitim va 4.5+ reyting (kamida 5 ta baho)."]
        };
        const TIER_LABEL = { master: 'Master', pro: 'Pro', legendary: 'Legendary' };
        const TRUST_STATUS = { NEW: ['🟢', 'Yangi'], REGULAR: ['🔵', 'Doimiy'], VETERAN: ['👑', 'Qadrdon'] };
        const TRUST_RANK = { LEGENDARY: 'Legendary Pro', MASTER: 'Master Pro', ROOKIE: 'Rookie' };
        const BADGE_ICON = { verified_pro: '🆔', speedy: '⚡', safe_hauler: '🛡', rookie: '🥉', master_driver: '🥈', legendary_pro: '🥇', night_rider: '🌙', reefer_expert: '❄️', eco_return: '🔄', top_rated: '🌟', long_distance: '🛣', eld_master: '📋', friendly: '🤝', emergency: '🚀', vip_champion: '🏛', quality_guarantee: '🌾', big_harvest: '🚜', honest_farmer: '🏅', fast_loader: '⚡', escrow_master: '💰', bulk_buyer: '🛒', reliable_partner: '🤝' };

        let trustMe = null;
        async function loadTrustMe() {
            try { trustMe = await authed('GET', '/trust/me'); } catch (err) { /* ko'rsatilmaydi */ }
            return trustMe;
        }
        function statusChip(status) {
            const m = TRUST_STATUS[status] || TRUST_STATUS.NEW;
            const c = el('span', ['tr-chip', status].join(' '));
            c.appendChild(el('span', '', m[0]));
            c.appendChild(el('span', '', m[1]));
            return c;
        }
        function verifiedMark() {
            const v = el('span', 'tr-check');
            v.title = T('Tasdiqlangan');
            v.appendChild(el('i', 'fa-solid fa-check'));
            return v;
        }
        // Haydovchi kartochkasi uchun ommaviy ishonch qatori: status, top-3 badj, daraja va ochilgan badjlar soni
        function trustLine(t) {
            const row = el('div', 'flex flex-wrap items-center gap-2 pt-1.5');
            if (!t) return row;
            row.appendChild(statusChip(t.status));
            (t.topBadges || []).forEach(function (id) {
                const b = el('span', 'tr-mini', BADGE_ICON[id] || '🏅');
                b.title = T((BADGE_META[id] || [id])[0]);
                row.appendChild(b);
            });
            const rank = T(t.rank ? TRUST_RANK[t.rank] : 'Yangi haydovchi');
            row.appendChild(el('span', 'text-[11px] font-bold text-slate-300', T('{0} • {1}/{2} badjlar ochilgan', rank, t.unlocked, t.total)));
            return row;
        }
        function decorateDriverBox(box, t) {
            if (!t) return box;
            const who = box.firstChild;
            const name = who.children[1];
            if (t.verified && name) { name.classList.remove('truncate'); name.appendChild(verifiedMark()); }
            who.appendChild(trustLine(t));
            return box;
        }
        function trustText(t) {
            if (!t) return '';
            return ' · ' + (t.verified ? '✔ ' : '') + TRUST_STATUS[t.status][0] + ' ' + T(TRUST_STATUS[t.status][1]) + ' · ' + T('{0} • {1}/{2} badjlar ochilgan', T(t.rank ? TRUST_RANK[t.rank] : 'Yangi haydovchi'), t.unlocked, t.total);
        }

        function badgeCard(b, fresh) {
            const meta = BADGE_META[b.id] || [b.id, ''];
            const c = el('article', ['bdg', b.tier, b.unlocked ? 'unlocked' : 'locked', fresh ? 'fresh' : ''].join(' '));
            c.appendChild(el('span', 'bdg-tier', TIER_LABEL[b.tier]));
            c.appendChild(el('div', 'bdg-ico', BADGE_ICON[b.id] || '🏅'));
            c.appendChild(el('h4', '', meta[0]));
            c.appendChild(el('p', '', meta[1]));
            const bar = el('div', 'bdg-bar');
            const fill = el('i');
            fill.style.width = '0%';
            bar.appendChild(fill);
            c.appendChild(bar);
            const big = b.target >= 1000;
            c.appendChild(el('div', 'bdg-cnt', b.unlocked ? T('Ochildi ✓') : formatNumber(Math.min(b.current, b.target)) + ' / ' + formatNumber(b.target) + (big && b.id === 'long_distance' ? ' km' : '')));
            requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = Math.round((b.unlocked ? 1 : b.progress) * 100) + '%'; }); });
            return c;
        }

        function trustRing(t) {
            const C = 2 * Math.PI * 52;
            const wrap = el('div', 'tr-ring');
            wrap.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="52" fill="none" stroke-width="9"/><circle class="val" cx="60" cy="60" r="52" fill="none" stroke-width="9" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/></svg>';
            const mid = el('div', 'mid');
            mid.appendChild(el('div', 'text-3xl font-black text-white', t.unlocked + '/' + t.total));
            mid.appendChild(el('div', 'text-[10px] font-bold uppercase tracking-wider text-slate-400', 'badjlar'));
            wrap.appendChild(mid);
            requestAnimationFrame(function () { requestAnimationFrame(function () { wrap.querySelector('.val').setAttribute('stroke-dashoffset', (C * (1 - (t.total ? t.unlocked / t.total : 0))).toFixed(1)); }); });
            return wrap;
        }

        async function renderDashBadges(user) {
            const rid = ++dashRenderId;
            dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', 'Badjlar yuklanmoqda...'));
            const t = await loadTrustMe();
            if (rid !== dashRenderId) return;
            if (!t) return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', "Ma'lumotni yuklab bo'lmadi.", function () { renderDashBadges(user); }));
            const isDriver = user.role === 'DRIVER';
            const nodes = [sectionTitle(isDriver ? 'Mening Darajalarim va Mukofotlarim' : 'Ishonchlilik badjlari', isDriver ? "Shartlarni bajaring: qulflangan badjlar yaltirab ochiladi." : "Bitimlar, reyting va tasdiqlash asosida badjlar ochiladi.")];
            const head = el('div', 'glass rounded-3xl border border-white/10 p-6 flex flex-wrap items-center gap-6');
            head.appendChild(trustRing(t));
            const info = el('div', 'min-w-0 flex-1 basis-60 space-y-2');
            const l1 = el('div', 'flex flex-wrap items-center gap-2');
            l1.appendChild(statusChip(t.status));
            if (t.verified) { const v = el('span', ['tr-chip', 'NEW'].join(' ')); v.appendChild(el('i', 'fa-solid fa-circle-check')); v.appendChild(el('span', '', 'Tasdiqlangan')); l1.appendChild(v); }
            info.appendChild(l1);
            if (isDriver) info.appendChild(el('div', 'text-2xl font-black text-white', t.rank ? TRUST_RANK[t.rank] : 'Yangi haydovchi'));
            const stats = [];
            stats.push(T('Bitimlar: {0}', t.deals));
            if (t.rating.count) stats.push(T('Reyting: {0} ({1} baho)', t.rating.avg.toFixed(2), t.rating.count));
            stats.push(T("Akkaunt yoshi: {0} kun", t.ageDays));
            info.appendChild(el('div', 'text-sm text-slate-300', stats.join(' · ')));
            const hint = t.status === 'NEW' ? "Doimiy bo'lish: 30 kundan keyin, tasdiqlangan va 5 ta muvaffaqiyatli bitim." : t.status === 'REGULAR' ? "Qadrdon bo'lish: 180 kundan keyin, 30+ bitim va 4.8+ reyting." : "Siz eng yuqori ishonch darajasidasiz.";
            info.appendChild(el('div', 'text-xs text-slate-400', hint));
            head.appendChild(info);
            nodes.push(head);
            if (isDriver && !t.verified) {
                const cta = el('div', 'rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 flex flex-wrap items-center justify-between gap-3');
                cta.appendChild(el('span', 'text-sm font-semibold text-amber-200', "Hujjatlarni tasdiqlang: «Tasdiqlangan Haydovchi» badji va ishonch ortadi."));
                cta.appendChild(actionBtn('fa-id-card-clip', 'Shaxsni tasdiqlash', true, function () { selectDashTab('verify'); }));
                nodes.push(cta);
            }
            // Yangi ochilgan badjlar: oxirgi ko'rilgandan keyin
            const seenKey = 'agrargo_badges_seen_' + user.id;
            let seen = [];
            try { seen = JSON.parse(storageGet(seenKey)) || []; } catch (e) {}
            const fresh = t.badges.filter(function (b) { return b.unlocked && seen.indexOf(b.id) === -1; });
            const sorted = t.badges.slice().sort(function (a, b) { return (b.unlocked - a.unlocked) || (b.weight - a.weight); });
            const grid = el('div', 'bdg-grid');
            sorted.forEach(function (b) { grid.appendChild(badgeCard(b, seen.length && fresh.indexOf(b) !== -1)); });
            nodes.push(grid);
            storageSet(seenKey, JSON.stringify(t.badges.filter(function (b) { return b.unlocked; }).map(function (b) { return b.id; })));
            dashContent.replaceChildren.apply(dashContent, nodes);
            if (seen.length && fresh.length) { showToast(T('Yangi badj ochildi: {0}', T(BADGE_META[fresh[0].id][0])), 4200, 'success'); sfx.play('subscription'); }
        }

        // ===== Shaxsni tasdiqlash (KYC / Face ID simulyatsiyasi) =====
        const KYC_STEPS = [
            ['ID_CARD', 'fa-id-card', 'ID karta / Pasport', "Shaxsni tasdiqlovchi hujjatning old tomoni (aniq, yorug'da)."],
            ['DRIVER_LICENSE', 'fa-id-badge', 'Haydovchilik guvohnomasi', "Guvohnomaning old tomoni."],
            ['TECH_PASSPORT', 'fa-file-lines', 'Tex-pasport', "Transport vositasi texnik pasporti."],
            ['FACE', 'fa-face-smile', 'Face ID', "Kamerada yuzingizni skanerlang."]
        ];
        let kycState = null, kycLocal = {};
        async function kycUpload(type, file) {
            if (!file) return;
            if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return showToast('Faqat JPG, PNG yoki WEBP rasm yuklang.', 4200, 'error');
            if (file.size > 5 * 1024 * 1024) return showToast('Rasm hajmi 5 MB dan oshmasligi kerak.', 4200, 'error');
            const token = storageGet(TOKEN_KEY);
            if (!token) return handleSessionExpired(reopenDash);
            const fd = new FormData();
            fd.append('file', file, file.name || (type + '.jpg'));
            let res;
            try { res = await fetch(API_URL + '/kyc/documents/' + type, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd }); }
            catch (e) { return showToast("Serverga ulanib bo'lmadi. Internet aloqasini tekshiring.", 4600, 'error'); }
            if (res.status === 401) return handleSessionExpired(reopenDash);
            let data = null; try { data = await res.json(); } catch (e) {}
            if (!res.ok) return showToast(res.status === 413 ? 'Rasm hajmi 5 MB dan oshmasligi kerak.' : (data && data.message ? [].concat(data.message)[0] : "Yuklab bo'lmadi."), 4600, 'error');
            kycLocal[type] = URL.createObjectURL(file);
            const wasVerified = kycState && kycState.isVerified;
            kycState = data;
            if (data.isVerified && !wasVerified) {
                showSuccessCheck('Shaxs tasdiqlandi!', "«Tasdiqlangan Haydovchi» badji ochildi", 'subscription');
                try { const u = await authed('GET', '/profile'); saveUser(u); } catch (e) {}
            } else if (data.status === 'PENDING') showToast("Hujjatlar topshirildi. Administrator tekshiradi.", 4200, 'success');
            else showToast('Hujjat yuklandi', 2400, 'success');
            if (dashTab === 'verify') renderDashVerify(currentUser());
        }

        async function renderDashVerify(user) {
            const rid = ++dashRenderId;
            if (!kycState) dashContent.replaceChildren(dashMessage('fa-spinner fa-spin', "Tasdiqlash ma'lumotlari yuklanmoqda..."));
            try { kycState = await authed('GET', '/kyc'); }
            catch (err) {
                if (err.status === 401 || rid !== dashRenderId) return;
                return dashContent.replaceChildren(dashMessage('fa-triangle-exclamation text-rose-400', err.messages[0], function () { renderDashVerify(user); }));
            }
            if (rid !== dashRenderId) return;
            const k = kycState;
            const done = KYC_STEPS.filter(function (s) { return k.docs[s[0]]; }).length;
            const nodes = [sectionTitle('Shaxsni tasdiqlash', "ID karta, guvohnoma, tex-pasport va Face ID orqali tasdiqlangan haydovchi bo'ling.")];
            const tone = k.status === 'VERIFIED' ? ['border-emerald-500/50 bg-emerald-500/10 text-emerald-200', 'fa-circle-check', 'Shaxsingiz tasdiqlangan'] : k.status === 'PENDING' ? ['border-sky-500/40 bg-sky-500/10 text-sky-200', 'fa-hourglass-half', "Hujjatlar tekshirilmoqda"] : k.status === 'REJECTED' ? ['border-rose-500/50 bg-rose-500/10 text-rose-200', 'fa-circle-xmark', 'Tasdiqlash rad etildi'] : ['border-white/15 bg-white/5 text-slate-200', 'fa-shield-halved', 'Hali tasdiqlanmagan'];
            const banner = el('div', ['rounded-2xl border px-5 py-4 flex flex-wrap items-center gap-3', tone[0]].join(' '));
            banner.appendChild(el('i', ['fa-solid text-2xl', tone[1]].join(' ')));
            const bt = el('div', 'flex-1 min-w-0');
            bt.appendChild(el('div', 'font-extrabold', tone[2]));
            if (k.status === 'REJECTED' && k.rejectReason) bt.appendChild(el('div', 'text-sm', T('Sabab: {0}', k.rejectReason)));
            else if (k.status === 'VERIFIED' && k.verifiedAt) bt.appendChild(el('div', 'text-sm', T('Tasdiqlangan sana: {0}', formatDate(k.verifiedAt))));
            else bt.appendChild(el('div', 'text-sm', T('{0}/4 qadam bajarildi', done)));
            banner.appendChild(bt);
            nodes.push(banner);
            const bar = el('div', 'sub-bar');
            bar.style.maxWidth = 'none';
            const fill = el('i'); fill.style.width = (done * 25) + '%';
            bar.appendChild(fill);
            nodes.push(bar);

            const grid = el('div', 'grid sm:grid-cols-2 gap-4');
            KYC_STEPS.forEach(function (s, idx) {
                const has = !!k.docs[s[0]];
                const c = el('div', ['kyc-step', has ? 'done' : ''].join(' '));
                const top = el('div', 'flex items-center gap-3');
                const ic = el('span', ['w-11 h-11 rounded-2xl flex items-center justify-center text-lg', has ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-slate-300'].join(' '));
                ic.appendChild(el('i', ['fa-solid', has ? 'fa-check' : s[1]].join(' ')));
                top.appendChild(ic);
                const tt = el('div', 'min-w-0');
                tt.appendChild(el('div', 'text-[10px] font-bold uppercase tracking-wider text-emerald-400', T('{0}-qadam', idx + 1)));
                tt.appendChild(el('div', 'font-extrabold text-white', s[2]));
                top.appendChild(tt);
                c.appendChild(top);
                c.appendChild(el('p', 'text-sm text-slate-400', s[3]));
                if (kycLocal[s[0]]) { const im = el('img', 'kyc-thumb'); im.src = kycLocal[s[0]]; im.alt = ''; c.appendChild(im); }
                if (has) c.appendChild(el('div', 'text-xs font-semibold text-emerald-300', T('Yuklandi: {0}', formatDate(k.docs[s[0]]))));
                if (s[0] === 'FACE') {
                    c.appendChild(actionBtn('fa-camera', has ? 'Qayta skanerlash' : 'Face ID skanerlash', !has, function () { openFaceModal(); }));
                } else {
                    const input = el('input', 'sr-only');
                    input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.id = 'kyc-f-' + s[0];
                    input.addEventListener('change', function () { kycUpload(s[0], input.files[0]); });
                    const lab = el('label', ['flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-extrabold cursor-pointer transition active:scale-95', has ? 'border border-white/15 text-slate-200 hover:border-emerald-500/50' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'].join(' '));
                    lab.htmlFor = input.id;
                    lab.appendChild(el('i', 'fa-solid fa-cloud-arrow-up'));
                    lab.appendChild(el('span', '', has ? 'Qayta yuklash' : 'Rasm yuklash'));
                    c.appendChild(input);
                    c.appendChild(lab);
                }
                grid.appendChild(c);
            });
            nodes.push(grid);
            nodes.push(el('p', 'text-xs text-slate-500', "Hujjat rasmlari shifrlanmagan ommaviy papkada emas, alohida yopiq saqlanadi va faqat siz hamda administrator ko'ra oladi."));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }

        // Face ID: kamera + skanerlash animatsiyasi (simulyatsiya), oxirida kadr serverga yuboriladi
        const faceModal = document.getElementById('face-modal');
        const face = { stream: null, busy: false };
        function faceStop() {
            if (face.stream) { face.stream.getTracks().forEach(function (t) { t.stop(); }); face.stream = null; }
            const v = document.getElementById('face-video');
            v.srcObject = null; v.classList.add('hidden');
        }
        function openFaceModal() {
            const st = document.getElementById('face-stage');
            st.className = 'face-stage';
            st.style.removeProperty('--p');
            document.getElementById('face-hint').textContent = T('Kamerani yoqing va yuzingizni doira ichida ushlab turing.');
            document.getElementById('face-start').querySelector('span').textContent = T('Kamerani yoqish');
            document.getElementById('face-start').disabled = false;
            document.getElementById('face-fallback').classList.toggle('hidden', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
            document.getElementById('face-demo').classList.toggle('hidden', !(kycState && kycState.simulated));
            face.busy = false;
            faceModal.classList.add('open');
            syncScrollLock();
        }
        function closeFaceModal() {
            faceStop();
            faceModal.classList.remove('open');
            syncScrollLock();
        }
        async function faceScan() {
            const hint = document.getElementById('face-hint'), st = document.getElementById('face-stage'), btn = document.getElementById('face-start');
            const video = document.getElementById('face-video');
            if (face.busy) return;
            if (!face.stream) {
                try {
                    face.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false });
                } catch (e) {
                    hint.textContent = T("Kameraga ruxsat berilmadi. Selfi rasm yuklashingiz mumkin.");
                    document.getElementById('face-fallback').classList.remove('hidden');
                    return;
                }
                video.srcObject = face.stream;
                video.classList.remove('hidden');
                try { await video.play(); } catch (e) {}
                btn.querySelector('span').textContent = T('Skanerlashni boshlash');
                hint.textContent = T('Yuzingizni doira ichiga joylashtiring.');
                return;
            }
            face.busy = true;
            btn.disabled = true;
            st.classList.add('scan');
            const steps = [T("To'g'ri qarab turing..."), T('Sekin chapga buriling...'), T("Endi o'ngga buriling..."), T('Yaxshi! Tahlil qilinmoqda...')];
            const total = 4200, t0 = performance.now();
            await new Promise(function (resolve) {
                const tick = function (now) {
                    const p = Math.min(1, (now - t0) / total);
                    st.style.setProperty('--p', Math.round(p * 100) + '%');
                    hint.textContent = steps[Math.min(steps.length - 1, Math.floor(p * steps.length))];
                    if (p < 1) requestAnimationFrame(tick); else resolve();
                };
                requestAnimationFrame(tick);
            });
            const cv = document.createElement('canvas');
            cv.width = video.videoWidth || 480; cv.height = video.videoHeight || 480;
            cv.getContext('2d').drawImage(video, 0, 0, cv.width, cv.height);
            const blob = await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', 0.85); });
            st.classList.remove('scan'); st.classList.add('ok');
            hint.textContent = T('Yuz aniqlandi ✓');
            sfx.play('success');
            await new Promise(function (r) { setTimeout(r, 900); });
            closeFaceModal();
            if (blob) await kycUpload('FACE', new File([blob], 'face.jpg', { type: 'image/jpeg' }));
        }
        document.getElementById('face-start').addEventListener('click', faceScan);
        document.getElementById('face-file').addEventListener('change', async function (e) {
            const f = e.target.files[0];
            if (!f) return;
            closeFaceModal();
            await kycUpload('FACE', f);
            e.target.value = '';
        });

        // ===== Baholash (yetkazilgan yukdan keyin) =====
        let ratingsMine = [];
        const rateModal = document.getElementById('rate-modal');
        const rateForm = document.getElementById('rate-form');
        const rateAlert = document.getElementById('rate-alert');
        const rateState = { shipment: null, target: null, stars: 0 };
        const TARGET_LABEL = { DRIVER: 'Haydovchi', FARMER: 'Fermer', MARKET: 'Market' };
        function ratedOf(shipmentId, target) {
            return ratingsMine.find(function (r) { return r.shipmentId === shipmentId && r.targetRole === target; }) || null;
        }
        function paintStars() {
            document.querySelectorAll('#rate-stars .rate-star').forEach(function (b, i) { b.classList.toggle('on', i < rateState.stars); b.setAttribute('aria-checked', String(i + 1 === rateState.stars)); });
        }
        (function () {
            const box = document.getElementById('rate-stars');
            for (let i = 1; i <= 5; i++) {
                const b = el('button', 'rate-star');
                b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', i + ' ★');
                b.appendChild(el('i', 'fa-solid fa-star'));
                b.addEventListener('click', function () { rateState.stars = i; paintStars(); sfx.play('tick'); });
                box.appendChild(b);
            }
        })();
        function openRateModal(shipment, target) {
            rateState.shipment = shipment; rateState.target = target; rateState.stars = 0;
            hideAuthAlert(rateAlert);
            rateForm.reset();
            paintStars();
            document.getElementById('rate-sub').textContent = T('{0}ni baholang: {1}', T(TARGET_LABEL[target]), shipment.cargoName);
            document.getElementById('rate-tags').classList.toggle('hidden', target !== 'DRIVER');
            rateModal.classList.add('open');
            syncScrollLock();
        }
        function closeRateModal() { rateModal.classList.remove('open'); syncScrollLock(); }
        rateForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideAuthAlert(rateAlert);
            if (!rateState.stars) return showAuthAlert(['Yulduzchalar orqali baho bering.'], 'error', rateAlert);
            const payload = { shipmentId: rateState.shipment.id, targetRole: rateState.target, stars: rateState.stars };
            if (rateState.target === 'DRIVER') { payload.friendly = document.getElementById('rate-friendly').checked; payload.damaged = document.getElementById('rate-damaged').checked; }
            const c = document.getElementById('rate-comment').value.trim();
            if (c) payload.comment = c;
            setLoading(rateForm, true);
            try {
                await authed('POST', '/ratings', payload);
                ratingsMine.push({ shipmentId: payload.shipmentId, targetRole: payload.targetRole, stars: payload.stars });
                closeRateModal();
                showToast('Baho yuborildi. Rahmat!', 3000, 'success');
                sfx.play('success');
                if (dashTab === 'shipments' || dashTab === 'myloads') selectDashTab(dashTab);
            } catch (err) {
                if (err.status !== 401) showAuthAlert(err.messages, 'error', rateAlert);
            } finally { setLoading(rateForm, false); }
        });
        // Yetkazilgan yuk kartochkasi uchun "Baho berish" qatori
        function buildRateActions(s, viewer) {
            const targets = viewer === 'driver-own' ? ['FARMER', 'MARKET'] : viewer === 'farmer' ? ['DRIVER', 'MARKET'] : ['DRIVER', 'FARMER'];
            const row = el('div', 'flex flex-wrap items-center gap-2 pt-1');
            targets.forEach(function (tg) {
                if (tg === 'DRIVER' && !s.driver) return;
                const done = ratedOf(s.id, tg);
                const b = el('button', ['px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold border transition', done ? 'border-amber-400/40 text-amber-300 cursor-default' : 'border-amber-400/50 text-amber-300 hover:bg-amber-400/10'].join(' '));
                b.type = 'button';
                b.appendChild(el('i', 'fa-solid fa-star mr-1.5'));
                b.appendChild(el('span', '', done ? T('{0}: {1} ★', T(TARGET_LABEL[tg]), done.stars) : T('{0}ni baholash', T(TARGET_LABEL[tg]))));
                if (done) b.disabled = true; else b.addEventListener('click', function () { openRateModal(s, tg); });
                row.appendChild(b);
            });
            return row;
        }

        // ===== Administrator: KYC arizalari =====
        async function viewKycDoc(userId, type) {
            const token = storageGet(TOKEN_KEY);
            try {
                const res = await fetch(API_URL + '/kyc/' + userId + '/documents/' + type, { headers: { Authorization: 'Bearer ' + token } });
                if (!res.ok) return showToast('Hujjat topilmadi.', 3200, 'error');
                window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
            } catch (e) { showToast("Serverga ulanib bo'lmadi.", 3600, 'error'); }
        }
        async function renderAdmKyc(user) {
            const list = await admLoad(user, '', '/kyc/pending', null, function () { renderAdmKyc(user); });
            if (!list) return;
            const again = function () { renderAdmKyc(user); };
            const nodes = [admHead('KYC arizalari', again)];
            nodes.push(el('p', 'text-sm text-slate-400', "Haydovchilar yuborgan hujjatlar. Tasdiqlansa «Tasdiqlangan haydovchi» badji ochiladi."));
            nodes.push(admTable([
                ['Haydovchi', function (u) { return admName(u.fullName, u.phone + (u.plateNumber ? ' · ' + u.plateNumber : '')); }],
                ['Hujjatlar', function (u) {
                    const w = el('div', 'flex flex-wrap gap-1.5');
                    KYC_STEPS.forEach(function (s) { w.appendChild(admBtn(s[1], s[2], function () { viewKycDoc(u.id, s[0]); }, 'ok')); });
                    return w;
                }],
                ['Yuborilgan', function (u) { return admDate(u.createdAt); }],
                ['Amallar', function (u) {
                    return admActions([
                        admBtn('fa-circle-check', 'Tasdiqlash', async function () { try { await authed('POST', '/kyc/' + u.id + '/approve'); showToast('Tasdiqlandi', 2400, 'success'); again(); } catch (e) { showToast(e.messages[0], 4000, 'error'); } }, 'ok'),
                        admBtn('fa-circle-xmark', 'Rad etish', function () {
                            openWhForm({ title: 'Rad etish sababi', sub: u.fullName, icon: 'fa-circle-xmark', submit: 'Rad etish',
                                fields: [{ name: 'reason', label: 'Sabab', type: 'text', required: true }],
                                onSubmit: function (v) { return authed('POST', '/kyc/' + u.id + '/reject', { reason: v.reason }); }, done: 'Ariza rad etildi.' });
                        }, 'danger')
                    ]);
                }]
            ], list, "Tekshirishni kutayotgan arizalar yo'q."));
            dashContent.replaceChildren.apply(dashContent, nodes);
        }
        function admVerifyButton(u) {
            if (u.role !== 'FARMER' && u.role !== 'MARKET') return null;
            const on = u.isVerified;
            return admBtn(on ? 'fa-user-slash' : 'fa-user-check', on ? 'Tasdiqni bekor qilish' : 'Tasdiqlash', async function () {
                try { await authed('POST', '/kyc/' + u.id + (on ? '/revoke' : '/approve')); showToast(on ? 'Tasdiq bekor qilindi' : 'Tasdiqlandi', 2400, 'success'); selectDashTab(dashTab); }
                catch (e) { showToast(e.messages[0], 4000, 'error'); }
            }, on ? 'danger' : 'ok');
        }

        // ===== To'lov tarkibi: fermer ulushi / haydovchi ulushi / xizmat haqi / jami =====
        // src: API'dan kelgan tarkib ({productPrice, deliveryFee, serviceFee, totalPrice, distanceKm, ...}) yoki haydovchi uchun {deliveryFee, distanceKm}
        function bdNorm(src) {
            if (!src) return null;
            const n = function (v) { return v === undefined || v === null ? null : Number(v); };
            const bd = {
                product: n(src.productPrice), delivery: n(src.deliveryFee) || 0, service: n(src.serviceFee) || 0, distance: n(src.distanceKm) || 0,
                warehouse: n(src.warehouseFee) || 0, estimated: !!src.estimated, driverOnly: src.productPrice === undefined
            };
            bd.total = n(src.totalPrice) !== null ? n(src.totalPrice) : (bd.product || 0) + bd.delivery + bd.service;
            bd.legacy = !bd.driverOnly && bd.delivery === 0 && bd.service === 0; // to'lov tarkibi joriy qilinishidan oldingi yozuv
            return bd;
        }
        const bdMoney = function (v) { return T("{0} so'm", formatNumber(Math.round(v))); };
        function bdTip(bd, role) {
            if (bd.driverOnly || role === 'DRIVER') return T("Yo'l haqi: {0}", bdMoney(bd.delivery)) + (bd.distance ? ' · ' + T('{0} km', formatNumber(bd.distance)) : '');
            return [T('Fermer ulushi: {0}', bdMoney(bd.product)), T('Haydovchi ulushi: {0}', bdMoney(bd.delivery)), T('Xizmat haqi: {0}', bdMoney(bd.service)), T('Jami: {0}', bdMoney(bd.total))].join('\n');
        }
        function bdChip(kind, icon, text, big, tip, est) {
            const c = el('span', ['bd-chip', kind, big ? 'big' : '', est ? 'est' : ''].join(' '));
            c.title = tip;
            c.appendChild(el('span', '', icon));
            c.appendChild(el('span', '', text));
            return c;
        }
        // Jadval va kartochkalar uchun ixcham teglar (rolga mos): fermer — o'z ulushi; haydovchi — yo'l haqi va masofa; market/admin — jami va taqsimot
        function bdChips(src, role, onDetail) {
            const bd = bdNorm(src);
            const box = el('div', 'bd-chips');
            if (!bd) return box;
            const tip = bdTip(bd, role), est = bd.estimated;
            if (bd.driverOnly || role === 'DRIVER') {
                if (bd.delivery > 0) {
                    box.appendChild(bdChip('drv', '🚚', T("Yo'l haqi: {0}", bdMoney(bd.delivery)), true, tip, est));
                    if (bd.distance) box.appendChild(bdChip('tot', '📏', T('{0} km', formatNumber(bd.distance)), false, tip));
                } else box.appendChild(bdChip('tot', '🚚', T('Belgilanmagan'), false, tip));
            } else if (role === 'FARMER') {
                box.appendChild(bdChip('farm', '🌾', T('Sizga: {0}', bdMoney(bd.product - bd.warehouse)), true, tip, est));
                if (!bd.legacy) box.appendChild(bdChip('tot', '💳', T('Jami: {0}', bdMoney(bd.total)), false, tip, est));
            } else if (bd.legacy) {
                box.appendChild(bdChip('tot', '💳', T('Jami: {0}', bdMoney(bd.total)), true, tip, est));
            } else {
                box.appendChild(bdChip('tot', '💳', T('Jami: {0}', bdMoney(bd.total)), true, tip, est));
                box.appendChild(bdChip('farm', '🌾', bdMoney(bd.product), false, tip, est));
                box.appendChild(bdChip('drv', '🚚', bdMoney(bd.delivery), false, tip, est));
                box.appendChild(bdChip('svc', '🧾', bdMoney(bd.service), false, tip, est));
            }
            if (onDetail) {
                const l = el('button', 'bd-link', "Tafsilot");
                l.type = 'button';
                l.addEventListener('click', function (e) { e.stopPropagation(); onDetail(); });
                box.appendChild(l);
            }
            return box;
        }
        // To'liq taqsimot bloki (glassmorphism). ctx: { quantityKg, pricePerKg }
        function bdCard(src, role, ctx) {
            const bd = bdNorm(src);
            const card = el('div', 'bd-card');
            if (!bd) return card;
            const head = el('div', 'flex items-center justify-between gap-2');
            head.appendChild(el('div', 'text-xs font-extrabold uppercase tracking-wider text-slate-300', "To'lov tarkibi"));
            if (bd.estimated) head.appendChild(el('span', 'bd-chip svc est', T('Taxminiy')));
            card.appendChild(head);
            const driverView = bd.driverOnly || role === 'DRIVER';
            const row = function (cls, icon, title, sub, value, valueCls) {
                const r = el('div', ['bd-row', cls].join(' '));
                r.appendChild(el('span', 'ic', icon));
                const mid = el('div', 'min-w-0 flex-1');
                mid.appendChild(el('div', 'text-sm font-bold text-white', title));
                if (sub) mid.appendChild(el('div', 'text-xs text-slate-400 break-words', sub));
                r.appendChild(mid);
                r.appendChild(el('div', ['text-sm sm:text-base font-black text-right whitespace-nowrap', valueCls].join(' '), value));
                return r;
            };
            if (driverView) {
                card.appendChild(row('hi-drv', '🚚', T('Haydovchi ulushi'), (bd.distance ? T("Yo'l haqi · {0} km", formatNumber(bd.distance)) : T("Yo'l haqi")), bd.delivery > 0 ? bdMoney(bd.delivery) : T('Belgilanmagan'), 'text-sky-300'));
                return card;
            }
            if (!bd.legacy) {
                const bar = el('div', 'bd-bar');
                [['farm', bd.product], ['drv', bd.delivery], ['svc', bd.service]].forEach(function (s) { const i = el('i', s[0]); i.style.width = '0%'; i.dataset.w = String(bd.total ? (s[1] / bd.total) * 100 : 0); bar.appendChild(i); });
                requestAnimationFrame(function () { requestAnimationFrame(function () { bar.querySelectorAll('i').forEach(function (i) { i.style.width = i.dataset.w + '%'; }); }); });
                card.appendChild(bar);
            }
            const calc = ctx && ctx.quantityKg ? T('{0} kg × {1}', formatNumber(ctx.quantityKg), bdMoney(Number(ctx.pricePerKg))) : '';
            card.appendChild(row(role === 'FARMER' ? 'hi' : '', '🌾', T('Fermer ulushi'), (T('Mahsulot') + (calc ? ' · ' + calc : '')), bdMoney(bd.product), 'text-emerald-300'));
            if (!bd.legacy) {
                card.appendChild(row('', '🚚', T('Haydovchi ulushi'), (bd.distance ? T("Yo'l haqi · {0} km", formatNumber(bd.distance)) : T("Yo'l haqi")), bdMoney(bd.delivery), 'text-sky-300'));
                card.appendChild(row('', '🧾', T('Platforma xizmat haqi'), bd.warehouse > 0 ? T("Shu jumladan omborxona haqi: {0}", bdMoney(bd.warehouse)) : '', bdMoney(bd.service), 'text-amber-300'));
            }
            const tot = el('div', 'bd-total');
            tot.appendChild(el('span', 'text-sm font-extrabold text-white flex items-center gap-2', ''));
            tot.firstChild.appendChild(el('span', '', '💳'));
            tot.firstChild.appendChild(el('span', '', role === 'FARMER' ? 'Market to\'lagan jami' : 'Jami'));
            tot.appendChild(el('span', 'text-xl sm:text-2xl font-black text-white', bdMoney(bd.total)));
            card.appendChild(tot);
            return card;
        }

        // Tafsilot oynasi (chek): o = { title, sub, src, role, ctx, status, shipmentId, events, id }
        const bdModal = document.getElementById('bd-modal');
        function openBdModal(o) {
            const role = o.role || (currentUser() || {}).role;
            document.getElementById('bd-title').textContent = o.title;
            document.getElementById('bd-sub').textContent = o.sub || '';
            const body = document.getElementById('bd-body');
            const nodes = [];
            if (o.status || o.id) {
                const meta = el('div', 'flex flex-wrap items-center justify-between gap-2');
                if (o.status && PAYMENT_STATUS[o.status]) meta.appendChild(paymentPill(o.status, true));
                if (o.id) meta.appendChild(el('span', 'text-[11px] font-bold text-slate-500', '№ ' + String(o.id).slice(0, 8).toUpperCase()));
                nodes.push(meta);
            }
            nodes.push(bdCard(o.src, role, o.ctx));
            if (o.events && o.events.length) {
                const ev = el('div', 'space-y-1.5');
                ev.appendChild(el('div', 'text-xs font-extrabold uppercase tracking-wider text-slate-400', 'Tranzaksiya tarixi'));
                o.events.slice().reverse().forEach(function (e) {
                    const r = el('div', 'flex items-start gap-2 text-xs text-slate-300');
                    r.appendChild(el('i', 'fa-solid fa-circle text-[6px] text-emerald-400 mt-1.5'));
                    r.appendChild(el('span', 'min-w-0 break-words', formatDateTime(e.createdAt) + ' — ' + (PAYMENT_STATUS[e.status] ? T(PAYMENT_STATUS[e.status].short) : e.status) + (e.note ? ': ' + e.note : '')));
                    ev.appendChild(r);
                });
                nodes.push(ev);
            }
            if (o.shipmentId && role !== 'DISPATCHER') {
                const code = o.shipmentId.slice(0, 8).toUpperCase();
                const docs = el('div', 'flex flex-wrap gap-2 pt-1');
                docs.appendChild(docButton('fa-file-pdf', 'TTN yuklab olish (PDF)', 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10', '/documents/ttn/' + o.shipmentId, 'TTN-' + code + '.pdf'));
                docs.appendChild(docButton('fa-receipt', 'Chek (PDF)', 'border-sky-500/40 text-sky-300 hover:bg-sky-500/10', '/documents/receipt/' + o.shipmentId, 'Chek-' + code + '.pdf'));
                nodes.push(docs);
            }
            body.replaceChildren.apply(body, nodes);
            bdModal.classList.add('open');
            syncScrollLock();
        }
        function closeBdModal() { bdModal.classList.remove('open'); syncScrollLock(); }
        // Yuk va to'lov obyektlaridan chek ochuvchilar
        function openPaymentDetail(p, viewerRole) {
            openBdModal({ title: p.order.productName, sub: p.order.category + ' · ' + T('{0} kg × {1}', formatNumber(p.order.quantityKg), bdMoney(Number(p.order.pricePerKg))), src: p.breakdown, role: viewerRole, ctx: { quantityKg: p.order.quantityKg, pricePerKg: p.order.pricePerKg }, status: p.status, id: p.id, events: p.events, shipmentId: p.shipmentId });
        }
        function openShipmentPrice(s, viewerRole) {
            openBdModal({ title: s.cargoName, sub: s.origin.region + ' → ' + s.destination.region + ' · ' + formatNumber(s.weightKg) + ' kg', src: s.price, role: viewerRole, ctx: null, status: s.paymentStatus, id: s.id, shipmentId: s.status === 'CANCELLED' ? null : s.id });
        }
        // Yuk kartochkasidagi narx qatori
        function buildPriceStrip(s, viewer) {
            const role = viewer === 'farmer' ? 'FARMER' : viewer === 'market' ? 'MARKET' : 'DRIVER';
            const wrap = el('div', 'rounded-xl bg-slate-950/50 border border-white/10 px-4 py-3 space-y-1.5');
            wrap.appendChild(el('div', 'text-[10px] uppercase tracking-wider text-slate-500 font-bold', role === 'DRIVER' ? "Yo'l haqi" : "To'lov"));
            wrap.appendChild(bdChips(s.price, role, role === 'DRIVER' && viewer === 'driver-open' ? null : function () { openShipmentPrice(s, role); }));
            return wrap;
        }

        // ===== ELD / Xarita: yon menyu va pastki navigatsiya uchun yagona kirish nuqtasi =====
        // Haydovchi: harakat jurnali (ELD); fermer/market: jonli xaritali yuklar; admin/dispetcher: yuklar. Kirmagan: haydovchi tanishtiruv sahifasi.
        function openEld() {
            if (sidebar.classList.contains('open')) toggleSidebar();
            const user = currentUser();
            if (!user) return openRolePage('DRIVER');
            const tab = { DRIVER: 'eld', FARMER: 'shipments', MARKET: 'shipments', ADMIN: 'adm-shipments', DISPATCHER: 'whboard' }[user.role];
            openDashboard(tab);
        }

        // ===== Mobil header: yig'iladigan qidiruv =====
        (function () {
            const nav = document.getElementById('main-nav');
            const btn = document.getElementById('nav-search-toggle');
            const input = document.getElementById('market-search');
            const set = function (open) {
                nav.classList.toggle('search-open', open);
                btn.setAttribute('aria-expanded', String(open));
                if (open) setTimeout(function () { input.focus(); }, 60);
            };
            btn.addEventListener('click', function () { set(!nav.classList.contains('search-open')); });
            input.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !input.value) set(false); });
            document.getElementById('market-search-btn').addEventListener('click', function () { if (window.innerWidth <= 768 && input.value.trim()) nav.classList.add('search-open'); });
        })();

        // ===== Pastki navigatsiya (Bottom Nav) =====
        const bottomNav = document.getElementById('bottom-nav');
        function bnCloseOverlays() {
            if (dashboardView.classList.contains('open')) closeDashboard();
            if (rolePage.classList.contains('open')) closeRolePage();
            if (sidebar.classList.contains('open')) toggleSidebar();
            closeAccountMenu();
        }
        function bnGo(id) {
            const user = currentUser();
            if (id === 'home') { bnCloseOverlays(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
            else if (id === 'market') { bnCloseOverlays(); scrollToMarket(); }
            else if (id === 'prices') {
                if (user) { if (sidebar.classList.contains('open')) toggleSidebar(); openDashboard('prices'); }
                else { afterLoginAction = function () { openDashboard('prices'); }; openAuthModal('login'); }
            }
            else if (id === 'eld') openEld();
            else if (id === 'cabinet') { if (user) { if (rolePage.classList.contains('open')) closeRolePage(); openDashboard(); } else openAuthModal('login'); }
            setTimeout(bnSync, 60);
        }
        function bnActive() {
            if (dashboardView.classList.contains('open')) return dashTab === 'prices' ? 'prices' : (dashTab === 'eld' || dashTab === 'adm-shipments' ? 'eld' : 'cabinet');
            if (rolePage.classList.contains('open')) return rpRole === 'DRIVER' ? 'eld' : null;
            const m = document.getElementById('market').getBoundingClientRect();
            if (m.top < window.innerHeight * 0.55 && m.bottom > window.innerHeight * 0.3) return 'market';
            return window.scrollY < window.innerHeight * 0.6 ? 'home' : null;
        }
        function bnSync() {
            const cur = bnActive();
            bottomNav.querySelectorAll('.bn-item').forEach(function (b) {
                const on = b.dataset.bn === cur;
                b.classList.toggle('active', on);
                if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
            });
            document.getElementById('bn-cabinet-label').textContent = T(currentUser() ? 'Kabinet' : 'Kirish');
            document.body.classList.toggle('bn-hide', notFoundView.classList.contains('open'));
        }
        bottomNav.addEventListener('click', function (e) { const b = e.target.closest('[data-bn]'); if (b) bnGo(b.dataset.bn); });
        let bnTick = false;
        window.addEventListener('scroll', function () { if (bnTick) return; bnTick = true; requestAnimationFrame(function () { bnTick = false; bnSync(); }); }, { passive: true });
        [dashboardView, rolePage, notFoundView].forEach(function (n) { new MutationObserver(bnSync).observe(n, { attributes: true, attributeFilter: ['class'] }); });
        window.addEventListener('resize', bnSync);
        bnSync();

        startLiveReviews();
        routeRoleHash();
        routeNotFound();
