// modelos.js — Estado de la captura y validación local.
// Estructura: state.evaluaciones = { [alumnoId]: { ...campos } }
//             state.capturas = { [alumnoId]: { capturado, indice, semaforo, ... } }

export const ETIQUETAS_COMPETENCIA = {
  1: 'Necesita apoyo',
  2: 'En desarrollo',
  3: 'Logro esperado',
  4: 'Desempeño sobresaliente'
};

/**
 * Grados que disparan el modo CUALITATIVO (preescolar).
 * Match contra `alumno.grado` en lowercase.
 */
export const GRADOS_CUALITATIVOS = [
  'preescolar 1°', 'preescolar 2°', 'preescolar 3°',
  'preescolar', 'maternal', 'kinder', 'prekinder', 'prekínder'
];

/**
 * Indica si un alumno se evalúa en modo cualitativo (sin numéricos).
 */
export function esCualitativo(alumno) {
  if (!alumno) return false;
  const g = String(alumno.grado || '').toLowerCase().trim();
  if (!g) return false;
  return GRADOS_CUALITATIVOS.some(k => g === k || g.startsWith('preescolar'));
}

// Ciclo escolar arranca en Agosto.
// Mapa: numeroMesCalendario(1-12) -> nombre en el orden del ciclo.
const MES_A_INDICE_CICLO = {
  'Agosto': 0, 'Septiembre': 1, 'Octubre': 2, 'Noviembre': 3, 'Diciembre': 4,
  'Enero': 5, 'Febrero': 6, 'Marzo': 7, 'Abril': 8, 'Mayo': 9, 'Junio': 10, 'Julio': 11
};

export const MESES = [
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio'
];

/**
 * Devuelve el nombre del mes actual en el calendario (es-MX).
 * Ej. en agosto de 2026 retorna 'Agosto'.
 */
export function obtenerMesCorriente() {
  const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const m = new Date().getMonth();
  return nombres[m];
}

/**
 * Devuelve el ciclo escolar vigente. Como el ciclo escolar empieza en agosto,
 * en agosto-diciembre es el año corriente, en enero-julio es el año corriente.
 * Si el sistema lanza en pleno paso de año, hay que mantener el mismo ciclo.
 *
 * Estrategia: si el periodo del backend (CONFIG.TIPO=Periodo) está disponible,
 * se usa ese. Si no, se calcula desde la fecha actual.
 */
export function cicloEscolarPorFecha(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = fecha.getMonth(); // 0=ene, 7=ago
  // Agosto(7) a Diciembre(11): el ciclo es Y-07 (empieza en Y, "Agosto Y")
  // Enero(0) a Julio(6): el ciclo es Y-1-07 (sigue del año anterior)
  if (m >= 7) return y + '-07';
  return (y - 1) + '-07';
}

/**
 * Devuelve el índice 0-11 del mes dentro del ciclo escolar.
 */
export function indiceMesCiclo(nombreMes) {
  return MES_A_INDICE_CICLO[nombreMes] ?? -1;
}

/**
 * Lista de meses del ciclo que ya pasaron o son el actual.
 * Si estamos en agosto 2026, retorna ['Agosto'].
 * Si estamos en octubre 2026, retorna ['Agosto','Septiembre','Octubre'].
 */
export function mesesDelCicloHastaHoy(cicloEscolar, fecha = new Date()) {
  const mesActual = obtenerMesCorriente();
  const idxActual = MES_A_INDICE_CICLO[mesActual];
  if (idxActual < 0) return MESES.slice();
  return MESES.slice(0, idxActual + 1);
}

/**
 * Estado inicial del módulo.
 */
export function crearState() {
  return {
    maestroId: null,
    maestroNombre: null,
    sesionToken: null,
    expiraEn: null,
    ultimoAcceso: null,
    cicloEscolar: cicloEscolarPorFecha(),
    mes: obtenerMesCorriente(),
    alumnos: [],
    capturas: {},        // alumnoId -> { capturado, indice, semaforo, ... }
    evaluaciones: {},    // alumnoId -> { calificacion, ... }
    analitica: null,
    catalogos: null,
    loading: false
  };
}

