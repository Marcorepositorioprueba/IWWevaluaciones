// Code.gs — Router principal del backend Wilhelm Wundt v2.
//
// Punto de entrada:
//   doGet(e)  → health check y diagnóstico protegido
//   doPost(e) → router por action (5 acciones)
//
// Cada request logea a BACKUP_LOGS. Errores se devuelven con {ok:false, error}.
//
// CORS: Apps Script sirve con ContentService. Para que el frontend en otro
// dominio pueda llamar sin preflight, el frontend envía Content-Type:
// text/plain;charset=utf-8. Apps Script responde con JSON sin headers CORS
// restrictivos (es público en Web App).

// =========================================
// GET — health check y diagnóstico
// =========================================

function doGet(e) {
  const accion = (e && e.parameter && e.parameter.accion) || 'health';
  try {
    if (accion === 'health') {
      return json_({ status: 'ok', version: '2.0', servidor: 'wundt' });
    }

    if (accion === 'diagnostico') {
      const tokenRecibido = String((e && e.parameter && e.parameter.adminToken) || '');
      const tokenEsperado = PropertiesService.getScriptProperties().getProperty('WUNDT_ADMIN_TOKEN');
      if (!tokenEsperado) return json_({ ok: false, error: 'WUNDT_ADMIN_TOKEN no configurado' }, 500);
      if (tokenRecibido !== tokenEsperado) return json_({ ok: false, error: 'Admin token inválido' }, 401);

      const hojas = {};
      Object.keys(SHEETS).forEach(key => {
        const def = SHEETS[key];
        try {
          const sh = getSS_().getSheetByName(def.nombre);
          if (!sh) {
            hojas[key] = { existe: false, filas: 0, headersOk: false };
          } else {
            const filas = Math.max(0, sh.getLastRow() - 1);
            const headersOk = validarHeaders(def.nombre, def.headers).ok;
            hojas[key] = { existe: true, filas: filas, headersOk: headersOk };
          }
        } catch (err) {
          hojas[key] = { existe: false, error: err.message };
        }
      });
      return json_({ ok: true, hojas: hojas });
    }

    return json_({ ok: false, error: 'Acción GET desconocida: ' + accion }, 400);
  } catch (err) {
    registrarError('GET ' + accion, err);
    return json_({ ok: false, error: err.message }, 500);
  }
}

// =========================================
// POST — router de acciones
// =========================================

function doPost(e) {
  let body = {};
  let rawPayload = '';
  try {
    // El frontend envía text/plain, así que e.postData.contents viene como string JSON.
    rawPayload = (e && e.postData && e.postData.contents) || '{}';
    body = JSON.parse(rawPayload);
  } catch (parseErr) {
    registrarError('POST (parse)', parseErr);
    return json_({ ok: false, error: 'JSON inválido en el body' }, 400);
  }

  const accion = String(body.action || '').trim();

  try {
    let resp;
    switch (accion) {
      case 'auth_maestro':       resp = accionAuthMaestro_(body); break;
      case 'auth_padre':         resp = accionAuthPadre_(body); break;
      case 'get_alumnos':        resp = accionGetAlumnos_(body); break;
      case 'get_estado_capturas':resp = accionGetEstadoCapturas_(body); break;
      case 'save_evaluaciones':  resp = accionSaveEvaluaciones_(body); break;
      case 'get_historial_padre':resp = accionGetHistorialPadre_(body); break;
      case 'get_cobertura':      resp = accionGetCobertura_(body); break;
      case 'get_analitica_docente': resp = accionGetAnaliticaDocente_(body); break;
      case 'get_cobertura_por_grupo': resp = accionGetCoberturaPorGrupo_(body); break;
      case 'get_alumnos_grupo':  resp = accionGetAlumnosGrupo_(body); break;
      default:
        return json_({ ok: false, error: 'Acción POST desconocida: ' + (accion || '(vacía)') }, 400);
    }
    registrarOperacion(rawPayload, 'OK ' + accion);
    return json_(resp);
  } catch (err) {
    registrarError(rawPayload + ' | accion=' + accion, err);
    return json_({ ok: false, error: err.message, errorCode: 'SHEETS_ERROR' }, 500);
  }
}

// =========================================
// Acciones individuales
// =========================================

