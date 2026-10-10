// ui.js — Render y eventos del portal de padres.

import { authPadre, getHistorial, guardarSesion, leerSesion, borrarSesion } from './api.js';
import { generarNarrativa, etiquetaSemaforo, claseSemaforo } from './narrativa.js';

let sesion = null;

// === Boot ===

window.addEventListener('DOMContentLoaded', async () => {
  sesion = leerSesion();
  if (sesion && sesion.sesionToken && sesion.alumnoId) {
    mostrarDashboard();
    await cargarHistorial();
  } else {
    mostrarLogin();
  }
});

// === Login ===

function mostrarLogin() {
  document.getElementById('loginArea').classList.remove('hidden');
  document.getElementById('dashboardArea').classList.add('hidden');
  document.getElementById('dashboardArea').classList.remove('flex');
  document.body.classList.remove('dashboard-active');
  document.getElementById('alumnoId').focus();
}

window.handleLogin = async () => {
  const alumnoId = document.getElementById('alumnoId').value.trim();
  const pin = document.getElementById('pin').value.trim();
  const btn = document.getElementById('btnLogin');
  const errEl = document.getElementById('loginError');

  errEl.textContent = '';
  if (!alumnoId || !pin) {
    errEl.textContent = 'Ingresa el ID del alumno y el PIN.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    // Enviamos el alumnoId ya limpio con .trim() para evitar errores de espacios invisibles
    const resp = await authPadre(alumnoId, pin);
    if (!resp.ok) {
      errEl.textContent = resp.error || 'No fue posible iniciar sesión.';
      btn.disabled = false;
      btn.textContent = 'Consultar';
      return;
    }
    sesion = {
      alumnoId: resp.alumnoId,
      nombreNombre: resp.nombreAlumno,
      sesionToken: resp.sesionToken,
      expiraEn: resp.expiraEn
    };
    guardarSesion(sesion);
    mostrarDashboard();
    await cargarHistorial();
  } catch (e) {
    errEl.textContent = 'Error de conexión: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Consultar';
  }
};

// === Dashboard ===

function mostrarDashboard() {
  document.getElementById('loginArea').classList.add('hidden');
  document.getElementById('dashboardArea').classList.remove('hidden');
  document.getElementById('dashboardArea').classList.add('flex');
  document.body.classList.add('dashboard-active');
}

async function cargarHistorial() {
  const cont = document.getElementById('historial');
  cont.innerHTML = `
    <div class="text-center py-12 text-slate-400">
      <div class="inline-block animate-pulse">Cargando historial...</div>
    </div>
  `;

  try {
    const resp = await getHistorial(sesion.sesionToken, sesion.alumnoId);
    if (!resp.ok) {
      cont.innerHTML = `
        <div class="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl text-center">
          <p class="font-bold">${escapeHtml(resp.error || 'No se pudo cargar el historial.')}</p>
          <button onclick="logout()" class="mt-4 text-sm underline">Cerrar sesión</button>
        </div>
      `;
      return;
    }

    document.getElementById('alumnoNombreHeader').textContent = resp.alumno.nombre || sesion.nombreAlumno;
    document.getElementById('alumnoMetaHeader').textContent = `${resp.alumno.grado} · ${resp.alumno.alumnoId}`;
    document.getElementById('maestroLabel').textContent = resp.alumno.maestroNombre || '';

    if (!resp.historial || resp.historial.length === 0) {
      cont.innerHTML = `
        <div class="bg-white p-12 rounded-2xl shadow-sm text-center">
          <div class="text-5xl mb-3">📚</div>
          <h3 class="font-bold text-slate-800 mb-2">Aún no hay evaluaciones para ${escapeHtml(resp.alumno.nombre)}.</h3>
          <p class="text-sm text-slate-600">Vuelve a consultar cuando el docente haya capturado la primera evaluación mensual.</p>
        </div>
      `;
      return;
    }

    cont.innerHTML = resp.historial.map(ev => renderCard(ev, resp.alumno)).join('');
    iniciarOdometros(cont);
  } catch (e) {
    cont.innerHTML = `
      <div class="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl text-center">
        <p class="font-bold">Error de conexión</p>
        <p class="text-sm">${escapeHtml(e.message)}</p>
        <button onclick="logout()" class="mt-4 text-sm underline">Cerrar sesión</button>
      </div>
    `;
  }
}

