// diagnostico.gs — Funciones para ejecutar manualmente desde el editor.

/**
 * Simula la búsqueda de fila para un alumnoId + mes + ciclo dados.
 * Cambio 2026-08-21: útil para confirmar que canonicalizarAlumnoId_ distingue
 * correctamente 3.1 vs 3.10 antes de hacer una captura real.
 * Ejecutar: simularBusquedaFila("3.10", "Agosto", "2026-07")
 */
function simularBusquedaFila(alumnoId, mes, cicloEscolar) {
  Logger.log('=== SIMULACIÓN DE BÚSQUEDA DE FILA ===');
  Logger.log('alumnoId: "' + alumnoId + '" (tipo=' + typeof alumnoId + ')');
  Logger.log('mes: "' + mes + '"');
  Logger.log('cicloEscolar: "' + cicloEscolar + '"');
  Logger.log('');
  Logger.log('canonicalizar("' + alumnoId + '") = "' + canonicalizarAlumnoId_(alumnoId) + '"');
  Logger.log('');

  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();
  Logger.log('Total filas en EVALUACIONES: ' + (data.length - 1));
  Logger.log('');

  // Mostrar TODAS las filas con el mismo grado (3.x)
  Logger.log('=== Filas con grado 3.x ===');
  for (let i = 1; i < data.length; i++) {
    const raw = data[i][3];
    if (raw === '' || raw == null) continue;
    const idCanon = canonicalizarAlumnoId_(raw);
    if (idCanon.startsWith('03.')) {
      const coincide = (
        idCanon === canonicalizarAlumnoId_(alumnoId) &&
        String(data[i][2] || '').trim() === String(mes).trim() &&
        normalizarCicloEscolar_(data[i][1]) === String(cicloEscolar).trim()
      );
      Logger.log('  ' + (coincide ? '✓ MATCH' : '·       ') +
        ' · Fila ' + (i+1) + ' · raw="' + raw + '" (tipo=' + typeof raw + ')' +
        ' · idCanon=' + idCanon +
        ' · mes=' + data[i][2] + ' · ce=' + normalizarCicloEscolar_(data[i][1]));
    }
  }

  Logger.log('');
  const resultado = buscarFilaEvaluacion(alumnoId, mes, cicloEscolar);
  Logger.log('=== Resultado de buscarFilaEvaluacion ===');
  if (resultado === null) {
    Logger.log('→ null (no existe fila para este alumno/mes/ciclo)');
    Logger.log('→ upsertEvaluacion hará appendRow (insertar nueva fila)');
  } else {
    Logger.log('→ fila ' + resultado + ' (sÍ existe, hará update en su lugar)');
  }
}

/**
 * Simulación con valores HARDCODED para 3.10/M03/Agosto (no requiere parámetros).
 * Ejecutar: simularBusqueda310()
 */
function simularBusqueda310() {
  return simularBusquedaFila("3.10", "Agosto", "2026-07");
}

/**
 * Limpia duplicados en EVALUACIONES dejando solo la fila MÁS ANTIGUA
 * (índice menor) por cada (idCanon + mes + cicloEscolar).
 * Cambio 2026-08-21: corrige la duplicación de 3.1 vs 3.10 que ocurrió
 * antes de cargar el fix canonicalizarAlumnoId_.
 * Ejecutar: limpiarDuplicadosEvaluaciones()
 */
