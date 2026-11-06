// lib_calculos.gs — Cálculo del Índice de Desempeño, Semáforo y Riesgo.
//
// Las fórmulas del índice están pre-definidas en FORMULAS_INDICE_ (ver más abajo).
// El usuario elige cuál usar desde CONFIG (fila TIPO=FORMULA_INDICE, VALOR_ID=v1|v2|...).
// Cambiar de fórmula = editar Sheet (solo VALOR_ID). Agregar fórmulas nuevas =
// editar este dict + redeploy.
//
// Bug histórico (resuelto 2026-08-22): el parser de fórmulas estaba roto
// (siempre evaluaba con vars=1). Se reemplazó por este diccionario de funciones
// puras para evitar fórmulas inválidas y dar control sobre las distribuciones.

/**
 * Fórmulas pre-definidas del índice de desempeño.
 * Cada fórmula es una función pura (ev) => número en [0, 10].
 *
 * ev = {
 *   calificacion: 0-10,
 *   asistencia: 0-100,
 *   tareas: 0-15,
 *   pensamiento, participacion, autogestion, colaboracion: 1-4
 * }
 *
 * Pesos disponibles:
 *   v1 = default histórica (50/20/15/15) — más peso a calificación
 *   v2 = balanceada       (35/25/15/25) — más peso a asistencia y competencias
 */
const FORMULAS_INDICE_ = {
  // v1 = distribución default histórica (50/20/15/15). Conservada por compatibilidad.
  v1: function (ev) {
    const cal = parseFloat(ev.calificacion) || 0;
    const asi = parseFloat(ev.asistencia) || 0;
    const tar = parseFloat(ev.tareas) || 0;
    const pc = parseFloat(ev.pensamiento) || 1;
    const pa = parseFloat(ev.participacion) || 1;
    const au = parseFloat(ev.autogestion) || 1;
    const co = parseFloat(ev.colaboracion) || 1;

    // Distribución 50/20/15/15 escalada a 0-10
    const pCal = (cal / 10) * 5.0;                    // 0-5 (50% de 10)
    const pAsi = (asi / 100) * 2.0;                   // 0-2 (20% de 10)
    const pTar = (tar / 15) * 1.5;                    // 0-1.5 (15% de 10)
    const compProm = (pc + pa + au + co) / 4;         // 1-4
    const pCom = ((compProm - 1) / 3) * 1.5;          // 0-1.5 (15% de 10)

    return normalizarIndice_(pCal + pAsi + pTar + pCom);
  },

  // v2 = distribución balanceada (35/25/15/25). Más peso a asistencia y competencias.
  v2: function (ev) {
    const cal = parseFloat(ev.calificacion) || 0;
    const asi = parseFloat(ev.asistencia) || 0;
    const tar = parseFloat(ev.tareas) || 0;
    const pc = parseFloat(ev.pensamiento) || 1;
    const pa = parseFloat(ev.participacion) || 1;
    const au = parseFloat(ev.autogestion) || 1;
    const co = parseFloat(ev.colaboracion) || 1;

    // Distribución 35/25/15/25 escalada a 0-10
    const pCal = (cal / 10) * 3.5;                    // 0-3.5 (35% de 10)
    const pAsi = (asi / 100) * 2.5;                   // 0-2.5 (25% de 10)
    const pTar = (tar / 15) * 1.5;                    // 0-1.5 (15% de 10)
    const compSum = pc + pa + au + co;                 // 4-16 (4 competencias de 1-4)
    const pCom = ((compSum - 4) / 12) * 2.5;           // 0-2.5 (25% de 10)

    return normalizarIndice_(pCal + pAsi + pTar + pCom);
  },

  // v3 = Nueva distribución solicitada (25/15/25/35).
  // Cambios: Tareas ahora se reciben como porcentaje (0-100%).
  v3: function (ev) {
    const cal = parseFloat(ev.calificacion) || 0;
    const asi = parseFloat(ev.asistencia) || 0;
    const tar = Math.min(parseFloat(ev.tareas) || 0, 100); // Seguridad: top 100%
    const pc = parseFloat(ev.pensamiento) || 1;
    const pa = parseFloat(ev.participacion) || 1;
    const au = parseFloat(ev.autogestion) || 1;
    const co = parseFloat(ev.colaboracion) || 1;

    // Nueva Distribución 25/15/25/35 escalada a 0-10
    const pCal = (cal / 10) * 2.5;                    // 0-2.5 (25% de 10)
    const pAsi = (asi / 100) * 1.5;                   // 0-1.5 (15% de 10)
    const pTar = (tar / 100) * 2.5;                   // 0-2.5 (25% de 10)
    const compSum = pc + pa + au + co;                 // 4-16 (4 competencias de 1-4)
    const pCom = ((compSum - 4) / 12) * 3.5;           // 0-3.5 (35% de 10)

    return normalizarIndice_(pCal + pAsi + pTar + pCom);
  }

};

