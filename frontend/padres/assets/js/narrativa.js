// narrativa.js — Generador de Narrativas para el portal de padres.
//
// Convierte los datos crudos de una evaluación en frases humanas que el
// padre/madre pueda leer fácilmente.
//
// Cada regla es independiente y se compone con las demás. Para agregar/quitar
// disparadores, edita las funciones `regla_*` y la lista REGLAS_HEAD / REGLAS_BODY.

const ETIQUETAS_COMPETENCIA = {
  1: 'necesita apoyo',
  2: 'está en desarrollo',
  3: 'alcanza el logro esperado',
  4: 'muestra desempeño sobresaliente'
};

// Etiquetas del nivel 1-4 para la narrativa CUALITATIVA (preescolar).
// "Necesita apoyo / En desarrollo / Logro esperado / Desempeño sobresaliente".
const ETIQUETAS_NIVEL = {
  1: 'Necesita apoyo',
  2: 'En desarrollo',
  3: 'Logro esperado',
  4: 'Desempeño sobresaliente'
};

// Cambio 2026-08-20: 3 dimensiones canónicas con sus sub-aspectos.
// Mismas keys que backend (lib_calculos.gs) y que frontend docente (DIMENSIONES_PREESCOLAR_).
const ETIQUETAS_DIMENSION = {
  cognitivo:      'Desarrollo cognitivo',
  socioemocional: 'Desarrollo socioemocional',
  fisico:         'Desarrollo físico'
};

