// tests/loader.js — Carga funciones de los .gs.txt como módulos Node.
//
// Estrategia: NO ejecutar los .gs reales completos (tienen muchas dependencias
// de SpreadsheetApp, cache, etc.). En su lugar, re-implementamos localmente
// las funciones PURAS (sin side effects) y cargamos las IMPURAS desde .gs.txt
// usando `vm` para evaluarlas en un contexto con los globals de Apps Script
// (SpreadsheetApp, Utilities, Logger) ya mockeados via mocks.js.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const m = require('./mocks');

// ----------------------------------------------------------------------------
// Re-implementaciones de helpers de lib_sheets.gs (versión TEST)
// Idénticas al original, pero standalone. Si el original cambia, actualizar aquí.
//
// IMPORTANTE: estas funciones se preprendearán al código fuente de los .gs
// vía .toString(). Como el closure con `mockSS` se pierde al serializar,
// referenciamos el mock via `global.__MOCK_SS__` que se setea antes de cada
// test. Eso permite que las funciones funcionen cuando son llamadas desde
// dentro del vm.
// ----------------------------------------------------------------------------
function makeStubsLibSheets(mockSS) {
  // Setear referencia global antes de crear las funciones (cierre manual)
  global.__MOCK_SS__ = mockSS;

  return {
    forzarTextoId_(id) {
      const s = String(id || '').trim();
      if (!s) return s;
      if (s.startsWith("'")) return s;
      return "'" + s;
    },
    limpiarTextoId_(id) {
      const s = String(id || '');
      return s.startsWith("'") ? s.substring(1) : s;
    },
    canonicalizarAlumnoId_(id) {
      const s = String(id || '').trim();
      const match = s.match(/^(\d+)\.(\d+)$/);
      if (!match) return s;
      const grado = match[1].padStart(2, '0');
      const alumno = match[2].padStart(2, '0');
      return grado + '.' + alumno;
    },
    getHoja(nombre) {
      return global.__MOCK_SS__.getHoja(nombre);
    },
    leerFilas(nombreHoja) {
      const matriz = global.__MOCK_SS__.getMatriz(nombreHoja);
      if (matriz.length === 0) return { headers: [], filas: [] };
      const headers = matriz[0];
      const filas = matriz.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
      });
      return { headers, filas };
    },
    nombreDeMaestro(maestroId) {
      const ids = {
        'M01': 'Maestro 1°', 'M02': 'Maestro 2°', 'M03': 'Maestro 3°',
        'M04': 'Maestro 4°', 'M05': 'Maestro 5°', 'M06': 'Maestro 6°',
        'M07': 'Maestro 1sec', 'M08': 'Maestro 2sec', 'M09': 'Maestro 3sec',
        'M10': 'Maestro Preescolar 1°', 'M11': 'Maestro Preescolar 2°', 'M12': 'Maestro Preescolar 3°'
      };
      return ids[String(maestroId).toUpperCase().trim()] || null;
    }
  };
}

// ----------------------------------------------------------------------------
// Carga funciones desde un archivo .gs.txt en el contexto actual
// ----------------------------------------------------------------------------
function loadFromGsTxt(filename, targetNames) {
  const fullPath = path.join(__dirname, '..', filename);
  const src = fs.readFileSync(fullPath, 'utf8');
  // Convertir sintaxis .gs → js ejecutable
  // (apps script usa 'function name() {}' igual que JS, así que casi no hay que tocar)
  const ctx = vm.createContext(global);
  vm.runInContext(src, ctx, { filename: filename });
  // vm pone las funciones en `global`, no en ctx directamente,
  // porque el script las declara como function declarations en global scope.
  const out = {};
  for (const name of targetNames) {
    if (typeof global[name] !== 'function') {
      throw new Error('loadFromGsTxt: ' + name + ' no se encontró en ' + filename);
    }
    out[name] = global[name];
  }
  return out;
}

// ----------------------------------------------------------------------------
// Helper para cargar lib_pin_hash.gs.txt + lib_auth.gs con stubs inyectados
// ----------------------------------------------------------------------------
//
// Estrategia: prepender los stubs al código fuente de los .gs como declaraciones
// `function`, así cuando vm los ejecute, las referencias internas a esas funciones
// se resuelven correctamente por scope chain.
//
function loadPinHashLib(stubs) {
  const pinHashPath = path.join(__dirname, '..', 'lib_pin_hash.gs.txt');
  const authPath = path.join(__dirname, '..', 'lib_auth.gs');
  const pinHashSrc = fs.readFileSync(pinHashPath, 'utf8');
  const authSrc = fs.readFileSync(authPath, 'utf8');

  // Convertir stubs en declaraciones de función válidas. Como algunos stubs usan
  // "object method shorthand" (foo() { ... }) sin la palabra 'function', .toString()
  // los emite sin ella. Prefijamos con 'function' siempre para producir código válido.
  const stubsSrc = Object.keys(stubs).map(k => {
    const body = stubs[k].toString();
    // Si el body ya empieza con 'function ', lo dejamos; si no, lo prefijamos.
    const wrapped = body.trimStart().startsWith('function ') ? body : 'function ' + body;
    return wrapped + '\n';
  }).join('\n');

  // Concatenar: stubs primero (para que las referencias internas los encuentren),
  // luego auth, luego pin_hash.
  const combined =
    '// === STUBS (inyectados por loader.js) ===\n' + stubsSrc + '\n' +
    '// === lib_auth.gs ===\n' + authSrc + '\n' +
    '// === lib_pin_hash.gs.txt ===\n' + pinHashSrc + '\n';

  // Evaluar en el contexto global del módulo actual
  vm.runInThisContext(combined, { filename: 'combined_pin_hash_test.js' });

  // Después de ejecutar, las funciones declaradas con `function name()` quedan
  // accesibles vía global.* en V8. Pero los `var stubs` quedaron en el scope del
  // vm, no en global. Los copiamos para que los tests puedan invocarlos:
  for (const k of Object.keys(stubs)) {
    if (typeof global[k] !== 'function') {
      global[k] = stubs[k];
    }
  }
}

module.exports = { makeStubsLibSheets, loadFromGsTxt, loadPinHashLib };
