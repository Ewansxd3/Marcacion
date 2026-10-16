(function moduloMaestroAICC() {
    // =======================================================
    // 1. CONFIGURACIÓN DE REPORTES Y ENDPOINTS
    // =======================================================
    const BASE_HOST = "https://10.189.8.188:28090";
    const REPORTES = {
        r1259: {
            nombre: "Reporte 1259 (Outbound)",
            refId: "65be69e710322210afcbc189737634e6"
        },
        r401: {
            nombre: "Reporte 401 (Outbound)",
            refId: "d1746df188896e516db5c9c2627748f7"
        }
    };

    // =======================================================
    // 2. ACTUALIZADOR Y MANTENIMIENTO DEL TOKEN (KEEPALIVE)
    // =======================================================
    window._aiccTokenVivo = window._aiccTokenVivo || null;

    function capturarTokenActual() {
        for (let s of [sessionStorage, localStorage]) {
            for (let i = 0; i < s.length; i++) {
                const k = s.key(i), v = s.getItem(k);
                if (/token|bme/i.test(k) && typeof v === 'string' && v.length > 10) {
                    return v.replace(/^"|"$/g, '');
                }
            }
        }
        const m = document.cookie.match(/BMEWebToken=([^;]+)/i);
        if (m) return m[1];
        const mUrl = location.href.match(/BMEWebToken=([^&#]+)/i);
        if (mUrl) return mUrl[1];
        return window._aiccTokenVivo;
    }

    if (!window._aiccSnifferActivo) {
        const oF = window.fetch;
        window.fetch = async function(...a) {
            try {
                const u = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || '';
                const m = u.match(/BMEWebToken=([^&#]+)/i);
                if (m) window._aiccTokenVivo = m[1];
                if (a[1] && a[1].headers) {
                    const h = a[1].headers['BMEWebToken'] || a[1].headers['Authorization'];
                    if (h) window._aiccTokenVivo = h.replace(/^Bearer\s+/i, '');
                }
            } catch(e) {}
            return oF.apply(this, a);
        };
        window._aiccSnifferActivo = true;
    }

    if (window._aiccKeepAlive) clearInterval(window._aiccKeepAlive);
    window._aiccKeepAlive = setInterval(() => {
        const t = capturarTokenActual();
        const h = t ? { 'BMEWebToken': t } : {};
        fetch(`${BASE_HOST}/isa/heartbeat.action?_=${Date.now()}`, {
            method: 'GET',
            headers: h,
            credentials: 'include'
        }).catch(() => {});
    }, 40000);

    // =======================================================
    // 3. INYECCIÓN DE FECHAS EN VENTANAS HIJAS
    // =======================================================
    function pad(n) { return String(n).padStart(2, '0'); }

    function forzarValor(input, val) {
        if (!input) return;
        input.focus();
        try {
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, val);
        } catch (e) {
            input.value = val;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
        input.blur();
    }

    function aplicarRangoHoy(doc) {
        const ahora = new Date();
        const yyyy = ahora.getFullYear();
        const mm = pad(ahora.getMonth() + 1);
        const dd = pad(ahora.getDate());
        const hh = pad(ahora.getHours());
        const min = pad(ahora.getMinutes());
        const ss = pad(ahora.getSeconds());

        const fIni = `${yyyy}-${mm}-${dd} 00:00:00`;
        const fFin = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;

        const inputs = Array.from(doc.querySelectorAll('.el-date-editor input, input[placeholder="Select date"], input[placeholder*="Fecha"], input[placeholder*="date"]'));
        if (inputs.length >= 2) {
            forzarValor(inputs[0], fIni);
            forzarValor(inputs[1], fFin);
            
            const banner = doc.createElement('div');
            banner.style.cssText = "position:fixed;top:20px;right:20px;background:#10b981;color:#fff;padding:12px 20px;border-radius:10px;font-weight:bold;z-index:2147483647;box-shadow:0 8px 25px rgba(0,0,0,0.5);font-family:sans-serif;";
            banner.innerHTML = `📅 Fechas asignadas:<br><span style="font-size:12px;opacity:0.9;">${fIni} ➔ ${fFin}</span>`;
            doc.body.appendChild(banner);
            setTimeout(() => banner.remove(), 4000);
        }
    }

    function abrirYMonitorearReporte(refId, titulo) {
        const token = capturarTokenActual();
        let targetUrl = `${BASE_HOST}/isa/report.view?refId=${refId}&language=en_US`;
        if (token) targetUrl += `&BMEWebToken=${encodeURIComponent(token)}`;

        const win = window.open(targetUrl, '_blank');
        if (!win) {
            alert("⚠️ El navegador bloqueó la ventana emergente. Habilita las ventanas emergentes en la barra de direcciones.");
            return;
        }

        let intentos = 0;
        const timer = setInterval(() => {
            intentos++;
            try {
                if (win && win.document && win.document.body) {
                    const inputs = win.document.querySelectorAll('.el-date-editor input, input[placeholder="Select date"]');
                    if (inputs.length >= 2) {
                        clearInterval(timer);
                        setTimeout(() => aplicarRangoHoy(win.document), 700);
                    }
                }
            } catch (e) {}
            if (intentos > 60) clearInterval(timer);
        }, 400);
    }

    // =======================================================
    // 4. INTERFAZ FLOTANTE (HUD DISCRETO PARA MONITOREO)
    // =======================================================
    const viejo = document.getElementById('aicc-quick-hud');
    if (viejo) viejo.remove();

    const hud = document.createElement('div');
    hud.id = 'aicc-quick-hud';
    hud.style.cssText = `
        position: fixed; top: 75px; right: 20px; z-index: 2147483647;
        background: rgba(15, 23, 42, 0.95); border: 2px solid #38bdf8;
        border-radius: 14px; box-shadow: 0 15px 40px rgba(0,0,0,0.85);
        font-family: system-ui, sans-serif; color: #fff; width: 260px;
        backdrop-filter: blur(8px); user-select: none; overflow: hidden;
    `;

    hud.innerHTML = `
        <div id="aicc-drag" style="padding: 10px 14px; background: rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; cursor: grab; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div style="font-size: 11px; font-weight: 800; color: #38bdf8; letter-spacing: 0.5px;">⚡ AICC REPORT LAUNCHER</div>
            <button id="aicc-min-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; font-weight: bold;">−</button>
        </div>
        <div id="aicc-body" style="padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;">
            <button id="btn-rep-1259" style="background: #0284c7; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                📊 Abrir Reporte 1259
            </button>
            <button id="btn-rep-401" style="background: #2563eb; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                📈 Abrir Reporte 401
            </button>
            <button id="btn-rep-dual" style="background: #10b981; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: 800; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                ⚡ Abrir Ambos (1259 + 401)
            </button>
            <div style="font-size: 10px; color: #64748b; text-align: center; margin-top: 4px;">
                Token Sync: <span style="color:#4ade80;">Activo</span>
            </div>
        </div>
    `;

    document.body.appendChild(hud);

    // Lógica Drag & Drop
    const header = document.getElementById('aicc-drag');
    let isDrag = false, ox = 0, oy = 0;
    header.onmousedown = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDrag = true;
        header.style.cursor = 'grabbing';
        const rect = hud.getBoundingClientRect();
        ox = e.clientX - rect.left;
        oy = e.clientY - rect.top;
        hud.style.right = 'auto';
        hud.style.left = rect.left + 'px';
        hud.style.top = rect.top + 'px';
    };
    window.onmousemove = (e) => {
        if (!isDrag) return;
        hud.style.left = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - hud.offsetWidth)) + 'px';
        hud.style.top = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - hud.offsetHeight)) + 'px';
    };
    window.onmouseup = () => { isDrag = false; header.style.cursor = 'grab'; };

    // Minimizar / Expandir
    let min = false;
    const bodyEl = document.getElementById('aicc-body');
    const minBtn = document.getElementById('aicc-min-btn');
    minBtn.onclick = () => {
        min = !min;
        bodyEl.style.display = min ? 'none' : 'flex';
        minBtn.innerText = min ? '+' : '−';
        hud.style.width = min ? '190px' : '260px';
    };

    // Acciones de Botones
    document.getElementById('btn-rep-1259').onclick = () => {
        abrirYMonitorearReporte(REPORTES.r1259.refId, REPORTES.r1259.nombre);
    };

    document.getElementById('btn-rep-401').onclick = () => {
        abrirYMonitorearReporte(REPORTES.r401.refId, REPORTES.r401.nombre);
    };

    document.getElementById('btn-rep-dual').onclick = () => {
        abrirYMonitorearReporte(REPORTES.r1259.refId, REPORTES.r1259.nombre);
        setTimeout(() => {
            abrirYMonitorearReporte(REPORTES.r401.refId, REPORTES.r401.nombre);
        }, 1200);
    };
})();
