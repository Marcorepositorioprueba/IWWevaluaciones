# Casos de prueba — Wilhelm Wundt v2

Checklist para validar el sistema **antes** de pasarlo a los usuarios. Cada paso dice exactamente qué hacer y qué resultado esperar.

---

## Pre-requisitos

- Hoja de Sheets con las 6 hojas creadas (`CONFIG`, `ALUMNOS`, `EVALUACIONES`, `MAESTROS_AUTH`, `ACCESOS_PADRES`, `BACKUP_LOGS`).
- Apps Script con los 8 archivos `.gs` cargados (ver `backend/DEPLOY.md`).
- URL del Web App desplegado (la que te dio "Implementar > Nueva implementación").

---

## Bloque 1 — Diagnóstico

### 1.1 Estructura del Sheets

```bash
# En el editor de Apps Script, selecciona la función:
diagnosticoSheets()
# Ejecutar.
```

**Esperado:** imprime algo como:

```
✓ CONFIG         16 filas | headers OK
✓ ALUMNOS       135 filas | headers OK
✓ EVALUACIONES    0 filas | headers OK
✓ MAESTROS_AUTH   9 filas | headers OK (si ya corriste crearMaestrosAuth)
✓ ACCESOS_PADRES  0 filas | headers OK
✓ BACKUP_LOGS     0 filas | headers OK

✅ Sistema listo para producción.
```

Si alguna marca `headers con problemas`, abre `docs/esquema_datos.md` y compara.

### 1.2 Crear credenciales seed

```javascript
// En el editor:
crearMaestrosAuth()       // crea la hoja si no existe y 9 filas seed con passwords temporales
altaAccesoPadre("2.5")   // crea acceso para alumno 2.5, devuelve PIN
```

Anota los passwords generados y el PIN. Comunícalos.

### 1.3 Health check desde navegador

```
https://script.google.com/.../exec?accion=health
```

**Esperado:** `{"status":"ok","version":"2.0","servidor":"wundt"}`

---

## Bloque 2 — Backend (con curl o navegador)

### 2.1 Auth maestro

```bash
curl -X POST "https://script.google.com/.../exec" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"auth_maestro","maestroId":"M01","password":"<password-temporal>"}'
```

**Esperado:** `{ok:true, nombre:"Maestro primero", sesionToken:"...", expiraEn:"..."}`

- [ ] Si `password` es incorrecto → `error: "Credenciales inválidas"`
- [ ] Si `M99` (no existe) → `error: "Maestro no encontrado"`

### 2.2 Get alumnos

```bash
curl -X POST "..." -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"get_alumnos","sesionToken":"<TOKEN>","maestroId":"M01"}'
```

**Esperado:** array con alumnos de Primero (15 alumnos si los datos están cargados).

- [ ] Si el token es inválido → `errorCode: "SESION_INVALIDA"`

### 2.3 Save evaluaciones

```bash
curl -X POST "..." -H "Content-Type: text/plain;charset=utf-8" \
  -d '{
    "action":"save_evaluaciones",
    "sesionToken":"<TOKEN>",
    "cicloEscolar":"2026-07",
    "mes":"Agosto",
    "evaluaciones":[
      {"alumnoId":"1.1","calificacion":9.5,"participacion":4,"autogestion":3,"colaboracion":4,"pensamiento":4,"asistencia":95,"tareas":12,"observaciones":"Excelente mes."}
    ]
  }'
```

**Esperado:**

- `ok:true`
- `registros` con 1 entrada que tiene `indice`, `semaforo`, `riesgo` calculados
- En `EVALUACIONES` debe aparecer 1 fila nueva con `FechaRegistro` reciente

- [ ] Validar que `calificacion=11` → error de validación, no se guarda
- [ ] Validar que `alumnoId="99.99"` (no existe) → ese registro va a `errores`, los demás sí se guardan
- [ ] Validar re-envío con mismo `alumnoId+Mes+Ciclo` → debe actualizar, NO agregar fila nueva (cuenta de filas en `EVALUACIONES` no debe crecer)

### 2.4 Auth padre

```bash
curl -X POST "..." -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"auth_padre","alumnoId":"2.5","pin":"<PIN>"}'
```

**Esperado:** `{ok:true, nombreAlumno:"HERNANDEZ LEON ...", sesionToken:"..."}`

- [ ] PIN incorrecto → `error: "PIN incorrecto"` (no dice "no existe")

### 2.5 Historial padre

