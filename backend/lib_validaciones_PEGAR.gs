// lib_validaciones.gs — Validación de entrada por acción.
//
// Cada función devuelve {ok: true, datos} o {ok: false, errores: [{campo, msg}]}.
// Los errores son específicos por campo para que el frontend sepa qué marcar.

const MESES_VALIDOS = [
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio'
];

const COMP_VALORES = [1, 2, 3, 4];

/**
 * Helper: valida un formativo (calificación 0-10 opcional).
 * Devuelve {valor, error}. Si el valor viene vacío/null/undefined → {valor: '', error: null}.
 */
function _validarFormativoCalif_(ev, campo) {
  const raw = ev[campo];
  if (raw === '' || raw === null || raw === undefined) return { valor: '', error: null };
  const v = parseFloat(raw);
  if (isNaN(v) || v < 0 || v > 10) {
    return { valor: '', error: { campo: campo, msg: 'Debe estar entre 0 y 10' } };
  }
  return { valor: v, error: null };
}

/**
 * Helper: valida una observación de formativo (string opcional, max 500).
 */
function _validarFormativoObs_(ev, campo) {
  const s = String(ev[campo] || '');
  if (s.length > 500) {
    return { valor: '', error: { campo: campo, msg: 'Máximo 500 caracteres' } };
  }
  return { valor: s, error: null };
}

/**
 * Lista canónica de las 10 observaciones por sub-aspecto cualitativo.
 * Cambio 2026-08-20: preescolar pasa de 1 observación a 10 por sub-aspecto.
 */
const OBS_Preescolar_ = [
  'obsAprendizaje', 'obsComprension', 'obsMemoria',
  'obsHabilidadesComunicacion', 'obsHabilidadesSociales',
  'obsConvivenciaAutogestion', 'obsAutonomiaIndependencia',
  'obsResolucionConflictos',
  'obsMotricidadGruesaFina', 'obsCoordinacionEquilibrio'
];

/**
 * Lista canónica de los 3 niveles por dimensión (cualitativo).
 */
const Niveles_Preescolar_ = ['desempenoCognitivo', 'desempenoSocioemocional', 'desempenoFisico'];

/**
 * Valida y normaliza un objeto evaluación.
 * Soporta dos modos:
 *   - Cualitativo (preescolar): solo exige desempeno (1-4) + observaciones.
 *   - Numérico (1°-secundaria): exige los 7 campos clásicos.
 * En ambos modos se aceptan los 3 formativos opcionales (Len/EdFis/Comp + obs).
 *
 * `alumno` es el objeto completo (no solo el id) para detectar el modo.
 *   Si no se pasa, se asume numérico (compatibilidad).
 *
 * Devuelve {ok:true, datos} o {ok:false, errores:[...]}.
 */
