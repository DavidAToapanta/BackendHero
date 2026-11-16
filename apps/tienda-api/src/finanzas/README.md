# B13 · Gastos comerciales

| Ruta | Permiso | Operación |
| --- | --- | --- |
| `POST /finanzas/gastos` | `store.expenses.write` | Registra el gasto y devuelve `{ recursoTipo, recursoId }`. |
| `GET /finanzas/gastos` | `store.expenses.read` | Consulta gastos del negocio con filtros opcionales `desde`, `hasta`, `pagina` y `limite`. |

El registro requiere el encabezado `Idempotency-Key` y un cuerpo
`{ concepto, metodo, monto, categoria?, referencia?, turnoId?, fecha? }`.
El monto se envía como cadena decimal positiva con hasta dos decimales.
La fecha es ISO 8601 con zona horaria y, si se omite, se usa la del registro.
El negocio y el responsable provienen de la sesión.

En efectivo se requiere el turno abierto de la sesión, con saldo suficiente.
El gasto, la salida de caja y la auditoría se confirman en la misma
transacción. Los otros medios se registran con el turno omitido.
En la lista, `desde` es inclusivo y `hasta` exclusivo.
La corrección de un gasto registrado queda pendiente de una regla contable.

La [suite HTTP con PostgreSQL](../../../../test/tienda-auth-postgres.e2e-spec.ts)
verifica reintentos, permisos, aislamiento, medios de pago y cierre de caja.

## B15 · Resumen financiero

`GET /finanzas/resumen?desde=2026-05-01&hasta=2026-06-01` requiere
`store.reports.read` y usa el negocio de la sesión. Envía fechas
`AAAA-MM-DD` en Guayaquil. El intervalo incluye el inicio y excluye el
fin, con un máximo de 366 días. Sirve para un día, una semana, un mes o
varios meses según los límites enviados.

| Campo | Cálculo |
| --- | --- |
| `ventasNetas` | Ventas por fecha de registro menos devoluciones por fecha de aprobación y el remanente de las anulaciones por fecha de anulación. |
| `costoNetoVendido` | Costo original de los lotes vendidos menos el costo de las unidades devueltas y el costo restante en las anulaciones. |
| `utilidadBruta` | Ventas netas menos costo neto vendido. |
| `dineroRecibido`, `dineroDevuelto` | Cobros confirmados por fecha de cobro y reembolsos confirmados por fecha de confirmación. Los abonos se cuentan como cobros. Los cobros reversados quedan excluidos. |
| `flujoCobros` | Dinero recibido menos dinero devuelto. |
| `gastosComerciales` | Gastos por la fecha asignada al registrarlos. |
| `perdidasInventario` | Bajas al costo de A10/A11 más el costo de la mercancía que no retornó al anular. Las devoluciones dañadas cuentan mediante la baja de A11. |
| `resultadoOperativoEstimado` | Utilidad bruta menos gastos comerciales y pérdidas de inventario. |

Las devoluciones y anulaciones de ventas de un período anterior se
reconocen en el período en que ocurren. Por eso un período puede tener
ventas netas negativas. El resumen devuelve los importes como cadenas
decimales y conserva hasta cuatro decimales en costos y pérdidas.