function renderCard(ev, alumno) {
  const evFull = Object.assign({}, ev, {
    nombreAlumno: alumno.nombre,
    grado: alumno.grado
  });
  const cualitativo = esCualitativoAlumno_(alumno);

  // ID único por tarjeta (para asociar odómetros, botón de play, etc.)
  const cardId = `ev-${(ev.id || ev.mes || Math.random().toString(36).slice(2)).toString().replace(/[^a-z0-9_-]/gi, '_')}`;

  if (cualitativo) {
    return renderCardCualitativa(evFull, alumno, cardId);
  }
  return renderCardNumerica(evFull, alumno, cardId);
}

/**
 * Indica si un alumno (visto desde el portal de padres) es cualitativo.
 * Coincide con la regla del backend: grado empieza con "preescolar" o está
 * en la lista de sinónimos.
 */
function esCualitativoAlumno_(alumno) {
  if (!alumno) return false;
  const g = String(alumno.grado || '').toLowerCase().trim();
  if (!g) return false;
  const lista = ['preescolar 1°', 'preescolar 2°', 'preescolar 3°',
                 'preescolar', 'maternal', 'kinder', 'prekinder', 'prekínder'];
  return lista.some(k => g === k || g.startsWith('preescolar'));
}

/**
 * Tarjeta cualitativa para alumnos de preescolar.
 * Cambio 2026-08-20: 3 chips de semáforo (uno por dimensión) + acordeón
 * expandible con las 10 sub-observaciones. La dimensión cognitivo viene
 * expandida por default; las otras dos colapsadas.
 *
 * Si el payload viene del periodo legacy (sin dimensiones), cae al
 * fallback de un solo chip + 1 mensaje.
 */
