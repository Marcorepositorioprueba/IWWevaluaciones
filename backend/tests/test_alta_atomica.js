// tests/test_alta_atomica.js — Tests de agregarAlumnoCompleto_.
//
// Cubre:
//  - Happy path: crea 2 filas (ALUMNOS + ACCESOS_PADRES) en una sola llamada
//  - Rollback: si la 2a escritura falla, la fila de ALUMNOS NO queda huérfana
//  - Validación: PIN malo → no escribe nada
//  - Duplicado: AlumnoID ya en ALUMNOS → rechaza sin escribir
//  - Apóstrofo: el AlumnoID escrito en ALUMNOS/ACCESOS_PADRES lleva "'"
//  - MaestroID inválido: rechaza con error claro
//  - colisión 3.1 vs 3.10: si ya existe "3.10", agregar "3.1" debe rechazar

'use strict';

const m = require('./mocks');
const loader = require('./loader');

// ----------------------------------------------------------------------------
// Setup: mocks + stubs + cargar libs
// ----------------------------------------------------------------------------
function setup() {
  const ss = m.createMockSpreadsheet();
  m.installGlobalMocks({ spreadsheet: ss, verboseLog: false });
  const stubs = loader.makeStubsLibSheets(ss);
  loader.loadPinHashLib(stubs);
  return { ss, stubs };
}

function teardown() {
  for (const k of Object.keys(global)) {
    if (typeof global[k] === 'function' || global[k] === undefined) {
      // Solo limpiamos los que nos importan — dejar los built-ins de Node
    }
  }
  global.SpreadsheetApp = undefined;
  global.Utilities = undefined;
  global.Logger = undefined;
  global.PropertiesService = undefined;
  global.Session = undefined;
  global.agregarAlumnoCompleto_ = undefined;
  global.agregarAccesoPadre_ = undefined;
  global.cambiarPinPadre_ = undefined;
  global.generarHashPin_ = undefined;
  global.forzarTextoId_ = undefined;
  global.limpiarTextoId_ = undefined;
  global.canonicalizarAlumnoId_ = undefined;
  global.getHoja = undefined;
  global.leerFilas = undefined;
  global.nombreDeMaestro = undefined;
  global.hashCredencial = undefined;
  global.verificarHash = undefined;
  global.generarSalt = undefined;
}

