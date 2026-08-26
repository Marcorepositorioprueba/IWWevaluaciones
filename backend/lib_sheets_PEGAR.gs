// lib_sheets.gs — Lectura y escritura robusta sobre Google Sheets.
//
// Todo el código del proyecto pasa por aquí para acceder a Sheets.
// Ventajas:
//   - Error legible si una hoja no existe (en vez de "Cannot read property of undefined")
//   - Validación de headers contra un esquema declarado
//   - upsertEvaluacion() evita duplicados por (AlumnoID + Mes + CicloEscolar)

// Orden de meses canónico. Si por error de orden de archivos globals no
// se ha definido en lib_validaciones.gs, caemos a esta constante.
const MESES_VALIDOS_LIB_SHEETS_ = [
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio'
];

const SHEETS = {
  CONFIG: {
    nombre: 'CONFIG',
    headers: ['TIPO', 'VALOR_ID', 'DESCRIPCION']
  },
  ALUMNOS: {
    nombre: 'ALUMNOS',
    headers: ['AlumnoID', 'NombreCompleto', 'Grupo', 'Grado', 'MaestroID']
  },
  EVALUACIONES: {
    nombre: 'EVALUACIONES',
    // 41 columnas (A-AO). Cambio 2026-08-20: preescolar cualitativo pasa de 1 nivel
    // (Pensamiento_Critico) a 3 dimensiones (cognitivo/socioemocional/físico) + 10
    // observaciones por sub-aspecto + 3 semáforos por dimensión + semáforo agregado.
    headers: [
      // A-Q (17): núcleo original
      'ID_Registro', 'CicloEscolar', 'Mes', 'AlumnoID', 'MaestroID',                       // A-E
      'Calificacion_Numerica', 'Participacion', 'Autogestion', 'Colaboracion',              // F-I
      'Pensamiento_Critico', 'Asistencia_Porcentaje', 'Tareas_Entregadas',                 // J-L
      'Observaciones', 'Indice_Desempeno', 'Nivel_Riesgo', 'Semaforo',                     // M-P
      'FechaRegistro',                                                                     // Q
      // R-W (6): formativos (independientes del Índice)
      'Len_Calif', 'EdFis_Calif', 'Comp_Calif',                                            // R-T
      'Len_Obs', 'EdFis_Obs', 'Comp_Obs',                                                  // U-W
      // X (1): NombreAlumno para auditoría humana. NO se lee desde el portal.
      'NombreAlumno',
      // Y-AA (3): NUEVO — niveles por dimensión (solo preescolar cualitativo)
      'Pensamiento_Cognitivo', 'Pensamiento_Socioemocional', 'Pensamiento_Fisico',
      // AB-AK (10): NUEVO — observaciones por sub-aspecto cualitativo
      'Obs_Aprendizaje', 'Obs_Comprension', 'Obs_Memoria',                                 // cognitivo (3)
      'Obs_Habilidades_Comunicacion', 'Obs_Habilidades_Sociales',                          // socio (5)
      'Obs_Convivencia_Autogestion', 'Obs_Autonomia_Independencia',
      'Obs_Resolucion_Conflictos',
      'Obs_Motricidad_Gruesa_Fina', 'Obs_Coordinacion_Equilibrio',                         // físico (2)
      // AL-AO (4): NUEVO — semáforos por dimensión + semáforo agregado (peor de los 3)
      'Semaforo_Cognitivo', 'Semaforo_Socioemocional', 'Semaforo_Fisico',
      'Semaforo_Agregado'                                                                  // AO
    ]
  },
  MAESTROS_AUTH: {
    nombre: 'MAESTROS_AUTH',
    headers: ['MaestroID', 'PasswordHash', 'Salt', 'Activo', 'UltimoAcceso']
  },
  ACCESOS_PADRES: {
    nombre: 'ACCESOS_PADRES',
    headers: ['AlumnoID', 'PINHash', 'Salt', 'TutorNombre', 'TutorEmail', 'TutorTelefono', 'Activo', 'FechaAlta']
  },
  BACKUP_LOGS: {
    nombre: 'BACKUP_LOGS',
    headers: ['Fecha', 'Payload', 'Estado']
  }
};

/**
 * Devuelve true si el alumno es de preescolar (evaluación cualitativa,
 * sin numéricos). Se infiere por el campo Grado del alumno.
 */
function esCualitativo_(alumno) {
  if (!alumno) return false;
  const g = String(alumno.Grado || '').toLowerCase().trim();
  if (!g) return false;
  return g.startsWith('preescolar') || g === 'maternal' || g === 'kinder' || g === 'prekinder' || g === 'prekínder';
}

/**
 * Devuelve el Spreadsheet activo, abriéndolo por fallback si hace falta.
 */
function getSS_() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('SPREADSHEET_ID no configurado en Script Properties y no hay spreadsheet activo.');
    return SpreadsheetApp.openById(id);
  }
}

/**
 * Devuelve una hoja por nombre. Si no existe, lanza error legible con sugerencia.
 */
function getHoja(nombre) {
  const ss = getSS_();
  const sh = ss.getSheetByName(nombre);
  if (!sh) {
    throw new Error(
      'Hoja "' + nombre + '" no encontrada en el spreadsheet. ' +
      'Verifica que exista con ese nombre exacto (mayúsculas inclusive). ' +
      'Si tu sistema está recién desplegado, ejecuta diagnosticoSheets() desde el editor.'
    );
  }
  return sh;
}

/**
 * Asegura que la hoja exista. Si no existe, la crea con los headers esperados
 * y devuelve la hoja creada. Útil para MAESTROS_AUTH y BACKUP_LOGS al primer arranque.
 */
function asegurarHoja(def) {
  const ss = getSS_();
  let sh = ss.getSheetByName(def.nombre);
  if (sh) return sh;
  sh = ss.insertSheet(def.nombre);
  sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
  sh.setFrozenRows(1);
  return sh;
}

/**
 * Valida que los headers de una hoja coincidan con el esquema.
 * Devuelve {ok: bool, faltantes: [...], extras: [...]} sin lanzar excepción.
 */
function validarHeaders(nombreHoja, headersEsperados) {
  const sh = getHoja(nombreHoja);
  const headersReales = sh.getRange(1, 1, 1, headersEsperados.length).getValues()[0];
  const faltantes = [];
  const extras = [];
  headersEsperados.forEach((h, i) => {
    if (String(headersReales[i] || '').trim() !== h) {
      faltantes.push({ pos: i + 1, esperado: h, actual: String(headersReales[i] || '').trim() });
    }
  });
  if (headersReales.length > headersEsperados.length) {
    for (let i = headersEsperados.length; i < headersReales.length; i++) {
      extras.push(String(headersReales[i] || '').trim());
    }
  }
  return { ok: faltantes.length === 0, faltantes: faltantes, extras: extras };
}

/**
 * Lee una hoja completa. Devuelve {headers, filas} donde filas es array de objetos
 * con claves = headers. Si la hoja está vacía (solo header), devuelve {headers, filas: []}.
 */
