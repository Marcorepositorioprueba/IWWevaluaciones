# 🗺️ ROADMAP DE IMPLEMENTACIÓN — Wilhelm Wundt v2

**Para:** Marco (dueño del proyecto). Nivel: principiante en Apps Script y deploys web.
**Duración estimada total:** 2-3 horas (sin contar el deploy de GitHub Pages que son 15 min más).
**Filosofía:** Cada paso dice exactamente qué hacer, qué debes ver, y qué hacer si falla. Nunca te quedas atorado sin camino B.

---

## 📋 Antes de empezar — Checklist

Marca cada uno conforme lo tengas:

- [ ] Tienes acceso al Google Sheets compartido: https://docs.google.com/spreadsheets/d/1u9TYPagp0TYeHQQIcRQsxENS61zjdzqaFISYjRFlIsA/edit?gid=1536714593#gid=1536714593
- [ ] Tienes cuenta de Google (cualquier Gmail sirve — la misma que abre el Sheets está perfecto)
- [ ] Tienes un editor de texto decente (VSCode, Notepad++, o incluso el Bloc de Notas)
- [ ] Tienes `node` instalado (opcional, solo si quieres correr los tests locales). Si no lo tienes, sáltate la sección de tests sin preocuparte.
- [ ] Si vas a hacer deploy en GitHub Pages: tienes cuenta en GitHub. Si solo quieres probar en local, puedes saltarte esa parte.

---

## 🎯 Resumen de fases

| Fase | Qué haces | Tiempo |
|---|---|---|
| **0** | Diagnóstico del Sheets (saber si las 6 hojas están bien) | 5 min |
| **1** | Crear proyecto Apps Script y pegar los 7 archivos `.gs` | 15 min |
| **2** | Configurar secretos y crear credenciales seed | 10 min |
| **3** | Desplegar como Web App y obtener la URL | 10 min |
| **4** | Configurar los frontends con la URL | 10 min |
| **5** | Probar end-to-end (login → captura → consulta de padres) | 20 min |
| **6** | Deploy a GitHub Pages (opcional) | 15 min |
| **7** | Plan de contingencia si algo falla | 5 min de lectura |

**Total: ~85 minutos sin deploy en Pages, ~100 con deploy.**

---

# FASE 0 — Diagnóstico del Sheets

## Objetivo
Confirmar que tu Sheets tiene las hojas que el código espera, con los encabezados correctos. Si algo no cuadra, lo arreglamos **antes** de tocar código.

## Pasos

### 0.1 Abre tu Sheets
Click en el link: https://docs.google.com/spreadsheets/d/1u9TYPagp0TYeHQQIcRQsxENS61zjdzqaFISYjRFlIsA/edit

### 0.2 Verifica las hojas (pestañas en la parte inferior)
Deberías ver, en este orden (o similar, el orden no importa):
- ✅ `CONFIG`
- ✅ `ALUMNOS`
- ✅ `EVALUACIONES` (probablemente vacía)
- ❓ `MAESTROS_AUTH` (probablemente NO existe — la creamos en Fase 2)
- ✅ `ACCESOS_PADRES` (vacía)
- ✅ `BACKUP_LOGS` (vacía)

### 0.3 Si te falta alguna hoja (distinta a MAESTROS_AUTH)
Para crearla: click derecho en la última pestaña → "Insertar hoja" → le pones el nombre **EXACTO** (mayúsculas inclusive) → guardar.

### 0.4 Verifica los encabezados de cada hoja

**Hoja CONFIG** — fila 1 debe tener:

| A | B | C |
|---|---|---|
| TIPO | VALOR_ID | DESCRIPCION |

Datos confirmados que ya tienes (M01-M09, periodo 2026-07, 4 competencias, fórmula).

**Hoja ALUMNOS** — fila 1 debe tener:

| A | B | C | D | E |
|---|---|---|---|---|
| AlumnoID | NombreCompleto | Grupo | Grado | MaestroID |

Datos confirmados (135 alumnos).

**Hoja EVALUACIONES** — fila 1 debe tener **17 columnas** en este orden exacto:

| # | Columna |
|---|---|
| A | ID_Registro |
| B | CicloEscolar |
| C | Mes |
| D | AlumnoID |
| E | MaestroID |
| F | Calificacion_Numerica |
| G | Participacion |
| H | Autogestion |
| I | Colaboracion |
| J | Pensamiento_Critico |
| K | Asistencia_Porcentaje |
| L | Tareas_Entregadas |
| M | Observaciones |
| N | Indice_Desempeno |
| O | Nivel_Riesgo |
| P | Semaforo |
| Q | FechaRegistro |

