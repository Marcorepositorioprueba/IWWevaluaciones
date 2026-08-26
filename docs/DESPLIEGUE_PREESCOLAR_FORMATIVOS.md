# Despliegue — Preescolar (cualitativo) + Formativos extra

> Documento generado el 2026-08-14 tras la intervención que agregó 3 grupos
> de preescolar (modo cualitativo) y 3 campos formativos independientes del
> Índice para 1°-6° primaria y 1°-3° secundaria.

Este documento describe **qué hacer manualmente en Sheets y Apps Script**
después de hacer deploy del backend y frontend actualizados.

## Resumen de cambios

| Capa | Cambio |
|---|---|
| Backend `lib_sheets.gs` | Headers EVALUACIONES extendidos a 23 columnas (R–W = formativos). |
| Backend `lib_validaciones.gs` | `validarEvaluacion` bifurca por modo. 3 formativos opcionales. |
| Backend `lib_calculos.gs` | Cortocircuito para cualitativo; `semaforoDeNivel_()` (1/2→Rojo, 3→Amarillo, 4→Verde). |
| Backend `Code.gs` | `accionSaveEvaluaciones_` pasa alumno completo, setea semáforo cualitativo. |
| Backend `lib_auth.gs` | Seed incluye M10, M11, M12 (passwords `wundtM10/11/12`). |
| Frontend docente `modelos.js` | `GRADOS_CUALITATIVOS`, `esCualitativo()`, evaluacionVacia/validarParaEnvio/hidratar/clasificar bifurcados. |
| Frontend docente `ui.js` | Modal cualitativo vs numérico + bloque "Otros formativos" + payload bifurcado. |
| Frontend padres `ui.js` | `renderCard` bifurcado + tarjeta cualitativa + bloque "Otros formativos". |
| Frontend padres `narrativa.js` | `generarNarrativa` bifurca; añade párrafo de formativos al narrar. |

## Orden de ejecución

### 1. Sheets — agregar filas a `CONFIG`

3 filas nuevas (TIPO=Maestro):

| Clave | Valor | Nombre |
|---|---|---|
| Maestro | M10 | Maestro Preescolar 1° |
| Maestro | M11 | Maestro Preescolar 2° |
| Maestro | M12 | Maestro Preescolar 3° |

### 2. Sheets — agregar 45 alumnos预留 a `ALUMNOS`

3 grupos × 15预留. Cada fila:

| Campo | Valor |
|---|---|
| AlumnoID | `P1.1` … `P1.15`, `P2.1` … `P2.15`, `P3.1` … `P3.15` |
| NombreCompleto | `Por definir` |
| Grado | `Preescolar 1°` (o 2°, 3°) |
| Grupo | `Unico` |
| MaestroID | `M10` (o M11, M12) |

Cuando se tengan los nombres reales, **solo actualizar el campo NombreCompleto**.
El sistema los detecta automáticamente (filtrado ya existía).

### 3. Sheets — extender header de `EVALUACIONES`

Header actual (17 columnas) → nuevo (23 columnas). Agregar al final:

| Col | Header |
|---|---|
| R | Len_Calif |
| S | EdFis_Calif |
| T | Comp_Calif |
| U | Len_Obs |
| V | EdFis_Obs |
| W | Comp_Obs |

> Las celdas existentes en blanco se quedan vacías para registros viejos.
> El backend ya está preparado para leer/escribir estas 6 columnas con
> `parseFloat` (calif) o string vacío (obs).

### 4. Deploy del backend

Pegar los 7 .gs en Apps Script:
- `backend/Code.gs`
- `backend/lib_sheets.gs`
- `backend/lib_calculos.gs`
- `backend/lib_validaciones.gs`
- `backend/lib_auth.gs`
- `backend/lib_*.gs` (los otros)

**Implementar → Administrar implementaciones → Editar → Nueva versión**.
La URL queda igual.

### 5. Apps Script — crear cuentas de los 3 maestros nuevos

En el editor de Apps Script:

```js
seedMaestrosCompleto(false);
```