function accionAuthMaestro_(body) {
  const v = validarAuthMaestro(body);
  if (!v.ok) return { ok: false, error: v.errores.map(e => e.campo + ': ' + e.msg).join('; '), errorCode: 'VALIDACION' };

  // Verifica que el maestro exista en CONFIG
  const nombreConfig = nombreDeMaestro(v.datos.maestroId);
  if (!nombreConfig) return { ok: false, error: 'Maestro no encontrado', errorCode: 'AUTH_FAILED' };

  // Verifica credenciales
  const filas = leerFilas('MAESTROS_AUTH').filas;
  const registro = filas.find(r => String(r.MaestroID || '').trim() === v.datos.maestroId);
  if (!registro) return { ok: false, error: 'Maestro sin credenciales. Ejecuta crearMaestrosAuth() en el editor.', errorCode: 'AUTH_FAILED' };
  if (registro.Activo === false || registro.Activo === 'FALSE' || registro.Activo === 'false') {
    return { ok: false, error: 'Cuenta desactivada', errorCode: 'AUTH_DISABLED' };
  }
  const ok = verificarHash(v.datos.password, String(registro.Salt || ''), String(registro.PasswordHash || ''));
  if (!ok) return { ok: false, error: 'Credenciales inválidas', errorCode: 'AUTH_FAILED' };

  // Lee último acceso (antes de actualizarlo) para devolverlo al cliente
  const sh = getHoja('MAESTROS_AUTH');
  const data = sh.getDataRange().getValues();
  let ultimoAcceso = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === v.datos.maestroId) {
      const vUltimo = data[i][4];
      if (vUltimo instanceof Date) ultimoAcceso = vUltimo.toISOString();
      else if (vUltimo) ultimoAcceso = String(vUltimo);
      sh.getRange(i + 1, 5).setValue(new Date());
      break;
    }
  }

  // Genera sesión
  const ses = generarSesion('M:' + v.datos.maestroId);
  return {
    ok: true,
    maestroId: v.datos.maestroId,
    nombre: nombreConfig,
    sesionToken: ses.token,
    expiraEn: ses.expiraEn,
    ultimoAcceso: ultimoAcceso
  };
}

function accionAuthPadre_(body) {
  const v = validarAuthPadre(body);
  if (!v.ok) return { ok: false, error: v.errores.map(e => e.campo + ': ' + e.msg).join('; '), errorCode: 'VALIDACION' };

  // Verifica que el alumno exista
  const alumnos = leerFilas('ALUMNOS').filas;
  const alumno = alumnos.find(a => String(a.AlumnoID || '').trim() === v.datos.alumnoId);
  if (!alumno) return { ok: false, error: 'Alumno no encontrado', errorCode: 'AUTH_FAILED' };

  // Busca acceso activo
  const accesos = leerFilas('ACCESOS_PADRES').filas;
  const accesosAlumno = accesos.filter(r => String(r.AlumnoID || '').trim() === v.datos.alumnoId);
  const activo = accesosAlumno.find(r => r.Activo === true || r.Activo === 'TRUE' || r.Activo === 'true');
  if (!activo) return { ok: false, error: 'PIN incorrecto', errorCode: 'AUTH_FAILED' };

  // Verifica PIN
  const ok = verificarHash(v.datos.pin, String(activo.Salt || ''), String(activo.PINHash || ''));
  if (!ok) return { ok: false, error: 'PIN incorrecto', errorCode: 'AUTH_FAILED' };

  const ses = generarSesion('P:' + v.datos.alumnoId);
  return {
    ok: true,
    alumnoId: v.datos.alumnoId,
    nombreAlumno: String(alumno.NombreCompleto || '').trim(),
    sesionToken: ses.token,
    expiraEn: ses.expiraEn
  };
}

function accionGetAlumnos_(body) {
  const v = validarGetAlumnos(body);
  if (!v.ok) return { ok: false, error: v.errores.map(e => e.campo + ': ' + e.msg).join('; '), errorCode: 'VALIDACION' };

  const sesion = validarSesion(v.datos.sesionToken, 'M:' + v.datos.maestroId);
  if (!sesion.ok) return { ok: false, error: sesion.razon, errorCode: 'SESION_INVALIDA' };

  const alumnos = leerFilas('ALUMNOS').filas;
  const filtrados = alumnos
    .filter(a => String(a.MaestroID || '').trim() === v.datos.maestroId)
    .filter(a => String(a.NombreCompleto || '').trim() !== 'Por definir')
    .map(a => ({
      alumnoId: String(a.AlumnoID || '').trim(),
      nombre: String(a.NombreCompleto || '').trim(),
      grupo: String(a.Grupo || '').trim(),
      grado: String(a.Grado || '').trim()
    }));

  return { ok: true, alumnos: filtrados };
}

