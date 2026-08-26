# Contrato de API — Wilhelm Wundt v2

URL base: la URL de Web App que te da Apps Script al desplegar (termina en `/exec`).
Headers: `Content-Type: text/plain;charset=utf-8` para evitar preflight CORS.

Todas las respuestas son JSON. **Nunca** devuelvo HTML, salvo error 500.

---

## Identificadores comunes

| Campo | Tipo | Descripción |
|---|---|---|
| `action` | string | La acción a ejecutar |
| `sesionToken` | string | Token HMAC que expira a las 12h |
| `ok` | bool | `true` si la operación fue exitosa |
| `error` | string | Mensaje legible si `ok=false` |

---

## GET — Health check

```http
GET {URL}?accion=health
```

**Respuesta:**
```json
{ "status": "ok", "version": "2.0", "servidor": "wundt" }
```

---

## GET — Diagnóstico (protegido)

```http
GET {URL}?accion=diagnostico&adminToken=<secretsAdminToken>
```

**Respuesta:**
```json
{
  "ok": true,
  "hojas": {
    "CONFIG":         { "existe": true,  "filas": 16,  "headersOk": true },
    "ALUMNOS":        { "existe": true,  "filas": 135, "headersOk": true },
    "EVALUACIONES":   { "existe": true,  "filas": 0,   "headersOk": true },
    "MAESTROS_AUTH":  { "existe": true,  "filas": 9,   "headersOk": true },
    "ACCESOS_PADRES": { "existe": true,  "filas": 0,   "headersOk": true },
    "BACKUP_LOGS":    { "existe": true,  "filas": 0,   "headersOk": true }
  }
}
```

---

## POST — Auth Maestro

```json
{
  "action": "auth_maestro",
  "maestroId": "M01",
  "password": "stringPlano"
}
```

**Respuesta exitosa:**
```json
{
  "ok": true,
  "nombre": "Maestro primero",
  "sesionToken": "abc123...",
  "expiraEn": "2026-07-28T12:00:00Z",
  "maestroId": "M01"
}
```

**Errores:**
- `error: "Maestro no encontrado"` → si `MaestroID` no existe en `CONFIG` o `MAESTROS_AUTH`
- `error: "Credenciales inválidas"` → si la password no coincide
- `error: "Cuenta desactivada"` → si `Activo=false`

---

## POST — Auth Padre

```json
{
  "action": "auth_padre",
  "alumnoId": "2.5",
  "pin": "1234"
}
```

**Respuesta exitosa:**
```json
{
  "ok": true,
  "nombreAlumno": "HERNANDEZ LEON SERGIO LEONARDO",
  "alumnoId": "2.5",
  "sesionToken": "xyz789...",
  "expiraEn": "2026-07-28T12:00:00Z"
}
```

**Errores:**
- `error: "Alumno no encontrado"`
- `error: "PIN incorrecto"` (NO decir "no existe" para no filtrar información)

---

## POST — Get Alumnos (por maestro)

```json
{
  "action": "get_alumnos",
  "sesionToken": "abc123...",
  "maestroId": "M01"
}
```

**Respuesta:**
```json
{
  "ok": true,
  "alumnos": [
    { "alumnoId": "1.1",  "nombre": "Por definir", "grupo": "Unico", "grado": "Primero" },
    { "alumnoId": "1.2",  "nombre": "Por definir", "grupo": "Unico", "grado": "Primero" }
    // ...
  ]
}
```

Solo devuelve alumnos cuya `NombreCompleto` no sea exactamente `"Por definir"` (filtramos los huecos).

---

## POST — Save Evaluaciones (masivo)

**Modo numérico** (primaria 1°-6° y secundaria 1°-3°, _calificadores con calificación 0-10_):

```json
{
  "action": "save_evaluaciones",
  "sesionToken": "abc123...",
  "cicloEscolar": "2026-07",
  "mes": "Agosto",
  "evaluaciones": [
    {
      "alumnoId": "1.1",
      "calificacion": 9.5,
      "participacion": 4,
      "autogestion": 3,
      "colaboracion": 4,
      "pensamiento": 4,
      "asistencia": 95,
      "tareas": 12,
      "observaciones": "Excelente mes."
    }
  ]
}
```

**Modo cualitativo** (preescolar, _cambio 2026-08-20_): 3 niveles por dimensión + 10 sub-observaciones + observación general.

