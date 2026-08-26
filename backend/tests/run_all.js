// tests/run_all.js — Runner que ejecuta todas las suites de test.
//
// Uso: cd backend && node tests/run_all.js
//
// Cada suite es un script que imprime "Pasaron: X / Y" y sale con código 1 si
// hay fallos. Acá los ejecutamos como subprocesos para mantener cada suite
// aislada (los globals no se contaminan entre sí).

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const suites = [
  'test_hashes.js',
  'test_alta_atomica.js',
  'test_cambiar_pin.js'
];

const backendDir = path.join(__dirname, '..');
let totalPassed = 0;
let totalFailed = 0;
let suiteCount = 0;

console.log('═══════════════════════════════════════════════════════════');
console.log(' Wilhelm Wundt — Tests automatizados (run_all.js)');
console.log('═══════════════════════════════════════════════════════════');

for (const suite of suites) {
  suiteCount++;
  console.log('\n[Suite ' + suiteCount + '/' + suites.length + '] ' + suite);
  const r = spawnSync(process.execPath, [path.join(__dirname, suite)], {
    cwd: backendDir,
    encoding: 'utf8'
  });
  process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);

  // Parsear "Pasaron: X / Y" del output
  const m = /Pasaron:\s+(\d+)\s+\/\s+(\d+)/.exec(r.stdout);
  if (m) {
    totalPassed += parseInt(m[1], 10);
    totalFailed += (parseInt(m[2], 10) - parseInt(m[1], 10));
  }
  if (r.status !== 0) {
    console.log('  [SUITE FALLÓ]');
  }
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log(' TOTAL: ' + totalPassed + ' tests pasaron, ' + totalFailed + ' fallaron');
console.log('═══════════════════════════════════════════════════════════');
if (totalFailed > 0) process.exit(1);
console.log('✓ Todas las suites verdes\n');
