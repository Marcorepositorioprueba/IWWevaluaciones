# Esquema de Datos — Google Sheets

Este documento es **la fuente de verdad** sobre cómo está estructurado el Sheets. El backend lee los nombres de hoja y los encabezados de columna **exactamente como aparecen aquí**. Si tu Sheets real difiere, hay que ajustar el código (no al revés).

---

## Hojas del sistema

| Hoja | Propósito | Filas esperadas (vacía al inicio) |
|---|---|---|
| `CONFIG` | Catálogos del sistema (maestros, periodo, competencias, fórmula) | Sí (≈15 filas seed) |
| `ALUMNOS` | Padrón de alumnos | Sí (135 alumnos reales) |
| `EVALUACIONES` | Calificaciones mensuales (17 columnas) | No (se llena al usar) |
| `MAESTROS_AUTH` | Credenciales de docentes (hash + salt) | No (la crea `crearMaestrosAuth()`) |
| `ACCESOS_PADRES` | Credenciales de padres (PIN hasheado) | No (se carga por familia) |
| `BACKUP_LOGS` | Auditoría automática de cada POST | No (se llena solo) |

---

## Hoja: `CONFIG`

| TIPO | VALOR_ID | DESCRIPCION |
|---|---|---|
| Maestro | M01 | Maestro primero |
| Maestro | M02 | Maestro segundo |
| Maestro | M03 | Maestro tercero |
| Maestro | M04 | Maestro cuarto |
| Maestro | M05 | Maestro quinto |
| Maestro | M06 | Maestro sexto |
| Maestro | M07 | Maestro 1ro secun |
| Maestro | M08 | Maestro 2do secun |
| Maestro | M09 | Maestro 3ro secun |
| Periodo | 2026-07 | Ciclo Escolar |
| Categoria | Pensamiento Crítico | Escala 1-4 |
| Categoria | Participación | Escala 1-4 |
| Categoria | Autogestión | Escala 1-4 |
| Categoria | Colaboración | Escala 1-4 |
| Categoria | Asistencia | 0%-100% |
| FORMULA_INDICE | v1 o v2 | (vacío o descripción libre) |

> **Notas:**
> - Los maestros M01-M09 son **identificadores, no nombres reales**. El backend lee la columna `DESCRIPCION` para mostrar el nombre al usuario.
> - **Fórmula del índice (cambio 2026-08-22)**: las fórmulas están pre-definidas en `backend/lib_calculos.gs` (dict `FORMULAS_INDICE_`). `VALOR_ID` elige cuál usar: `v1` = default histórica (50/20/15/15), `v2` = balanceada (35/25/15/25). Cambiar entre fórmulas = editar esta fila en Sheet. Para agregar fórmulas nuevas: editar el dict en código + redeploy.
> - Si agregas más categorías (ej. Creatividad, Liderazgo), simplemente añade filas a esta hoja.

---

## Hoja: `ALUMNOS`

| # | Columna | Tipo | Notas |
|---|---|---|---|
| A | `AlumnoID` | string | Identificador único (ej. `1.1`, `2.5`, `1.3s`). Se conserva con el formato original. |
| B | `NombreCompleto` | string | Apellidos + nombres. Mientras esté "Por definir" no se muestra al padre. |
| C | `Grupo` | string | Por defecto `"Unico"`. Reservado para futuro. |
| D | `Grado` | string | "Primero", "Segundo", "1rosecundaria", etc. |
| E | `MaestroID` | string | FK a `CONFIG.TIPO=Maestro` (M01-M09). |

> Total conocido: **135 alumnos reales** distribuidos en 9 grados.

---

## Hoja: `EVALUACIONES`

Es la hoja crítica. Tiene **exactamente 41 columnas A-AO** (cambio 2026-08-20: extensión de 17 → 41 con 17 columnas nuevas para preescolar 3 dimensiones + 10 sub-observaciones). El backend escribe siempre en este orden.

### Bloque legacy (A-X) — vigente para primaria y secundaria