function limpiarDuplicadosEvaluaciones() {
  Logger.log('=== LIMPIEZA DE DUPLICADOS EN EVALUACIONES ===');
  Logger.log('Fecha: ' + new Date().toISOString());
  Logger.log('');

  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();

  // Mapa: "idCanon|mes|cicloEscolar" -> [filas (1-based)]
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const raw = data[i][3];
    if (raw === '' || raw == null) continue;
    const idCanon = canonicalizarAlumnoId_(raw);
    const mes = String(data[i][2] || '').trim();
    const ce = normalizarCicloEscolar_(data[i][1]);
    const k = idCanon + '|' + mes + '|' + ce;
    if (!map[k]) map[k] = [];
    map[k].push(i + 1); // 1-based
  }

  // Detectar grupos con duplicados y elegir la fila MÁS ANTIGUA como la "buena"
  const filasAEliminar = []; // ordenadas de mayor a menor para no romper índices
  let gruposDuplicados = 0;
  Object.keys(map).forEach(k => {
    const filas = map[k];
    if (filas.length > 1) {
      gruposDuplicados++;
      // Conservar la de menor fila (la más antigua); las demás son duplicados
      const conservar = filas[0];
      const eliminar = filas.slice(1);
      Logger.log('  Grupo "' + k + '": conservar fila ' + conservar + ', eliminar filas ' + eliminar.join(', '));
      filasAEliminar.push(...eliminar);
    }
  });

  if (filasAEliminar.length === 0) {
    Logger.log('✓ No hay duplicados. Limpieza innecesaria.');
    return { ok: true, eliminadas: 0 };
  }

  Logger.log('');
  Logger.log('Total grupos con duplicados: ' + gruposDuplicados);
  Logger.log('Total filas a eliminar: ' + filasAEliminar.length);

  // Eliminar en orden DESCENDENTE para no desfasar índices
  filasAEliminar.sort((a, b) => b - a);
  filasAEliminar.forEach(fila => {
    Logger.log('  Eliminando fila ' + fila + '...');
    sh.deleteRow(fila);
  });

  Logger.log('');
  Logger.log('✅ Limpieza completa. Filas eliminadas: ' + filasAEliminar.length);
  return { ok: true, eliminadas: filasAEliminar.length };
}
//
// Cada función es invocable: seleccionas y das Run. Imprime logs con formato claro.

/**
 * Verifica que el fix canonicalizarAlumnoId_ está cargado en este deploy.
 * Cambio 2026-08-21: sirve para confirmar que Apps Script tomó el código nuevo
 * (a veces hay caché entre deploys).
 * Ejecutar: verificarFixCanonicalizar()
 */
function verificarFixCanonicalizar() {
  Logger.log('=== VERIFICACIÓN DEL FIX canonicalizarAlumnoId_ ===');
  Logger.log('');

  if (typeof canonicalizarAlumnoId_ !== 'function') {
    Logger.log('❌ La función canonicalizarAlumnoId_ NO está definida.');
    Logger.log('   El fix NO está cargado. Pega lib_sheets_PEGAR.gs de nuevo y haz deploy.');
    return false;
  }
  Logger.log('✓ Función canonicalizarAlumnoId_ SÍ está definida.');

  // Pruebas de regresión
  const casos = [
    { input: '3.1',  esperado: '03.01' },
    { input: '3.10', esperado: '03.10' },
    { input: '1.5',  esperado: '01.05' },
    { input: '10.3', esperado: '10.03' },
    { input: 'M01',  esperado: 'M01' },
    { input: 3.1,    esperado: '03.01' },
    { input: 3.10,   esperado: '03.10' }
  ];
  Logger.log('');
  Logger.log('=== Pruebas de canonicalización ===');
  let todosOk = true;
  casos.forEach(c => {
    const got = canonicalizarAlumnoId_(c.input);
    const ok = got === c.esperado;
    if (!ok) todosOk = false;
    Logger.log('  ' + (ok ? '✓' : '✗') + ' canonicalizar("' + c.input + '") = "' + got + '" (esperado "' + c.esperado + '")');
  });

  Logger.log('');
  // Distinguir 3.1 vs 3.10
  const a = canonicalizarAlumnoId_('3.1');
  const b = canonicalizarAlumnoId_('3.10');
  if (a !== b) {
    Logger.log('✓ canonicalizar("3.1") = "' + a + '" ≠ canonicalizar("3.10") = "' + b + '" — NO colisionan');
  } else {
    Logger.log('❌ canonicalizar("3.1") === canonicalizar("3.10") — SIGUEN COLISIONANDO');
    todosOk = false;
  }

  Logger.log('');
  Logger.log(todosOk ? '✅ Fix cargado correctamente.' : '❌ Fix con problemas.');
  return todosOk;
}

/**
 * Diagnóstico de colisión de IDs en EVALUACIONES.
 * Cambio 2026-08-21: detecta si IDs como 3.1 y 3.10 colisionan en la hoja.
 * Ejecutar: diagnosticoColisionIDs()
 */