function leerFilas(nombreHoja) {
  const sh = getHoja(nombreHoja);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) {
    return { headers: data[0] || [], filas: [] };
  }
  const headers = data[0].map(h => String(h || '').trim());
  const filas = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((h, j) => {
      row[h] = data[i][j];
    });
    filas.push(row);
  }
  return { headers: headers, filas: filas };
}

/**
 * Normaliza un valor de CicloEscolar que el Sheet pudo haber convertido a Date.
 * Cambio 2026-08-21: defensivo — si Sheets convirtió la celda a tipo fecha,
 * devuelve "YYYY-MM" en lugar del toString() de Date que nunca matchea.
 */
function normalizarCicloEscolar_(v) {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const mm = String(v.getMonth() + 1).padStart(2, '0');
    return y + '-' + mm;
  }
  return String(v || '').trim();
}

/**
 * Busca la fila de EVALUACIONES que coincida con alumnoId + mes + cicloEscolar.
 * Devuelve {row: numero (1-based)} si la encuentra, o null si no existe.
 */
/**
 * Normaliza un alumnoId para comparación robusta contra el Sheet.
 * Cambio 2026-08-21: Sheets lee IDs numéricos como number ("3.10" → 3.1).
 * Al comparar, ambos producen "3.1" y matchean con la primera fila. Por eso
 * canonicalizamos con un padding que preserva la "forma" del ID:
 *   "3.1"  → "03.10"   (grado=03, alumno=10 → mismo número que "3.10")
 *   "3.10" → "03.10"
 *   "1.5"  → "01.05"
 *   "10.3" → "10.03"
 * Esto garantiza que IDs que SOLO difieren en dígitos (3.1 vs 3.10) NO coincidan.
 *
 * Si el ID no tiene formato "n.m" (ej. "M01"), lo devuelve tal cual.
 */
function canonicalizarAlumnoId_(id) {
  const s = String(id || '').trim();
  const m = s.match(/^(\d+)\.(\d+)$/);
  if (!m) return s; // No es formato grado.alumno, devuelve literal
  const grado = m[1].padStart(2, '0');
  const alumno = m[2].padStart(2, '0');
  return grado + '.' + alumno;
}

/**
 * Devuelve el alumnoId con apóstrofo inicial para forzar formato texto en Sheet.
 * Cambio 2026-08-21: cuando Sheet recibe un valor numérico, lo guarda como number.
 * Para que distinga "3.1" de "3.10", necesitamos que la celda sea texto literal.
 * Solución: prefijar con "'" (apóstrofo), que Sheet interpreta como texto.
 * Al LEER, el apóstrofo NO aparece; Sheet lo oculta automáticamente.
 */
function forzarTextoId_(id) {
  const s = String(id || '').trim();
  if (!s) return s;
  if (s.startsWith("'")) return s;
  return "'" + s;
}

/**
 * Limpia el apóstrofo inicial que Sheet pueda haber preservado al leer.
 * Cambio 2026-08-21: cuando el Sheet SÍ tiene la celda como texto (porque alguien
 * la escribió con apóstrofo), `getValue()` puede devolver el apóstrofo visible.
 * Esta función lo quita para que el resto del código trabaje con el ID limpio.
 */
function limpiarTextoId_(id) {
  const s = String(id || '').trim();
  if (s.startsWith("'")) return s.substring(1);
  return s;
}

/**
 * Busca la fila de EVALUACIONES que coincida con alumnoId + mes + cicloEscolar.
 * Cambio 2026-08-21: usa canonicalizarAlumnoId_ para evitar colisiones
 * entre IDs como "3.1" y "3.10" (ambos se leían como number 3.1 desde Sheet).
 * Devuelve {row: numero (1-based)} si la encuentra, o null si no existe.
 */
function buscarFilaEvaluacion(alumnoId, mes, cicloEscolar) {
  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();
  const idCanon = canonicalizarAlumnoId_(alumnoId);
  for (let i = 1; i < data.length; i++) {
    if (
      canonicalizarAlumnoId_(limpiarTextoId_(data[i][3])) === idCanon &&
      String(data[i][2] || '').trim() === String(mes).trim() &&
      normalizarCicloEscolar_(data[i][1]) === String(cicloEscolar).trim()
    ) {
      return i + 1; // +1 porque getRange() es 1-based
    }
  }
  return null;
}

/**
 * Inserta o actualiza una evaluación.
 * Devuelve {fila, accion: "insert"|"update", indice, semaforo, riesgo}.
 * Schema: 41 columnas (A-AO). Cambio 2026-08-20: incluye 3 niveles por dimensión,
 * 10 observaciones por sub-aspecto y 4 semáforos derivados.
 */
