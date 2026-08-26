# INSTRUCCIONES OPERATIVAS — Instituto Wilhelm Wundt SC

> Esta es la chuleta de uso diario del sistema. Pegala en una hoja del Sheet
> ("INSTRUCCIONES") para tenerla a mano. Todo lo que está aquí se basa en
> los flujos reales del Sheet + menú Wundt, no en regex teórica.

---

## 1) Cómo agregar un alumno real

Hay **3 caminos** según la urgencia. En orden de recomendación:

### Camino A — Menú Wundt (recomendado, PIN automático)

**Cuándo usarlo**: alta completa con PIN del padre. Es el camino más seguro
porque crea las 2 filas (ALUMNOS + ACCESOS_PADRES) en una sola acción.

**Pasos**:

1. Abrir el Sheet del sistema.
2. Menú **Wundt → Agregar alumno completo**.
3. En el cuadro que aparece, escribir **una sola línea** con 9 datos separados
   por coma, sin comas internas. Formato:

   ```
   AlumnoID, NombreCompleto, Grupo, Grado, MaestroID, PIN, TutorNombre, TutorEmail, TutorTelefono
   ```

   Ejemplo real:

   ```
   4.7, JUAN PEREZ LOPEZ, Unico, Cuarto, M04, 4721, Maria Lopez, mlopez@mail.com, 5551234567
   ```

4. Click **OK**.
5. Si todo OK, aparece una alerta con el PIN. **Anotalo en papel aparte** y
   comunicalo al tutor por WhatsApp o como prefieras. No se vuelve a mostrar.
6. Si hay error, la alerta lista los problemas (ej. "PIN debe ser 4-6
   dígitos"). Corregir y volver a intentar.

**Resultado**: 2 filas nuevas en el Sheet
- `ALUMNOS`: nueva fila con `AlumnoID`, nombre, grupo, grado, maestro.
- `ACCESOS_PADRES`: nueva fila con el mismo `AlumnoID`, hash del PIN, salt, datos del tutor, `Activo=TRUE`.

---

### Camino B — Menú Wundt "Agregar SOLO acceso"

**Cuándo usarlo**: el alumno ya existe en `ALUMNOS` (porque vos lo agregaste
manualmente o vino de otra fuente) y solo falta darle PIN al padre.

**Pasos**:

1. Verificar que la fila del alumno existe en hoja `ALUMNOS`. Si no existe,
   agregala manualmente primero (ver Camino C).
2. Menú **Wundt → Agregar SOLO acceso**.
3. Escribir 5 campos en una línea:
   ```
   AlumnoID, PIN, TutorNombre, TutorEmail, TutorTelefono
   ```
   Ejemplo:
   ```
   4.7, 4721, Maria Lopez, mlopez@mail.com, 5551234567
   ```
4. **OK**. Listo. El alumno ya puede hacer login con `AlumnoID` + `PIN`.

---

### Camino C — Manual directo en el Sheet (sin menú)

**Cuándo usarlo**: alta de un预留 (sin PIN todavía) o corrección manual.

**Para agregar un预留 sin PIN** (la fila queda "fantasma" hasta que le asignes datos reales):

1. Hoja `ALUMNOS`, ir a la última fila.
2. Copiar el formato de las filas de arriba (seleccionar fila entera + Pegar formato).
3. En la nueva fila escribir:
   ```
   AlumnoID:     P2.16              (o el ID que corresponda)
   NombreCompleto: Por definir       (ESTO es lo que filtra el backend)
   Grupo:        Unico
   Grado:        Preescolar 2
   MaestroID:    M11
   ```
4. En hoja `ACCESOS_PADRES`, agregar fila con `Activo=FALSE` (todavía no hay tutor).

**Para convertir un预留 en alumno real**:

1. Hoja `ALUMNOS`, fila del预留: cambiar `Por definir` por el nombre real.
   **No borrar la fila**, solo sobrescribir el campo `NombreCompleto`.
2. Hoja `ACCESOS_PADRES`, agregar fila nueva con `AlumnoID`, `PINHash`, `Salt`,
   datos del tutor, `Activo=TRUE`. Si no querés meterte con hashes, usá el
   menú "Agregar SOLO acceso" (Camino B) y borrá la fila vacía de ACCESOS_PADRES.

---

## Reglas críticas (no romper)

1. **`Activo` solo acepta `TRUE` o `FALSE` en MAYÚSCULAS.** NUNCA escribir
   "SI" o "NO" — eso rompe el login de los padres. Backend exige `=== 'TRUE'`.

2. **AlumnoID siempre con apóstrofo** en Sheets (ej. `'3.10`). Esto evita
   que Google colapse `3.10` → `3.1`. Si ves que el ID se muestra sin
   apóstrofo, agregalo manualmente.

3. **Agregar alumno = fila en ALUMNOS + fila en ACCESOS_PADRES.** El menú
   "Agregar alumno completo" lo hace atómicamente. Si lo hacés manual,
   recordá las 2.

4. **Filas con `NombreCompleto="Por definir"` son invisibles** para docente
   y padre. Úsalas para预留 sin miedo. Se filtran en backend con
   `.filter(NombreCompleto !== 'Por definir')`.

5. **Si una celda de `AlumnoID` se ve como número** (ej. `3.1` en vez de
   `'3.10`), seleccionar la columna → Formato → Número → Texto sin formato.

---

## Si algo falla

1. Revisar el log: Apps Script → Ejecuciones → "Ver log" del último run.
   Filtrar por `ALTA_ALUMNO:` para ver solo lo del alta.
2. Si la alerta muestra "Alumno no encontrado", es porque la fila no existe
   en ALUMNOS. Verificar manualmente.
3. Si el padre no puede hacer login, verificar que `Activo=TRUE` (no FALSE
   ni SI/NO) y que el PIN no tenga espacios al inicio/final.

---

*Última actualización: 2026-08-25. Cubre flujo del menú Wundt versión 2 (3 ítems).*
