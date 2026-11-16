# Inventario de Tienda

## A08 · Consultas de inventario

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

## A09 · Aperturas y entradas

Ambas rutas requieren `Authorization: Bearer <token>`, el permiso
`store.inventory.receive`, `Content-Type: application/json` y una cabecera
`Idempotency-Key`. El responsable es la membresía autenticada.

**Apertura con cinco unidades físicas en `LEGACY`**

```http
POST /inventario/productos/42/apertura
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: apertura-42-acta-01

{
  "motivo": "Conciliación de inventario",
  "referenciaExterna": "ACTA-01",
  "lotes": [{ "codigo": "INICIAL", "cantidad": 5, "costoUnitario": "1.2345" }]
}
```

La apertura mantiene las cinco unidades y cambia el modo a `LOTES`. Exige un
costo conciliado para cada lote y cero unidades reservadas. Para abrir un
producto con saldo cero, enviar `{"motivo":"Alta de inventario","lotes":[]}`.
La apertura desde cero deja una entrada auditada sin movimientos.

**Recepción para un producto en `LOTES`**

```http
POST /inventario/productos/42/entradas
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: recepcion-42-factura-01

{
  "motivo": "Reposición",
  "referenciaExterna": "FACTURA-01",
  "lotes": [{ "codigo": "REPOSICION-01", "cantidad": 3, "costoUnitario": "1.2500", "vencimiento": "2035-07-30T23:59:59-05:00" }]
}
```

La referencia y el vencimiento son opcionales. La recepción exige al menos un
lote y solo acepta vencimientos futuros. En una apertura se pueden conciliar
lotes vencidos como parte del stock físico. B06 consulta los lotes vigentes
en `GET /inventario/productos/42/lotes` y confirma disponibilidad dentro de
la transacción de venta con K03.

Ambas rutas devuelven `201` con `{"recursoTipo":"EntradaInventario","recursoId":123}`.
Para reintentar, conservar la clave y el orden de los lotes. B01 devuelve la
misma referencia ante datos equivalentes y `409` si cambia el contenido. La
entrada, los lotes, el stock, los movimientos y la auditoría se guardan en la
misma transacción. Los movimientos y la auditoría comparten una correlación.

## A10 · Ajustes y bajas justificadas

Usar el Bearer de Tienda y una `Idempotency-Key` en cada operación.
El tenant y el responsable se toman de la sesión. En un reintento se
conserva la misma clave. Ambas rutas responden `201` con
`{"recursoTipo":"MovimientoInventario","recursoId":123}`.

**Ajuste de conteo** (`store.inventory.adjust`)

```http
POST /inventario/productos/42/lotes/17/ajustes
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: ajuste-42-17-acta-02

{"delta":-1,"motivo":"Diferencia verificada en conteo físico"}
```

**Baja por pérdida** (`store.inventory.loss`)

```http
POST /inventario/productos/42/lotes/17/bajas
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: baja-42-17-acta-03

{"cantidad":2,"motivo":"Vencimiento"}
```

Las operaciones protegen las unidades reservadas y registran el costo histórico
del lote. La baja admite lotes vencidos y deja un delta físico negativo con
costo total no negativo. El detalle se consulta en el historial A08 con sus
permisos de lectura y costos.

**Total de pérdidas para B15**

```ts
const { totalPerdidas } = await inventarioLotes.consultarTotalPerdidas(
  tx, tenantId, desde, hasta,
);
```

B15 usa el tenant autorizado y convierte su periodo a dos instantes `Date`.
La librería suma `costoTotal` únicamente de movimientos `BAJA` en el intervalo
`[desde, hasta)` y devuelve el importe como cadena con cuatro decimales.
Sin bajas devuelve `"0.0000"`. Cuando A11 registre una baja vinculada a una
devolución, ese movimiento será la fuente del importe para B15.