function renderCardCualitativa(ev, alumno, cardId) {
  const narrativa = generarNarrativa(ev);
  const mensajeMaestro = String(ev.observaciones || '').trim();

  // Detectar si el payload ya trae las 3 dimensiones
  const tieneDims = !!(ev.desempenoCognitivo || ev.desempenoSocioemocional || ev.desempenoFisico
    || ev.semaforoCognitivo || ev.semaforoSocioemocional || ev.semaforoFisico);

  let chipsRow = '';
  let acordeon = '';
  let escalaFooter = '';

  if (tieneDims) {
    const dims = [
      { k: 'cognitivo',      icon: '🧠', titulo: 'Desarrollo cognitivo',
        nivel: ev.desempenoCognitivo,      sem: ev.semaforoCognitivo },
      { k: 'socioemocional', icon: '💛', titulo: 'Desarrollo socioemocional',
        nivel: ev.desempenoSocioemocional, sem: ev.semaforoSocioemocional },
      { k: 'fisico',         icon: '💪', titulo: 'Desarrollo físico',
        nivel: ev.desempenoFisico,         sem: ev.semaforoFisico }
    ];
    chipsRow = `
      <div class="chip-triple">
        ${dims.map(d => renderChipDimension_(d)).join('')}
      </div>
    `;
    acordeon = `
      <div class="acordeon-dim">
        ${dims.map((d, i) => renderAcordeonDimension_(d, ev, i === 0)).join('')}
      </div>
    `;
    escalaFooter = `<p class="text-xs text-zinc-500 mt-3">Escala: 1 = Necesita apoyo · 2 = En desarrollo · 3 = Logro esperado · 4 = Desempeño sobresaliente</p>`;
  } else {
    // Fallback legacy (1 nivel + 1 mensaje)
    const semaforo = ev.semaforo || 'Amarillo';
    const clase = claseSemaforo(semaforo);
    const etiqueta = etiquetaSemaforo(semaforo);
    const nivel = parseInt(ev.pensamiento || 0, 10);
    const etiquetaNivel = ({
      1: 'Necesita apoyo', 2: 'En desarrollo',
      3: 'Logro esperado', 4: 'Desempeño sobresaliente'
    })[nivel] || 'Sin nivel';
    chipsRow = `
      <div class="rounded-2xl p-6 text-center" style="background:linear-gradient(135deg,#fdf2f8,#fef9c3); border:1px solid #fbbf24;">
        <p class="text-[0.65rem] font-extrabold uppercase tracking-widest text-zinc-500 mb-2">Desempeño general</p>
        <div class="text-3xl md:text-4xl font-extrabold mb-2" style="color:var(--wundt-guinda);">${escapeHtml(etiquetaNivel)}</div>
        <span class="semaforo-chip ${clase}" style="font-size:.9rem;">Nivel ${nivel} de 4 · ${etiqueta}</span>
        <p class="text-xs text-zinc-500 mt-3">Escala: 1 = Necesita apoyo · 2 = En desarrollo · 3 = Logro esperado · 4 = Desempeño sobresaliente</p>
      </div>
    `;
  }

  return `
    <article class="ev-card fade-in" data-card-id="${escapeHtml(cardId)}">

      <header>
        <div class="min-w-0">
          <h3 class="wundt-display text-xl md:text-2xl font-extrabold text-zinc-900 truncate">
            ${escapeHtml(ev.mes)} ${escapeHtml(ev.cicloEscolar || '')}
          </h3>
          <p class="text-xs md:text-sm text-zinc-500 mt-1">
            <span class="font-bold text-zinc-700">Mes de captura:</span> ${escapeHtml(ev.mes)}
          </p>
        </div>
      </header>

      <!-- P40: Encabezado institucional solo para impresión -->
      <div class="print-only print-header-inst">
        <img src="../compartido/assets/img/will_transparent.png" alt="Wundt"
             onerror="this.style.display='none'">
        <div>
          <h4>Instituto Wilhelm Wundt SC</h4>
          <p>Reporte Mensual de Evaluación</p>
        </div>
      </div>

      <div class="p-4 md:p-6">
        ${chipsRow}
      </div>

      ${acordeon}

      ${mensajeMaestro ? `
        <div class="px-4 md:px-6 pb-4 md:pb-6">
          <div class="maestro-msg">
            <p class="text-[0.65rem] font-extrabold uppercase tracking-widest text-[color:var(--wundt-guinda)] mb-1.5">
              Mensaje del maestro
            </p>
            <p class="text-sm md:text-base text-zinc-800 leading-relaxed whitespace-pre-line">${escapeHtml(mensajeMaestro)}</p>
          </div>
        </div>
      ` : ''}

      <div class="px-4 md:px-6 pb-5 md:pb-6 flex flex-wrap items-center gap-2 no-print">
        <button type="button"
                class="btn-card guinda"
                data-action="play"
                data-card-id="${escapeHtml(cardId)}"
                aria-label="Escuchar la narrativa de esta evaluación">
          <span data-icon>🔊</span>
          <span data-label>Escuchar narrativa</span>
        </button>
        <button type="button"
                class="btn-card"
                data-action="print"
                data-card-id="${escapeHtml(cardId)}"
                aria-label="Exportar o imprimir esta tarjeta">
          <span data-icon>🖨️</span>
          <span data-label>Exportar / Imprimir</span>
        </button>
        <button type="button"
                class="btn-card"
                data-action="narrativa"
                aria-label="Ver narrativa completa">
          <span data-icon>📖</span>
          <span data-label>Ver narrativa completa</span>
        </button>
      </div>

      <!-- P40: Footer formal con espacio para firma del tutor (solo en impresión) -->
      <div class="print-only print-footer-formal">
        <div class="doc-info">
          <p><strong>Documento</strong> · Reporte mensual de evaluación</p>
          <p>Alumno(a): <strong>${escapeHtml(ev.nombreAlumno || alumno.nombre)}</strong></p>
          <p>Grado: <strong>${escapeHtml(ev.grado || alumno.grado)}</strong></p>
          <p>Mes: <strong>${escapeHtml(ev.mes)}</strong></p>
          <p>Generado: <strong>${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></p>
        </div>
        <div class="firma-block">
          <div class="firma-line">Nombre y firma del padre/tutor</div>
          <div class="firma-sub">Instituto Wilhelm Wundt SC</div>
        </div>
      </div>

      <details class="border-t border-slate-100">
        <summary class="summary-row">
          <span>📖 Narrativa completa</span>
          <span class="summary-chev" aria-hidden="true">▾</span>
        </summary>
        <div class="px-4 md:px-6 pb-4 md:pb-6 pt-4 text-slate-700 leading-relaxed whitespace-pre-line text-sm md:text-base">
${escapeHtml(narrativa)}
        </div>
      </details>
    </article>
  `;
}

