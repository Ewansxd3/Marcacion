(async function guardianDefinitivoTsukasa() {
    // =========================================================
    // 1. CREDENCIALES TELEGRAM (@TsukasaPowerBot) Y META
    // =========================================================
    const BOT_TOKEN = "8725869702:AAFjrG_8xYOPjl34x34yJmopktMYAexP2n4";
    const CHAT_ID   = "7372090510";
    const HORA_META = "21:03:34"; // Se lee del HUD o usa 21:03:34

    // Evitar duplicados si lo pegas dos veces
    if (window._guardianTsukasaWorker) window._guardianTsukasaWorker.terminate();

    // =========================================================
    // 2. CAPTURA AUTOMÁTICA DE TOKEN BEARER Y AGENTE
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

    // Sniffer pasivo de red para asegurar el Bearer token y AgenteID
    if (!window._snifferAsistenciaActivo) {
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            try {
                const cfg = args[1] || {};
                if (cfg.headers) {
                    const auth = cfg.headers['Authorization'] || cfg.headers['authorization'];
                    if (auth) window._ultimoBearerCapturado = auth.replace(/^Bearer\s+/i, '');
                }
            } catch (e) {}
            return origFetch.apply(this, args);
        };
        window._snifferAsistenciaActivo = true;
    }

    // =========================================================
    // 3. ENVÍO A TELEGRAM (MENSAJE + CAPTURA DE PANTALLA)
    // =========================================================
    async function notificarTelegram(texto, incluirFoto = false) {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: texto,
                    parse_mode: 'Markdown'
                })
            });

            if (incluirFoto) {
                if (!window.html2canvas) {
                    const code = await fetch("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js").then(r => r.text());
                    window.eval(code);
                }
                const canvas = await window.html2canvas(document.body, {
                    backgroundColor: '#0f0f0f',
                    scale: 1,
                    logging: false
                });
                const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                const fd = new FormData();
                fd.append('chat_id', CHAT_ID);
                fd.append('photo', blob, 'evidencia_salida.png');
                fd.append('caption', '📸 *Evidencia visual del estado en pantalla*');
                fd.append('parse_mode', 'Markdown');

                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                    method: 'POST',
                    body: fd
                });
            }
        } catch (err) {
            console.error("Error enviando a Telegram:", err);
        }
    }

    // =========================================================
    // 4. WAKE LOCK (EVITA SUSPENSIÓN DE PESTAÑA/SISTEMA)
    // =========================================================
    try {
        if ('wakeLock' in navigator) {
            window._wakeLockSentinel = await navigator.wakeLock.request('screen');
        }
    } catch (e) {}

    // =========================================================
    // 5. SECUENCIA LETAL DE SALIDA (API + DOM + MODAL)
    // =========================================================
    let salidaEjecutada = false;

    async function ejecutarSalidaDefinitiva() {
        if (salidaEjecutada) return;
        salidaEjecutada = true;

        let logEventos = [];

        // A. Disparo directo al Endpoint API (funciona aun con UI congelada)
        try {
            const token = obtenerTokenBearer();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const resApi = await fetch('/api/marcaciones/marcar', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ agenteId: 342, tipo: 'SALIDA' })
            });
            logEventos.push(`📡 API Directa: HTTP ${resApi.status}`);
        } catch (e) {
            logEventos.push(`⚠️ API Directa: ${e.message}`);
        }

        // B. Clic físico sobre el botón FIN
        try {
            const botones = Array.from(document.querySelectorAll('button, div[role="button"], .cursor-pointer'));
            const btnFin = botones.find(b => /\bFIN\b/i.test(b.innerText || '') && !b.id?.includes('hud'));
            if (btnFin) {
                btnFin.click();
                logEventos.push(`🖱️ Botón FIN presionado en DOM`);
            }
        } catch (e) {}

        // C. Barrido de posibles modales de confirmación (a los 600ms y 1500ms)
        for (let espera of [600, 1500]) {
            await new Promise(r => setTimeout(r, espera));
            const btnConfirmar = Array.from(document.querySelectorAll('button')).find(b =>
                /confirmar|aceptar|sí|si|continuar|finalizar/i.test((b.innerText || '').trim())
            );
            if (btnConfirmar) {
                btnConfirmar.click();
                logEventos.push(`✅ Modal de confirmación aceptado`);
            }
        }

        // D. Esperar 1.5s para que actualice la interfaz y mandar foto a Telegram
        await new Promise(r => setTimeout(r, 1500));
        const horaActual = new Date().toLocaleTimeString('es-PE', { hour12: false });

        await notificarTelegram(
`🏁 *¡SALIDA EJECUTADA CON ÉXITO!*
👤 *Agente:* EVANS SAMUEL NUÑEZ ALZAMORA (60918503)
⏰ *Hora exacta:* \`${horaActual}\` (Meta: \`${HORA_META}\`)

*Detalle de ejecución:*
• ${logEventos.join('\n• ')}`,
            true // Adjunta la foto de la pantalla
        );
    }

    // =========================================================
    // 6. WEB WORKER INMUNE A PANTALLA BLOQUEADA (CADA 500MS)
    // =========================================================
    const workerCode = `
        setInterval(() => {
            postMessage(new Date().toTimeString().split(' ')[0]);
        }, 500);
    `;
    const blobWorker = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blobWorker));
    window._guardianTsukasaWorker = worker;

    worker.onmessage = (e) => {
        const horaStr = e.data; // Formato "HH:MM:SS"
        // Leer meta dinámica del panel si existe, o usar 21:03:34
        const textoPagina = document.body.innerText || "";
        const matchMeta = textoPagina.match(/Meta término:\s*(\d{2}:\d{2}:\d{2})/i);
        const metaActiva = matchMeta ? matchMeta[1] : HORA_META;

        if (!salidaEjecutada && horaStr >= metaActiva && horaStr < "23:59:00") {
            ejecutarSalidaDefinitiva();
        }
    };

    // =========================================================
    // 7. BADGE VISUAL Y PING INMEDIATO AL CELULAR
    // =========================================================
    const badge = document.createElement('div');
    badge.style.cssText = "position:fixed;bottom:18px;left:18px;background:#0f172a;border:1.5px solid #10b981;color:#10b981;padding:8px 14px;border-radius:10px;font-family:system-ui,sans-serif;font-size:12px;font-weight:700;z-index:2147483647;box-shadow:0 8px 20px rgba(0,0,0,0.6);";
    badge.innerHTML = `🤖 @TsukasaPowerBot Conectado | Salida Blindada: <b>${HORA_META}</b>`;
    document.body.appendChild(badge);

    await notificarTelegram(
`🛡️ *GUARDIÁN DEFINITIVO ACTIVADO*
👤 *Agente:* EVANS SAMUEL (DNI: 60918503)
🎯 *Meta de salida:* \`${HORA_META}\`
🔒 *Anti-Bloqueo (Web Worker):* \`ACTIVO\`

_Puedes bloquear la pantalla con tranquilidad. A las ${HORA_META} recibirás aquí mismo la confirmación y la foto de tu salida marcada._`,
        true // Te manda una foto de prueba ahora mismo
    );
})();
