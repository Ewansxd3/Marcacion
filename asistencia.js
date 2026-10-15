(function sistemaCompletoAsistenciaTurno() {
    const STORAGE_KEY_AUTH = 'evans_auth_vault_v1';
    const AGENTE_ID = 342;
    
    const OFFSET_SALIDA_MIN = 184;
    const OFFSET_SALIDA_MAX = 276;
    const OFFSET_BREAK_MIN = 75;
    const OFFSET_BREAK_MAX = 150;
    const DURACION_BREAK_SEC = (59 * 60) + 45;

    if (window._salidaTimer) clearInterval(window._salidaTimer);
    if (window._keepAliveLoop) clearInterval(window._keepAliveLoop);
    const hudViejo = document.getElementById('reloj-salida-hud');
    if (hudViejo) hudViejo.remove();
    const modalViejo = document.getElementById('modal-auth-vault');
    if (modalViejo) modalViejo.remove();

    function obtenerCredenciales() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_AUTH);
            if (!raw) return null;
            return JSON.parse(atob(raw));
        } catch (e) { return null; }
    }

    function guardarCredenciales(dni, pass) {
        localStorage.setItem(STORAGE_KEY_AUTH, btoa(JSON.stringify({ dni: dni.trim(), password: pass.trim() })));
    }

    function borrarCredenciales() {
        localStorage.removeItem(STORAGE_KEY_AUTH);
        location.reload();
    }

    function solicitarCredenciales(callback) {
        const modal = document.createElement('div');
        modal.id = 'modal-auth-vault';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
            z-index: 2147483647; display: flex; align-items: center; justify-content: center;
            font-family: system-ui, sans-serif;
        `;
        modal.innerHTML = `
            <div style="background: #111827; border: 2px solid #38bdf8; border-radius: 16px; padding: 26px; width: 330px; text-align: center; color: #fff;">
                <div style="font-size: 26px; margin-bottom: 8px;">🔐</div>
                <h3 style="margin: 0 0 6px; color: #38bdf8;">Credenciales Locales</h3>
                <p style="font-size: 12px; color: #94a3b8; margin-bottom: 16px;">Se guardan para re-loguear automáticamente si la sesión expira.</p>
                <input id="v-dni" type="text" placeholder="DNI" style="width:100%; box-sizing:border-box; padding:10px; border-radius:8px; border:1px solid #374151; background:#030712; color:#fff; margin-bottom:10px; outline:none;"/>
                <input id="v-pass" type="password" placeholder="Contraseña" style="width:100%; box-sizing:border-box; padding:10px; border-radius:8px; border:1px solid #374151; background:#030712; color:#fff; margin-bottom:16px; outline:none;"/>
                <button id="v-btn" style="width:100%; padding:10px; background:#2563eb; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Guardar y Activar</button>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('v-btn').onclick = () => {
            const d = document.getElementById('v-dni').value;
            const p = document.getElementById('v-pass').value;
            if (d && p) {
                guardarCredenciales(d, p);
                modal.remove();
                callback({ dni: d, password: p });
            }
        };
    }

    function leerHorariosDelDOM() {
        let salida = null;
        let descanso = null;
        const elementos = Array.from(document.querySelectorAll('div, p, span, button'));
        for (let el of elementos) {
            const txt = (el.innerText || '').trim();
            const mSal = txt.match(/\((\d{1,2}):(\d{2}):(\d{2})\)/);
            if (mSal && !salida) salida = { h: parseInt(mSal[1], 10), m: parseInt(mSal[2], 10), s: parseInt(mSal[3], 10) };
            
            const mBrk = txt.match(/Descanso\s+desde\s+(\d{1,2}):(\d{2}):(\d{2})/i);
            if (mBrk && !descanso) descanso = { h: parseInt(mBrk[1], 10), m: parseInt(mBrk[2], 10), s: parseInt(mBrk[3], 10) };
        }
        return {
            salida: salida || { h: 21, m: 0, s: 0 },
            descanso: descanso || { h: 15, m: 0, s: 0 }
        };
    }

    window._ultimoTokenCapturado = window._ultimoTokenCapturado || null;
    function obtenerTokenDeStorage() {
        for (let store of [localStorage, sessionStorage]) {
            for (let i = 0; i < store.length; i++) {
                let val = store.getItem(store.key(i));
                if (val && val.includes('eyJ')) {
                    try {
                        let parsed = JSON.parse(val);
                        for (let k in parsed) {
                            if (typeof parsed[k] === 'string' && parsed[k].startsWith('eyJ')) return parsed[k];
                        }
                    } catch (e) {
                        if (val.startsWith('eyJ')) return val.replace(/^"|"$/g, '');
                    }
                }
            }
        }
        return window._ultimoTokenCapturado;
    }

    if (!window._fetchEspiado) {
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            try {
                const cfg = args[1];
                if (cfg && cfg.headers) {
                    const auth = cfg.headers['Authorization'] || cfg.headers['authorization'] || 
                                 (cfg.headers.get && cfg.headers.get('Authorization'));
                    if (auth && auth.startsWith('Bearer ')) {
                        window._ultimoTokenCapturado = auth.replace('Bearer ', '').trim();
                    }
                }
            } catch (e) {}
            return origFetch.apply(this, args);
        };
        window._fetchEspiado = true;
    }

    const creds = obtenerCredenciales();
    if (!creds) {
        solicitarCredenciales(iniciarCiclo);
    } else {
        iniciarCiclo(creds);
    }

    function iniciarCiclo(usuario) {
        const horarios = leerHorariosDelDOM();
        const pad = n => String(n).padStart(2, '0');

        const offSal = Math.floor(Math.random() * (OFFSET_SALIDA_MAX - OFFSET_SALIDA_MIN + 1)) + OFFSET_SALIDA_MIN;
        const fSalida = new Date();
        fSalida.setHours(horarios.salida.h, horarios.salida.m, horarios.salida.s, 0);
        fSalida.setSeconds(fSalida.getSeconds() + offSal);
        const metaSalidaStr = `${pad(fSalida.getHours())}:${pad(fSalida.getMinutes())}:${pad(fSalida.getSeconds())}`;

        const offBrk = Math.floor(Math.random() * (OFFSET_BREAK_MAX - OFFSET_BREAK_MIN + 1)) + OFFSET_BREAK_MIN;
        const fBreakIni = new Date();
        fBreakIni.setHours(horarios.descanso.h, horarios.descanso.m, horarios.descanso.s, 0);
        fBreakIni.setSeconds(fBreakIni.getSeconds() + offBrk);
        const metaBreakIniStr = `${pad(fBreakIni.getHours())}:${pad(fBreakIni.getMinutes())}:${pad(fBreakIni.getSeconds())}`;

        let fBreakFin = null;

        const hud = document.createElement('div');
        hud.id = 'reloj-salida-hud';
        hud.style.cssText = `
            position: fixed; top: 65px; right: 25px; z-index: 999999;
            background: rgba(18, 18, 24, 0.96); color: #ffffff; border-radius: 14px;
            box-shadow: 0 10px 35px rgba(0,0,0,0.85); font-family: system-ui, sans-serif;
            min-width: 300px; backdrop-filter: blur(10px); border-left: 4px solid #ef4444;
            user-select: none; overflow: hidden;
        `;

        hud.innerHTML = `
            <div id="hud-drag" style="display:flex; justify-content:space-between; align-items:center; padding:8px 14px; background:rgba(255,255,255,0.05); cursor:grab; border-bottom:1px solid rgba(255,255,255,0.08);">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:12px; opacity:0.5;">⠿</span>
                    <span style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:1px; color:#f87171;">Turno Completo Blindado</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span id="hud-mini-reloj" style="display:none; font-size:12px; font-weight:700; color:#f87171;">--:--:--</span>
                    <button id="hud-btn-cfg" title="Cambiar credenciales" style="background:transparent; border:none; color:#94a3b8; cursor:pointer; font-size:12px;">⚙️</button>
                    <button id="hud-btn-min" style="background:rgba(255,255,255,0.1); border:none; color:#fff; width:22px; height:22px; border-radius:6px; cursor:pointer;">−</button>
                </div>
            </div>
            <div id="hud-body" style="padding:14px 18px 16px; text-align:center;">
                <div id="hud-hora-actual" style="font-size:26px; font-weight:700; font-variant-numeric:tabular-nums; color:#f87171;">--:--:--</div>
                
                <div id="hud-tiempo-salida" style="font-size:12.5px; margin-top:6px; color:#cbd5e1;">Faltan para salida: Calculando...</div>
                <div style="font-size:10.5px; color:#94a3b8; margin-top:2px;">Meta término: <b style="color:#f87171;">${metaSalidaStr}</b></div>

                <div style="border-top: 1px solid rgba(255,255,255,0.08); margin: 10px 0;"></div>

                <div id="hud-box-break" style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 8px 10px; transition: border-color 0.3s;">
                    <div id="hud-contador-break" style="font-size:12px; font-weight:600; color:#fbbf24;">Tiempo faltante para break: ...</div>
                    <div id="hud-meta-break-txt" style="font-size:10.5px; color:#94a3b8; margin-top:2px;">Meta inicio: <b style="color:#fbbf24;">${metaBreakIniStr}</b></div>
                </div>

                <div id="hud-estado-sesion" style="margin-top:10px; font-size:11px; color:#4ade80;">🛡️ DNI: ${usuario.dni} | Online</div>
            </div>
        `;
        document.body.appendChild(hud);

        const header = document.getElementById('hud-drag');
        const btnMin = document.getElementById('hud-btn-min');
        const bodyEl = document.getElementById('hud-body');
        const miniReloj = document.getElementById('hud-mini-reloj');

        let arrastrando = false, offX = 0, offY = 0;
        header.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            arrastrando = true;
            header.style.cursor = 'grabbing';
            const r = hud.getBoundingClientRect();
            offX = e.clientX - r.left;
            offY = e.clientY - r.top;
            hud.style.right = 'auto';
            hud.style.left = r.left + 'px';
            hud.style.top = r.top + 'px';
        };
        document.onmousemove = (e) => {
            if (!arrastrando) return;
            hud.style.left = Math.max(0, Math.min(e.clientX - offX, window.innerWidth - hud.offsetWidth)) + 'px';
            hud.style.top = Math.max(0, Math.min(e.clientY - offY, window.innerHeight - hud.offsetHeight)) + 'px';
        };
        document.onmouseup = () => { arrastrando = false; header.style.cursor = 'grab'; };

        let minimizado = false;
        btnMin.onclick = () => {
            minimizado = !minimizado;
            bodyEl.style.display = minimizado ? 'none' : 'block';
            miniReloj.style.display = minimizado ? 'inline' : 'none';
            btnMin.innerText = minimizado ? '+' : '−';
            hud.style.minWidth = minimizado ? '220px' : '300px';
        };

        document.getElementById('hud-btn-cfg').onclick = () => {
            if (confirm("¿Deseas cambiar el DNI y la Contraseña guardados?")) borrarCredenciales();
        };

        function escribirReact(el, val) {
            if (!el) return;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        let ultimoLoginMs = 0;
        function comprobarYReloguear() {
            const iD = document.querySelector('input[placeholder*="documento" i], input[name*="dni" i]');
            const iP = document.querySelector('input[type="password"], input[placeholder*="Contrasena" i]');
            const bL = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim().toLowerCase() === 'ingresar');
            const elEstado = document.getElementById('hud-estado-sesion');

            if (iD && iP && bL) {
                const ahora = Date.now();
                if (ahora - ultimoLoginMs > 4500) {
                    ultimoLoginMs = ahora;
                    if (elEstado) {
                        elEstado.style.color = '#fbbf24';
                        elEstado.innerText = '🔑 Relogueando automáticamente...';
                    }
                    escribirReact(iD, usuario.dni);
                    escribirReact(iP, usuario.password);
                    setTimeout(() => { bL.removeAttribute('disabled'); bL.click(); }, 400);
                }
                return false;
            }
            return true;
        }

        async function marcarAPI(tipo) {
            const token = obtenerTokenDeStorage();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = 'Bearer ' + token;
            try {
                const res = await fetch('http://172.17.248.203:9099/api/marcaciones/marcar', {
                    method: 'POST',
                    headers: headers,
                    credentials: 'include',
                    body: JSON.stringify({ agenteId: AGENTE_ID, tipo: tipo })
                });
                return res.ok || res.status === 409;
            } catch (e) { return false; }
        }

        function pulsarBotonDOM(tipoTexto) {
            const els = Array.from(document.querySelectorAll('button, div, [role="button"]'));
            const btn = els.reverse().find(el => {
                const t = (el.innerText || '').trim().toUpperCase();
                return t.includes(tipoTexto.toUpperCase()) && !t.includes('NO DISPONIBLE');
            });
            if (btn) {
                const trg = btn.closest('button') || btn;
                trg.removeAttribute('disabled');
                trg.click();
                return true;
            }
            return false;
        }

        function cerrarSesionWeb() {
            const btns = Array.from(document.querySelectorAll('header button, nav button, button'));
            const b = btns.find(x => {
                const r = x.getBoundingClientRect();
                return r.top < 60 && r.right > (window.innerWidth - 70);
            });
            if (b) b.click();
        }

        window._keepAliveLoop = setInterval(() => {
            document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: Math.random() * 200, clientY: Math.random() * 200 }));
            const tok = obtenerTokenDeStorage();
            if (tok) {
                fetch(`http://172.17.248.203:9099/api/marcaciones/estado/${AGENTE_ID}`, {
                    headers: { 'Authorization': 'Bearer ' + tok }
                }).catch(() => {});
            }
        }, 20000);

        let breakIniciado = false;
        let breakFinalizado = false;
        let salidaCompletada = false;

        window._salidaTimer = setInterval(async () => {
            const sesionActiva = comprobarYReloguear();
            const ahora = new Date();
            const horaStr = ahora.toTimeString().split(' ')[0];

            const elHora = document.getElementById('hud-hora-actual');
            const elSalida = document.getElementById('hud-tiempo-salida');
            const elBreak = document.getElementById('hud-contador-break');
            const boxBreak = document.getElementById('hud-box-break');
            const txtMetaBreak = document.getElementById('hud-meta-break-txt');

            if (elHora) elHora.innerText = horaStr;
            if (miniReloj) miniReloj.innerText = horaStr;

            if (!breakIniciado) {
                const diffBrkMs = fBreakIni - ahora;
                if (diffBrkMs > 0) {
                    const bH = Math.floor(diffBrkMs / 3600000);
                    const bM = Math.floor((diffBrkMs % 3600000) / 60000);
                    const bS = Math.floor((diffBrkMs % 60000) / 1000);
                    if (elBreak) elBreak.innerHTML = `Tiempo faltante para break: <b>${bH}h ${bM}m ${bS < 10 ? '0' : ''}${bS}s</b>`;
                } else {
                    if (sesionActiva) {
                        breakIniciado = true;
                        if (elBreak) elBreak.innerHTML = `<b style="color: #fbbf24;">⚡ Marcando inicio de Break...</b>`;
                        await marcarAPI('DESCANSO');
                        pulsarBotonDOM('DESCANSO');

                        fBreakFin = new Date(ahora.getTime() + (DURACION_BREAK_SEC * 1000));
                        const metaFinStr = `${pad(fBreakFin.getHours())}:${pad(fBreakFin.getMinutes())}:${pad(fBreakFin.getSeconds())}`;

                        if (boxBreak) boxBreak.style.border = '1px solid #4ade80';
                        if (txtMetaBreak) txtMetaBreak.innerHTML = `Retorno automático fijado: <b style="color:#4ade80;">${metaFinStr}</b>`;
                    }
                }
            } else if (!breakFinalizado) {
                const diffFinMs = fBreakFin - ahora;
                if (diffFinMs > 0) {
                    const rM = Math.floor(diffFinMs / 60000);
                    const rS = Math.floor((diffFinMs % 60000) / 1000);
                    if (elBreak) elBreak.innerHTML = `Break ✔️ (Retorno en: <b>${rM}m ${rS < 10 ? '0' : ''}${rS}s</b>)`;
                } else {
                    if (sesionActiva) {
                        breakFinalizado = true;
                        if (elBreak) elBreak.innerHTML = `<b style="color: #38bdf8;">⚡ Marcando Retorno de Break...</b>`;
                        await marcarAPI('RETORNO');
                        pulsarBotonDOM('DESCANSO');
                        if (elBreak) elBreak.innerHTML = `<b style="color: #4ade80;">Break ✔️ (Completado)</b>`;
                        if (txtMetaBreak) txtMetaBreak.innerHTML = `<span style="color:#94a3b8;">Jornada reanudada correctamente</span>`;
                    }
                }
            }

            const diffSalMs = fSalida - ahora;
            if (salidaCompletada) {
                if (elSalida) elSalida.innerHTML = `<b style="color: #4ade80;">✔ SALIDA COMPLETADA</b>`;
            } else if (diffSalMs > 0) {
                const sH = Math.floor(diffSalMs / 3600000);
                const sM = Math.floor((diffSalMs % 3600000) / 60000);
                const sS = Math.floor((diffSalMs % 60000) / 1000);
                if (elSalida) elSalida.innerHTML = `Faltan para salida: <b>${sH}h ${sM}m ${sS < 10 ? '0' : ''}${sS}s</b>`;
            } else {
                if (!salidaCompletada && sesionActiva) {
                    salidaCompletada = true;
                    if (window._salidaTimer) clearInterval(window._salidaTimer);
                    if (window._keepAliveLoop) clearInterval(window._keepAliveLoop);

                    if (minimizado) btnMin.click();
                    if (elSalida) elSalida.innerHTML = `<b style="color: #fbbf24;">⚡ Marcando Salida...</b>`;

                    await marcarAPI('SALIDA');
                    pulsarBotonDOM('FIN');

                    hud.style.borderLeft = '4px solid #4ade80';
                    hud.style.boxShadow = '0 0 25px rgba(74, 222, 128, 0.4)';
                    if (elHora) elHora.style.color = '#4ade80';
                    if (elSalida) elSalida.innerHTML = `<b style="color: #4ade80;">✔ SALIDA REGISTRADA (${horaStr})</b><br><span style="font-size:11px; opacity:0.8;">Cerrando sesión en 4s...</span>`;

                    setTimeout(cerrarSesionWeb, 4000);
                }
            }
        }, 1000);
    }
})();