/**
 * Render de un chip individual por dimensión (cualitativo, vista padres).
 * Muestra icono + título corto + nivel + clase de semáforo.
 */
function renderChipDimension_(d) {
  const sem = d.sem || '';
  const cls = sem ? claseSemaforo(sem) : 'semaforo-sin-dato';
  const nivelTxt = d.nivel ? `Nivel ${d.nivel}` : 'Sin nivel';
  const semCorto = ({ 'Verde': 'Avance destacado', 'Amarillo': 'En desarrollo', 'Rojo': 'Necesita apoyo' })[sem] || 'Sin capturar';
  return `
    <div class="dim-chip ${cls}">
      <div class="dim-chip-icon">${d.icon}</div>
      <div class="dim-chip-body">
        <div class="dim-chip-title">${escapeHtml(d.titulo)}</div>
        <div class="dim-chip-meta">${escapeHtml(nivelTxt)} · ${escapeHtml(semCorto)}</div>
      </div>
    </div>
  `;
}

/**
 * Render del acordeón por dimensión. Incluye el header (icono + titulo + chip)
 * y el cuerpo con la lista de sub-aspectos (10 totales, agrupados por dimensión).
 * `abierto` controla si arranca expandido.
 */
function renderAcordeonDimension_(d, ev, abierto) {
  const subs = SUBASPECTOS_POR_DIM_[d.k] || [];
  const items = subs.map(s => {
    const txt = String(ev[s.k] || '').trim();
    if (!txt) return '';
    return `
      <div class="dim-sub-item">
        <span class="dim-sub-tit">${escapeHtml(s.t)}</span>
        <p class="dim-sub-text">${escapeHtml(txt)}</p>
      </div>
    `;
  }).filter(Boolean).join('');
  if (!items) return '';
  return `
    <details class="acordeon-dim-item" ${abierto ? 'open' : ''}>
      <summary class="acordeon-dim-summary">
        <span class="acordeon-dim-icon">${d.icon}</span>
        <span class="acordeon-dim-title">${escapeHtml(d.titulo)}</span>
        ${d.sem ? `<span class="semaforo-chip ${claseSemaforo(d.sem)}" style="font-size:.7rem;">${d.sem}</span>` : ''}
        <span class="acordeon-dim-chev">▾</span>
      </summary>
      <div class="acordeon-dim-body">
        ${items}
      </div>
    </details>
  `;
}

/**
 * Definición espejo de SUBASPECTOS_POR_DIM (narrativa.js) para el render.
 * Mantenida en sync manual.
 */
const SUBASPECTOS_POR_DIM_ = {
  cognitivo: [
    { k: 'obsAprendizaje',             t: 'Aprendizaje' },
    { k: 'obsComprension',             t: 'Comprensión' },
    { k: 'obsMemoria',                 t: 'Memoria' }
  ],
  socioemocional: [
    { k: 'obsHabilidadesComunicacion', t: 'Habilidades de comunicación' },
    { k: 'obsHabilidadesSociales',     t: 'Habilidades sociales' },
    { k: 'obsConvivenciaAutogestion',  t: 'Convivencia y autogestión' },
    { k: 'obsAutonomiaIndependencia',  t: 'Autonomía e independencia' },
    { k: 'obsResolucionConflictos',    t: 'Resolución de conflictos' }
  ],
  fisico: [
    { k: 'obsMotricidadGruesaFina',    t: 'Motricidad gruesa y fina' },
    { k: 'obsCoordinacionEquilibrio',  t: 'Coordinación y equilibrio' }
  ]
};

