# B05 · Cobros

Las rutas usan el token de Tienda y el negocio de la sesión.

| Ruta | Permiso | Resultado |
| --- | --- | --- |
| `GET /cobros` | `store.payments.read` | Lista paginada con filtro opcional `clienteComercialId`. |
| `GET /cobros/:id` | `store.payments.read` | Cobro, aplicaciones y monto disponible. |
| `POST /cobros` | `store.payments.create` | Registra y aplica un cobro a una venta existente. Los abonos con `cuentaId` requieren además `store.receivables.collect`. |

El `POST` requiere el encabezado `Idempotency-Key` y recibe
`{ ventaId, cuentaId?, metodo, monto, turnoId?, referencia? }`.
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
