# Esquema completo STORE preparado

## Actualización: migraciones aplicadas en desarrollo

Se aplicaron exclusivamente a `hero_gym_dev` en `localhost:5433`:
`20261103120000_add_store_schema` y `20261103121000_add_store_integrity`.
La primera conserva los datos y llena las fechas de Producto antes de NOT NULL;
aborta si convertir su precio requiere redondeo. La segunda incorpora 82 CHECK,
cinco índices parciales y triggers de integridad. Ambas usan transacción.
No se modificó el baseline `0_init` ni el historial ya aplicado.

Antes se generó un respaldo custom de PostgreSQL, se restauró en una base local
aislada y se ensayaron tanto esa actualización como una instalación vacía.
Se compararon las huellas de todas las columnas originales de las 33 tablas GYM,
antes y después: coinciden. Ningún dato de prueba se insertó en hero_gym_dev.
El respaldo permanece local e ignorado por Git, bajo `.tmp/dev-migration-run/`.

Verificación: Prisma al día y diff sin diferencias; lectura correcta de los 72
modelos; compilación correcta; 158 pruebas unitarias y cuatro pruebas de
integración GYM en la copia migrada, todas aprobadas. Se comprobó también el
arranque del AppModule y su respuesta HTTP sobre hero_gym_dev, sin escrituras.
Las pruebas cubren cliente, compra/stock y precio numérico, plan, pagos,
factura/deuda, asistencia, login/contextos y aislamiento entre negocios.
El test nuevo solo habilita escrituras con autorización explícita y nombre de
base temporal de ensayo; por defecto queda omitido en test:e2e.

El lint global sigue fallando por 391 errores y 79 avisos existentes. El archivo
nuevo de integración pasa lint. No se hizo una refactorización general.

La aplicación GYM conserva autorización LEGACY y productos LEGACY. No se
habilitaron módulos, roles comerciales ni modo LOTES; tampoco se implementaron
endpoints STORE o interfaces. Producción no se consultó ni se modificó.

El resto del documento conserva el informe de preparación anterior. Su lista
de SQL pendiente fue atendida por las migraciones en las garantías de base;
los servicios transaccionales y la autorización STORE siguen pendientes como
se describe en el diseño. No se afirma una validación funcional completa de
STORE ni seguridad de despliegue a producción.

## Informe previo: preparación del esquema

Rama de trabajo: `fix/baseDeDatos`. Versión usada: Prisma/Client 6.10.1.
Alcance: preparación del esquema completo en una sola etapa y adaptación mínima
del precio para el código GYM. No se crearon tablas físicas ni se generó/aplicó
una nueva migración en `prisma/migrations`. No se conectó a ninguna base de datos
en esta etapa. No se actualizaron dependencias.

El archivo ejecutable del modelo es `prisma/schema.prisma`. El diseño funcional
previo está en `DISENO_BASE_DATOS_STORE.md`. Este informe describe lo preparado
y los controles que deben añadirse antes de habilitar las funciones comerciales.

## Inventario de modelos nuevos: 39

| Área | Modelos nuevos |
| --- | --- |
| Clientes y portal | `ClienteComercial`, `VinculacionClienteUsuario` |
| Roles y permisos | `Permiso`, `RolNegocio`, `RolPermiso`, `AsignacionRol` |
| Catálogo | `CategoriaProducto`, `ProductoImagen` |
| Inventario | `EntradaInventario`, `LoteInventario`, `MovimientoInventario`, `ReservaInventario`, `AsignacionLoteVenta` |
| Carrito y pedidos | `Carrito`, `DetalleCarrito`, `Pedido`, `DetallePedido`, `HistorialEstadoPedido` |
| Ventas y cartera | `Venta`, `DetalleVenta`, `Cobro`, `AplicacionCobro`, `ReversionAplicacionCobro`, `CuentaPorCobrar`, `AjusteCuentaPorCobrar`, `Reembolso` |
| Devoluciones | `DevolucionVenta`, `DetalleDevolucionVenta` |
| Caja y gastos | `Caja`, `TurnoCaja`, `MovimientoCaja`, `GastoComercial` |
| Comprobantes internos | `SecuenciaComprobante`, `ComprobanteVenta`, `DetalleComprobanteVenta` |
| Seguimiento | `EventoSalida`, `NotificacionCliente`, `AuditoriaOperacion`, `SolicitudIdempotente` |

El esquema resultante contiene 72 modelos: los 33 anteriores y estos 39.
`Permiso` es el único catálogo global nuevo; los otros 38 modelos nuevos tienen
tenant, FK al negocio y clave única `(tenantId,id)`. Todos tienen fechas de
creación/actualización; las operaciones inmutables deben protegerse también en
SQL/servicios, no actualizarse mediante CRUD genérico.