function upsertEvaluacion(evaluacion) {
  const sh = getHoja('EVALUACIONES');
  const filaExistente = buscarFilaEvaluacion(evaluacion.alumnoId, evaluacion.mes, evaluacion.cicloEscolar);

  // Defensivo: si la hoja aún no tiene 41 columnas, abortamos ANTES de escribir para
  // no corromper datos. El usuario debe extender el header manualmente en Sheets.
  const totalColsHoja = sh.getLastColumn();
  if (totalColsHoja < 41) {
    throw new Error(
      'EVALUACIONES tiene ' + totalColsHoja + ' columnas; se requieren 41 (A-AO). ' +
      'Extiende el header en Sheets manualmente antes de desplegar el backend nuevo.'
    );
  }

  // Helper local: convierte nivel a entero o '' si vacío/inválido.
  const nOrEmpty_ = (v) => {
    if (v === '' || v === null || v === undefined) return '';
    const n = parseInt(v, 10);
    return isNaN(n) ? '' : n;
  };
  const fOrEmpty_ = (v) => {
    if (v === '' || v === null || v === undefined) return '';
    const n = parseFloat(v);
    return isNaN(n) ? '' : n;
  };

  const fila = [
    filaExistente ? sh.getRange(filaExistente, 1).getValue() : ('EVAL-' + Date.now()), // A ID_Registro
    normalizarCicloEscolar_(evaluacion.cicloEscolar),                                 // B (defensivo Date→texto)
    String(evaluacion.mes || ''),                                                        // C
    forzarTextoId_(String(evaluacion.alumnoId || '')),                                   // D (texto literal)
    String(evaluacion.maestroId || ''),                                                  // E
    fOrEmpty_(evaluacion.calificacion),                                                  // F
    nOrEmpty_(evaluacion.participacion),                                                 // G
    nOrEmpty_(evaluacion.autogestion),                                                   // H
    nOrEmpty_(evaluacion.colaboracion),                                                  // I
    nOrEmpty_(evaluacion.pensamiento),                                                   // J (legacy: en cualitativo = desempenoCognitivo)
    nOrEmpty_(evaluacion.asistencia),                                                    // K
    nOrEmpty_(evaluacion.tareas),                                                        // L
    String(evaluacion.observaciones || ''),                                              // M (≤500)
    fOrEmpty_(evaluacion.indice),                                                        // N
    String(evaluacion.riesgo || ''),                                                     // O
    String(evaluacion.semaforo || ''),                                                   // P (espejo de Semaforo_Agregado)
    filaExistente ? sh.getRange(filaExistente, 17).getValue() : new Date(),              // Q FechaRegistro
    // Formativos (R-W). Independientes del Índice.
    fOrEmpty_(evaluacion.lenCalif),                                                      // R
    fOrEmpty_(evaluacion.edFisCalif),                                                    // S
    fOrEmpty_(evaluacion.compCalif),                                                     // T
    String(evaluacion.lenObs || ''),                                                     // U
    String(evaluacion.edFisObs || ''),                                                   // V
    String(evaluacion.compObs || ''),                                                    // W
    // X: NombreAlumno auditoría
    String(evaluacion.nombreAlumno || ''),                                               // X
    // Y-AA: NUEVO — niveles por dimensión (cualitativo)
    nOrEmpty_(evaluacion.desempenoCognitivo),                                            // Y
    nOrEmpty_(evaluacion.desempenoSocioemocional),                                       // Z
    nOrEmpty_(evaluacion.desempenoFisico),                                               // AA
    // AB-AK: NUEVO — 10 observaciones por sub-aspecto
    String(evaluacion.obsAprendizaje || ''),                                             // AB
    String(evaluacion.obsComprension || ''),                                             // AC
    String(evaluacion.obsMemoria || ''),                                                 // AD
    String(evaluacion.obsHabilidadesComunicacion || ''),                                 // AE
    String(evaluacion.obsHabilidadesSociales || ''),                                     // AF
    String(evaluacion.obsConvivenciaAutogestion || ''),                                  // AG
    String(evaluacion.obsAutonomiaIndependencia || ''),                                  // AH
    String(evaluacion.obsResolucionConflictos || ''),                                    // AI
    String(evaluacion.obsMotricidadGruesaFina || ''),                                    // AJ
    String(evaluacion.obsCoordinacionEquilibrio || ''),                                  // AK
    // AL-AO: NUEVO — 3 semáforos por dimensión + semáforo agregado (peor de los 3)
    String(evaluacion.semaforoCognitivo || ''),                                          // AL
    String(evaluacion.semaforoSocioemocional || ''),                                     // AM
    String(evaluacion.semaforoFisico || ''),                                             // AN
    String(evaluacion.semaforoAgregado || evaluacion.semaforo || '')                     // AO (fallback a P por si llega legacy)
  ];

  if (filaExistente) {
    sh.getRange(filaExistente, 1, 1, 41).setValues([fila]);
    return { fila: filaExistente, accion: 'update', indice: evaluacion.indice, semaforo: evaluacion.semaforo, riesgo: evaluacion.riesgo };
  } else {
    sh.appendRow(fila);
    return { fila: sh.getLastRow(), accion: 'insert', indice: evaluacion.indice, semaforo: evaluacion.semaforo, riesgo: evaluacion.riesgo };
  }
}

/**
 * Lee evaluaciones de un alumno específico (todas las del historial).
 * Devuelve array de objetos con campos normalizados.
 */
function leerHistorialAlumno(alumnoId) {
  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => { idx[String(h).trim()] = i; });

  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idx['AlumnoID']] || '').trim() !== String(alumnoId).trim()) continue;
    out.push({
      idRegistro: data[i][idx['ID_Registro']],
      cicloEscolar: normalizarCicloEscolar_(data[i][idx['CicloEscolar']]),
      mes: data[i][idx['Mes']],
      alumnoId: data[i][idx['AlumnoID']],
      maestroId: data[i][idx['MaestroID']],
      calificacion: data[i][idx['Calificacion_Numerica']],
      participacion: data[i][idx['Participacion']],
      autogestion: data[i][idx['Autogestion']],
      colaboracion: data[i][idx['Colaboracion']],
      pensamiento: data[i][idx['Pensamiento_Critico']],
      asistencia: data[i][idx['Asistencia_Porcentaje']],
      tareas: data[i][idx['Tareas_Entregadas']],
      observaciones: data[i][idx['Observaciones']],
      indice: data[i][idx['Indice_Desempeno']],
      riesgo: data[i][idx['Nivel_Riesgo']],
      semaforo: data[i][idx['Semaforo']],
      fechaRegistro: data[i][idx['FechaRegistro']],
      // Formativos (columnas R-W). Independientes del Índice.
      lenCalif: idx['Len_Calif'] !== undefined ? data[i][idx['Len_Calif']] : '',
      edFisCalif: idx['EdFis_Calif'] !== undefined ? data[i][idx['EdFis_Calif']] : '',
      compCalif: idx['Comp_Calif'] !== undefined ? data[i][idx['Comp_Calif']] : '',
      lenObs: idx['Len_Obs'] !== undefined ? data[i][idx['Len_Obs']] : '',
      edFisObs: idx['EdFis_Obs'] !== undefined ? data[i][idx['EdFis_Obs']] : '',
      compObs: idx['Comp_Obs'] !== undefined ? data[i][idx['Comp_Obs']] : '',
      // NUEVO 2026-08-20: 3 niveles por dimensión (cualitativo)
      desempenoCognitivo: idx['Pensamiento_Cognitivo'] !== undefined ? Number(data[i][idx['Pensamiento_Cognitivo']]) || 0 : 0,
      desempenoSocioemocional: idx['Pensamiento_Socioemocional'] !== undefined ? Number(data[i][idx['Pensamiento_Socioemocional']]) || 0 : 0,
      desempenoFisico: idx['Pensamiento_Fisico'] !== undefined ? Number(data[i][idx['Pensamiento_Fisico']]) || 0 : 0,
      // NUEVO: 10 observaciones por sub-aspecto (cualitativo). Defensivo: si la hoja no
      // tiene las columnas, devuelve string vacío para no romper el portal padres.
      obsAprendizaje: idx['Obs_Aprendizaje'] !== undefined ? String(data[i][idx['Obs_Aprendizaje']] || '') : '',
      obsComprension: idx['Obs_Comprension'] !== undefined ? String(data[i][idx['Obs_Comprension']] || '') : '',
      obsMemoria: idx['Obs_Memoria'] !== undefined ? String(data[i][idx['Obs_Memoria']] || '') : '',
      obsHabilidadesComunicacion: idx['Obs_Habilidades_Comunicacion'] !== undefined ? String(data[i][idx['Obs_Habilidades_Comunicacion']] || '') : '',
      obsHabilidadesSociales: idx['Obs_Habilidades_Sociales'] !== undefined ? String(data[i][idx['Obs_Habilidades_Sociales']] || '') : '',
      obsConvivenciaAutogestion: idx['Obs_Convivencia_Autogestion'] !== undefined ? String(data[i][idx['Obs_Convivencia_Autogestion']] || '') : '',
      obsAutonomiaIndependencia: idx['Obs_Autonomia_Independencia'] !== undefined ? String(data[i][idx['Obs_Autonomia_Independencia']] || '') : '',
      obsResolucionConflictos: idx['Obs_Resolucion_Conflictos'] !== undefined ? String(data[i][idx['Obs_Resolucion_Conflictos']] || '') : '',
      obsMotricidadGruesaFina: idx['Obs_Motricidad_Gruesa_Fina'] !== undefined ? String(data[i][idx['Obs_Motricidad_Gruesa_Fina']] || '') : '',
      obsCoordinacionEquilibrio: idx['Obs_Coordinacion_Equilibrio'] !== undefined ? String(data[i][idx['Obs_Coordinacion_Equilibrio']] || '') : '',
      // NUEVO: 3 semáforos por dimensión + semáforo agregado
      semaforoCognitivo: idx['Semaforo_Cognitivo'] !== undefined ? String(data[i][idx['Semaforo_Cognitivo']] || '') : '',
      semaforoSocioemocional: idx['Semaforo_Socioemocional'] !== undefined ? String(data[i][idx['Semaforo_Socioemocional']] || '') : '',
      semaforoFisico: idx['Semaforo_Fisico'] !== undefined ? String(data[i][idx['Semaforo_Fisico']] || '') : '',
      semaforoAgregado: idx['Semaforo_Agregado'] !== undefined ? String(data[i][idx['Semaforo_Agregado']] || '') : ''
    });
  }
  return out;
}