/**
 * Tarjeta numérica para alumnos de 1°-6° primaria y 1°-3° secundaria.
 * Bloque "Otros formativos" se agrega al final si hay al menos un dato capturado.
 */
function renderCardNumerica(ev, alumno, cardId) {
  const narrativa = generarNarrativa(ev);
  const semaforo = ev.semaforo || 'Amarillo';
  const clase = claseSemaforo(semaforo);
  const etiqueta = etiquetaSemaforo(semaforo);

  // Promedio de competencias (pensamiento, participación, autogestión, colaboración)
  const compProm = (
    (parseInt(ev.pensamiento, 10) || 0) +
    (parseInt(ev.participacion, 10) || 0) +
    (parseInt(ev.autogestion, 10) || 0) +
    (parseInt(ev.colaboracion, 10) || 0)
  ) / 4;

  const calificacion = parseFloat(ev.calificacion || 0);
  const asistencia = parseInt(ev.asistencia || 0, 10);
  const indice = parseFloat(ev.indice || 0);

  // Texto del mensaje del maestro (campo ev.observaciones)
  const mensajeMaestro = String(ev.observaciones || '').trim();

  // Detecta si hay formativos capturados (al menos uno con dato)
  const tieneFormativos =
    (ev.lenCalif !== '' && ev.lenCalif != null && ev.lenCalif !== undefined) ||
    (ev.edFisCalif !== '' && ev.edFisCalif != null && ev.edFisCalif !== undefined) ||
    (ev.compCalif !== '' && ev.compCalif != null && ev.compCalif !== undefined) ||
    (ev.lenObs && String(ev.lenObs).trim()) ||
    (ev.edFisObs && String(ev.edFisObs).trim()) ||
    (ev.compObs && String(ev.compObs).trim());

  return `
    <article class="ev-card fade-in" data-card-id="${escapeHtml(cardId)}">

      <header>
        <div class="min-w-0">
          <h3 class="wundt-display text-xl md:text-2xl font-extrabold text-zinc-900 truncate">
            ${escapeHtml(ev.mes)} ${escapeHtml(ev.cicloEscolar || '')}
          </h3>
          <p class="text-xs md:text-sm text-zinc-500 mt-1">
            <span class="font-bold text-zinc-700">Mes de captura:</span> ${escapeHtml(ev.mes)}
          </p>
        </div>
        <span class="semaforo-chip ${clase}">${etiqueta}</span>
      </header>

      <!-- P40: Encabezado institucional solo para impresión -->
      <div class="print-only print-header-inst">
        <img src="../compartido/assets/img/will_transparent.png" alt="Wundt"
             onerror="this.style.display='none'">
        <div>
          <h4>Instituto Wilhelm Wundt SC</h4>
          <p>Reporte Mensual de Evaluación</p>
        </div>
      </div>

      <div class="p-4 md:p-6 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">

        <div class="metric-block guinda">
          <div class="label">Calificación <span class="opacity-70">*</span></div>
          <div class="odometro guinda" data-valor="${calificacion.toFixed(1)}" data-decimales="1" data-duracion="900">
            <span class="dig">0</span><span class="sep">.</span><span class="dig">0</span>
          </div>
          <div class="sub">* Evaluación escrita &nbsp;/&nbsp;10</div>
        </div>

        <div class="metric-block negro">
          <div class="label">Asistencia</div>
          <div class="odometro negro" data-valor="${asistencia}" data-decimales="0" data-duracion="1100">
            <span class="dig">0</span><span class="sep" style="opacity:.55">%</span>
          </div>
          <div class="sub">Porcentaje mensual</div>
        </div>

        <div class="metric-block gris">
          <div class="label">Competencias</div>
          <div class="odometro" data-valor="${compProm.toFixed(1)}" data-decimales="1" data-duracion="900">
            <span class="dig">0</span><span class="sep">.</span><span class="dig">0</span>
          </div>
          <div class="sub">* Habilidades socioemocionales &nbsp;/&nbsp;4<br>Pensamiento · Participación<br>Autogestión · Colaboración</div>
        </div>

        <div class="metric-block negro" style="--accent: var(--wundt-guinda);">
          <div class="label">Índice</div>
          <div class="odometro guinda" data-valor="${indice.toFixed(2)}" data-decimales="2" data-duracion="1200">
            <span class="dig">0</span><span class="sep">.</span><span class="dig">00</span>
          </div>
          <div class="sub">* Promedio global del mes &nbsp;/&nbsp;10<br>Último dato publicado</div>
        </div>
      </div>

      ${renderPesosIndice_()}

      ${mensajeMaestro ? `
        <div class="px-4 md:px-6 pb-4 md:pb-6">
          <div class="maestro-msg">
            <p class="text-[0.65rem] font-extrabold uppercase tracking-widest text-[color:var(--wundt-guinda)] mb-1.5">
              Mensaje del maestro
            </p>
            <p class="text-sm md:text-base text-zinc-800 leading-relaxed whitespace-pre-line">${escapeHtml(mensajeMaestro)}</p>
          </div>
        </div>
      ` : ''}

      ${tieneFormativos ? renderBloqueFormativosPadres(ev) : ''}

      <div class="px-4 md:px-6 pb-5 md:pb-6 flex flex-wrap items-center gap-2 no-print">
        <button type="button"
                class="btn-card guinda"
                data-action="play"
                data-card-id="${escapeHtml(cardId)}"
                aria-label="Escuchar la narrativa de esta evaluación">
          <span data-icon>🔊</span>
          <span data-label>Escuchar narrativa</span>
        </button>
        <button type="button"
                class="btn-card"
                data-action="print"
                data-card-id="${escapeHtml(cardId)}"
                aria-label="Exportar o imprimir esta tarjeta">
          <span data-icon>🖨️</span>
          <span data-label>Exportar / Imprimir</span>
        </button>
        <button type="button"
                class="btn-card"
                data-action="narrativa"
                aria-label="Ver narrativa completa">
          <span data-icon>📖</span>
          <span data-label>Ver narrativa completa</span>
        </button>
      </div>

      <!-- P40: Footer formal con espacio para firma del tutor (solo en impresión) -->
      <div class="print-only print-footer-formal">
        <div class="doc-info">
          <p><strong>Documento</strong> · Reporte mensual de evaluación</p>
          <p>Alumno(a): <strong>${escapeHtml(ev.nombreAlumno || alumno.nombre)}</strong></p>
          <p>Grado: <strong>${escapeHtml(ev.grado || alumno.grado)}</strong></p>
          <p>Mes: <strong>${escapeHtml(ev.mes)}</strong></p>
          <p>Generado: <strong>${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></p>
        </div>
        <div class="firma-block">
          <div class="firma-line">Nombre y firma del padre/tutor</div>
          <div class="firma-sub">Instituto Wilhelm Wundt SC</div>
        </div>
      </div>

      <details class="border-t border-slate-100">
        <summary class="summary-row">
          <span>📖 Narrativa completa</span>
          <span class="summary-chev" aria-hidden="true">▾</span>
        </summary>
        <div class="px-4 md:px-6 pb-4 md:pb-6 pt-4 text-slate-700 leading-relaxed whitespace-pre-line text-sm md:text-base">
${escapeHtml(narrativa)}
        </div>
      </details>
    </article>
  `;
}