function validarEvaluacion(ev, alumno, maestroValido, cicloEscolar, mes) {
  const errores = [];

  if (!ev || typeof ev !== 'object') {
    return { ok: false, errores: [{ campo: 'evaluacion', msg: 'Evaluación inválida' }] };
  }

  // alumnoId: si `alumno` es string, trátalo como id (compatibilidad con llamadas viejas).
  let alumnoIdStr;
  if (typeof alumno === 'string') {
    alumnoIdStr = alumno;
    alumno = undefined; // forzar modo desconocido → numérico
  } else {
    alumnoIdStr = String((alumno && alumno.AlumnoID) || ev.alumnoId || '').trim();
  }

  if (!alumnoIdStr) errores.push({ campo: 'alumnoId', msg: 'Falta alumnoId' });
  else if (maestroValido !== undefined) {
    // En llamada nueva, alumno es objeto y ya validamos pertenencia en Code.gs.
    // Aquí solo validamos que alumnoId del body coincida con el del objeto alumno.
    if (alumno && String(alumno.AlumnoID || '').trim() !== alumnoIdStr) {
      errores.push({ campo: 'alumnoId', msg: 'alumnoId no coincide con el maestro' });
    }
  }

  // maestroId (opcional en cada evaluación: si no viene, se usa el del nivel superior)
  const maestroId = String(ev.maestroId || maestroValido || '').trim();
  if (!maestroId) errores.push({ campo: 'maestroId', msg: 'Falta maestroId' });
  else if (maestroValido !== undefined && maestroId !== maestroValido) {
    errores.push({ campo: 'maestroId', msg: 'maestroId no coincide con la sesión' });
  }

  // Detectar modo: cualitativo si el alumno es de preescolar.
  const cualitativo = alumno ? esCualitativo_(alumno) : false;

  let datos;

  if (cualitativo) {
    // ============ MODO CUALITATIVO (PREESCOLAR) ============
    // Cambio 2026-08-20: 3 niveles por dimensión (1-4 cada uno, obligatorios)
    // + 10 observaciones por sub-aspecto (opcionales, max 500) + observaciones generales.
    const desCog = parseInt(ev.desempenoCognitivo, 10);
    const desSoc = parseInt(ev.desempenoSocioemocional, 10);
    const desFis = parseInt(ev.desempenoFisico, 10);
    if (!COMP_VALORES.includes(desCog)) errores.push({ campo: 'desempenoCognitivo', msg: 'Nivel cognitivo debe ser 1, 2, 3 o 4' });
    if (!COMP_VALORES.includes(desSoc)) errores.push({ campo: 'desempenoSocioemocional', msg: 'Nivel socioemocional debe ser 1, 2, 3 o 4' });
    if (!COMP_VALORES.includes(desFis)) errores.push({ campo: 'desempenoFisico', msg: 'Nivel físico debe ser 1, 2, 3 o 4' });

    // Observación general
    let obs = String(ev.observaciones || '');
    if (obs.length > 500) {
      errores.push({ campo: 'observaciones', msg: 'Observaciones máximo 500 caracteres' });
    }

    datos = {
      alumnoId: alumnoIdStr,
      maestroId: maestroId,
      calificacion: 0,
      participacion: 0,
      autogestion: 0,
      colaboracion: 0,
      // Pensamiento_Critico (legacy) recibe el nivel cognitivo para retrocompatibilidad.
      // La columna J se conserva por si futuras lecturas la necesitan.
      pensamiento: desCog,
      asistencia: 0,
      tareas: 0,
      observaciones: obs,
      cicloEscolar: cicloEscolar,
      mes: mes,
      // NUEVO: 3 niveles por dimensión
      desempenoCognitivo: desCog,
      desempenoSocioemocional: desSoc,
      desempenoFisico: desFis
    };
  } else {
    // ============ MODO NUMÉRICO (1°-6° y 1°-3° SECUNDARIA) ============
    // calificación
    const cal = parseFloat(ev.calificacion);
    if (isNaN(cal) || cal < 0 || cal > 10) {
      errores.push({ campo: 'calificacion', msg: 'Calificación debe estar entre 0 y 10' });
    }

    // competencias
    ['participacion', 'autogestion', 'colaboracion', 'pensamiento'].forEach(k => {
      const v = parseInt(ev[k], 10);
      if (!COMP_VALORES.includes(v)) {
        errores.push({ campo: k, msg: 'Debe ser 1, 2, 3 o 4' });
      }
    });

    // asistencia
    const asi = parseInt(ev.asistencia, 10);
    if (isNaN(asi) || asi < 0 || asi > 100) {
      errores.push({ campo: 'asistencia', msg: 'Asistencia debe estar entre 0 y 100' });
    }

    // tareas
    const tar = parseInt(ev.tareas, 10);
    if (isNaN(tar) || tar < 0 || tar > 15) {
      errores.push({ campo: 'tareas', msg: 'Tareas debe estar entre 0 y 15' });
    }

    // observaciones
    let obs = String(ev.observaciones || '');
    if (obs.length > 500) {
      errores.push({ campo: 'observaciones', msg: 'Observaciones máximo 500 caracteres' });
    }

    datos = {
      alumnoId: alumnoIdStr,
      maestroId: maestroId,
      calificacion: cal,
      participacion: parseInt(ev.participacion, 10),
      autogestion: parseInt(ev.autogestion, 10),
      colaboracion: parseInt(ev.colaboracion, 10),
      pensamiento: parseInt(ev.pensamiento, 10),
      asistencia: asi,
      tareas: tar,
      observaciones: obs,
      cicloEscolar: cicloEscolar,
      mes: mes
    };
  }

  // ============ FORMATIVOS (opcional, aplica a ambos modos) ============
  ['lenCalif', 'edFisCalif', 'compCalif'].forEach(campo => {
    const r = _validarFormativoCalif_(ev, campo);
    if (r.error) errores.push(r.error);
    datos[campo] = r.valor;
  });
  ['lenObs', 'edFisObs', 'compObs'].forEach(campo => {
    const r = _validarFormativoObs_(ev, campo);
    if (r.error) errores.push(r.error);
    datos[campo] = r.valor;
  });

  // ============ OBSERVACIONES POR SUB-ASPECTO (solo cualitativo) ============
  // Cambio 2026-08-20: 10 textareas abiertas (≤500 c/u). En numérico quedan '' por default.
  // Validamos tamaño máximo igual que para los formativos.
  if (cualitativo) {
    OBS_Preescolar_.forEach(campo => {
      const r = _validarFormativoObs_(ev, campo);
      if (r.error) errores.push(r.error);
      datos[campo] = r.valor;
    });
  } else {
    // En numérico inicializamos los 13 campos nuevos a '' para que upsertEvaluacion
    // escriba '' en las columnas Y-AA/AK (evita celdas undefined).
    Niveles_Preescolar_.forEach(k => { datos[k] = ''; });
    OBS_Preescolar_.forEach(k => { datos[k] = ''; });
  }

  if (errores.length) return { ok: false, errores: errores };

  return { ok: true, datos: datos };
}

