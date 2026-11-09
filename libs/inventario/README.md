# Inventario compartido

Importar `InventarioModule` desde `@app/inventario`. Las operaciones reciben el cliente de la transacción abierta por el caso de uso, el tenant autenticado y, cuando escriben historial, la membresía responsable, una clave de operación y un UUID de correlación. El consumidor valida sus permisos y mantiene dentro de esa transacción la compra, venta o transición de pedido junto con los cambios de existencias.

| Servicio | Operación |
| --- | --- |
| `InventarioService` | Bloquear productos en orden de ID, descontar stock `LEGACY` con condición de saldo y fijar stock `LEGACY`. |
| `InventarioLotesService` | Conciliar la apertura de un producto, registrar entradas, ajustar un lote con motivo y retirar unidades por compra de Gym o venta de mostrador. |
| `ReservasInventarioService` | Reservar por detalle de pedido confirmado, liberar en la cancelación o expiración y consumir lotes asignados al entregar el pedido. |

- Cada entrada agrupa los lotes de un producto. La apertura debe representar el saldo que ya existe y se solicita de forma explícita. Una entrada posterior incrementa el saldo.
- Antes de mutar varios productos en una venta, bloquear todos en una llamada a `bloquearProductos` y mantener el orden hasta terminar la transacción. En pedidos, bloquear primero el pedido y después sus productos. Las operaciones de reserva exigen completar la transición del pedido y todas sus líneas en la misma transacción.
- Las claves deben ser estables y distintas por operación dentro del tenant. La base impide aplicar dos veces el mismo movimiento. El consumidor se encarga de reconocer un reintento y devolver la respuesta anterior si su contrato lo requiere.
- En Gym, `POST /compra` mantiene el cuerpo de siempre para productos `LEGACY`. Para un producto `LOTES`, cada detalle incluye `lotes: [{ loteId, cantidad }]` con la selección manual. La suma debe coincidir con la cantidad del detalle. La membresía responsable se resuelve desde el JWT.
