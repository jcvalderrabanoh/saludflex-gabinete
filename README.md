# Operación en regla (front)

Front de **Operación en regla** de SaludFlex: vigencias, bitácoras de evidencia y carpeta de inspección del establecimiento. Es la app `facility` de jc-core (ver `jc-core/docs/arquitectura/ADR-005-operacion-del-establecimiento.md` y el plan en `jc-core/docs/gestion-clinicas/`). Primer gabinete: UDIX.

El software **organiza la evidencia y avisa de vencimientos**; no certifica cumplimiento. Quien cumple es el establecimiento.

## Pantallas

Ver [`docs/pantallas.md`](docs/pantallas.md).

## Desarrollo

```bash
npm ci
npx ng serve            # http://localhost:4200, API en environment.apiUrl
```

El backend es jc-core (`npm run start:dev`, puerto 3000). El usuario necesita la app `facility` contratada en su cuenta (`account_apps`) y permisos `facility.*`.

## Pruebas

```bash
CHROME_BIN=/ruta/a/chrome npx ng test --watch=false --browsers=ChromeHeadlessCI
npx ng build
```

`ChromeHeadlessCI` (en `karma.conf.js`) corre Chrome sin sandbox, necesario en contenedores que corren como root.
