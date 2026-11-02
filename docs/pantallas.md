# Pantallas del Sistema Integral de Gabinete

Front de la app `facility` de jc-core (ADR-005 en `jc-core/docs/arquitectura/`). La sesión es de la app `facility`: el login manda `app: 'facility'` y el backend exige el entitlement y los permisos `facility.*` (no se conceden por rol).

| Ruta | Nombre en la UI | Para qué sirve | Permiso | Componente |
|---|---|---|---|---|
| `/login` | Entrar | Login con Google (Auth0 regresa a la raíz, que reenvía a `/login`; canje en `/auth/auth0/exchange`) o con correo y contraseña. Si el usuario tiene varias cuentas con la app, pide elegir | — | `auth/components/login.component.ts` |
| `/operacion/hoy` | Hoy | Bandeja del día: lo vencido, lo faltante y lo por vencer, con «Registrar» y el score «listo para inspección» | `facility.read` (`facility.record` para registrar) | `features/today/today.component.ts` |
| `/operacion/documentos` | Documentos | Bandeja: subir muchos documentos (≤ 50 por carga, uno por petición, 3 en paralelo). La IA los lee en segundo plano (jc-core, cola `facility-documents`) y quedan «Por revisar» (documento esperado) o «Tipo desconocido». La persona los revisa uno a uno y los liga a una obligación (también a una del catálogo no activa, con `facility.manage`) o los descarta. Sin confirmación en lote (junta del 2-nov-2026) | `facility.read`, `facility.record` para subir y ligar | `features/documents/documents.component.ts` |
| `/operacion/obligaciones` | Obligaciones | Semáforo completo por sección de la carpeta; activar obligaciones de persona o equipo; historial y corrección | `facility.read`, `facility.manage` para activar o desactivar | `features/obligations/obligations.component.ts` |
| `/operacion/equipos-y-personal` | Equipos y personal | Registrar equipos (modalidad, serie) y personal (rol, cédula, POE); cada registro activa solo sus obligaciones | `facility.read`, `facility.manage` para registrar | `features/subjects/subjects.component.ts` |
| `/operacion/carpeta` | Carpeta de inspección | Descargar la carpeta en PDF en el orden de la visita y ver la integridad de la cadena de evidencia | `facility.inspect` | `features/inspection/inspection.component.ts` |
| `/operacion/plataforma` | Plataforma | Consola interna de SaludFlex: crear cuentas, unirlas a apps (p. ej. UDIX al gabinete), permisos de producto e invitaciones. Solo aparece y responde para los correos de `PLATFORM_ADMIN_EMAILS` (jc-core) | admin de plataforma | `features/platform/platform.component.ts` |
| `/operacion/establecimientos` | Establecimientos | Alta y edición del establecimiento (servicios, CLUES, responsable sanitario). Sin establecimientos, el layout manda aquí | `facility.manage` | `features/establishments/establishments.component.ts` |

Diálogos:
- `features/evidence/record-evidence.dialog.ts`: registrar o corregir evidencia. Corregir crea un registro nuevo con motivo.
- `features/documents/review-document.dialog.ts`: revisión en serie («3 de 12») de la bandeja: vista previa, obligación sugerida (agrupada: vencidas o sin registro, activas, del catálogo no activas), fechas y notas; «Ligar a esta obligación», «Descartar» o «Después».
- `features/evidence/analyze-document.dialog.ts`: «Subir documento» desde Hoy. La IA (OCR + clasificación en jc-core, `POST /facility/establishments/:id/evidence/analyze`) propone obligación, fechas y notas con su confianza; la persona revisa y guarda con el registro normal. Si la IA no está disponible, se llena a mano.
- `features/evidence/evidence-history.dialog.ts`: historial con las correcciones visibles y descarga del archivo.
- `features/obligations/activate-obligation.dialog.ts`: activar una obligación del catálogo.
- `features/establishments/establishment-form.dialog.ts`: alta y edición del establecimiento.

Al añadir o cambiar una ruta, actualiza esta tabla y `app.routes.ts` (la prueba de `app.spec.ts` fija las rutas hijas de `/operacion`).

## Propuestas en Google Stitch

Proyecto generado (01-nov-2026): https://stitch.withgoogle.com/projects/9959578893517974265 — capturas y HTML en jc-core `docs/gestion-clinicas/stitch/`. Mismo flujo que el Checador: cada pantalla tiene su prompt en `scripts/stitch/screens.json` (prefijo común con la paleta de SaludFlex). Se generan en Stitch y se guardan aquí en `docs/stitch/` (HTML y PNG), con el id del proyecto en `docs/stitch/manifest.json`. Stitch no genera Angular: el código final se escribe en Angular Material.

```bash
STITCH_API_KEY=… node scripts/stitch/generate-screens.mjs        # todas las pendientes
STITCH_API_KEY=… node scripts/stitch/generate-screens.mjs F2 F3  # solo esas
```

| # | Ruta | Pantalla | Stitch |
|---|---|---|---|
| F1 | `/login` | Entrar | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265) |
| F2 | `/operacion/hoy` | Hoy | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265) |
| F3 | diálogo en `/operacion/hoy` | Registrar evidencia (móvil) | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265) |
| F4 | `/operacion/obligaciones` | Obligaciones | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265) |
| F5 | `/operacion/carpeta` | Carpeta de inspección | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265) |
| F6 | `/operacion/establecimientos` | Establecimientos | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265) |
| F7 | `/operacion/equipos-y-personal` | Equipos y personal | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265) |
| F8 | `/operacion/documentos` | Documentos (cola, móvil) | pendiente de generar |
| F9 | diálogo en `/operacion/documentos` | Revisar documento (móvil) | pendiente de generar |
| F10 | diálogo en `/operacion/documentos` | Ligar documento de tipo desconocido (móvil) | pendiente de generar |