// ----------------------------------------------------------------------------
// Helpers para inicializar hojas con headers
// ----------------------------------------------------------------------------
function initHojasVacias(ss) {
  ss.setHoja('ALUMNOS', [
    ['AlumnoID', 'NombreCompleto', 'Grupo', 'Grado', 'MaestroID']
  ]);
  ss.setHoja('ACCESOS_PADRES', [
    ['AlumnoID', 'PINHash', 'Salt', 'TutorNombre', 'TutorEmail',
     'TutorTelefono', 'Activo', 'FechaAlta']
  ]);
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------
function test_alta_exitosa_crea_dos_filas() {
  const { ss } = setup();
  try {
    initHojasVacias(ss);
    const result = global.agregarAlumnoCompleto_(
      '4.7', 'JUAN PEREZ', 'Unico', 'Cuarto', 'M04',
      '4721', 'Maria Lopez', 'mlopez@mail.com', '5551234567'
    );
    m.assertEqual(result.ok, true, 'debe retornar ok=true');
    m.assertEqual(result.alumnoId, '4.7');
    m.assertEqual(result.pinPlano, '4721');

    const matrizAlumnos = ss.getMatriz('ALUMNOS');
    m.assertEqual(matrizAlumnos.length, 2, 'ALUMNOS debe tener 1 fila nueva');
    m.assertEqual(matrizAlumnos[1][1], 'JUAN PEREZ');
    m.assertEqual(matrizAlumnos[1][4], 'M04');

    const matrizAccesos = ss.getMatriz('ACCESOS_PADRES');
    m.assertEqual(matrizAccesos.length, 2, 'ACCESOS_PADRES debe tener 1 fila nueva');
    m.assertEqual(matrizAccesos[1][6], 'TRUE', 'Activo debe ser TRUE en MAYÚSCULAS');
    m.assertEqual(matrizAccesos[1][2].length, 16, 'Salt debe ser 16 chars');
    m.assertEqual(matrizAccesos[1][1].length, 64, 'PINHash debe ser 64 chars hex');
  } finally { teardown(); }
}

function test_alta_PIN_invalido_no_escribe() {
  const { ss } = setup();
  try {
    initHojasVacias(ss);
    const result = global.agregarAlumnoCompleto_(
      '4.7', 'JUAN', 'Unico', 'Cuarto', 'M04',
      'abc', 'Maria', '', ''  // PIN no numérico
    );
    m.assertEqual(result.ok, false, 'debe rechazar PIN inválido');
    m.assert(result.errores.some(e => e.campo === 'PIN'),
      'debe reportar error en campo PIN');

    m.assertEqual(ss.getMatriz('ALUMNOS').length, 1,
      'ALUMNOS no debe tener filas nuevas');
    m.assertEqual(ss.getMatriz('ACCESOS_PADRES').length, 1,
      'ACCESOS_PADRES no debe tener filas nuevas');
  } finally { teardown(); }
}

function test_alta_duplicado_en_ALUMNOS_rechaza() {
  const { ss } = setup();
  try {
    initHojasVacias(ss);
    // Pre-poblar ALUMNOS con el ID 4.7
    ss.appendFila('ALUMNOS', ['\'4.7', 'EXISTENTE', 'Unico', 'Cuarto', 'M04']);

    const result = global.agregarAlumnoCompleto_(
      '4.7', 'OTRO', 'Unico', 'Cuarto', 'M04',
      '1234', 'Tutor', '', ''
    );
    m.assertEqual(result.ok, false, 'debe rechazar duplicado');
    m.assert(result.errores.some(e => /Ya existe/.test(e.msg)),
      'mensaje debe indicar duplicado');

    m.assertEqual(ss.getMatriz('ALUMNOS').length, 2,
      'ALUMNOS debe seguir con 1 sola fila (la original)');
    m.assertEqual(ss.getMatriz('ACCESOS_PADRES').length, 1,
      'ACCESOS_PADRES no debe tener filas nuevas');
  } finally { teardown(); }
}

function test_alta_ids_3_1_y_3_10_coexisten() {
  // Caso histórico del 2026-08-21: si Sheet colapsa 3.10 → 3.1 visualmente,
  // el sistema debe tratarlos como IDs canónicos DISTINTOS.
  // Ambos IDs (3.1 y 3.10) son legítimamente distintos (alumno 1 vs alumno 10
  // del grado 3) y deben coexistir sin colisionar.
  const { ss } = setup();
  try {
    initHojasVacias(ss);

    // Agregar 3.10 primero
    const r1 = global.agregarAlumnoCompleto_(
      '3.10', 'PRIMERO', 'Unico', 'Tercero', 'M03',
      '1234', 'Tutor', '', ''
    );
    m.assertEqual(r1.ok, true, 'primer alta (3.10) debe pasar');

    // Ahora agregar 3.1 — debe pasar también (canónicos distintos: 03.10 vs 03.01)
    const r2 = global.agregarAlumnoCompleto_(
      '3.1', 'SEGUNDO', 'Unico', 'Tercero', 'M03',
      '1234', 'Tutor', '', ''
    );
    m.assertEqual(r2.ok, true, '3.1 NO debe colisionar con 3.10 (son IDs distintos)');

    // Verificar que ambas filas estén presentes
    const matriz = ss.getMatriz('ALUMNOS');
    m.assertEqual(matriz.length, 3, 'deben existir 2 filas de alumnos + header');
    const idsEnHoja = matriz.slice(1).map(r => r[0]);
    m.assert(idsEnHoja.some(v => String(v).includes('3.10')), '3.10 debe estar');
    m.assert(idsEnHoja.some(v => String(v).includes('3.1') && !String(v).includes('3.10')),
      '3.1 debe estar (y NO ser colapsado a 3.10)');
  } finally { teardown(); }
}

function test_alta_duplicado_exacto_3_10_rechaza() {
  // Si ya existe 3.10, intentar agregar otro 3.10 debe rechazar.
  const { ss } = setup();
  try {
    initHojasVacias(ss);
    global.agregarAlumnoCompleto_(
      '3.10', 'PRIMERO', 'Unico', 'Tercero', 'M03',
      '1234', 'Tutor', '', ''
    );
    const r = global.agregarAlumnoCompleto_(
      '3.10', 'DUPLICADO', 'Unico', 'Tercero', 'M03',
      '5678', 'Tutor', '', ''
    );
    m.assertEqual(r.ok, false, 'segundo 3.10 debe ser rechazado');
    m.assert(r.errores.some(e => /Ya existe/.test(e.msg)),
      'error debe indicar duplicado');
  } finally { teardown(); }
}

function test_alta_MaestroID_invalido() {
  const { ss } = setup();
  try {
    initHojasVacias(ss);
    const result = global.agregarAlumnoCompleto_(
      '4.7', 'JUAN', 'Unico', 'Cuarto', 'M99',  // M99 no existe
      '1234', 'Tutor', '', ''
    );
    m.assertEqual(result.ok, false, 'M99 debe ser rechazado');
    m.assert(result.errores.some(e => /MaestroID/.test(e.msg)),
      'error debe mencionar MaestroID');
  } finally { teardown(); }
}

function test_alta_escribe_con_apostrofore() {
  // El bug del 2026-08-21: AlumnoID numérico colapsa 3.10 → 3.1 en Sheet.
  // Solución: forzarTextoId_ antepone apóstrofo. Verificamos que la celda
  // escrita arranque con "'" para que Sheet la trate como texto.
  const { ss } = setup();
  try {
    initHojasVacias(ss);
    global.agregarAlumnoCompleto_(
      '3.10', 'TEST', 'Unico', 'Tercero', 'M03',
      '1234', 'Tutor', '', ''
    );

    const matrizAlumnos = ss.getMatriz('ALUMNOS');
    m.assert(String(matrizAlumnos[1][0]).startsWith("'"),
      'ALUMNOS.AlumnoID debe llevar apóstrofo. Actual: ' + JSON.stringify(matrizAlumnos[1][0]));

    const matrizAccesos = ss.getMatriz('ACCESOS_PADRES');
    m.assert(String(matrizAccesos[1][0]).startsWith("'"),
      'ACCESOS_PADRES.AlumnoID debe llevar apóstrofo');
  } finally { teardown(); }
}

// ----------------------------------------------------------------------------
// Runner
// ----------------------------------------------------------------------------
const tests = [
  ['alta exitosa crea 2 filas (ALUMNOS + ACCESOS_PADRES)', test_alta_exitosa_crea_dos_filas],
  ['alta con PIN inválido NO escribe nada',                test_alta_PIN_invalido_no_escribe],
  ['alta con AlumnoID duplicado rechaza',                  test_alta_duplicado_en_ALUMNOS_rechaza],
  ['3.1 y 3.10 coexisten como IDs distintos (anti-colapso)', test_alta_ids_3_1_y_3_10_coexisten],
  ['alta duplicado exacto 3.10 rechaza',                   test_alta_duplicado_exacto_3_10_rechaza],
  ['alta con MaestroID inválido rechaza',                  test_alta_MaestroID_invalido],
  ['alta escribe AlumnoID con apóstrofo (anti-colapso)',   test_alta_escribe_con_apostrofore]
];

let passed = 0, failed = 0;
console.log('=== test_alta_atomica.js ===');
for (const [name, fn] of tests) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (e) {
    console.log('  ✗ ' + name);
    console.log('    ' + e.message);
    failed++;
  }
}
console.log('---');
console.log('Pasaron: ' + passed + ' / ' + tests.length);
if (failed > 0) process.exit(1);