function diagnosticoColisionIDs() {
  Logger.log('=== DIAGNÓSTICO COLISIÓN DE IDs (3.1 vs 3.10) ===');
  Logger.log('Fecha: ' + new Date().toISOString());
  Logger.log('');

  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();

  // Mapa: idCanon -> [{fila, raw, tipo}]
  const map = {};
  let colisionesEncontradas = 0;

  for (let i = 1; i < data.length; i++) {
    const raw = data[i][3];
    if (raw === '' || raw == null) continue;
    const tipo = typeof raw;
    const rawLimpio = limpiarTextoId_(String(raw));
    const idCanon = canonicalizarAlumnoId_(rawLimpio);
    if (!map[idCanon]) map[idCanon] = [];
    map[idCanon].push({
      fila: i + 1,
      raw: String(raw),
      rawLimpio: rawLimpio,
      tipo: tipo,
      mes: String(data[i][2] || '').trim(),
      maestro: String(data[i][4] || '').trim()
    });
  }

  // Detectar colisiones: 2+ filas con mismo idCanon
  Logger.log('=== Búsqueda de colisiones (mismo idCanon en varias filas) ===');
  Object.keys(map).forEach(idCanon => {
    if (map[idCanon].length > 1) {
      colisionesEncontradas++;
      Logger.log('⚠ COLISIÓN en idCanon="' + idCanon + '":');
      map[idCanon].forEach(entry => {
        Logger.log('   Fila ' + entry.fila + ': raw="' + entry.raw + '" (tipo=' + entry.tipo + ', limpio="' + entry.rawLimpio + '") · ' + entry.mes + ' · ' + entry.maestro);
      });
    }
  });

  if (colisionesEncontradas === 0) {
    Logger.log('✓ No se detectaron colisiones por idCanon.');
  }
  Logger.log('');

  // Mostrar TODOS los IDs únicos de M03/Agosto (ordenados por idCanon)
  Logger.log('=== IDs únicos en EVALUACIONES (ordenados) ===');
  const idsUnicos = Object.keys(map).sort();
  idsUnicos.forEach(idCanon => {
    map[idCanon].forEach(entry => {
      const flag = map[idCanon].length > 1 ? '⚠' : '·';
      Logger.log('  ' + flag + ' Fila ' + String(entry.fila).padStart(4) + ' · idCanon=' + idCanon.padEnd(8) + ' · raw="' + entry.raw + '" (tipo=' + entry.tipo + ') · ' + entry.mes);
    });
  });

  Logger.log('');
  Logger.log('=== Total colisiones: ' + colisionesEncontradas + ' ===');
  Logger.log('=== IDs únicos totales: ' + idsUnicos.length + ' ===');
}

/**
 * Diagnóstico específico para M03/Agosto/2026-07.
 * Cambio 2026-08-21: detecta si la columna B (CicloEscolar) quedó como Date.
 * Ejecutar: diagnosticoCapturasM03()
 */
