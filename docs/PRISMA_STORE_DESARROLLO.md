# Ampliación STORE: punto de partida en desarrollo

Fecha de revisión: 2026-10-31.

## Alcance de esta primera etapa

Preparar un historial Prisma coherente antes de ampliar la base existente.
No se han implementado los modelos comerciales nuevos ni aplicado nuevas
migraciones. El diseño y las siguientes etapas deben revisarse por separado.

El único destino consultado fue PostgreSQL local, `localhost:5433`, base
`hero_gym_dev`, esquema `public`. La identidad de la base se confirmó mediante
una consulta al servidor. No se leyó la configuración de producción ni se
accedió a producción. Este documento no contiene credenciales.

## Diagnóstico y recuperación del historial

- Rama al iniciar: `dev`, commit `9510759ef47a86121bb07d6c20ac012016518a6d`.
- Prisma CLI y Prisma Client instalados: `6.10.1`, sin actualizarlos.
- El repositorio contenía 22 migraciones; desarrollo registraba 26 completadas,
  sin registros fallidos ni revertidos en la consulta realizada.
- Las cuatro migraciones ausentes se localizaron en Git, commit `b5e1821`.
- Los originales se compararon con `checksum` en `_prisma_migrations` mediante
  una transacción de solo lectura. Las cuatro huellas SHA-256 coincidieron
  exactamente con los bytes originales. Las otras 22 también coincidieron,
  admitiendo las variantes de fin de línea LF/CRLF en la comparación.
- Se restauraron exclusivamente los cuatro archivos faltantes. No se alteró
  SQL existente, no se reejecutaron esos archivos y no se modificó la tabla
  `_prisma_migrations`.

| Migración restaurada | SHA-256 del original |
| --- | --- |
| `20260604100000_add_cliente_activo` | `b0a7a818291ef6aaf18e6be1759f7684e5c572c54be5abca381581fd23f4fac6` |
| `20260604101000_add_cliente_plan_estado` | `99a8db182040fe949d508b5e58d821bafd9e7da4cc3e2c492c59628dff8cd72c` |
| `20260604102000_sync_training_schema` | `013e55d27e8f3580807129e7a75aeacb0990b12a00147389bba0887fdf53e078` |
| `20260605100000_sync_remaining_schema_drift` | `01d1c49bd469a8aca33e73e1aa8076ee7fc5b31f0870aa77a496b4014e2f1212` |

En otra rama local existe un trabajo de reconciliación con un baseline `0_init`.
No se adoptó ese baseline ni se mezclaron los dos historiales: la base de
desarrollo consultada conserva las 26 migraciones históricas. La recuperación
de archivos originales permite conservar ese historial sin reescribirlo.

## Validación realizada

Con el CLI instalado en `node_modules/prisma/build/index.js`:

1. `validate --schema prisma/schema.prisma`: esquema válido.
2. `migrate status --schema prisma/schema.prisma`: 26 migraciones, base al día.
3. `migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code`:
   sin diferencias detectadas, código de salida 0.

`status` y esta modalidad de `diff` se utilizaron únicamente como diagnóstico.
No se ejecutaron `migrate dev`, `migrate deploy`, `migrate reset`, `db push`,
seeds ni cambios de datos. No se regeneró el cliente porque el esquema no cambió.
No se ejecutaron lint, compilación ni pruebas de aplicación: no hay cambios de
código o de contrato en esta etapa.

No se ensayó la reconstrucción completa de una base vacía ni una actualización
con datos representativos. Una comparación sin diferencias no demuestra por sí
sola conservación de datos, corrección funcional o seguridad para producción.

## Decisiones funcionales confirmadas

- Mantener NestJS, PostgreSQL y Prisma; ampliar la base existente.
- `Tenant` representa un negocio. Una cuenta puede pertenecer a varios negocios.
- Conservar clientes, identificadores, relaciones y operaciones del gimnasio.
- Cantidades enteras inicialmente. Venta por peso o fracciones queda pendiente
  para una implementación futura; no convertir cantidades históricas ahora.
- Un producto identifica también su presentación: marca, contenido/tamaño u
  otra descripción que permita distinguirlo. No equivale a toda una categoría.
- El precio vigente pertenece al producto dentro de su negocio. Al editarlo se
  aplica a todas sus unidades, incluidas las de entradas anteriores. Otras
  presentaciones y negocios no cambian. Las ventas conservan el precio aplicado.
