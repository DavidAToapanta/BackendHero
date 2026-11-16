# B08 · Cartera y abonos

Las consultas requieren `store.receivables.read` y usan el negocio de la sesión.

| Ruta | Resultado |
| --- | --- |
| `GET /cartera` | Cuentas abiertas con saldo. Admite `clienteComercialId`, `vencida`, `hasta`, `pagina` y `limite`. |
| `GET /cartera/:id` | Cuenta, días de mora, abonos, ajustes y reversiones registrados. |
| `GET /cartera/deudores` | Saldo pendiente por cliente, ordenado de mayor a menor. Admite paginación. |
| `GET /cartera/resumen` | Saldos vigente, vencido y pendiente. Admite `clienteComercialId`. |

La fecha `hasta` usa `AAAA-MM-DD` e incluye todo ese día en Guayaquil.
Una cuenta abierta se considera vencida desde el día siguiente a su
vencimiento. La mora cuenta días de calendario. Las cuentas pagadas y
canceladas quedan fuera de los saldos pendientes.

Registra abonos con [`POST /cobros`](../cobros/README.md) enviando
`cuentaId`, `ventaId`, `metodo` y `monto`, más `turnoId` para
efectivo. Usa `Idempotency-Key` y los permisos
`store.payments.create` y `store.receivables.collect`.
El servicio aplica el pago en la misma transacción que el cobro. La
cuenta pasa a `PAGADA` al llegar a cero y un abono que supera el saldo
recibe `409`.