⚠️ **Si tu hoja EVALUACIONES no tiene estos headers exactos**, avísame y te paso un script para crearla.

**Hoja ACCESOS_PADRES** — fila 1 debe tener:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| AlumnoID | PINHash | Salt | TutorNombre | TutorEmail | TutorTelefono | Activo | FechaAlta |

**Hoja BACKUP_LOGS** — fila 1 debe tener:

| A | B | C |
|---|---|---|
| Fecha | Payload | Estado |

### 0.5 Resultado esperado
- Tienes las 6 hojas (o 5 — `MAESTROS_AUTH` la creamos en Fase 2).
- Los encabezados coinciden con los de arriba.

**Si todo cuadra:** pasa a la Fase 1.
**Si hay discrepancias:** avísame con qué difiere y lo arreglamos.

---

# FASE 1 — Crear proyecto Apps Script

## Objetivo
Tener un proyecto en Apps Script con los 7 archivos `.gs` pegados, listo para desplegar.

## Pasos

### 1.1 Crear el proyecto
1. Abre en una pestaña nueva: https://script.google.com/home
2. Click en **"Nuevo proyecto"** (arriba a la izquierda).
3. Se abre el editor con un archivo llamado `Código` que tiene una función `myFunction()`. **Bórrala** (selecciona todo el contenido y reemplázalo con vacío).
4. **Renombra el proyecto**: arriba a la izquierda dice "Proyecto sin título". Click ahí y escribe: `WilhelmWundt-v2`.

### 1.2 Crear los archivos del proyecto
En la barra lateral izquierda ves "Archivos" con un `+`. Vamos a crear 7 archivos.

**Orden de creación** (importa el orden solo para mantener orden visual):

1. Click en `+` → "Secuencia de comandos" → te pide nombre. Escribe: `Code` (sin .gs)
2. Repite para crear:
   - `lib_sheets`
   - `lib_auth`
   - `lib_calculos`
   - `lib_validaciones`
   - `lib_logs`
   - `diagnostico`

Al final debes tener 7 archivos en la barra izquierda, en ese orden.

### 1.3 Pegar el contenido de cada archivo

Para cada archivo:

