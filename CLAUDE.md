# saludflex-gabinete: instrucciones para agentes

Front del **Sistema Integral de Gabinete** de SaludFlex: Angular 20 (standalone, signals) + Angular Material. Es una app **distinta de lumen-view** (core-front); los datos se conectan por la plataforma jc-core, no por el front.

- **Backend:** jc-core, módulo `facility` (ADR-005 en `jc-core/docs/arquitectura/`). Plan y decisiones en `jc-core/docs/gestion-clinicas/`.
- **Sesión:** el login manda `app: 'facility'`. La API exige el entitlement `facility` de la cuenta y permisos `facility.*` (`read`, `record`, `manage`, `inspect`), que no se conceden por rol.
- **Pantallas:** al añadir o cambiar una ruta, actualiza `docs/pantallas.md` y la lista de rutas de `src/app/app.spec.ts`.
- **Documentación:** este repo solo lleva documentación técnica (este archivo, el README, `docs/pantallas.md` con rutas y permisos). La de producto (maquetas, capturas, instrucciones de Stitch, planes, propuestas) vive en Obsidian y Notion; no se sube aquí.
- **Diseño:** las propuestas se generan en Google Stitch y se guardan fuera del repo. `scripts/stitch/generate-screens.mjs` lee `screens.json` y escribe en la carpeta que indique `STITCH_DIR`. Se toma el diseño, no los textos de relleno.
- **Despliegue:** AWS Amplify, app `saludflex-gabinete` (`d2pukol2ot9zb1`, us-east-1), en `gabinete.salud-flex.com`. Deploy manual desde el CI (`scripts/deploy-amplify.sh`) con rol OIDC `github-saludflex-gabinete-deploy`, solo desde `main`. Reglas SPA y cabeceras viven en la app de Amplify, no en el repo. No se usa Netlify.
- **Lenguaje:** el sistema organiza evidencia y avisa de vencimientos. Nunca «certificado», «garantiza cumplimiento» ni «cumple todas las normas».

## Comandos
```bash
npm ci
npx ng build
CHROME_BIN=/ruta/a/chrome npx ng test --watch=false --browsers=ChromeHeadlessCI
```
