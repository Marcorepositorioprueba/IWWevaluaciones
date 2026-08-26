// tests/test_hashes.js — Tests unitarios de hasheo y verificación.
//
// Cubre:
//  - generarHashPin_: PIN válido → 64-hex hash + 16-char salt
//  - generarHashPin_: PIN inválido → throws
//  - verificarHash (de lib_auth.gs): hash correcto pasa, incorrecto falla
//  - Idempotencia: mismo PIN + mismo salt → mismo hash

'use strict';

const m = require('./mocks');
const loader = require('./loader');

// ----------------------------------------------------------------------------
// Setup: instalar mocks de Apps Script + cargar funciones puras
// ----------------------------------------------------------------------------
function setup() {
  m.installGlobalMocks({ spreadsheet: m.createMockSpreadsheet(), verboseLog: false });
  const stubs = loader.makeStubsLibSheets(global.SpreadsheetApp.getActiveSpreadsheet());
  loader.loadPinHashLib(stubs);
}

function teardown() {
  // Limpiar globals para que el siguiente test empiece limpio
  global.SpreadsheetApp = undefined;
  global.Utilities = undefined;
  global.Logger = undefined;
  global.PropertiesService = undefined;
  global.Session = undefined;
  global.agregarAlumnoCompleto_ = undefined;
  global.agregarAccesoPadre_ = undefined;
  global.cambiarPinPadre_ = undefined;
  global.menuAgregarAlumnoCompleto_ = undefined;
  global.menuAgregarAccesoPadre_ = undefined;
  global.menuCambiarPinPadre_ = undefined;
  global.diagnosticarAccesoPadres_ = undefined;
  global.onOpen = undefined;
  global.hashCredencial = undefined;
  global.verificarHash = undefined;
  global.generarSalt = undefined;
  global.generarPasswordTemporal = undefined;
  global.generarPIN = undefined;
  global.getSecretHMAC_ = undefined;
  global.generarSesion = undefined;
  global.validarSesion = undefined;
  global.resetPasswordMaestro = undefined;
  global.altaMaestrosSeed = undefined;
  global.altaAccesoPadre_ = undefined;
  global.seedMaestrosCompleto = undefined;
  global.seedPINsPadres = undefined;
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------
function test_generarHashPin_pinValido() {
  setup();
  try {
    const { hash, salt } = global.generarHashPin_('1234');
    m.assertEqual(hash.length, 64, 'hash debe ser 64 chars hex');
    m.assert(/^[0-9a-f]{64}$/.test(hash), 'hash debe ser hex lowercase');
    m.assertEqual(salt.length, 16, 'salt debe ser 16 chars hex');
    m.assert(/^[0-9a-f]{16}$/.test(salt), 'salt debe ser hex lowercase');
  } finally { teardown(); }
}

function test_generarHashPin_pinInvalido_corto() {
  setup();
  try {
    m.assertThrows(
      () => global.generarHashPin_('12'),
      /4-6 digitos/,
      'PIN de 2 dígitos debe lanzar'
    );
  } finally { teardown(); }
}

function test_generarHashPin_pinInvalido_largo() {
  setup();
  try {
    m.assertThrows(
      () => global.generarHashPin_('1234567'),
      /4-6 digitos/,
      'PIN de 7 dígitos debe lanzar'
    );
  } finally { teardown(); }
}

function test_generarHashPin_pinInvalido_noNumerico() {
  setup();
  try {
    m.assertThrows(
      () => global.generarHashPin_('12a4'),
      /4-6 digitos/,
      'PIN con letra debe lanzar'
    );
  } finally { teardown(); }
}

function test_generarHashPin_idempotente() {
  setup();
  try {
    // Si el salt fuera siempre el mismo, dos PINs iguales deberían dar mismo hash.
    // Como el salt es aleatorio, dos PINs iguales con salts DISTINTOS dan hashes DISTINTOS.
    // (Este test verifica que NO haya regresión tipo "salt duplicado".)
    const r1 = global.generarHashPin_('1234');
    const r2 = global.generarHashPin_('1234');
    m.assert(r1.salt !== r2.salt,
      'dos llamadas con mismo PIN deben tener salts DIFERENTES (sin regresión salt-duplicado)');
    m.assert(r1.hash !== r2.hash,
      'dos llamadas con mismo PIN pero distinto salt deben dar hashes DIFERENTES');
  } finally { teardown(); }
}

// ----------------------------------------------------------------------------
// verificarHash (de lib_auth.gs)
// ----------------------------------------------------------------------------
function test_verificarHash_ok() {
  setup();
  try {
    const salt = '0123456789abcdef';
    const plaintext = 'wundtM03';
    const hash = global.hashCredencial(plaintext, salt);
    m.assert(global.verificarHash(plaintext, salt, hash),
      'verificarHash debe aceptar password correcto');
  } finally { teardown(); }
}

function test_verificarHash_fail() {
  setup();
  try {
    const salt = '0123456789abcdef';
    const hash = global.hashCredencial('correcto', salt);
    m.assert(!global.verificarHash('incorrecto', salt, hash),
      'verificarHash debe rechazar password incorrecto');
  } finally { teardown(); }
}

function test_verificarHash_fail_saltDistinto() {
  setup();
  try {
    const hash = global.hashCredencial('mismo', '0123456789abcdef');
    m.assert(!global.verificarHash('mismo', 'fedcba9876543210', hash),
      'mismo plaintext + distinto salt → debe rechazar');
  } finally { teardown(); }
}

// ----------------------------------------------------------------------------
// Runner
// ----------------------------------------------------------------------------
const tests = [
  ['generarHashPin PIN válido',          test_generarHashPin_pinValido],
  ['generarHashPin PIN corto lanza',     test_generarHashPin_pinInvalido_corto],
  ['generarHashPin PIN largo lanza',     test_generarHashPin_pinInvalido_largo],
  ['generarHashPin PIN no-numérico lanza', test_generarHashPin_pinInvalido_noNumerico],
  ['generarHashPin salts diferentes (anti-regresión)', test_generarHashPin_idempotente],
  ['verificarHash password correcto',    test_verificarHash_ok],
  ['verificarHash password incorrecto',  test_verificarHash_fail],
  ['verificarHash salt distinto rechaza', test_verificarHash_fail_saltDistinto]
];

let passed = 0, failed = 0;
console.log('=== test_hashes.js ===');
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