/**
 * Valida el body de auth_maestro.
 */
function validarAuthMaestro(body) {
  const errores = [];
  if (!body || typeof body !== 'object') {
    return { ok: false, errores: [{ campo: 'body', msg: 'Body vacío' }] };
  }
  if (!String(body.maestroId || '').trim()) errores.push({ campo: 'maestroId', msg: 'Falta maestroId' });
  if (!String(body.password || '')) errores.push({ campo: 'password', msg: 'Falta password' });
  if (errores.length) return { ok: false, errores: errores };
  return { ok: true, datos: { maestroId: String(body.maestroId).trim(), password: String(body.password) } };
}

/**
 * Valida el body de auth_padre.
 */
function validarAuthPadre(body) {
  const errores = [];
  if (!body || typeof body !== 'object') return { ok: false, errores: [{ campo: 'body', msg: 'Body vacío' }] };
  if (!String(body.alumnoId || '').trim()) errores.push({ campo: 'alumnoId', msg: 'Falta alumnoId' });
  const pin = String(body.pin || '').trim();
  if (!/^\d{4}$/.test(pin)) errores.push({ campo: 'pin', msg: 'PIN debe ser 4 dígitos' });
  if (errores.length) return { ok: false, errores: errores };
  return { ok: true, datos: { alumnoId: String(body.alumnoId).trim(), pin: pin } };
}

/**
 * Valida el body de get_alumnos.
 */
function validarGetAlumnos(body) {
  const errores = [];
  if (!body || typeof body !== 'object') return { ok: false, errores: [{ campo: 'body', msg: 'Body vacío' }] };
  if (!String(body.sesionToken || '')) errores.push({ campo: 'sesionToken', msg: 'Falta sesionToken' });
  if (!String(body.maestroId || '').trim()) errores.push({ campo: 'maestroId', msg: 'Falta maestroId' });
  if (errores.length) return { ok: false, errores: errores };
  return { ok: true, datos: { sesionToken: String(body.sesionToken), maestroId: String(body.maestroId).trim() } };
}

/**
 * Valida el body de save_evaluaciones (nivel superior, no cada evaluación).
 */
function validarSaveEvaluacionesTop(body) {
  const errores = [];
  if (!body || typeof body !== 'object') return { ok: false, errores: [{ campo: 'body', msg: 'Body vacío' }] };
  if (!String(body.sesionToken || '')) errores.push({ campo: 'sesionToken', msg: 'Falta sesionToken' });
  const ciclo = String(body.cicloEscolar || '').trim();
  if (!ciclo) errores.push({ campo: 'cicloEscolar', msg: 'Falta cicloEscolar' });
  const mes = String(body.mes || '').trim();
  if (!MESES_VALIDOS.includes(mes)) errores.push({ campo: 'mes', msg: 'Mes inválido' });

  // Red de seguridad: no permitir meses futuros del ciclo escolar (Ago-Jul)
  if (MESES_VALIDOS.includes(mes)) {
    const mesActualIdx = mesActualCicloEscolar_();
    const mesIdx = MESES_VALIDOS.indexOf(mes);
    if (mesIdx > mesActualIdx) {
      errores.push({
        campo: 'mes',
        msg: 'No se permite capturar meses futuros del ciclo escolar. Mes actual: ' + MESES_VALIDOS[mesActualIdx]
      });
    }
  }

  if (!Array.isArray(body.evaluaciones) || body.evaluaciones.length === 0) {
    errores.push({ campo: 'evaluaciones', msg: 'evaluaciones debe ser un array con al menos 1 elemento' });
  }
  if (Array.isArray(body.evaluaciones) && body.evaluaciones.length > 200) {
    errores.push({ campo: 'evaluaciones', msg: 'Máximo 200 evaluaciones por request' });
  }
  if (errores.length) return { ok: false, errores: errores };
  return { ok: true, datos: {
    sesionToken: String(body.sesionToken),
    maestroId: String(body.maestroId || '').trim(),
    cicloEscolar: ciclo,
    mes: mes,
    evaluaciones: body.evaluaciones
  } };
}

