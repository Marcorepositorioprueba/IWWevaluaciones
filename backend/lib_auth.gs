// lib_auth.gs — Autenticación y autorización.
//
// - Hash SHA-256 + salt para passwords y PINs.
// - Tokens de sesión firmados con HMAC-SHA256.
// - Funciones para gestionar altas/bajas.
//
// En producción, las contraseñas viven en MAESTROS_AUTH hasheadas.
// Los PINs viven en ACCESOS_PADRES hasheados.

/**
 * Genera un salt aleatorio en hex (32 chars = 16 bytes de entropía).
 *
 * Fix 2026-08-25: ya NO duplica el UUID. La concatenación `bytes + bytes`
 * producía 64 chars — excesivo para SHA-256 y entropía redundante (los
 * bytes primero/segundo eran iguales). Ahora retorna 32 chars hex puros
 * (16 bytes únicos) que es lo correcto para SHA-256.
 *
 * NOTA: NO confundir con `generarHashPin_` (lib_pin_hash.gs.txt) que usa
 * un salt separado de 16 chars hex (8 bytes) para PINs de padres.
 * Ambos coexisten: este para passwords de maestros, el otro para PINs.
 */
function generarSalt() {
  return Utilities.getUuid().replace(/-/g, ''); // 32 chars hex (16 bytes)
}

/**
 * Hash SHA-256 de (plaintext + salt), en hex.
 */
function hashCredencial(plaintext, salt) {
  if (!plaintext || !salt) throw new Error('hashCredencial: plaintext y salt requeridos');
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(plaintext) + String(salt)
  );
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/**
 * Verifica un (plaintext, salt, hashEsperado).
 */
function verificarHash(plaintext, salt, hashEsperado) {
  const h = hashCredencial(plaintext, salt);
  return h === String(hashEsperado).trim();
}

/**
 * Genera un password temporal alfanumérico de longitud dada.
 * Usa getUuid como base — no apto para alta seguridad pero
 * suficiente para que un maestro lo cambie en su primer login.
 */
function generarPasswordTemporal(longitud) {
  longitud = longitud || 8;
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1
  let s = '';
  let u = Utilities.getUuid().replace(/-/g, '');
  for (let i = 0; i < longitud && i < u.length; i++) {
    s += alpha.charAt(parseInt(u.charAt(i), 16) % alpha.length);
  }
  // Rellena si quedó corta
  while (s.length < longitud) {
    s += alpha.charAt(Math.floor(Math.random() * alpha.length));
  }
  return s;
}

/**
 * Genera un PIN numérico de 4 dígitos.
 */
function generarPIN(longitud) {
  longitud = longitud || 4;
  let s = '';
  for (let i = 0; i < longitud; i++) {
    s += Math.floor(Math.random() * 10);
  }
  // Garantiza que no empiece con 0 (más difícil de leer mal)
  if (s.charAt(0) === '0') s = '1' + s.substring(1);
  return s;
}

/**
 * Devuelve el secreto HMAC guardado en Script Properties.
 * Si no existe, genera uno nuevo automáticamente.
 */
function getSecretHMAC_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('WUNDT_SECRET_HMAC');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('WUNDT_SECRET_HMAC', secret);
    Logger.log('WUNDT_SECRET_HMAC generado automáticamente. Guárdalo en un lugar seguro.');
  }
  return secret;
}

/**
 * Genera un token de sesión con formato: <base64(subject|expiraIso)>.<hex(HMAC)>
 * Esto permite que el backend valida todo (sujeto + expiración) sin necesidad
 * de un store de sesiones, porque el HMAC cubre el sujeto y la expiración.
 *
 *   segment1 = base64url(subject + '|' + expiraIso)
 *   segment2 = hex(HMAC-SHA256(segment1, secret))
 *   token = segment1 + '.' + segment2
 *
 * Devuelve {token, subject, expiraEn (ISO)} con expiración de 12h.
 */
function generarSesion(subject) {
  const ahora = new Date();
  const expira = new Date(ahora.getTime() + 12 * 60 * 60 * 1000);
  const expiraIso = expira.toISOString();
  const payload = subject + '|' + expiraIso;
  const segment1 = Utilities.base64EncodeWebSafe(payload).replace(/=+$/, '');
  const hmac = Utilities.computeHmacSha256Signature(segment1, getSecretHMAC_());
  const segment2 = hmac.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  return { token: segment1 + '.' + segment2, subject: subject, expiraEn: expiraIso };
}