/**
 * Bloque "Otros formativos" para vista de padres (numérico).
 * Muestra 3 sub-tarjetas (Lenguajes, Ed. Física, Computación) con calif + obs.
 */
function renderBloqueFormativosPadres(ev) {
  const campos = [
    { calif: ev.lenCalif, obs: ev.lenObs, titulo: 'Lenguajes', icono: '📚' },
    { calif: ev.edFisCalif, obs: ev.edFisObs, titulo: 'Educación Física', icono: '🏃' },
    { calif: ev.compCalif, obs: ev.compObs, titulo: 'Computación', icono: '💻' }
  ];
  const cards = campos.map(c => {
    const tieneCalif = c.calif !== '' && c.calif != null && c.calif !== undefined;
    const califNum = tieneCalif ? parseFloat(c.calif) : 0;
    const obsTxt = String(c.obs || '').trim();
    return `
      <div class="rounded-xl p-3" style="background:#f0f9ff;border:1px solid #bae6fd;">
        <div class="flex items-center gap-2 mb-1">
          <span>${c.icono}</span>
          <span class="text-xs font-bold text-slate-700">${c.titulo}</span>
        </div>
        ${tieneCalif ? `
          <div class="flex items-baseline gap-1 mb-1">
            <span class="odometro guinda" data-valor="${califNum.toFixed(1)}" data-decimales="1" data-duracion="700" style="font-size:1.5rem;font-weight:700;color:var(--wundt-guinda);">
              <span class="dig">0</span><span class="sep">.</span><span class="dig">0</span>
            </span>
            <span class="text-xs text-slate-500">/10</span>
          </div>
        ` : '<div class="text-xs text-slate-400 mb-1">Sin calificación</div>'}
        ${obsTxt ? `<p class="text-xs text-slate-700 whitespace-pre-line">${escapeHtml(obsTxt)}</p>` : ''}
      </div>
    `;
  }).join('');
  return `
    <div class="px-4 md:px-6 pb-4 md:pb-6">
      <div class="mb-2 flex items-center gap-2">
        <span class="text-[0.65rem] font-extrabold uppercase tracking-widest text-[color:var(--wundt-guinda)]">📌 Otros formativos</span>
        <span class="chip" style="background:#dbeafe;color:#1e40af;font-size:.6rem;">Independientes del índice</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
        ${cards}
      </div>
    </div>
  `;
}

