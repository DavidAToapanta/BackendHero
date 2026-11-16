# Inventario compartido

Importar `InventarioModule` desde `@app/inventario`. Las operaciones reciben el cliente de la transacción abierta por el caso de uso, el tenant autenticado y, cuando escriben historial, la membresía responsable, una clave de operación y un UUID de correlación. El consumidor valida sus permisos y mantiene dentro de esa transacción la compra, venta o transición de pedido junto con los cambios de existencias.

| Servicio                    | Operación                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `InventarioService`         | Bloquear productos en orden de ID, descontar stock `LEGACY` con condición de saldo y fijar stock `LEGACY`.                                      |
| `InventarioLotesService`    | Conciliar la apertura de un producto, registrar entradas, ajustar un lote con motivo y retirar unidades por compra de Gym o venta de mostrador. |
| `ReservasInventarioService` | Reservar por detalle de pedido confirmado, liberar en la cancelación o expiración y consumir lotes asignados al entregar el pedido.             |

- Cada entrada agrupa los lotes de un producto. La apertura debe representar el saldo que ya existe y se solicita de forma explícita. Una entrada posterior incrementa el saldo.
- Antes de mutar varios productos en una venta, bloquear todos en una llamada a `bloquearProductos` y mantener el orden hasta terminar la transacción. En pedidos, bloquear primero el pedido y después sus productos. Las operaciones de reserva exigen completar la transición del pedido y todas sus líneas en la misma transacción.
- Las claves deben ser estables y distintas por operación dentro del tenant. La base impide aplicar dos veces el mismo movimiento. El consumidor se encarga de reconocer un reintento y devolver la respuesta anterior si su contrato lo requiere.
- En Gym, `POST /compra` mantiene el cuerpo de siempre para productos `LEGACY`. Para un producto `LOTES`, cada detalle incluye `lotes: [{ loteId, cantidad }]` con la selección manual. La suma debe coincidir con la cantidad del detalle. La membresía responsable se resuelve desde el JWT.

## K03 · Salida de venta

`InventarioLotesService.validarSeleccionVenta(tx, tenantId, lineas)` recibe
`LineaSalidaVenta[]` con `{ productoId, cantidad, lotes: [{ loteId, cantidad }] }`.
Adquiere los bloqueos de producto en orden de ID. B06 llama después de su
bloqueo de turno, dentro de la misma transacción de venta.

Cada línea suma exactamente sus unidades y contiene lotes distintos.
Inventario acumula las líneas por producto y lote para comprobar las
existencias de cada lote y el saldo vendible global después de reservas.
Devuelve `LineaSalidaValidada[]` en el orden original, con
`costoUnitario` y `costoTotal` como `Prisma.Decimal` obtenidos en servidor.

B06 guarda una venta `COMPLETADA`, sin pedido, sus detalles y las
asignaciones que devuelve esta validación. Por cada detalle guardado
llama una vez a `retirarVenta(tx, operacion, detalleVentaId)`. Esa llamada
valida los costos persistidos contra el lote y retira según las asignaciones.
Usa la misma clave de operación en los detalles: el sufijo por asignación
distingue movimientos aunque dos líneas consuman el mismo lote.
Si falla cualquier paso, propaga el error y revierte toda la transacción.

- `400`: selección inválida, lote vencido o stock insuficiente por lote o
  por producto después de reservas.
- `404`: producto inexistente o lote fuera del producto o tenant indicado.
- `409`: producto inactivo o fuera de LOTES, o costo guardado que difiere
  del costo confiable. La retirada también exige una venta de mostrador válida.

El ejemplo ejecutable está en [Inventario con PostgreSQL](../../test/inventario-postgres.e2e-spec.ts):
crea la venta, los detalles y las asignaciones, consume un mismo lote
desde dos líneas y demuestra rollback y concurrencia. Para reproducirlo,
migra una base desechable llamada `hero_inventario_test` en `127.0.0.1`,
configura `DATABASE_URL` para esa base y ejecuta:

```powershell
$env:INVENTARIO_POSTGRES_E2E = '1'
npm.cmd run test:e2e -- --runInBand test/inventario-postgres.e2e-spec.ts
```
