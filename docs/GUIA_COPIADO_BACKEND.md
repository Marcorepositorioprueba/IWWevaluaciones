# 📋 Guía de Copiado — Backend en Apps Script

**Para:** Marco (principiante en Apps Script)
**Objetivo:** Llevar los 7 archivos `.gs` del backend a tu proyecto de Apps Script sin errores.

---

## 📁 Archivos que vas a copiar

Todos están en:
```
C:\Users\leonm\proyectosmarco\WilhelmWundtv2\backend\install\
```

| # | Archivo .txt | Nombre en Apps Script | LOC |
|---|---|---|---|
| 1 | `01-Code.gs.txt` | `Code` | 297 |
| 2 | `02-lib_sheets.gs.txt` | `lib_sheets` | 275 |
| 3 | `03-lib_auth.gs.txt` | `lib_auth` | 203 |
| 4 | `04-lib_calculos.gs.txt` | `lib_calculos` | 235 |
| 5 | `05-lib_validaciones.gs.txt` | `lib_validaciones` | 161 |
| 6 | `06-lib_logs.gs.txt` | `lib_logs` | 38 |
| 7 | `07-diagnostico.gs.txt` | `diagnostico` | 108 |

> **Convención Apps Script:** cuando guardas un archivo con nombre `X`, se crea como `X.gs`. La extensión no la pones tú; la pone el editor.

---

## 🚶 Pasos detallados (uno por uno)

### Pre-requisito

Ya debes tener:
- ✅ Tu Spreadsheet "WilhelmWundt-v2" abierto
- ✅ El proyecto de Apps Script "Wundt-Backend" abierto (lo abriste desde Extensiones → Apps Script)
- ✅ El editor de Apps Script con el archivo inicial vacío (lo borraste en la sesión anterior)

Si no estás ahí, avísame y te guío de nuevo.

---

### Paso 1 — Crear los 7 archivos vacíos en Apps Script

En el editor de Apps Script, en el panel izquierdo verás los archivos del proyecto (probablemente solo `Code.gs` por defecto, vacío).

**Por cada uno de los 7 archivos:**

1. Click en el ícono **`+`** junto a "Archivos" (Files) en el panel izquierdo.
2. Selecciona **"Secuencia de comandos"** / **"Script"**.
3. Te pide un nombre. Escribe el nombre SIN extensión, por ejemplo: `lib_sheets`
4. Presiona Enter.
5. Repite para los 7.

**Orden sugerido (alfabético, como aparecerán en el panel):**

- `Code` (ya existe, solo bórralo y pega el nuevo)
- `diagnostico`
- `lib_auth`
- `lib_calculos`
- `lib_logs`
- `lib_sheets`
- `lib_validaciones`

> **Truco:** en lugar de crear 7 archivos manualmente uno por uno, puedes:
> 1. Click en `Code.gs` (el que ya existe)
> 2. Ctrl+A → Delete (queda vacío)
> 3. Pega el contenido de `01-Code.gs.txt`
> 4. Luego crea los otros 6 con el `+`

---

### Paso 2 — Pegar el contenido de cada archivo

**Por cada archivo de la lista:**

1. En tu computador, abre el archivo `.txt` correspondiente con el Bloc de Notas (Notepad) o un editor de texto plano. **No uses Word, no uses el navegador con el Read de Claude, usa Notepad++ o similar.** Si no tienes, abre con Doble Click que se abre en Notepad.
2. **Ctrl+A** → selecciona todo
3. **Ctrl+C** → copia
4. En Apps Script, click en el archivo correspondiente (panel izquierdo)
5. **Ctrl+A** → selecciona lo que haya (que debe estar vacío)
6. **Ctrl+V** → pega
7. Verifica que la primera línea sea un comentario que empieza con `//` (esto confirma que pegaste bien)
8. **Ctrl+S** → guarda (o click en el diskette)

---

### Paso 3 — Verificar que no haya errores

Cuando los 7 estén pegados:

1. En el menú superior: **Ejecutar** → **Ejecutar función** → **`diagnosticoSheets`**
2. Te va a pedir permisos la primera vez (es normal). Acepta todo.
3. Mira la parte inferior: **Registro de ejecución** / **Execution log**.
4. Deberías ver algo como:

```
=== DIAGNÓSTICO WILHELM WUNDT V2 ===
Fecha: 2026-07-28T...

✓ CONFIG              5 filas | headers OK
✓ ALUMNOS             135 filas | headers OK
✓ EVALUACIONES        0 filas | headers OK
✗ MAESTROS_AUTH       NO EXISTE
✓ ACCESOS_PADRES      0 filas | headers OK
✓ BACKUP_LOGS         0 filas | headers OK
```

> **Que MAESTROS_AUTH no exista es normal** — la creamos en el siguiente paso con `crearMaestrosAuth()`.

Si ves errores de "función no definida" o "línea X", significa que un archivo no se pegó completo. Vuelve al archivo problemático y repite.

---

### Paso 4 — Crear las credenciales de maestros

Ahora que los 7 archivos funcionan, vamos a crear la hoja `MAESTROS_AUTH` con los 9 passwords:

1. Menú: **Ejecutar** → **Ejecutar función** → **`crearMaestrosAuth`**
2. Acepta permisos si te los pide.
3. Al terminar, abre el log de ejecución. Verás algo como:

```
=== CREAR MAESTROS_AUTH ===
Credenciales generadas (entregar a cada maestro por canal seguro):

  M01  →  K7HM2PXN
  M02  →  WQ3YN8TS
  M03  →  ...
  ... (hasta M09)
```

4. **⚠️ IMPORTANTE:** Copia esos 9 códigos y guárdalos en un lugar seguro (un Bloc de Notas, un papel). Son los passwords que entregarás a cada maestro.

5. Verifica en tu Sheets: ahora debe existir la pestaña `MAESTROS_AUTH` con 9 filas de datos (los hashes, no los passwords en plano — eso es correcto, los passwords solo los viste tú en el log).

---

## ✅ Checklist de cierre de Fase 1

- [ ] 7 archivos creados en Apps Script con sus nombres exactos
- [ ] Contenido pegado completo (sin líneas faltantes)
- [ ] `diagnosticoSheets()` ejecutado sin errores
- [ ] `crearMaestrosAuth()` ejecutado, 9 passwords anotados
- [ ] Hoja `MAESTROS_AUTH` aparece en el Sheets con 9 filas

Si todo está ✅, pasamos a la **Fase 2: Configurar secretos y desplegar como Web App**.

---

## 🆘 Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| "Función no definida: X" en el log | Un archivo no se pegó completo o se guardó con nombre incorrecto | Verifica que el nombre del archivo en Apps Script sea EXACTO (mayúsculas importan) |
| Errores de sintaxis rojos en el editor | Caracteres invisibles al pegar (BOM, tabs raros) | Borra el archivo en Apps Script, créalo de nuevo, y pega usando Ctrl+Shift+V (pegar sin formato) si está disponible, o pega primero en Notepad y luego copia de Notepad a Apps Script |
| `crearMaestrosAuth` no aparece en la lista de funciones | El archivo `diagnostico` no se guardó | Click en el archivo `diagnostico` en el panel izquierdo, Ctrl+S |
| "Hoja CONFIG no encontrada" | Apps Script no está vinculado al Spreadsheet correcto | Cierra Apps Script, ve a tu Sheets → Extensiones → Apps Script. Eso lo re-vincula. |

---

## 📌 Siglas Apps Script que vas a ver

- **`.gs`** = archivo de código Apps Script (Google Script)
- **"Ejecutar"** = el botón ▶️ del menú superior
- **"Registro"** = la consola de logs en la parte inferior
- **"Permisos"** = el popup que Google te muestra la primera vez para autorizar el script a leer tu Sheets

No te asustes si pide permisos — es Google verificando que TÚ autorizas al script a ver tus datos. Tú eres el dueño.

---

**Siguiente paso cuando termines:** dime "Fase 1 lista" y arrancamos Fase 2.
