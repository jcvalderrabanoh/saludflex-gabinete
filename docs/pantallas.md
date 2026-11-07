# Pantallas del Sistema Integral de Gabinete

Front de la app `facility` de jc-core (ADR-005 en `jc-core/docs/arquitectura/`). La sesión es de la app `facility`: el login manda `app: 'facility'` y el backend exige el entitlement y los permisos `facility.*` (no se conceden por rol).

**Permisos y botones.** Las pantallas ocultan las acciones que el permiso no deja usar; la regla vive en un solo lugar (`core/services/permissions.service.ts` y las directivas `*appCan` / `*appCanRecord` de `shared/directives/can.directive.ts`). `facility.manage`: activar, desactivar y asignar responsables de obligaciones, establecimientos, equipos y personal, y «Accesos». `facility.record` (global) o `facility.record.assigned` (solo en obligaciones donde la persona es responsable; si tiene ambos, gana el global): registrar, corregir, subir y ligar documentos. `facility.inspect`: carpeta. El backend valida de todos modos.

**Menú.** Agrupado por lo que la persona viene a hacer: «Día a día» (Hoy, Calendario, Documentos), «En regla» (Obligaciones, Municipal, Carpeta de inspección), «Mi gabinete» (Pagos recurrentes, Establecimientos, Equipos y personal, Accesos) y «Conexiones» al pie. La fuente es `NAV_GROUPS` en `shared/components/layout.component.ts`.

**Móvil.** Debajo de 768 px la barra lateral flota (`mode="over"`) y se abre con el botón de menú; los formularios de captura pasan a 1 columna.

| Ruta | Nombre en la UI | Para qué sirve | Permiso | Componente |
|---|---|---|---|---|
| `/login` | Entrar | Login con Google (Auth0 regresa a la raíz, que reenvía a `/login`; canje en `/auth/auth0/exchange`) o con correo y contraseña. Si el usuario tiene varias cuentas con la app, pide elegir | — | `auth/components/login.component.ts` |
| `/operacion/hoy` | Hoy | Bandeja del día: lo vencido, lo faltante y lo por vencer, con «Registrar» y el score «listo para inspección». Conmutador «Míos / Todos»: quien no tiene `facility.manage` entra a «Mis pendientes» (`GET …/status?mine=true`); `?mine=1` en la URL (liga del correo de aviso) lo fuerza y `?mine=0` lo quita | `facility.read` (`facility.record` o `facility.record.assigned` para registrar) | `features/today/today.component.ts` |
| `/operacion/documentos` | Documentos | Bandeja: subir muchos documentos (≤ 50 por carga, uno por petición, 3 en paralelo). La IA los lee en segundo plano (jc-core, cola `facility-documents`) y quedan «Por revisar» (documento esperado) o «Tipo desconocido». La persona los revisa uno a uno y los liga a una obligación (también a una del catálogo no activa, con `facility.manage`) o los descarta. Sin confirmación en lote (junta del 2-nov-2026) | `facility.read`, `facility.record` para subir y ligar | `features/documents/documents.component.ts` |
| `/operacion/obligaciones` | Obligaciones | Semáforo completo por sección de la carpeta, con la columna «Responsable» (marca «Responsable inválido» si ya no puede capturar); activar obligaciones de persona o equipo; asignar responsables; historial y corrección; «Descargar listados» | `facility.read`, `facility.manage` para activar, desactivar o asignar responsables | `features/obligations/obligations.component.ts` |
| `/operacion/calendario` | Calendario | Mes de lunes a domingo con los vencimientos que piden atención (por vencer o vencidos) y las citas: fumigación, solicitud de un trámite, visita de verificación. Panel «Próximos 30 días» para marcar como hecha, reprogramar, cancelar o registrar la evidencia de lo que se hizo | `facility.read`, `facility.record` para programar | `features/calendar/calendar.component.ts` |
| `/operacion/municipal` | Municipal | Domicilio del establecimiento y trámites del ayuntamiento (licencia de funcionamiento o permiso de comercio y uso de suelo, visto bueno de protección civil y los que rigen en su municipio): activar, registrar evidencia y programar la solicitud | `facility.read`, `facility.record` para registrar o programar, `facility.manage` para activar | `features/municipal/municipal.component.ts` |
| `/operacion/pagos` | Pagos recurrentes | Elegir servicios (predial, luz, gas, agua, teléfono) o agregar otros y suscripciones, con monto fijo o variable; ver vencidos, próximos 30 días y más adelante; marcar y deshacer. Solo registra: no paga, no cobra, no guarda datos bancarios, y no entra al score ni a la carpeta. Sin avisos por correo todavía. API: `…/recurring-payments` | `facility.record` (global) o `facility.manage` para ver y marcar (muestra montos), `facility.manage` para elegir y editar | `features/payments/payments.component.ts` |
| `/operacion/conexiones` | Conexiones | Estado de lumen-view y Asistencia en la cuenta (`GET /facility/connected-apps`). Abre la app aparte con su propio acceso. lumen-view sin contratar ofrece «Pedir información» por correo; Asistencia sin contratar solo muestra su estado, porque su venta sigue congelada hasta el 15-dic-2026. No comparte sesión ni datos | `facility.read` | `features/connections/connections.component.ts` |
| `/operacion/equipos-y-personal` | Equipos y personal | Registrar equipos (modalidad, serie) y personal (rol, cédula, POE); cada registro activa solo sus obligaciones; «Descargar listados» | `facility.read`, `facility.manage` para registrar | `features/subjects/subjects.component.ts` |
| `/operacion/carpeta` | Carpeta de inspección | Descargar la carpeta completa en ZIP (índice, archivo vigente de cada obligación y manifiesto con huellas) o solo el índice en PDF, y ver la integridad de la cadena de evidencia | `facility.inspect` | `features/inspection/inspection.component.ts` |
| `/operacion/equipo` | Accesos | Invitar al equipo del gabinete (nombre, correo y preset: coordinador, responsable o consulta), reenviar la invitación, cambiar el preset, dar de baja (quita el acceso y lo saca de los responsables) y «Dar acceso como» a quien es de la cuenta pero no tiene ningún permiso `facility.*` (p. ej. usuarios de lumen-view). Muestra «Usuarios ilimitados: el precio es por establecimiento.»; sin contador de puestos. No opera sobre quien administra ni sobre uno mismo. API: `GET/POST/PATCH/DELETE /facility/team…` | `facility.manage` (en el menú y en la ruta) | `features/team/team.component.ts` |
| `/operacion/plataforma` | Plataforma | Consola interna de SaludFlex: crear cuentas, unirlas a apps (p. ej. UDIX al gabinete), permisos de producto e invitaciones. Solo aparece y responde para los correos de `PLATFORM_ADMIN_EMAILS` (jc-core) | admin de plataforma | `features/platform/platform.component.ts` |
| `/operacion/establecimientos` | Establecimientos | Alta y edición del establecimiento (servicios, CLUES, responsable sanitario). Sin establecimientos, el layout manda aquí | `facility.manage` | `features/establishments/establishments.component.ts` |

