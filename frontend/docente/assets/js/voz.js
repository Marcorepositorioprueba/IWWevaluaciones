// voz.js — Reconocimiento de voz para dictado de observaciones y campos numéricos.
//
// Mejoras Fase 2:
//  - Detecta comandos por voz para llenar campos numéricos:
//      "calificación ocho punto cinco" -> { field: 'calificacion', value: 8.5 }
//      "asistencia noventa" / "asistencia 90 por ciento" -> { field: 'asistencia', value: 90 }
//      "tareas doce" / "tareas 12 de 15" -> { field: 'tareas', value: 12 }
//  - Limpieza de transcripción: quita muletillas ("eee", "ah", "este"), puntuación sobrante,
//    capitaliza la primera letra, elimina filler español.
//  - onResultado devuelve { texto, comando } para que el caller decida.
//
// El reconocimiento se detiene al volver a llamar parar() o al cumplir el tiempo máximo.

const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition || null;

let instancia = null;

// === Lookup de números en español (1-1000 con decimales) ===

const NUMEROS_BASICOS = {
  'cero': 0, 'uno': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
  'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
  'once': 11, 'doce': 12, 'trece': 13, 'catorce': 14, 'quince': 15,
  'dieciséis': 16, 'dieciseis': 16, 'diecisiete': 17, 'dieciocho': 18, 'diecinueve': 19,
  'veinte': 20, 'veintiuno': 21, 'veintidós': 22, 'veintidos': 22, 'veintitrés': 23, 'veintitres': 23,
  'veinticuatro': 24, 'veinticinco': 25, 'veintiséis': 26, 'veintiseis': 26, 'veintisiete': 27, 'veintiocho': 28, 'veintinueve': 29,
  'treinta': 30, 'cuarenta': 40, 'cincuenta': 50, 'sesenta': 60, 'setenta': 70, 'ochenta': 80, 'noventa': 90
};

/**
 * Convierte una cadena de números en español a número (entero).
 * Soporta:
 *  - "noventa" -> 90
 *  - "noventa y cinco" -> 95
 *  - "ciento cinco" / "ciento veinte" -> 105, 120
 *  - "doscientos", "trescientos", "cuatrocientos", "quinientos", "setecientos", "ochocientos", "novecientos"
 *  - "mil" para 1000
 * Si no parsea, devuelve null.
 */
function parsearNumeroEspanol(texto) {
  if (!texto) return null;
  const t = texto.toLowerCase().trim();
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);

  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Quita muletillas/comas
  const limpio = tokens.map(tok => tok.replace(/[,;]/g, ''));

  // Caso: número directo del mapa
  if (limpio.length === 1 && NUMEROS_BASICOS[limpio[0]] !== undefined) return NUMEROS_BASICOS[limpio[0]];

  // Caso: "X y Y" (e.g. "noventa y cinco")
  if (limpio.length === 3 && limpio[1] === 'y' && NUMEROS_BASICOS[limpio[0]] !== undefined && NUMEROS_BASICOS[limpio[2]] !== undefined) {
    return NUMEROS_BASICOS[limpio[0]] + NUMEROS_BASICOS[limpio[2]];
  }

  // Caso: "ciento X" o "doscientos X"
  if (limpio[0] === 'ciento' || limpio[0] === 'cien') {
    const base = 100;
    if (limpio.length === 1) return 100;
    const resto = parsearNumeroEspanol(limpio.slice(1).join(' '));
    return resto != null ? base + resto : null;
  }
  const centenas = {
    'doscientos': 200, 'doscientas': 200,
    'trescientos': 300, 'trescientas': 300,
    'cuatrocientos': 400, 'cuatrocientas': 400,
    'quinientos': 500, 'quinientas': 500,
    'seiscientos': 600, 'seiscientas': 600,
    'setecientos': 700, 'setecientas': 700,
    'ochocientos': 800, 'ochocientas': 800,
    'novecientos': 900, 'novecientas': 900
  };
  if (centenas[limpio[0]] !== undefined) {
    const base = centenas[limpio[0]];
    if (limpio.length === 1) return base;
    const resto = parsearNumeroEspanol(limpio.slice(1).join(' '));
    return resto != null ? base + resto : null;
  }

  // "mil" simple
  if (limpio[0] === 'mil') {
    if (limpio.length === 1) return 1000;
    const resto = parsearNumeroEspanol(limpio.slice(1).join(' '));
    return resto != null ? 1000 + resto : null;
  }

  // Decimal con "punto" (e.g. "ocho punto cinco")
  if (limpio.length === 3 && limpio[1] === 'punto' && NUMEROS_BASICOS[limpio[0]] !== undefined && NUMEROS_BASICOS[limpio[2]] !== undefined) {
    const entero = NUMEROS_BASICOS[limpio[0]];
    const dec = NUMEROS_BASICOS[limpio[2]];
    return parseFloat(entero + '.' + dec);
  }

  return null;
}