Esto crea **solo los faltantes** (M10, M11, M12). Las cuentas existentes
no se tocan.

Credenciales resultantes:

| Maestro | Password |
|---|---|
| M10 | `wundtM10` |
| M11 | `wundtM11` |
| M12 | `wundtM12` |

### 6. Apps Script — generar PINs para los 45预留

```js
seedPINsPadres(false);
```

Genera PINs solo para alumnos sin PIN previo. Los 45预留 de preescolar
reciben PIN de 4 dígitos. Anotar en `docs/CREDENCIALES_2026-08-14.md`
(no en este archivo).

> Cuando se actualice el NombreCompleto de un预留, el PIN sigue siendo
> válido (se busca por AlumnoID).

### 7. Deploy del frontend

Incrementar el `?v=N` en:
- `frontend/docente/index.html` (todos los `<script src="...">` y `<link href="...">`)
- `frontend/padres/index.html` (igual)

Recargar con `Ctrl+Shift+R`.

## Verificación end-to-end

### Preescolar

1. Login `M10 / wundtM10` en `localhost:8080/docente/`.
2. Cargar grupo → 15预留 con nombre "Por definir" (filtrados por
   `MaestroID=M10`).
3. Click "Capturar" → **modal cualitativo** (sin calificación, sin
   asistencia, sin tareas, sin Índice).
4. Seleccionar nivel 3 + observación.
5. "Guardar cambios" → "Guardar Evaluación Grupal".
6. Verificar en Sheets EVALUACIONES:
   - `Calificacion_Numerica` = 0
   - `Indice_Desempeno` = 0
   - `Semaforo` = `Amarillo` (porque nivel 3 = Amarillo)
   - `Pensamiento_Critico` = 3 (donde se guardó el nivel)
   - `Observaciones` = texto capturado
   - Columnas R–W = vacías
7. Login en `localhost:8080/padres/` con `P1.1 / <pin>` →
   tarjeta cualitativa con chip "Logro esperado" + mensaje del docente.
   **Sin odómetros numéricos.**

### Formativos (primaria y secundaria)

1. Login `M01 / wundtM01` (1° primaria). Modal numérico normal + **sección
   "Otros formativos"** debajo de las observaciones.
2. Capturar un alumno con calificación + 4 competencias + asistencia +
   tareas + observaciones, **y además** llenar los 3 formativos:
   - Lenguajes = 8.5
   - Educación Física = 9
   - Computación = 7
   Cada uno con su observación.
3. Guardar → ver en Sheets las 6 columnas nuevas pobladas (R–W).
4. Login padre con un alumno de M01 → tarjeta numérica normal + **bloque
   "Otros formativos"** con 8.5, 9, 7 y sus observaciones.

### Regresión (1°-6° primaria y 1°-3° secundaria)

1. Login con M01–M09. Captura normal, **sin** llenar formativos.
2. La vista padre NO debe mostrar bloque "Otros formativos" (no hay datos).
3. **El Índice calculado debe ser IDÉNTICO** al de antes: el algoritmo
   `calcularIndice()` solo ve calificación + asistencia + tareas + 4
   competencias. Los 3 formativos NO entran.
4. `get_estado_capturas`, `get_analitica_docente`, `get_cobertura` siguen
   funcionando idéntico (los formativos no entran en agregados, KPIs, ni
   series temporales).

### Voz

- En captura cualitativa, el botón 🎤 solo dicta al textarea.
- En captura numérica, comandos `calificación 8`, `asistencia 90`,
  `tareas 12` siguen funcionando.

## Punto de restauración

Si algo se rompe:

1. Restaurar carpeta completa desde
   `C:\Users\leonm\proyectosmarco\WilhelmWundtv2_backup_PreCambios_2026-08-14`.
2. Limpiar localStorage del navegador.
3. Volver a pegar los 7 .gs en Apps Script y desplegar como nueva versión.

Para restaurar UN archivo individual, copiar desde la carpeta snapshot
sobreescribiendo en la carpeta actual.

## Archivos modificados (referencia)

Ver `BITACORA_2026-08-14.txt` para el detalle de cambios por archivo.
