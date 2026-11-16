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