/**
 * Plantilla vacía para una evaluación.
 * Si `cualitativo` es true, trae los 3 niveles por dimensión + 10 observaciones
 * por sub-aspecto + observación general (cambio 2026-08-20).
 * Si no, trae los 7 campos numéricos + los 3 formativos opcionales.
 */
export function evaluacionVacia(cualitativo = false) {
  if (cualitativo) {
    return {
      // 3 niveles por dimensión (1-4 cada uno, 0 = sin seleccionar)
      desempenoCognitivo: 0,
      desempenoSocioemocional: 0,
      desempenoFisico: 0,
      // Observación general del docente
      observaciones: '',
      // 10 observaciones por sub-aspecto (todas opcionales, max 500)
      obsAprendizaje: '',
      obsComprension: '',
      obsMemoria: '',
      obsHabilidadesComunicacion: '',
      obsHabilidadesSociales: '',
      obsConvivenciaAutogestion: '',
      obsAutonomiaIndependencia: '',
      obsResolucionConflictos: '',
      obsMotricidadGruesaFina: '',
      obsCoordinacionEquilibrio: ''
    };
  }
  return {
    calificacion: '',
    participacion: 0,
    autogestion: 0,
    colaboracion: 0,
    pensamiento: 0,
    asistencia: '',
    tareas: '',
    observaciones: '',
    // Formativos (opcionales, independientes del Índice)
    lenCalif: '',
    edFisCalif: '',
    compCalif: '',
    lenObs: '',
    edFisObs: '',
    compObs: ''
  };
}

/**
 * Setea campos de una evaluación. Si no existe, la crea vacía.
 * Detecta modo (cualitativo vs numérico) según el alumno.
 */
export function setEvaluacion(state, alumnoId, campos) {
  if (!state.evaluaciones[alumnoId]) {
    const alumno = state.alumnos.find(a => a.alumnoId === alumnoId);
    const cual = alumno ? esCualitativo(alumno) : false;
    state.evaluaciones[alumnoId] = evaluacionVacia(cual);
  }
  Object.assign(state.evaluaciones[alumnoId], campos);
  // Si el usuario edita un campo, pierde la marca de sincronizado
  // para que el próximo "Guardar Evaluación Grupal" sí lo incluya como
  // actualización (si el valor realmente cambió respecto a lo guardado).
  if (state.evaluaciones[alumnoId].__sincronizado) {
    delete state.evaluaciones[alumnoId].__sincronizado;
  }
}

/**
 * Hydrata state.evaluaciones con los datos previos capturados (si existen).
 * Bifurca por modo (cualitativo vs numérico).
 * Cambio 2026-08-20: cualitativo ahora hidrata 3 niveles + 10 observaciones + observación general.
 */
