# B10 · Devoluciones de venta

Las rutas usan el negocio de la sesión. Para consultar requieren
`store.returns.read` y para registrar requieren `store.returns.write`.

| Ruta | Resultado |
| --- | --- |
| `GET /devoluciones/ventas/:id` | Asignaciones de lote, unidades todavía retornables, saldo y aplicaciones de cobro vigentes de la venta. |
| `GET /devoluciones` | Devoluciones con filtro opcional `ventaId`, `pagina` y `limite`. |
| `GET /devoluciones/:id` | Detalle de la devolución y los reembolsos correspondientes. |
| `POST /devoluciones` | Aprueba una devolución y devuelve `{ recursoTipo, recursoId }`. |

El POST requiere `Idempotency-Key`. Ejemplo de devolución de una unidad
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