/**
 * Valida un token de sesión. Devuelve {ok, subject, expiraEn} o {ok:false, razon}.
 *
 * Chequea:
 *  1) Estructura (dos segmentos separados por '.', primero base64url, segundo hex 64).
 *  2) Firma HMAC.
 *  3) Expiración (no mayor a `ahora`).
 *  4) Si subjectEsperado viene, lo compara contra el subject del token.
 */
function validarSesion(token, subjectEsperado) {
  if (!token || typeof token !== 'string') return { ok: false, razon: 'Falta token' };

  const partes = token.split('.');
  if (partes.length !== 2) return { ok: false, razon: 'Formato de token inválido' };

  const [segment1, segment2] = partes;
  if (!/^[0-9a-f]{64}$/i.test(segment2)) return { ok: false, razon: 'Firma con formato inválido' };

  // Verifica firma
  const esperado = Utilities.computeHmacSha256Signature(segment1, getSecretHMAC_());
  const esperadoHex = esperado.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  if (esperadoHex.toLowerCase() !== segment2.toLowerCase()) {
    return { ok: false, razon: 'Firma inválida' };
  }

  // Decodifica payload
  let payloadStr;
  try {
    payloadStr = Utilities.newBlob(Utilities.base64DecodeWebSafe(segment1)).getDataAsString();
  } catch (e) {
    return { ok: false, razon: 'No se pudo decodificar el payload' };
  }
  const idx = payloadStr.lastIndexOf('|');
  if (idx < 0) return { ok: false, razon: 'Payload mal formado' };
  const subject = payloadStr.substring(0, idx);
  const expiraIso = payloadStr.substring(idx + 1);

  const expira = new Date(expiraIso);
  if (isNaN(expira.getTime())) return { ok: false, razon: 'Expiración inválida' };
  if (new Date() > expira) return { ok: false, razon: 'Sesión expirada' };

  if (subjectEsperado && subject !== subjectEsperado) {
    return { ok: false, razon: 'Subject no coincide' };
  }

  return { ok: true, subject: subject, expiraEn: expiraIso };
}

/**
 * P33 (2026-08-26): helper para endpoints exclusivos de dirección.
 * Centraliza el check que antes vivía hardcoded en accionGetCobertura_.
 * Usar en TODA acción nueva que solo pueda invocar ADM/DIR.
 */
function esAdmin_(maestroId) {
  return maestroId === 'ADM' || maestroId === 'DIR';
}

/**
 * Resetea el password de UN maestro con un valor conocido que tú defines.
 * Útil cuando olvidaste la contraseña y necesitas volver a entrar.
 *
 * Si `sobreescribir=true`, SIEMPRE actualiza el password (incluso si ya existe).
 * Si es false (default), respeta filas existentes.
 *
 * Ejecutar manualmente: resetPasswordMaestro("M03", "wundt2026", true)
 */
function resetPasswordMaestro(maestroId, nuevoPassword, sobreescribir) {
  if (!maestroId || !nuevoPassword) {
    throw new Error('resetPasswordMaestro: maestroId y nuevoPassword requeridos');
  }
  const sh = asegurarHoja(SHEETS.MAESTROS_AUTH);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === String(maestroId).trim()) {
      const nuevoSalt = generarSalt();
      const nuevoHash = hashCredencial(nuevoPassword, nuevoSalt);
      sh.getRange(i + 1, 2).setValue(nuevoHash);
      sh.getRange(i + 1, 3).setValue(nuevoSalt);
      Logger.log('Password de ' + maestroId + ' actualizado a: ' + nuevoPassword);
      return { ok: true, maestroId: maestroId, nuevoPassword: nuevoPassword };
    }
  }
  if (sobreescribir) {
    throw new Error('resetPasswordMaestro: maestroId "' + maestroId + '" no existe en MAESTROS_AUTH');
  }
  // Si no existe y no es overwrite, lo crea
  const salt = generarSalt();
  sh.appendRow([maestroId, hashCredencial(nuevoPassword, salt), salt, true, '']);
  Logger.log('Password de ' + maestroId + ' CREADO con: ' + nuevoPassword);
  return { ok: true, maestroId: maestroId, nuevoPassword: nuevoPassword, accion: 'creado' };
}