function diagnosticoCapturasM03() {
  Logger.log('=== DIAGNÓSTICO CAPTURAS M03 / Agosto / 2026-07 ===');
  Logger.log('Fecha: ' + new Date().toISOString());
  Logger.log('');

  const sh = getHoja('EVALUACIONES');
  const data = sh.getDataRange().getValues();
  Logger.log('Total filas en EVALUACIONES: ' + (data.length - 1));
  Logger.log('Headers: ' + data[0].slice(0, 5).join(' | '));
  Logger.log('');

  let total = 0, conDate = 0, conTexto = 0, conVacio = 0;
  Logger.log('=== Tipos de la columna B (CicloEscolar) ===');
  for (let i = 1; i < data.length; i++) {
    const ce = data[i][1];
    const mid = String(data[i][4] || '').trim();
    const mes = String(data[i][2] || '').trim();
    if (ce instanceof Date) {
      conDate++;
      if (mid === 'M03' && mes === 'Agosto') {
        Logger.log('  ⚠ Fila ' + (i+1) + ' [M03/Agosto]: B es Date = ' + ce.toISOString());
      }
    } else if (ce === '' || ce == null) {
      conVacio++;
    } else {
      conTexto++;
      if (mid === 'M03' && mes === 'Agosto') {
        Logger.log('  ✓ Fila ' + (i+1) + ' [M03/Agosto]: B es texto = "' + ce + '"');
      }
    }
    total++;
  }
  Logger.log('');
  Logger.log('=== Resumen ===');
  Logger.log('Total: ' + total);
  Logger.log('Tipo Date: ' + conDate + (conDate > 0 ? ' ⚠️ PROBLEMA' : ' ✓'));
  Logger.log('Tipo texto: ' + conTexto);
  Logger.log('Vacías: ' + conVacio);

  // Ahora simular la búsqueda de fila existente para M03 con un alumno real
  Logger.log('');
  Logger.log('=== Prueba de búsqueda de fila (simulación) ===');
  const ejAlumno = data.slice(1).find(r => String(r[4]).trim() === 'M03' && String(r[2]).trim() === 'Agosto');
  if (ejAlumno) {
    const ce = ejAlumno[1];
    Logger.log('AlumnoID: ' + ejAlumno[3]);
    Logger.log('CicloEscolar raw: ' + ce + ' (tipo: ' + typeof ce + (ce instanceof Date ? ', Date' : '') + ')');
    Logger.log('String(ce).trim(): "' + String(ce).trim() + '"');
    Logger.log('Comparado con "2026-07": ' + (String(ce).trim() === '2026-07' ? '✓ MATCH' : '✗ NO MATCH'));
    Logger.log('Después de normalizar: "' + normalizarCicloEscolar_(ce) + '"');
    Logger.log('Comparado normalizado con "2026-07": ' + (normalizarCicloEscolar_(ce) === '2026-07' ? '✓ MATCH' : '✗ NO MATCH'));
  } else {
    Logger.log('No hay capturas de M03 en Agosto todavía.');
  }
}

/**
 * Diagnóstico completo. Imprime el estado de cada hoja y valida headers.
 * Ejecutar: diagnosticoSheets()
 */
function diagnosticoSheets() {
  Logger.log('=== DIAGNÓSTICO WILHELM WUNDT V2 ===');
  Logger.log('Fecha: ' + new Date().toISOString());
  Logger.log('');

  let todosOk = true;

  Object.keys(SHEETS).forEach(key => {
    const def = SHEETS[key];
    try {
      const sh = getSS_().getSheetByName(def.nombre);
      if (!sh) {
        Logger.log('✗ ' + def.nombre.padEnd(20) + ' NO EXISTE');
        todosOk = false;
        return;
      }
      const ultimaFila = sh.getLastRow();
      const filas = Math.max(0, ultimaFila - 1);
      const headersOk = validarHeaders(def.nombre, def.headers);
      const status = headersOk.ok ? '✓' : '⚠';
      Logger.log(status + ' ' + def.nombre.padEnd(20) + ' ' + filas + ' filas | headers ' + (headersOk.ok ? 'OK' : 'con problemas'));
      if (!headersOk.ok) {
        headersOk.faltantes.forEach(f => {
          Logger.log('    Header en col ' + f.pos + ': esperaba "' + f.esperado + '", encontré "' + f.actual + '"');
        });
        todosOk = false;
      }
    } catch (e) {
      Logger.log('✗ ' + def.nombre.padEnd(20) + ' ERROR: ' + e.message);
      todosOk = false;
    }
  });

  Logger.log('');
  Logger.log('=== Resumen ===');
  Logger.log('Maestros en CONFIG: ' + ((leerConfig().Maestro || []).length));
  Logger.log('Alumnos cargados: ' + (leerFilas('ALUMNOS').filas.length));
  Logger.log('Evaluaciones registradas: ' + (Math.max(0, getHoja('EVALUACIONES').getLastRow() - 1)));
  Logger.log('Logs acumulados: ' + (Math.max(0, getHoja('BACKUP_LOGS').getLastRow() - 1)));
  Logger.log('');
  Logger.log(todosOk ? '✅ Sistema listo para producción.' : '❌ Hay problemas. Revisa lo de arriba.');

  return { ok: todosOk };
}