1. Click en el archivo en la barra izquierda (ej. `Code`).
2. **Borra** cualquier contenido pre-existente.
3. Abre el archivo local correspondiente en tu computadora (están en `C:\Users\leonm\proyectosmarco\WilhelmWundtv2\backend\`).
4. **Copia todo el contenido** (Ctrl+A, Ctrl+C).
5. **Pega** en el editor de Apps Script (Ctrl+V).
6. **Guarda** (Ctrl+S o el icono de disquete).

**Mapeo archivo local → archivo Apps Script:**

| Archivo local | Archivo en Apps Script |
|---|---|
| `Code.gs` | `Code` |
| `lib_sheets.gs` | `lib_sheets` |
| `lib_auth.gs` | `lib_auth` |
| `lib_calculos.gs` | `lib_calculos` |
| `lib_validaciones.gs` | `lib_validaciones` |
| `lib_logs.gs` | `lib_logs` |
| `diagnostico.gs` | `diagnostico` |

### 1.4 Verificación visual
En la barra izquierda deberías ver los 7 archivos. Cada uno debe tener su contenido (no estar vacío).

### 1.5 Si algo falla aquí
- **"No puedo crear el archivo"**: asegúrate de no tener un archivo seleccionado cuando das `+`. Click en un espacio vacío de la barra primero.
- **"Me sale error de sintaxis al pegar"**: ábreme el archivo problemático y pásame screenshot del error. Probablemente hay un caracter raro al copiar.

---

# FASE 2 — Configurar secretos y credenciales

## Objetivo
Crear las claves secretas (HMAC, admin token) y generar las credenciales iniciales de los 9 maestros.

## Pasos

### 2.1 Abrir Project Settings
En el editor de Apps Script: click en el **engranaje** ⚙️ (icono de configuración) en la barra izquierda, abajo.

### 2.2 Agregar Script Properties
Baja hasta la sección **"Propiedades del script"**. Click en **"Agregar propiedad"**.

**Propiedad 1:**
- Propiedad: `WUNDT_SECRET_HMAC`
- Valor: ábrelo en un bloc de notas nuevo y escribe algo como `wundt-2026-julio-marco-wundt-secret-key-v2` (mínimo 32 caracteres, mejor si es aleatorio). Si quieres ser más seguro, abre https://passwords.google.com/ y genera uno de 32+ chars.

Click "Guardar".

**Propiedad 2:**
- Propiedad: `WUNDT_ADMIN_TOKEN`
- Valor: otra cadena larga aleatoria, ej: `wundt-admin-token-2026-marco-9f8e7d6c5b4a3210`

Click "Guardar".

**⚠️ IMPORTANTE:** guarda estos dos valores en un lugar seguro (un archivo `.txt` en tu escritorio). Si los pierdes, todas las sesiones emitidas se invalidan y tienes que pedir a los usuarios que re-inicien sesión.

### 2.3 Volver al editor
Click en `<>` (icono de código) arriba a la izquierda para volver al editor de código.

### 2.4 Ejecutar crearMaestrosAuth()
1. En la barra de funciones (arriba, junto al botón "Ejecutar"), selecciona: **`crearMaestrosAuth`**
2. Click en **"Ejecutar"** (▶).
3. **Primera vez te pide autorización**:
   - Sale un popup "Autorización necesaria"
   - Click "Revisar permisos"
   - Elige tu cuenta de Google
   - Sale "Esta app no está verificada" → click "Avanzado" → "Ir a WilhelmWundt-v2 (no seguro)"
   - Click "Permitir"
4. **Espera 5-10 segundos**. La ejecución termina.
5. Click en **"Ejecuciones"** (icono de lista en la barra izquierda) → click en la última ejecución → expande los logs.

### 2.5 Resultado esperado
Verás algo así en los logs:

```
=== CREAR MAESTROS_AUTH ===
Credenciales generadas:
  M01  →  K7H9M2XP
  M02  →  B3F4N8QR
  M03  →  T5J6W9YZ
  ... (hasta M09)
✅ MAESTROS_AUTH lista.
```

### 2.6 GUARDAR ESTOS PASSWORDS
**CRÍTICO:** Copia esta lista a un archivo seguro. Cada uno de los 9 maestros necesita su password. Ejemplo:

```
M01: K7H9M2XP (Maestro primero)
M02: B3F4N8QR (Maestro segundo)
...
```

Si pierdes esto, tienes que ejecutar de nuevo pero antes borrar las filas existentes en `MAESTROS_AUTH`.

### 2.7 Verificación: abrir MAESTROS_AUTH en Sheets
Ve al Sheets → busca la pestaña `MAESTROS_AUTH`. Debe tener 10 filas (1 header + 9 maestros). Columnas A-E con datos (MaestroID, hash, salt, true, vacío).

### 2.8 Si algo falla aquí

| Síntoma | Solución |
|---|---|
| "No tengo permisos" | Repite paso 2.4, aceptando todos los permisos |
| "Hoja ALUMNOS no encontrada" | Falta la hoja, ve a Fase 0 y créala |
| "Hoja CONFIG no encontrada" | Igual, créala |
| Sale un error rojo extraño | Ábreme screenshot |

---

# FASE 3 — Desplegar como Web App

## Objetivo
Obtener la URL del backend que llamarás desde el frontend.

## Pasos

### 3.1 Crear nueva implementación
Arriba a la derecha: **"Implementar"** → **"Nueva implementación"**.

### 3.2 Configurar
Sale un diálogo con un engranaje ⚙️. Click ahí y elige **"Aplicación web"**.

Llena:

- **Descripción**: `Wundt v2 - Producción`
- **Ejecutar como**: **Yo** (tu correo)
- **Quién tiene acceso**: **Cualquier persona**

### 3.3 Implementar
Click **"Implementar"**.

### 3.4 Copiar la URL
Te muestra una pantalla con la URL del Web App. Es algo como:

```
https://script.google.com/macros/s/AKfycby...larga.../exec
```

**📋 Cópiala y guárdala.** La vas a necesitar en la Fase 4.

Click "Listo".

### 3.5 Probar el health check
Abre una pestaña nueva del navegador y pega la URL seguida de `?accion=health`:

```
https://script.google.com/macros/s/AKfycby.../exec?accion=health
```

**Resultado esperado:** un JSON como:

```json
{"status":"ok","version":"2.0","servidor":"wundt"}
```

Si lo ves: ¡el backend funciona! ✅
Si ves un error: revisa el paso 3.2 — "Cualquier persona" es necesario.

---

# FASE 4 — Configurar los frontends

## Objetivo
Pegar la URL del backend en los archivos `api.js` de docente y padres.

## Pasos

### 4.1 Abrir los archivos
Con tu editor de texto (VSCode, Bloc de Notas++), abre:

1. `C:\Users\leonm\proyectosmarco\WilhelmWundtv2\frontend\docente\assets\js\api.js`
2. `C:\Users\leonm\proyectosmarco\WilhelmWundtv2\frontend\padres\assets\js\api.js`

### 4.2 Reemplazar la URL
En cada archivo, busca esta línea (está al inicio):

```javascript
const API_URL = 'https://script.google.com/macros/s/TU_DEPLOYMENT_ID_AQUI/exec';
```

Reemplaza `TU_DEPLOYMENT_ID_AQUI` por el ID real que copiaste en el paso 3.4.

Queda así (ejemplo):

```javascript
const API_URL = 'https://script.google.com/macros/s/AKfycbyMzX9pK2...largo.../exec';
```

**Guarda ambos archivos.**

### 4.3 Verificación
Abre cualquiera de los dos `api.js` en un editor y verifica que la URL es la real (no la del placeholder).

---

# FASE 5 — Probar end-to-end

## Objetivo
Confirmar que el flujo completo funciona: docente inicia sesión → captura → guarda → padre consulta.

## Opción A: Probar en local (sin GitHub Pages)

### 5A.1 Probar el frontend docente
1. Ve a la carpeta: `C:\Users\leonm\proyectosmarco\WilhelmWundtv2\frontend\docente\`
2. Doble click en `index.html`. Se abre en tu navegador.
3. Aparece la portada animada. Click "Iniciar Captura".
4. Pantalla de login. Ingresa `M01` y el password que te dio `crearMaestrosAuth()`.
5. Selecciona un mes y click "Cargar Grupo". Deben aparecer los 15 alumnos de Primero.
6. Click en "Editar" sobre un alumno. Llena los campos. Click 🎤 si quieres probar el dictado.
7. Click "Guardar y volver".
8. Cuando termines todos, click "Guardar Evaluación Grupal".

**Resultado esperado:** toast verde "15 evaluaciones guardadas correctamente".

### 5A.2 Verificar en Sheets
Abre `EVALUACIONES` en tu Sheets. Deben aparecer 15 filas nuevas con todos los campos llenos, incluyendo `Indice_Desempeno`, `Nivel_Riesgo` y `Semaforo`.

### 5A.3 Dar de alta un padre
1. En el editor de Apps Script, selecciona la función **`altaAccesoPadre`** en el dropdown.
2. Cambia los argumentos. Ejemplo para probar: `altaAccesoPadre("2.5", "Sra. Hernandez")`
3. Click "Ejecutar".
4. Ve a "Ejecuciones" → última → logs. Verás algo como:
   ```json
   {"ok":true,"alumnoId":"2.5","pin":"1234","mensaje":"..."}
   ```
5. **Anota el PIN** (ej. 1234).

### 5A.4 Probar el frontend padres
1. Ve a la carpeta: `C:\Users\leonm\proyectosmarco\WilhelmWundtv2\frontend\padres\`
2. Doble click en `index.html`.
3. Ingresa AlumnoID: `2.5` y el PIN: `1234`.
4. Click "Consultar".

**Resultado esperado:** aparece el dashboard con una card del mes que acabas de capturar. Click en "Ver narrativa completa" para ver la frase generada.

## Opción B: Probar con curl (más técnico)

Si prefieres verificar sin abrir los HTML, usa curl desde la terminal:

```bash
# Health
curl "https://script.google.com/.../exec?accion=health"

# Auth maestro (reemplaza TU_DEPLOY y password)
curl -X POST "https://script.google.com/.../exec" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"auth_maestro","maestroId":"M01","password":"K7H9M2XP"}'
```

Si ves JSON con `ok:true` y `sesionToken`, todo bien.

## Si algo falla — consulta esta tabla

| Síntoma | Causa probable | Solución |
|---|---|---|
| No aparece la portada | El HTML no carga los assets | Verifica que la carpeta `img/` exista o que el `onerror` esté ocultando la imagen |
| Login falla con "Credenciales inválidas" | Password mal copiado | Vuelve a Fase 2, ejecuta `crearMaestrosAuth()` de nuevo si perdiste los passwords |
| "Hoja no encontrada" | Falta una hoja en Sheets | Vuelve a Fase 0 |
| "CORS error" en consola | Frontend no configuró la URL | Verifica Fase 4 |
| "SESION_INVALIDA" en cada request | El `WUNDT_SECRET_HMAC` cambió | Si lo cambiaste, todos los usuarios tienen que re-loguear |
| Sheets no muestra filas nuevas | El `save_evaluaciones` falló | Revisa `BACKUP_LOGS` en Sheets, ahí está el error |

---

# FASE 6 — Deploy a GitHub Pages (opcional)

## Objetivo
Hacer que el frontend sea accesible desde cualquier dispositivo (no solo tu computadora).

## Pasos

### 6.1 Crear repositorio en GitHub
1. Ve a https://github.com/new
2. Nombre: `wilhelm-wundt-v2` (o el que quieras)
3. Privado o público: tu decisión (privado = solo tú lo ves; público = cualquiera con la URL puede entrar al portal de padres)
4. **NO inicialices con README** (lo harás manualmente)
5. Click "Create repository"

### 6.2 Subir los archivos
GitHub te da las instrucciones. La forma más fácil:

1. Instala GitHub Desktop (https://desktop.github.com/) si no tienes git en línea de comandos.
2. Clona el repo:
   ```
   git clone https://github.com/TU_USUARIO/wilhelm-wundt-v2.git
   ```
3. Copia todo el contenido de `C:\Users\leonm\proyectosmarco\WilhelmWundtv2\frontend\` dentro del repo clonado.
4. Commit y push.

### 6.3 Activar Pages
1. En GitHub, ve al repo → Settings → Pages
2. **Source**: `Deploy from a branch`
3. **Branch**: `main`, folder: `/ (root)`
4. Click Save

### 6.4 Esperar 1-2 minutos
Te aparece una URL como: `https://tu-usuario.github.io/wilhelm-wundt-v2/`

