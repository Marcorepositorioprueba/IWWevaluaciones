# Audit de responsividad Wundt — 2026-08-26 (P31)

## Cambios aplicados (estáticos, sin prueba visual aún)

1. **`maximum-scale=1.0` removido en AMBOS portales** (`index.html` línea 5).
   - Antes bloqueaba el zoom con pinza en celular (problema de accesibilidad WCAG).
   - Ahora el padre/docente puede hacer zoom hasta 5x con gesto nativo.

2. **Cache-bust bumpeado**:
   - `frontend/padres/index.html`: `app.css?v=6` → `?v=7`
   - `frontend/docente/index.html`: `app.css?v=7` → `?v=8`, `WUNDT_VERSION='4.7'` → `'4.8'`

## Audit estático (revisión de HTML/CSS sin emulador)

### Portal padres (`/frontend/padres/index.html`)

| Punto | Estado | Notas |
|---|---|---|
| `viewport` sin `maximum-scale` | ✓ Fixed | antes bloqueaba zoom |
| `max-w-4xl mx-auto p-4 md:p-8` | ✓ | ≤768px OK |
| `grid-cols-1` en #historial | ✓ | cada tarjeta full-width en mobile |
| Header con `truncate` | ✓ | nombre largo no rompe layout |
| `text-3xl md:text-5xl` h1 | ✓ | tipografía fluida |
| `flex flex-col md:flex-row` (en CSS) | ✓ | KPIs apilables en mobile |
| `p-5 md:p-6` en header dashboard | ✓ | padding responsivo |

### Portal docente (`/frontend/docente/index.html`)

| Punto | Estado | Notas |
|---|---|---|
| `viewport` sin `maximum-scale` | ✓ Fixed | antes bloqueaba zoom |
| Login `max-w-md w-full p-4` | ✓ | mobile OK |
| Header `flex-col md:flex-row` | ✓ | KPIs apilables |
| `grid grid-cols-1 lg:grid-cols-2` en panel | ✓ | mobile = full-width |
| `select` mes con `w-full md:w-64` | ✓ | mobile = full-width |
| Tabla de captura en `#tablaArea` | ⚠️ **A VALIDAR** | requiere scroll horizontal en <640px (esperado) |
| Imprimir/PDF `@media print` | ✓ | letter portrait, evita cortes |

## Pruebas pendientes (requieren emulador o dispositivo real)

Para cerrar P31 al 100%, **Marco debe probar en**:

- [ ] iPhone 13/14 Safari (390x844) — pinza zoom, scroll, login, ver tarjeta padre
- [ ] Android Chrome (Pixel 7) — idem
- [ ] iPad (1024x768) — ambas orientaciones
- [ ] Desktop 1920x1080 — sin scroll horizontal
- [ ] Desktop 1366x768 — capturas docentes

## Checklist crítica

- [ ] Tabla de alumnos no requiere scroll horizontal en 375px (si requiere, OK si es solo la tabla)
- [ ] Cards se apilan en mobile (no grid 2-3 columnas)
- [ ] Botones tocables con pulgar (≥44x44px)
- [ ] Texto no se sale de contenedores
- [ ] Modales caben sin zoom
- [ ] Inputs no tapados por teclado virtual

## Si algo falla

Si el docente/padre reporta problema en mobile:
- Ajustar breakpoints Tailwind (`sm:` 640, `md:` 768, `lg:` 1024)
- Para casos extremos (≤360px), agregar CSS custom en `app.css`
- Evitar `position: fixed` con altura >100vh (rompe en iOS Safari)

## Estado

**Cerrado parcialmente (audit estático + fix accessibility)**. Validación visual en dispositivo real queda como tarea de Marco antes de promover a producción el siguiente deploy.
