# saludflex-gabinete: instrucciones para agentes

Front del **Sistema Integral de Gabinete** de SaludFlex: Angular 20 (standalone, signals) + Angular Material. Es una app **distinta de lumen-view** (core-front); los datos se conectan por la plataforma jc-core, no por el front.

- **Backend:** jc-core, módulo `facility` (ADR-005 en `jc-core/docs/arquitectura/`). Plan y decisiones en `jc-core/docs/gestion-clinicas/`.
- **Sesión:** el login manda `app: 'facility'`. La API exige el entitlement `facility` de la cuenta y permisos `facility.*` (`read`, `record`, `manage`, `inspect`), que no se conceden por rol.
- **Pantallas:** al añadir o cambiar una ruta, actualiza `docs/pantallas.md` y la lista de rutas de `src/app/app.spec.ts`.
- **Diseño:** las propuestas están en Google Stitch (proyecto en `docs/pantallas.md`; capturas en `jc-core/docs/gestion-clinicas/stitch/`). Se toma el diseño, no los textos de relleno.
- **Lenguaje:** el sistema organiza evidencia y avisa de vencimientos. Nunca «certificado», «garantiza cumplimiento» ni «cumple todas las normas».

## Comandos
```bash
npm ci
npx ng build
CHROME_BIN=/ruta/a/chrome npx ng test --watch=false --browsers=ChromeHeadlessCI
```
