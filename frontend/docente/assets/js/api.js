// api.js — Capa de red del frontend docente.
// Todas las llamadas al backend pasan por aquí.

const API_URL = 'https://script.google.com/macros/s/AKfycbwdVP-UxhfGYraVDetQZPN-XRnCEjQ35c-OZn3cztt12heMul2nLnNxPZX0TQDM0Q/exec';

// === Helpers internos ===

async function postJSON(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error('HTTP ' + res.status);
  }
  return res.json();
}

// === API pública ===

/**
 * Autentica al docente. Devuelve {ok, maestroId, nombre, sesionToken, expiraEn, ultimoAcceso}
 * o {ok:false, error}.
 */
export async function authMaestro(maestroId, password) {
  return postJSON({ action: 'auth_maestro', maestroId, password });
}

/**
 * Devuelve los alumnos del maestro logueado.
 */
export async function getAlumnos(sesionToken, maestroId) {
  return postJSON({ action: 'get_alumnos', sesionToken, maestroId });
}

/**
 * Devuelve el estado de captura de los alumnos del maestro en un mes/ciclo.
 * Para alimentar la tabla con chips de "capturado/pendiente".
 */
export async function getEstadoCapturas(sesionToken, maestroId, cicloEscolar, mes) {
  return postJSON({
    action: 'get_estado_capturas',
    sesionToken,
    maestroId,
    cicloEscolar,
    mes
  });
}

/**
 * Devuelve la analítica histórica del docente (porMes, catalogos).
 */
export async function getAnaliticaDocente(sesionToken, maestroId) {
  return postJSON({
    action: 'get_analitica_docente',
    sesionToken,
    maestroId
  });
}

/**
 * Devuelve la cobertura de captura (solo ADM/DIR).
 */
export async function getCobertura(sesionToken, maestroId, cicloEscolar, mes, filtros) {
  return postJSON({
    action: 'get_cobertura',
    sesionToken,
    maestroId,
    cicloEscolar,
    mes,
    filtros: filtros || {}
  });
}

/**
 * Guarda evaluaciones (envío masivo).
 * evals = [{ alumnoId, calificacion, participacion, autogestion, colaboracion, pensamiento, asistencia, tareas, observaciones }]
 */
export async function saveEvaluaciones(sesionToken, maestroId, cicloEscolar, mes, evaluaciones) {
  return postJSON({
    action: 'save_evaluaciones',
    sesionToken,
    maestroId,
    cicloEscolar,
    mes,
    evaluaciones
  });
}

// === Sesión local ===

const SESION_KEY = 'wundt_docente_sesion_v2';

export function guardarSesion(sesion) {
  sessionStorage.setItem(SESION_KEY, JSON.stringify(sesion));
}

export function leerSesion() {
  try {
    const raw = sessionStorage.getItem(SESION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s.expiraEn && new Date(s.expiraEn) < new Date()) {
      sessionStorage.removeItem(SESION_KEY);
      return null;
    }
    return s;
  } catch (e) {
    return null;
  }
}

export function borrarSesion() {
  sessionStorage.removeItem(SESION_KEY);
}