## Modelos existentes modificados: 6

| Modelo | Cambios preparados |
| --- | --- |
| `Usuario` | Solo relaciones inversas a vinculaciones verificadas, auditoría e idempotencia. Se conservan identidad y credenciales. |
| `Tenant` | `zonaHoraria` con valor inicial `America/Guayaquil`, `moneda` USD y `autorizacionVersion` LEGACY; relaciones inversas a los modelos nuevos. |
| `UserTenant` | `versionAutorizacion` inicialmente 1, claves únicas de soporte `(tenantId,id)` y `(tenantId,id,usuarioId)`, y relaciones a personal responsable/asignaciones. Se conserva `role`. |
| `Cliente` | Clave única adicional `(tenantId,id)` y relación inversa con cliente comercial. No se cambian su ID, usuario, datos deportivos ni sus relaciones antiguas. |
| `Producto` | `precio` pasa de Float a Decimal(18,2); SKU y barras de texto únicos por negocio, categoría, marca, presentación, descripción, unidad UNIDAD, `stockReservado`, `modoInventario`, fechas y relaciones nuevas. Se conserva el mismo `stock Int`. |
| `Compra` | Clave única adicional `(tenantId,id,productoId)` y relación inversa a movimientos para una futura integración legacy. No se cambian columnas operativas, importes, identificadores ni sus FK antiguas. |

Los otros 27 modelos existentes mantienen su definición funcional, entre ellos
`StaffProfile`, `Plan`, `ClientePlan`, `Pago`, `Deuda`, `Factura`, `CambioPlan`,
`DevolucionMovimiento`, rutinas, entrenamientos y asistencias.
Se mantiene la unicidad global de `Factura.numero`. No se convierte la historia
financiera Float del gimnasio ni se copian compras a ventas.

## Tipos, relaciones y reglas representadas en Prisma

- Importes, precios, descuentos y saldos nuevos: Decimal(18,2). Costos unitarios
  y totales de costo: Decimal(18,4). Tasas: Decimal(7,4).
- Cantidades enteras. Venta por peso/fracciones y selección automática de lotes
  permanecen fuera del alcance inicial.
- Relaciones nuevas entre entidades de negocio usan tenant en la FK, con
  RESTRICT para borrado y NO ACTION para actualización de claves. Usuario y
  Permiso son entidades globales y no reciben un tenant artificial.
- Las relaciones entre reserva/detalle/producto, asignación/lote/producto,
  devolución/venta/asignación y documento/venta/detalle incluyen las claves
  adicionales necesarias para que esos identificadores coincidan.
- Para FK extendidas con columnas opcionales compartidas se añadieron también
  referencias base, cuando son necesarias: no se puede omitir un dato adicional
  y eludir por ello la FK de pertenencia al tenant. Aun así se requieren CHECK
  de completitud y controles de identidad indicados abajo.
- Aplicaciones tienen referencias al cobro, la venta y opcionalmente la cuenta.
  Si se informa cliente, también se comprueba su correspondencia mediante FK
  con cobro/venta. Reversiones y ajustes conservan la venta de origen.
- Notificaciones de comprobante, pedido o deuda se vinculan al cliente del
  mismo origen; no solo al negocio. La titularidad/lectura requiere autorización.
- Claves idempotentes por tenant para ventas, cobros, entradas, aplicaciones,
  ajustes, reversiones, devoluciones, reembolsos y movimientos. Reservas son
  únicas por detalle y las ventas por pedido. Comprobante original único por
  venta y número/consecutivo único por negocio.
- La asignación de rol es única por membresía. El catálogo de roles admite
  BODEGUERO por su código; no se cambió el enum legacy `TenantRole`, ni se
  conceden permisos con solo crear esas filas.
- Estados iniciales no incluyen despacho: pedidos se retiran en tienda.
  Fechas de confirmación, límite de reserva, entrega, anulación y reversión
  permiten registrar las transiciones acordadas.

## Adaptaciones mínimas de compatibilidad

1. `ProductoService`: conserva `precio` como número en respuestas de creación,
   listado, consulta, edición y eliminación de las rutas existentes. Un Decimal
   se serializaría normalmente como texto y cambiaría el contrato de Angular.
2. `CompraService`: calcula el total con Decimal, redondea HALF_UP a dos
   decimales y convierte al Float final que conserva `Compra.total`.
3. Pruebas de regresión: precio numérico al serializar/consultar listados y
   cálculo de `0.10 x 3 = 0.30` sin error binario en el contrato legacy.