/**
 * Lee la configuración y la devuelve como objeto {tipo: [{valorId, descripcion}]}.
 * Útil para catálogos como Maestros M01-M09.
 */
function leerConfig() {
  const { filas } = leerFilas('CONFIG');
  const cfg = {};
  filas.forEach(row => {
    const tipo = String(row.TIPO || '').trim();
    if (!cfg[tipo]) cfg[tipo] = [];
    cfg[tipo].push({
      valorId: String(row.VALOR_ID || '').trim(),
      descripcion: String(row.DESCRIPCION || '').trim()
    });
  });
  return cfg;
}

/**
 * Devuelve el nombre real de un maestro a partir de su ID,
 * buscado en CONFIG.TIPO=Maestro.
 */
function nombreDeMaestro(maestroId) {
  const cfg = leerConfig();
  const lista = cfg['Maestro'] || [];
  const found = lista.find(m => m.valorId === String(maestroId).trim());
  return found ? found.descripcion : null;
}

/**
 * Devuelve el ciclo escolar vigente desde CONFIG.TIPO=Periodo.
 * Por simplicidad toma el primero; si hay varios, devuelve el primero.
 */
function cicloEscolarVigente() {
  const cfg = leerConfig();
  const lista = cfg['Periodo'] || [];
  return lista.length ? lista[0].valorId : null;
}

/**
 * Helper: appendRow a hoja de logs. Si la hoja no existe o está llena de cosas raras,
 * NO falla la operación principal (los logs son best-effort).
 */
function logAppend(nombreHoja, fila) {
  try {
    const sh = asegurarHoja(SHEETS[nombreHoja]);
    sh.appendRow(fila);
  } catch (e) {
    // Silencioso. Si el log falla, el backend sigue funcionando.
    Logger.log('logAppend falló: ' + e.message);
  }
}

/**
 * Devuelve el estado de captura de los alumnos de un maestro en un mes/ciclo.
 * Devuelve { capturas: [{alumnoId, capturado, fecha, indice, semaforo, ...}], resumen: {...} }
 * Una entrada por alumno: capturado=false si no hay fila, true si la hay.
 */
function leerCapturasMaestro_(maestroId, cicloEscolar, mes) {
  // 1) Alumnos del maestro
  const alumnos = leerFilas('ALUMNOS').filas
    .filter(a => String(a.MaestroID || '').trim() === maestroId)
    .filter(a => String(a.NombreCompleto || '').trim() !== 'Por definir');

  // 2) Evaluaciones existentes del ciclo+mes
  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) {
    return {
      capturas: alumnos.map(a => ({ alumnoId: String(a.AlumnoID).trim(), capturado: false })),
      resumen: { totalAlumnos: alumnos.length, capturados: 0, pendientes: alumnos.length, porcentaje: 0 }
    };
  }

  const headers = data[0].map(h => String(h).trim());
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });

  const alumnoxId = {};
  alumnos.forEach(a => {
    alumnoxId[String(a.AlumnoID).trim()] = {
      alumnoId: String(a.AlumnoID).trim(),
      nombre: String(a.NombreCompleto).trim(),
      grado: String(a.Grado).trim(),
      grupo: String(a.Grupo).trim(),
      capturado: false
    };
  });

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const aid = limpiarTextoId_(String(row[idx['AlumnoID']] || '').trim());
    const ce = normalizarCicloEscolar_(row[idx['CicloEscolar']]);
    const m = String(row[idx['Mes']] || '').trim();
    const mid = String(row[idx['MaestroID']] || '').trim();
    if (mid !== maestroId || ce !== cicloEscolar || m !== mes) continue;
    if (!alumnoxId[aid]) continue;
    alumnoxId[aid].capturado = true;
    alumnoxId[aid].idRegistro = String(row[idx['ID_Registro']] || '');
    alumnoxId[aid].calificacion = Number(row[idx['Calificacion_Numerica']]) || 0;
    alumnoxId[aid].asistencia = Number(row[idx['Asistencia_Porcentaje']]) || 0;
    alumnoxId[aid].tareas = Number(row[idx['Tareas_Entregadas']]) || 0;
    alumnoxId[aid].participacion = Number(row[idx['Participacion']]) || 0;
    alumnoxId[aid].autogestion = Number(row[idx['Autogestion']]) || 0;
    alumnoxId[aid].colaboracion = Number(row[idx['Colaboracion']]) || 0;
    alumnoxId[aid].pensamiento = Number(row[idx['Pensamiento_Critico']]) || 0;
    alumnoxId[aid].indice = Number(row[idx['Indice_Desempeno']]) || 0;
    alumnoxId[aid].semaforo = String(row[idx['Semaforo']] || '');
    alumnoxId[aid].riesgo = String(row[idx['Nivel_Riesgo']] || '');
    alumnoxId[aid].observaciones = String(row[idx['Observaciones']] || '');
    // Formativos (opcional, si las columnas existen en el Sheet)
    if (idx['Len_Calif'] !== undefined) alumnoxId[aid].lenCalif = row[idx['Len_Calif']];
    if (idx['EdFis_Calif'] !== undefined) alumnoxId[aid].edFisCalif = row[idx['EdFis_Calif']];
    if (idx['Comp_Calif'] !== undefined) alumnoxId[aid].compCalif = row[idx['Comp_Calif']];
    if (idx['Len_Obs'] !== undefined) alumnoxId[aid].lenObs = String(row[idx['Len_Obs']] || '');
    if (idx['EdFis_Obs'] !== undefined) alumnoxId[aid].edFisObs = String(row[idx['EdFis_Obs']] || '');
    if (idx['Comp_Obs'] !== undefined) alumnoxId[aid].compObs = String(row[idx['Comp_Obs']] || '');
    // NUEVO 2026-08-20: 3 niveles por dimensión + 10 obs + 4 semáforos (defensivo)
    if (idx['Pensamiento_Cognitivo'] !== undefined) alumnoxId[aid].desempenoCognitivo = Number(row[idx['Pensamiento_Cognitivo']]) || 0;
    if (idx['Pensamiento_Socioemocional'] !== undefined) alumnoxId[aid].desempenoSocioemocional = Number(row[idx['Pensamiento_Socioemocional']]) || 0;
    if (idx['Pensamiento_Fisico'] !== undefined) alumnoxId[aid].desempenoFisico = Number(row[idx['Pensamiento_Fisico']]) || 0;
    // 10 observaciones por sub-aspecto
    alumnoxId[aid].obsAprendizaje           = idx['Obs_Aprendizaje']           !== undefined ? String(row[idx['Obs_Aprendizaje']]           || '') : '';
    alumnoxId[aid].obsComprension           = idx['Obs_Comprension']           !== undefined ? String(row[idx['Obs_Comprension']]           || '') : '';
    alumnoxId[aid].obsMemoria               = idx['Obs_Memoria']               !== undefined ? String(row[idx['Obs_Memoria']]               || '') : '';
    alumnoxId[aid].obsHabilidadesComunicacion = idx['Obs_Habilidades_Comunicacion'] !== undefined ? String(row[idx['Obs_Habilidades_Comunicacion']] || '') : '';
    alumnoxId[aid].obsHabilidadesSociales   = idx['Obs_Habilidades_Sociales']   !== undefined ? String(row[idx['Obs_Habilidades_Sociales']]   || '') : '';
    alumnoxId[aid].obsConvivenciaAutogestion = idx['Obs_Convivencia_Autogestion'] !== undefined ? String(row[idx['Obs_Convivencia_Autogestion']] || '') : '';
    alumnoxId[aid].obsAutonomiaIndependencia = idx['Obs_Autonomia_Independencia'] !== undefined ? String(row[idx['Obs_Autonomia_Independencia']] || '') : '';
    alumnoxId[aid].obsResolucionConflictos  = idx['Obs_Resolucion_Conflictos']  !== undefined ? String(row[idx['Obs_Resolucion_Conflictos']]  || '') : '';
    alumnoxId[aid].obsMotricidadGruesaFina  = idx['Obs_Motricidad_Gruesa_Fina']  !== undefined ? String(row[idx['Obs_Motricidad_Gruesa_Fina']]  || '') : '';
    alumnoxId[aid].obsCoordinacionEquilibrio = idx['Obs_Coordinacion_Equilibrio'] !== undefined ? String(row[idx['Obs_Coordinacion_Equilibrio']] || '') : '';
    // 3 semáforos por dimensión + semáforo agregado
    if (idx['Semaforo_Cognitivo']      !== undefined) alumnoxId[aid].semaforoCognitivo      = String(row[idx['Semaforo_Cognitivo']]      || '');
    if (idx['Semaforo_Socioemocional'] !== undefined) alumnoxId[aid].semaforoSocioemocional = String(row[idx['Semaforo_Socioemocional']] || '');
    if (idx['Semaforo_Fisico']         !== undefined) alumnoxId[aid].semaforoFisico         = String(row[idx['Semaforo_Fisico']]         || '');
    if (idx['Semaforo_Agregado']       !== undefined) alumnoxId[aid].semaforoAgregado       = String(row[idx['Semaforo_Agregado']]       || '');
    const fr = row[idx['FechaRegistro']];
    if (fr instanceof Date) alumnoxId[aid].fechaRegistro = fr.toISOString();
  }

  const capturas = Object.values(alumnoxId);
  const capturados = capturas.filter(c => c.capturado).length;
  const total = capturas.length;
  return {
    capturas: capturas,
    resumen: {
      totalAlumnos: total,
      capturados: capturados,
      pendientes: total - capturados,
      porcentaje: total ? Math.round((capturados / total) * 100) : 0
    }
  };
}