| # | Columna | Tipo | Lo escribe | Validación |
|---|---|---|---|---|
| A | `ID_Registro` | string auto | backend | `EVAL-{timestamp}` |
| B | `CicloEscolar` | string | backend | leído de `CONFIG` |
| C | `Mes` | string | frontend | uno de: Agosto, Septiembre, Octubre, Noviembre, Diciembre, Enero, Febrero, Marzo, Abril, Mayo, Junio, Julio |
| D | `AlumnoID` | string | frontend | debe existir en `ALUMNOS` |
| E | `MaestroID` | string | frontend | debe existir en `CONFIG` |
| F | `Calificacion_Numerica` | número | frontend | `[0, 10]`, paso 0.5 |
| G | `Participacion` | int 1-4 | frontend | `{1,2,3,4}` |
| H | `Autogestion` | int 1-4 | frontend | `{1,2,3,4}` |
| I | `Colaboracion` | int 1-4 | frontend | `{1,2,3,4}` |
| J | `Pensamiento_Critico` | int 1-4 | frontend | `{1,2,3,4}` |
| K | `Asistencia_Porcentaje` | int 0-100 | frontend | `[0, 100]` |
| L | `Tareas_Entregadas` | int 0-15 | frontend | `[0, 15]` |
| M | `Observaciones` | string | frontend | libre, máx 500 chars |
| N | `Indice_Desempeno` | número 0-10 | **backend** | calculado |
| O | `Nivel_Riesgo` | string | **backend** | "Bajo" / "Medio" / "Alto" |
| P | `Semaforo` | string | **backend** | "Verde" / "Amarillo" / "Rojo" (espejo de `Semaforo_Agregado` AO) |
| Q | `FechaRegistro` | datetime | backend | `new Date()` |
| R | `Len_Calif` | número 0-10 | frontend | opcional, formativo Lenguajes |
| S | `EdFis_Calif` | número 0-10 | frontend | opcional, formativo Ed. Física |
| T | `Comp_Calif` | número 0-10 | frontend | opcional, formativo Computación |
| U | `Len_Obs` | string | frontend | ≤500, formativo Lenguajes |
| V | `EdFis_Obs` | string | frontend | ≤500, formativo Ed. Física |
| W | `Comp_Obs` | string | frontend | ≤500, formativo Computación |
| X | `NombreAlumno` | string | backend | auditoría |

### Bloque preescolar (Y-AO) — 3 dimensiones + 10 sub-observaciones (NUEVO 2026-08-20)

| # | Columna | Tipo | Lo escribe | Validación | Dimensión |
|---|---|---|---|---|---|
| **Y** | `Pensamiento_Cognitivo` | int 1-4 | frontend | `{1,2,3,4}` | Cognitivo |
| **Z** | `Pensamiento_Socioemocional` | int 1-4 | frontend | `{1,2,3,4}` | Socioemocional |
| **AA** | `Pensamiento_Fisico` | int 1-4 | frontend | `{1,2,3,4}` | Físico |
| **AB** | `Obs_Aprendizaje` | string | frontend | ≤500, opcional | Cognitivo |
| **AC** | `Obs_Comprension` | string | frontend | ≤500, opcional | Cognitivo |
| **AD** | `Obs_Memoria` | string | frontend | ≤500, opcional | Cognitivo |
| **AE** | `Obs_Habilidades_Comunicacion` | string | frontend | ≤500, opcional | Socioemocional |
| **AF** | `Obs_Habilidades_Sociales` | string | frontend | ≤500, opcional | Socioemocional |
| **AG** | `Obs_Convivencia_Autogestion` | string | frontend | ≤500, opcional | Socioemocional |
| **AH** | `Obs_Autonomia_Independencia` | string | frontend | ≤500, opcional | Socioemocional |
| **AI** | `Obs_Resolucion_Conflictos` | string | frontend | ≤500, opcional | Socioemocional |
| **AJ** | `Obs_Motricidad_Gruesa_Fina` | string | frontend | ≤500, opcional | Físico |
| **AK** | `Obs_Coordinacion_Equilibrio` | string | frontend | ≤500, opcional | Físico |
| **AL** | `Semaforo_Cognitivo` | string | **backend** | "Verde" / "Amarillo" / "Rojo" | Cognitivo |
| **AM** | `Semaforo_Socioemocional` | string | **backend** | "Verde" / "Amarillo" / "Rojo" | Socioemocional |
| **AN** | `Semaforo_Fisico` | string | **backend** | "Verde" / "Amarillo" / "Rojo" | Físico |
| **AO** | `Semaforo_Agregado` | string | **backend** | "Verde" / "Amarillo" / "Rojo" (= peor de AL, AM, AN) | agregado |

### Mapeo nivel 1-4 → semáforo (cualitativo)

| Nivel | Etiqueta | Semáforo |
|---|---|---|
| 1 | Necesita apoyo | Rojo |
| 2 | En desarrollo | Rojo |
| 3 | Logro esperado | Amarillo |
| 4 | Desempeño sobresaliente | Verde |

`Semaforo_Agregado` (AO) = `peorDeTresSemaforos_(AL, AM, AN)`. Convención: Rojo > Amarillo > Verde.