/**
 * Crea la hoja MAESTROS_AUTH con 9 filas seed (M01-M09) y genera passwords temporales.
 * Ejecutar UNA VEZ al inicio. Anota los passwords impresos.
 *
 * Ejecutar: crearMaestrosAuth()
 */
function crearMaestrosAuth() {
  Logger.log('=== CREAR MAESTROS_AUTH ===');
  const creds = altaMaestrosSeed();
  Logger.log('Credenciales generadas (entregar a cada maestro por canal seguro):');
  Logger.log('');
  Object.keys(creds).forEach(id => {
    Logger.log('  ' + id + '  →  ' + creds[id]);
  });
  Logger.log('');
  Logger.log('✅ MAESTROS_AUTH lista.');
  return creds;
}

/**
 * Diagnóstico rápido del Sheets: cuentas y cabeceras.
 * Útil para pegar en issues o soporte.
 */
function diagnosticoRapido() {
  const cfg = leerConfig();
  Logger.log('CONFIG:');
  Object.keys(cfg).forEach(tipo => {
    Logger.log('  ' + tipo + ': ' + cfg[tipo].length + ' entradas');
  });
  const alumnos = leerFilas('ALUMNOS').filas;
  Logger.log('ALUMNOS: ' + alumnos.length);
  Logger.log('  Por definir: ' + alumnos.filter(a => String(a.NombreCompleto || '').trim() === 'Por definir').length);
  Logger.log('  Con nombre:   ' + alumnos.filter(a => String(a.NombreCompleto || '').trim() !== 'Por definir').length);
  try {
    Logger.log('EVALUACIONES: ' + Math.max(0, getHoja('EVALUACIONES').getLastRow() - 1));
  } catch (e) {
    Logger.log('EVALUACIONES: no existe aún');
  }
}

/**
 * Da de alta el acceso de un padre para un alumnoId. Devuelve PIN aleatorio.
 *
 * Ejecutar: altaAccesoPadre_("2.5", "Sra. Hernandez")
 * (definida en lib_auth.gs)
 */

/**
 * Test de la fórmula del índice activa en CONFIG.
 * Lee FORMULA_INDICE de CONFIG y aplica esa fórmula a 3 casos.
 * Si CONFIG no tiene fila, usa v1 (default histórica 50/20/15/15).
 * Si CONFIG tiene VALOR_ID desconocido, fallback a v1 y muestra warning.
 *
 * Cambio 2026-08-22: las fórmulas ahora son pre-definidas (ver FORMULAS_INDICE_
 * en lib_calculos.gs), no se parsean desde texto.
 *
 * Ejecutar: probarFormulaIndice()
 *
 * Esperado con v1 (default 50/20/15/15):
 *   perfecto → indice=10.0, semaforo=Verde
 *   promedio → indice=~7.5, semaforo=Verde (borde)
 *   crítico  → indice=~3.4, semaforo=Rojo
 *
 * Esperado con v2 (balanceada 35/25/15/25):
 *   perfecto → indice=10.0, semaforo=Verde
 *   promedio → indice=~6.92, semaforo=Amarillo
 *   crítico  → indice=~3.55, semaforo=Rojo
 */
function probarFormulaIndice() {
  const casos = [
    { nombre: 'Caso perfecto', ev: { calificacion: 10, asistencia: 100, tareas: 15, pensamiento: 4, participacion: 4, autogestion: 4, colaboracion: 4 } },
    { nombre: 'Caso promedio', ev: { calificacion: 7, asistencia: 80, tareas: 8, pensamiento: 3, participacion: 3, autogestion: 3, colaboracion: 3 } },
    { nombre: 'Caso crítico', ev: { calificacion: 5, asistencia: 60, tareas: 3, pensamiento: 1, participacion: 1, autogestion: 2, colaboracion: 2 } }
  ];
  casos.forEach(c => {
    const r = calcularIndice(c.ev);
    Logger.log(c.nombre + ' → indice=' + r.indice + ', semaforo=' + r.semaforo + ', riesgo=' + r.riesgo);
  });
}