No se implementaron endpoints comerciales ni se activó PERMISOS/LOTES. Cambiar
el tipo Prisma no aplica la conversión a los datos: la futura migración debe
examinar valores, documentar redondeos y preservar la información original.

## SQL obligatorio antes de aplicar una migración

Prisma no expresa CHECK, índices únicos parciales ni reglas agregadas en esta
versión. Este esquema completo representa modelos y relaciones, pero no debe
usarse como sustituto del SQL revisado de la migración. Un diff automático no
incluye las siguientes garantías pendientes:

| Modelos | Restricciones que deberán añadirse/revisarse en SQL |
| --- | --- |
| `Producto` | CHECK precio/stock/reservado no negativos y reservado <= stock. Revisar previamente los datos legacy; no borrar ni corregir saldos de manera implícita. |
| Detalles, reservas y asignaciones | CHECK cantidad > 0; costos/precios/tasas/importes no negativos; totales y cantidades consistentes. Una asignación consume el producto/lote referenciado. |
| `Pedido` | CHECK `reservaHasta > confirmadoAt` y `reservaHasta <= confirmadoAt + interval '1 hour'`; fechas de entrega/cancelación coherentes con estado. Límite inmutable. |
| `ReservaInventario` | Cantidad positiva, estado/fechas coherentes. Verificar que límite y cantidad correspondan al detalle/pedido mediante trigger o transacción controlada. |
| `VinculacionClienteUsuario` | Índices únicos parciales por `(tenantId,clienteComercialId)` y `(tenantId,usuarioId)` WHERE `revocadaAt IS NULL`. Fechas de verificación/revocación válidas; verificación de titularidad en backend. |
| `Carrito` | Índice único parcial `(tenantId,clienteComercialId)` WHERE estado = ACTIVO. Confirmar carrito/pedido una sola vez por operación idempotente. |
| `TurnoCaja` | Índice único parcial `(tenantId,cajaId)` WHERE estado = ABIERTO. CHECK fechas/valores de cierre completos o todos nulos según estado; diferencia = contado - esperado. |
| `Venta` | CHECK pedido implica cliente y origen PORTAL; PORTAL implica pedido. Anulada exige autor, fecha y motivo. Crédito requiere cliente mediante cuenta/servicio transaccional. |
| `AplicacionCobro` | Monto positivo. Cuenta informada exige cliente informado. Completar cliente de forma coherente con cuenta/cobro/venta; no eludir identidad dejando cliente nulo. Una aplicación normal no puede consumir un cobro reversado. |
| `CuentaPorCobrar`, `AjusteCuentaPorCobrar` | Importe inicial/exigible no negativos; 0 <= saldo <= exigible; estado acorde. Ajuste no cero, motivo y origen según tipo; devolución/reversión deben corresponder a la venta y cuenta. |
| `Cobro`, `Reembolso`, `GastoComercial` | Montos positivos. Actor/fechas de reversión o confirmación consistentes. Efectivo requiere turno activo; movimientos no efectivos no deben aumentar efectivo. |
| `MovimientoCaja` | Origen exclusivo: cobro, reembolso, gasto, o manual con motivo. Método/dirección/importe y turno coinciden con el origen; no movimiento contra turno cerrado. |
| `MovimientoInventario` | Deltas por tipo y origen exclusivo; ventas y bajas requieren lote/costo, reservas solo delta reservado. Referencias extendidas completas si su ID está presente. Recepción coincide con entrada/lote; reversiones no exceden original. |
| `DevolucionVenta`, detalles | Cantidad e importe no exceden los originales menos devoluciones aprobadas. Los montos distribuidos entre ajuste de deuda y reembolso no duplican el valor devuelto. |
| `ComprobanteVenta`, secuencia | Consecutivo positivo, formato COMP-n coherente y creciente; no reutilizar emitidos/anulados. Cliente del documento coincide con venta. Emisión/anulación solo con datos completos. |
| `AuditoriaOperacion` | Membresía implica usuario y ambos deben coincidir; actor SISTEMA no inventa membresía. Snapshot del rol y motivo de operaciones sensibles. |
| `EventoSalida`, `NotificacionCliente`, `SolicitudIdempotente` | Intentos no negativos, lease/fechas coherentes, origen de notificación según tipo; el mismo evento no se redirige a otro cliente. Misma clave con hash diferente se rechaza. |

Las reglas agregadas necesitan triggers diferidos bajo bloqueo y/o un servicio
transaccional con todas las escrituras coordinadas; una consulta previa al saldo
o CHECK sobre una fila no es suficiente. En concreto:

- En LOTES, stock del producto = suma física de lotes y reservado = suma de
  reservas activas. Ambos concuerdan con los deltas desde apertura.
- Total de aplicaciones vigentes + reembolsos no excede monto del cobro.
  Saldo de cuenta = importe inicial + ajustes - aplicaciones vigentes de cuenta.
- Una devolución no puede reintegrar stock y registrar pérdida financiera dos
  veces. Cobro, aplicación y movimiento de caja son hechos distintos, no tres
  ingresos. Auditoría no se suma a reportes financieros.
- Lote vencido/no apto no se entrega; no hay asignación automática. El personal
  selecciona lotes al entregar y el backend revalida bajo bloqueo.
- El stock físico de caja se descuenta una vez al completar; el del pedido una
  vez al entregar. Crear comprobante no provoca otra salida.

## Transición y trabajo funcional pendiente

Conservar LEGACY por defecto. Antes de habilitar LOTES, conciliar existencias
anteriores y asignar sus costos manualmente, crear apertura sin incrementar el
stock nuevamente, y adaptar `ProductoService`/`CompraService` y cualquier otra
escritura. No existe un segundo stock independiente ni autorización para
sobrescribir los saldos antiguos. No abrir STORE con estos servicios incompletos.

Antes de PERMISOS, poblar equivalencias y asignaciones verificadas, adaptar
guards/JWT/select-context, implementar techo delegable y protección OWNER, y
revalidar versión/estado de autorización. `StaffProfile.tenantRole` sigue su
flujo actual hasta esa transición; no es una fuente nueva de permisos.

Pedidos deben fijar precio durante una hora, liberar sin descontar físico al
cancelar/expirar, rechazar entrega vencida aunque el cron se retrase y requerir
pedido nuevo con precio vigente. Confirmación, entrega, cobro, consumo de reserva,
historial, auditoría y outbox deben tener fronteras transaccionales definidas.

Los procesos nuevos requieren servicios de caja/cartera/devolución, numeración
por negocio bajo bloqueo, outbox con reintentos/deduplicación, portal con vínculo
verificado y notificaciones personales. Ninguno funciona por crear tablas.
No se ha integrado SRI, pasarela, envíos, sucursales ni pesos/fracciones.

## Verificaciones de esta etapa

- `prisma format`, `prisma validate` y `prisma generate`: correctos con 6.10.1.
- Diff entre datamodel anterior y nuevo, sin datasource ni conexión: preparado
  únicamente para inspección. No contiene DROP TABLE/DROP COLUMN. La conversión
  Float -> Decimal y campos/índices nuevos exigen todavía SQL de transición.
- `npm test -- --runInBand`: 38 suites, 158 pruebas correctas. El primer intento
  restringido falló al escribir la caché de Jest; la ejecución autorizada fuera
  de ese entorno pasó.
- `npm run build`: correcto.
- `npm run lint -- --no-fix`: falló por problemas existentes de tipado/formato.
  Se deshabilitó la corrección automática global para no reescribir archivos
  ajenos. Los archivos de compatibilidad se revisan por separado contra HEAD.
- Revisión de lint de los cuatro archivos modificados: los dos servicios y las
  pruebas de producto están limpios. Las pruebas de compra conservan exactamente
  sus dos diagnósticos previos de uso inseguro de `any`, sin diagnósticos nuevos.
- Tras el ajuste final de una aserción, las dos suites de compatibilidad se
  ejecutaron nuevamente: 9 pruebas correctas.
- Inspección del datamodel generado: 39 modelos agregados, ninguno eliminado;
  ninguna relación nueva entre entidades de negocio omite tenant en su FK,
  y todas las relaciones propietarias nuevas usan borrado RESTRICT.

No se aplicaron migraciones, no se ensayó una actualización/base nueva ni se
verificaron saldos reales. No se ejecutaron pruebas e2e que conectan la base.

**El cliente generado y el schema están adelantados respecto de la base actual.**
No iniciar/desplegar este código contra una base aún sin migrar: Prisma puede
solicitar las columnas nuevas. La fase siguiente debe preparar y revisar SQL,
confirmar nuevamente el destino de desarrollo, comprobar datos y ensayar la
migración. En particular, las fechas nuevas de Producto requieren backfill
antes de NOT NULL; `@updatedAt` no rellena por sí solo filas existentes en SQL.
No ejecutar directamente el diff temporal como migración.

Producción sigue fuera del alcance; requiere ensayo sobre copia reciente,
respaldo/restauración verificados, revisión de bloqueos y despliegue compatible.
