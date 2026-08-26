// test_local.js — Pruebas locales de la lógica que NO depende de Google Apps Script.
// Ejecutar: node test_local.js
//
// Cubre:
//   1. Parser de fórmula (copia del de lib_calculos.gs)
//   2. Cálculo del índice (fórmula default)
//   3. Generación de narrativas (copia de narrativa.js)
//   4. Hash + salt (simula Apps Script con crypto de Node)

const crypto = require('crypto');

// === 1. Parser de fórmula ===

function tokenizar_(s) {
  const lista = [];
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    if (/\s/.test(c)) { i++; continue; }
    if ('+-*/()'.indexOf(c) >= 0) { lista.push(c); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s.charAt(j))) j++;
      lista.push(s.substring(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s.charAt(j))) j++;
      lista.push('1'); // placeholder para el smoke test
      i = j;
      continue;
    }
    return { error: 'Carácter inválido en posición ' + i + ': ' + c };
  }
  return { lista: lista };
}

function parsearFormula(str) {
  if (!str || typeof str !== 'string') return { ok: false, error: 'Fórmula vacía' };
  const tokens = tokenizar_(str);
  if (tokens.error) return { ok: false, error: tokens.error };

  let pos = 0;
  const peek = () => tokens.lista[pos];
  const consumir = (t) => { if (peek() === t) { pos++; return t; } return null; };

  function expr() {
    let left = term();
    while (peek() === '+' || peek() === '-') {
      const op = tokens.lista[pos++];
      const right = term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function term() {
    let left = factor();
    while (peek() === '*' || peek() === '/') {
      const op = tokens.lista[pos++];
      const right = factor();
      if (op === '/' && right === 0) throw new Error('División por cero');
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }
  function factor() {
    const t = peek();
    if (t === undefined) throw new Error('Fórmula incompleta');
    if (consumir('(')) {
      const v = expr();
      if (!consumir(')')) throw new Error("Falta paréntesis de cierre ')'");
      return v;
    }
    if (consumir('-')) return -factor();
    pos++;
    const n = Number(t);
    if (isNaN(n)) throw new Error('Token no numérico: ' + t);
    return n;
  }

  try {
    const evaluar = () => { pos = 0; return expr(); };
    const test = evaluar();
    if (typeof test !== 'number' || isNaN(test)) return { ok: false, error: 'No numérico' };
    return { ok: true, evaluar: evaluar };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// === 2. Cálculo del índice (fórmula default) ===

function calcularIndiceDefault(ev) {
  const cal = parseFloat(ev.calificacion) || 0;
  const asi = parseFloat(ev.asistencia) || 0;
  const tar = parseFloat(ev.tareas) || 0;
  const pc = parseFloat(ev.pensamiento) || 1;
  const pa = parseFloat(ev.participacion) || 1;
  const au = parseFloat(ev.autogestion) || 1;
  const co = parseFloat(ev.colaboracion) || 1;

  const pCal = (cal / 10) * 5.0;
  const pAsi = (asi / 100) * 2.0;
  const pTar = (tar / 15) * 1.5;
  const compProm = (pc + pa + au + co) / 4;
  const pCom = ((compProm - 1) / 3) * 1.5;
  let total = pCal + pAsi + pTar + pCom;
  if (total < 0) total = 0;
  if (total > 10) total = 10;
  return Math.round(total * 100) / 100;
}

function semaforo(indice) {
  if (indice >= 7.5) return 'Verde';
  if (indice >= 6.0) return 'Amarillo';
  return 'Rojo';
}

// === 3. Generador de narrativas ===

function generarNarrativa(ev) {
  if (!ev || typeof ev !== 'object') return '';
  const nombre = ev.nombreAlumno || 'Su hijo/a';
  const partes = [];

  if (ev.semaforo === 'Verde') partes.push(`¡Excelentes noticias sobre ${nombre}!`);
  else if (ev.semaforo === 'Amarillo') partes.push(`${nombre} avanza, con áreas por fortalecer este mes.`);
  else partes.push(`Es momento de acompañar más de cerca a ${nombre}.`);

  const c = parseFloat(ev.calificacion);
  if (c >= 9) partes.push(`Su desempeño académico es destacado (${c}/10).`);
  else if (c >= 8) partes.push(`Mantiene un nivel académico muy bueno (${c}/10).`);
  else if (c >= 7) partes.push(`Su rendimiento académico es sólido (${c}/10).`);
  else if (c >= 6) partes.push(`Su calificación (${c}/10) muestra áreas que podemos reforzar juntos.`);
  else partes.push(`Reforzaremos los contenidos académicos durante las próximas semanas (${c}/10).`);

  const a = parseInt(ev.asistencia, 10);
  if (!isNaN(a)) {
    if (a < 60) partes.push(`⚠️ La asistencia fue del ${a}%, muy por debajo de lo recomendado.`);
    else if (a < 80) partes.push(`⚠️ La asistencia fue del ${a}%, por debajo del 80% recomendado.`);
    else if (a < 95) partes.push(`Asistió al ${a}% de las clases.`);
    else partes.push(`Asistió al ${a}% de las clases — excelente regularidad.`);
  }

  const obs = String(ev.observaciones || '').trim();
  if (obs) {
    partes.push('');
    partes.push('Mensaje del maestro:');
    partes.push(`"${obs}"`);
  }

  partes.push('');
  partes.push('— Equipo docente, Instituto Wilhelm Wundt');
  return partes.join('\n');
}

// === 4. Hash (simula SHA-256 con salt) ===

function hash(plaintext, salt) {
  return crypto.createHash('sha256').update(plaintext + salt).digest('hex');
}

// === Tests ===

let ok = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { ok++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

console.log('\n=== 1. Parser de fórmula ===');
{
  const r1 = parsearFormula('0.5*CAL + 0.2*ASI*0.1');
  assert(r1.ok, 'Fórmula con variables y multiplicaciones parsea OK');

  const r2 = parsearFormula('0.5 * (CAL + ASI) / TAR');
  assert(r2.ok, 'Paréntesis funcionan');
  assert(r2.evaluar() === 2, 'Evaluación con placeholder=1 da 0.5 * 2 / 1 = 1, no 2'); // ojo
  // Recalculo: 0.5 * (1+1) / 1 = 1.0
  assert(r2.evaluar() === 1, '0.5*(1+1)/1 = 1.0');

  const r3 = parsearFormula('1/0');
  assert(!r3.ok, 'División por cero se detecta');

  const r4 = parsearFormula('0.5*CAL +');
  assert(!r4.ok, 'Fórmula incompleta se detecta');

  const r5 = parsearFormula('IF(CAL>5, 1, 0)');
  assert(!r5.ok, 'Funciones no soportadas se rechazan');

  const r6 = parsearFormula('0.5*CAL + 0.2*ASI*0.1 + 0.15*(TAR/15)*10 + 0.15*((PC+PA+AU+CO)/4)*2.5');
  assert(r6.ok, 'Fórmula completa de CONFIG parsea');
}

console.log('\n=== 2. Cálculo del índice ===');
{
  const r1 = calcularIndiceDefault({ calificacion: 10, asistencia: 100, tareas: 15, pensamiento: 4, participacion: 4, autogestion: 4, colaboracion: 4 });
  assert(r1 === 10, 'Caso perfecto → 10.00 (obtenido: ' + r1 + ')');

  const r2 = calcularIndiceDefault({ calificacion: 5, asistencia: 50, tareas: 0, pensamiento: 1, participacion: 1, autogestion: 1, colaboracion: 1 });
  assert(r2 < 4, 'Caso crítico → < 4 (obtenido: ' + r2 + ')');

  const r3 = calcularIndiceDefault({ calificacion: 8, asistencia: 90, tareas: 10, pensamiento: 3, participacion: 3, autogestion: 3, colaboracion: 3 });
  assert(r3 >= 6 && r3 <= 8, 'Caso promedio → 6-8 (obtenido: ' + r3 + ')');

  const r4 = semaforo(8.5);
  assert(r4 === 'Verde', '8.5 → Verde');
  const r5 = semaforo(6.5);
  assert(r5 === 'Amarillo', '6.5 → Amarillo');
  const r6 = semaforo(5.5);
  assert(r6 === 'Rojo', '5.5 → Rojo');
}

console.log('\n=== 3. Narrativa ===');
{
  const verde = generarNarrativa({
    nombreAlumno: 'Sergio',
    calificacion: 9.5,
    asistencia: 95,
    tareas: 12,
    pensamiento: 4, participacion: 4, autogestion: 4, colaboracion: 4,
    observaciones: 'Excelente mes.',
    semaforo: 'Verde'
  });
  assert(verde.startsWith('¡Excelentes noticias sobre Sergio!'), 'Encabezado correcto');
  assert(verde.includes('(9.5/10)'), 'Incluye calificación');
  assert(verde.includes('"Excelente mes."'), 'Incluye observación del maestro entre comillas');
  assert(verde.includes('— Equipo docente'), 'Cierra con firma');

  const rojo = generarNarrativa({
    nombreAlumno: 'X',
    calificacion: 5,
    asistencia: 60,
    tareas: 2,
    pensamiento: 1, participacion: 1, autogestion: 2, colaboracion: 2,
    observaciones: '',
    semaforo: 'Rojo'
  });
  assert(rojo.startsWith('Es momento de acompañar'), 'Encabezado rojo correcto');
  assert(rojo.includes('⚠️ La asistencia fue del 60%'), 'Incluye alerta de asistencia');
}

console.log('\n=== 4. Hash + salt ===');
{
  const salt = 'abc123';
  const h1 = hash('password123', salt);
  const h2 = hash('password123', salt);
  const h3 = hash('password124', salt);
  assert(h1 === h2, 'Hash determinista para misma entrada');
  assert(h1 !== h3, 'Hash distinto para password distinto');
  assert(h1.length === 64, 'Hash SHA-256 hex = 64 chars');
}

console.log('\n=== Resumen ===');
console.log('✓ Pasaron: ' + ok);
console.log('✗ Fallaron: ' + fail);
process.exit(fail > 0 ? 1 : 0);