Diálogos:
- `features/evidence/record-evidence.dialog.ts`: registrar o corregir evidencia. Corregir crea un registro nuevo con motivo.
- `features/documents/review-document.dialog.ts`: revisión en serie («3 de 12») de la bandeja: vista previa, obligación sugerida (agrupada: vencidas o sin registro, activas, del catálogo no activas), fechas y notas; «Ligar a esta obligación», «Descartar» o «Después».
- `features/evidence/analyze-document.dialog.ts`: «Subir documento» desde Hoy. La IA (OCR + clasificación en jc-core, `POST /facility/establishments/:id/evidence/analyze`) propone obligación, fechas y notas con su confianza; la persona revisa y guarda con el registro normal. Si la IA no está disponible, se llena a mano.
- `features/evidence/evidence-history.dialog.ts`: historial con las correcciones visibles, «Capturado por <nombre> el <fecha>»; «Ver archivo» abre la evidencia en otra pestaña.
- `features/obligations/responsibles.dialog.ts`: asignar responsables (hasta 10) entre quienes pueden capturar; avisa y quita a los inválidos al guardar.
- `features/obligations/payment-window.dialog.ts`: plazo de pago o trámite de una obligación (fecha A a fecha B), desde «Más acciones» en Obligaciones (`facility.manage`). Sin pagar, vence en B; en el Calendario se pinta como franja de A a B y en «Próximos» sale una vez, con su fecha B. «Quitar plazo» lo borra.
- `features/payments/services.dialog.ts`: elegir servicios sugeridos, agregar otros y suscripciones, o editar uno. El nombre rechaza 8 o más dígitos seguidos.
- `features/payments/mark-paid.dialog.ts`: fecha y monto opcional al pagar un monto variable. Un monto fijo se marca con un clic.
- `features/team/invite-member.dialog.ts`: invitar a una persona con su preset explicado en lenguaje llano.
- `features/obligations/activate-obligation.dialog.ts`: activar una obligación del catálogo.
- `features/establishments/establishment-form.dialog.ts`: alta y edición del establecimiento.
- `features/calendar/schedule-appointment.dialog.ts`: programar o editar una cita, ligada o no a una obligación (sin título toma el de la obligación).

Componentes compartidos:
- `shared/components/export-lists-button.component.ts`: «Descargar listados» (en Obligaciones y en Equipos y personal). Baja obligaciones con su semáforo, equipos, personal e historial de evidencia del establecimiento elegido, en Excel o en un ZIP con un CSV por listado (`GET /facility/establishments/:id/export?format=xlsx|csv`, `facility.read`). Cada descarga queda registrada en jc-core.

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
| F11 | `/operacion/calendario` | Calendario | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265) (generada desde el navegador el 03-nov-2026) |
| F12 | `/operacion/municipal` | Municipal | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265) (generada desde el navegador el 03-nov-2026) |
| F13 | `/operacion/pagos` | Pagos recurrentes y menú agrupado | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265), captura en `docs/stitch/F13.png` |
| F14 | diálogo en `/operacion/pagos` | Elegir servicios y agregar otro | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265), captura en `docs/stitch/F14.png` |
| F15 | `/operacion/conexiones` | Conexiones | [Stitch](https://stitch.withgoogle.com/projects/9959578893517974265), captura en `docs/stitch/F15.png` |