```json
{
  "action": "save_evaluaciones",
  "sesionToken": "abc123...",
  "cicloEscolar": "2026-07",
  "mes": "Agosto",
  "evaluaciones": [
    {
      "alumnoId": "K1.1",
      "desempenoCognitivo": 4,
      "desempenoSocioemocional": 3,
      "desempenoFisico": 3,
      "observaciones": "Buen avance general.",
      "obsAprendizaje": "Identifica colores primarios sin apoyo.",
      "obsComprension": "Sigue instrucciones de 2 pasos.",
      "obsMemoria": "Recuerda canciones de la semana.",
      "obsHabilidadesComunicacion": "Se expresa con frases completas.",
      "obsHabilidadesSociales": "Comparte materiales con sus pares.",
      "obsConvivenciaAutogestion": "Tolera frustración con mediación adulta.",
      "obsAutonomiaIndependencia": "Se viste con ayuda parcial.",
      "obsResolucionConflictos": "Recurre a palabras para resolver disputas.",
      "obsMotricidadGruesaFina": "Sostiene el lápiz con pinza trípode.",
      "obsCoordinacionEquilibrio": "Salta en un pie durante 3 segundos."
    }
  ]
}
```

**Validación servidor (cualitativo):**
- Los 3 niveles (`desempenoCognitivo`, `desempenoSocioemocional`, `desempenoFisico`) **obligatorios** ∈ {1,2,3,4}
- Las 10 sub-observaciones **opcionales**, ≤500 chars
- `observaciones` general opcional, ≤500 chars
- El backend calcula los 3 semáforos por dimensión (`Semaforo_Cognitivo`, `Semaforo_Socioemocional`, `Semaforo_Fisico`) y el agregado (`Semaforo_Agregado`)

**Respuesta:**
```json
{
  "ok": true,
  "registros": [
    {
      "alumnoId": "1.1",
      "idRegistro": "EVAL-1723000000000",
      "indice": 9.12,
      "semaforo": "Verde",
      "riesgo": "Bajo"
    }
  ],
  "errores": [],
  "resumen": {
    "total": 15,
    "exitosos": 15,
    "fallidos": 0
  }
}
```

**Errores parciales:** si alguna fila falla validación, va a `errores` y el resto se guarda igual. Cada error trae `alumnoId` y `campo` que falló.

**Re-envío:** si ya existe `AlumnoID + Mes + CicloEscolar`, se actualiza la fila (no se duplica).

---

## POST — Get Historial Padre

```json
{
  "action": "get_historial_padre",
  "sesionToken": "xyz789...",
  "alumnoId": "2.5"
}
```

**Respuesta (alumno numérico):**
```json
{
  "ok": true,
  "alumno": {
    "alumnoId": "2.5",
    "nombre": "HERNANDEZ LEON SERGIO LEONARDO",
    "grado": "Segundo",
    "maestroNombre": "Maestro segundo"
  },
  "historial": [
    {
      "cicloEscolar": "2026-07",
      "mes": "Agosto",
      "calificacion": 8.5,
      "asistencia": 90,
      "indice": 7.85,
      "semaforo": "Verde",
      "riesgo": "Bajo",
      "pensamiento": 3,
      "participacion": 4,
      "autogestion": 3,
      "colaboracion": 3,
      "tareas": 10,
      "observaciones": "Buen desempeño general."
    }
  ]
}
```

**Respuesta (alumno cualitativo/preescolar, cambio 2026-08-20):**
```json
{
  "ok": true,
  "alumno": {
    "alumnoId": "K1.1",
    "nombre": "ALUMNO PREESCOLAR",
    "grado": "Preescolar 1°",
    "maestroNombre": "Maestro M10"
  },
  "historial": [
    {
      "cicloEscolar": "2026-07",
      "mes": "Agosto",
      "semaforo": "Verde",
      "semaforoAgregado": "Verde",
      "desempenoCognitivo": 4,
      "desempenoSocioemocional": 3,
      "desempenoFisico": 4,
      "semaforoCognitivo": "Verde",
      "semaforoSocioemocional": "Amarillo",
      "semaforoFisico": "Verde",
      "obsAprendizaje": "Identifica colores primarios sin apoyo.",
      "obsComprension": "Sigue instrucciones de 2 pasos.",
      "obsMemoria": "Recuerda canciones de la semana.",
      "obsHabilidadesComunicacion": "Se expresa con frases completas.",
      "obsHabilidadesSociales": "Comparte materiales con sus pares.",
      "obsConvivenciaAutogestion": "Tolera frustración con mediación adulta.",
      "obsAutonomiaIndependencia": "Se viste con ayuda parcial.",
      "obsResolucionConflictos": "Recurre a palabras para resolver disputas.",
      "obsMotricidadGruesaFina": "Sostiene el lápiz con pinza trípode.",
      "obsCoordinacionEquilibrio": "Salta en un pie durante 3 segundos.",
      "observaciones": "Buen avance general."
    }
  ]
}
```

> El frontend agrega la **narrativa** (frase humana) localmente con `narrativa.js`. El backend solo manda datos crudos.

---

## POST — Get Cobertura por Grupo (P33, solo ADM/DIR)

Dashboard global de dirección. Devuelve estado del ciclo escolar agrupado por `(grado, grupo)` en lugar de por maestro.

**Acceso restringido**: `maestroId` debe ser `ADM` o `DIR` (validado con `esAdmin_()`).