/**
 * Devuelve cobertura por maestro en un ciclo+mes con filtros opcionales.
 * filtros = { maestroId?, grado?, grupo? }
 * Devuelve { porMaestro: [{maestroId, nombre, totalAlumnos, capturados, porcentaje, indicePromedio, semaforoCounts}], agregados: {...} }
 */
function leerCobertura_(cicloEscolar, mes, filtros) {
  filtros = filtros || {};
  const alumnos = leerFilas('ALUMNOS').filas
    .filter(a => String(a.NombreCompleto || '').trim() !== 'Por definir')
    .filter(a => !filtros.maestroId || String(a.MaestroID || '').trim() === filtros.maestroId)
    .filter(a => !filtros.grado || String(a.Grado || '').trim() === filtros.grado)
    .filter(a => !filtros.grupo || String(a.Grupo || '').trim() === filtros.grupo);

  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();
  const evPorAlumno = {};
  if (data.length > 1) {
    const headers = data[0].map(h => String(h).trim());
    const idx = {};
    headers.forEach((h, i) => { idx[h] = i; });
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (normalizarCicloEscolar_(row[idx['CicloEscolar']]) !== cicloEscolar) continue;
      if (String(row[idx['Mes']] || '').trim() !== mes) continue;
      const aid = limpiarTextoId_(String(row[idx['AlumnoID']] || '').trim());
      evPorAlumno[aid] = {
        indice: Number(row[idx['Indice_Desempeno']]) || 0,
        semaforo: String(row[idx['Semaforo']] || '')
      };
    }
  }

  // Agrupa por maestro
  const porMaestro = {};
  const cfg = leerConfig();
  const nombresMaestros = {};
  (cfg['Maestro'] || []).forEach(m => { nombresMaestros[m.valorId] = m.descripcion; });

  alumnos.forEach(a => {
    const mid = String(a.MaestroID || '').trim() || '_SIN_ASIGNAR';
    if (!porMaestro[mid]) {
      porMaestro[mid] = {
        maestroId: mid,
        nombre: nombresMaestros[mid] || mid,
        totalAlumnos: 0,
        capturados: 0,
        sumaIndices: 0,
        conIndice: 0,
        semaforoCounts: { Verde: 0, Amarillo: 0, Rojo: 0 }
      };
    }
    porMaestro[mid].totalAlumnos += 1;
    const aid = String(a.AlumnoID).trim();
    const ev = evPorAlumno[aid];
    if (ev) {
      porMaestro[mid].capturados += 1;
      porMaestro[mid].sumaIndices += ev.indice;
      porMaestro[mid].conIndice += 1;
      const s = ev.semaforo;
      if (s === 'Verde' || s === 'Amarillo' || s === 'Rojo') porMaestro[mid].semaforoCounts[s] += 1;
    }
  });

  const lista = Object.values(porMaestro).map(m => ({
    maestroId: m.maestroId,
    nombre: m.nombre,
    totalAlumnos: m.totalAlumnos,
    capturados: m.capturados,
    pendientes: m.totalAlumnos - m.capturados,
    porcentaje: m.totalAlumnos ? Math.round((m.capturados / m.totalAlumnos) * 100) : 0,
    indicePromedio: m.conIndice ? Math.round((m.sumaIndices / m.conIndice) * 100) / 100 : null,
    semaforoCounts: m.semaforoCounts
  })).sort((a, b) => a.maestroId.localeCompare(b.maestroId));

  // Agregados globales
  const totales = lista.reduce((acc, m) => {
    acc.totalAlumnos += m.totalAlumnos;
    acc.capturados += m.capturados;
    acc.verde += m.semaforoCounts.Verde;
    acc.amarillo += m.semaforoCounts.Amarillo;
    acc.rojo += m.semaforoCounts.Rojo;
    return acc;
  }, { totalAlumnos: 0, capturados: 0, verde: 0, amarillo: 0, rojo: 0 });

  const agregados = {
    totalAlumnos: totales.totalAlumnos,
    capturados: totales.capturados,
    pendientes: totales.totalAlumnos - totales.capturados,
    porcentaje: totales.totalAlumnos ? Math.round((totales.capturados / totales.totalAlumnos) * 100) : 0,
    semaforoCounts: { Verde: totales.verde, Amarillo: totales.amarillo, Rojo: totales.rojo },
    maestrosActivos: lista.filter(m => m.capturados > 0).length,
    totalMaestros: lista.length
  };

  return { porMaestro: lista, agregados: agregados };
}