function accionSaveEvaluaciones_(body) {
  const v = validarSaveEvaluacionesTop(body);
  if (!v.ok) return { ok: false, error: v.errores.map(e => e.campo + ': ' + e.msg).join('; '), errorCode: 'VALIDACION' };

  // Para validar la sesión, primero extraemos el subject del token
  const sesionSinSubject = validarSesion(v.datos.sesionToken);
  if (!sesionSinSubject.ok) return { ok: false, error: sesionSinSubject.razon, errorCode: 'SESION_INVALIDA' };

  // subject tiene forma M:<id>. Si el body trae maestroId, debe coincidir.
  if (v.datos.maestroId && sesionSinSubject.subject !== 'M:' + v.datos.maestroId) {
    return { ok: false, error: 'Sesión no corresponde al maestro', errorCode: 'ACCESO_DENEGADO' };
  }

  const maestroId = sesionSinSubject.subject.replace(/^M:/, '');
  const alumnos = leerFilas('ALUMNOS').filas;
  const alumnoIdsMaestro = new Set(
    alumnos.filter(a => String(a.MaestroID || '').trim() === maestroId).map(a => String(a.AlumnoID || '').trim())
  );

  const registros = [];
  const errores = [];

  // Mapa de alumnos por id (para pasar el objeto completo a validarEvaluacion).
  const alumnosById = {};
  alumnos.forEach(a => { alumnosById[String(a.AlumnoID || '').trim()] = a; });

  v.datos.evaluaciones.forEach(evRaw => {
    // 1) Verifica que el alumno pertenece a este maestro
    const aid = String(evRaw.alumnoId || '').trim();
    if (!alumnoIdsMaestro.has(aid)) {
      errores.push({ alumnoId: aid, campo: 'alumnoId', msg: 'Alumno no pertenece a este maestro' });
      return;
    }
    const alumnoObj = alumnosById[aid];
    const cualitativo = esCualitativo_(alumnoObj);
    // 2) Valida y normaliza (modo cualitativo o numérico, según el grado)
    const val = validarEvaluacion(evRaw, alumnoObj, maestroId, v.datos.cicloEscolar, v.datos.mes);
    if (!val.ok) {
      errores.push({ alumnoId: aid, errores: val.errores });
      return;
    }
    // 3) Calcula índice + semáforo
    let indice, semaforo, riesgo, semaforoCognitivo, semaforoSocioemocional, semaforoFisico, semaforoAgregado;
    if (cualitativo) {
      // Cambio 2026-08-20: 3 semáforos por dimensión (cognitivo/socioemocional/físico)
      // derivados de los 3 niveles. El semáforo agregado es el peor de los 3.
      // Sin Índice numérico.
      indice = 0;
      semaforoCognitivo      = semaforoDeNivel_(val.datos.desempenoCognitivo);
      semaforoSocioemocional = semaforoDeNivel_(val.datos.desempenoSocioemocional);
      semaforoFisico         = semaforoDeNivel_(val.datos.desempenoFisico);
      semaforoAgregado       = peorDeTresSemaforos_(semaforoCognitivo, semaforoSocioemocional, semaforoFisico);
      semaforo = semaforoAgregado; // columna P (legacy) espeja el agregado
      riesgo = riesgoDeSemaforo_(semaforoAgregado);
    } else {
      const calc = calcularIndice(val.datos);
      indice = calc.indice;
      semaforo = calc.semaforo;
      riesgo = calc.riesgo;
      // En numérico los 3 semáforos quedan vacíos (no aplica el desglose por dimensión).
      semaforoCognitivo = semaforoSocioemocional = semaforoFisico = semaforoAgregado = '';
    }
    const evCompleta = Object.assign({}, val.datos, {
      indice: indice,
      semaforo: semaforo,
      riesgo: riesgo,
      semaforoCognitivo: semaforoCognitivo,
      semaforoSocioemocional: semaforoSocioemocional,
      semaforoFisico: semaforoFisico,
      semaforoAgregado: semaforoAgregado,
      // Columna X (24) para control/auditoría humana. Se sobreescribe en cada upsert
      // con el nombre actual del alumno desde ALUMNOS (así si renombras, queda actualizado).
      nombreAlumno: String(alumnoObj && alumnoObj.NombreCompleto || '').trim()
    });
    // 4) Upsert
    try {
      const ups = upsertEvaluacion(evCompleta);
      registros.push({
        alumnoId: aid,
        idRegistro: 'fila ' + ups.fila,
        accion: ups.accion,
        indice: indice,
        semaforo: semaforo,
        riesgo: riesgo
      });
    } catch (e) {
      errores.push({ alumnoId: aid, msg: e.message });
    }
  });

  return {
    ok: true,
    registros: registros,
    errores: errores,
    resumen: {
      total: v.datos.evaluaciones.length,
      exitosos: registros.length,
      fallidos: errores.length
    }
  };
}

