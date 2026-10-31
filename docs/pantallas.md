# Pantallas de «Operación en regla»

Front de la app `facility` de jc-core (ADR-005 en `jc-core/docs/arquitectura/`). La sesión es de la app `facility`: el login manda `app: 'facility'` y el backend exige el entitlement y los permisos `facility.*` (no se conceden por rol).

| Ruta | Nombre en la UI | Para qué sirve | Permiso | Componente |
|---|---|---|---|---|
| `/login` | Entrar | Login con correo y contraseña. Si el usuario tiene varias cuentas con la app, pide elegir | — | `auth/components/login.component.ts` |
| `/operacion/hoy` | Hoy | Bandeja del día: lo vencido, lo faltante y lo por vencer, con «Registrar» y el score «listo para inspección» | `facility.read` (`facility.record` para registrar) | `features/today/today.component.ts` |
| `/operacion/obligaciones` | Obligaciones | Semáforo completo por sección de la carpeta; activar obligaciones de persona o equipo; historial y corrección | `facility.read`, `facility.manage` para activar o desactivar | `features/obligations/obligations.component.ts` |
| `/operacion/carpeta` | Carpeta de inspección | Descargar la carpeta en PDF en el orden de la visita y ver la integridad de la cadena de evidencia | `facility.inspect` | `features/inspection/inspection.component.ts` |
| `/operacion/establecimientos` | Establecimientos | Alta y edición del establecimiento (servicios, CLUES, responsable sanitario). Sin establecimientos, el layout manda aquí | `facility.manage` | `features/establishments/establishments.component.ts` |

Diálogos:
- `features/evidence/record-evidence.dialog.ts`: registrar o corregir evidencia. Corregir crea un registro nuevo con motivo.
- `features/evidence/evidence-history.dialog.ts`: historial con las correcciones visibles y descarga del archivo.
- `features/obligations/activate-obligation.dialog.ts`: activar una obligación del catálogo.
- `features/establishments/establishment-form.dialog.ts`: alta y edición del establecimiento.

Al añadir o cambiar una ruta, actualiza esta tabla y `app.routes.ts` (la prueba de `app.spec.ts` fija las rutas hijas de `/operacion`).
