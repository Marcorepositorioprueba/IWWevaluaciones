// ui.js — Render y eventos del portal de dirección (ADM/DIR).
// P33 (2026-08-26): dashboard global con tabla de grupos y drill-down.

import { authMaestro, getCoberturaPorGrupo, getAlumnosGrupo,
         guardarSesion, leerSesion, borrarSesion } from './api.js';

// === Constantes ===

const MESES = [
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio'
];

const NOMBRES_MES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function cicloEscolarPorFecha(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = fecha.getMonth();
  if (m >= 7) return y + '-07';   // Ago-Dic
  return (y - 1) + '-07';          // Ene-Jul
}

function obtenerMesCorriente() {
  return NOMBRES_MES[new Date().getMonth()];
}

// === Estado singleton ===

let sesion = null;
let state = {
  mes: obtenerMesCorriente(),
  cicloEscolar: cicloEscolarPorFecha(),
  cobertura: null,        // { porGrupo, agregados }
  detalle: null           // { alumnos, meta }
};

// === Boot ===

window.addEventListener('DOMContentLoaded', async () => {
  // Llenar selector de meses
  const sel = document.getElementById('mesSeleccion');
  sel.innerHTML = MESES.map(m =>
    `<option value="${m}" ${m === state.mes ? 'selected' : ''}>${m}</option>`
  ).join('');
  sel.addEventListener('change', (e) => {
    state.mes = e.target.value;
  });

  sesion = leerSesion();
  if (sesion && sesion.sesionToken && sesion.maestroId) {
    mostrarDashboard();
    await cargarCobertura();
  } else {
    mostrarLogin();
  }

  // Enter en inputs del login
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !document.getElementById('loginArea').classList.contains('hidden')) {
      handleLogin();
    }
  });
});

// === Login ===

function mostrarLogin() {
  document.getElementById('loginArea').classList.remove('hidden');
  document.getElementById('adminArea').classList.add('hidden');
  document.getElementById('maestroId').focus();
}

window.handleLogin = async () => {
  const maestroId = document.getElementById('maestroId').value.trim();
  const password = document.getElementById('maestroPassword').value;
  const btn = document.getElementById('btnLogin');
  const errEl = document.getElementById('loginError');

  errEl.textContent = '';
  if (!maestroId || !password) {
    errEl.textContent = 'Ingresa el ID y la contraseña.';
    return;
  }
  // Validación de rol eliminada del frontend — la seguridad real la hace el
  // backend con esAdmin_(). El frontend solo bloqueaba UX, pero causaba
  // ReferenceError raros en algunos navegadores. Si mete M03, el backend
  // devuelve ACCESO_DENEGADO y manejamos el error en el catch.
  // (P33.7 fix 2026-08-26)

  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    const resp = await authMaestro(maestroId, password);
    if (!resp.ok) {
      errEl.textContent = resp.error || 'No fue posible iniciar sesión.';
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }
    sesion = {
      maestroId: resp.maestroId,
      nombre: resp.nombre,
      sesionToken: resp.sesionToken,
      expiraEn: resp.expiraEn
    };
    guardarSesion(sesion);
    mostrarDashboard();
    await cargarCobertura();
  } catch (e) {
    errEl.textContent = 'Error de conexión: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
};

function mostrarDashboard() {
  document.getElementById('loginArea').classList.add('hidden');
  // P33.7 fix (2026-08-26): ocultar la portada Ken-Burns para que no cubra el dashboard.
  // En el docente se hace con pantallaPortada.classList.add('hidden') en mostrarApp().
  const portada = document.getElementById('pantallaPortada');
  if (portada) portada.classList.add('hidden');
  document.getElementById('adminArea').classList.remove('hidden');
  document.getElementById('adminPerfil').classList.remove('hidden');
  document.getElementById('adminPerfil').classList.add('flex');
  document.getElementById('adminNombre').textContent = sesion.nombre || sesion.maestroId;
  document.getElementById('adminIdLabel').textContent = sesion.maestroId;
}

window.logout = () => {
  borrarSesion();
  sesion = null;
  state.cobertura = null;
  state.detalle = null;
  document.getElementById('maestroId').value = '';
  document.getElementById('maestroPassword').value = '';
  document.getElementById('adminResumenArea').classList.add('hidden');
  document.getElementById('adminDetalleArea').classList.add('hidden');
  mostrarLogin();
};

// === Resumen global ===