/**
 * Devuelve el índice del mes actual dentro del ciclo escolar (0=Agosto ... 11=Julio).
 * Cambio 2026-08-21: usado por validarSaveEvaluacionesTop para bloquear meses futuros.
 */
function mesActualCicloEscolar_() {
  const ahora = new Date();
  const mesJs = ahora.getMonth(); // 0=Ene ... 11=Dic
  // MESES_VALIDOS arranca en Agosto (índice 0)
  // Mapa JS month → índice en MESES_VALIDOS:
  //   Ene(0)→5, Feb(1)→6, Mar(2)→7, Abr(3)→8, May(4)→9, Jun(5)→10, Jul(6)→11
  //   Ago(7)→0, Sep(8)→1, Oct(9)→2, Nov(10)→3, Dic(11)→4
  if (mesJs >= 7) return mesJs - 7;   // Ago-Dic
  return mesJs + 5;                   // Ene-Jul
}

/**
 * Valida el body de get_historial_padre.
 */
function validarGetHistorialPadre(body) {
  const errores = [];
  if (!body || typeof body !== 'object') return { ok: false, errores: [{ campo: 'body', msg: 'Body vacío' }] };
  if (!String(body.sesionToken || '')) errores.push({ campo: 'sesionToken', msg: 'Falta sesionToken' });
  if (!String(body.alumnoId || '').trim()) errores.push({ campo: 'alumnoId', msg: 'Falta alumnoId' });
  if (errores.length) return { ok: false, errores: errores };
  return { ok: true, datos: { sesionToken: String(body.sesionToken), alumnoId: String(body.alumnoId).trim() } };
}

/**
 * Valida el body de get_estado_capturas.
 */
function validarGetEstadoCapturas(body) {
  const errores = [];
  if (!body || typeof body !== 'object') return { ok: false, errores: [{ campo: 'body', msg: 'Body vacío' }] };
  if (!String(body.sesionToken || '')) errores.push({ campo: 'sesionToken', msg: 'Falta sesionToken' });
  if (!String(body.maestroId || '').trim()) errores.push({ campo: 'maestroId', msg: 'Falta maestroId' });
  if (!String(body.cicloEscolar || '').trim()) errores.push({ campo: 'cicloEscolar', msg: 'Falta cicloEscolar' });
  const mes = String(body.mes || '').trim();
  if (!MESES_VALIDOS.includes(mes)) errores.push({ campo: 'mes', msg: 'Mes inválido' });
  if (errores.length) return { ok: false, errores: errores };
  return { ok: true, datos: {
    sesionToken: String(body.sesionToken),
    maestroId: String(body.maestroId).trim(),
    cicloEscolar: String(body.cicloEscolar).trim(),
    mes: mes
  } };
}

/**
 * Valida el body de get_cobertura.
 */
function validarGetCobertura(body) {
  const errores = [];
  if (!body || typeof body !== 'object') return { ok: false, errores: [{ campo: 'body', msg: 'Body vacío' }] };
  if (!String(body.sesionToken || '')) errores.push({ campo: 'sesionToken', msg: 'Falta sesionToken' });
  if (!String(body.maestroId || '').trim()) errores.push({ campo: 'maestroId', msg: 'Falta maestroId' });
  if (!String(body.cicloEscolar || '').trim()) errores.push({ campo: 'cicloEscolar', msg: 'Falta cicloEscolar' });
  const mes = String(body.mes || '').trim();
  if (!MESES_VALIDOS.includes(mes)) errores.push({ campo: 'mes', msg: 'Mes inválido' });
  if (errores.length) return { ok: false, errores: errores };
  return { ok: true, datos: {
    sesionToken: String(body.sesionToken),
    maestroId: String(body.maestroId).trim(),
    cicloEscolar: String(body.cicloEscolar).trim(),
    mes: mes,
    filtros: {
      maestroId: body.filtros && body.filtros.maestroId ? String(body.filtros.maestroId).trim() : null,
      grado: body.filtros && body.filtros.grado ? String(body.filtros.grado).trim() : null,
      grupo: body.filtros && body.filtros.grupo ? String(body.filtros.grupo).trim() : null
    }
  } };
}

/**
 * P33 (2026-08-26): valida body para get_cobertura_por_grupo (dashboard ADM/DIR).
 * Mismo shape que get_cobertura pero sin filtros.
 */