export function hidratarDesdeCapturas(state) {
  state.alumnos.forEach(a => {
    const cual = esCualitativo(a);
    const cap = state.capturas[a.alumnoId];
    if (cap && cap.capturado) {
      if (cual) {
        // Cualitativo (3 dimensiones + 10 observaciones)
        state.evaluaciones[a.alumnoId] = {
          desempenoCognitivo:      cap.desempenoCognitivo      || cap.pensamiento || 0,
          desempenoSocioemocional: cap.desempenoSocioemocional || cap.pensamiento || 0,
          desempenoFisico:         cap.desempenoFisico         || cap.pensamiento || 0,
          observaciones: cap.observaciones || '',
          // 10 observaciones por sub-aspecto
          obsAprendizaje:              cap.obsAprendizaje              || '',
          obsComprension:              cap.obsComprension              || '',
          obsMemoria:                  cap.obsMemoria                  || '',
          obsHabilidadesComunicacion:  cap.obsHabilidadesComunicacion  || '',
          obsHabilidadesSociales:      cap.obsHabilidadesSociales      || '',
          obsConvivenciaAutogestion:   cap.obsConvivenciaAutogestion   || '',
          obsAutonomiaIndependencia:   cap.obsAutonomiaIndependencia   || '',
          obsResolucionConflictos:     cap.obsResolucionConflictos     || '',
          obsMotricidadGruesaFina:     cap.obsMotricidadGruesaFina     || '',
          obsCoordinacionEquilibrio:   cap.obsCoordinacionEquilibrio   || '',
          __sincronizado: true
        };
      } else {
        state.evaluaciones[a.alumnoId] = {
          calificacion: cap.calificacion != null ? String(cap.calificacion) : '',
          participacion: cap.participacion || 0,
          autogestion: cap.autogestion || 0,
          colaboracion: cap.colaboracion || 0,
          pensamiento: cap.pensamiento || 0,
          asistencia: cap.asistencia != null ? String(cap.asistencia) : '',
          tareas: cap.tareas != null ? String(cap.tareas) : '',
          observaciones: cap.observaciones || '',
          // Formativos
          lenCalif: cap.lenCalif != null && cap.lenCalif !== '' ? String(cap.lenCalif) : '',
          edFisCalif: cap.edFisCalif != null && cap.edFisCalif !== '' ? String(cap.edFisCalif) : '',
          compCalif: cap.compCalif != null && cap.compCalif !== '' ? String(cap.compCalif) : '',
          lenObs: cap.lenObs || '',
          edFisObs: cap.edFisObs || '',
          compObs: cap.compObs || '',
          __sincronizado: true
        };
      }
    } else {
      state.evaluaciones[a.alumnoId] = evaluacionVacia(cual);
    }
  });
}

/**
 * Devuelve la evaluación del alumno (la crea vacía si no existe).
 */
export function getEvaluacion(state, alumnoId) {
  if (!state.evaluaciones[alumnoId]) {
    const alumno = state.alumnos.find(a => a.alumnoId === alumnoId);
    const cual = alumno ? esCualitativo(alumno) : false;
    state.evaluaciones[alumnoId] = evaluacionVacia(cual);
    return state.evaluaciones[alumnoId];
  }
  return state.evaluaciones[alumnoId];
}

/**
 * Indica si el alumno ya tiene una captura guardada en Sheets.
 */
export function alumnoCapturado(state, alumnoId) {
  const c = state.capturas[alumnoId];
  return !!(c && c.capturado);
}

/**
 * Cuenta capturas pendientes del mes para los alumnos visibles.
 */
export function contarPendientes(state) {
  let n = 0;
  state.alumnos.forEach(a => {
    if (!alumnoCapturado(state, a.alumnoId)) n++;
  });
  return n;
}

/**
 * Cuenta cuántos alumnos tienen captura pendiente de guardar (no validados aún)
 * o capturas previas que difieren de los valores actuales en pantalla.
 *
 * Política: un alumno está "listo para enviar" si validarParaEnvio pasa.
 * (reutiliza la función existente).
 */

/**
 * Valida una evaluación antes de enviar. Devuelve {ok, errores[]}.
 * Si `cualitativo` es true, exige los 3 niveles por dimensión (1-4 cada uno)
 * y valida que las 10 observaciones ≤500 chars (opcionales).
 * Si no, exige los 7 campos numéricos.
 */
