// ui.js — Render y eventos del frontend docente (Fase 2).
//
import {
  authMaestro, getAlumnos, getEstadoCapturas, getAnaliticaDocente,
  saveEvaluaciones, guardarSesion, leerSesion, borrarSesion
} from './api.js';
import {
  crearState, evaluacionVacia, obtenerMesCorriente, cicloEscolarPorFecha,
  setEvaluacion, getEvaluacion, validarParaEnvio, contarListos,
  alumnoCapturado, clasificarCapturas, hidratarDesdeCapturas, alumnosReales_,
  haceTiempo, MESES, esCualitativo, indiceMesCiclo
} from './modelos.js';
import { vozSoportada, iniciarDictado, pararDictado } from './voz.js';

// === Estado singleton ===

let state = crearState();
window.state = state; // Exponer estado para helpers externos (ej. print_helper.js)
let charts = { semaforo: null, evolucion: null };

// Guardar evaluaciones en localStorage para persistir entre recargas
function guardarEvaluacionesLocal() {
  try {
    const data = {
      maestroId: state.maestroId,
      mes: state.mes,
      cicloEscolar: state.cicloEscolar,
      evaluaciones: state.evaluaciones
    };
    localStorage.setItem('wundtEvaluaciones', JSON.stringify(data));
  } catch (e) {
    console.warn('No se pudo guardar evaluaciones en localStorage:', e);
  }
}

// === Boot ===

window.addEventListener('DOMContentLoaded', () => {
  // Llena el dropdown de meses y selecciona el corriente
  const sel = document.getElementById('mesSeleccion');
  if (sel) {
    const mesActual = obtenerMesCorriente();
    sel.innerHTML = MESES.map(m => `<option value="${m}" ${m === mesActual ? 'selected' : ''}>${m}</option>`).join('');
    state.mes = mesActual;
    state.cicloEscolar = cicloEscolarPorFecha();
    const ayuda = document.getElementById('mesAyuda');
    if (ayuda) {
      if (mesActual === MESES[0]) {
        ayuda.textContent = 'Inicio de ciclo escolar. Captura el primer mes del grupo.';
      } else {
        ayuda.textContent = 'Mes actual detectado. Puedes cambiar para editar uno anterior.';
      }
    }
    // Banner informativo de mes de captura (cambio 2026-08-21)
    mostrarBannerMesCaptura_(mesActual);
  }

  // Decide pantalla inicial según sesión guardada
  const ses = leerSesion();
  if (ses && ses.sesionToken) {
    state.maestroId = ses.maestroId;
    state.maestroNombre = ses.nombre;
    state.sesionToken = ses.sesionToken;
    state.expiraEn = ses.expiraEn;
    state.ultimoAcceso = ses.ultimoAcceso || null;
    mostrarApp();
    iniciarTimerInactividad();
  } else {
    localStorage.removeItem('wundtEvaluaciones');
    mostrarLogin();
  }

  // Enter en login
  document.getElementById('maestroId').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('maestroPassword').focus();
  });
  document.getElementById('maestroPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
});

/**
 * Valida que el mes seleccionado no sea futuro del ciclo escolar.
 * Cambio 2026-08-21: bloquea meses > mes actual (Ago-Jul).
 * Devuelve {ok, msg}.
 */
function validarMesNoFuturo_(mesSeleccionado) {
  if (!mesSeleccionado) return { ok: false, msg: 'Selecciona un mes' };
  if (!MESES.includes(mesSeleccionado)) return { ok: false, msg: 'Mes inválido' };
  const idxSel = indiceMesCiclo(mesSeleccionado);
  const idxActual = indiceMesCiclo(obtenerMesCorriente());
  if (idxSel > idxActual) {
    return {
      ok: false,
      msg: `No puedes capturar meses futuros. El mes actual del ciclo es "${obtenerMesCorriente()}". Si necesitas capturar uno anterior, selecciónalo del dropdown.`
    };
  }
  return { ok: true };
}

/**
 * Muestra el banner con el mes actual del ciclo escolar.
 * Cambio 2026-08-21.
 */
function mostrarBannerMesCaptura_(mesActual) {
  const banner = document.getElementById('bannerMesCaptura');
  const spanMes = document.getElementById('bannerMesActual');
  if (!banner || !spanMes) return;
  spanMes.textContent = mesActual;
  banner.classList.remove('hidden');
}

// === Pantallas ===

function mostrarLogin() {
  // Mantener pantallaPortada visible para conservar la imagen de fondo.
  // PantallaPortada queda "detrás" del login (z-100 vs login z-110).
  document.getElementById('loginArea').classList.remove('hidden');
  document.getElementById('evaluacionArea').classList.add('hidden');
  document.getElementById('maestroId').focus();
}

