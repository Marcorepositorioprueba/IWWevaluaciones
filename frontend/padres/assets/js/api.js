// api.js — Capa de red del frontend padres.

const API_URL = 'https://script.google.com/macros/s/AKfycbwdVP-UxhfGYraVDetQZPN-XRnCEjQ35c-OZn3cztt12heMul2nLnNxPZX0TQDM0Q/exec';

async function postJSON(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function authPadre(alumnoId, pin) {
  return postJSON({ action: 'auth_padre', alumnoId, pin });
}

export async function getHistorial(sesionToken, alumnoId) {
  return postJSON({ action: 'get_historial_padre', sesionToken, alumnoId });
}

// Sesión local
const SESION_KEY = 'wundt_padre_sesion_v2';

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