export function validarParaEnvio(ev, cualitativo = false) {
  const errores = [];
  if (cualitativo) {
    ['desempenoCognitivo', 'desempenoSocioemocional', 'desempenoFisico'].forEach(campo => {
      const n = parseInt(ev[campo], 10);
      if (![1, 2, 3, 4].includes(n)) {
        const etiqueta = campo === 'desempenoCognitivo' ? 'Cognitivo'
                       : campo === 'desempenoSocioemocional' ? 'Socioemocional'
                       : 'Físico';
        errores.push({ campo: campo, msg: `Nivel ${etiqueta}: selecciona 1-4` });
      }
    });
    // Observación general
    const obs = String(ev.observaciones || '');
    if (obs.length > 500) errores.push({ campo: 'observaciones', msg: 'Máx 500 caracteres' });
    // 10 observaciones por sub-aspecto (opcionales pero ≤500 si tienen contenido)
    const OBS_CAMPOS = [
      'obsAprendizaje', 'obsComprension', 'obsMemoria',
      'obsHabilidadesComunicacion', 'obsHabilidadesSociales',
      'obsConvivenciaAutogestion', 'obsAutonomiaIndependencia', 'obsResolucionConflictos',
      'obsMotricidadGruesaFina', 'obsCoordinacionEquilibrio'
    ];
    OBS_CAMPOS.forEach(campo => {
      const v = String(ev[campo] || '');
      if (v.length > 500) errores.push({ campo: campo, msg: 'Máx 500 caracteres' });
    });
    return { ok: errores.length === 0, errores: errores };
  }
  const cal = parseFloat(ev.calificacion);
  if (isNaN(cal) || cal < 0 || cal > 10) errores.push({ campo: 'calificacion', msg: 'Calificación entre 0 y 10' });
  ['participacion', 'autogestion', 'colaboracion', 'pensamiento'].forEach(k => {
    if (![1, 2, 3, 4].includes(parseInt(ev[k], 10))) {
      errores.push({ campo: k, msg: 'Debe ser 1, 2, 3 o 4' });
    }
  });
  const asi = parseInt(ev.asistencia, 10);
  if (isNaN(asi) || asi < 0 || asi > 100) errores.push({ campo: 'asistencia', msg: 'Asistencia entre 0 y 100' });
  const tar = parseInt(ev.tareas, 10);
  if (isNaN(tar) || tar < 0 || tar > 100) errores.push({ campo: 'tareas', msg: 'Entregables entre 0 y 100%' });
  const obs = String(ev.observaciones || '');
  if (obs.length > 500) errores.push({ campo: 'observaciones', msg: 'Máx 500 caracteres' });
  return { ok: errores.length === 0, errores: errores };
}

/**
 * Cuenta evaluaciones en pantalla que están listas para enviar.
 * Itera sobre state.alumnos (no Object.values) para saber el modo por alumno.
 */
export function contarListos(state) {
  let count = 0;
  state.alumnos.forEach(a => {
    const ev = state.evaluaciones[a.alumnoId];
    if (ev && validarParaEnvio(ev, esCualitativo(a)).ok) count++;
  });
  return count;
}

/**
 * Filtra预留 Por definir. Cambio 2026-08-26 (P34): las KPIs de analítica y los
 * contadores en vivo del docente deben calcularse solo sobre alumnos REALES,
 * no sobre las filas placeholder "Por definir" que viven en ALUMNOS para
 * tener capacidad futura. El backend ya las filtra; el frontend en vivo no.
 * Sin este filtro, M03 con 15 reales + N预留 muestra "15 de 45" y 33% cuando
 * debería ser "15 de 15" y 100%.
 */
export function alumnosReales_(state) {
  if (!state || !Array.isArray(state.alumnos)) return [];
  return state.alumnos.filter(a => String(a.nombre || '').trim() !== 'Por definir');
}

/**
 * Cuenta cuántas evaluaciones se INSERTRAN (nuevas) y cuántas se actualizan.
 * Requiere state.capturas hidratado. Bifurca por modo (cualitativo vs numérico).
 * Cambio 2026-08-20: cualitativo compara 3 niveles + 10 observaciones + observación general.
 */
