# Wilhelm Wundt v2 — Plataforma de Evaluación Integral

Sistema de gestión académica para el Instituto Wilhelm Wundt.
**Frontend estático** (HTML/JS vanilla + Tailwind CDN) + **Backend en Google Apps Script** + **Base de datos en Google Sheets**.

> Versión limpia y reescrita desde cero basada en la lógica del proyecto original (`WilhelmWundtProposal/Projectcalif/`), corrigiendo los problemas de mapeo de hojas, CORS y falta de autenticación.

---

## Características

| Módulo | Características |
|---|---|
| **Docentes** | Login con contraseña · carga de alumnos por maestro · captura en modo lista · TAB navigation · dictado por voz (Web Speech API) · envío masivo mensual |
| **Padres** | Login con AlumnoID + PIN · dashboard con histórico · cards con semáforo · **generador de narrativas** (frases humanas desde datos) |
| **Backend** | Apps Script con router por `action` · auth con hash + salt · upsert de evaluaciones (sin duplicados) · auditoría en `BACKUP_LOGS` · fórmula del índice configurable desde `CONFIG` |
| **Mobile-first** | Todas las interfaces optimizadas para 360px de ancho |

---

## Estructura del proyecto

```
WilhelmWundtv2/
├── README.md
├── docs/
│   ├── esquema_datos.md    # mapa del Sheets
│   ├── api_contrato.md     # request/response de cada acción
│   └── casos_prueba.md     # checklist QA
├── backend/
│   ├── Code.gs             # router principal (doGet, doPost)
│   ├── lib_sheets.gs       # lecturas robustas, upsert
│   ├── lib_auth.gs         # hash, sesiones HMAC
│   ├── lib_calculos.gs     # fórmula índice, semáforo
│   ├── lib_validaciones.gs # schema de entrada
│   ├── lib_logs.gs         # BACKUP_LOGS
│   ├── diagnostico.gs      # función invocable
│   └── DEPLOY.md           # paso a paso
└── frontend/
    ├── compartido/assets/
    │   ├── css/app.css
    │   └── img/
    ├── docente/
    │   ├── index.html
    │   └── assets/js/{api,ui,modelos,voz,narrativa}.js
    └── padres/
        ├── index.html
        └── assets/js/{api,ui,narrativa}.js
```

---

## Quickstart

### 1. Verifica el Sheets

Asegúrate de tener estas 6 hojas (los nombres importan, mayúsculas inclusive):

- `CONFIG` — catálogos (M01-M09, periodo, competencias, fórmula)
- `ALUMNOS` — tus 135 alumnos
- `EVALUACIONES` — 17 columnas vacías
- `MAESTROS_AUTH` *(la crea `crearMaestrosAuth()`)*
- `ACCESOS_PADRES` — vacía
- `BACKUP_LOGS` — vacía

Detalle de cada columna y tipo: `docs/esquema_datos.md`.

### 2. Despliega el backend

Sigue paso a paso `backend/DEPLOY.md`. En resumen:

1. Crear proyecto en https://script.google.com/home
2. Pegar los 7 archivos `.gs`
3. Configurar `WUNDT_SECRET_HMAC` y `WUNDT_ADMIN_TOKEN` en Project Settings
4. Ejecutar `crearMaestrosAuth()` (anotar passwords)
5. Implementar como Web App → copiar URL

### 3. Configura los frontends

Editar `frontend/docente/assets/js/api.js` y `frontend/padres/assets/js/api.js`:

```js
export const API_URL = 'https://script.google.com/macros/s/<TU_ID>/exec';
```

### 4. Sube a GitHub Pages

Ver `backend/DEPLOY.md` sección 8.

---

## Roles y permisos

| Acción | Docente | Padre | Sin sesión |
|---|---|---|---|
| Login maestro | ✅ | — | ✅ (login abierto) |
| Login padre | — | ✅ | ✅ (login abierto) |
| `get_alumnos` | ✅ (solo su grupo) | ❌ | ❌ |
| `save_evaluaciones` | ✅ (solo su grupo) | ❌ | ❌ |
| `get_historial_padre` | ❌ | ✅ (solo su alumno) | ❌ |
| Health check / diagnóstico | ✅ (cualquiera) | ✅ | ✅ |

---

## Tecnologías

- **Frontend**: HTML5, Tailwind CSS CDN, Chart.js, Web Speech API. Vanilla JS por módulos (ES modules).
- **Backend**: Google Apps Script (V8 runtime), `HtmlService` para JSON con CORS, `PropertiesService` para secretos.
- **Base de datos**: Google Sheets con 6 hojas.
- **Deploy frontend**: GitHub Pages (gratis, HTTPS, dominio custom opcional).
- **Deploy backend**: Google Apps Script Web App (gratis, dominio `script.google.com`).

---

## Diferencias vs. versión anterior (`Projectcalif/`)

| Problema en v1 | Solución en v2 |
|---|---|
| 3 versiones de HTML并存 | Una sola versión, modular |
| Nombres de hoja no coincidían con Sheets | Nombres exactos desde `docs/esquema_datos.md` |
| Backend escribía 5 columnas de 17 | Backend escribe las 17, calcula 3 |
| Sin login real | Hash SHA-256 + salt + token de sesión HMAC |
| Token en duro en el frontend | En `Script Properties`, no visible |
| JSONP con `<script>` | `text/plain` content-type, fetch normal |
| Sin manejo de errores | Validación con whitelist + logs + mensajes legibles |

---

## Roadmap (futuro)

- [ ] Módulo admin para gestionar `MAESTROS_AUTH` y `ACCESOS_PADRES` desde un UI web
- [ ] Cambio de contraseña obligatorio en primer login del maestro
- [ ] Notificación a padres por email cuando se publica una evaluación
- [ ] Gráficas de tendencia del alumno (Chart.js en frontend padres)
- [ ] Exportación PDF del reporte mensual para entregar al padre
- [ ] Multi-ciclo escolar (hoy se hardcodea `2026-07` desde `CONFIG`)