async function cargarCobertura() {
  const btn = document.getElementById('btnCargar');
  btn.disabled = true;
  btn.textContent = 'Cargando...';

  // Resetear vista detalle
  document.getElementById('adminDetalleArea').classList.add('hidden');

  try {
    const resp = await getCoberturaPorGrupo(sesion.sesionToken, sesion.maestroId, state.cicloEscolar, state.mes);
    if (!resp.ok) {
      alert('Error: ' + (resp.error || 'No se pudo cargar la cobertura'));
      if (resp.errorCode === 'SESION_INVALIDA' || resp.errorCode === 'ACCESO_DENEGADO') {
        logout();
      }
      return;
    }
    state.cobertura = resp.cobertura;
    renderResumen();
    document.getElementById('adminResumenArea').classList.remove('hidden');
  } catch (e) {
    alert('Error de conexión: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Cargar Dashboard';
  }
}

function renderResumen() {
  const { agregados, porGrupo } = state.cobertura;
  document.getElementById('resumenMesLabel').textContent = `${state.mes} ${state.cicloEscolar}`;

  // KPIs
  document.getElementById('kpiPorcentaje').textContent = (agregados.porcentaje ?? 0) + '%';
  document.getElementById('kpiCapturadosDetalle').textContent =
    `${agregados.capturados} de ${agregados.totalAlumnos} alumnos`;
  document.getElementById('kpiIndice').textContent =
    agregados.indicePromedio != null ? agregados.indicePromedio.toFixed(2) : '—';
  document.getElementById('kpiAtrasados').textContent = agregados.gruposAtrasados ?? 0;
  document.getElementById('kpiRojo').textContent = agregados.semaforoCounts?.Rojo ?? 0;

  // Tabla
  const tbody = document.getElementById('adminTablaGrupos');
  const empty = document.getElementById('adminEmpty');
  if (!porGrupo || porGrupo.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML = porGrupo.map(g => {
    const claseBarra =
      g.porcentaje === 100 ? 'completo' :
      g.porcentaje >= 75  ? 'alto' :
      g.porcentaje >= 50  ? 'medio' : 'bajo';
    return `
      <tr data-grado="${escapeAttr(g.grado)}" data-grupo="${escapeAttr(g.grupo)}">
        <td class="font-bold text-slate-800">${escapeHtml(g.grado)}</td>
        <td><span class="font-mono text-xs bg-slate-100 px-2 py-1 rounded">${escapeHtml(g.grupo)}</span></td>
        <td class="text-slate-700">${escapeHtml(g.maestroNombre)}</td>
        <td class="text-center">
          <span class="chip ${g.modo === 'cualitativo' ? 'chip-amarillo' : 'chip-ok'}" style="font-size:.65rem;">
            ${g.modo === 'cualitativo' ? 'Cualitativo' : 'Numérico'}
          </span>
        </td>
        <td>
          <div class="mini-progress" title="${g.capturados}/${g.totalAlumnos} alumnos">
            <div class="mini-progress-bar ${claseBarra}" style="width:${g.porcentaje}%"></div>
            <div class="mini-progress-label">${g.porcentaje}% · ${g.capturados}/${g.totalAlumnos}</div>
          </div>
        </td>
        <td class="text-center font-bold text-slate-800">
          ${g.indicePromedio != null ? g.indicePromedio.toFixed(2) : '—'}
        </td>
        <td class="text-center">
          <span class="semaforo-cell Verde" title="Verde">${g.semaforoCounts.Verde}</span>
          <span class="semaforo-cell Amarillo" title="Amarillo">${g.semaforoCounts.Amarillo}</span>
          <span class="semaforo-cell Rojo" title="Rojo">${g.semaforoCounts.Rojo}</span>
        </td>
        <td class="text-right">
          <button class="btn-ctx ghost" data-action="ver-detalle" data-grado="${escapeAttr(g.grado)}" data-grupo="${escapeAttr(g.grupo)}">
            Ver detalle →
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Listener delegado para los botones de detalle
  tbody.querySelectorAll('button[data-action="ver-detalle"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const grado = btn.dataset.grado;
      const grupo = btn.dataset.grupo;
      abrirDetalleGrupo(grado, grupo);
    });
  });
}

// === Drill-down de grupo ===

async function abrirDetalleGrupo(grado, grupo) {
  // Reset UI
  document.getElementById('adminDetalleAlumnos').innerHTML = `
    <div class="text-center py-8 text-slate-400">
      <div class="inline-block animate-pulse">Cargando alumnos del grupo…</div>
    </div>
  `;
  document.getElementById('adminDetalleArea').classList.remove('hidden');
  document.getElementById('adminResumenArea').classList.add('hidden');

  // Scroll suave hacia el detalle
  document.getElementById('adminDetalleArea').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const resp = await getAlumnosGrupo(sesion.sesionToken, sesion.maestroId, state.cicloEscolar, state.mes, grado, grupo);
    if (!resp.ok) {
      alert('Error: ' + (resp.error || 'No se pudo cargar el grupo'));
      if (resp.errorCode === 'SESION_INVALIDA') logout();
      volverResumen();
      return;
    }
    state.detalle = { alumnos: resp.alumnos, meta: resp.meta };
    renderDetalle();
  } catch (e) {
    alert('Error de conexión: ' + e.message);
    volverResumen();
  }
}

function renderDetalle() {
  const { alumnos, meta } = state.detalle;

  // Header del detalle
  document.getElementById('detalleTitulo').textContent = `${meta.grado} "${meta.grupo}"`;
  document.getElementById('detalleSub').textContent =
    `Maestro: ${meta.maestroNombre} · ${state.mes} ${state.cicloEscolar}`;

  // KPIs del grupo
  const porcentajeGrupo = meta.totalAlumnos
    ? Math.round((meta.capturados / meta.totalAlumnos) * 100)
    : 0;
  document.getElementById('detallePorcentaje').textContent = porcentajeGrupo + '%';
  document.getElementById('detalleCapturadosDetalle').textContent =
    `${meta.capturados} de ${meta.totalAlumnos} alumnos`;
  document.getElementById('detalleIndice').textContent =
    meta.indicePromedio != null ? meta.indicePromedio.toFixed(2) : '—';
  document.getElementById('detalleAmarillo').textContent = meta.semaforoCounts.Amarillo;
  document.getElementById('detalleRojo').textContent = meta.semaforoCounts.Rojo;

  // Lista de alumnos
  const cont = document.getElementById('adminDetalleAlumnos');
  const empty = document.getElementById('detalleEmpty');
  if (!alumnos || alumnos.length === 0) {
    cont.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  cont.innerHTML = alumnos.map(a => {
    const estadoChip = a.capturado
      ? '<span class="chip chip-ok" style="font-size:.65rem;">Capturado</span>'
      : '<span class="chip chip-pendiente" style="font-size:.65rem;">Pendiente</span>';
    const semClass = a.semaforo === 'Verde' ? 'semaforo-Verde'
                   : a.semaforo === 'Amarillo' ? 'semaforo-Amarillo'
                   : a.semaforo === 'Rojo' ? 'semaforo-Rojo'
                   : 'semaforo-sin-dato';
    const semChip = a.semaforo
      ? `<span class="semaforo-chip ${semClass}" style="font-size:.7rem;">${a.semaforo}</span>`
      : '<span class="semaforo-chip semaforo-sin-dato" style="font-size:.7rem;">Sin capturar</span>';
    const indice = a.indice != null
      ? `<span class="font-bold text-slate-800 text-lg">${a.indice.toFixed(1)}</span><span class="text-xs text-slate-500"> /10</span>`
      : '<span class="text-slate-400">—</span>';
    const obs = a.observaciones
      ? `<p class="obs-preview">"${escapeHtml(a.observaciones)}"</p>`
      : '';
    return `
      <div class="admin-alumno-row">
        <div class="wundt-avatar-img" aria-hidden="true">
          <img src="../compartido/assets/img/persons.jpg" alt=""
               onerror="this.outerHTML='<div class=&quot;wundt-avatar&quot;>${escapeHtml((a.nombre||'?').charAt(0).toUpperCase())}</div>'">
        </div>
        <div class="flex-1 min-w-0">
          <div class="nombre truncate">${escapeHtml(a.nombre)}</div>
          <div class="meta">
            <span class="font-mono">${escapeHtml(a.alumnoId)}</span>
            · ${estadoChip}
            ${a.fechaCaptura ? '· ' + escapeHtml(a.fechaCaptura) : ''}
          </div>
          ${obs}
        </div>
        <div class="text-center flex-shrink-0 px-2">
          <div class="text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400 mb-1">Índice</div>
          ${indice}
        </div>
        <div class="flex-shrink-0 px-2">
          ${semChip}
        </div>
      </div>
    `;
  }).join('');
}

function volverResumen() {
  document.getElementById('adminDetalleArea').classList.add('hidden');
  document.getElementById('adminResumenArea').classList.remove('hidden');
  document.getElementById('adminResumenArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.volverResumen = volverResumen;
window.cargarCobertura = cargarCobertura;
window.abrirDetalleGrupo = abrirDetalleGrupo;

// === Helpers ===

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}