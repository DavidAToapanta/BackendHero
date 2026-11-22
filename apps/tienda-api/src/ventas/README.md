# B06 · Venta de contado en mostrador

Busca el producto por nombre, SKU o barras en el
[catálogo A07](../catalogo/README.md#a07--productos-y-mostrador) y consulta
sus lotes vendibles en [inventario A08](../inventario/README.md). Abre un
turno de [caja](../caja/README.md) antes de confirmar.

`POST /ventas` exige un token con `store.sales.create` y el encabezado
`Idempotency-Key`. La tienda y el cajero salen de la sesión. El cliente
comercial es opcional y, si se indica, debe estar activo.

```json
{
  "turnoId": 12,
  "lineas": [
    { "productoId": 15, "cantidad": 2 }
  ],
  "pago": { "metodo": "EFECTIVO", "monto": "10.40" }
}
```

Responde `201` con `{ recursoTipo: "Venta", recursoId }`. El
`recursoId` identifica la venta guardada.

El precio de catálogo es el precio final. El servidor separa el IVA incluido
por línea y redondea la base a dos decimales. El total permanece igual al
precio final multiplicado por la cantidad. El importe aplicado al pago se
trunca a dos decimales y debe coincidir con el total en ventas al contado.

El dueño puede consultar la tarifa vigente y programadas mediante
`GET /configuracion/iva` y guardar una con `PUT /configuracion/iva` y
`{ porcentaje: "15", fecha?: "AAAA-MM-DD" }`. Una fecha futura empieza a
las 00:00 en la zona comercial usada por Tienda. Omitir la fecha aplica la
tarifa desde ese momento. Sin tarifa configurada se conserva el cálculo con
IVA 0 %. La venta conserva su desglose histórico para el comprobante y las devoluciones.

Si se omite `lotes`, el servidor asigna primero los lotes vigentes con el
vencimiento más próximo, seguido por los lotes sin vencimiento. Para elegir
lotes manualmente, envía `lotes: [{ loteId, cantidad }]` con la cantidad total
de la línea. El servidor vuelve a validar los lotes y guarda el costo histórico. El
cobro, la salida de inventario y la auditoría se confirman en la misma
transacción. Solo el efectivo suma al saldo de caja. Repetir la misma
operación con la misma clave devuelve el recurso original.

## B07 · Venta a crédito

`POST /ventas/credito` requiere `store.sales.create` y `store.sales.credit`,
además de `Idempotency-Key`. Usa el mismo turno, productos y lotes que la
venta de contado. En crédito son obligatorios `clienteComercialId`
(cliente activo de la tienda) y `vencimiento` en formato `AAAA-MM-DD`. El
vencimiento puede ser hoy o una fecha posterior en America/Guayaquil.

Omite `pago` para financiar todo o envía un pago inicial menor al total.
Una venta de $100 con un inicial de $20 crea una cuenta abierta con saldo
de $80. El inicial se aplica a la venta y el efectivo se registra en caja.
La cuenta, la venta, la salida de lotes y el pago inicial se confirman en
la misma transacción. La respuesta tiene el mismo formato que contado.

## B11 · Anulación de venta

`POST /ventas/:id/anulacion` requiere `store.sales.void`, un
`Idempotency-Key` y un `motivo`. Consulta primero
[`GET /devoluciones/ventas/:id`](../devoluciones/README.md) para ver las
aplicaciones de cobro vigentes y las unidades que aún se pueden devolver.

- Incluye en `liberar` cada aplicación vigente con su importe completo.
  Para reembolsarla, indica `reembolso.metodo` y añade
  `turnos.reembolso` si se devuelve efectivo. Para una venta sin cliente
  identificado, cada importe liberado debe devolverse. Si el cliente está
  identificado, puede quedar disponible en el cobro original.
- Envía en `lineas` solo la mercancía que regresó físicamente. Usa
  `REINTEGRO_APTO` para devolverla a existencias o `BAJA_NO_APTO` para
  registrar la baja. Omite las líneas si no regresó mercancía.

La respuesta incluye `recursoTipo`, `recursoId` y `efectos` con los
identificadores del comprobante, la cuenta cancelada, la devolución, los
movimientos y los reembolsos, además de los importes cancelado y liberado.
La venta y el comprobante conservan su historial. Si falla un efecto,
toda la operación se revierte.