function accionGetEstadoCapturas_(body) {
  const v = validarGetEstadoCapturas(body);
  if (!v.ok) return { ok: false, error: v.errores.map(e => e.campo + ': ' + e.msg).join('; '), errorCode: 'VALIDACION' };

  const sesion = validarSesion(v.datos.sesionToken, 'M:' + v.datos.maestroId);
  if (!sesion.ok) return { ok: false, error: sesion.razon, errorCode: 'SESION_INVALIDA' };

  const resultado = leerCapturasMaestro_(v.datos.maestroId, v.datos.cicloEscolar, v.datos.mes);
  return {
    ok: true,
    capturas: resultado.capturas,
    resumen: resultado.resumen
  };
}

function accionGetCobertura_(body) {
  const v = validarGetCobertura(body);
  if (!v.ok) return { ok: false, error: v.errores.map(e => e.campo + ': ' + e.msg).join('; '), errorCode: 'VALIDACION' };

  const sesion = validarSesion(v.datos.sesionToken, 'M:' + v.datos.maestroId);
  if (!sesion.ok) return { ok: false, error: sesion.razon, errorCode: 'SESION_INVALIDA' };

  // Solo ADM/DIR pueden ver cobertura
  if (v.datos.maestroId !== 'ADM' && v.datos.maestroId !== 'DIR') {
    return { ok: false, error: 'Acceso restringido a ADM/DIR', errorCode: 'ACCESO_DENEGADO' };
  }

  const cobertura = leerCobertura_(v.datos.cicloEscolar, v.datos.mes, v.datos.filtros);
  return {
    ok: true,
    cobertura: cobertura
  };
}

/**
 * P33 (2026-08-26): cobertura agrupada por (grado, grupo) para dashboard ADM/DIR.
 * Solo accesible para maestroId ADM o DIR.
 */
function accionGetCoberturaPorGrupo_(body) {
  const v = validarGetCoberturaPorGrupo(body);
  if (!v.ok) return { ok: false, error: v.errores.map(e => e.campo + ': ' + e.msg).join('; '), errorCode: 'VALIDACION' };

  const sesion = validarSesion(v.datos.sesionToken, 'M:' + v.datos.maestroId);
  if (!sesion.ok) return { ok: false, error: sesion.razon, errorCode: 'SESION_INVALIDA' };

  if (!esAdmin_(v.datos.maestroId)) {
    return { ok: false, error: 'Acceso restringido a ADM/DIR', errorCode: 'ACCESO_DENEGADO' };
  }

  const cobertura = leerCoberturaPorGrupo_(v.datos.cicloEscolar, v.datos.mes);
  return {
    ok: true,
    cobertura: cobertura
  };
}

/**
 * P33 (2026-08-26): drill-down de un grupo para ADM/DIR.
 * Solo accesible para maestroId ADM o DIR.
 */
function accionGetAlumnosGrupo_(body) {
  const v = validarGetAlumnosGrupo(body);
  if (!v.ok) return { ok: false, error: v.errores.map(e => e.campo + ': ' + e.msg).join('; '), errorCode: 'VALIDACION' };

  const sesion = validarSesion(v.datos.sesionToken, 'M:' + v.datos.maestroId);
  if (!sesion.ok) return { ok: false, error: sesion.razon, errorCode: 'SESION_INVALIDA' };

  if (!esAdmin_(v.datos.maestroId)) {
    return { ok: false, error: 'Acceso restringido a ADM/DIR', errorCode: 'ACCESO_DENEGADO' };
  }

  const resultado = leerAlumnosGrupo_(v.datos.grado, v.datos.grupo, v.datos.cicloEscolar, v.datos.mes);
  return {
    ok: true,
    alumnos: resultado.alumnos,
    meta: resultado.meta
  };
}