/**
 * Lee evaluaciones por maestro para analítica (KPIs y series temporales).
 * Devuelve { porMes: [{mes, cicloEscolar, indicePromedio, capturados, totalAlumnos,
 *                       semaforoCounts, semaforoCountsPorDimension, numAlumnosPorDimension,
 *                       coberturaObs}], modo }
 *
 * Cambio 2026-08-20 (preescolar 3-dimensiones):
 *   En modo 'cualitativo' cada porMes trae:
 *     - semaforoCountsPorDimension: { cognitivo: {Verde,Amarillo,Rojo}, socioemocional: {...}, fisico: {...} }
 *     - numAlumnosPorDimension:    { cognitivo: {1,2,3,4}, socioemocional: {...}, fisico: {...} }
 *     - coberturaObs:              { cognitivo: {llenos, vacios, total}, socioemocional: {...}, fisico: {...} }
 *   Compatibilidad: si la hoja aún no tiene las columnas nuevas, devuelve los campos
 *   inicializados a ceros / vacíos para que la UI no rompa.
 *
 * Modos posibles: 'numerico' | 'cualitativo' | 'mixto'.
 */
function leerAnaliticaMaestro_(maestroId) {
  const alumnosMaestro = leerFilas('ALUMNOS').filas
    .filter(a => String(a.MaestroID || '').trim() === maestroId)
    .filter(a => String(a.NombreCompleto || '').trim() !== 'Por definir');
  const totalAlumnos = alumnosMaestro.length;

  // Detectar modo del grupo según los alumnos
  let modo = 'numerico';
  if (totalAlumnos > 0 && alumnosMaestro.every(a => esCualitativo_(a))) {
    modo = 'cualitativo';
  } else if (alumnosMaestro.some(a => esCualitativo_(a)) && alumnosMaestro.some(a => !esCualitativo_(a))) {
    modo = 'mixto';
  }

  // Sub-aspectos por dimensión (para coberturaObs).
  const OBS_POR_DIM_ = {
    cognitivo:      ['obsAprendizaje', 'obsComprension', 'obsMemoria'],
    socioemocional: ['obsHabilidadesComunicacion', 'obsHabilidadesSociales', 'obsConvivenciaAutogestion', 'obsAutonomiaIndependencia', 'obsResolucionConflictos'],
    fisico:         ['obsMotricidadGruesaFina', 'obsCoordinacionEquilibrio']
  };
  const NIVELES_POR_DIM_ = {
    cognitivo:      'desempenoCognitivo',
    socioemocional: 'desempenoSocioemocional',
    fisico:         'desempenoFisico'
  };
  const SEMAFOROS_POR_DIM_ = {
    cognitivo:      'semaforoCognitivo',
    socioemocional: 'semaforoSocioemocional',
    fisico:         'semaforoFisico'
  };

  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();
  const evals = [];
  if (data.length > 1) {
    const headers = data[0].map(h => String(h).trim());
    const idx = {};
    headers.forEach((h, i) => { idx[h] = i; });
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[idx['MaestroID']] || '').trim() !== maestroId) continue;
      const getNivel = (col) => idx[col] !== undefined ? (Number(row[idx[col]]) || 0) : 0;
      const getObs   = (col) => idx[col] !== undefined ? String(row[idx[col]] || '').trim() : '';
      const getSem   = (col) => idx[col] !== undefined ? String(row[idx[col]] || '').trim() : '';
      evals.push({
        cicloEscolar: normalizarCicloEscolar_(row[idx['CicloEscolar']]),
        mes: String(row[idx['Mes']] || '').trim(),
        alumnoId: limpiarTextoId_(String(row[idx['AlumnoID']] || '').trim()),
        indice: Number(row[idx['Indice_Desempeno']]) || 0,
        semaforo: String(row[idx['Semaforo']] || '').trim(),
        calificacion: Number(row[idx['Calificacion_Numerica']]) || 0,
        asistencia: Number(row[idx['Asistencia_Porcentaje']]) || 0,
        tareas: Number(row[idx['Tareas_Entregadas']]) || 0,
        pensamiento: Number(row[idx['Pensamiento_Critico']]) || 0,
        participacion: Number(row[idx['Participacion']]) || 0,
        autogestion: Number(row[idx['Autogestion']]) || 0,
        colaboracion: Number(row[idx['Colaboracion']]) || 0,
        // NUEVO: 3 niveles por dimensión (defensivo)
        desempenoCognitivo:      getNivel('Pensamiento_Cognitivo'),
        desempenoSocioemocional: getNivel('Pensamiento_Socioemocional'),
        desempenoFisico:         getNivel('Pensamiento_Fisico'),
        // NUEVO: 10 observaciones
        obsAprendizaje:              getObs('Obs_Aprendizaje'),
        obsComprension:              getObs('Obs_Comprension'),
        obsMemoria:                  getObs('Obs_Memoria'),
        obsHabilidadesComunicacion:  getObs('Obs_Habilidades_Comunicacion'),
        obsHabilidadesSociales:      getObs('Obs_Habilidades_Sociales'),
        obsConvivenciaAutogestion:   getObs('Obs_Convivencia_Autogestion'),
        obsAutonomiaIndependencia:   getObs('Obs_Autonomia_Independencia'),
        obsResolucionConflictos:     getObs('Obs_Resolucion_Conflictos'),
        obsMotricidadGruesaFina:     getObs('Obs_Motricidad_Gruesa_Fina'),
        obsCoordinacionEquilibrio:   getObs('Obs_Coordinacion_Equilibrio'),
        // NUEVO: 3 semáforos por dimensión
        semaforoCognitivo:      getSem('Semaforo_Cognitivo'),
        semaforoSocioemocional: getSem('Semaforo_Socioemocional'),
        semaforoFisico:         getSem('Semaforo_Fisico')
      });
    }
  }

  // Agrupa por (ciclo, mes)
  const agrupado = {};
  evals.forEach(ev => {
    const k = ev.cicloEscolar + '|' + ev.mes;
    if (!agrupado[k]) {
      agrupado[k] = {
        cicloEscolar: ev.cicloEscolar,
        mes: ev.mes,
        totalEvaluaciones: 0,
        sumaIndices: 0,
        semaforoCounts: { Verde: 0, Amarillo: 0, Rojo: 0 },
        // NUEVO: contadores por dimensión
        semaforoCountsPorDimension: {
          cognitivo:      { Verde: 0, Amarillo: 0, Rojo: 0 },
          socioemocional: { Verde: 0, Amarillo: 0, Rojo: 0 },
          fisico:         { Verde: 0, Amarillo: 0, Rojo: 0 }
        },
        numAlumnosPorDimension: {
          cognitivo:      { 1: 0, 2: 0, 3: 0, 4: 0 },
          socioemocional: { 1: 0, 2: 0, 3: 0, 4: 0 },
          fisico:         { 1: 0, 2: 0, 3: 0, 4: 0 }
        },
        coberturaObs: {
          cognitivo:      { llenos: 0, vacios: 0, total: 0 },
          socioemocional: { llenos: 0, vacios: 0, total: 0 },
          fisico:         { llenos: 0, vacios: 0, total: 0 }
        }
      };
    }
    const g = agrupado[k];
    g.totalEvaluaciones += 1;
    g.sumaIndices += ev.indice;

    // Semáforo agregado (espejo de columna P)
    const s = ev.semaforo;
    if (s === 'Verde' || s === 'Amarillo' || s === 'Rojo') g.semaforoCounts[s] += 1;

    // NUEVO: por dimensión — nivel 1-4, semáforo y cobertura de observaciones
    Object.keys(NIVELES_POR_DIM_).forEach(dim => {
      const nivelKey = NIVELES_POR_DIM_[dim];
      const semKey   = SEMAFOROS_POR_DIM_[dim];
      const nivel = ev[nivelKey];
      if (nivel >= 1 && nivel <= 4) g.numAlumnosPorDimension[dim][nivel] += 1;
      const sd = ev[semKey];
      if (sd === 'Verde' || sd === 'Amarillo' || sd === 'Rojo') g.semaforoCountsPorDimension[dim][sd] += 1;
      // Cobertura: contar textareas con contenido vs total esperado por dimensión
      OBS_POR_DIM_[dim].forEach(obsKey => {
        g.coberturaObs[dim].total += 1;
        if (ev[obsKey] && ev[obsKey].length > 0) {
          g.coberturaObs[dim].llenos += 1;
        } else {
          g.coberturaObs[dim].vacios += 1;
        }
      });
    });
  });

  const porMes = Object.values(agrupado).map(g => {
    const base = {
      cicloEscolar: g.cicloEscolar,
      mes: g.mes,
      capturados: g.totalEvaluaciones,
      totalAlumnos: totalAlumnos,
      porcentaje: totalAlumnos ? Math.round((g.totalEvaluaciones / totalAlumnos) * 100) : 0,
      semaforoCounts: g.semaforoCounts,
      // NUEVO
      semaforoCountsPorDimension: g.semaforoCountsPorDimension,
      numAlumnosPorDimension: g.numAlumnosPorDimension,
      coberturaObs: g.coberturaObs
    };
    // El índice promedio solo aplica en modo numérico (o mixto).
    if (modo === 'cualitativo') {
      base.indicePromedio = null;
    } else {
      base.indicePromedio = g.totalEvaluaciones ? Math.round((g.sumaIndices / g.totalEvaluaciones) * 100) / 100 : null;
    }
    return base;
  }).sort((a, b) => {
    if (a.cicloEscolar !== b.cicloEscolar) return String(a.cicloEscolar).localeCompare(String(b.cicloEscolar));
    return MESES_VALIDOS_LIB_SHEETS_.indexOf(a.mes) - MESES_VALIDOS_LIB_SHEETS_.indexOf(b.mes);
  });

  return {
    porMes: porMes,
    totalAlumnos: totalAlumnos,
    totalEvaluaciones: evals.length,
    modo: modo   // 'numerico' | 'cualitativo' | 'mixto'
  };
}