/**
 * Bloque "Composición del Índice" — pesos de los 4 factores (fórmula v2).
 * P39 (2026-08-26): los papás preguntan cómo se calcula el Índice. Mostrar los
 * pesos de forma sintética y visible bajo el bloque de métricas. Fórmula v2:
 *   Calificación 35% + Asistencia 25% + Tareas 15% + Competencias 25% = 100%
 * Si se cambia la fórmula activa, actualizar aquí también.
 */
function renderPesosIndice_() {
  const pesos = [
    { k: 'cal',     nombre: 'Calificación',  pct: 35, color: '#7a1d2c' },
    { k: 'asi',     nombre: 'Asistencia',    pct: 25, color: '#0891b2' },
    { k: 'tar',     nombre: 'Tareas',        pct: 15, color: '#ca8a04' },
    { k: 'comp',    nombre: 'Competencias',  pct: 25, color: '#15803d' }
  ];
  const chips = pesos.map(p => `
    <div class="peso-chip" style="border-color:${p.color};">
      <span class="peso-nombre">${p.nombre}</span>
      <span class="peso-pct" style="color:${p.color};">${p.pct}%</span>
    </div>
  `).join('');
  return `
    <div class="px-4 md:px-6 pb-4 md:pb-6">
      <p class="text-[0.65rem] font-extrabold uppercase tracking-widest text-zinc-500 mb-2">
        Composición del Índice
      </p>
      <div class="pesos-grid">
        ${chips}
      </div>
      <p class="text-[0.65rem] text-zinc-400 mt-2 italic">
        * Los formativos (Lenguajes, Ed. Física, Computación) son independientes y no entran al Índice.
      </p>
    </div>
  `;
}

// === Odómetros: animación de conteo ===
function pintarOdometro(el, destino, decimales, duracionMs) {
  const inicio = 0;
  const t0 = performance.now();
  const factor = Math.pow(10, decimales);

  function frame(now) {
    const t = Math.min(1, (now - t0) / duracionMs);
    // easing: easeOutCubic
    const eased = 1 - Math.pow(1 - t, 3);
    const actual = inicio + (destino - inicio) * eased;
    const texto = actual.toFixed(decimales);

    // Dividir en dígitos + separador
    el.innerHTML = '';
    for (const ch of texto) {
      if (ch === '.') {
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '.';
        el.appendChild(sep);
      } else {
        const d = document.createElement('span');
        d.className = 'dig';
        d.textContent = ch;
        el.appendChild(d);
      }
    }
    if (t < 1) requestAnimationFrame(frame);
    else el.dataset.done = '1';
  }
  requestAnimationFrame(frame);
}

