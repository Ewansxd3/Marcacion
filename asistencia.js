(async function guardianSeguroTsukasa() {
    const BOT_TOKEN = "8725869702:AAFjrG_8xYOPjl34x34yJmopktMYAexP2n4";
    const CHAT_ID   = "7372090510";
    const HORA_META = "21:03:34";

    if (window._guardianTsukasaWorker) window._guardianTsukasaWorker.terminate();

    // Capturar Token
    function obtenerTokenBearer() {
        for (let s of [localStorage, sessionStorage]) {
            for (let i = 0; i < s.length; i++) {
                const k = s.key(i), v = s.getItem(k);
                if (/token|auth|jwt/i.test(k) && v && v.length > 20) return v.replace(/^"|"$/g, '').replace(/^Bearer\s+/i, '');
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

    // Notificador Telegram (Solo Texto)
    async function notificarTelegram(texto) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text: texto, parse_mode: 'Markdown' })
        }).catch(() => {});
    }

    let salidaEjecutada = false;
    async function ejecutarSalidaDefinitiva() {
        if (salidaEjecutada) return;
        salidaEjecutada = true;
        let log = [];

        // 1. API Directa
        try {
            const token = obtenerTokenBearer();
            const h = { 'Content-Type': 'application/json' };
            if (token) h['Authorization'] = `Bearer ${token}`;
            const resApi = await fetch('/api/marcaciones/marcar', { method: 'POST', headers: h, body: JSON.stringify({ agenteId: 342, tipo: 'SALIDA' }) });
            log.push(`📡 API Directa: HTTP ${resApi.status}`);
        } catch (e) { log.push(`⚠️ API: ${e.message}`); }

        // 2. Clic DOM
        try {
            const btnFin = Array.from(document.querySelectorAll('button, div[role="button"], .cursor-pointer')).find(b => /\bFIN\b/i.test(b.innerText || '') && !b.id?.includes('hud'));
            if (btnFin) { btnFin.click(); log.push(`🖱️ Botón FIN clicado`); }
        } catch (e) {}

        // 3. Confirmar Modal
        for (let espera of [600, 1500]) {
            await new Promise(r => setTimeout(r, espera));
            const btnConfirmar = Array.from(document.querySelectorAll('button')).find(b => /confirmar|aceptar|sí|si|continuar/i.test((b.innerText || '').trim()));
            if (btnConfirmar) { btnConfirmar.click(); log.push(`✅ Modal aceptado`); }
        }

        // 4. Reporte Telegram
        await notificarTelegram(`🏁 *SALIDA EJECUTADA*\n⏰ *Hora:* \`${new Date().toLocaleTimeString('es-PE', { hour12: false })}\`\n*Detalle:*\n• ${log.join('\n• ')}`);
    }

    // Hilo invulnerable
    const workerCode = `setInterval(() => { postMessage(new Date().toTimeString().split(' ')[0]); }, 500);`;
    const worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    window._guardianTsukasaWorker = worker;

    worker.onmessage = (e) => {
        const h = e.data;
        const meta = (document.body.innerText.match(/Meta término:\s*(\d{2}:\d{2}:\d{2})/i) || [,HORA_META])[1];
        if (!salidaEjecutada && h >= meta && h < "23:59:00") ejecutarSalidaDefinitiva();
    };

    // UI
    const badge = document.createElement('div');
    badge.style.cssText = "position:fixed;bottom:18px;left:18px;background:#0f172a;border:1.5px solid #10b981;color:#10b981;padding:8px 14px;border-radius:10px;font-family:system-ui,sans-serif;font-size:12px;font-weight:700;z-index:2147483647;";
    badge.innerHTML = `🤖 @TsukasaPowerBot Listo | Meta: <b>${HORA_META}</b>`;
    document.body.appendChild(badge);

    await notificarTelegram(`🛡️ *GUARDIÁN ACTIVADO*\n🎯 *Meta:* \`${HORA_META}\`\n_Versión Segura (Sin Foto). Listo para disparar._`);
})();