/**
 * P33 (2026-08-26): cobertura agrupada por (grado, grupo) para el dashboard ADM/DIR.
 * Devuelve { porGrupo: [...], agregados: {...} }.
 *
 * Diferencia con leerCobertura_(): aquella agrupa por maestroId; esta agrupa por
 * (grado, grupo) que es lo que la dirección quiere ver ("estado del ciclo").
 *
 * Cada item de porGrupo trae: grado, grupo, maestroId, maestroNombre,
 *   totalAlumnos, capturados, pendientes, porcentaje, indicePromedio,
 *   semaforoCounts {Verde, Amarillo, Rojo}, modo ('numerico'|'cualitativo').
 *
 * El modo del grupo se infiere del maestro (todos los alumnos comparten
 * cualitativo o numérico). Para M10/M11/M12 (preescolar) es 'cualitativo'.
 */
function leerCoberturaPorGrupo_(cicloEscolar, mes) {
  const alumnosAll = leerFilas('ALUMNOS').filas
    .filter(a => String(a.NombreCompleto || '').trim() !== 'Por definir');

  // Lee evaluaciones del ciclo+mes UNA sola vez
  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();
  const evPorAlumno = {};
  if (data.length > 1) {
    const headers = data[0].map(h => String(h).trim());
    const idx = {};
    headers.forEach((h, i) => { idx[h] = i; });
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (normalizarCicloEscolar_(row[idx['CicloEscolar']]) !== cicloEscolar) continue;
      if (String(row[idx['Mes']] || '').trim() !== mes) continue;
      const aid = limpiarTextoId_(String(row[idx['AlumnoID']] || '').trim());
      evPorAlumno[aid] = {
        indice: Number(row[idx['Indice_Desempeno']]) || 0,
        semaforo: String(row[idx['Semaforo']] || '')
      };
    }
  }

  const cfg = leerConfig();
  const nombresMaestros = {};
  (cfg['Maestro'] || []).forEach(m => { nombresMaestros[m.valorId] = m.descripcion; });

  // Agrupa por (grado, grupo). grado+grupo vacío o null cae en '_SIN_ASIGNAR'.
  const porGrupo = {};
  alumnosAll.forEach(a => {
    const grado = String(a.Grado || '').trim() || '_SIN_GRADO';
    const grupo = String(a.Grupo || '').trim() || 'Unico';
    const key = grado + '||' + grupo;
    if (!porGrupo[key]) {
      porGrupo[key] = {
        grado: grado,
        grupo: grupo,
        maestroId: String(a.MaestroID || '').trim() || '',
        totalAlumnos: 0,
        capturados: 0,
        sumaIndices: 0,
        conIndice: 0,
        semaforoCounts: { Verde: 0, Amarillo: 0, Rojo: 0 }
      };
    }
    porGrupo[key].totalAlumnos += 1;
    const aid = String(a.AlumnoID).trim();
    const ev = evPorAlumno[aid];
    if (ev) {
      porGrupo[key].capturados += 1;
      porGrupo[key].sumaIndices += ev.indice;
      porGrupo[key].conIndice += 1;
      const s = ev.semaforo;
      if (s === 'Verde' || s === 'Amarillo' || s === 'Rojo') porGrupo[key].semaforoCounts[s] += 1;
    }
  });

  const lista = Object.values(porGrupo).map(g => {
    const maestroId = g.maestroId;
    const maestroNombre = nombresMaestros[maestroId] || maestroId || 'Sin asignar';
    const modo = esCualitativo_({ Grado: g.grado }) ? 'cualitativo' : 'numerico';
    return {
      grado: g.grado,
      grupo: g.grupo,
      maestroId: maestroId,
      maestroNombre: maestroNombre,
      totalAlumnos: g.totalAlumnos,
      capturados: g.capturados,
      pendientes: g.totalAlumnos - g.capturados,
      porcentaje: g.totalAlumnos ? Math.round((g.capturados / g.totalAlumnos) * 100) : 0,
      indicePromedio: g.conIndice ? Math.round((g.sumaIndices / g.conIndice) * 100) / 100 : null,
      semaforoCounts: g.semaforoCounts,
      modo: modo
    };
  }).sort((a, b) => {
    // Orden lógico: por grado, luego por grupo
    if (a.grado !== b.grado) return a.grado.localeCompare(b.grado, 'es');
    return a.grupo.localeCompare(b.grupo, 'es');
  });

  const totales = lista.reduce((acc, g) => {
    acc.totalAlumnos += g.totalAlumnos;
    acc.capturados += g.capturados;
    acc.verde += g.semaforoCounts.Verde;
    acc.amarillo += g.semaforoCounts.Amarillo;
    acc.rojo += g.semaforoCounts.Rojo;
    return acc;
  }, { totalAlumnos: 0, capturados: 0, verde: 0, amarillo: 0, rojo: 0 });

  const agregados = {
    totalAlumnos: totales.totalAlumnos,
    capturados: totales.capturados,
    pendientes: totales.totalAlumnos - totales.capturados,
    porcentaje: totales.totalAlumnos ? Math.round((totales.capturados / totales.totalAlumnos) * 100) : 0,
    semaforoCounts: { Verde: totales.verde, Amarillo: totales.amarillo, Rojo: totales.rojo },
    indicePromedio: lista.reduce((s, g) => s + (g.indicePromedio || 0), 0) / lista.filter(g => g.indicePromedio != null).length || null,
    gruposCompletos: lista.filter(g => g.porcentaje === 100 && g.totalAlumnos > 0).length,
    gruposAtrasados: lista.filter(g => g.porcentaje < 50 && g.totalAlumnos > 0).length
  };
  if (agregados.indicePromedio != null) {
    agregados.indicePromedio = Math.round(agregados.indicePromedio * 100) / 100;
  }

  return { porGrupo: lista, agregados: agregados };
}

