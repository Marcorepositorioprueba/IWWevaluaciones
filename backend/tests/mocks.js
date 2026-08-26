// tests/mocks.js — Stubs de Apps Script para tests locales con Node.js.
//
// Crea un mock de SpreadsheetApp con hojas en memoria (Map<nombreHoja, matriz2D>)
// y expone utilidades para inyectar datos y leer filas resultantes.
// NO carga los .gs reales — solo provee las funciones que el código bajo test
// invoca sobre los servicios de Apps Script.
//
// Uso:
//   const m = createMockSpreadsheet();
//   m.setHoja('ALUMNOS', [['AlumnoID','NombreCompleto',...], ['3.10','Juan',...]]);
//   m.setHoja('ACCESOS_PADRES', [['AlumnoID',...]]);
//   ...

'use strict';

const crypto = require('crypto');

// ----------------------------------------------------------------------------
// SpreadsheetApp mock
// ----------------------------------------------------------------------------
function createMockSpreadsheet() {
  const hojas = new Map(); // nombre -> { headers, filas: [] }

  function getOrCreate(nombre) {
    if (!hojas.has(nombre)) {
      hojas.set(nombre, { headers: [], filas: [] });
    }
    return hojas.get(nombre);
  }

  function getHoja(nombre) {
    if (!hojas.has(nombre)) {
      throw new Error('Hoja ' + nombre + ' no existe');
    }
    return createMockSheet(hojas.get(nombre));
  }

  // getSheetByName: alternativa usada por algunas funciones del backend
  // (e.g. cambiarPinPadre_). Retorna null si la hoja no existe (como Apps Script).
  function getSheetByName(nombre) {
    if (!hojas.has(nombre)) return null;
    return createMockSheet(hojas.get(nombre));
  }

  function setHoja(nombre, matriz2D) {
    const h = getOrCreate(nombre);
    h.headers = matriz2D[0] || [];
    h.filas = matriz2D.slice(1).map(row => row.slice());
    return h;
  }

  function appendFila(nombre, fila) {
    const h = getOrCreate(nombre);
    h.filas.push(fila.slice());
    return h.filas.length; // retorna "lastRow" 1-indexed (header=row1)
  }

  function getFilas(nombre) {
    if (!hojas.has(nombre)) return [];
    return hojas.get(nombre).filas;
  }

  function getMatriz(nombre) {
    if (!hojas.has(nombre)) return [];
    const h = hojas.get(nombre);
    return [h.headers.slice(), ...h.filas.map(r => r.slice())];
  }

  return { getHoja, getSheetByName, setHoja, appendFila, getFilas, getMatriz, _hojas: hojas };
}

// ----------------------------------------------------------------------------
// Mock de un objeto Sheet (lo que retorna getHoja)
// ----------------------------------------------------------------------------
function createMockSheet(hojaInterna) {
  let sheet = {
    _data: hojaInterna,
    getName() { return hojaInterna._name || 'unknown'; },
    // Apps Script: getLastRow() retorna 1-indexed contando header.
    // Si solo hay header, retorna 1. Si hay header + 5 filas, retorna 6.
    getLastRow() { return hojaInterna.filas.length + 1; },
    getLastColumn() { return hojaInterna.headers.length; },
    getDataRange() {
      return createMockRange(hojaInterna, 1, 1,
        hojaInterna.filas.length + 1, hojaInterna.headers.length);
    },
    getRange(row, col, numRows, numCols) {
      if (numRows !== undefined) {
        return createMockRange(hojaInterna, row, col, numRows, numCols);
      }
      return createMockRange(hojaInterna, row, col, 1, 1);
    },
    appendRow(fila) {
      hojaInterna.filas.push(fila.slice());
      return hojaInterna.filas.length + 1; // 1-indexed incluyendo header
    },
    deleteRow(row) {
      // row es 1-indexed incluyendo header.
      // row=2 → borrar la primera fila de datos (filas[0])
      const filaIdx = row - 2;
      if (filaIdx >= 0 && filaIdx < hojaInterna.filas.length) {
        hojaInterna.filas.splice(filaIdx, 1);
      }
    }
  };
  return sheet;
}