- Los pedidos del portal se retiran y se pagan en la tienda con el personal.
  No integrar pagos en línea ni envíos en el alcance inicial.
- La reserva dura como máximo una hora. Al vencer se libera; el cliente debe
  crear un pedido nuevo, sin renovación automática de la reserva anterior.
- El stock físico de un pedido se descuenta una sola vez, al entregarlo.
  Agregar al carrito no descuenta existencias. Facturar no vuelve a descontarlas.
- La integración con el SRI queda para una etapa futura. Los comprobantes
  internos no implican facturación electrónica ni cumplimiento fiscal.
- Usar `America/Guayaquil` para periodos del negocio en el uso inicial.
- Producción requiere una etapa posterior expresamente autorizada. Se trasladan
  código y migraciones revisadas; no se sobrescribe con datos de desarrollo.

## Dependencias que debe resolver el diseño

| Área | Situación actual y condición de compatibilidad |
| --- | --- |
| Clientes | `Cliente` requiere usuario y datos deportivos. Proponer una transición o cliente comercial que permita compradores sin cuenta, sin romper `Cliente.id` ni los servicios del gimnasio. |
| Productos | `Producto.precio` es `Float` y `stock` es `Int`. Incorporar catálogo, categorías, imágenes, códigos y presentación sin crear otro stock independiente. Estudiar la transición del precio por separado de los nuevos importes `Decimal`. |
| Inventario | `CompraService` descuenta directamente `Producto.stock`; `ProductoService` permite editarlo. Las futuras reservas y los lotes exigen adaptar todas esas escrituras antes de habilitar el flujo nuevo. |
| Concurrencia | La comprobación actual de stock usa una lectura previa a la transacción. El flujo nuevo requiere bloqueos o actualizaciones condicionales, revalidación e idempotencia para evitar sobreventas. |
| Ventas | `Compra` registra productos adquiridos por clientes. Conservar su historial y definir su convivencia con `Venta` y sus detalles sin duplicar ingresos. |
| Cobros y cartera | `Pago` y `Deuda` requieren `ClientePlan`. La tienda no debe necesitar una membresía para cobrar o conceder crédito. |
| Documentos | `Factura` requiere `ClientePlan` y su número es globalmente único. Preservar la numeración existente; estudiar documentos comerciales y su numeración sin romper los servicios actuales. |
| Roles | `UserTenant.role` y `StaffProfile.tenantRole` usan roles fijos. Proponer roles, permisos y asignaciones por negocio con una transición explícita y conservación de OWNER. |
| Notificaciones | El servicio actual calcula avisos y los difunde por WebSocket. Los avisos personales nuevos requieren persistencia, destinatario y cola de salida transaccional. |
| Integridad | Las relaciones actuales tienen normalmente claves foráneas por `id`. Las nuevas relaciones deben impedir cruces de negocio mediante claves compuestas y restricciones revisadas. |

## Orden propuesto para las siguientes etapas

1. Revisar el diseño de tablas, relaciones, estados y fuentes de verdad de los
   saldos. Definir la convivencia con los modelos actuales antes de cambiarlos.
2. Preparar cambios Prisma y SQL por bloques compatibles: catálogo y clientes;
   permisos; inventario y reservas; ventas, caja y cartera; documentos,
   notificaciones y auditoría. El orden de dependencias puede requerir agrupar
   algunos modelos en una misma migración.
3. Validar cada bloque con Prisma 6.10.1, generar el cliente y comprobar los
   servicios afectados. Aplicar solo sobre el destino de desarrollo verificado.
4. Ensayar base nueva y actualización con datos representativos, incluyendo
   aislamiento entre negocios, identificadores, saldos y conservación histórica.
5. Implementar módulos de backend e interfaces como etapas independientes.

Actualización de acuerdos, 2026-11-01: costo de adquisición y precio de venta se
registran manualmente; el personal selecciona el lote de salida. La selección
automática de lotes queda para el futuro. El precio confirmado se conserva
durante la reserva de una hora. Comprobantes `COMP-` más consecutivo por negocio,
sin reutilizar números anulados. La venta por peso y el SRI siguen fuera del
alcance inicial. El diseño detallado, sus supuestos y la transición compatible
están en [DISENO_BASE_DATOS_STORE.md](DISENO_BASE_DATOS_STORE.md).
