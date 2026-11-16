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
    { "productoId": 15, "cantidad": 2, "lotes": [{ "loteId": 8, "cantidad": 2 }] }
  ],
  "pago": { "metodo": "EFECTIVO", "monto": "10.40" }
}
```

Responde `201` con `{ recursoTipo: "Venta", recursoId }`. El
`recursoId` identifica la venta guardada.

El precio de catálogo es el precio final. El servidor calcula cada línea
sin añadir IVA ni aplicar descuentos. Trunca a dos decimales por línea
y en el importe recibido del pago, de modo que `10.409` se toma como
`10.40`. El importe del pago debe coincidir con el total. Registra el
monto aplicado a la venta, una vez descontado cualquier vuelto.

El servidor vuelve a validar los lotes y guarda el costo histórico. El
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