export function clasificarCapturas(state) {
  const result = { nuevos: [], actualizaciones: [], sinCambios: [], errores: [] };
  state.alumnos.forEach(a => {
    const ev = state.evaluaciones[a.alumnoId];
    if (!ev) return;
    const cual = esCualitativo(a);
    const v = validarParaEnvio(ev, cual);
    if (!v.ok) {
      result.errores.push({ alumnoId: a.alumnoId, nombre: a.nombre, errores: v.errores });
      return;
    }
    const previo = state.capturas[a.alumnoId];
    if (previo && previo.capturado) {
      let mismo;
      if (cual) {
        // 3 niveles por dimensión + observación general + 10 observaciones por sub-aspecto
        mismo = (
          Number(previo.desempenoCognitivo      || previo.pensamiento || 0) === Number(ev.desempenoCognitivo      || 0) &&
          Number(previo.desempenoSocioemocional || previo.pensamiento || 0) === Number(ev.desempenoSocioemocional || 0) &&
          Number(previo.desempenoFisico         || previo.pensamiento || 0) === Number(ev.desempenoFisico         || 0) &&
          String(previo.observaciones || '') === String(ev.observaciones || '') &&
          String(previo.obsAprendizaje              || '') === String(ev.obsAprendizaje              || '') &&
          String(previo.obsComprension              || '') === String(ev.obsComprension              || '') &&
          String(previo.obsMemoria                  || '') === String(ev.obsMemoria                  || '') &&
          String(previo.obsHabilidadesComunicacion  || '') === String(ev.obsHabilidadesComunicacion  || '') &&
          String(previo.obsHabilidadesSociales      || '') === String(ev.obsHabilidadesSociales      || '') &&
          String(previo.obsConvivenciaAutogestion   || '') === String(ev.obsConvivenciaAutogestion   || '') &&
          String(previo.obsAutonomiaIndependencia   || '') === String(ev.obsAutonomiaIndependencia   || '') &&
          String(previo.obsResolucionConflictos     || '') === String(ev.obsResolucionConflictos     || '') &&
          String(previo.obsMotricidadGruesaFina     || '') === String(ev.obsMotricidadGruesaFina     || '') &&
          String(previo.obsCoordinacionEquilibrio   || '') === String(ev.obsCoordinacionEquilibrio   || '')
        );
      } else {
        mismo = (
          Number(previo.calificacion) === Number(ev.calificacion) &&
          Number(previo.asistencia) === Number(ev.asistencia) &&
          Number(previo.tareas) === Number(ev.tareas) &&
          Number(previo.participacion) === Number(ev.participacion) &&
          Number(previo.autogestion) === Number(ev.autogestion) &&
          Number(previo.colaboracion) === Number(ev.colaboracion) &&
          Number(previo.pensamiento) === Number(ev.pensamiento) &&
          String(previo.observaciones || '') === String(ev.observaciones || '') &&
          String(previo.lenCalif || '') === String(ev.lenCalif || '') &&
          String(previo.edFisCalif || '') === String(ev.edFisCalif || '') &&
          String(previo.compCalif || '') === String(ev.compCalif || '') &&
          String(previo.lenObs || '') === String(ev.lenObs || '') &&
          String(previo.edFisObs || '') === String(ev.edFisObs || '') &&
          String(previo.compObs || '') === String(ev.compObs || '')
        );
      }
      if (mismo || ev.__sincronizado) {
        // Si está marcado como sincronizado (caso típico: el usuario acaba de
        // guardar y no ha editado nada nuevo), se trata como "sin cambios" y
        // NO se vuelve a enviar. Esto previene re-envíos accidentales que
        // duplicarían filas en el Sheet.
        result.sinCambios.push(a.alumnoId);
      } else {
        result.actualizaciones.push(a.alumnoId);
      }
    } else {
      result.nuevos.push(a.alumnoId);
    }
  });
  return result;
}

/**
 * Formatea una fecha ISO o Date a "hace N tiempo" (es-MX).
 * Usado para mostrar "Última conexión: hace 2 horas".
 */
export function haceTiempo(fecha) {
  if (!fecha) return null;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const seg = Math.floor(diff / 1000);
  if (seg < 60) return 'hace un momento';
  const min = Math.floor(seg / 60);
  if (min < 60) return 'hace ' + min + ' min';
  const hor = Math.floor(min / 60);
  if (hor < 24) return 'hace ' + hor + ' h';
  const dia = Math.floor(hor / 24);
  if (dia < 30) return 'hace ' + dia + ' día' + (dia > 1 ? 's' : '');
  const mes = Math.floor(dia / 30);
  if (mes < 12) return 'hace ' + mes + ' mes' + (mes > 1 ? 'es' : '');
  const anio = Math.floor(dia / 365);
  return 'hace ' + anio + ' año' + (anio > 1 ? 's' : '');
}