function mostrarApp() {
  document.getElementById('pantallaPortada').classList.add('hidden');
  document.getElementById('loginArea').classList.add('hidden');
  document.getElementById('evaluacionArea').classList.remove('hidden');
  document.getElementById('maestroPerfil').classList.remove('hidden');
  document.getElementById('maestroPerfil').classList.add('flex');
  document.getElementById('maestroNombre').textContent = state.maestroNombre;
  document.getElementById('maestroIdLabel').textContent = state.maestroId;
  // Badge de última conexión
  const badge = document.getElementById('ultimoAccesoBadge');
  if (badge) {
    const t = haceTiempo(state.ultimoAcceso);
    if (t) {
      badge.textContent = 'Última entrada: ' + t;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

// === Login y logout ===

window.handleLogin = async () => {
  const maestroId = document.getElementById('maestroId').value.trim();
  const password = document.getElementById('maestroPassword').value;
  const btn = document.getElementById('btnLogin');
  const errorEl = document.getElementById('loginError');

  errorEl.textContent = '';
  if (!maestroId || !password) {
    errorEl.textContent = 'Ingresa tu ID y contraseña.';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verificando...';

  try {
    const resp = await authMaestro(maestroId, password);
    if (!resp.ok) {
      // Mensaje genérico (sin filtrar si fue ID o password)
      errorEl.textContent = 'ID o contraseña incorrectos. Verifica e intenta de nuevo.';
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }
    state.maestroId = resp.maestroId;
    state.maestroNombre = resp.nombre;
    state.sesionToken = resp.sesionToken;
    state.expiraEn = resp.expiraEn;
    state.ultimoAcceso = resp.ultimoAcceso || null;
    guardarSesion({
      maestroId: resp.maestroId,
      nombre: resp.nombre,
      sesionToken: resp.sesionToken,
      expiraEn: resp.expiraEn,
      ultimoAcceso: resp.ultimoAcceso || null
    });
    // Si es ADM/DIR, podríamos enrutar a un dashboard. Por ahora mostrar captura.
    mostrarApp();
  } catch (e) {
    errorEl.textContent = 'Error de conexión: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
};

window.logout = () => {
  borrarSesion();
  localStorage.removeItem('wundtEvaluaciones');
  state = crearState();
  location.reload();
};

// === Cargar grupo + capturas y analítica (en paralelo) ===

window.cargarGrupo = async () => {
  const mes = document.getElementById('mesSeleccion').value;
  if (!mes) return toast('Selecciona un mes.', 'warning');

  // Validar mes no futuro (cambio 2026-08-21)
  const vMes = validarMesNoFuturo_(mes);
  if (!vMes.ok) return toast(vMes.msg, 'warning');

  state.mes = mes;
  state.cicloEscolar = cicloEscolarPorFecha();

  const btn = document.getElementById('btnCargarGrupo');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Cargando...';

  // Mostrar skeletons
  ['tablaArea', 'analyticsArea'].forEach(id => {
    document.getElementById(id).classList.remove('hidden');
  });
  document.getElementById('listaAlumnos').innerHTML = Array(5).fill(0).map(() => `
    <div class="alumno-card">
      <div>
        <div class="skeleton h-4 w-3/4 mb-2"></div>
        <div class="skeleton h-3 w-1/2"></div>
      </div>
      <div class="skeleton h-8 w-20 rounded-full"></div>
    </div>
  `).join('');
  document.getElementById('analyticsEmpty').classList.add('hidden');

  try {
    const [resAlumnos, resCapturas, resAnalitica] = await Promise.all([
      getAlumnos(state.sesionToken, state.maestroId),
      getEstadoCapturas(state.sesionToken, state.maestroId, state.cicloEscolar, state.mes),
      getAnaliticaDocente(state.sesionToken, state.maestroId)
    ]);

    if (!resAlumnos.ok) {
      toast(resAlumnos.error || 'No se pudieron cargar los alumnos.', 'error');
      return;
    }
    if (!resCapturas.ok) {
      toast(resCapturas.error || 'No se pudo verificar el estado de capturas.', 'error');
      return;
    }

    state.alumnos = resAlumnos.alumnos;
    state.capturas = {};
    (resCapturas.capturas || []).forEach(c => {
      state.capturas[c.alumnoId] = c;
    });
    hidratarDesdeCapturas(state);
    // Cargar evaluaciones guardadas en localStorage (tienen precedencia sobre lo que viene del backend)
    try {
      const guardado = localStorage.getItem('wundtEvaluaciones');
      if (guardado) {
        const datos = JSON.parse(guardado);
        // Solo usar si el maestro, mes y ciclo coinciden con los actuales
        if (datos.maestroId === state.maestroId &&
            datos.mes === state.mes &&
            datos.cicloEscolar === state.cicloEscolar) {
          // Fusionar: para cada alumno, si existe en lo guardado, usarlo
          Object.keys(datos.evaluaciones).forEach(alumnoId => {
            if (datos.evaluaciones[alumnoId]) {
              // Asegurarnos de que la evaluación exista en state (por si acaso)
              if (!state.evaluaciones[alumnoId]) {
                state.evaluaciones[alumnoId] = evaluacionVacia();
              }
              Object.assign(state.evaluaciones[alumnoId], datos.evaluaciones[alumnoId]);
            }
          });
        }
        // Si no coinciden, ignoramos los datos guardados (corresponden a otro maestro/mes/ciclo)
      }
    } catch (e) {
      console.warn('No se pudo cargar evaluaciones desde localStorage:', e);
    }

    if (resAnalitica.ok) {
      state.analitica = resAnalitica.analitica;
      state.catalogos = resAnalitica.catalogos;
    }

    renderTabla();
    renderAnalitica();
    actualizarContador();
    document.getElementById('btnGuardarGrupo').classList.remove('hidden');

    const r = resCapturas.resumen || {};
    if (r.totalAlumnos > 0) {
      toast(`${r.capturados} de ${r.totalAlumnos} alumnos ya capturados.`, 'success', 3500);
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Cargar Grupo';
  }
};

// === Render de la tabla de captura ===

function renderTabla() {
  const cont = document.getElementById('listaAlumnos');
  if (!state.alumnos.length) {
    cont.innerHTML = '<div class="p-6 text-center text-slate-500">No tienes alumnos asignados.</div>';
    return;
  }
  cont.innerHTML = state.alumnos.map(a => {
    const cual = esCualitativo(a);
    const captDesdeBackend = state.capturas[a.alumnoId]?.capturado;
    const evaluacion = state.evaluaciones[a.alumnoId];
    const captDesdeFrontend = evaluacion && validarParaEnvio(evaluacion, cual).ok;
    const capt = captDesdeBackend || captDesdeFrontend;
    const indice = captDesdeBackend ? state.capturas[a.alumnoId]?.indice : null;
    const semaforo = captDesdeBackend ? state.capturas[a.alumnoId]?.semaforo : null;
    const semaforoClase = semaforo ? 'semaforo-' + semaforo : '';
    const semaforoTxt = semaforo ? claseSemaforoCorto(semaforo) : '';
    // Cualitativo (cambio 2026-08-20): 3 niveles por dimensión, 3 semáforos.
    const cap = captDesdeBackend ? state.capturas[a.alumnoId] : null;
    const dimChips = cual && cap ? renderDimChipsRow_(cap) : '';
    return `
      <div class="alumno-card ${capt ? 'capturado' : ''}" data-alumno="${a.alumnoId}">
        <div class="min-w-0">
          <p class="alumno-card-nombre">${escapeHtml(a.nombre)}</p>
          <p class="alumno-card-meta">${escapeHtml(a.grado)} · ${escapeHtml(a.alumnoId)}</p>
          ${capt ? `
            <div class="flex gap-2 mt-1 flex-wrap">
              <span class="chip chip-ok">✓ Capturado</span>
              ${cual ? dimChips : ''}
              ${!cual && indice != null ? `
                <span class="semaforo-chip ${semaforoClase}">${semaforoTxt} · ${indice.toFixed(1)}</span>
              ` : ''}</div>
          ` : `<span class="chip chip-pendiente mt-1">Pendiente</span>
          `}
        </div>
        <div class="alumno-card-status">
          <button class="btn-ctx ${capt ? 'success' : 'primary'}" onclick="abrirPanel('${a.alumnoId}')">
            ${capt ? '✏️ Editar' : '➕ Capturar'}</button></div></div>
      `;
    }).join('');
}

/**
 * Render de los 3 chips de semáforo por dimensión (cualitativo/preescolar).
 * Usa los campos semaforoCognitivo / semaforoSocioemocional / semaforoFisico
 * del payload de captura. Si un semáforo está vacío (no capturado), no muestra chip.
 * Cambio 2026-08-20.
 */
function renderDimChipsRow_(cap) {
  const dims = [
    { k: 'cognitivo',      s: cap.semaforoCognitivo,      nivel: cap.desempenoCognitivo },
    { k: 'socioemocional', s: cap.semaforoSocioemocional, nivel: cap.desempenoSocioemocional },
    { k: 'fisico',         s: cap.semaforoFisico,         nivel: cap.desempenoFisico }
  ];
  return dims.map(d => {
    if (!d.s) return '';
    const cls = 'semaforo-' + d.s;
    const lbl = d.nivel ? `${etiquetaCortaDim_(d.k)}: ${d.nivel}` : etiquetaCortaDim_(d.k);
    return `<span class="semaforo-chip ${cls}" title="${escapeAttr(d.k)}">${escapeHtml(lbl)}</span>`;
  }).join('');
}

/** Etiqueta corta de dimensión para los chips. */
function etiquetaCortaDim_(k) {
  return ({
    'cognitivo':      'Cog',
    'socioemocional': 'Soc',
    'fisico':         'Fís'
  })[k] || k;
}

function claseSemaforoCorto(s) {
  if (s === 'Verde') return 'Verde';
  if (s === 'Amarillo') return 'Amarillo';
  return 'Rojo';
}

// === Panel de edición ===

window.abrirPanel = (alumnoId) => {
  const alumno = state.alumnos.find(a => a.alumnoId === alumnoId);
  if (!alumno) return;
  const cual = esCualitativo(alumno);
  const ev = getEvaluacion(state, alumnoId);
  const capt = state.capturas[alumnoId];
  const esEdicion = capt && capt.capturado;

  const panel = document.getElementById('panelEditar');
  panel.classList.remove('hidden');

  const vozBtn = vozSoportada() ? `
    <button id="btnVoz_${alumnoId}" class="voice-idle" onclick="toggleVoz('${alumnoId}')" type="button">
      🎤 Dictar
    </button>
  ` : '';

  // === Bifurcación: cualitativo (preescolar) vs numérico (1°-secundaria) ===
  // P35 (2026-08-26): el dictado por voz se deshabilita en preescolar por
  // decisión de Marco ("para preescolar no lo habilitaremos, es demasiado").
  // El modal cualitativo no recibe vozBtn y rendea Observaciones sin botón 🎤.
  const bodyHtml = cual
    ? renderModalCualitativo(alumnoId, alumno, ev, esEdicion, '')
    : renderModalNumerico(alumnoId, alumno, ev, esEdicion, vozBtn);

  document.getElementById('contenidoPanel').innerHTML = bodyHtml;

  // Listeners según modo
  if (cual) {
    wireCualitativoListeners(alumnoId);
  } else {
    wireNumericoListeners(alumnoId);
  }
};

/**
 * Definición canónica de las 3 dimensiones y sus sub-aspectos (cualitativo).
 * Cambio 2026-08-20: preescolar evalúa 3 dimensiones con nivel 1-4 + sub-aspectos abiertos.
 */
const DIMENSIONES_PREESCOLAR_ = [
  {
    key: 'cognitivo',
    titulo: 'Desarrollo cognitivo',
    icono: '🧠',
    color: '#dbeafe',
    colorText: '#1e40af',
    nivelKey: 'desempenoCognitivo',
    subaspectos: [
      { key: 'obsAprendizaje',            titulo: 'Aprendizaje' },
      { key: 'obsComprension',            titulo: 'Comprensión' },
      { key: 'obsMemoria',                titulo: 'Memoria' }
    ]
  },
  {
    key: 'socioemocional',
    titulo: 'Desarrollo socioemocional',
    icono: '💛',
    color: '#fef3c7',
    colorText: '#92400e',
    nivelKey: 'desempenoSocioemocional',
    subaspectos: [
      { key: 'obsHabilidadesComunicacion', titulo: 'Habilidades de comunicación' },
      { key: 'obsHabilidadesSociales',     titulo: 'Habilidades sociales' },
      { key: 'obsConvivenciaAutogestion',  titulo: 'Convivencia y autogestión emocional/conductual' },
      { key: 'obsAutonomiaIndependencia',  titulo: 'Autonomía e independencia' },
      { key: 'obsResolucionConflictos',    titulo: 'Resolución de conflictos y demandas del contexto' }
    ]
  },
  {
    key: 'fisico',
    titulo: 'Desarrollo físico',
    icono: '💪',
    color: '#dcfce7',
    colorText: '#166534',
    nivelKey: 'desempenoFisico',
    subaspectos: [
      { key: 'obsMotricidadGruesaFina',    titulo: 'Motricidad gruesa y fina' },
      { key: 'obsCoordinacionEquilibrio',  titulo: 'Coordinación y equilibrio' }
    ]
  }
];

/**
 * Render del modal para alumnos CUALITATIVOS (preescolar).
 * Cambio 2026-08-20: 3 bloques (uno por dimensión) con su nivel 1-4 + 10 textareas
 * (uno por sub-aspecto) + observación general. Sin calificación, sin asistencia,
 * sin tareas, sin Índice.
 */
function renderModalCualitativo(alumnoId, alumno, ev, esEdicion, vozBtn) {
  const bloquesHtml = DIMENSIONES_PREESCOLAR_.map(dim => renderBloqueDimension_(alumnoId, dim, ev)).join('');

  return `
    <div class="flex justify-between items-start mb-1 gap-2">
      <div class="min-w-0">
        <h2 class="text-xl font-bold text-slate-800 leading-tight">${escapeHtml(alumno.nombre)}</h2>
        <p class="text-xs text-slate-500">${escapeHtml(alumno.grado)} · ${escapeHtml(alumnoId)}</p>
      </div>
      <button onclick="cerrarPanel()" class="text-slate-400 hover:text-slate-800 text-2xl leading-none flex-shrink-0">×</button>
    </div>
    <div class="flex gap-2 mb-3 flex-wrap">
      <span class="chip" style="background:#ede9fe;color:#6b21a8;">📋 Evaluación cualitativa (3 dimensiones)</span>
      <span class="chip chip-pendiente">Sin índice numérico</span>
    </div>
    <p class="text-xs text-slate-500 mb-4">${esEdicion ? '✏️ Editando evaluación existente.' : '📝 Captura nueva. Para cada dimensión selecciona un nivel 1-4 y, si lo deseas, agrega observaciones por sub-aspecto.'}</p>

    ${bloquesHtml}

    <div class="mb-4">
      <div class="flex justify-between items-center mb-1 gap-2 flex-wrap">
        <span class="text-xs font-bold text-slate-600 uppercase">💬 Observaciones generales del docente (opcional)</span>
      </div>
      <textarea id="obs_${alumnoId}" rows="3" maxlength="500"
        oninput="onCambioCual('${alumnoId}','observaciones', this.value)"
        class="compact-input"
        placeholder="Mensaje global del docente para la familia.">${escapeHtml(ev.observaciones || '')}</textarea>
      <div class="text-xs text-slate-400 mt-1 text-right" id="obsCount_${alumnoId}">${(ev.observaciones || '').length}/500</div>
    </div>

    <div class="text-xs text-slate-500 mb-3 p-2 rounded" style="background:#fef9c3;">
      💡 Los 3 niveles generan 3 semáforos independientes que verá el padre. Las observaciones por sub-aspecto son opcionales pero recomendadas para documentar el avance.
    </div>

    <div class="flex gap-2">
      <button onclick="cerrarPanel()" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold transition">
        Cancelar
      </button>
      ${esCualitativo(alumno) ? `
      <button onclick="window.imprimirDetallePreescolar('${alumnoId}')" class="flex-1 bg-white border border-slate-300 text-slate-700 py-3 rounded-xl font-bold transition hover:bg-slate-50 shadow-sm">
        🖨️ Imprimir Detalle
      </button>` : ''}
      <button onclick="guardarPanelActual('${alumnoId}')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition shadow-md">
        Guardar cambios
      </button>
    </div>
  `;
}

/**
 * Render de un bloque de dimensión: cabecera + rating-row 1-4 + sub-aspectos.
 */
function renderBloqueDimension_(alumnoId, dim, ev) {
  const nivelActual = ev[dim.nivelKey] || 0;
  const ratingRow = [1, 2, 3, 4].map(n => `
    <button class="rating-btn ${nivelActual == n ? 'active' : ''}" data-nivel="${n}" data-tip="${escapeAttr(etiquetaComp(n))}"
      onclick="setDesempeno('${alumnoId}', '${dim.nivelKey}', ${n}, this)" style="flex:1; padding:.75rem 0;">
      <div style="font-size:1.25rem; font-weight:700;">${n}</div>
      <div style="font-size:.7rem; line-height:1.1; margin-top:.25rem;">${etiquetaComp(n)}</div>
    </button>
  `).join('');

  const subaspectosHtml = dim.subaspectos.map(sub => `
    <div class="dim-subaspect">
      <label class="block">
        <span class="text-xs text-slate-600 font-semibold">${escapeHtml(sub.titulo)}</span>
        <textarea rows="2" maxlength="500"
          id="${sub.key}_${alumnoId}"
          oninput="onCambioCual('${alumnoId}','${sub.key}', this.value)"
          class="compact-input mt-1"
          placeholder="Opcional">${escapeHtml(ev[sub.key] || '')}</textarea>
        <div class="text-xs text-slate-400 mt-0.5 text-right" id="count_${sub.key}_${alumnoId}">${(ev[sub.key] || '').length}/500</div>
      </label>
    </div>
  `).join('');

  return `
    <div class="dim-block" style="background:${dim.color};border-left:4px solid ${dim.colorText};">
      <div class="flex justify-between items-center mb-2 gap-2 flex-wrap">
        <span class="text-sm font-bold" style="color:${dim.colorText};">
          <span style="font-size:1.1rem;">${dim.icono}</span> ${escapeHtml(dim.titulo)}
        </span>
        <span class="text-xs text-slate-500">Selecciona un nivel 1-4</span>
      </div>
      <div class="rating-row mb-2" style="justify-content:space-between; gap:.5rem;">
        ${ratingRow}
      </div>
      <div class="text-xs text-slate-500 mb-3">
        1 = Necesita apoyo · 2 = En desarrollo · 3 = Logro esperado · 4 = Desempeño sobresaliente
      </div>
      <span class="error-msg" id="err_${dim.nivelKey}_${alumnoId}"></span>

      <details class="dim-subaspectos" open>
        <summary class="text-xs font-semibold text-slate-700 cursor-pointer mb-2" style="list-style:none;">
          <span class="summary-marker">▾</span> Observaciones por sub-aspecto (${dim.subaspectos.length}, opcionales)
        </summary>
        <div class="dim-subaspectos-grid">
          ${subaspectosHtml}
        </div>
      </details>
    </div>
  `;
}

/**
 * Render del modal para alumnos NUMÉRICOS (1°-6° primaria y 1°-3° secundaria).
 * Campos numéricos originales + nueva sección "Otros formativos".
 */
function renderModalNumerico(alumnoId, alumno, ev, esEdicion, vozBtn) {
  return `
    <div class="flex justify-between items-start mb-1 gap-2">
      <div class="min-w-0">
        <h2 class="text-xl font-bold text-slate-800 leading-tight">${escapeHtml(alumno.nombre)}</h2>
        <p class="text-xs text-slate-500">${escapeHtml(alumno.grado)} · ${escapeHtml(alumnoId)}</p>
      </div>
      <button onclick="cerrarPanel()" class="text-slate-400 hover:text-slate-800 text-2xl leading-none flex-shrink-0">×</button>
    </div>
    <p class="text-xs text-slate-500 mb-4">${esEdicion ? '✏️ Editando evaluación existente. Los cambios reemplazarán la captura previa.' : '📝 Captura nueva. Los campos numéricos requieren al menos calificación, asistencia, tareas y 4 competencias.'}</p>

    <div class="grid grid-cols-2 gap-3 mb-4">
      <label class="block">
        <span class="text-xs font-bold text-slate-600 uppercase">Calificación (0-10)</span>
        <div class="flex gap-1 mt-1">
          <input type="number" step="0.5" id="cal_${alumnoId}"
            value="${escapeAttr(ev.calificacion)}"
            class="compact-input flex-1" />
          ${vozBtn ? `<button id="btnVozCal_${alumnoId}" class="voice-idle" onclick="toggleVozCampo('${alumnoId}','calificacion')" type="button" title="Dictar calificación">🎤</button>` : ''}
        </div>
        <span class="error-msg" id="err_cal_${alumnoId}"></span>
      </label>
      <label class="block">
        <span class="text-xs font-bold text-slate-600 uppercase">Asistencia %</span>
        <div class="flex gap-1 mt-1">
          <input type="number" step="1" id="asi_${alumnoId}"
            value="${escapeAttr(ev.asistencia)}"
            class="compact-input flex-1" />
          ${vozBtn ? `<button id="btnVozAsi_${alumnoId}" class="voice-idle" onclick="toggleVozCampo('${alumnoId}','asistencia')" type="button" title="Dictar asistencia">🎤</button>` : ''}
        </div>
        <span class="error-msg" id="err_asi_${alumnoId}"></span>
      </label>
      <label class="block">
        <span class="text-xs font-bold text-slate-600 uppercase">Entregables o actividades %</span>
        <div class="flex gap-1 mt-1">
          <input type="number" step="1" id="tar_${alumnoId}"
            value="${escapeAttr(ev.tareas)}"
            class="compact-input flex-1" />
          ${vozBtn ? `<button id="btnVozTar_${alumnoId}" class="voice-idle" onclick="toggleVozCampo('${alumnoId}','tareas')" type="button" title="Dictar tareas">🎤</button>` : ''}
        </div>
        <span class="error-msg" id="err_tar_${alumnoId}"></span>
      </label>
    </div>

    <div class="mb-4">
      <span class="text-xs font-bold text-slate-600 uppercase block mb-2">Competencias</span>
      ${['pensamiento', 'participacion', 'autogestion', 'colaboracion'].map(k => `
        <div class="flex justify-between items-center py-1.5">
          <span class="text-sm text-slate-700">${k === 'pensamiento' ? 'Pensamiento Crítico' : k === 'participacion' ? 'Participación' : k === 'autogestion' ? 'Autogestión' : 'Colaboración'}</span>
          <div class="rating-row">
            ${[1, 2, 3, 4].map(n => `
              <button class="rating-btn ${ev[k] == n ? 'active' : ''}" data-nivel="${n}" data-tip="${escapeAttr(etiquetaComp(n))}"
                onclick="setCompetencia('${alumnoId}','${k}', ${n}, this)">${n}</button>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <div class="text-xs text-slate-500 mt-1">
        1 = Necesita apoyo · 2 = En desarrollo · 3 = Logro esperado · 4 = Desempeño sobresaliente
      </div>
    </div>

    <div class="mb-4">
      <div class="flex justify-between items-center mb-1 gap-2 flex-wrap">
        <span class="text-xs font-bold text-slate-600 uppercase">Observaciones</span>
        <div class="flex gap-2 items-center">
          <span id="comandoVoz_${alumnoId}" class="hidden"></span>
          ${vozBtn}
        </div>
      </div>
      <textarea id="obs_${alumnoId}" rows="3" maxlength="500"
        oninput="onCambio('${alumnoId}','observaciones', this.value)"
        class="compact-input"
        placeholder="Notas cualitativas del maestro. También puedes dictar: 'calificación ocho punto cinco', 'asistencia noventa', 'tareas doce'...">${escapeHtml(ev.observaciones || '')}</textarea>
      <div class="text-xs text-slate-400 mt-1 text-right" id="obsCount_${alumnoId}">${(ev.observaciones || '').length}/500</div>
    </div>

    ${renderBloqueFormativos(alumnoId, ev)}

    <div class="flex gap-2">
      <button onclick="cerrarPanel()" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold transition">
        Cancelar
      </button>
      ${esCualitativo(alumno) ? `
      <button onclick="window.imprimirDetallePreescolar('${alumnoId}')" class="flex-1 bg-white border border-slate-300 text-slate-700 py-3 rounded-xl font-bold transition hover:bg-slate-50 shadow-sm">
        🖨️ Imprimir Detalle
      </button>` : ''}
      <button onclick="guardarPanelActual('${alumnoId}')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition shadow-md">
        Guardar cambios
      </button>
    </div>
  `;
}

/**
 * Bloque "Otros formativos" — 3 sub-bloques: Lenguajes, Ed. Física, Computación.
 * Cada uno: input 0-10 + textarea de observación (ambos opcionales).
 * Es INDEPENDIENTE del Índice: no se suma ni afecta el cálculo.
 */
function renderBloqueFormativos(alumnoId, ev) {
  const campos = [
    { key: 'lenCalif', obsKey: 'lenObs', titulo: 'Lenguajes', icono: '📚' },
    { key: 'edFisCalif', obsKey: 'edFisObs', titulo: 'Educación Física', icono: '🏃' },
    { key: 'compCalif', obsKey: 'compObs', titulo: 'Computación', icono: '💻' }
  ];
  return `
    <div class="mb-4 p-3 rounded-lg" style="background:#f0f9ff; border:1px solid #bae6fd;">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-sm font-bold text-slate-700">📌 Otros formativos</span>
        <span class="chip" style="background:#dbeafe;color:#1e40af;font-size:.65rem;">No afectan el índice</span>
      </div>
      <p class="text-xs text-slate-500 mb-3">Calificaciones 0-10 y observaciones opcionales para clases especiales. Son independientes del índice general.</p>
      ${campos.map(c => `
        <div class="mb-3 pb-3 border-b border-slate-200 last:border-b-0 last:mb-0 last:pb-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-sm">${c.icono}</span>
            <span class="text-sm font-semibold text-slate-700">${c.titulo}</span>
          </div>
          <div class="grid grid-cols-3 gap-2 mb-1">
            <label class="col-span-1">
              <span class="text-xs text-slate-500">Calif. (0-10)</span>
              <input type="number" step="0.5" min="0" max="10"
                id="${c.key}_${alumnoId}"
                value="${escapeAttr(ev[c.key])}"
                class="compact-input w-full"
                oninput="onCambioFormativo('${alumnoId}','${c.key}', this.value)" />
              <span class="error-msg" id="err_${c.key}_${alumnoId}"></span>
            </label>
            <label class="col-span-2">
              <span class="text-xs text-slate-500">Observación</span>
              <textarea rows="1" maxlength="500"
                id="${c.obsKey}_${alumnoId}"
                oninput="onCambioFormativo('${alumnoId}','${c.obsKey}', this.value)"
                class="compact-input"
                placeholder="Opcional">${escapeHtml(ev[c.obsKey] || '')}</textarea>
              <div class="text-xs text-slate-400 mt-0.5 text-right" id="count_${c.obsKey}_${alumnoId}">${(ev[c.obsKey] || '').length}/500</div>
            </label>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Listeners para modal CUALITATIVO (preescolar · 3 dimensiones + 10 sub-observaciones).
 * Cambio 2026-08-20: wirea la observación general + 10 textareas de sub-aspectos.
 * Los 3 radio-rows de niveles (1-4) los maneja setDesempeno (parametrizado).
 */
function wireCualitativoListeners(alumnoId) {
  const obsEl = document.getElementById('obs_' + alumnoId);
  if (obsEl) {
    obsEl.addEventListener('input', () => {
      const c = document.getElementById('obsCount_' + alumnoId);
      if (c) c.textContent = obsEl.value.length + '/500';
      setEvaluacion(state, alumnoId, { observaciones: obsEl.value });
      guardarEvaluacionesLocal();
      actualizarContador();
    });
  }
  // 10 textareas por sub-aspecto (cognitivo x3, socioemocional x5, físico x2)
  const SUB_KEYS = [
    'obsAprendizaje', 'obsComprension', 'obsMemoria',
    'obsHabilidadesComunicacion', 'obsHabilidadesSociales',
    'obsConvivenciaAutogestion', 'obsAutonomiaIndependencia', 'obsResolucionConflictos',
    'obsMotricidadGruesaFina', 'obsCoordinacionEquilibrio'
  ];
  SUB_KEYS.forEach(key => {
    const el = document.getElementById(key + '_' + alumnoId);
    if (!el) return;
    el.addEventListener('input', () => {
      const c = document.getElementById('count_' + key + '_' + alumnoId);
      if (c) c.textContent = el.value.length + '/500';
      setEvaluacion(state, alumnoId, { [key]: el.value });
      guardarEvaluacionesLocal();
      actualizarContador();
    });
  });
}

/**
 * Listeners para modal NUMÉRICO: calificacion, asistencia, tareas, obs principal,
 * + 6 inputs de formativos.
 */
function wireNumericoListeners(alumnoId) {
  const inputIds = { calificacion: 'cal_', asistencia: 'asi_', tareas: 'tar_' };
  ['calificacion', 'asistencia', 'tareas'].forEach(campo => {
    const inp = document.getElementById(inputIds[campo] + alumnoId);
    if (inp) {
      const handler = () => {
        // console.log('[onCambio]', campo, '=', inp.value); // 2026-08-25: removido para producción (P6 #3)
        onCambio(alumnoId, campo, inp.value);
      };
      inp.addEventListener('input', handler);
      inp.addEventListener('change', handler);
      inp.addEventListener('blur', handler);
    } else {
      // console.warn('[render] input no encontrado:', inputIds[campo] + alumnoId); // 2026-08-25: removido (P6 #3)
    }
  });

  // Textarea de observaciones principal
  const obsEl = document.getElementById('obs_' + alumnoId);
  if (obsEl) {
    obsEl.addEventListener('input', () => {
      const c = document.getElementById('obsCount_' + alumnoId);
      if (c) c.textContent = obsEl.value.length + '/500';
      setEvaluacion(state, alumnoId, { observaciones: obsEl.value });
      guardarEvaluacionesLocal();
    });
  }

  // Listeners para formativos (3 inputs calif + 3 textareas obs)
  const formativos = ['lenCalif', 'edFisCalif', 'compCalif', 'lenObs', 'edFisObs', 'compObs'];
  formativos.forEach(k => {
    const el = document.getElementById(k + '_' + alumnoId);
    if (!el) return;
    el.addEventListener('input', () => {
      if (k.endsWith('Obs')) {
        const c = document.getElementById('count_' + k + '_' + alumnoId);
        if (c) c.textContent = el.value.length + '/500';
      }
      setEvaluacion(state, alumnoId, { [k]: el.value });
      guardarEvaluacionesLocal();
      actualizarContador();
    });
  });
}

window.cerrarPanel = () => {
  const panel = document.getElementById('panelEditar');
  panel.classList.add('hidden');
  pararDictado();
};

window.guardarPanelActual = (alumnoId) => {
  // Valida inline y muestra errores en el panel
  const alumno = state.alumnos.find(a => a.alumnoId === alumnoId);
  const cual = alumno ? esCualitativo(alumno) : false;
  const ev = state.evaluaciones[alumnoId];
  const v = validarParaEnvio(ev, cual);
  if (!v.ok) {
    v.errores.forEach(e => {
      const el = document.getElementById('err_' + e.campo + '_' + alumnoId);
      const input = document.getElementById(e.campo + '_' + alumnoId);
      if (el) el.textContent = e.msg;
      if (input) input.classList.add('error');
    });
    toast('Revisa los campos marcados en rojo.', 'warning');
    return;
  }
  cerrarPanel();
  actualizarContador();
  renderTabla();
  toast('Cambios listos para enviar.', 'success', 2000);
};

function etiquetaComp(n) {
  return ({ 1: 'Necesita apoyo', 2: 'En desarrollo', 3: 'Logro esperado', 4: 'Desempeño sobresaliente' })[n] || '';
};

/**
 * onCambio para campos del modal CUALITATIVO (solo 'observaciones').
 */
window.onCambioCual = (alumnoId, campo, valor) => {
  setEvaluacion(state, alumnoId, { [campo]: valor });
  guardarEvaluacionesLocal();
  if (state.alumnos.some(a => a.alumnoId === alumnoId)) {
    actualizarContador();
  }
};

/**
 * onCambio para campos del bloque FORMATIVOS (3 sub-bloques).
 * Acepta input calif (0-10) o textarea obs (string libre).
 */
window.onCambioFormativo = (alumnoId, campo, valor) => {
  setEvaluacion(state, alumnoId, { [campo]: valor });
  guardarEvaluacionesLocal();
  // Validación inline solo para los inputs numéricos
  const el = document.getElementById('err_' + campo + '_' + alumnoId);
  const input = document.getElementById(campo + '_' + alumnoId);
  let invalido = false;
  let msg = '';
  if (campo.endsWith('Calif')) {
    if (valor !== '' && valor !== null && valor !== undefined) {
      const v = parseFloat(valor);
      if (isNaN(v) || v < 0 || v > 10) { invalido = true; msg = '0-10'; }
    }
  } else if (campo.endsWith('Obs')) {
    if (valor && String(valor).length > 500) { invalido = true; msg = 'Máx 500'; }
  }
  if (input) {
    if (invalido) input.classList.add('error');
    else input.classList.remove('error');
  }
  if (el) el.textContent = msg;
  actualizarContador();
};

window.onCambio = (alumnoId, campo, valor) => {
  setEvaluacion(state, alumnoId, { [campo]: valor });
  guardarEvaluacionesLocal();
  // Mapeo de campo a prefijo de ID
  const prefijos = { calificacion: 'cal_', asistencia: 'asi_', tareas: 'tar_' };
  const prefix = prefijos[campo];
  const input = prefix ? document.getElementById(prefix + alumnoId) : null;
  const el = document.getElementById('err_' + campo + '_' + alumnoId);
  let invalido = false;
  let msg = '';
  if (campo === 'calificacion') {
    const v = parseFloat(valor);
    if (valor !== '' && (isNaN(v) || v < 0 || v > 10)) { invalido = true; msg = 'Entre 0 y 10'; }
  } else if (campo === 'asistencia') {
    const v = parseInt(valor, 10);
    if (valor !== '' && (isNaN(v) || v < 0 || v > 100)) { invalido = true; msg = 'Entre 0 y 100'; }
  } else if (campo === 'tareas') {
    const v = parseInt(valor, 10);
    if (valor !== '' && (isNaN(v) || v < 0 || v > 100)) { invalido = true; msg = 'Entre 0 y 100'; }
  }
  if (input) {
    if (invalido) input.classList.add('error');
    else input.classList.remove('error');
  }
  if (el) el.textContent = msg;
  if (state.alumnos.some(a => a.alumnoId === alumnoId)) {
    actualizarContador();
  }
};

/**
 * Valida un input numérico por blur (cuando se sale del campo).
 * Útil cuando el navegador bloquea oninput por min/max.
 */
window.validarAlSalir = (alumnoId, campo) => {
  const prefijos = { calificacion: 'cal_', asistencia: 'asi_', tareas: 'tar_' };
  const input = document.getElementById(prefijos[campo] + alumnoId);
  if (!input) return;
  onCambio(alumnoId, campo, input.value);
};

window.setCompetencia = (alumnoId, campo, valor, btn) => {
  setEvaluacion(state, alumnoId, { [campo]: valor });
  guardarEvaluacionesLocal();
  const row = btn.parentElement;
  row.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  actualizarContador();
};

/**
 * setDesempeno — para el modal CUALITATIVO (preescolar).
 * Cambio 2026-08-20: parametrizado por campo ('desempenoCognitivo' |
 * 'desempenoSocioemocional' | 'desempenoFisico'). El botón vive en una
 * fila con 4 opciones (1-4) y la función sólo limpia el error inline del campo.
 */
window.setDesempeno = (alumnoId, campo, valor, btn) => {
  setEvaluacion(state, alumnoId, { [campo]: valor });
  guardarEvaluacionesLocal();
  const row = btn.parentElement;
  row.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Limpia cualquier error inline del campo de dimensión
  const errEl = document.getElementById('err_' + campo + '_' + alumnoId);
  if (errEl) errEl.textContent = '';
  actualizarContador();
};

// === Dictado por voz ===

window.toggleVozCampo = (alumnoId, campo) => {
  const cmdEl = document.getElementById('comandoVoz_' + alumnoId);
  const prefijos = { calificacion: 'cal_', asistencia: 'asi_', tareas: 'tar_' };
  const prefijosBtn = { calificacion: 'Cal', asistencia: 'Asi', tareas: 'Tar' };
  const targetId = prefijos[campo] + alumnoId;
  const btnId = 'btnVoz' + prefijosBtn[campo] + '_' + alumnoId;
  const btn = document.getElementById(btnId);
  // P36 (2026-08-26): si el botón clickeado ya está activo, detener.
  if (btn && btn.classList.contains('voice-active')) {
    pararDictado();
    return;
  }
  // P36 (2026-08-26): resetear los otros 4 botones de voz del mismo alumno
  // (3 por campo + 1 general) para que solo uno quede "Escuchando".
  ['Cal', 'Asi', 'Tar'].forEach(p => {
    const other = document.getElementById('btnVoz' + p + '_' + alumnoId);
    if (other && other !== btn) {
      other.className = 'voice-idle';
      other.textContent = '🎤';
    }
  });
  const btnGeneral = document.getElementById('btnVoz_' + alumnoId);
  if (btnGeneral && btnGeneral !== btn) {
    btnGeneral.className = 'voice-idle';
    btnGeneral.textContent = '🎤 Dictar';
  }
  // Marcar este botón como activo
  if (btn) {
    btn.className = 'voice-active';
    btn.textContent = '🔴';
  }
  const r = iniciarDictado({
    onResultado: (pay) => {
      if (pay.comando) {
        // Solo aplica si el comando coincide con el campo destino
        if (pay.comando.field === campo) {
          const inp = document.getElementById(targetId);
          if (inp) {
            inp.value = pay.comando.value;
            inp.classList.remove('error');
            setEvaluacion(state, alumnoId, { [campo]: pay.comando.value });
            guardarEvaluacionesLocal();
            const er = document.getElementById('err_' + campo + '_' + alumnoId);
            if (er) er.textContent = '';
            if (cmdEl) {
              cmdEl.textContent = '✓ ' + campo + ' = ' + pay.comando.value;
              cmdEl.className = 'voice-cmd-detected';
              cmdEl.classList.remove('hidden');
              setTimeout(() => cmdEl.classList.add('hidden'), 3000);
            }
          }
        } else {
          // Comando de otro campo: avisa suavemente
          if (cmdEl) {
            cmdEl.textContent = '⚠ Ese es ' + pay.comando.field + ', no ' + campo;
            cmdEl.className = 'voice-cmd-detected';
            cmdEl.classList.remove('hidden');
            setTimeout(() => cmdEl.classList.add('hidden'), 3000);
          }
        }
      }
    },
    onError: (err) => toast('Error de voz: ' + err, 'error'),
    onFin: () => {
      // P36 (2026-08-26): resetear el botón que se quedó activo al detener.
      const b = document.getElementById(btnId);
      if (b) {
        b.className = 'voice-idle';
        b.textContent = '🎤';
      }
    }
  });
  if (!r.ok) {
    if (btn) {
      btn.className = 'voice-idle';
      btn.textContent = '🎤';
    }
    return toast(r.error, 'error');
  }
};

window.toggleVoz = (alumnoId) => {
  const btn = document.getElementById('btnVoz_' + alumnoId);
  if (!btn) return;
  const prefijos = { calificacion: 'cal_', asistencia: 'asi_', tareas: 'tar_' };
  if (btn.classList.contains('voice-idle')) {
    const cmdEl = document.getElementById('comandoVoz_' + alumnoId);
    // P36 (2026-08-26): resetear los 3 botones por campo si estaban activos.
    ['Cal', 'Asi', 'Tar'].forEach(p => {
      const other = document.getElementById('btnVoz' + p + '_' + alumnoId);
      if (other) {
        other.className = 'voice-idle';
        other.textContent = '🎤';
      }
    });
    // P35 (2026-08-26): resolver obsEl una sola vez fuera del callback. Antes
    // había un bug donde la rama de dictado de texto referenciaba `obs` (variable
    // no definida) y el dictado de Observaciones se rompía silenciosamente. Solo
    // existe el textarea en el modal numérico (primaria/secundaria), por eso la
    // guarda: si el panel es preescolar/cualitativo, se ignora el texto libre.
    const obsEl = document.getElementById('obs_' + alumnoId);
    const r = iniciarDictado({
      onResultado: (pay) => {
        if (pay.comando) {
          // Llenar el input correspondiente
          const inputId = prefijos[pay.comando.field] + alumnoId;
          const inp = document.getElementById(inputId);
          if (inp) {
            inp.value = pay.comando.value;
            inp.classList.remove('error');
            setEvaluacion(state, alumnoId, { [pay.comando.field]: pay.comando.value });
            guardarEvaluacionesLocal();
            const er = document.getElementById('err_' + pay.comando.field + '_' + alumnoId);
            if (er) er.textContent = '';
          }
          if (cmdEl) {
            cmdEl.textContent = '✓ ' + pay.comando.field + ' = ' + pay.comando.value;
            cmdEl.className = 'voice-cmd-detected';
            cmdEl.classList.remove('hidden');
            setTimeout(() => cmdEl.classList.add('hidden'), 3000);
          }
        } else if (obsEl) {
          // Texto libre → va al textarea de Observaciones (solo modal numérico).
          obsEl.value = pay.texto;
          setEvaluacion(state, alumnoId, { observaciones: pay.texto });
          guardarEvaluacionesLocal();
          const count = document.getElementById('obsCount_' + alumnoId);
          if (count) count.textContent = pay.texto.length + '/500';
        } else {
          // Modal cualitativo (preescolar) o panel sin obs: descartar texto libre.
          if (cmdEl) {
            cmdEl.textContent = 'ℹ Dictado de texto solo disponible en Observaciones (no preescolar)';
            cmdEl.className = 'voice-cmd-detected';
            cmdEl.classList.remove('hidden');
            setTimeout(() => cmdEl.classList.add('hidden'), 3000);
          }
        }
      },
      onError: (err) => toast('Error de voz: ' + err, 'error'),
      onFin: () => {
        btn.className = 'voice-idle';
        btn.textContent = '🎤 Dictar';
      }
    });
    if (!r.ok) return toast(r.error, 'error');
    btn.className = 'voice-active';
    btn.textContent = '🔴 Escuchando... (click para detener)';
    btn.onclick = () => {
      pararDictado();
      btn.className = 'voice-idle';
      btn.textContent = '🎤 Dictar';
    };
  } else {
    pararDictado();
    btn.className = 'voice-idle';
    btn.textContent = '🎤 Dictar';
  }
};

// === Guardar evaluaciones con modal de confirmación ===

window.solicitarGuardar = () => {
  if (!state.mes) return toast('Selecciona un mes primero.', 'warning');

  // Red de seguridad: re-validar mes antes de enviar (cambio 2026-08-21)
  const vMes = validarMesNoFuturo_(state.mes);
  if (!vMes.ok) return toast(vMes.msg, 'warning');

  const cls = clasificarCapturas(state);

  if (cls.nuevos.length === 0 && cls.actualizaciones.length === 0) {
    if (cls.errores.length > 0) {
      mostrarModalErrores(cls.errores);
      return;
    }
    return toast('No hay cambios para guardar.', 'warning');
  }

  const body = document.getElementById('modalConfirmacionBody');
  const partes = [];
  if (cls.nuevos.length) partes.push(`📝 <b>${cls.nuevos.length}</b> captura(s) nueva(s).`);
  if (cls.actualizaciones.length) partes.push(`✏️ <b>${cls.actualizaciones.length}</b> actualización(es).`);
  if (cls.errores.length) partes.push(`⚠️ <b>${cls.errores.length}</b> con errores (no se enviarán).`);
  body.innerHTML = `
    <p class="mb-3">Vas a guardar en <b>${state.mes} ${state.cicloEscolar}</b>:</p>
    ${partes.map(p => `<p class="mb-1">${p}</p>`).join('')}
    <p class="text-xs text-slate-500 mt-3">El sistema actualizará los registros existentes en Google Sheets.</p>
  `;
  document.getElementById('modalConfirmacion').classList.remove('hidden');
};

window.cerrarModalConfirmacion = () => {
  document.getElementById('modalConfirmacion').classList.add('hidden');
};

document.getElementById('btnConfirmarGuardar').addEventListener('click', async () => {
  cerrarModalConfirmacion();
  await guardarEvaluaciones();
});

window.guardarEvaluaciones = async () => {
  if (!state.mes) return toast('Selecciona un mes primero.', 'warning');

  const cls = clasificarCapturas(state);
  const aEnviar = [...cls.nuevos, ...cls.actualizaciones].map(aid => {
    const ev = state.evaluaciones[aid];
    const alumno = state.alumnos.find(a => a.alumnoId === aid);
    const cual = alumno ? esCualitativo(alumno) : false;

    if (cual) {
      // === CUALITATIVO (preescolar · 3 dimensiones + 10 sub-observaciones) ===
      // Cambio 2026-08-20: 3 niveles por dimensión + 10 obs por sub-aspecto + obs general.
      // Sin calificación, asistencia, tareas, competencias. Los formativos NO se envían.
      return {
        alumnoId: aid,
        desempenoCognitivo:      parseInt(ev.desempenoCognitivo, 10),
        desempenoSocioemocional: parseInt(ev.desempenoSocioemocional, 10),
        desempenoFisico:         parseInt(ev.desempenoFisico, 10),
        observaciones: ev.observaciones || '',
        // 10 observaciones por sub-aspecto (opcionales, ≤500)
        obsAprendizaje:             ev.obsAprendizaje             || '',
        obsComprension:             ev.obsComprension             || '',
        obsMemoria:                 ev.obsMemoria                 || '',
        obsHabilidadesComunicacion: ev.obsHabilidadesComunicacion || '',
        obsHabilidadesSociales:     ev.obsHabilidadesSociales     || '',
        obsConvivenciaAutogestion:  ev.obsConvivenciaAutogestion  || '',
        obsAutonomiaIndependencia:  ev.obsAutonomiaIndependencia  || '',
        obsResolucionConflictos:    ev.obsResolucionConflictos    || '',
        obsMotricidadGruesaFina:    ev.obsMotricidadGruesaFina    || '',
        obsCoordinacionEquilibrio:  ev.obsCoordinacionEquilibrio  || ''
      };
    }
    // === NUMÉRICO (1°-6° primaria y 1°-3° secundaria) ===
    // Campos originales + 3 formativos opcionales (independientes del Índice).
    return {
      alumnoId: aid,
      calificacion: parseFloat(ev.calificacion),
      participacion: parseInt(ev.participacion, 10),
      autogestion: parseInt(ev.autogestion, 10),
      colaboracion: parseInt(ev.colaboracion, 10),
      pensamiento: parseInt(ev.pensamiento, 10),
      asistencia: parseInt(ev.asistencia, 10),
      tareas: parseInt(ev.tareas, 10),
      observaciones: ev.observaciones || '',
      // Formativos opcionales: solo se incluyen si tienen valor
      ...(ev.lenCalif !== '' && ev.lenCalif != null ? { lenCalif: parseFloat(ev.lenCalif) } : {}),
      ...(ev.edFisCalif !== '' && ev.edFisCalif != null ? { edFisCalif: parseFloat(ev.edFisCalif) } : {}),
      ...(ev.compCalif !== '' && ev.compCalif != null ? { compCalif: parseFloat(ev.compCalif) } : {}),
      ...(ev.lenObs ? { lenObs: ev.lenObs } : {}),
      ...(ev.edFisObs ? { edFisObs: ev.edFisObs } : {}),
      ...(ev.compObs ? { compObs: ev.compObs } : {})
    };
  });

  const btn = document.getElementById('btnGuardarGrupo');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Guardando...';

  try {
    const resp = await saveEvaluaciones(state.sesionToken, state.maestroId, state.cicloEscolar, state.mes, aEnviar);
    if (!resp.ok) {
      toast('Error: ' + (resp.error || 'No se pudo guardar'), 'error');
      return;
    }
    const r = resp.resumen || {};
    if (r.fallidos === 0) {
      toast(`✅ ${r.exitosos} evaluaciones guardadas correctamente.`, 'success', 4000);
    } else {
      toast(`⚠️ ${r.exitosos} guardadas, ${r.fallidos} con errores.`, 'warning', 5000);
    }
    if (resp.errores && resp.errores.length) {
      mostrarModalErrores(resp.errores);
    }
    // Refrescar el estado de capturas desde el backend (fuente de verdad) y re-renderizar
    // la tabla para que el botón cambie de "Capturar" a "Editar" inmediatamente.
    try {
      const resEstado = await getEstadoCapturas(state.sesionToken, state.maestroId, state.cicloEscolar, state.mes);
      if (resEstado.ok) {
        state.capturas = {};
        (resEstado.capturas || []).forEach(c => {
          state.capturas[c.alumnoId] = c;
        });
        // Limpiar evaluaciones locales de alumnos que ya están capturados para
        // que NO se vuelvan a alumnos que ya están capturados para
        // que NO se vuelvan a enviar en el próximo "Guardar Evaluación Grupal".
        const idsCapturados = (resEstado.capturas || [])
          .filter(c => c.capturado)
          .map(c => c.alumnoId);
        idsCapturados.forEach(aid => {
          if (state.evaluaciones[aid]) {
            // Mantener el objeto pero marcar que ya está sincronizado con Sheets
            // para que clasificarCapturas lo cuente como "sinCambios" y NO lo reenvíe.
            state.evaluaciones[aid].__sincronizado = true;
          }
        });
        renderTabla();
        actualizarContador();
      }
    } catch (_) { /* si falla el refresh, el reload completo de abajo lo cubre */ }
    // Recargar para refrescar también la analítica (KPIs y charts)
    await cargarGrupo();
  } catch (e) {
    toast('Error de red: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar Evaluación Grupal';
  }
};

function mostrarModalErrores(errores) {
  const modal = document.getElementById('modalErrores');
  document.getElementById('modalErroresBody').innerHTML = errores.map(e => `
    <div class="py-2 border-b border-slate-100 last:border-0">
      <div class="font-bold text-slate-800">${escapeHtml(e.nombre || e.alumnoId || '')}</div>
      <div class="text-xs text-slate-600">${(e.errores || [e]).map(x => typeof x === 'string' ? x : (x.campo + ': ' + x.msg)).join(' · ')}</div>
    </div>
  `).join('');
  modal.classList.remove('hidden');
}

window.cerrarModalErrores = () => {
  document.getElementById('modalErrores').classList.add('hidden');
};

// ============================================================================
// Imprimir / Exportar PDF (frontend puro, sin backend)
// Cambio 2026-08-25: usa window.print() + CSS @media print para que el maestro
// pueda imprimir o "Guardar como PDF" el grupo capturado este mes.
// El Sheet sigue siendo la fuente de verdad: este feature solo LEE state en memoria.
// ============================================================================

window.solicitarImprimir = () => {
  if (!state.alumnos || state.alumnos.length === 0) {
    return toast('Carga un grupo antes de imprimir.', 'warning');
  }
  renderReporteImprimible_();
  // pequeño delay para que el DOM se actualice antes del diálogo de impresión
  setTimeout(() => window.print(), 100);
};

// Helper: promedio de las 4 competencias (1-4) → etiqueta legible
function calcularCompetencia_(ev) {
  const campos = ['participacion', 'autogestion', 'colaboracion', 'pensamiento'];
  const vals = campos.map(c => parseInt(ev[c] || 0, 10)).filter(v => v > 0);
  if (vals.length === 0) return '—';
  const prom = vals.reduce((a, b) => a + b, 0) / vals.length;
  const etiquetas = { 1: 'Necesita apoyo', 2: 'En desarrollo',
                      3: 'Logro esperado', 4: 'Sobresaliente' };
  const r = Math.round(prom);
  return r + ' (' + etiquetas[r] + ')';
}

function renderReporteImprimible_() {
  const cont = document.getElementById('reporteImprimible');
  if (!cont) return;
  const gradoGrupo = (state.alumnos[0] && state.alumnos[0].grado) || '';
  const fecha = new Date().toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // === Header institucional ===
  let html = `
    <div class="print-header">
      <h1>Instituto Wilhelm Wundt SC</h1>
      <h2>Captura de Evaluación Mensual — ${escapeHtml(state.mes || '')} ${escapeHtml(state.cicloEscolar || '')}</h2>
      <p><b>Docente:</b> ${escapeHtml(state.maestroNombre || '')} (${escapeHtml(state.maestroId || '')}) ·
         <b>Grado:</b> ${escapeHtml(gradoGrupo)} ·
         <b>Fecha de impresión:</b> ${fecha}</p>
    </div>
  `;

  // === Tabla ===
  // Bifurcación: si hay хотя бы un alumno cualitativo en el grupo, usamos
  // columnas cualitativas (Cog/Soc/Fís). En la práctica los grupos son homogéneos
  // (un maestro ve primaria O preescolar), pero defendemos el caso mixto.
  const hayCualitativo = state.alumnos.some(a => esCualitativo(a));

  html += '<table class="print-table">';
  html += '<thead><tr>';
  html += '<th>#</th><th>Alumno</th><th>ID</th>';
  if (hayCualitativo) {
    html += '<th>Cog.</th><th>Soc.</th><th>Fís.</th><th>Observaciones</th>';
  } else {
    html += '<th>Calif.</th><th>Asist.</th><th>Tareas</th><th>Comp.</th><th>Observaciones</th>';
  }
  html += '<th>Estado</th>';
  html += '</tr></thead><tbody>';

  state.alumnos.forEach((a, idx) => {
    const ev = state.evaluaciones[a.alumnoId] || {};
    const cap = state.capturas[a.alumnoId];
    const cual = esCualitativo(a);
    const estado = (cap && cap.capturado) ? '✓ Capturado' : 'Pendiente';

    html += '<tr>';
    html += '<td>' + (idx + 1) + '</td>';
    html += '<td>' + escapeHtml(a.nombre || '') + '</td>';
    html += '<td>' + escapeHtml(a.alumnoId || '') + '</td>';

    if (cual) {
      const cog = ev.desempenoCognitivo || '—';
      const soc = ev.desempenoSocioemocional || '—';
      const fis = ev.desempenoFisico || '—';
      const obs = ev.observaciones || '';
      html += '<td>' + cog + '</td>';
      html += '<td>' + soc + '</td>';
      html += '<td>' + fis + '</td>';
      html += '<td class="obs-cell">' + escapeHtml(obs) + '</td>';
    } else {
      const cal = ev.calificacion || '—';
      const asi = ev.asistencia || '—';
      const tar = ev.tareas || '—';
      const comp = calcularCompetencia_(ev);
      const obs = ev.observaciones || '';
      html += '<td>' + cal + '</td>';
      html += '<td>' + asi + '%</td>';
      html += '<td>' + tar + '</td>';
      html += '<td>' + comp + '</td>';
      html += '<td class="obs-cell">' + escapeHtml(obs) + '</td>';
    }
    html += '<td>' + estado + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';

  // === Footer con totales + línea de firma ===
  // P34 (2026-08-26): filtrar预留 Por definir antes de contar.
  const reales = alumnosReales_(state);
  const total = reales.length;
  const capturados = reales.filter(a => state.capturas[a.alumnoId]?.capturado).length;
  html += `
    <div class="print-footer">
      <p>Total alumnos: <b>${total}</b> · Capturados: <b>${capturados}</b> ·
         Pendientes: <b>${total - capturados}</b></p>
      <p class="print-firma">_________________________________<br>
         Firma del docente: ${escapeHtml(state.maestroNombre || '')}</p>
    </div>
  `;

  cont.innerHTML = html;
}

// === Analítica (Chart.js) ===

function renderAnalitica() {
  // console.log('renderAnalitica called'); // 2026-08-25: removido para producción (P6 #3)
  const area = document.getElementById('analyticsArea');
  area.classList.remove('hidden');
  document.getElementById('analyticsMesLabel').textContent = `${state.mes} ${state.cicloEscolar}`;

  // Detectar modo del grupo desde el backend (autoridad) o desde los alumnos en pantalla (fallback)
  const modoGrupo = (state.analitica && state.analitica.modo) ||
    (state.alumnos.length > 0 && state.alumnos.every(a => esCualitativo(a)) ? 'cualitativo' : 'numerico');
  // console.log('renderAnalitica: modoGrupo=', modoGrupo); // 2026-08-25: removido para producción (P6 #3)

  // === BIFURCACIÓN: si el grupo es totalmente cualitativo (preescolar), mostrar analítica cualitativa ===
  if (modoGrupo === 'cualitativo') {
    return renderAnaliticaCualitativa_();
  }

  // Try to use analitica data if available.
  // Cambio 2026-08-21: elegir el porMes del mes/ciclo actual (no siempre [0]),
  // para que al cambiar de mes los KPIs reflejen el mes visible en pantalla.
  const _porMesAll = (state.analitica && Array.isArray(state.analitica.porMes)) ? state.analitica.porMes : [];
  const analiticaData = _porMesAll.find(pm => pm.mes === state.mes && String(pm.cicloEscolar) === String(state.cicloEscolar))
                       || _porMesAll[_porMesAll.length - 1]
                       || null;
  let porcentaje, indicePromedio, capturadosCount, totalAlumnos;
  let semaforoAmarillo = 0, semaforoRojo = 0;

  if (analiticaData) {
    // Use data from analitica endpoint
    porcentaje = analiticaData.porcentaje ?? 0;
    indicePromedio = analiticaData.indicePromedio ?? null;
    capturadosCount = analiticaData.capturados ?? 0;
    totalAlumnos = analiticaData.totalAlumnos ?? alumnosReales_(state).length;
    // Cambio 2026-08-21: leer semáforo agregado del porMes (antes hardcoded a 0).
    const sem = analiticaData.semaforoCounts || {};
    semaforoAmarillo = sem.Amarillo || 0;
    semaforoRojo = sem.Rojo || 0;
    // console.log('renderAnalitica: using analitica data:', analiticaData); // 2026-08-25: removido (P6 #3)
  } else {
    // Fallback to computing from capturas y semáforo inferido de state.capturas
    // P34 (2026-08-26): filtrar预留 Por definir antes de contar.
    const reales = alumnosReales_(state);
    const capturasMes = reales.filter(a => {
      const backendCap = state.capturas[a.alumnoId]?.capturado;
      const ev = state.evaluaciones[a.alumnoId];
      const frontendValid = ev && validarParaEnvio(ev, esCualitativo(a)).ok;
      return backendCap || frontendValid;
    });
    const total = reales.length;
    capturadosCount = capturasMes.length;
    totalAlumnos = total;
    porcentaje = total ? Math.round((capturasMes / total) * 100) : 0;
    indicePromedio = null;
    // Calcular semáforo a partir de state.capturas (cada alumno trae su semaforo)
    reales.forEach(a => {
      const cap = state.capturas[a.alumnoId];
      if (cap && cap.capturado && cap.semaforo) {
        if (cap.semaforo === 'Amarillo') semaforoAmarillo++;
        else if (cap.semaforo === 'Rojo') semaforoRojo++;
      }
    });
    // console.log('renderAnalitica: fallback computed capturas=', capturadosCount, 'total=', totalAlumnos); // 2026-08-25: removido (P6 #3)
  }

  // Update KPIs
  document.getElementById('kpiPorcentaje').textContent = porcentaje + '%';
  document.getElementById('kpiCapturadosDetalle').textContent = `${capturadosCount} de ${totalAlumnos} alumnos`;
  document.getElementById('kpiIndice').textContent = indicePromedio != null ? indicePromedio.toFixed(2) : '—';
  document.getElementById('kpiIndiceExtra').textContent = indicePromedio != null ? `${capturadosCount} evaluaciones · sobre 10` : 'Aún no hay capturas';
  // Cambio 2026-08-21: KPIs de semáforo ahora se calculan desde el porMes del backend
  // (o desde state.capturas como fallback). Antes estaban hardcoded a '0'.
  document.getElementById('kpiAmarillo').textContent = semaforoAmarillo;
  document.getElementById('kpiRojo').textContent = semaforoRojo;

  // Determine if we should show empty state: only if no analitica data and no capturados
  const empty = document.getElementById('analyticsEmpty');
  if ((!analiticaData || analiticaData.capturados === 0) && (!state.alumnos || state.alumnos.length === 0)) {
    // console.log('renderAnalitica: no data, showing empty'); // 2026-08-25: removido (P6 #3)
    empty.classList.remove('hidden');
    return;
  }
  // console.log('renderAnalitica: hiding empty'); // 2026-08-25: removido (P6 #3)
  empty.classList.add('hidden');

  // Destruir charts previos
  if (charts.semaforo) { charts.semaforo.destroy(); }
  if (charts.evolucion) { charts.evolucion.destroy(); }

  // Chart.js disponible (CDN)?
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not defined');
    empty.classList.remove('hidden');
    empty.innerHTML = '<div class="text-4xl mb-2">📡</div><p class="font-bold">Requerimos conexión para mostrar los gráficos.</p>';
    return;
  }

  // Chart 1: distribución por semáforo (Verde / Amarillo / Rojo / Pendiente)
  // Cambio 2026-08-21: antes solo mostraba Capturado vs Pendiente. Ahora muestra
  // los 3 colores del semáforo para que el maestro vea el estado real del grupo.
  // console.log('renderAnalitica: creating doughnut chart (semaforo colors)'); // 2026-08-25: removido (P6 #3)
  const ctxSemaforo = document.getElementById('chartSemaforo').getContext('2d');
  const semaforoVerde = (analiticaData && analiticaData.semaforoCounts && analiticaData.semaforoCounts.Verde) || 0;
  const notCapturados = totalAlumnos - capturadosCount;
  charts.semaforo = new Chart(ctxSemaforo, {
    type: 'doughnut',
    data: {
      labels: ['Verde', 'Amarillo', 'Rojo', 'Pendiente'],
      datasets: [{
        data: [semaforoVerde, semaforoAmarillo, semaforoRojo, notCapturados],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#e5e7eb'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 12, weight: '600' } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              // Si el valor es 0, lo ocultamos del tooltip para no saturar
              if (ctx.parsed === 0) return null;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round((ctx.parsed / total) * 100) : 0;
              return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      },
      cutout: '60%'
    }
  });

  // Chart 2: evolución del índice por mes (line)
  // console.log('renderAnalitica: creating line chart'); // 2026-08-25: removido (P6 #3)
  const series = Array.isArray(state.analitica?.porMes) ? state.analitica.porMes : [];
  // console.log('renderAnalitica series from analitica:', series); // 2026-08-25: removido (P6 #3)
  series.forEach((s, i) => {
    // console.log(`series[${i}]:`, s, 'indicePromedio:', s.indicePromedio); // 2026-08-25: removido (P6 #3)
  });
  const labels = series.map(s => cortoMes(s.mes));
  const data = series.map(s => {
    // Try multiple possible field names for the index value
    const val = s.indicePromedio ?? s.promedio ?? s.indice ?? s.valor ?? s.media ?? 0;
    return typeof val === 'number' ? val : 0;
  });
  // console.log('analitica series:', series.length, 'data:', data); // 2026-08-25: removido (P6 #3)

  const ctxEvo = document.getElementById('chartEvolucion').getContext('2d');
  charts.evolucion = new Chart(ctxEvo, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Índice promedio',
        data: data,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#2563eb',
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const s = series[ctx.dataIndex];
              if (!s) return '';
              return `${ctx.parsed.y.toFixed(2)} · ${s.capturados}/${s.totalAlumnos} capturados`;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 10,
          ticks: { stepSize: 2 }
        }
      }
    }
  });
}

function cortoMes(m) {
  return ({
    'Agosto': 'Ago', 'Septiembre': 'Sep', 'Octubre': 'Oct', 'Noviembre': 'Nov', 'Diciembre': 'Dic',
    'Enero': 'Ene', 'Febrero': 'Feb', 'Marzo': 'Mar', 'Abril': 'Abr', 'Mayo': 'May', 'Junio': 'Jun', 'Julio': 'Jul'
  })[m] || m;
}

/**
 * Analítica para grupos CUALITATIVOS (preescolar · 3 dimensiones + 10 sub-observaciones).
 * Cambio 2026-08-20: en lugar de 1 distribución por nivel, muestra 3 distribuciones
 * (cognitivo, socioemocional, físico) y cobertura de sub-observaciones.
 *   - KPI 1: % Capturado del mes
 *   - KPI 2: Distribución por nivel top (de la dimensión con más datos)
 *   - KPI 3 y 4: Amarillo y Rojo vienen del semáforo agregado
 *   - Chart doughnut: Capturado vs Pendiente
 *   - 3 mini-bar charts: Distribución por dimensión
 *   - Tabla de cobertura: sub-observaciones llenas / vacías por dimensión
 */
function renderAnaliticaCualitativa_() {
  // console.log('renderAnaliticaCualitativa_ called'); // 2026-08-25: removido (P6 #3)

  // Determinar datos del mes actual
  const serieActual = (Array.isArray(state.analitica?.porMes) && state.analitica.porMes.length > 0)
    ? state.analitica.porMes[state.analitica.porMes.length - 1]
    : null;
  const capturados = serieActual ? serieActual.capturados : 0;
  // P34 (2026-08-26): filtrar预留 Por definir antes de calcular %.
  const total = alumnosReales_(state).length || (serieActual && serieActual.totalAlumnos) || 0;
  const porcentaje = total ? Math.round((capturados / total) * 100) : 0;

  // numAlumnosPorDimension: { cognitivo: {1:n1,2:n2,3:n3,4:n4}, socioemocional: {...}, fisico: {...} }
  const porDim = (serieActual && serieActual.numAlumnosPorDimension) || {};
  const dimCog = porDim.cognitivo      || { 1: 0, 2: 0, 3: 0, 4: 0 };
  const dimSoc = porDim.socioemocional || { 1: 0, 2: 0, 3: 0, 4: 0 };
  const dimFis = porDim.fisico         || { 1: 0, 2: 0, 3: 0, 4: 0 };

  // semáforo agregado por dimensión (cuenta de Verde / Amarillo / Rojo)
  const semCog = (serieActual && serieActual.semaforoCountsPorDimension && serieActual.semaforoCountsPorDimension.cognitivo) || { Verde: 0, Amarillo: 0, Rojo: 0 };
  const semSoc = (serieActual && serieActual.semaforoCountsPorDimension && serieActual.semaforoCountsPorDimension.socioemocional) || { Verde: 0, Amarillo: 0, Rojo: 0 };
  const semFis = (serieActual && serieActual.semaforoCountsPorDimension && serieActual.semaforoCountsPorDimension.fisico) || { Verde: 0, Amarillo: 0, Rojo: 0 };

  // cobertura de sub-observaciones
  const cob = (serieActual && serieActual.coberturaObs) || {};

  // Ocultar el segundo chart (evolución del índice) que no aplica
  const chartEvolucionContainer = document.getElementById('chartEvolucion');
  if (chartEvolucionContainer && chartEvolucionContainer.parentElement) {
    chartEvolucionContainer.parentElement.classList.add('hidden');
  }

  // KPIs (reutilizamos IDs existentes)
  document.getElementById('kpiPorcentaje').textContent = porcentaje + '%';
  document.getElementById('kpiCapturadosDetalle').textContent = `${capturados} de ${total} alumnos`;

  // KPI 2: Mejor dimensión (la que más alumnos tengan en nivel 4 Verde)
  const dims = [
    { k: 'cognitivo',      s: semCog },
    { k: 'socioemocional', s: semSoc },
    { k: 'fisico',         s: semFis }
  ];
  let topDim = dims[0], topScore = semCog.Verde || 0;
  dims.forEach(d => {
    const score = (d.s && d.s.Verde) || 0;
    if (score > topScore) { topScore = score; topDim = d; }
  });
  const dimLabel = ({
    'cognitivo': 'Cognitivo', 'socioemocional': 'Socioemocional', 'fisico': 'Físico'
  })[topDim.k] || '—';
  document.getElementById('kpiIndice').textContent = topScore > 0 ? dimLabel : '—';
  document.getElementById('kpiIndiceExtra').textContent = topScore > 0
    ? `${topScore} alumno${topScore > 1 ? 's' : ''} en nivel Verde`
    : 'Sin capturas aún';

  // KPI 3 y 4: semáforo agregado (cualquier dimensión)
  const totalAmarillo = (semCog.Amarillo || 0) + (semSoc.Amarillo || 0) + (semFis.Amarillo || 0);
  const totalRojo = (semCog.Rojo || 0) + (semSoc.Rojo || 0) + (semFis.Rojo || 0);
  document.getElementById('kpiAmarillo').textContent = totalAmarillo;
  document.getElementById('kpiRojo').textContent = totalRojo;

  // Renombrar las etiquetas de los KPIs
  const kpiAmarilloLabel = document.querySelector('#kpiAmarillo')?.previousElementSibling;
  const kpiRojoLabel = document.querySelector('#kpiRojo')?.previousElementSibling;
  if (kpiAmarilloLabel) kpiAmarilloLabel.textContent = 'En amarillo (suma 3 dim)';
  if (kpiRojoLabel) kpiRojoLabel.textContent = 'En rojo (suma 3 dim)';
  const kpiIndiceLabel = document.querySelector('#kpiIndice')?.previousElementSibling;
  if (kpiIndiceLabel) kpiIndiceLabel.textContent = 'Mejor dimensión';

  // Ocultar el estado vacío (sí tenemos datos cualitativos)
  const empty = document.getElementById('analyticsEmpty');
  if (empty) empty.classList.add('hidden');

  // Destruir charts previos
  if (charts.semaforo) { charts.semaforo.destroy(); charts.semaforo = null; }
  if (charts.evolucion) { charts.evolucion.destroy(); charts.evolucion = null; }
  if (charts.barCualitativo) { charts.barCualitativo.destroy(); charts.barCualitativo = null; }
  if (charts.barCualitativoCog) { charts.barCualitativoCog.destroy(); charts.barCualitativoCog = null; }
  if (charts.barCualitativoSoc) { charts.barCualitativoSoc.destroy(); charts.barCualitativoSoc = null; }
  if (charts.barCualitativoFis) { charts.barCualitativoFis.destroy(); charts.barCualitativoFis = null; }

  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not defined');
    return;
  }

  // Chart 1: doughnut capturado vs pendiente
  const ctxSemaforo = document.getElementById('chartSemaforo').getContext('2d');
  const notCapturados = total - capturados;
  charts.semaforo = new Chart(ctxSemaforo, {
    type: 'doughnut',
    data: {
      labels: ['Capturado', 'Pendiente'],
      datasets: [{
        data: [capturados, notCapturados],
        backgroundColor: ['#10b981', '#e5e7eb'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 12, weight: '600' } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const t = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = t ? Math.round((ctx.parsed / t) * 100) : 0;
              return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      },
      cutout: '60%'
    }
  });

  // Chart 2: distribución por dimensión (3 mini-bar charts).
  // Para no tocar el HTML, creamos un contenedor hermano del chartSemaforo.
  const oldBar = document.getElementById('chartBarCualitativo');
  if (oldBar) oldBar.remove();
  const chartSemaforoContainer = document.getElementById('chartSemaforo').parentElement;
  let barContainer = document.getElementById('barCualitativoContainer');
  if (!barContainer && chartSemaforoContainer && chartSemaforoContainer.parentElement) {
    const grid = chartSemaforoContainer.parentElement;
    barContainer = document.createElement('div');
    barContainer.id = 'barCualitativoContainer';
    barContainer.className = chartSemaforoContainer.className;
    grid.appendChild(barContainer);
  }
  if (barContainer) {
    barContainer.innerHTML = `
      <h3 class="text-xs font-bold text-slate-600 uppercase mb-2">Distribución por nivel · 3 dimensiones</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 chart-container">
        <div class="dim-bar-wrap">
          <p class="text-xs font-semibold text-slate-700 mb-1">🧠 Cognitivo</p>
          <canvas id="chartBarCog"></canvas>
        </div>
        <div class="dim-bar-wrap">
          <p class="text-xs font-semibold text-slate-700 mb-1">💛 Socioemocional</p>
          <canvas id="chartBarSoc"></canvas>
        </div>
        <div class="dim-bar-wrap">
          <p class="text-xs font-semibold text-slate-700 mb-1">💪 Físico</p>
          <canvas id="chartBarFis"></canvas>
        </div>
      </div>
    `;
    barContainer.classList.remove('hidden');

    const mkLabels = () => ['1', '2', '3', '4'];
    const mkData = (dist) => [dist[1] || 0, dist[2] || 0, dist[3] || 0, dist[4] || 0];
    const mkColors = () => ['#b91c1c', '#f59e0b', '#facc15', '#10b981'];
    const mkOpts = () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } }
    });

    const dCog = mkData(dimCog); const sumCog = dCog.reduce((a, b) => a + b, 0);
    const dSoc = mkData(dimSoc); const sumSoc = dSoc.reduce((a, b) => a + b, 0);
    const dFis = mkData(dimFis); const sumFis = dFis.reduce((a, b) => a + b, 0);

    if (sumCog > 0) {
      charts.barCualitativoCog = new Chart(document.getElementById('chartBarCog').getContext('2d'), {
        type: 'bar', data: { labels: mkLabels(), datasets: [{ data: dCog, backgroundColor: mkColors(), borderWidth: 0 }] },
        options: mkOpts()
      });
    } else {
      const el = document.getElementById('chartBarCog').parentElement;
      if (el) el.innerHTML += '<p class="text-xs text-slate-400 mt-1">Sin datos aún</p>';
    }
    if (sumSoc > 0) {
      charts.barCualitativoSoc = new Chart(document.getElementById('chartBarSoc').getContext('2d'), {
        type: 'bar', data: { labels: mkLabels(), datasets: [{ data: dSoc, backgroundColor: mkColors(), borderWidth: 0 }] },
        options: mkOpts()
      });
    } else {
      const el = document.getElementById('chartBarSoc').parentElement;
      if (el) el.innerHTML += '<p class="text-xs text-slate-400 mt-1">Sin datos aún</p>';
    }
    if (sumFis > 0) {
      charts.barCualitativoFis = new Chart(document.getElementById('chartBarFis').getContext('2d'), {
        type: 'bar', data: { labels: mkLabels(), datasets: [{ data: dFis, backgroundColor: mkColors(), borderWidth: 0 }] },
        options: mkOpts()
      });
    } else {
      const el = document.getElementById('chartBarFis').parentElement;
      if (el) el.innerHTML += '<p class="text-xs text-slate-400 mt-1">Sin datos aún</p>';
    }
  }

  // Chart 3: cobertura de sub-observaciones (tabla estática) — hermano del barContainer.
  const chartSemaforoContainer2 = document.getElementById('chartSemaforo').parentElement;
  let cobContainer = document.getElementById('coberturaObsContainer');
  if (!cobContainer && chartSemaforoContainer2 && chartSemaforoContainer2.parentElement) {
    const grid = chartSemaforoContainer2.parentElement;
    cobContainer = document.createElement('div');
    cobContainer.id = 'coberturaObsContainer';
    cobContainer.className = chartSemaforoContainer2.className;
    grid.appendChild(cobContainer);
  }
  if (cobContainer) {
    const rows = [
      { k: 'cognitivo',      icon: '🧠', label: 'Cognitivo',      total: (cob.cognitivo      && cob.cognitivo.total)      || 0 },
      { k: 'socioemocional', icon: '💛', label: 'Socioemocional', total: (cob.socioemocional && cob.socioemocional.total) || 0 },
      { k: 'fisico',         icon: '💪', label: 'Físico',         total: (cob.fisico         && cob.fisico.total)         || 0 }
    ];
    cobContainer.innerHTML = `
      <h3 class="text-xs font-bold text-slate-600 uppercase mb-2">Cobertura de sub-observaciones</h3>
      <table class="w-full text-xs">
        <thead>
          <tr class="text-slate-500 text-left">
            <th class="py-1">Dimensión</th>
            <th class="py-1">Sub-aspectos llenos</th>
            <th class="py-1">Total</th>
            <th class="py-1">%</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const llenos = (cob[r.k] && cob[r.k].llenos) || 0;
            const vacios = (cob[r.k] && cob[r.k].vacios) || 0;
            const total = (cob[r.k] && cob[r.k].total) || 0;
            const pct = total ? Math.round((llenos / total) * 100) : 0;
            const barColor = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#b91c1c';
            return `
              <tr class="border-t border-slate-100">
                <td class="py-2 font-semibold">${r.icon} ${r.label}</td>
                <td class="py-2">${llenos} / ${total} <span class="text-slate-400">(${vacios} vacíos)</span></td>
                <td class="py-2">${total}</td>
                <td class="py-2 w-1/3">
                  <div class="flex items-center gap-2">
                    <div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div style="width:${pct}%; background:${barColor}; height:100%;"></div>
                    </div>
                    <span class="font-bold" style="color:${barColor};">${pct}%</span>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      <p class="text-xs text-slate-500 mt-2">"Llenos" = sub-observaciones con texto. Más cobertura = más detalle para las familias.</p>
    `;
    cobContainer.classList.remove('hidden');
  }
}

// === Helpers UI ===

function actualizarContador() {
  // P34 (2026-08-26): contar solo sobre预留 reales (excluye "Por definir").
  const reales = alumnosReales_(state);
  const evIds = new Set(Object.keys(state.evaluaciones || {}));
  const listos = reales.filter(a => evIds.has(a.alumnoId) && (() => {
    const ev = state.evaluaciones[a.alumnoId];
    return ev && validarParaEnvio(ev, esCualitativo(a)).ok;
  })()).length;
  const total = reales.length;
  const el = document.getElementById('contadorListos');
  if (el) el.textContent = listos + ' / ' + total + ' listos';
}


function toast(mensaje, tipo = 'info', duracion = 3500) {
  let t = document.getElementById('toastActual');
  if (t) t.remove();
  t = document.createElement('div');
  t.id = 'toastActual';
  t.className = 'toast ' + (tipo === 'success' ? 'success' : tipo === 'error' ? 'error' : tipo === 'warning' ? 'warning' : 'info');
  t.textContent = mensaje;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, duracion);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ============================================================================
// Timer de Inactividad (3 minutos)
// ============================================================================

// [ENCAPSULADO] Inyector de Botón de Impresión Preescolar
// Evita modificar renderModalCualitativo directamente para mantener estabilidad.
(function() {
  const originalAbrirPanel = window.abrirPanel;
  window.abrirPanel = function(alumnoId) {
    originalAbrirPanel(alumnoId);

    // Esperar un momento a que el DOM se renderice
    setTimeout(() => {
      const alumno = state.alumnos.find(a => a.alumnoId === alumnoId);
      if (alumno && esCualitativo(alumno)) {
        const btnContainer = document.querySelector('#contenidoPanel .flex.gap-2');
        if (btnContainer && !document.getElementById('btnImprimirDetalle')) {
          const btnImp = document.createElement('button');
          btnImp.id = 'btnImprimirDetalle';
          btnImp.className = 'flex-1 bg-white border border-slate-300 text-slate-700 py-3 rounded-xl font-bold transition hover:bg-slate-50 shadow-sm';
          btnImp.innerHTML = '🖨️ Imprimir Detalle';
          btnImp.onclick = () => window.imprimirDetallePreescolar(alumnoId);

          // Insertar al principio de la fila de botones
          btnContainer.prepend(btnImp);
        }
      }
    }, 50);
  };
})();

let timerInactividad = null;
let timerExpiracion = null;
const TIEMPO_INACTIVIDAD = 3 * 60 * 1000; // 3 minutos
const TIEMPO_ADVERTENCIA = 30 * 1000;      // 30 segundos para reaccionar

function reiniciarTimerInactividad() {
  if (timerInactividad) clearTimeout(timerInactividad);
  if (timerExpiracion) clearTimeout(timerExpiracion);
  document.getElementById('modalInactividad')?.classList.add('hidden');

  timerInactividad = setTimeout(() => {
    mostrarAdvertenciaInactividad();
  }, TIEMPO_INACTIVIDAD);
}

window.mostrarAdvertenciaInactividad = function mostrarAdvertenciaInactividad() {
  const modal = document.getElementById('modalInactividad');
  if (modal) {
    modal.classList.remove('hidden');
    // Si en 30 segundos no responde, logout
    timerExpiracion = setTimeout(() => {
      logout();
    }, TIEMPO_ADVERTENCIA);
  }
}

function iniciarTimerInactividad() {
  // Eventos que cuentan como actividad
  const eventos = ['mousedown', 'keydown', 'scroll', 'touchstart'];
  eventos.forEach(ev => {
    window.addEventListener(ev, reiniciarTimerInactividad);
  });

  // Botón "Sigo aquí"
  const btn = document.getElementById('btnMantenerSesion');
  if (btn) {
    btn.addEventListener('click', () => {
      reiniciarTimerInactividad();
    });
  }

  reiniciarTimerInactividad();
}