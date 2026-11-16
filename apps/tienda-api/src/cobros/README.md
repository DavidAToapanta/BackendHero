# B05 · Cobros

Las rutas usan el token de Tienda y el negocio de la sesión.

| Ruta | Permiso | Resultado |
| --- | --- | --- |
| `GET /cobros` | `store.payments.read` | Lista paginada con filtro opcional `clienteComercialId`. |
| `GET /cobros/:id` | `store.payments.read` | Cobro, aplicaciones y monto disponible. |
| `POST /cobros` | `store.payments.create` | Registra y aplica un cobro a una venta existente. Los abonos con `cuentaId` requieren además `store.receivables.collect`. |
| `POST /cobros/:id/reversion` | `store.payments.reverse` | Revierte un cobro erróneo y sus aplicaciones vigentes. |
| `POST /cobros/aplicaciones/:id/reversion` | `store.payments.reverse` y `store.receivables.adjust` | Revierte una aplicación completa y restaura el saldo de la cuenta. |
| `POST /cobros/reembolsos` | `store.payments.refund` | Devuelve dinero de una aplicación revertida. |

El `POST` requiere el encabezado `Idempotency-Key` y recibe
`{ ventaId, cuentaId?, metodo, monto, turnoId?, referencia? }`.

## B09 · Reversiones y reembolsos

Las tres operaciones requieren `Idempotency-Key` y un `motivo`. Se
conserva el historial y se audita cada modificación dentro de la misma
transacción.

- La reversión de un cobro en efectivo compensa la entrada en su turno
  original, que debe seguir abierto. Para devolver dinero en otro turno,
  revierte la aplicación y registra el reembolso desde el turno vigente.
- Una corrección del pago inicial aumenta el importe exigible y restaura
  el saldo. El monto original financiado se conserva para el historial.
  Para una venta de contado, la corrección se coordina con la devolución
  o anulación de la venta si dejaría un saldo abierto.
- Un reembolso recibe `{ aplicacionId, metodo, monto, motivo, turnoId?,
  referencia? }` y solo puede usar el saldo disponible de la aplicación
  revertida y del cobro original. `turnoId` es obligatorio para efectivo
  y se omite en los demás métodos. El remanente sigue visible como
  `montoDisponible` en el detalle del cobro.
`monto` se envía como cadena decimal con hasta dos decimales. En efectivo,
`turnoId` debe ser el turno abierto de la sesión. El monto registrado
corresponde al dinero recibido después de entregar el vuelto. La respuesta
es `{ recursoTipo: "Cobro", recursoId }`.

El titular se toma de la venta y las referencias se comprueban dentro del
negocio. El registro, la aplicación, la entrada de efectivo cuando
corresponde y la auditoría se confirman juntos. Un abono descuenta el saldo
de la cuenta vinculada y la marca como pagada cuando llega a cero.

`CobrosModule` exporta `CobrosOperacionService` para que los coordinadores
de venta y cartera puedan registrar y aplicar pagos con su propio `tx`.
La [suite HTTP con PostgreSQL](../../../../test/tienda-auth-postgres.e2e-spec.ts)
prueba el flujo con una venta financiada de ensayo.
