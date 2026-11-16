# A08 · Consultas de inventario

Usa Bearer de Tienda. Todas las rutas exigen `store.inventory.read`, toman
el tenant de la sesión y devuelven `{ data, meta: { pagina, limite, total, paginas } }`.
La página inicial es 1, el límite por defecto es 20 y el máximo es 50.

- **`GET /inventario/productos`** acepta `q` por nombre o SKU, `activo`,
  `pagina` y `limite`. Ordena por nombre e ID y devuelve `productoId`,
  `nombre`, `sku`, `estado`, `modoInventario`, `stockFisico`,
  `stockReservado` y `stockDisponible`. Usa la misma disponibilidad
  que el buscador de catálogo.
- **`GET /inventario/productos/:productoId/lotes`** devuelve `loteId`,
  `codigo`, `vencimiento` y `cantidadDisponible`. Ordena por vencimiento
  ascendente con nulos al final, y luego por ID. Por defecto muestra los
  lotes vigentes con cupo positivo. `soloVendibles=false` incluye lotes
  vencidos o agotados. Cada lote vigente ofrece el menor entre su saldo
  físico y el disponible global del producto. Los cupos se evalúan
  individualmente, porque la reserva corresponde al producto.
- **`GET /inventario/productos/:productoId/movimientos`** admite `tipo`,
  `desde` inclusivo y `hasta` exclusivo (ISO 8601 con zona). Ordena por
  fecha e ID descendentes. Devuelve `movimientoId`, `tipo`, `fecha`,
  `deltaFisico`, `deltaReservado`, `loteId`, `responsableId`, `motivo`
  y `correlacionId`. El responsable es el ID de la membresía.

En lotes y movimientos, `incluirCostos=true` exige también
`store.inventory.cost.read`; sin ese permiso responde `403`.
Con la autorización añade `costoUnitario` y, en movimientos,
`costoTotal`. Los importes se representan como cadenas de cuatro
decimales. Un costo ausente en un movimiento se representa como `null`.
Los clientes del mostrador usan los endpoints con su configuración
predeterminada y los costos históricos de la venta se resuelven en el servidor.

Los filtros inválidos devuelven `400`; una sesión inválida, `401`;
un producto ajeno o inexistente, `404`.

## Contrato K03 para B06

El [contrato de salida transaccional en la librería](../../../../libs/inventario/README.md#k03--salida-de-venta)
indica cómo validar toda la selección, guardar las asignaciones y retirar
por detalle con la misma transacción. B06 integra ese flujo en su coordinador.