**Request:**
```json
{
  "action": "get_cobertura_por_grupo",
  "sesionToken": "abc123...",
  "maestroId": "ADM",
  "cicloEscolar": "2026-07",
  "mes": "Agosto"
}
```

**Respuesta:**
```json
{
  "ok": true,
  "cobertura": {
    "porGrupo": [
      {
        "grado": "Primero",
        "grupo": "A",
        "maestroId": "M01",
        "maestroNombre": "María Pérez",
        "totalAlumnos": 20,
        "capturados": 16,
        "pendientes": 4,
        "porcentaje": 80,
        "indicePromedio": 7.4,
        "semaforoCounts": { "Verde": 8, "Amarillo": 6, "Rojo": 2 },
        "modo": "numerico"
      }
      // ... 12 grupos del ciclo
    ],
    "agregados": {
      "totalAlumnos": 200,
      "capturados": 145,
      "pendientes": 55,
      "porcentaje": 73,
      "semaforoCounts": { "Verde": 80, "Amarillo": 50, "Rojo": 15 },
      "indicePromedio": 7.6,
      "gruposCompletos": 8,
      "gruposAtrasados": 1
    }
  }
}
```

---

## POST — Get Alumnos Grupo (P33, solo ADM/DIR)

Drill-down de un grupo. Devuelve alumnos del `(grado, grupo)` con su estado individual del mes.

**Acceso restringido**: `maestroId` debe ser `ADM` o `DIR`.

**Request:**
```json
{
  "action": "get_alumnos_grupo",
  "sesionToken": "abc123...",
  "maestroId": "ADM",
  "cicloEscolar": "2026-07",
  "mes": "Agosto",
  "grado": "Tercero",
  "grupo": "C"
}
```

**Respuesta:**
```json
{
  "ok": true,
  "alumnos": [
    {
      "alumnoId": "03.01",
      "nombre": "Sofía Hernández",
      "capturado": true,
      "semaforo": "Verde",
      "indice": 8.7,
      "observaciones": "Excelente participación en clase, muy atenta a las indicaciones.",
      "fechaCaptura": "2026-08-22"
    },
    {
      "alumnoId": "03.02",
      "nombre": "Diego Ramírez",
      "capturado": false,
      "semaforo": "",
      "indice": null,
      "observaciones": "",
      "fechaCaptura": ""
    }
  ],
  "meta": {
    "grado": "Tercero",
    "grupo": "C",
    "maestroId": "M03",
    "maestroNombre": "Ana Ruiz",
    "totalAlumnos": 15,
    "capturados": 10,
    "pendientes": 5,
    "semaforoCounts": { "Verde": 5, "Amarillo": 3, "Rojo": 2 },
    "indicePromedio": 7.2,
    "modo": "numerico"
  }
}
```

> Modo se determina por `grado`: si empieza con "Preescolar" → `cualitativo` (preescolar usa 3 dimensiones + nivel 1-4); los demás son `numerico`.

---

## Códigos de error comunes

| Código | Cuándo |
|---|---|
| `SESION_INVALIDA` | `sesionToken` expirado o manipulado |
| `SESION_REQUERIDA` | La acción requiere sesión y no vino token |
| `ACCESO_DENEGADO` | El maestro quiere leer alumnos de otro maestro, o el padre quiere leer otro alumno |
| `VALIDACION` | Algún campo está fuera de rango |
| `SHEETS_ERROR` | `SpreadsheetApp` lanzó excepción (cuota, permiso, etc.) |

Todos vienen envueltos en `{ok: false, error: "..."}` con código en `errorCode` cuando aplique.

---

## Fórmula del índice (cambio 2026-08-22)

Las fórmulas del índice están **pre-definidas en código** (`backend/lib_calculos.gs`, dict `FORMULAS_INDICE_`). El usuario elige cuál usar desde CONFIG sin tocar código.

**Configuración en Sheet → hoja CONFIG:**

| TIPO | VALOR_ID | DESCRIPCION |
|---|---|---|
| `FORMULA_INDICE` | `v1` o `v2` | (vacío o nota libre) |

**Fórmulas disponibles:**

| ID | Distribución | Filosofía |
|---|---|---|
| `v1` | 50% cal / 20% asi / 15% tar / 15% comp | Default histórica — más peso a calificación |
| `v2` | 35% cal / 25% asi / 15% tar / 25% comp | Balanceada — más peso a asistencia y competencias |

**Comportamiento:**
- Sin fila en CONFIG → fallback silencioso a `v1`.
- `VALOR_ID` desconocido → fallback a `v1` y warning en log.
- Cambiar entre `v1` y `v2` = editar Sheet, sin redeploy.
- Agregar fórmula nueva (ej. `v3`) = agregar entrada al dict en `lib_calculos.gs` + redeploy.

**Bug histórico resuelto**: el parser de fórmulas (anteriormente basado en mini-parser propio) estaba roto — siempre evaluaba con vars=1. Se reemplazó por funciones puras en código, eliminando el riesgo de fórmulas inválidas.