function iniciarOdometros(root = document) {
  root.querySelectorAll('.odometro:not([data-done])').forEach(el => {
    const destino = parseFloat(el.dataset.valor || '0');
    const decimales = parseInt(el.dataset.decimales || '0', 10);
    const duracion = parseInt(el.dataset.duracion || '900', 10);
    pintarOdometro(el, destino, decimales, duracion);
  });
}

// === Web Speech API: escuchar narrativa ===
let vozActiva = null; // { btn, utterance }

function narrarEvaluacion(btn) {
  // Cancelar si ya hay una en curso
  if (vozActiva && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    vozActiva = null;
    document.querySelectorAll('.btn-card[data-action="play"].is-playing').forEach(b => {
      b.classList.remove('is-playing');
      b.querySelector('[data-icon]').textContent = '🔊';
      b.querySelector('[data-label]').textContent = 'Escuchar narrativa';
    });
    if (btn && btn.classList.contains('is-playing')) return; // era este: detener
  }

  if (!('speechSynthesis' in window)) {
    alert('Tu navegador no soporta narración por voz.');
    return;
  }

  // Localizar la tarjeta y extraer la narrativa completa
  const cardId = btn.dataset.cardId;
  const card = document.querySelector(`article.ev-card[data-card-id="${CSS.escape(cardId)}"]`);
  if (!card) return;
  const det = card.querySelector('details > div');
  const texto = det ? det.textContent.trim() : '';
  if (!texto) { alert('No hay narrativa para leer.'); return; }

  const u = new SpeechSynthesisUtterance(texto);
  u.lang = 'es-MX';
  u.rate = 0.95;
  u.pitch = 1;

  btn.classList.add('is-playing');
  btn.querySelector('[data-icon]').textContent = '⏸️';
  btn.querySelector('[data-label]').textContent = 'Detener';
  vozActiva = { btn, utterance: u };

  u.onend = u.onerror = () => {
    btn.classList.remove('is-playing');
    btn.querySelector('[data-icon]').textContent = '🔊';
    btn.querySelector('[data-label]').textContent = 'Escuchar narrativa';
    vozActiva = null;
  };

  window.speechSynthesis.speak(u);
}

// === Impresión ===
function exportarTarjeta(btn) {
  const cardId = btn.dataset.cardId;
  const card = document.querySelector(`article.ev-card[data-card-id="${CSS.escape(cardId)}"]`);
  if (!card) return;
  // Detener narración si está sonando
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  // Expandir el <details> para que se imprima
  card.querySelectorAll('details').forEach(d => d.open = true);
  // Marcar la tarjeta activa para que solo ella se imprima
  document.querySelectorAll('#historial > article').forEach(a => a.classList.remove('print-target'));
  card.classList.add('print-target');
  // Footer con fecha
  const fechaTxt = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  card.setAttribute('data-fecha', fechaTxt);
  // Centrar vista y disparar impresión
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => {
    window.print();
    // Limpieza tras imprimir (cancel dialog o después de imprimir)
    setTimeout(() => card.classList.remove('print-target'), 500);
  }, 250);
}

// === Listeners de la tarjeta (delegados en #historial) ===
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'play') narrarEvaluacion(btn);
  else if (action === 'print') exportarTarjeta(btn);
  else if (action === 'narrativa') {
    const card = btn.closest('article.ev-card');
    const det = card && card.querySelector('details');
    if (det) det.open = !det.open;
  }
});

window.logout = () => {
  borrarSesion();
  sesion = null;
  document.getElementById('alumnoId').value = '';
  document.getElementById('pin').value = '';
  mostrarLogin();
};

// === Helpers ===

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Permitir Enter en login
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !document.getElementById('loginArea').classList.contains('hidden')) {
    handleLogin();
  }
});