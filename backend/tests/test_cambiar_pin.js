// tests/test_cambiar_pin.js — Tests de cambiarPinPadre_.
//
// Cubre:
//  - Happy path: cambia el hash y el salt, no toca otras filas
//  - AlumnoID inexistente: throws
//  - El PIN viejo deja de funcionar después del cambio

'use strict';

const m = require('./mocks');
const loader = require('./loader');

// ----------------------------------------------------------------------------
// Setup
// ----------------------------------------------------------------------------
function setup() {
  const ss = m.createMockSpreadsheet();
  m.installGlobalMocks({ spreadsheet: ss, verboseLog: false });
  const stubs = loader.makeStubsLibSheets(ss);
  loader.loadPinHashLib(stubs);
  return ss;
}

function teardown() {
  for (const k of [
    'SpreadsheetApp','Utilities','Logger','PropertiesService','Session',
    'agregarAlumnoCompleto_','agregarAccesoPadre_','cambiarPinPadre_',
    'generarHashPin_','forzarTextoId_','limpiarTextoId_','canonicalizarAlumnoId_',
    'getHoja','leerFilas','nombreDeMaestro','hashCredencial','verificarHash','generarSalt',
    'menuAgregarAlumnoCompleto_','menuAgregarAccesoPadre_','menuCambiarPinPadre_',
    'diagnosticarAccesoPadres_','onOpen','__MOCK_SS__'
  ]) global[k] = undefined;
}

function initHojas(ss) {
  ss.setHoja('ACCESOS_PADRES', [
    ['AlumnoID','PINHash','Salt','TutorNombre','TutorEmail','TutorTelefono','Activo','FechaAlta']
  ]);
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------
function test_cambio_pin_exitoso() {
  const ss = setup();
  try {
    initHojas(ss);
    // Crear fila inicial con PIN "1234"
    const inicial = global.generarHashPin_('1234');
    ss.appendFila('ACCESOS_PADRES', ['\'3.10', inicial.hash, inicial.salt, 'Tutor', '', '', 'TRUE', new Date()]);

    // Cambiar PIN a "5678"
    const r = global.cambiarPinPadre_('3.10', '5678');
    m.assertEqual(r.ok, true, 'debe retornar ok=true');
    m.assertEqual(r.alumnoId, '3.10');

    // Verificar que el hash y salt cambiaron
    const matriz = ss.getMatriz('ACCESOS_PADRES');
    const hashNuevo = matriz[1][1];
    const saltNuevo = matriz[1][2];
    m.assertEqual(hashNuevo.length, 64, 'hash nuevo debe ser 64 chars');
    m.assertEqual(saltNuevo.length, 16, 'salt nuevo debe ser 16 chars');
    m.assert(hashNuevo !== inicial.hash, 'hash debe haber cambiado');
    m.assert(saltNuevo !== inicial.salt, 'salt debe haber cambiado');
  } finally { teardown(); }
}

function test_cambio_pin_inexistente_throws() {
  const ss = setup();
  try {
    initHojas(ss);
    m.assertThrows(
      () => global.cambiarPinPadre_('NO.EXISTE', '1234'),
      /no existe en ACCESOS_PADRES/,
      'AlumnoID inexistente debe lanzar'
    );
  } finally { teardown(); }
}

function test_pin_viejo_deja_de_funcionar() {
  // Después de cambiar el PIN, el viejo debe rechazarse.
  // Reconstruimos la lógica de auth (que está en Code.gs) en este test.
  const ss = setup();
  try {
    initHojas(ss);
    const inicial = global.generarHashPin_('1234');
    ss.appendFila('ACCESOS_PADRES', ['\'3.10', inicial.hash, inicial.salt, 'Tutor', '', '', 'TRUE', new Date()]);

    // Cambiar PIN
    global.cambiarPinPadre_('3.10', '5678');

    // Obtener el hash/salt nuevos y verificar
    const matriz = ss.getMatriz('ACCESOS_PADRES');
    const hashNuevo = matriz[1][1];
    const saltNuevo = matriz[1][2];

    // PIN viejo "1234" con el NUEVO salt NO debe coincidir
    const fakeHash1234 = global.hashCredencial('1234', saltNuevo);
    m.assert(fakeHash1234 !== hashNuevo,
      'PIN viejo (1234) con salt nuevo NO debe coincidir (anti-regresión)');

    // PIN nuevo "5678" con el salt nuevo SÍ debe coincidir
    const fakeHash5678 = global.hashCredencial('5678', saltNuevo);
    m.assert(fakeHash5678 === hashNuevo,
      'PIN nuevo (5678) con salt nuevo debe coincidir');
  } finally { teardown(); }
}

function test_cambio_pin_PIN_invalido_throws() {
  const ss = setup();
  try {
    initHojas(ss);
    const inicial = global.generarHashPin_('1234');
    ss.appendFila('ACCESOS_PADRES', ['\'3.10', inicial.hash, inicial.salt, 'Tutor', '', '', 'TRUE', new Date()]);

    m.assertThrows(
      () => global.cambiarPinPadre_('3.10', 'abc'),
      /4-6 digitos/,
      'PIN no numérico debe lanzar'
    );
  } finally { teardown(); }
}

// ----------------------------------------------------------------------------
// Runner
// ----------------------------------------------------------------------------
const tests = [
  ['cambio PIN exitoso actualiza hash y salt',  test_cambio_pin_exitoso],
  ['cambio PIN alumnoId inexistente throws',    test_cambio_pin_inexistente_throws],
  ['PIN viejo deja de funcionar tras cambio',   test_pin_viejo_deja_de_funcionar],
  ['cambio PIN con PIN inválido throws',        test_cambio_pin_PIN_invalido_throws]
];

let passed = 0, failed = 0;
console.log('=== test_cambiar_pin.js ===');
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