### 6.5 Estructura de URLs
Con la estructura actual del frontend, las URLs son:

- Portal docente: `https://tu-usuario.github.io/wilhelm-wundt-v2/docente/`
- Portal padres: `https://tu-usuario.github.io/wilhelm-wundt-v2/padres/`

Si quieres que sea la raíz (ej. solo `/docente`), reorganiza los archivos para que `index.html` esté en la raíz y mete `padres/` y `docente/` como subcarpetas.

### 6.6 Si algo falla
- **404 en GitHub Pages**: espera 5 minutos, a veces tarda. Verifica que el branch y folder estén bien.
- **"Page build failed"**: revisa Settings → Pages para ver el error exacto.
- **Las imágenes no cargan**: las rutas son relativas (`../compartido/assets/img/...`). GitHub Pages las respeta.

---

# FASE 7 — Plan de contingencia (importante)

## Si me pierdes de vista / no estoy disponible

### Qué hacer si...

#### "El backend dejó de responder"
1. Abre Apps Script → "Ejecuciones" (icono de lista)
2. Click en la última ejecución fallida
3. Lee el log de error
4. Si es "Hoja no encontrada" → revisa Fase 0
5. Si es "SHEETS_ERROR" → puede ser que pasaste el límite de cuota de Apps Script (poco probable). Espera 5 minutos.