/**
 * Crea una fila en MAESTROS_AUTH para los M01-M09 si no existe.
 * Genera passwords temporales, los imprime en Logger, los devuelve como mapa.
 *
 * Ejecutar manualmente: altaMaestrosSeed()
 */
function altaMaestrosSeed() {
  const cfg = leerConfig();
  const lista = cfg['Maestro'] || [];
  const sh = asegurarHoja(SHEETS.MAESTROS_AUTH);
  const { filas } = leerFilas('MAESTROS_AUTH');
  const existentes = new Set(filas.map(r => String(r.MaestroID || '').trim()));

  const credenciales = {};
  lista.forEach(m => {
    if (existentes.has(m.valorId)) {
      credenciales[m.valorId] = '(ya existe)';
      return;
    }
    const pwd = generarPasswordTemporal(8);
    const salt = generarSalt();
    sh.appendRow([m.valorId, hashCredencial(pwd, salt), salt, true, '']);
    credenciales[m.valorId] = pwd;
  });
  Logger.log('Credenciales generadas: ' + JSON.stringify(credenciales));
  return credenciales;
}

/**
 * Da de alta el acceso de un padre para un alumnoId.
 * Genera PIN aleatorio, lo guarda hasheado, devuelve el PIN en plano.
 *
 * Ejecutar manualmente: altaAccesoPadre_(alumnoId, tutorNombre)
 */
function altaAccesoPadre_(alumnoId, tutorNombre) {
  if (!alumnoId) throw new Error('altaAccesoPadre: alumnoId requerido');
  // Verifica que el alumno exista en ALUMNOS
  const alumnos = leerFilas('ALUMNOS').filas;
  const alumno = alumnos.find(a => String(a.AlumnoID || '').trim() === String(alumnoId).trim());
  if (!alumno) throw new Error('altaAccesoPadre: alumnoId "' + alumnoId + '" no existe en ALUMNOS');

  const sh = asegurarHoja(SHEETS.ACCESOS_PADRES);
  const pin = generarPIN(4);
  const salt = generarSalt();
  sh.appendRow([alumnoId, hashCredencial(pin, salt), salt, tutorNombre || '', '', '', true, new Date()]);
  return { ok: true, alumnoId: alumnoId, pin: pin, mensaje: 'PIN generado. Comunícalo al tutor por canal seguro.' };
}

/**
 * Seed completo: crea/actualiza maestros con passwords con variante
 * (wundtM01, wundtM02, ... wundtADM, wundtDIR).
 *
 * Ejecutar manualmente:
 *   seedMaestrosCompleto(true)   // fuerza reset de TODOS
 *   seedMaestrosCompleto(false)  // solo crea los que faltan
 */