function validarGetCoberturaPorGrupo(body) {
  const errores = [];
  if (!body || typeof body !== 'object') return { ok: false, errores: [{ campo: 'body', msg: 'Body vacío' }] };
  if (!String(body.sesionToken || '')) errores.push({ campo: 'sesionToken', msg: 'Falta sesionToken' });
  if (!String(body.maestroId || '').trim()) errores.push({ campo: 'maestroId', msg: 'Falta maestroId' });
  if (!String(body.cicloEscolar || '').trim()) errores.push({ campo: 'cicloEscolar', msg: 'Falta cicloEscolar' });
  const mes = String(body.mes || '').trim();
  if (!MESES_VALIDOS.includes(mes)) errores.push({ campo: 'mes', msg: 'Mes inválido' });
  if (errores.length) return { ok: false, errores: errores };
  return { ok: true, datos: {
    sesionToken: String(body.sesionToken),
    maestroId: String(body.maestroId).trim(),
    cicloEscolar: String(body.cicloEscolar).trim(),
    mes: mes
  } };
}

/**
 * P33 (2026-08-26): valida body para get_alumnos_grupo (drill-down ADM/DIR).
 */
function validarGetAlumnosGrupo(body) {
  const errores = [];
  if (!body || typeof body !== 'object') return { ok: false, errores: [{ campo: 'body', msg: 'Body vacío' }] };
  if (!String(body.sesionToken || '')) errores.push({ campo: 'sesionToken', msg: 'Falta sesionToken' });
  if (!String(body.maestroId || '').trim()) errores.push({ campo: 'maestroId', msg: 'Falta maestroId' });
  if (!String(body.cicloEscolar || '').trim()) errores.push({ campo: 'cicloEscolar', msg: 'Falta cicloEscolar' });
  const mes = String(body.mes || '').trim();
  if (!MESES_VALIDOS.includes(mes)) errores.push({ campo: 'mes', msg: 'Mes inválido' });
  if (!String(body.grado || '').trim()) errores.push({ campo: 'grado', msg: 'Falta grado' });
  if (!String(body.grupo || '').trim()) errores.push({ campo: 'grupo', msg: 'Falta grupo' });
  if (errores.length) return { ok: false, errores: errores };
  return { ok: true, datos: {
    sesionToken: String(body.sesionToken),
    maestroId: String(body.maestroId).trim(),
    cicloEscolar: String(body.cicloEscolar).trim(),
    mes: mes,
    grado: String(body.grado).trim(),
    grupo: String(body.grupo).trim()
  } };
}

/**
 * Devuelve el catálogo de catálogos disponibles para analítica del docente.
 * (grados, grupos, ciclos escolares que tengan evaluaciones).
 */
function catalogoAnalitica_(maestroId) {
  const alumnos = leerFilas('ALUMNOS').filas
    .filter(a => String(a.MaestroID || '').trim() === maestroId)
    .filter(a => String(a.NombreCompleto || '').trim() !== 'Por definir');
  const grados = Array.from(new Set(alumnos.map(a => String(a.Grado || '').trim()).filter(Boolean))).sort();
  const grupos = Array.from(new Set(alumnos.map(a => String(a.Grupo || '').trim()).filter(Boolean))).sort();
  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();
  const ciclos = new Set();
  if (data.length > 1) {
    const headers = data[0].map(h => String(h).trim());
    const idxAlumno = headers.indexOf('AlumnoID');
    const idxCiclo = headers.indexOf('CicloEscolar');
    const idxMaestro = headers.indexOf('MaestroID');
    const alumnoIdsMaestro = new Set(alumnos.map(a => String(a.AlumnoID).trim()));
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxMaestro] || '').trim() !== maestroId) continue;
      if (!alumnoIdsMaestro.has(String(data[i][idxAlumno] || '').trim())) continue;
      const c = String(data[i][idxCiclo] || '').trim();
      if (c) ciclos.add(c);
    }
  }
  return {
    grados: grados,
    grupos: grupos,
    ciclos: Array.from(ciclos).sort()
  };
}

/**
 * Valida el body de get_analitica_docente.
 */
function validarGetAnaliticaDocente(body) {
  const errores = [];
  if (!body || typeof body !== 'object') return { ok: false, errores: [{ campo: 'body', msg: 'Body vacío' }] };
  if (!String(body.sesionToken || '')) errores.push({ campo: 'sesionToken', msg: 'Falta sesionToken' });
  if (!String(body.maestroId || '').trim()) errores.push({ campo: 'maestroId', msg: 'Falta maestroId' });
  if (errores.length) return { ok: false, errores: errores };
  return { ok: true, datos: {
    sesionToken: String(body.sesionToken),
    maestroId: String(body.maestroId).trim()
  } };
}