#### "Los datos no se guardan"
1. Ve a `BACKUP_LOGS` en tu Sheets
2. Las últimas filas muestran los intentos. Busca filas con `Estado: ERROR: ...`
3. El mensaje de error te dice qué campo falló

#### "El maestro no puede entrar"
1. Verifica que su fila existe en `MAESTROS_AUTH`
2. Verifica que la columna `Activo` dice `true`
3. Si dice `false`, cámbialo a `true` directamente en Sheets
4. Si no existe la fila, ejecuta `altaMaestrosSeed()` en el editor

#### "El padre no puede entrar"
1. Verifica que hay una fila en `ACCESOS_PADRES` para ese AlumnoID
2. Verifica que `Activo` dice `true`
3. Si no existe, ejecuta `altaAccesoPadre("ALUMNO_ID", "Nombre Tutor")`

#### "Quiero cambiar la fórmula del índice" (cambio 2026-08-22)
1. Ve a Sheets → hoja `CONFIG`
2. Busca la fila con `TIPO = FORMULA_INDICE`
3. Edita la columna `VALOR_ID` con `v1` (default 50/20/15/15) o `v2` (balanceada 35/25/15/25)
4. El próximo cálculo usa la nueva fórmula. No necesitas redeploy.
5. Para agregar una fórmula nueva (ej. `v3`): editar el dict `FORMULAS_INDICE_` en `backend/lib_calculos.gs` y redeploy.