### Etiquetas humanas para competencias (1-4)

El frontend muestra al docente estas etiquetas en lugar del número crudo:

| Valor | Etiqueta | Color UI |
|---|---|---|
| 1 | Necesita apoyo | Rojo claro |
| 2 | En desarrollo | Amarillo |
| 3 | Logro esperado | Verde claro |
| 4 | Desempeño excepcional | Verde fuerte |

### Fórmula del Índice (modificable en `CONFIG`)

Versión por defecto (escala 0-10):

```
Indice = 0.5*Calificacion
       + 0.2*(Asistencia/100)*10
       + 0.15*(Tareas/15)*10
       + 0.15*((Pensamiento+Participacion+Autogestion+Colaboracion)/4)*2.5
```

Luego se redondea a 2 decimales.

### Semáforo y Riesgo

```
Indice >= 7.5  →  Semaforo=Verde      →  Nivel_Riesgo="Bajo"
Indice >= 6.0  →  Semaforo=Amarillo   →  Nivel_Riesgo="Medio"
Indice <  6.0  →  Semaforo=Rojo       →  Nivel_Riesgo="Alto"
```

### Upsert (evitar duplicados)

El backend busca por la combinación `AlumnoID + Mes + CicloEscolar`:
- Si existe → actualiza esa fila (preserva `ID_Registro` y `FechaRegistro` original)
- Si no existe → appendRow con nuevo `ID_Registro` y `FechaRegistro`

Esto permite que el maestro reenvíe el grupo sin duplicar registros.

---

## Hoja: `MAESTROS_AUTH`

Hoja **nueva**, la crea el backend con la función `crearMaestrosAuth()`. No la toques manualmente salvo que sepas lo que haces.

| # | Columna | Tipo | Lo escribe |
|---|---|---|---|
| A | `MaestroID` | string | seed |
| B | `PasswordHash` | string (SHA-256 hex + salt) | backend o seed inicial |
| C | `Salt` | string (16 bytes hex) | backend o seed inicial |
| D | `Activo` | bool | backend |
| E | `UltimoAcceso` | datetime | backend |

> Contraseñas iniciales temporales se generan con `generarPasswordTemporal(8)`. La idea es que cada maestro la cambie en su primer login (módulo futuro).

---

## Hoja: `ACCESOS_PADRES`

Hoja para credenciales de padres. Se llena familia por familia.

| # | Columna | Tipo | Notas |
|---|---|---|---|
| A | `AlumnoID` | string | FK a `ALUMNOS.AlumnoID`. Puede haber varios tutores por alumno. |
| B | `PINHash` | string | SHA-256 hex |
| C | `Salt` | string | 16 bytes hex |
| D | `TutorNombre` | string | Nombre del padre/madre |
| E | `TutorEmail` | string | Opcional, para futuras notificaciones |
| F | `TutorTelefono` | string | Opcional |
| G | `Activo` | bool | Permitir/deshabilitar acceso |
| H | `FechaAlta` | date | Cuándo se dio de alta |

### Cómo se asigna un PIN a una familia

1. Padres provide su `AlumnoID` y un correo/teléfono.
2. El admin (tú, por ahora) corre una función en el editor: `altaAccesoPadre(alumnoId, nombreTutor)` → genera PIN aleatorio, lo guarda hasheado y **devuelve el PIN en plano** (solo se muestra una vez al correr la función).
3. Tú le comunicas el PIN al padre por el canal que prefieras.

---

## Hoja: `BACKUP_LOGS`

| # | Columna | Tipo | Lo escribe |
|---|---|---|---|
| A | `Fecha` | datetime | backend (cada POST) |
| B | `Payload` | string | backend (truncado a 500 chars) |
| C | `Estado` | string | backend: `"OK"` / `"ERROR: <msg>"` |

> El backend **nunca** aborta un POST por un fallo al escribir en `BACKUP_LOGS` — si la hoja no existe, simplemente no loguea.

---

## Resumen del modelo lógico

```
CONFIG ─────────┐
                ▼
ALUMNOS ─────► EVALUACIONES ◄──┐
   │                            │
   ├──► ACCESOS_PADRES ─────────┤
   │                            │
CONFIG ──► MAESTROS_AUTH ───────┘
                                
BACKUP_LOGS ← todo lo anterior (auditoría)
```

`CONFIG` provee catálogos que validan los datos. `ALUMNOS` es la entidad central. Las evaluaciones la referencian. Los accesos (de maestros y padres) son paralelos y autorizan lectura/escritura. `BACKUP_LOGS` lo ve todo, pero no toca nada.