function accionGetAnaliticaDocente_(body) {
  const v = validarGetAnaliticaDocente(body);
  if (!v.ok) return { ok: false, error: v.errores.map(e => e.campo + ': ' + e.msg).join('; '), errorCode: 'VALIDACION' };

  const sesion = validarSesion(v.datos.sesionToken, 'M:' + v.datos.maestroId);
  if (!sesion.ok) return { ok: false, error: sesion.razon, errorCode: 'SESION_INVALIDA' };

  const analitica = leerAnaliticaMaestro_(v.datos.maestroId);
  const catalogos = catalogoAnalitica_(v.datos.maestroId);
  return {
    ok: true,
    analitica: analitica,
    catalogos: catalogos
  };
}

function accionGetHistorialPadre_(body) {
  const v = validarGetHistorialPadre(body);
  if (!v.ok) return { ok: false, error: v.errores.map(e => e.campo + ': ' + e.msg).join('; '), errorCode: 'VALIDACION' };

  const sesion = validarSesion(v.datos.sesionToken, 'P:' + v.datos.alumnoId);
  if (!sesion.ok) return { ok: false, error: sesion.razon, errorCode: 'SESION_INVALIDA' };

  const alumnos = leerFilas('ALUMNOS').filas;
  const alumno = alumnos.find(a => String(a.AlumnoID || '').trim() === v.datos.alumnoId);
  if (!alumno) return { ok: false, error: 'Alumno no encontrado', errorCode: 'NOT_FOUND' };

  const maestroNombre = nombreDeMaestro(String(alumno.MaestroID || '').trim()) || '';
  const historial = leerHistorialAlumno(v.datos.alumnoId);

  // Ordena por ciclo y mes (más reciente primero)
  historial.sort((a, b) => {
    if (a.cicloEscolar !== b.cicloEscolar) return String(b.cicloEscolar).localeCompare(String(a.cicloEscolar));
    return MESES_VALIDOS.indexOf(b.mes) - MESES_VALIDOS.indexOf(a.mes);
  });

  return {
    ok: true,
    alumno: {
      alumnoId: v.datos.alumnoId,
      nombre: String(alumno.NombreCompleto || '').trim(),
      grado: String(alumno.Grado || '').trim(),
      maestroNombre: maestroNombre
    },
    historial: historial
  };
}

// =========================================
// Helpers de respuesta
// =========================================

function json_(obj, statusCode) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

