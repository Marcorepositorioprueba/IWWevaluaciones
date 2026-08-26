# Despliegue — Wilhelm Wundt v2

Guía paso a paso para llevar el sistema a producción.

---

## 1. Pre-requisitos

- Acceso de edición al Google Sheets que tiene las hojas `CONFIG`, `ALUMNOS`, etc.
- Una cuenta de Google (cualquier Gmail sirve para Apps Script).
- El ID del spreadsheet (lo encuentras en la URL entre `/d/` y `/edit`).

---

## 2. Crear el proyecto Apps Script

1. Ve a https://script.google.com/home
2. **Nuevo proyecto**.
3. Renómbralo a `WilhelmWundt-v2` (clic en "Proyecto sin título" arriba a la izquierda).
4. **Borra** el `Code.gs` por defecto (viene con una función `myFunction()`).
5. Crea los siguientes archivos (botón `+` junto a "Archivos" → "Secuencia de comandos"):

| Orden | Nombre | Contenido |
|---|---|---|
| 1 | `Code` | `Code.gs` (router principal) |
| 2 | `lib_sheets` | `lib_sheets.gs` |
| 3 | `lib_auth` | `lib_auth.gs` |
| 4 | `lib_calculos` | `lib_calculos.gs` |
| 5 | `lib_validaciones` | `lib_validaciones.gs` |
| 6 | `lib_logs` | `lib_logs.gs` |
| 7 | `diagnostico` | `diagnostico.gs` |

> Apps Script **no acepta archivos con `.gs` en el nombre** del archivo, solo el nombre del módulo. El punto `.gs` se agrega solo.

6. Pega cada archivo en su módulo desde el código local.

---

## 3. Vincular el Spreadsheet

En `Code.gs`, la primera línea debe tener una constante:

```javascript
const SPREADSHEET_ID = 'TU_SPREADSHEET_ID_AQUI';
```

Reemplaza por el ID real (lo sacas de la URL del Sheets: `https://docs.google.com/spreadsheets/d/<ESTE>/edit`).

Alternativamente, si el Apps Script está **contenido en** el Sheets (Archivo → Asociar a spreadsheet), puedes usar `SpreadsheetApp.getActiveSpreadsheet()` sin necesidad del ID. La versión actual usa `getActiveSpreadsheet()` para simplificar el setup — si tu script está en otro proyecto, cambia esa línea por `openById(SPREADSHEET_ID)`.

---

## 4. Configurar Script Properties (secretos)

Las credenciales críticas **nunca** van en el código. Se guardan encriptadas en el project settings:

1. En el editor de Apps Script: **Configuración del proyecto** (engranaje a la izquierda).
2. Baja a **Propiedades del script** > **Agregar propiedad**.
3. Agrega estas dos:

| Propiedad | Valor (ejemplo) | Notas |
|---|---|---|
| `WUNDT_SECRET_HMAC` | `un-string-largo-y-aleatorio-de-32-chars-minimo` | Se usa para firmar sesiones. **No lo pierdas.** |
| `WUNDT_ADMIN_TOKEN` | `otro-string-largo-para-endpoint-de-diagnostico` | Protege `?accion=diagnostico`. |

Puedes generarlos con `crypto.randomBytes(32).toString('hex')` en Node, o inventar uno memorable pero largo. **No uses el token de la versión anterior (`Clavedeoperacion1#`).**

---

## 5. Crear las hojas faltantes

En el editor de Apps Script:

1. Selecciona la función `crearMaestrosAuth()` y dale **Ejecutar**.
2. Acepta los permisos que pida la primera vez (tu cuenta Google).
3. Verás logs: cada maestro (M01-M09) con su **password temporal generado**. **Anótalos** — son las credenciales que vas a entregar.

> Si tu hoja `EVALUACIONES` aún no existe, también la crea automáticamente `crearMaestrosAuth()` (o cualquier función de escritura, en su primer uso). Ver `lib_sheets.gs`.

Para credenciales de padres: cuando una familia te pida acceso, ejecuta:

```javascript
altaAccesoPadre("2.5", "Sra. Hernández");
// Devuelve: { ok: true, alumnoId: "2.5", pin: "1234", mensaje: "..." }
```

Anota el PIN y comunícalo.

---

## 6. Desplegar como Web App

1. **Implementar** (arriba a la derecha) → **Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Configuración:
   - Descripción: `Wundt v2 - Producción`
   - Ejecutar como: **Yo** (tu cuenta)
   - Quién tiene acceso: **Cualquier persona** (para que funcione desde GitHub Pages sin login de Google)
4. **Implementar**.
5. Copia la URL que termina en `/exec`. Esa es tu **API_URL** del backend.

> Cada vez que cambies el código, necesitas **Implementar > Administrar implementaciones > editar > Nueva versión**. Si no, los cambios no se reflejan.

---

## 7. Configurar los frontends

En `frontend/docente/assets/js/api.js` y `frontend/padres/assets/js/api.js`:

```javascript
export const API_URL = 'https://script.google.com/macros/s/<TU_DEPLOYMENT_ID>/exec';
```

---

## 8. Subir frontends a GitHub Pages

### Opción A — Mismo repo, dos páginas

```
/docs/docente.html   → /docente
/docs/padres.html    → /padres
```

GitHub Pages sirve `/docs` si en Settings → Pages seleccionas "Branch: main, folder: /docs".

### Opción B — Dos repos

- `wundt-docente` → GitHub Pages en root
- `wundt-padres` → GitHub Pages en root

Más limpio. Cada uno con su `index.html`.

---

## 9. Smoke test post-deploy

Corre en el navegador:

```
https://script.google.com/.../exec?accion=health
```

Debe devolver:

```json
{ "status": "ok", "version": "2.0", "servidor": "wundt" }
```

Si no, revisa `BACKUP_LOGS` (la hoja con ese nombre) o los logs de "Ejecuciones" en Apps Script.

---

## 10. Rollback

Si la nueva versión falla en producción:

1. En Apps Script: **Implementar > Administrar implementaciones**.
2. Selecciona una versión anterior → **Implementar**.
3. Cambia la URL en `api.js` de los frontends por la de la versión vieja.

Las versiones anteriores siguen activas hasta que las "archives".

---

## Resumen de URLs

| Recurso | URL |
|---|---|
| Backend API | `https://script.google.com/macros/s/<ID>/exec` |
| Frontend docente | `https://<tu-usuario>.github.io/<repo>/docente/` |
| Frontend padres | `https://<tu-usuario>.github.io/<repo>/padres/` |
| Diagnóstico (protegido) | `GET {URL}?accion=diagnostico&adminToken=<WUNDT_ADMIN_TOKEN>` |

---

## Soporte

- Logs de cada POST → hoja `BACKUP_LOGS`
- Ejecuciones con stack trace → Apps Script > Ejecuciones (ícono de lista a la izquierda)
- Diagnóstico rápido → corre `diagnosticoSheets()` desde el editor