/**
 * Lee la fórmula activa desde CONFIG. Si no existe fila o el ID es desconocido,
 * devuelve la fórmula v1 (default histórica) como fallback.
 *
 * Devuelve { ok, eval (función o null), fuente (string identificador) }.
 */
function leerFormulaIndice_() {
  try {
    const cfg = leerConfig();
    const fila = (cfg['FORMULA_INDICE'] || [])[0];
    if (!fila) {
      // Sin fila en CONFIG → usar v1 como fallback silencioso
      return { ok: true, eval: FORMULAS_INDICE_.v1, fuente: 'v1_default' };
    }
    const id = String(fila.valorId || 'v1').trim().toLowerCase();
    const fn = FORMULAS_INDICE_[id];
    if (!fn) {
      return { ok: false, eval: null, error: 'Fórmula "' + id + '" no existe en FORMULAS_INDICE_. Disponibles: ' + Object.keys(FORMULAS_INDICE_).join(', '), fuente: id };
    }
    return { ok: true, eval: fn, fuente: id };
  } catch (e) {
    return { ok: false, eval: null, error: e.message, fuente: 'fallback v1' };
  }
}

/**
 * Calcula el índice de desempeño de una evaluación.
 *
 * ev = {
 *   calificacion: 0-10,
 *   asistencia: 0-100,
 *   tareas: 0-15,
 *   pensamiento, participacion, autogestion, colaboracion: 1-4
 * }
 *
 * Devuelve { indice (0-10), semaforo, riesgo }.
 */
function calcularIndice(ev) {
  const formula = leerFormulaIndice_();
  let indice;
  if (formula.ok && formula.eval) {
    try {
      indice = formula.eval(ev);
      indice = normalizarIndice_(indice);
    } catch (e) {
      // Si la fórmula custom falla, fallback a v1
      indice = FORMULAS_INDICE_.v1(ev);
      indice = normalizarIndice_(indice);
    }
  } else {
    // Si no hay fórmula OK (id desconocido, error de config), fallback a v1
    indice = FORMULAS_INDICE_.v1(ev);
    indice = normalizarIndice_(indice);
  }

  const s = semaforoDeIndice_(indice);
  const r = riesgoDeSemaforo_(s);
  return {
    indice: Math.round(indice * 100) / 100,
    semaforo: s,
    riesgo: r
  };
}

/** Normaliza a escala 0-10. Las fórmulas deberían caber en este rango. */
function normalizarIndice_(v) {
  if (typeof v !== 'number' || isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 10) return 10;
  return v;
}

function semaforoDeIndice_(indice) {
  if (indice >= 7.5) return 'Verde';
  if (indice >= 6.0) return 'Amarillo';
  return 'Rojo';
}

/**
 * Mapea un nivel cualitativo 1-4 (preescolar) a un color de semáforo.
 * 1, 2 → Rojo (necesita apoyo / en desarrollo)
 * 3     → Amarillo (logro esperado)
 * 4     → Verde (desempeño sobresaliente)
 */
function semaforoDeNivel_(nivel) {
  const n = parseInt(nivel, 10);
  if (n === 4) return 'Verde';
  if (n === 3) return 'Amarillo';
  if (n === 1 || n === 2) return 'Rojo';
  return '';
}

/**
 * Devuelve el peor de tres semáforos cualitativos (cognitivo, socioemocional, físico).
 * Cambio 2026-08-20: preescolar tiene 3 semáforos independientes; el "agregado" es
 * el más restrictivo. Convención de severidad: Rojo > Amarillo > Verde > ''.
 *
 *   peorDeTresSemaforos_('Verde', 'Verde', 'Verde')  → 'Verde'
 *   peorDeTresSemaforos_('Verde', 'Rojo', 'Amarillo') → 'Rojo'
 *   peorDeTresSemaforos_('Amarillo', '', 'Verde')     → 'Amarillo'
 *   peorDeTresSemaforos_('', '', '')                  → ''
 */
function peorDeTresSemaforos_(sCog, sSoc, sFis) {
  const orden = { 'Rojo': 3, 'Amarillo': 2, 'Verde': 1 };
  const candidatos = [sCog, sSoc, sFis].filter(Boolean);
  if (candidatos.length === 0) return '';
  let peor = '';
  let max = 0;
  candidatos.forEach(s => {
    const v = orden[s] || 0;
    if (v > max) { max = v; peor = s; }
  });
  return peor;
}

function riesgoDeSemaforo_(s) {
  if (s === 'Verde') return 'Bajo';
  if (s === 'Amarillo') return 'Medio';
  return 'Alto';
}

/**
 * Devuelve una etiqueta humana para el valor de competencia 1-4.
 * Usado por el frontend para mostrar en la UI.
 */
function etiquetaCompetencia(valor) {
  switch (parseInt(valor, 10)) {
    case 1: return 'Necesita apoyo';
    case 2: return 'En desarrollo';
    case 3: return 'Logro esperado';
    case 4: return 'Desempeño sobresaliente';
    default: return '—';
  }
}