// =========================================
// Migración legacy — preescolar 1 nivel → 3 dimensiones
// (cambio 2026-08-20)
// =========================================
//
// ANTES: preescolar cualitativo tenía 1 nivel 1-4 guardado en Pensamiento_Critico (J).
// AHORA: 3 dimensiones independientes (Y/Z/AA) + 3 semáforos por dimensión (AL/AM/AN)
// + semáforo agregado (AO) que espeja la columna P.
//
// Esta función es one-shot: se ejecuta UNA vez después de extender el header de
// Sheets a 41 columnas y ANTES de publicar el backend nuevo. Es idempotente:
// solo escribe en filas donde Pensamiento_Cognitivo (Y) está vacío.
//
// Para cada fila preescolar:
//   1. Lee Pensamiento_Critico (J)
//   2. Si Pensamiento_Cognitivo (Y) está vacío:
//      - Replica el valor de J a las 3 dimensiones nuevas (asume que el nivel
//        único era cognitivo, valor conservador para mantener semáforo estable)
//      - Calcula los 3 semáforos con semaforoDeNivel_
//      - Calcula el semáforo agregado con peorDeTresSemaforos_
//      - Espeja el agregado en columna P (Semaforo legacy)
//   3. Las 10 observaciones (AB-AK) quedan vacías si lo están.
//
// Uso desde Apps Script: ejecutar `migrarPreescolarADimensiones_v1()` una vez.
// Imprime resumen en Logger; también loguea a BACKUP_LOGS.
//
// IMPORTANTE: requiere que la hoja ya tenga 41 columnas (A-AO).
function migrarPreescolarADimensiones_v1() {
  const sh = getHoja('EVALUACIONES');
  const totalColsHoja = sh.getLastColumn();
  if (totalColsHoja < 41) {
    throw new Error(
      'EVALUACIONES tiene ' + totalColsHoja + ' columnas; se requieren 41 (A-AO). ' +
      'Extiende el header manualmente en Sheets antes de ejecutar la migración.'
    );
  }

  const data = sh.getDataRange().getValues();
  if (data.length <= 1) {
    Logger.log('migrarPreescolarADimensiones_v1: hoja vacía, nada que migrar.');
    return { migradas: 0, omitidas: 0 };
  }

  const headers = data[0].map(h => String(h).trim());
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });

  // Índices esperados
  const I_PENSAMIENTO   = idx['Pensamiento_Critico'];        // J (legacy)
  const I_COG           = idx['Pensamiento_Cognitivo'];      // Y
  const I_SOC           = idx['Pensamiento_Socioemocional']; // Z
  const I_FIS           = idx['Pensamiento_Fisico'];         // AA
  const I_SEM_COG       = idx['Semaforo_Cognitivo'];        // AL
  const I_SEM_SOC       = idx['Semaforo_Socioemocional'];   // AM
  const I_SEM_FIS       = idx['Semaforo_Fisico'];           // AN
  const I_SEM_AGR       = idx['Semaforo_Agregado'];         // AO
  const I_SEM           = idx['Semaforo'];                  // P (legacy)

  if (I_COG === undefined || I_SOC === undefined || I_FIS === undefined) {
    throw new Error('No se encontraron las columnas Pensamiento_Cognitivo/Socioemocional/Fisico (Y/Z/AA). Revisa el header.');
  }

  // Pre-cargar alumnos por id para detectar preescolar
  const alumnos = leerFilas('ALUMNOS').filas;
  const alumnoById = {};
  alumnos.forEach(a => {
    const id = String(a.AlumnoID || '').trim();
    if (id) alumnoById[id] = a;
  });

  let migradas = 0;
  let omitidas = 0;
  const filasActualizadas = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const alumnoId = String(row[idx['AlumnoID']] || '').trim();
    if (!alumnoId) continue;
    const alumno = alumnoById[alumnoId];
    if (!alumno || !esCualitativo_(alumno)) continue;

    // Si Pensamiento_Cognitivo ya tiene valor (migración ya aplicada), saltar.
    const cogActual = row[I_COG];
    if (cogActual !== '' && cogActual !== null && cogActual !== undefined && cogActual !== 0) {
      omitidas += 1;
      continue;
    }

    // Leer nivel legacy (1-4). Si está vacío o inválido, no migrar.
    const nivelLegacy = Number(row[I_PENSAMIENTO]) || 0;
    if (nivelLegacy < 1 || nivelLegacy > 4) {
      omitidas += 1;
      continue;
    }

    // Calcular semáforos por dimensión (los 3 son iguales porque replicamos el nivel)
    const semCog = semaforoDeNivel_(nivelLegacy);
    const semSoc = semaforoDeNivel_(nivelLegacy);
    const semFis = semaforoDeNivel_(nivelLegacy);
    const semAgr = peorDeTresSemaforos_(semCog, semSoc, semFis);

    // Actualizar la fila en memoria y marcar para escritura
    row[I_COG]     = nivelLegacy;
    row[I_SOC]     = nivelLegacy;
    row[I_FIS]     = nivelLegacy;
    row[I_SEM_COG] = semCog;
    row[I_SEM_SOC] = semSoc;
    row[I_SEM_FIS] = semFis;
    row[I_SEM_AGR] = semAgr;
    if (I_SEM !== undefined) row[I_SEM] = semAgr; // espejo legacy

    filasActualizadas.push(i + 1); // +1 porque getRange es 1-based
    migradas += 1;
  }

  // Escribir las filas modificadas en batch (más eficiente que fila por fila)
  if (filasActualizadas.length > 0) {
    filasActualizadas.forEach(fila => {
      sh.getRange(fila, 1, 1, 41).setValues([data[fila - 1]]);
    });
  }

  const resumen = {
    fecha: new Date().toISOString(),
    funcion: 'migrarPreescolarADimensiones_v1',
    totalFilasPreescolares: alumnos.filter(a => esCualitativo_(a)).length,
    migradas: migradas,
    omitidas: omitidas,
    estrategia: 'Replicar Pensamiento_Critico a las 3 dimensiones nuevas (conservador)'
  };
  Logger.log('migrarPreescolarADimensiones_v1: ' + JSON.stringify(resumen));
  logAppend('BACKUP_LOGS', [new Date(), JSON.stringify(resumen), 'OK migracion_preescolar_v1']);
  return resumen;
}
