# DEPLOY — Instituto Wilhelm Wundt SC

Procedimiento paso a paso para desplegar cambios al sistema en producción.

## TL;DR (caso normal)

```bash
# 1. Backup local (Windows)
powershell -Command "Copy-Item -Recurse -Force WilhelmWundtv2_backup_PreFase2 WilhelmWundtv2_$(Get-Date -Format 'yyyy-MM-dd')_pre_deploy"

# 2. Tests locales
cd WilhelmWundtv2_backup_PreFase2\backend
node tests\run_all.js
# Esperar: "TOTAL: 19 tests pasaron, 0 fallaron"

# 3. Deploy backend → Apps Script (manual, ver abajo)
# 4. Deploy frontend → Apps Script HTML service (manual, ver abajo)
# 5. Verificación en Sheet → recargar (F5)
```

---

## 1. Tipos de cambio y qué deploy requieren

| Cambio toca…                            | Deploy requerido                             |
|-----------------------------------------|----------------------------------------------|
| `lib_pin_hash.gs.txt`                   | Solo **Ctrl+S** en editor Apps Script + F5 en Sheet. NO requiere nueva versión de Web App. |
| `lib_auth.gs`, `lib_sheets.gs`, `lib_validaciones.gs`, `lib_calculos.gs`, `Code.gs` | Sí requiere **Deploy → Manage deployments → New version** (porque cambian `doGet`/`doPost` o funciones referenciadas desde el frontend). |
| `frontend/**/*.js`, `index.html`        | Sí requiere nueva versión (los assets están en la Web App). |
| `docs/**`, `backend/tests/**`           | NO se despliega. Es local.                  |

**Heurística rápida**: si cambia `doGet` o `doPost` en `Code.gs`, o cualquier función llamada desde el frontend → nueva versión. Si solo cambia una función del backend llamada desde otra función backend, o una función del menú → con Ctrl+S alcanza.

---

## 2. Procedimiento paso a paso

### 2.1 Antes de tocar nada

1. **Backup local**: copiar la carpeta completa a un directorio con fecha.
   ```powershell
   Copy-Item -Recurse -Force `
     WilhelmWundtv2_backup_PreFase2 `
     WilhelmWundtv2_$(Get-Date -Format 'yyyy-MM-dd')_pre_deploy
   ```

2. **Tests locales** (si el cambio toca backend):
   ```bash
   cd backend
   node tests\run_all.js
   ```
   Esperar **"TOTAL: 19 tests pasaron, 0 fallaron"**. Si falla, NO desplegar.

3. **Revisar cambios**: `git status` (cuando esté en git) o `git diff` contra la versión anterior.

### 2.2 Deploy backend (Apps Script)

1. Abrir el editor de Apps Script del proyecto:
   https://script.google.com/u/0/home/projects/<ID_PROYECTO>/edit

2. **Si modificaste `lib_pin_hash.gs.txt`** (formato .txt porque se copia/pega):
   - En el editor, abrir el archivo `lib_pin_hash` (sin extensión, Apps Script lo nombra así).
   - **Borrar todo el contenido**.
   - Abrir `lib_pin_hash.gs.txt` local con cualquier editor.
   - **Copiar TODO** (Ctrl+A, Ctrl+C).
   - Pegar en el archivo `lib_pin_hash` del editor (Ctrl+A, Ctrl+V).
   - **Ctrl+S** para guardar. NO requiere deploy nuevo.

3. **Si modificaste `lib_auth.gs`, `lib_sheets.gs`, `lib_validaciones.gs`, etc.**:
   - Mismo procedimiento (borrar contenido, pegar, guardar).
   - **ADEMÁS**: ir a **Deploy → Manage deployments**.
   - Click en el ícono de lápiz (✏️) de la versión activa.
   - En **Version**, seleccionar **"New version"**.
   - Escribir descripción corta (ej. "fix apóstrofo en cambiarPinPadre_ 2026-08-25").
   - Click **Deploy**.

4. **Si modificaste `Code.gs`**:
   - Mismo procedimiento, SIEMPRE requiere nueva versión (cambia el entry point `doGet`/`doPost`).

