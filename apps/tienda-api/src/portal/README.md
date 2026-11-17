# Portal de compra y retiro en tienda

El comprador usa su cuenta de identidad y un vínculo comercial verificado. La sesión del portal tiene una audiencia propia. El JWT del personal se usa para administrar vínculos y procesar pedidos en la tienda. Ambos tipos de sesión obtienen la tienda del token.

## Verificación y cuenta

| Ruta | Acceso | Solicitud y resultado |
| --- | --- | --- |
| `POST /portal/verificar-cuenta` | Credenciales de la cuenta | `{ cedula, password, tenantId }`. Devuelve `{ prueba }`, un token de un solo uso, válido 10 minutos para esa tienda. |
| `POST /portal/clientes/:id/vinculacion` | `store.customers.write` | `{ prueba }`. El personal verifica la ficha comercial y vincula la cuenta que demostró su control. Si hay una ficha de Gym, el usuario debe coincidir. |
| `DELETE /portal/clientes/:id/vinculacion` | `store.customers.write` | Revoca el vínculo. La sesión anterior pierde acceso. |
| `POST /portal/login` | Credenciales de la cuenta | `{ cedula, password, tenantId }`. Devuelve `{ accessToken, tenantId, clienteComercialId }` si la cuenta y el vínculo están activos. |
| `GET /portal/catalogo` | JWT portal | Productos activos, precio vigente y stock disponible. Admite búsqueda `q` y paginación. |
| `GET /portal/historial` | JWT portal | Ventas, comprobantes y cuentas comerciales propias. Si la ficha está vinculada al mismo usuario en Gym, incluye las membresías y deudas de Gym en un bloque separado. |
| `GET /portal/comprobantes/:id/pdf` | JWT portal | Descarga un comprobante propio, incluido su estado histórico. |

## Carrito y pedidos

| Ruta | Acceso | Solicitud y resultado |
| --- | --- | --- |
| `POST /carrito` | JWT portal | Crea el único carrito activo con `{ lineas: [{ productoId, cantidad }] }`. |
| `GET /carrito` | JWT portal | Devuelve el carrito activo o `null`. |
| `GET /carrito/:id` | JWT portal | Consulta un carrito propio por ID. |
| `PATCH /carrito/:id` | JWT portal | Sustituye las líneas del carrito activo. Recibe el mismo cuerpo que el alta. |
| `DELETE /carrito/:id` | JWT portal | Abandona el carrito activo. |
| `POST /pedidos` | JWT portal | Confirma `{ carritoId }` y reserva existencias. Requiere `Idempotency-Key`. |
| `GET /pedidos` | JWT portal | Lista pedidos propios. Admite `pagina` y `limite`. |
| `GET /pedidos/:id` | JWT portal | Consulta pedido propio, líneas con importes confirmados e historial de estados. |
| `DELETE /pedidos/:id` | JWT portal | Cancela un pedido propio vigente mediante `{ motivo }` y libera la reserva. |
| `GET /pedidos/operacion` | `store.sales.read` | Lista pedidos de la tienda autenticada. Admite `pagina` y `limite`. |
| `GET /pedidos/operacion/:id` | `store.sales.read` | Consulta el detalle del pedido de la tienda. |
| `DELETE /pedidos/operacion/:id` | `store.sales.create` | Cancela un pedido vigente de la tienda mediante `{ motivo }`. |
| `PATCH /pedidos/:id/preparacion` | `store.sales.create` | Pasa el pedido a `EN_PREPARACION` con el plazo original. |
| `POST /pedidos/:id/entrega` | `store.sales.create` | Recibe `{ turnoId, lineas: [{ productoId, cantidad, lotes: [{ loteId, cantidad }] }], pago: { metodo, monto, referencia? } }` y `Idempotency-Key`. Devuelve la referencia de la venta creada. |

El carrito muestra precios vigentes y no aparta existencias. Al confirmar, el servidor
recalcula los importes y guarda el precio por línea. La reserva dura una hora desde
la confirmación. Un pedido vencido requiere una nueva confirmación con un carrito nuevo.
La tarea de expiración libera reservas vencidas y las consultas de pedido también
comprueban el plazo. La entrega exige un turno abierto del cajero, pedido vigente en
preparación, lotes aptos seleccionados por personal y un pago exacto. El servidor
consume la reserva y registra una venta y su cobro en la misma transacción.
Para autorizar crédito al entregar, enviar también `vencimiento` con formato
`AAAA-MM-DD` y un pago inicial opcional menor al total. Se exige además
`store.sales.credit` y se crea la cuenta por cobrar para el saldo.

Reintentar confirmación o entrega con la misma `Idempotency-Key` y los mismos datos
devuelve la referencia original. El [comprobante interno](../comprobantes/README.md)
se emite después de la entrega.

## Avisos

| Ruta | Acceso | Solicitud y resultado |
| --- | --- | --- |
| `GET /notificaciones` | JWT portal | Lista avisos de la vinculación vigente. Admite `pagina` y `limite`. |
| `GET /notificaciones/:id` | JWT portal | Consulta un aviso propio. |
| `PATCH /notificaciones/:id` | JWT portal | Marca el aviso como leído y conserva la primera fecha de lectura al repetirlo. |
| `POST /notificaciones/cartera/:id/recordatorio` | `store.receivables.collect` | Solicita un recordatorio para una cuenta por cobrar abierta. Requiere `Idempotency-Key` y una vinculación activa del destinatario. |

El cambio de estado del pedido, la emisión del comprobante y la solicitud de un
recordatorio guardan `EventoSalida` en la transacción de origen. El procesador
reintenta con espera creciente y materializa cada aviso una vez por evento y cliente.
El portal consulta los avisos por HTTP.

## Contrato de la operación interna

El panel se consulta con `GET /panel`. Finanzas expone gastos comerciales y el
resumen de periodo. Las correcciones de ventas se hacen con las rutas de
devolución y anulación. Se retiraron las rutas genéricas que respondían `501`
para esos módulos y las operaciones genéricas de alta y borrado de avisos.

## Prueba con PostgreSQL

Aplicar las migraciones a una base local desechable `hero_tienda_auth_test`.
Configurar `DATABASE_URL`, `TIENDA_JWT_SECRET` y `TIENDA_AUTH_POSTGRES_E2E=1`.
Desde la raíz, ejecutar:

```powershell
npm.cmd run test:e2e -- --runInBand tienda-auth-postgres -t "Portal: verifica cuentas"
```
