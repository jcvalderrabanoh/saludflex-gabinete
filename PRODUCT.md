# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Operación en regla:** coordinación de recepción y responsable sanitario de un gabinete de imagen pequeño en México (1 a 3 personas), con poco tiempo.
- **Gastos:** administradora o dueño, quien paga las cuentas y quiere saber si le alcanza. Captura manual; se espera semanal o quincenal (hipótesis por validar con UDIX).

## Product Purpose

Que un gabinete tenga su operación al día: vigencias, bitácoras de evidencia y carpeta de inspección. Gastos agrega el registro de lo que el gabinete debe pagar y cuánto necesita por fecha.

El software organiza la evidencia y registra lo que el gabinete captura. Quien cumple es el establecimiento.

## Positioning

App de SaludFlex distinta de lumen-view, con datos conectados por la plataforma jc-core. Registra; no paga, no cobra ni guarda datos bancarios.

## Operating Context

- Primer gabinete: UDIX.
- Sesión de la app `facility`, con permisos `facility.read`, `record`, `manage` e `inspect`, que no se conceden por rol.
- Trabajo por establecimiento activo. Fechas locales del establecimiento.
- Montos en MXN.

## Capabilities and Constraints

- Gastos no mueve dinero ni guarda cuenta, CLABE, tarjeta, RFC ni CURP.
- Gastos no entra al score ni a la carpeta de inspección.
- Sin dato no es cero: se muestra «Sin dato» o «Sin captura», nunca $0.
- Lo estimado se distingue de lo real con texto.
- Consulta y Responsable no ven montos.
- **Sin decidir:** saldo, ingresos y proyección de saldo existen solo como maqueta; su construcción se revisa después del 15-dic-2026. Comprador del módulo sin confirmar.

## Brand Commitments

- Nombre: Sistema Integral de Gabinete, de SaludFlex.
- Nunca decir: «certificado», «garantiza cumplimiento», «cumple todas las normas», «te avisa», «pagos automáticos», «evita recargos», «integrado con», «listo para datos reales», «flujo de caja real», «conciliado», «deducible», «IVA acreditable», «contabilidad» como función propia, «conectado a tu banco», saldo «seguro» o «recomendado».
- Leyenda de Gastos: «Registro interno; no es contabilidad ni comprobante fiscal».

## Evidence on Hand

- No hay evidencia de demanda de Gastos: ningún cliente lo ha pedido.
- Acta del 8-nov-2026 en Notion (Estrategia).
- Toda maqueta lleva la marca «Datos ficticios de ejemplo». No se inventan clientes, cifras ni testimonios.

## Product Principles

1. Primero la pregunta del usuario, luego el detalle: qué vence y cuánto necesita.
2. Nunca una cifra sin decir de dónde sale: real, estimada o sin dato.
3. Capturar debe costar pocos campos; la captura es lo que hace abandonar.
4. Registrar no es contabilidad: hechos, sin conclusiones fiscales.

## Accessibility & Inclusion

Contraste AA, objetivos táctiles de 48 px o más. El estado nunca se comunica solo con color.
