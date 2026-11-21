# B10 · Devoluciones de venta

Las rutas usan el negocio de la sesión. Para consultar requieren
`store.returns.read` y para registrar requieren `store.returns.write`.

| Ruta | Resultado |
| --- | --- |
| `GET /devoluciones/ventas/:id` | Asignaciones de lote, unidades todavía retornables, saldo y aplicaciones de cobro vigentes de la venta. |
| `POST /devoluciones/ventas/:id/vista-previa` | Calcula una devolución parcial y sugiere el reparto entre deuda y pagos. Requiere `store.returns.read`. |
| `GET /devoluciones` | Devoluciones con filtro opcional `ventaId`, `pagina` y `limite`. |
| `GET /devoluciones/:id` | Detalle de la devolución y los reembolsos correspondientes. |
| `POST /devoluciones` | Aprueba una devolución y devuelve `{ recursoTipo, recursoId }`. |

`POST /devoluciones` requiere `Idempotency-Key`. Ejemplo de devolución de una unidad
pagada con un reembolso en efectivo.

```json
{
  "ventaId": 15,
  "motivo": "Producto devuelto",
  "lineas": [
    { "asignacionVentaId": 42, "cantidad": 1, "destino": "REINTEGRO_APTO" }
  ],
  "liberar": [
    { "aplicacionId": 62, "monto": "5.20", "reembolso": { "metodo": "EFECTIVO" } }
  ],
  "turnos": { "reembolso": 19 }
}
```

Usa `REINTEGRO_APTO` para devolver existencias al lote original o
`BAJA_NO_APTO` para registrar mercancía dañada o vencida sin aumentar el
stock vendible. El coordinador calcula el importe a partir de los datos
históricos de la venta. La suma de lo liberado de cobros y lo descontado
de deuda debe conciliar con ese importe. Para reducir solo deuda, omite
`liberar`. La venta anónima exige reembolso del dinero liberado. En una
venta identificada, el dinero liberado sin reembolso queda disponible
en el cobro original. Indica el turno vigente cuando se devuelva efectivo.

Inventario, deuda, reembolso y auditoría se guardan en la misma transacción.

## Vista previa para D7

`POST /devoluciones/ventas/15/vista-previa` responde `200`. Usa la tienda de
la sesión y permite consultar con `store.returns.read`, sin permiso de escritura.
No requiere `Idempotency-Key`, motivo ni turno. Acepta únicamente `lineas`,
entre 1 y 100, sin repetir una asignación. Cada cantidad debe ser un entero
positivo y cada destino debe ser `REINTEGRO_APTO` o `BAJA_NO_APTO`.

Solicitud:

```json
{
  "lineas": [
    { "asignacionVentaId": 42, "cantidad": 1, "destino": "REINTEGRO_APTO" }
  ]
}
```

Respuesta para una devolución de $70 con una deuda pendiente de $40:

```json
{
  "ventaId": 15,
  "subtotal": "70.00",
  "descuento": "0.00",
  "impuesto": "0.00",
  "total": "70.00",
  "saldoPendiente": "40.00",
  "reduccionSaldoSugerida": "40.00",
  "importeALiberar": "30.00",
  "liberarSugerido": [
    { "aplicacionId": 60, "monto": "20.00" },
    { "aplicacionId": 62, "monto": "10.00" }
  ]
}
```

Todos los importes son cadenas decimales con dos posiciones. El cálculo usa
`Prisma.Decimal`, precios históricos y devoluciones aprobadas anteriores.
Prorratea el descuento y el impuesto históricos restantes con `ROUND_DOWN`;
las últimas unidades absorben los céntimos pendientes. No toma el precio
actual del producto.

La sugerencia reduce primero la deuda hasta el menor valor entre el total
devuelto y `saldoPendiente`. El resto es `importeALiberar`: se distribuye por
ID ascendente entre aplicaciones vigentes de cobros confirmados, sin exceder
el monto de ninguna aplicación. Si todo reduce deuda, `importeALiberar` es
`"0.00"` y `liberarSugerido` es `[]`. Sin deuda, sugiere liberar el total.

**Liberar dinero y reembolsarlo son acciones distintas.** Liberar revierte
total o parcialmente su aplicación a esta venta. Reembolsar registra la
entrega del dinero al comprador. La vista previa no realiza ninguna de estas
acciones ni registra devoluciones, inventario, caja, cartera, auditoría o
idempotencia. Tampoco reserva unidades o garantiza que los datos no cambien.

Para confirmar, enviar las mismas líneas a `POST /devoluciones` con `ventaId`,
`motivo`, `Idempotency-Key` y el reparto elegido en `liberar`. Se puede copiar
`liberarSugerido` a `liberar`, agregando los datos de `reembolso` y `turnos`
cuando corresponda. Una venta anónima exige reembolsar lo liberado; en una
venta identificada puede quedar disponible en el cobro original. La vista
previa no selecciona un medio de reembolso ni autoriza la confirmación.
El contrato de confirmación sigue devolviendo `{ recursoTipo, recursoId }`.

Una venta inexistente o ajena responde `404`. Una venta anulada, una
asignación ajena a la venta/tienda, cantidades ya devueltas o aplicaciones
insuficientes responden `409`; entradas inválidas responden `400`. La
confirmación vuelve a calcular y validar dentro de su transacción con los
datos vigentes: ante cambios, actualizar la vista previa antes de reintentar.