// ----------------------------------------------------------------------------
// Mock de Range
// ----------------------------------------------------------------------------
function createMockRange(hojaInterna, row, col, numRows, numCols) {
  const range = {
    _row: row,
    _col: col,
    _numRows: numRows,
    _numCols: numCols,
    setValues(matriz) {
      for (let r = 0; r < matriz.length; r++) {
        for (let c = 0; c < matriz[r].length; c++) {
          const targetRow = row + r; // 1-indexed en Sheet (incluye header)
          const targetCol = col + c; // 1-indexed
          if (targetRow === 1) continue; // no sobreescribimos header
          const filaIdx = targetRow - 2; // filas[0] = fila 2 en Sheet
          if (filaIdx < 0) continue;
          // Asegurar que la fila exista (puede que setValues escriba más allá)
          while (hojaInterna.filas.length <= filaIdx) {
            // Crear fila vacía con celdas vacías (placeholder)
            const emptyRow = [];
            for (let i = 0; i < hojaInterna.headers.length; i++) emptyRow.push('');
            hojaInterna.filas.push(emptyRow);
          }
          const fila = hojaInterna.filas[filaIdx];
          if (targetCol - 1 >= fila.length) {
            // Expandir fila si las columnas no alcanzan
            while (fila.length < targetCol) fila.push('');
          }
          fila[targetCol - 1] = matriz[r][c];
        }
      }
      return range;
    },
    setValue(val) {
      const targetRow = row;
      const targetCol = col;
      if (targetRow === 1) return range;
      const filaIdx = targetRow - 2;
      const fila = hojaInterna.filas[filaIdx];
      if (!fila) return range;
      fila[targetCol - 1] = val;
      return range;
    },
    setNumberFormat(fmt) {
      // No-op en el mock (Sheets aplica formato en runtime, no afecta datos)
      return range;
    },
    getValues() {
      const result = [];
      for (let r = 0; r < numRows; r++) {
        const filaArr = [];
        for (let c = 0; c < numCols; c++) {
          const targetRow = row + r;
          const targetCol = col + c;
          if (targetRow === 1) {
            filaArr.push(hojaInterna.headers[targetCol - 1]);
          } else {
            const filaIdx = targetRow - 2;
            const fila = hojaInterna.filas[filaIdx];
            filaArr.push(fila ? fila[targetCol - 1] : '');
          }
        }
        result.push(filaArr);
      }
      return result;
    },
    getDataValidation() {
      return null; // mock: no validaciones aplicadas
    }
  };
  return range;
}

// ----------------------------------------------------------------------------
// Apps Script globals (mock mínimo)
// ----------------------------------------------------------------------------
function installGlobalMocks(mocks) {
  global.SpreadsheetApp = {
    getActiveSpreadsheet() { return mocks.spreadsheet; }
  };
  global.Utilities = {
    getUuid() {
      // UUID determinístico-ish para tests reproducibles
      return crypto.randomUUID();
    },
    computeDigest(algo, data) {
      // Apps Script retorna byte[]
      const hash = crypto.createHash('sha256').update(String(data)).digest();
      return Array.from(hash); // byte array, igual que Apps Script
    },
    DigestAlgorithm: {
      SHA_256: 'SHA-256'
    },
    computeHmacSha256Signature(payload, secret) {
      const hmac = crypto.createHmac('sha256', secret).update(String(payload)).digest();
      return Array.from(hmac);
    },
    base64EncodeWebSafe(s) {
      return Buffer.from(String(s)).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_');
    },
    base64DecodeWebSafe(s) {
      const norm = s.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(norm, 'base64').toString('binary');
    },
    newBlob(data) {
      return { getDataAsString() { return Buffer.from(data, 'binary').toString(); } };
    }
  };
  global.Logger = {
    log(msg) {
      if (mocks.verboseLog) console.log('[Logger]', msg);
    }
  };
  global.PropertiesService = {
    getScriptProperties() {
      return {
        _props: mocks.scriptProps || {},
        getProperty(k) { return this._props[k] || null; },
        setProperty(k, v) { this._props[k] = v; }
      };
    }
  };
  global.Session = {
    getScriptTimeZone() { return 'America/Mexico_City'; }
  };
}

// ----------------------------------------------------------------------------
// Mini-framework de aserción
// ----------------------------------------------------------------------------
function assert(cond, msg) {
  if (!cond) {
    throw new Error('ASSERT FAIL: ' + (msg || '(no message)'));
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error('ASSERT FAIL: ' + (msg || '') +
      '\n  esperado: ' + JSON.stringify(expected) +
      '\n  actual:   ' + JSON.stringify(actual));
  }
}

function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error('ASSERT FAIL: ' + (msg || '') +
      '\n  esperado: ' + e +
      '\n  actual:   ' + a);
  }
}

function assertThrows(fn, regexMsg, msg) {
  let threw = false;
  let actual = null;
  try { fn(); } catch (e) { threw = true; actual = e; }
  if (!threw) {
    throw new Error('ASSERT FAIL: ' + (msg || 'esperaba throw') + ' pero no lanzó');
  }
  if (regexMsg && !regexMsg.test(actual.message)) {
    throw new Error('ASSERT FAIL: mensaje no coincide.\n  regex: ' + regexMsg +
      '\n  actual: ' + actual.message);
  }
}

module.exports = {
  createMockSpreadsheet,
  createMockSheet,
  createMockRange,
  installGlobalMocks,
  assert,
  assertEqual,
  assertDeepEqual,
  assertThrows,
  crypto
};