// === Comandos reconocidos ===

const COMANDOS = [
  { re: /^(calificaci[oó]n|nota|cal|calificacion)\s+(.+)$/i, field: 'calificacion', max: 10, decimales: true },
  { re: /^(asistencia|asist)\s+(.+)$/i, field: 'asistencia', max: 100, decimales: false },
  { re: /^(tareas?|tarea)\s+(?:de\s+)?(.+?)(?:\s+de\s+\d+)?$/i, field: 'tareas', max: 15, decimales: false }
];

function detectarComando(texto) {
  const t = texto.toLowerCase().trim();
  for (const c of COMANDOS) {
    const m = t.match(c.re);
    if (m) {
      const numStr = m[2].replace(/\s+por\s+ciento$/, '').replace(/\s+de\s+\d+$/, '').trim();
      const v = parsearNumeroEspanol(numStr);
      if (v == null || isNaN(v)) return null;
      if (v > c.max) return { field: c.field, value: c.max, error: 'Valor fuera de rango, se ajustó al máximo' };
      if (v < 0) return { field: c.field, value: 0, error: 'Valor fuera de rango, se ajustó a 0' };
      return { field: c.field, value: c.decimales ? Math.round(v * 10) / 10 : Math.round(v), max: c.max };
    }
  }
  return null;
}

// === Limpieza de transcripción (observaciones) ===

const MULETILLAS = [
  'eee', 'eeeh', 'ah', 'este', 'o sea', 'a ver', 'pues', 'vale', 'ok',
  'mhh', 'mm', 'mmm', 'eh', 'ehm', 'ahh', 'ohh', 'umm'
];

function limpiarTranscripcion(texto) {
  if (!texto) return '';
  let t = String(texto).trim();
  // Quito muletillas como palabras sueltas
  MULETILLAS.forEach(m => {
    const re = new RegExp('\\b' + m + '\\b', 'gi');
    t = t.replace(re, '');
  });
  // Compacto espacios
  t = t.replace(/\s+/g, ' ').trim();
  // Mayúscula primera letra
  if (t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

// === API pública ===

export function vozSoportada() {
  return !!Reconocimiento;
}

/**
 * Inicia el dictado. onResultado({texto, comando}) cada reconocimiento parcial.
 * onError(mensaje) si falla.
 * onFin() cuando se detiene.
 */
export function iniciarDictado({ lang = 'es-MX', onResultado, onError, onFin } = {}) {
  if (!Reconocimiento) return { ok: false, error: 'Web Speech API no soportada en este navegador' };

  // P36/P37 (2026-08-26): cada llamada a iniciarDictado incrementa una
  // generación. Los handlers (onresult/onerror/onend) solo actúan si la
  // generación aún coincide — esto evita que callbacks de una sesión vieja
  // (que se detuvo al abrir la nueva) maten la nueva sesión por accidente.
  iniciarDictado._gen = (iniciarDictado._gen || 0) + 1;
  const miGeneracion = iniciarDictado._gen;

  try {
    if (instancia) {
      try { instancia.stop(); } catch (e) { /* noop */ }
    }
    const rec = new Reconocimiento();
    instancia = rec;
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
      if (miGeneracion !== iniciarDictado._gen) return;
      let textoCrudo = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        textoCrudo += event.results[i][0].transcript;
      }
      const textoCrudoTrim = textoCrudo.trim();
      const comando = detectarComando(textoCrudoTrim);
      const textoLimpio = limpiarTranscripcion(textoCrudoTrim);
      if (onResultado) {
        onResultado({
          texto: textoLimpio,
          textoCrudo: textoCrudoTrim,
          comando: comando
        });
      }
    };

    rec.onerror = (event) => {
      if (miGeneracion !== iniciarDictado._gen) return;
      // P36 (2026-08-26): filtrar 'aborted' — no es un error real. El navegador
      // lo dispara cuando una sesión se detiene para abrir otra (ej. usuario
      // cambia de 🎤 Dictar a 🎤 Calificación, o re-clickea el mismo botón).
      const errCode = (event && event.error) || 'Error desconocido de voz';
      if (errCode === 'aborted' || errCode === 'abortedError') {
        if (instancia === rec) instancia = null;
        if (onFin) onFin();
        return;
      }
      if (onError) onError(errCode);
    };

    rec.onend = () => {
      if (miGeneracion !== iniciarDictado._gen) return;
      if (instancia === rec) instancia = null;
      if (onFin) onFin();
    };

    rec.start();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function pararDictado() {
  if (!instancia) return;
  try {
    instancia.stop();
  } catch (e) { /* noop */ }
  instancia = null;
}

// Exporta los helpers para tests/uso aislado.
export const _internals = {
  parsearNumeroEspanol,
  detectarComando,
  limpiarTranscripcion
};