function seedMaestrosCompleto(sobreescribir) {
  // Password con variante: wundt + ID en mayúsculas
  const cuentas = {
    'M01': 'Maestro 1°',     'M02': 'Maestro 2°',     'M03': 'Maestro 3°',
    'M04': 'Maestro 4°',     'M05': 'Maestro 5°',     'M06': 'Maestro 6°',
    'M07': 'Maestro 1sec',   'M08': 'Maestro 2sec',   'M09': 'Maestro 3sec',
    'M10': 'Maestro Preescolar 1°', 'M11': 'Maestro Preescolar 2°', 'M12': 'Maestro Preescolar 3°',
    'G01': 'Reserva 1',      'G02': 'Reserva 2',      'G03': 'Reserva 3',
    'G04': 'Reserva 4',      'G05': 'Reserva 5',
    'ADM': 'Administrador',  'DIR': 'Dirección'
  };

  const sh = asegurarHoja(SHEETS.MAESTROS_AUTH);
  const data = sh.getDataRange().getValues();

  const resultado = {};

  if (sobreescribir) {
    for (let i = 1; i < data.length; i++) {
      const idExistente = String(data[i][0] || '').trim();
      if (!idExistente) continue;
      const pwd = 'wundt' + idExistente.toUpperCase();
      const salt = generarSalt();
      const hash = hashCredencial(pwd, salt);
      sh.getRange(i + 1, 2).setValue(hash);
      sh.getRange(i + 1, 3).setValue(salt);
      resultado[idExistente] = { password: pwd, accion: 'reseteado' };
    }
    const idsExistentes = new Set(Object.keys(resultado));
    Object.keys(cuentas).forEach(id => {
      if (!idsExistentes.has(id)) {
        const pwd = 'wundt' + id.toUpperCase();
        const salt = generarSalt();
        const hash = hashCredencial(pwd, salt);
        sh.appendRow([id, hash, salt, true, '']);
        resultado[id] = { password: pwd, accion: 'creado' };
      }
    });
  } else {
    const existentes = new Set();
    for (let i = 1; i < data.length; i++) {
      existentes.add(String(data[i][0] || '').trim());
    }
    Object.keys(cuentas).forEach(id => {
      const pwd = 'wundt' + id.toUpperCase();
      if (existentes.has(id)) {
        resultado[id] = { password: pwd, accion: 'ya existe (no se sobreescribe)' };
      } else {
        const salt = generarSalt();
        const hash = hashCredencial(pwd, salt);
        sh.appendRow([id, hash, salt, true, '']);
        resultado[id] = { password: pwd, accion: 'creado' };
      }
    });
  }

  Logger.log('=== SEED MAESTROS (sobreescribir=' + sobreescribir + ') ===');
  Logger.log('Patrón de password: wundt<ID en mayúsculas>');
  Logger.log('Ejemplo: wundtM01, wundtM02, ..., wundtADM, wundtDIR');
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Genera PINs de padres para TODOS los alumnos que aún no tienen acceso.
 * Lee ALUMNOS de Sheets (fuente de verdad) y ACCESOS_PADRES (para no duplicar).
 *
 * Si `sobreescribir=true`: regenera TODOS los PINs (los existentes se reemplazan).
 * Si `sobreescribir=false`: solo genera para los alumnos sin PIN.
 *
 * Ejecutar manualmente:
 *   seedPINsPadres(true)   // regenera todos
 *   seedPINsPadres(false)  // solo los faltantes
 */
function seedPINsPadres(sobreescribir) {
  sobreescribir = sobreescribir === true;

  // 1) Leer todos los alumnos existentes
  const { filas: alumnos } = leerFilas('ALUMNOS');
  Logger.log('Total alumnos en Sheets: ' + alumnos.length);

  // 2) Leer accesos existentes (para saber cuáles ya tienen PIN)
  const shAccesos = asegurarHoja(SHEETS.ACCESOS_PADRES);
  const dataAccesos = shAccesos.getDataRange().getValues();
  const alumnosConPin = new Set();
  for (let i = 1; i < dataAccesos.length; i++) {
    const aid = String(dataAccesos[i][0] || '').trim();
    if (aid) alumnosConPin.add(aid);
  }
  Logger.log('Alumnos que ya tienen PIN: ' + alumnosConPin.size);

  const pinGenerado = {};
  const pinReemplazado = [];

  alumnos.forEach(al => {
    const alumnoId = String(al.AlumnoID || '').trim();
    if (!alumnoId) return;

    if (alumnosConPin.has(alumnoId)) {
      if (sobreescribir) {
        // Encuentra la fila y elimina (luego re-agrega al final)
        for (let i = 1; i < dataAccesos.length; i++) {
          if (String(dataAccesos[i][0] || '').trim() === alumnoId) {
            shAccesos.deleteRow(i + 1);
            pinReemplazado.push(alumnoId);
            break;
          }
        }
      } else {
        return; // ya tiene y no sobreescribimos
      }
    }

    // Genera PIN nuevo
    const pin = generarPIN(4);
    const salt = generarSalt();
    const hash = hashCredencial(pin, salt);
    shAccesos.appendRow([alumnoId, hash, salt, '', '', '', true, new Date()]);
    pinGenerado[alumnoId] = pin;
  });

  Logger.log('=== PINs DE PADRES ===');
  Logger.log('Modo sobreescribir: ' + sobreescribir);
  Logger.log('PINs generados (nuevos): ' + Object.keys(pinGenerado).length);
  Logger.log('PINs reemplazados: ' + pinReemplazado.length);
  Logger.log('---');
  Logger.log('TODOS LOS PINs (alumnoId → PIN):');
  Logger.log(JSON.stringify(pinGenerado, null, 2));
  return { generados: pinGenerado, reemplazados: pinReemplazado };
}

