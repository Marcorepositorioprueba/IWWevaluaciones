// api.js — Capa de red del portal Administrador/Director (ADM/DIR).
// Reutiliza el patrón del docente (mismo backend, mismo URL).
// P33 (2026-08-26).

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
 * Autentica ADM/DIR. Devuelve {ok, maestroId, nombre, sesionToken, expiraEn, ultimoAcceso}
 * o {ok:false, error}. Misma función que usa el docente (auth_maestro), pero el
 * backend valida que maestroId sea ADM o DIR en endpoints de dirección.
 */
export async function authMaestro(maestroId, password) {
  return postJSON({ action: 'auth_maestro', maestroId, password });
}

/**
 * Cobertura del ciclo+mes agrupada por (grado, grupo) para el dashboard global.
 * Solo accesible para maestroId ADM/DIR (validado en backend con esAdmin_).
 */
export async function getCoberturaPorGrupo(sesionToken, maestroId, cicloEscolar, mes) {
  return postJSON({
    action: 'get_cobertura_por_grupo',
    sesionToken,
    maestroId,
    cicloEscolar,
    mes
  });
}

/**
 * Drill-down de un grupo: alumnos del (grado, grupo) con su estado individual
 * del mes (capturado/pendiente, semáforo, índice, observaciones preview).
 */
export async function getAlumnosGrupo(sesionToken, maestroId, cicloEscolar, mes, grado, grupo) {
  return postJSON({
    action: 'get_alumnos_grupo',
    sesionToken,
    maestroId,
    cicloEscolar,
    mes,
    grado,
    grupo
  });
}

// === Sesión local ===

const SESION_KEY = 'wundt_admin_sesion_v2';

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