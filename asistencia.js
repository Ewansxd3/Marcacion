(async function suiteDefinitivaTsukasa() {
    // =========================================================
    // 1. CONFIGURACIÓN
    // =========================================================
    const BOT_TOKEN = "8725869702:AAFjrG_8xYOPjl34x34yJmopktMYAexP2n4";
    const CHAT_ID   = "7372090510";
    const HORA_META = "21:03:34";

    // Limpiar instancias previas si se vuelve a ejecutar
    if (window._guardianTsukasaWorker) window._guardianTsukasaWorker.terminate();
    ['hud-contador-tsukasa', 'badge-tsukasa'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });

    // =========================================================
    // 2. PANEL VISUAL CON RELOJ Y CUENTA REGRESIVA
    // =========================================================
    const hud = document.createElement('div');
    hud.id = 'hud-contador-tsukasa';
    hud.style.cssText = "position:fixed;top:20px;left:20px;background:#090d16;border:1.5px solid #38bdf8;border-radius:14px;padding:14px 20px;color:#fff;font-family:system-ui,sans-serif;z-index:2147483647;box-shadow:0 12px 35px rgba(0,0,0,0.85);min-width:230px;user-select:none;";
    hud.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:10px;font-weight:800;color:#38bdf8;letter-spacing:0.6px;">🛡️ GUARDIÁN TSUKASA</span>
            <span style="font-size:10px;background:rgba(16,185,129,0.15);color:#10b981;padding:2px 6px;border-radius:4px;font-weight:700;">Worker Activo</span>
        </div>
        <div id="reloj-vivo-hud" style="font-size:28px;font-weight:800;color:#f8fafc;margin:4px 0;font-variant-numeric:tabular-nums;">--:--:--</div>
        <div id="restante-hud" style="font-size:12px;color:#f87171;font-weight:700;">Calculando...</div>
        <div style="font-size:11px;color:#64748b;margin-top:6px;border-top:1px solid #1e293b;padding-top:6px;">
            Meta término: <b style="color:#cbd5e1;">${HORA_META}</b> | DNI: 60918503
        </div>
    `;
    document.body.appendChild(hud);

    function pad(n) { return String(n).padStart(2, '0'); }

    // =========================================================
    // 3. CAPTURA DE TOKEN BEARER Y NOTIFICADOR TELEGRAM
    // =========================================================
    function obtenerTokenBearer() {
        for (let s of [localStorage, sessionStorage]) {
            for (let i = 0; i < s.length; i++) {
                const k = s.key(i), v = s.getItem(k);
                if (/token|auth|jwt/i.test(k) && v && v.length > 20) {
                    return v.replace(/^"|"$/g, '').replace(/^Bearer\s+/i, '');
                }
            }
        }
        return window._ultimoBearerCapturado || null;
    }

    if (!window._snifferAsistenciaActivo) {
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            try {
                const cfg = args[1] || {};
                const auth = cfg.headers && (cfg.headers['Authorization'] || cfg.headers['authorization']);
                if (auth) window._ultimoBearerCapturado = auth.replace(/^Bearer\s+/i, '');
            } catch (e) {}
            return origFetch.apply(this, args);
        };
        window._snifferAsistenciaActivo = true;
    }

    async function notificarTelegram(texto) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text: texto, parse_mode: 'Markdown' })
        }).catch(() => {});
    }

    try {
        if ('wakeLock' in navigator) window._wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch (e) {}

    // =========================================================
    // 4. EJECUCIÓN DE SALIDA (API + CLIC + MODAL)
    // =========================================================
    let salidaEjecutada = false;

    async function ejecutarSalidaDefinitiva() {
        if (salidaEjecutada) return;
        salidaEjecutada = true;

        const restEl = document.getElementById('restante-hud');
        if (restEl) { restEl.style.color = '#38bdf8'; restEl.innerText = '⚡ Ejecutando salida...'; }

        let log = [];

        // 1. Disparo directo al Backend API
        try {
            const token = obtenerTokenBearer();
            const h = { 'Content-Type': 'application/json' };
            if (token) h['Authorization'] = `Bearer ${token}`;
            const resApi = await fetch('/api/marcaciones/marcar', {
                method: 'POST',
                headers: h,
                body: JSON.stringify({ agenteId: 342, tipo: 'SALIDA' })
            });
            log.push(`📡 API Directa: HTTP ${resApi.status}`);
        } catch (e) {
            log.push(`⚠️ API: ${e.message}`);
        }

        // 2. Clic físico en botón FIN
        try {
            const btnFin = Array.from(document.querySelectorAll('button, div[role="button"], .cursor-pointer'))
                .find(b => /\bFIN\b/i.test(b.innerText || '') && !b.id?.includes('hud'));
            if (btnFin) {
                btnFin.click();
                log.push(`🖱️ Botón FIN presionado`);
            }
        } catch (e) {}

        // 3. Barrido de confirmación
        for (let espera of [600, 1500]) {
            await new Promise(r => setTimeout(r, espera));
            const btnConfirmar = Array.from(document.querySelectorAll('button'))
                .find(b => /confirmar|aceptar|sí|si|continuar/i.test((b.innerText || '').trim()));
            if (btnConfirmar) {
                btnConfirmar.click();
                log.push(`✅ Modal confirmado`);
            }
        }

        if (restEl) { restEl.style.color = '#4ade80'; restEl.innerText = '✅ ¡SALIDA COMPLETADA!'; }

        await notificarTelegram(
`🏁 *¡SALIDA EJECUTADA CON ÉXITO!*
👤 *Agente:* EVANS SAMUEL (60918503)
⏰ *Hora:* \`${new Date().toLocaleTimeString('es-PE', { hour12: false })}\`
*Detalle:*
• ${log.join('\n• ')}`
        );
    }

    // =========================================================
    // 5. WEB WORKER UNIFICADO (ACTUALIZA UI Y DISPARA SALIDA)
    // =========================================================
    const workerCode = `setInterval(() => { postMessage(Date.now()); }, 500);`;
    const worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    window._guardianTsukasaWorker = worker;

    const [mH, mM, mS] = HORA_META.split(':').map(Number);

    worker.onmessage = () => {
        const ahora = new Date();
        const horaStr = ahora.toTimeString().split(' ')[0];

        // Actualizar UI
        const rEl = document.getElementById('reloj-vivo-hud');
        const restEl = document.getElementById('restante-hud');
        if (rEl) rEl.innerText = horaStr;

        if (!salidaEjecutada && restEl) {
            const metaDate = new Date();
            metaDate.setHours(mH, mM, mS, 0);
            const difSeg = Math.floor((metaDate - ahora) / 1000);
            if (difSeg > 0) {
                const min = Math.floor(difSeg / 60);
                const seg = difSeg % 60;
                restEl.innerText = `Faltan para salida: ${min}m ${pad(seg)}s`;
            }
        }

        // Evaluar disparo exacto
        if (!salidaEjecutada && horaStr >= HORA_META && horaStr < "23:59:00") {
            ejecutarSalidaDefinitiva();
        }
    };

    await notificarTelegram(`🛡️ *SUITE TSUKASA UNIFICADA ACTIVA*\n🎯 *Meta:* \`${HORA_META}\`\n⏳ _Contador visual y Web Worker corriendo._`);
})();