/**
 * P33 (2026-08-26): drill-down de un grupo para ADM/DIR.
 * Devuelve alumnos del (grado, grupo) con su estado individual del mes.
 *
 *   { alumnos: [{alumnoId, nombre, capturado, semaforo, indice, observaciones, fechaCaptura}],
 *     meta: { grado, grupo, maestroId, maestroNombre, totalAlumnos, capturados, pendientes,
 *             semaforoCounts, indicePromedio, modo } }
 *
 * Filtramos "Por definir" para no contaminar el reporte de dirección.
 */
function leerAlumnosGrupo_(grado, grupo, cicloEscolar, mes) {
  const cfg = leerConfig();
  const nombresMaestros = {};
  (cfg['Maestro'] || []).forEach(m => { nombresMaestros[m.valorId] = m.descripcion; });

  const alumnosGrupo = leerFilas('ALUMNOS').filas
    .filter(a => String(a.NombreCompleto || '').trim() !== 'Por definir')
    .filter(a => String(a.Grado || '').trim() === grado)
    .filter(a => String(a.Grupo || '').trim() === grupo);

  const maestroId = (alumnosGrupo[0] && alumnosGrupo[0].MaestroID) ? String(alumnosGrupo[0].MaestroID).trim() : '';
  const maestroNombre = nombresMaestros[maestroId] || maestroId || 'Sin asignar';
  const modo = esCualitativo_({ Grado: grado }) ? 'cualitativo' : 'numerico';

  // Lee evaluaciones del (ciclo, mes) y agrupa por AlumnoID
  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();
  const evPorAlumno = {};
  if (data.length > 1) {
    const headers = data[0].map(h => String(h).trim());
    const idx = {};
    headers.forEach((h, i) => { idx[h] = i; });
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (normalizarCicloEscolar_(row[idx['CicloEscolar']]) !== cicloEscolar) continue;
      if (String(row[idx['Mes']] || '').trim() !== mes) continue;
      const aid = limpiarTextoId_(String(row[idx['AlumnoID']] || '').trim());
      evPorAlumno[aid] = {
        indice: Number(row[idx['Indice_Desempeno']]) || 0,
        semaforo: String(row[idx['Semaforo']] || ''),
        observaciones: String(row[idx['Observaciones']] || ''),
        fechaCaptura: normalizarCicloEscolar_(row[idx['FechaRegistro']])  // se reusa normalizer (devuelve string ISO o '')
      };
    }
  }

  let capturados = 0, sumaIndices = 0, conIndice = 0;
  const semaforoCounts = { Verde: 0, Amarillo: 0, Rojo: 0 };

  const alumnos = alumnosGrupo.map(a => {
    const aid = String(a.AlumnoID).trim();
    const ev = evPorAlumno[aid];
    const capturado = !!ev;
    if (capturado) {
      capturados += 1;
      if (ev.indice) { sumaIndices += ev.indice; conIndice += 1; }
      if (ev.semaforo === 'Verde' || ev.semaforo === 'Amarillo' || ev.semaforo === 'Rojo') {
        semaforoCounts[ev.semaforo] += 1;
      }
    }
    // Observaciones: primeras 120 chars para preview en la tabla
    let obsPreview = '';
    if (ev && ev.observaciones) {
      obsPreview = ev.observaciones.length > 120 ? ev.observaciones.substring(0, 120) + '…' : ev.observaciones;
    }
    return {
      alumnoId: aid,
      nombre: String(a.NombreCompleto || '').trim(),
      capturado: capturado,
      semaforo: ev ? ev.semaforo : '',
      indice: ev ? (ev.indice || null) : null,
      observaciones: obsPreview,
      fechaCaptura: ev ? ev.fechaCaptura : ''
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const meta = {
    grado: grado,
    grupo: grupo,
    maestroId: maestroId,
    maestroNombre: maestroNombre,
    totalAlumnos: alumnosGrupo.length,
    capturados: capturados,
    pendientes: alumnosGrupo.length - capturados,
    semaforoCounts: semaforoCounts,
    indicePromedio: conIndice ? Math.round((sumaIndices / conIndice) * 100) / 100 : null,
    modo: modo
  };

  return { alumnos: alumnos, meta: meta };
}