```bash
curl -X POST "..." -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"get_historial_padre","sesionToken":"<TOKEN-PADRE>","alumnoId":"2.5"}'
```

**Esperado:** historial con las evaluaciones guardadas en 2.x.

- [ ] Intentar leer `alumnoId="1.5"` con el token del padre de 2.5 → `errorCode: "ACCESO_DENEGADO"`

---

## Bloque 3 — Frontend docente

### 3.1 Abrir

Abre `frontend/docente/index.html` en el navegador.

### 3.2 Portada

- [ ] Aparece la portada con animación lenta.
- [ ] Botón "Iniciar" oculta portada y muestra login.

### 3.3 Login

- [ ] Ingresar M01 + password correcta → muestra "Bienvenido, Maestro primero".
- [ ] Ingresar password incorrecta → mensaje de error, sin exponer detalles.

### 3.4 Selector de mes

- [ ] Dropdown con 12 meses.
- [ ] Botón "Cargar grupo" trae 15 alumnos.

### 3.5 Tabla de captura (modo lista)

- [ ] Tabla con 15 filas, una por alumno.
- [ ] Botones 1-4 visibles con etiqueta humana ("Necesita apoyo" → "Desempeño excepcional").
- [ ] Al hacer click, el botón se activa y se desactiva el anterior.
- [ ] TAB navega del primer input al siguiente en orden (calificación → pensamiento → participación → autogestión → colaboración → asistencia → tareas).
- [ ] En móvil (ancho 360px), inputs no se desbordan.

### 3.6 Dictado por voz

- [ ] Click en 🎤 → pide permiso de micrófono (en Chrome/Safari).
- [ ] Al hablar, el textarea se rellena en tiempo real.
- [ ] Click otra vez → detiene y cierra.
- [ ] Si el browser no soporta → botón 🎤 no aparece.

### 3.7 Guardar

- [ ] Botón "Guardar grupo" → spinner → respuesta del backend.
- [ ] Si todo OK → toast verde "15 registros guardados".
- [ ] Si hay errores parciales → toast amarillo "13 guardados, 2 con errores".

### 3.8 Persistencia

- [ ] Recargar la página → sigue la sesión (gracias a `sessionStorage`).
- [ ] Cerrar la pestaña → se cierra sesión.

---

## Bloque 4 — Frontend padres

### 4.1 Abrir

Abre `frontend/padres/index.html`.

### 4.2 Login

- [ ] Ingresar `2.5` + PIN correcto → carga dashboard.

### 4.3 Dashboard

- [ ] Header con nombre del alumno.
- [ ] Una card por mes capturado.
- [ ] Card muestra: mes, semáforo (color), índice, asistencia, "Ver narrativa".
- [ ] Click en "Ver narrativa" expande y muestra la frase generada por `narrativa.js`.

### 4.4 Narrativa generada

Casos de prueba contra la función `generarNarrativa(ev)`:

| Caso | Esperado |
|---|---|
| Semaforo=Verde, cal=9.5, asi=95, comp=3.8 | Empieza con "¡Excelentes noticias!" |
| Semaforo=Amarillo, cal=7, asi=90, comp=3 | "avanza, con áreas por fortalecer" |
| Semaforo=Rojo, asi=70 | "por debajo del 80% recomendado" |
| Observaciones del maestro presentes | Aparece entre comillas |
| Siempre | Termina con "— Equipo docente, Instituto Wilhelm Wundt" |

### 4.5 Errores

- [ ] PIN incorrecto → "PIN incorrecto" (no dice si el alumno existe).
- [ ] Sin evaluaciones guardadas → "Aún no hay evaluaciones para este alumno".

---

## Bloque 5 — Seguridad

- [ ] Inspeccionar frontend → no aparece ningún password ni token de operación.
- [ ] Inspeccionar network → requests van con `Content-Type: text/plain;charset=utf-8`.
- [ ] Cambiar manualmente `sesionToken` en sessionStorage → próxima acción devuelve `SESION_INVALIDA`.
- [ ] Forzar POST con token viejo (>12h) → misma respuesta.

---

## Aprobación

Una vez todos los checkboxes estén ✅, el sistema está listo para producción. Sube los frontends a GitHub Pages (ver `backend/DEPLOY.md`) y entrega las credenciales a cada maestro/padre por canal seguro.

Si algo falla, revisa `BACKUP_LOGS` — todo POST queda registrado con timestamp + payload + estado.