#### "Quiero agregar más maestros"
1. Agrega una fila a `CONFIG` con `TIPO=Maestro`, el nuevo `VALOR_ID` (ej. M10) y `DESCRIPCION` con el nombre
2. Ejecuta `altaMaestrosSeed()` en el editor — solo agrega los que faltan, no duplica los existentes
3. Anota el nuevo password

#### "Quiero agregar un padre nuevo"
1. Ejecuta `altaAccesoPadre("alumnoId", "Nombre del Tutor")` en el editor
2. Anota el PIN que devuelve
3. Comunícalo al tutor por WhatsApp/mensaje

#### "Necesito resetear todo"
Si quieres empezar de cero:
1. Borra todas las filas (excepto header) de `EVALUACIONES`
2. Borra todas las filas (excepto header) de `MAESTROS_AUTH` (tendrás que regenerar passwords)
3. Borra todas las filas (excepto header) de `ACCESOS_PADRES` (tendrás que regenerar PINs)
4. Ejecuta `crearMaestrosAuth()` de nuevo
5. Ejecuta `altaAccesoPadre(...)` para cada familia

---

# 📞 Resumen ejecutivo (1 página)

Si solo tienes 5 minutos, lee esto:

1. **Verifica Sheets** tiene 6 hojas (o 5 — `MAESTROS_AUTH` se crea).
2. **Crea proyecto** en script.google.com, pega los 7 archivos `.gs`.
3. **Configura Script Properties**: `WUNDT_SECRET_HMAC` y `WUNDT_ADMIN_TOKEN`.
4. **Ejecuta** `crearMaestrosAuth()` → anota los 9 passwords.
5. **Despliega** como Web App → copia la URL.
6. **Edita los `api.js`** de docente y padres con esa URL.
7. **Abre `index.html`** de cada uno en tu navegador y prueba.
8. **(Opcional) Sube a GitHub Pages**.

**Tiempo total:** ~85 minutos para tener todo funcionando en local.

**Si te atoras:** el 90% de las veces el problema está en una hoja mal nombrada, un password mal copiado, o la URL mal pegada. Empieza por ahí antes de pedir ayuda.

---

# 📎 Anexo: Comandos útiles del editor de Apps Script

| Función | Para qué |
|---|---|
| `diagnosticoSheets()` | Ver estado completo del sistema |
| `crearMaestrosAuth()` | Generar credenciales de docentes (solo si no existen) |
| `altaAccesoPadre("2.5", "Tutor")` | Generar PIN para un padre |
| `altaMaestrosSeed()` | Solo agrega maestros faltantes |
| `probarFormulaIndice()` | Test de la fórmula con 3 casos |
| `diagnosticoRapido()` | Resumen de cuentas |

---

# 📎 Anexo: Estructura final del proyecto

```
WilhelmWundtv2/
├── README.md                    ← guía de inicio
├── ROADMAP.md                   ← este archivo (léeme primero)
├── docs/
│   ├── esquema_datos.md         ← mapa del Sheets
│   ├── api_contrato.md          ← referencia API
│   └── casos_prueba.md          ← checklist QA
├── backend/
│   ├── Code.gs                  ← router
│   ├── lib_sheets.gs
│   ├── lib_auth.gs
│   ├── lib_calculos.gs
│   ├── lib_validaciones.gs
│   ├── lib_logs.gs
│   ├── diagnostico.gs
│   └── DEPLOY.md                ← paso a paso del deploy (versión corta)
├── frontend/
│   ├── compartido/assets/{css,img}/
│   ├── docente/                 ← frontend maestro
│   │   ├── index.html
│   │   └── assets/js/{api,ui,modelos,voz}.js
│   └── padres/                  ← frontend padres
│       ├── index.html
│       └── assets/js/{api,ui,narrativa}.js
└── test_local.js                ← tests opcionales con `node`
```

---

**Última nota:** Este roadmap se actualiza conforme发现的bug. Si encuentras algo no documentado, anótalo y me lo pasas para que lo agregue.

¡Éxito! 🚀