const SUBASPECTOS_POR_DIM = {
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

// Grados que disparan el modo cualitativo en el portal de padres.
const GRADOS_CUALITATIVOS = [
  'preescolar 1°', 'preescolar 2°', 'preescolar 3°',
  'preescolar', 'maternal', 'kinder', 'prekinder', 'prekínder'
];

function esCualitativo(ev) {
  if (!ev) return false;
  const g = String(ev.grado || '').toLowerCase().trim();
  if (!g) return false;
  return GRADOS_CUALITATIVOS.some(k => g === k || g.startsWith('preescolar'));
}

/**
 * Encabezado motivador según semáforo.
 */
function reglaSemaforo(ev, ctx) {
  const nombre = ctx.nombreAlumno || 'Su hijo/a';
  if (ev.semaforo === 'Verde') return `¡Excelentes noticias sobre ${nombre}!`;
  if (ev.semaforo === 'Amarillo') return `${nombre} avanza, con áreas por fortalecer este mes.`;
  return `Es momento de acompañar más de cerca a ${nombre}.`;
}

/**
 * Frase sobre el desempeño académico.
 */
function reglaAcademico(ev) {
  const c = parseFloat(ev.calificacion);
  if (c >= 9) return `Su desempeño académico es destacado (${c}/10).`;
  if (c >= 8) return `Mantiene un nivel académico muy bueno (${c}/10).`;
  if (c >= 7) return `Su rendimiento académico es sólido (${c}/10).`;
  if (c >= 6) return `Su calificación (${c}/10) muestra áreas que podemos reforzar juntos.`;
  return `Reforzaremos los contenidos académicos durante las próximas semanas (${c}/10).`;
}

/**
 * Frase sobre asistencia.
 */
function reglaAsistencia(ev) {
  const a = parseInt(ev.asistencia, 10);
  if (isNaN(a)) return '';
  if (a < 60) return `⚠️ La asistencia fue del ${a}%, muy por debajo de lo recomendado. Es importante recuperar regularidad.`;
  if (a < 80) return `⚠️ La asistencia fue del ${a}%, por debajo del 80% recomendado.`;
  if (a < 95) return `Asistió al ${a}% de las clases.`;
  return `Asistió al ${a}% de las clases — excelente regularidad.`;
}

/**
 * Frase sobre promedio de competencias (1-4).
 */
function reglaCompetencias(ev) {
  const comps = ['pensamiento', 'participacion', 'autogestion', 'colaboracion'];
  const valores = comps.map(k => parseInt(ev[k], 10)).filter(n => !isNaN(n));
  if (valores.length === 0) return '';
  const prom = valores.reduce((a, b) => a + b, 0) / valores.length;

  // Encontrar la competencia más baja
  let masBaja = null;
  let masBajaVal = 99;
  valores.forEach((v, i) => {
    if (v < masBajaVal) {
      masBajaVal = v;
      masBaja = comps[i];
    }
  });

  if (prom >= 3.5) {
    return `Sobresale en habilidades socioemocionales (promedio ${prom.toFixed(1)}/4).`;
  }
  if (prom >= 3) {
    return `Sus habilidades socioemocionales van bien (promedio ${prom.toFixed(1)}/4).`;
  }
  if (prom >= 2) {
    const nombreComp = ({
      pensamiento: 'pensamiento crítico',
      participacion: 'participación',
      autogestion: 'autogestión',
      colaboracion: 'colaboración'
    })[masBaja] || masBaja;
    return `Trabaja en desarrollo socioemocional, especialmente en ${nombreComp}.`;
  }
  return `Las habilidades socioemocionales requieren acompañamiento especial.`;
}

/**
 * Frase sobre el índice global.
 */
function reglaIndice(ev) {
  const i = parseFloat(ev.indice || 0);
  if (isNaN(i)) return '';
  return `El índice global de este mes es de ${i.toFixed(2)}/10. Este resultado refleja el desempeño integral del alumno, considerando su calificación, asistencia y competencias socioemocionales.`;
}

/**
 * Observaciones literales del maestro entre comillas, si existen.
 */
function reglaObservaciones(ev) {

  const obs = String(ev.observaciones || '').trim();
  if (!obs) return '';
  return `"${obs}"`;
}

/**
 * Tareas: frase corta.
 */
function reglaTareas(ev) {
  const t = parseInt(ev.tareas, 10);
  if (isNaN(t)) return '';
  if (t >= 12) return `Entregó ${t} de 15 tareas — muy buena entrega.`;
  if (t >= 8) return `Entregó ${t} de 15 tareas.`;
  if (t >= 4) return `Entregó ${t} tareas; podemos mejorar este indicador.`;
  return `Solo ${t} tareas entregadas; es importante fortalecer este hábito.`;
}

/**
 * Genera la narrativa completa para una evaluación.
 *
 * Si el alumno es de PREESCOLAR (cualitativo): genera una narrativa corta
 * con el nivel 1-4 y el mensaje del docente.
 *
 * Si es 1°-6° primaria o 1°-3° secundaria (numérico): narrativa completa
 * con académico, asistencia, tareas, competencias, observaciones y
 * (si vienen) un párrafo extra para los 3 formativos.
 *
 * ev = {
 *   nombreAlumno, grado,                        // contexto del alumno
 *   calificacion, asistencia, tareas,
 *   pensamiento, participacion, autogestion, colaboracion,
 *   observaciones, semaforo,
 *   lenCalif, edFisCalif, compCalif,            // formativos opcionales
 *   lenObs, edFisObs, compObs
 * }
 */
export function generarNarrativa(ev) {
  if (!ev || typeof ev !== 'object') return '';

  if (esCualitativo(ev)) {
    return generarNarrativaCualitativa(ev);
  }
  return generarNarrativaNumerica(ev);
}

/**
 * Narrativa para preescolar (modo cualitativo, 3 dimensiones + 10 sub-observaciones).
 * Cambio 2026-08-20: usa desempenoCognitivo/Socioemocional/Fisico + semaforoCognitivo/etc.
 * en lugar del legado 'pensamiento' único. Si el payload viene del periodo legacy
 * (sin los 3 campos), cae al fallback de un solo nivel.
 */
function generarNarrativaCualitativa(ev) {
  const nombre = ev.nombreAlumno || 'Su hijo/a';

  // Detectar si el payload ya trae las 3 dimensiones (post-migración 2026-08-20)
  const tieneDims = !!(ev.desempenoCognitivo || ev.desempenoSocioemocional || ev.desempenoFisico
    || ev.semaforoCognitivo || ev.semaforoSocioemocional || ev.semaforoFisico);

  const partes = [];

  if (tieneDims) {
    // Encabezado basado en el semáforo AGREGADO (peor de los 3)
    const sem = ev.semaforo || ev.semaforoAgregado || '';
    if (sem === 'Verde') {
      partes.push(`¡Excelentes noticias sobre ${nombre}!`);
    } else if (sem === 'Amarillo') {
      partes.push(`${nombre} avanza, con áreas por fortalecer este mes.`);
    } else {
      partes.push(`Es momento de acompañar más de cerca a ${nombre}.`);
    }

    // Resumen por dimensión
    partes.push('');
    partes.push('Resumen por dimensión:');
    const dims = ['cognitivo', 'socioemocional', 'fisico'];
    dims.forEach(k => {
      const nivel = parseInt(ev['desempeno' + k.charAt(0).toUpperCase() + k.slice(1)] || 0, 10);
      const etiqueta = ETIQUETAS_NIVEL[nivel] || 'Sin nivel asignado';
      const semDim = ev['semaforo' + k.charAt(0).toUpperCase() + k.slice(1)] || '';
      partes.push(`• ${ETIQUETAS_DIMENSION[k]}: ${etiqueta} (nivel ${nivel} de 4)${semDim ? ' · ' + semDim : ''}`);
    });

    // Obs por sub-aspecto (sólo las que tengan texto)
    const bloqueSub = generarParrafoSubObservacionesPreescolar(ev);
    if (bloqueSub) {
      partes.push('');
      partes.push('Detalles por aspecto:');
      partes.push(bloqueSub);
    }
  } else {
    // Fallback legacy: 1 nivel + 1 observación
    const nivel = parseInt(ev.pensamiento || 0, 10);
    const etiqueta = ETIQUETAS_NIVEL[nivel] || 'Sin nivel asignado';
    if (ev.semaforo === 'Verde') {
      partes.push(`¡Excelentes noticias sobre ${nombre}!`);
    } else if (ev.semaforo === 'Amarillo') {
      partes.push(`${nombre} avanza, con áreas por fortalecer este mes.`);
    } else {
      partes.push(`Es momento de acompañar más de cerca a ${nombre}.`);
    }
    partes.push(`Su desempeño general fue: ${etiqueta} (nivel ${nivel} de 4).`);
  }

  // Observación general del docente (siempre que exista)
  const obs = String(ev.observaciones || '').trim();
  if (obs) {
    partes.push('');
    partes.push('Mensaje del maestro:');
    partes.push(`"${obs}"`);
  }

  partes.push('');
  partes.push('— Equipo docente, Instituto Wilhelm Wundt');
  return partes.filter(p => p !== null && p !== undefined).join('\n');
}

/**
 * Construye un párrafo con las sub-observaciones (10) agrupadas por dimensión.
 * Solo incluye las que tienen texto. Devuelve '' si no hay ninguna.
 */
function generarParrafoSubObservacionesPreescolar(ev) {
  const lineas = [];
  const dimOrder = ['cognitivo', 'socioemocional', 'fisico'];
  dimOrder.forEach(dim => {
    const subs = SUBASPECTOS_POR_DIM[dim] || [];
    const llenas = subs.filter(s => String(ev[s.k] || '').trim().length > 0);
    if (llenas.length === 0) return;
    lineas.push(`▸ ${ETIQUETAS_DIMENSION[dim]}:`);
    llenas.forEach(s => {
      lineas.push(`  • ${s.t}: "${String(ev[s.k]).trim()}"`);
    });
  });
  return lineas.join('\n');
}

/**
 * Narrativa para 1°-6° primaria y 1°-3° secundaria (modo numérico).
 * Si vienen formativos con datos, agrega un párrafo extra al final.
 */
function generarNarrativaNumerica(ev) {
  const ctx = { nombreAlumno: ev.nombreAlumno };
  const partes = [];

  partes.push(reglaSemaforo(ev, ctx));
  partes.push(reglaAcademico(ev));
  partes.push(reglaAsistencia(ev));
  partes.push(reglaTareas(ev));
  partes.push(reglaCompetencias(ev));
  partes.push(reglaIndice(ev));

  const obs = reglaObservaciones(ev);
  if (obs) {
    partes.push(''); // línea en blanco
    partes.push('Mensaje del maestro:');
    partes.push(obs);
  }

  // Bloque de formativos (solo si hay datos)
  const parrafoFormativos = generarParrafoFormativos(ev);
  if (parrafoFormativos) {
    partes.push('');
    partes.push(parrafoFormativos);
  }

  partes.push('');
  partes.push('— Equipo docente, Instituto Wilhelm Wundt');

  return partes.filter(p => p !== null && p !== undefined).join('\n');
}

/**
 * Párrafo extra para los 3 formativos. Se incluye solo si al menos uno
 * tiene calificación capturada. Las observaciones se mencionan si existen.
 */
function generarParrafoFormativos(ev) {
  const campos = [
    { calif: ev.lenCalif, obs: ev.lenObs, nombre: 'Lenguajes' },
    { calif: ev.edFisCalif, obs: ev.edFisObs, nombre: 'Educación Física' },
    { calif: ev.compCalif, obs: ev.compObs, nombre: 'Computación' }
  ];
  const conCalif = campos.filter(c => c.calif !== '' && c.calif != null && c.calif !== undefined);
  if (conCalif.length === 0) return '';

  const lineas = conCalif.map(c => {
    const v = parseFloat(c.calif);
    const obsTxt = String(c.obs || '').trim();
    let s = `${c.nombre}: ${v.toFixed(1)}/10`;
    if (obsTxt) s += ` — "${obsTxt}"`;
    return s;
  });

  let parrafo = '📌 En las clases especiales (independientes del índice general): ' + lineas.join(' · ') + '.';
  return parrafo;
}

/**
 * Etiqueta corta de semáforo, útil para chips.
 */
export function etiquetaSemaforo(s) {
  if (s === 'Verde') return 'Avance destacado';
  if (s === 'Amarillo') return 'En desarrollo';
  return 'Necesita acompañamiento';
}

/**
 * Devuelve la clase CSS para el color del semáforo.
 */
export function claseSemaforo(s) {
  if (s === 'Verde') return 'semaforo-Verde';
  if (s === 'Amarillo') return 'semaforo-Amarillo';
  return 'semaforo-Rojo';
}