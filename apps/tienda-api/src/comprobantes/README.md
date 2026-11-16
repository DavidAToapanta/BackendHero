# B12 · Comprobantes internos

Todas las rutas usan el token de Tienda y el negocio de la sesión.

| Ruta | Permiso | Operación |
| --- | --- | --- |
| `POST /comprobantes` | `store.receipts.issue` | Emite a partir de `{ ventaId }` con `Idempotency-Key`. Devuelve `{ recursoTipo, recursoId }`. |
| `GET /comprobantes` | `store.receipts.read` | Lista con `pagina` y `limite` opcionales. |
| `GET /comprobantes/:id` | `store.receipts.read` | Consulta la cabecera y los datos históricos de detalle. |
| `GET /comprobantes/:id/pdf` | `store.receipts.read` | Descarga el PDF del comprobante existente. |

Cada venta tiene un comprobante y el consecutivo `COMP-` se asigna por
negocio. El consecutivo se devuelve como texto. La escritura y la auditoría
confirman juntas. El PDF se genera a partir de los datos guardados.

La anulación de venta B11 cambia el comprobante a `ANULADO` en la misma
transacción y conserva el consecutivo. El PDF sigue disponible con ese estado.
La [suite HTTP con PostgreSQL](../../../../test/tienda-auth-postgres.e2e-spec.ts)
usa una venta de ensayo para verificar emisión, acceso y descarga.