### 2.3 Deploy frontend

1. Si modificaste archivos en `frontend/docente/` o `index.html`:
   - Abrir el archivo HTML correspondiente en el editor de Apps Script.
   - Borrar contenido, pegar el nuevo. Ctrl+S.
   - **Deploy → Manage deployments → New version** (porque los assets están en la Web App).

2. Si solo cambiaste un `.js` (que se importa con `?v=N`):
   - Editar el archivo en Apps Script.
   - Incrementar el cache-bust: cambiar `?v=N` → `?v=N+1` en `index.html` y `WUNDT_VERSION`.
   - Ctrl+S.
   - **New version** de la Web App.

### 2.4 Verificación post-deploy

1. Volver al Sheet del sistema.
2. **F5** para recargar.
3. Esperar 10 segundos (la Web App tarda en actualizarse si hiciste new version).
4. **Verificación visual**:
   - Menú **Wundt** debe tener los items esperados.
   - Login docente: entrar con `M03` / `wundtM03`.
   - Login padre: entrar con un AlumnoID real + PIN conocido.
5. **Verificación funcional**:
   - Si tocaste alta atómica: probar **Wundt → Agregar alumno completo** con datos ficticios, luego limpiar.
   - Si tocaste cambio de PIN: probar **Wundt → Cambiar PIN de padre** con un alumno real.

### 2.5 Si algo falla post-deploy

1. **Abrir Apps Script → Ejecuciones** (icono de lista a la izquierda).
2. Buscar el último run del deploy que hiciste.
3. Click **"Ver log"**.
4. Filtrar por la palabra clave de tu cambio (ej. `ALTA_ALUMNO:`, `cambiarPinPadre_`, etc.).
5. Si el log muestra error, copiar el mensaje y revisar.

### 2.6 Después de verificar

- Crear commit en git con los cambios (cuando esté en git).
- Actualizar `docs/BITACORA_YYYY-MM-DD.txt` con resumen del cambio.

---

## 3. Política de backups

- **Antes de cada deploy**: backup local obligatorio (paso 2.1.1).
- **Backup semanal**: copiar la carpeta a `WilhelmWundtv2_YYYY-MM-DD_weekly`.
- **Backups antiguos**: borrar los de más de 60 días (mantener 2 meses de historial).

## 4. Política de versionado (cuando esté en git)

- `main` = producción estable.
- `develop` = integración de cambios probados.
- Features nuevas: branch `feat/<nombre-corto>` desde `develop`.
- Hotfixes: branch `hotfix/<nombre-corto>` desde `main`.

## 5. Rollback

Si algo sale mal post-deploy:

1. **Rollback backend**:
   - En Apps Script → **Deploy → Manage deployments**.
   - Buscar la versión anterior en el historial.
   - Click en el ícono de lápiz y seleccionar esa versión en el dropdown.
   - Click **Deploy**.

2. **Rollback local**:
   ```powershell
   # Restaurar desde backup
   Remove-Item -Recurse -Force WilhelmWundtv2_backup_PreFase2
   Rename-Item WilhelmWundtv2_YYYY-MM-DD_pre_deploy WilhelmWundtv2_backup_PreFase2
   ```

3. **Verificar**: F5 en Sheet, login, validar flujos críticos.

---

## 6. Checklist rápido (pegar en Bitácora)

```
[ ] Backup local hecho (YYYY-MM-DD_pre_deploy)
[ ] Tests verdes (19/19)
[ ] Backend desplegado en Apps Script
[ ] Si cambió doGet/doPost/frontend: nueva versión de Web App
[ ] F5 en Sheet, menú Wundt visible
[ ] Login docente OK
[ ] Login padre OK
[ ] Si tocó alta atómica: probar menú Wundt → Agregar alumno completo
[ ] Si tocó cambio PIN: probar menú Wundt → Cambiar PIN
[ ] Bitácora actualizada
```

---

*Última actualización: 2026-08-25. Creado como parte del plan de robustez para soportar 200 alumnos.*
