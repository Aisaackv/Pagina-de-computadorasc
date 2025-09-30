document.addEventListener('DOMContentLoaded', () => {
    // Año en footer
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear().toString();

    // Menú móvil
    const navToggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.site-nav');
    if (navToggle && nav) {
        navToggle.addEventListener('click', () => {
            const isOpen = nav.classList.toggle('open');
            navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    }

    // Estado: auth y carrito en localStorage
    const storage = {
        getUser() {
            try { return JSON.parse(localStorage.getItem('tn_user') || 'null'); } catch { return null; }
        },
        setUser(user) { localStorage.setItem('tn_user', JSON.stringify(user)); },
        clearUser() { localStorage.removeItem('tn_user'); },
        getCart() { try { return JSON.parse(localStorage.getItem('tn_cart') || '[]'); } catch { return []; } },
        setCart(items) { localStorage.setItem('tn_cart', JSON.stringify(items)); },
        clearCart() { localStorage.removeItem('tn_cart'); },
        getOrder() { try { return JSON.parse(localStorage.getItem('tn_order') || 'null'); } catch { return null; } },
        setOrder(order) { localStorage.setItem('tn_order', JSON.stringify(order)); },
        clearOrder() { localStorage.removeItem('tn_order'); }
    };

    // Moneda y tasa FX
    const getFX = () => {
        try { return JSON.parse(localStorage.getItem('tn_fx') || 'null') || { base: 'MXN', rate: 18.0, currency: (localStorage.getItem('tn_currency') || 'USD') }; }
        catch { return { base: 'MXN', rate: 18.0, currency: 'USD' }; }
    };
    const setFX = (fx) => localStorage.setItem('tn_fx', JSON.stringify(fx));
    const getCurrency = () => (getFX().currency || 'USD');
    const setCurrency = (cur) => { const fx = getFX(); fx.currency = cur; setFX(fx); localStorage.setItem('tn_currency', cur); };
    const formatPrice = (mxn) => {
        const fx = getFX();
        const target = fx.currency;
        const toUSD = (mxn / fx.rate);
        const rates = {
            USD: 1,
            EUR: 0.92,
            GBP: 0.79,
            JPY: 155,
            CAD: 1.35,
            BRL: 5.4,
            MXN: fx.rate
        };
        const nf = (cur, val) => new Intl.NumberFormat(cur === 'EUR' ? 'de-DE' : (cur === 'MXN' ? 'es-MX' : 'en-US'), { style: 'currency', currency: cur }).format(val);
        if (target === 'MXN') return nf('MXN', mxn);
        if (!rates[target]) return nf('USD', toUSD);
        const value = target === 'MXN' ? mxn : toUSD * rates[target];
        return nf(target, value);
    };

    const renderGlobalPrices = () => {
        // Servicios: elementos con data-price-mxn
        document.querySelectorAll('.price[data-price-mxn]')?.forEach((el) => {
            const mxn = Number(el.getAttribute('data-price-mxn') || '0');
            el.textContent = formatPrice(mxn);
        });
        // Inicio: no hay etiqueta de precio fija, pero podrías añadir si se requiere
    };

    // Moneda: formato USD a partir de MXN (tasa aproximada)
    const MXN_PER_USD = 18.0;
    const formatUSDFromMXN = (mxn) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(mxn / MXN_PER_USD);

    const updateHeaderState = () => {
        const loginLink = document.getElementById('loginLink');
        const cartCount = document.getElementById('cartCount');
        const user = storage.getUser();
        const items = storage.getCart();
        if (cartCount) cartCount.textContent = String(items.reduce((s, it) => s + it.qty, 0));
        const adminLink = document.getElementById('adminLink');
        const currencySelect = document.getElementById('currencySelect');
        if (currencySelect) {
            const cur = getCurrency();
            if (currencySelect.value !== cur) currencySelect.value = cur;
            currencySelect.onchange = () => { setCurrency(currencySelect.value); renderGlobalPrices(); updateHeaderState(); };
        }
        if (loginLink) {
            if (user) {
                loginLink.textContent = `Salir (${user.name})`;
                loginLink.href = '#';
                loginLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    storage.clearUser();
                    updateHeaderState();
                }, { once: true });
            } else {
                loginLink.textContent = 'Iniciar Sesión';
                loginLink.href = 'login.html';
            }
        }
        if (adminLink) {
            const isAdmin = user && user.email === 'isaacizurietabaus2009@gmail.com' && (user.name || '').toLowerCase().includes('isaac izurieta');
            adminLink.style.display = isAdmin ? 'inline-block' : 'none';
        }
    };

    // Agregar al carrito
    const addToCart = (product) => {
        const items = storage.getCart();
        const idx = items.findIndex((i) => i.name === product.name);
        if (idx >= 0) items[idx].qty += 1; else items.push({ ...product, qty: 1 });
        storage.setCart(items);
        updateHeaderState();
    };

    document.querySelectorAll('.add-cart').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const name = target.getAttribute('data-product') || 'Producto';
            const price = Number(target.getAttribute('data-price') || '0');
            addToCart({ name, price });
        });
    });

    // Utilidad: validación de email y verificación de MX (dominio existente)
    const isEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    const domainHasMX = async (email) => {
        try {
            const domain = String(email.split('@')[1] || '').trim();
            if (!domain) return false;
            const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
            if (!res.ok) return false;
            const data = await res.json();
            return Array.isArray(data.Answer) && data.Answer.length > 0;
        } catch { return false; }
    };

    // Validadores de tarjeta
    const luhnCheck = (num) => {
        const arr = (num + '').replace(/\D/g, '').split('').reverse().map(x => parseInt(x, 10));
        const sum = arr.reduce((acc, val, idx) => acc + (idx % 2 ? ((val *= 2) > 9 ? val - 9 : val) : val), 0);
        return sum % 10 === 0;
    };
    const detectCardBrand = (num) => {
        const n = (num || '').replace(/\s|-/g, '');
        if (/^4[0-9]{12}(?:[0-9]{3})?$/.test(n)) return 'visa';
        if (/^5[1-5][0-9]{14}$/.test(n) || /^2(2[2-9][0-9]{12}|[3-6][0-9]{13}|7[01][0-9]{12}|720[0-9]{12})$/.test(n)) return 'mastercard';
        if (/^3[47][0-9]{13}$/.test(n)) return 'amex';
        if (/^6(?:011|5[0-9]{2})[0-9]{12}$/.test(n)) return 'discover';
        return 'desconocida';
    };
    const validExpiry = (mmYY) => {
        const m = (mmYY || '').trim();
        const parts = m.split('/');
        if (parts.length !== 2) return false;
        const mm = parseInt(parts[0], 10);
        const yy = parseInt(parts[1], 10);
        if (!mm || mm < 1 || mm > 12 || isNaN(yy)) return false;
        const year = yy + 2000;
        const exp = new Date(year, mm - 1, 1);
        const now = new Date();
        exp.setMonth(exp.getMonth() + 1); // end of month
        return exp > now;
    };

    // Validación del formulario de contacto con verificación MX
    const form = document.getElementById('contactForm');
    if (form) {
        const statusEl = document.getElementById('formStatus');
        const fields = ['name', 'email', 'message'];

        const showError = (id, msg) => {
            const field = document.getElementById(id);
            if (!field) return;
            const small = field.parentElement.querySelector('.error');
            if (small) small.textContent = msg;
        };

        const clearErrors = () => {
            form.querySelectorAll('.error').forEach((el) => el.textContent = '');
            if (statusEl) statusEl.textContent = '';
        };

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors();

            let valid = true;
            const data = {};
            fields.forEach((id) => {
                const el = document.getElementById(id);
                const value = (el && 'value' in el) ? el.value.trim() : '';
                data[id] = value;
            });

            if (!data.name) { showError('name', 'Ingresa tu nombre'); valid = false; }
            if (!data.email) { showError('email', 'Ingresa tu correo'); valid = false; }
            else if (!isEmail(data.email)) { showError('email', 'Correo inválido'); valid = false; }
            if (!data.message) { showError('message', 'Escribe un mensaje'); valid = false; }
            if (!valid) return;

            if (statusEl) statusEl.textContent = 'Verificando dominio de correo...';
            const ok = await domainHasMX(data.email);
            if (!ok) { showError('email', 'El dominio del correo no existe (sin MX)'); if (statusEl) statusEl.textContent = ''; return; }

            if (statusEl) statusEl.textContent = 'Enviando...';
            setTimeout(() => {
                if (statusEl) statusEl.textContent = '¡Gracias! Te contactaremos pronto.';
                form.reset();
            }, 800);
        });
    }

    // Login (con verificación MX) + password y registro local + rol admin
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        const status = document.getElementById('loginStatus');
        const pwd = document.getElementById('loginPassword');
        const pwdBar = document.getElementById('pwdBar');
        const pwdLabel = document.getElementById('pwdLabel');
        const togglePwd = document.getElementById('togglePwd');

        const scorePassword = (value) => {
            let score = 0;
            if (!value) return 0;
            if (value.length >= 6) score += 1;
            if (/[A-Z]/.test(value)) score += 1;
            if (/[0-9]/.test(value)) score += 1;
            if (/[^A-Za-z0-9]/.test(value)) score += 1;
            if (value.length >= 10) score += 1;
            return Math.min(score, 4);
        };

        const updateMeter = () => {
            const val = pwd?.value || '';
            const score = scorePassword(val);
            const widths = ['0%', '25%', '50%', '75%', '100%'];
            const labels = ['Muy débil', 'Débil', 'Media', 'Fuerte', 'Muy fuerte'];
            if (pwdBar) {
                pwdBar.className = 'pwd-meter-bar';
                if (score <= 1) pwdBar.classList.add('pwd-weak');
                else if (score === 2 || score === 3) pwdBar.classList.add('pwd-medium');
                else pwdBar.classList.add('pwd-strong');
                pwdBar.style.width = widths[score];
            }
            if (pwdLabel) pwdLabel.textContent = labels[score];
        };

        pwd?.addEventListener('input', updateMeter);
        togglePwd?.addEventListener('click', () => {
            if (!pwd) return;
            const type = pwd.getAttribute('type') === 'password' ? 'text' : 'password';
            pwd.setAttribute('type', type);
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('loginName')?.value?.trim();
            const email = document.getElementById('loginEmail')?.value?.trim();
            const password = document.getElementById('loginPassword')?.value?.trim();
            if (!name || !email) { if (status) status.textContent = 'Completa los campos'; return; }
            if (!isEmail(email)) { if (status) status.textContent = 'Correo inválido'; return; }
            if (!password || password.length < 6) { if (status) status.textContent = 'Contraseña mínima 6 caracteres'; return; }
            if (status) status.textContent = 'Verificando dominio de correo...';
            const ok = await domainHasMX(email);
            if (!ok) { if (status) status.textContent = 'El dominio del correo no existe (sin MX)'; return; }
            const users = JSON.parse(localStorage.getItem('tn_users') || '[]');
            const existing = users.find(u => u.email === email);
            if (existing && existing.password !== password) { if (status) status.textContent = 'Contraseña incorrecta'; return; }
            const role = (email === 'isaacizurietabaus2009@gmail.com' && (name || '').toLowerCase().includes('isaac izurieta')) ? 'admin' : (existing?.role || 'user');
            const userObj = { name, email, password, role };
            const updated = existing ? users.map(u => u.email === email ? userObj : u) : [...users, userObj];
            localStorage.setItem('tn_users', JSON.stringify(updated));
            storage.setUser({ name, email, role });
            if (status) status.textContent = 'Sesión iniciada';
            setTimeout(() => { window.location.href = 'index.html'; }, 600);
        });
    }

    // Carrito page rendering
    const cartTable = document.getElementById('cartTable');
    if (cartTable) {
        const tbody = cartTable.querySelector('tbody');
        const empty = document.getElementById('cartEmpty');
        const actions = document.getElementById('cartActions');
        const itemsCount = document.getElementById('cartItemsCount');
        const totalEl = document.getElementById('cartTotal');
        const clearBtn = document.getElementById('clearCart');
        const checkoutBtn = document.getElementById('checkoutBtn');
        const paymentSelect = document.getElementById('paymentMethod');
        const status = document.getElementById('cartStatus');

        const render = () => {
            const items = storage.getCart();
            const has = items.length > 0;
            if (empty) empty.style.display = has ? 'none' : 'block';
            cartTable.style.display = has ? 'table' : 'none';
            if (actions) actions.style.display = has ? 'flex' : 'none';
            if (!has) return updateHeaderState();

            tbody.innerHTML = '';
            let total = 0; let count = 0;
            items.forEach((it, idx) => {
                const tr = document.createElement('tr');
                const subtotal = it.qty * it.price;
                total += subtotal; count += it.qty;
                tr.innerHTML = `<td>${it.name}</td><td>${it.qty}</td><td>${formatPrice(it.price)}</td><td>${formatPrice(subtotal)}</td><td><button data-idx="${idx}" class="btn">Quitar</button></td>`;
                tbody.appendChild(tr);
            });
            if (itemsCount) itemsCount.textContent = String(count);
            if (totalEl) totalEl.textContent = `${formatPrice(total)}`;
            updateHeaderState();
        };

        tbody?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-idx]');
            if (!btn) return;
            const idx = Number(btn.getAttribute('data-idx'));
            const items = storage.getCart();
            items.splice(idx, 1);
            storage.setCart(items);
            render();
        });

        clearBtn?.addEventListener('click', () => { storage.clearCart(); render(); });

        checkoutBtn?.addEventListener('click', () => {
            const items = storage.getCart();
            if (!items.length) return;
            const method = paymentSelect ? paymentSelect.value : 'card';
            localStorage.setItem('tn_checkout', JSON.stringify({ method }));
            window.location.href = 'payment.html';
        });

        // Legacy: direct create order if needed (unused now)
        const createOrderDirect = () => {
            const items = storage.getCart();
            if (!items.length) return;
            const order = {
                id: 'TN-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                createdAt: Date.now(),
                status: 'en_ruta',
                // Ruta simulada dinámica: origen configurable -> destino aproximado
                route: (function(){
                    const cfg = JSON.parse(localStorage.getItem('tn_ship') || 'null') || { origin: 'Quito, Ecuador' };
                    // Quito
                    const origins = {
                        'Quito, Ecuador': { lat: -0.1807, lng: -78.4678 }
                    };
                    const origin = origins[cfg.origin] || origins['Quito, Ecuador'];
                    // Destino estimado (si hay geolocalización posterior se podría mejorar)
                    const fallbackDest = { lat: 19.4326, lng: -99.1332 }; // CDMX
                    return [origin, fallbackDest];
                })(),
                progress: 0
            };
            storage.setOrder(order);
            const orders = JSON.parse(localStorage.getItem('tn_orders') || '[]');
            localStorage.setItem('tn_orders', JSON.stringify([order, ...orders]));
            storage.clearCart();
            if (status) status.textContent = `Pedido ${order.id} creado. Redirigiendo al rastreo...`;
            setTimeout(() => { window.location.href = 'rastreo.html'; }, 800);
        };

        render();
    }

    // Rastreo con Leaflet
    const mapEl = document.getElementById('map');
    if (mapEl && window.L) {
        const info = document.getElementById('trackingInfo');
        const order = storage.getOrder();
        if (!order) {
            if (info) info.textContent = 'No hay pedido activo. Crea uno desde el carrito.';
            return;
        }
        if (info) info.textContent = `Pedido ${order.id} — estado: ${order.status}`;

        const map = L.map('map', { worldCopyJump: true }).setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        const route = order.route;
        const poly = L.polyline(route, { color: '#3b82f6' }).addTo(map);
        map.fitBounds(poly.getBounds(), { padding: [30, 30] });

        const marker = L.marker(route[0]).addTo(map);

        let t = 0;
        const step = () => {
            t += 0.005; // velocidad
            if (t >= 1) { t = 1; }
            // Interpolación entre puntos
            const totalSegments = route.length - 1;
            const segFloat = t * totalSegments;
            const segIndex = Math.min(Math.floor(segFloat), totalSegments - 1);
            const segT = segFloat - segIndex;
            const a = route[segIndex];
            const b = route[segIndex + 1];
            const lat = a.lat + (b.lat - a.lat) * segT;
            const lng = a.lng + (b.lng - a.lng) * segT;
            marker.setLatLng([lat, lng]);
            if (t < 1) requestAnimationFrame(step);
            else {
                storage.setOrder({ ...order, status: 'entregado', progress: 1 });
                if (info) info.textContent = `Pedido ${order.id} — estado: entregado`;
            }
        };
        requestAnimationFrame(step);
    }

    // Admin page render
    const usersTable = document.getElementById('usersTable');
    const ordersTable = document.getElementById('ordersTable');
    const rateInput = document.getElementById('rateUSD');
    const saveRateBtn = document.getElementById('saveRate');
    const adminStatus = document.getElementById('adminStatus');
    if (usersTable && ordersTable && rateInput && saveRateBtn) {
        const user = storage.getUser();
        const isAdmin = user && user.email === 'isaacizurietabaus2009@gmail.com' && (user.name || '').toLowerCase().includes('isaac izurieta');
        if (!isAdmin) {
            if (adminStatus) adminStatus.textContent = 'Acceso restringido. Inicia sesión como administrador.';
        } else {
            if (adminStatus) adminStatus.textContent = `Bienvenido, ${user.name}`;
        }

        // Users
        const users = JSON.parse(localStorage.getItem('tn_users') || '[]');
        const utbody = usersTable.querySelector('tbody');
        utbody.innerHTML = '';
        users.forEach((u, i) => {
            const tr = document.createElement('tr');
            const tipo = u.type || 'comprador';
            tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td>${u.role || 'user'}</td><td>${tipo}</td><td><button class="btn" data-i="${i}" data-action="toggleType">Cambiar a ${tipo === 'comprador' ? 'vendedor' : 'comprador'}</button></td>`;
            utbody.appendChild(tr);
        });

        utbody.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action="toggleType"]');
            if (!btn) return;
            const idx = Number(btn.getAttribute('data-i'));
            const list = JSON.parse(localStorage.getItem('tn_users') || '[]');
            const user = list[idx];
            if (!user) return;
            user.type = (user.type || 'comprador') === 'comprador' ? 'vendedor' : 'comprador';
            localStorage.setItem('tn_users', JSON.stringify(list));
            window.location.reload();
        });

        // Orders
        const orders = JSON.parse(localStorage.getItem('tn_orders') || '[]');
        const otbody = ordersTable.querySelector('tbody');
        otbody.innerHTML = '';
        orders.forEach(o => {
            const tr = document.createElement('tr');
            const date = new Date(o.createdAt).toLocaleString();
            tr.innerHTML = `<td>${o.id}</td><td>${date}</td><td>${o.status}</td>`;
            otbody.appendChild(tr);
        });

        // FX
        const fx = getFX();
        rateInput.value = fx.rate;
        const defaultCurrency = document.getElementById('defaultCurrency');
        if (defaultCurrency) defaultCurrency.value = fx.currency || 'USD';
        saveRateBtn.addEventListener('click', () => {
            const rate = Number(rateInput.value);
            const msg = document.getElementById('fxStatus');
            if (!rate || rate <= 0) { if (msg) msg.textContent = 'Tasa inválida'; return; }
            const curSel = document.getElementById('defaultCurrency');
            const cur = curSel ? curSel.value : fx.currency;
            setFX({ ...fx, rate, currency: cur });
            setCurrency(cur);
            renderGlobalPrices();
            if (msg) msg.textContent = 'Tasa/moneda actualizadas';
        });

        // Shipping origin settings
        const originCity = document.getElementById('originCity');
        const showAddress = document.getElementById('showAddress');
        const saveShip = document.getElementById('saveShipping');
        const shipMsg = document.getElementById('shipStatus');
        const shipCfg = JSON.parse(localStorage.getItem('tn_ship') || 'null') || { origin: 'Quito, Ecuador', show: false, country: 'Ecuador', province: 'Pichincha' };
        const originCountry = document.getElementById('originCountry');
        const originProvince = document.getElementById('originProvince');
        if (originCountry) originCountry.value = shipCfg.country || 'Ecuador';
        if (originProvince) originProvince.value = shipCfg.province || 'Pichincha';
        if (showAddress) showAddress.checked = !!shipCfg.show;
        saveShip?.addEventListener('click', () => {
            const origin = `${originProvince?.value?.trim() || 'Pichincha'}, ${originCountry?.value || 'Ecuador'}`;
            const cfg = { origin, show: !!showAddress?.checked, country: originCountry?.value || 'Ecuador', province: originProvince?.value?.trim() || 'Pichincha' };
            localStorage.setItem('tn_ship', JSON.stringify(cfg));
            if (shipMsg) shipMsg.textContent = 'Configuración de envíos guardada';
        });
    }

    // Payment page logic
    const paymentForm = document.getElementById('paymentForm');
    if (paymentForm) {
        const summary = document.getElementById('paymentSummary');
        const totalEl = document.getElementById('payTotal');
        const curEl = document.getElementById('payCurrency');
        const countrySel = document.getElementById('country');
        const methodSel = document.getElementById('method');
        const fields = document.getElementById('methodFields');
        const payStatus = document.getElementById('payStatus');

        const methodsByCountry = {
            'México': ['card', 'bank'],
            'Estados Unidos': ['card', 'paypal'],
            'Ecuador': ['card', 'bank'],
            'Colombia': ['card', 'bank'],
            'Perú': ['card', 'bank'],
            'España': ['card', 'paypal', 'bank'],
            'Argentina': ['card', 'bank'],
            'Chile': ['card', 'bank'],
            'Brasil': ['card', 'bank']
        };
        const countryList = Object.keys(methodsByCountry);
        countrySel.innerHTML = '';
        countryList.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; countrySel.appendChild(opt); });

        const fx = getFX();
        curEl.textContent = fx.currency;
        const cartItems = JSON.parse(localStorage.getItem('tn_cart') || '[]');
        const cartTotalMXN = cartItems.reduce((s, it) => s + it.price * it.qty, 0);
        totalEl.textContent = formatPrice(cartTotalMXN);
        summary.textContent = `${cartItems.length} artículos — Total ${formatPrice(cartTotalMXN)}`;

        const checkoutPref = JSON.parse(localStorage.getItem('tn_checkout') || '{}');

        const renderMethodOptions = () => {
            const country = countrySel.value || 'Ecuador';
            const allowed = methodsByCountry[country] || ['card'];
            methodSel.innerHTML = '';
            allowed.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m === 'card' ? 'Tarjeta' : (m === 'paypal' ? 'PayPal' : 'Transferencia bancaria');
                methodSel.appendChild(opt);
            });
            if (checkoutPref.method && allowed.includes(checkoutPref.method)) methodSel.value = checkoutPref.method;
            renderFields();
        };

        const renderFields = () => {
            const method = methodSel.value;
            fields.innerHTML = '';
            if (method === 'card') {
                fields.innerHTML = `
                    <div class="form-field"><label>Nombre en tarjeta</label><input type="text" id="ccName" required></div>
                    <div class="form-field"><label>Número</label><input type="text" id="ccNumber" required placeholder="4111 1111 1111 1111" inputmode="numeric"></div>
                    <div class="grid two">
                        <div class="form-field"><label>MM/AA</label><input type="text" id="ccExp" required placeholder="12/30" inputmode="numeric"></div>
                        <div class="form-field"><label>CVV</label><input type="text" id="ccCvv" required placeholder="123" inputmode="numeric" maxlength="4"></div>
                    </div>
                `;
            } else if (method === 'paypal') {
                fields.innerHTML = `
                    <div class="form-field"><label>Cuenta PayPal</label><input type="email" id="ppEmail" required></div>
                `;
            } else {
                fields.innerHTML = `
                    <div class="form-field"><label>Titular</label><input type="text" id="bkName" required></div>
                    <div class="form-field"><label>Banco</label><input type="text" id="bkBank" required></div>
                    <div class="form-field"><label>Clabe/IBAN</label><input type="text" id="bkIban" required></div>
                `;
            }
        };

        countrySel.addEventListener('change', renderMethodOptions);
        methodSel.addEventListener('change', renderFields);
        renderMethodOptions();

        document.getElementById('useGeo')?.addEventListener('click', () => {
            const geoLabel = document.getElementById('geoStatus');
            if (!navigator.geolocation) { if (geoLabel) geoLabel.textContent = 'Geolocalización no soportada'; return; }
            navigator.geolocation.getCurrentPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                const dest = { lat: latitude, lng: longitude };
                localStorage.setItem('tn_dest_geo', JSON.stringify(dest));
                if (geoLabel) geoLabel.textContent = 'Ubicación guardada';
            }, () => { if (geoLabel) geoLabel.textContent = 'No se pudo obtener la ubicación'; });
        });

        paymentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Validación mínima
            const method = methodSel.value;
            if (method === 'card') {
                const name = document.getElementById('ccName')?.value?.trim();
                const number = document.getElementById('ccNumber')?.value?.replace(/\s|-/g, '');
                const exp = document.getElementById('ccExp')?.value?.trim();
                const cvv = document.getElementById('ccCvv')?.value?.trim();
                if (!name || !number || !exp || !cvv) { payStatus.textContent = 'Completa los datos de tarjeta'; return; }
                if (!luhnCheck(number)) { payStatus.textContent = 'Número de tarjeta inválido'; return; }
                if (!validExpiry(exp)) { payStatus.textContent = 'Fecha de expiración inválida'; return; }
                const brand = detectCardBrand(number);
                const cvvLen = brand === 'amex' ? 4 : 3;
                if (!/^\d+$/.test(cvv) || cvv.length !== cvvLen) { payStatus.textContent = `CVV inválido (${cvvLen} dígitos)`; return; }
            } else if (method === 'paypal') {
                if (!document.getElementById('ppEmail')?.value?.trim()) { payStatus.textContent = 'Ingresa tu cuenta PayPal'; return; }
            } else {
                if (!document.getElementById('bkName')?.value?.trim() || !document.getElementById('bkIban')?.value?.trim()) { payStatus.textContent = 'Completa los datos bancarios'; return; }
            }

            // Crear pedido y redirigir a rastreo
            const items = JSON.parse(localStorage.getItem('tn_cart') || '[]');
            if (!items.length) { payStatus.textContent = 'Tu carrito está vacío'; return; }
            // Destino: prioridad geolocalización, luego destCity/province
            const geo = JSON.parse(localStorage.getItem('tn_dest_geo') || 'null');
            const destCity = document.getElementById('destCity')?.value?.trim();
            const destProvince = document.getElementById('destProvince')?.value?.trim();
            const destFallback = { lat: 19.4326, lng: -99.1332 };
            const order = {
                id: 'TN-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                createdAt: Date.now(),
                status: 'en_ruta',
                route: (function(){
                    const cfg = JSON.parse(localStorage.getItem('tn_ship') || 'null') || { origin: 'Quito, Ecuador' };
                    const origins = { 'Quito, Ecuador': { lat: -0.1807, lng: -78.4678 } };
                    const origin = origins[cfg.origin] || origins['Quito, Ecuador'];
                    if (geo) return [origin, geo];
                    // Simple destinos aproximados por ciudad/provincia conocida (placeholder)
                    const mapByCity = { 'Ciudad de México': { lat: 19.4326, lng: -99.1332 } };
                    const guessed = mapByCity[destCity || ''] || destFallback;
                    return [origin, guessed];
                })(),
                progress: 0,
                payment: { country: countrySel.value, method }
            };
            localStorage.setItem('tn_order', JSON.stringify(order));
            const orders = JSON.parse(localStorage.getItem('tn_orders') || '[]');
            localStorage.setItem('tn_orders', JSON.stringify([order, ...orders]));
            localStorage.removeItem('tn_cart');
            window.location.href = 'rastreo.html';
        });
    }

    updateHeaderState();
    renderGlobalPrices();
});

