# A06 · Categorías de Tienda

Usa el token de acceso de Tienda. El servidor resuelve el tenant desde la
sesión y aplica el ámbito `STORE`.

## Rutas

- **`GET /catalogo/categorias`** requiere `store.catalog.read`. Acepta
  `q`, `activo=true|false`, `pagina` y `limite`. Devuelve
  `{ data: [{ id, nombre, activo }], meta: { pagina, limite, total, paginas } }`.
  La página inicial es 1, el límite predeterminado es 20 y el máximo es 50.
  Por defecto incluye ambos estados y ordena por nombre normalizado e ID.
- **`POST /catalogo/categorias`** recibe `{ "nombre": "Bebidas frías" }`
  y devuelve `201` con `{ id, nombre, activo }`.
- **`PATCH /catalogo/categorias/:categoriaId`** recibe `{ nombre?, activo? }`
  y devuelve `200` con la categoría resultante. `activo: false` desactiva
  y `activo: true` reactiva.
- **`PUT /catalogo/productos/:productoId/categoria`** recibe
  `{ "categoriaId": 12 }` para asignar o `{ "categoriaId": null }` para quitar.
  Devuelve `200` con `{ productoId, categoriaId }`.

Las escrituras requieren `store.catalog.write`. La desactivación conserva
los vínculos existentes y bloquea nuevas asignaciones hasta reactivar.
Una repetición de los valores vigentes devuelve el estado actual y conserva
el evento de auditoría original. En un negocio mixto, si el producto ya tiene
una categoría GYM, ese módulo debe liberar el vínculo antes de clasificarlo
desde Tienda.

- `400` indica un cuerpo o filtro inválido.
- `401` indica una sesión inválida o cuyo acceso a STORE dejó de estar vigente.
- `403` indica una sesión válida sin el permiso requerido.
- `404` indica un recurso fuera del ámbito o una categoría inactiva al
  intentar una asignación nueva.
- `409` indica un nombre duplicado, un vínculo GYM protegido o un cambio
  concurrente. Los nombres son únicos por tenant y módulo, también si la
  categoría está inactiva.

## Selectores, ventas y auditoría

Para clasificar productos, usa `GET /catalogo/categorias?activo=true`.
Para filtros históricos, puedes incluir categorías inactivas. B14 debe
filtrar por `DetalleVenta.categoriaId` y mostrar
`DetalleVenta.categoriaNombre`, el nombre registrado al vender. Una edición
de categoría o del vínculo cambia el catálogo vigente y conserva ambos
campos del detalle histórico.

Las escrituras y su auditoría K04 se confirman en la misma transacción.
Los cambios de asignación registran el producto y ambos IDs de categoría.
La [guía de auditoría](../auditoria/README.md) documenta las acciones.

## A07 · Productos y mostrador

Todas las rutas de productos usan el tenant de la sesión. Las consultas
requieren `store.catalog.read` y las escrituras `store.catalog.write`.

- **`GET /catalogo/productos`** admite `q` por nombre, presentación, SKU o barras,
  `activo=true|false`, `categoriaId`, `pagina` y `limite`. Devuelve
  `{ data, meta: { pagina, limite, total, paginas } }`. El orden es nombre
  e ID, el límite predeterminado es 20 y el máximo es 50. Incluye productos
  activos e inactivos por defecto.
- **`GET /catalogo/productos/:productoId`** devuelve la ficha administrativa
  con todas sus imágenes ordenadas. La lista y el detalle incluyen
  `estado`, `marca`, `descripcion`, `modoInventario`, `stockFisico`,
  `stockReservado`, `stockDisponible` y la imagen principal.
- **`POST /catalogo/productos`** y **`PATCH /catalogo/productos/:productoId`**
  reciben los campos de ficha `nombre`, `precio`, `presentacion`, `estado`,
  `sku`, `codigoBarras`, `marca` y `descripcion`. Para el alta se requieren
  nombre y precio. El alta responde `201`, con estado activo por defecto y
  stock cero. El parche acepta uno o más campos y responde `200`. Ambas
  respuestas incluyen el detalle. Precio es una cadena decimal no negativa
  con hasta dos decimales. SKU o barras duplicados en el tenant devuelven
  `409`. Los campos de inventario se rechazan con `400`. La categoría se
  asigna mediante A06.
- **`GET /catalogo/productos/mostrador?q=BEB-1`** lista fichas activas en el
  mismo formato paginado. **`GET /catalogo/productos/mostrador/por-barras?codigoBarras=001234`**
  devuelve una ficha igual por coincidencia exacta. Un código sin producto
  activo en el tenant devuelve `404`. Las barras se conservan como texto.

Ejemplo de ficha de mostrador.

```json
{
  "productoId": 15,
  "nombre": "Bebida tropical",
  "presentacion": "Lata mediana",
  "precio": "5.20",
  "sku": "BEB-1",
  "codigoBarras": "001234",
  "categoria": { "id": 12, "nombre": "Bebidas" },
  "imagenPrincipal": {
    "id": 9,
    "url": "https://cdn.example.com/bebida.png",
    "orden": 0,
    "textoAlternativo": "Frente de la lata"
  },
  "stockDisponible": 3
}
```

`categoria` e `imagenPrincipal` son nulas cuando faltan. La ficha usa la
categoría STORE asignada, incluso inactiva. En un negocio mixto, la edición
de ficha afecta al producto compartido, y A06 protege el vínculo GYM.

La disponibilidad de mostrador usa el cálculo de `@app/inventario` para
productos activos en LOTES. Toma el menor entre stock físico y existencias
físicas en lotes vigentes, resta reservas y aplica un mínimo de cero.
Productos LEGACY o inactivos tienen disponibilidad cero para venta STORE.

### Imágenes y snapshot de venta

- **`POST /catalogo/productos/:productoId/imagenes`** recibe
  `{ url, orden, textoAlternativo? }` y devuelve `201`.
  **`PATCH /catalogo/productos/:productoId/imagenes/:imagenId`** edita uno o
  más de esos campos y devuelve `200`. La URL debe usar HTTPS, y cambiarla
  reemplaza la referencia. El orden es un entero desde cero, es único en
  el producto y determina la imagen principal por su menor valor.
- **`DELETE /catalogo/productos/:productoId/imagenes/:imagenId`** elimina
  la referencia y devuelve `204`.
- **`POST /catalogo/productos/:productoId/imagenes/archivo`** carga un archivo, y
  **`PATCH /catalogo/productos/:productoId/imagenes/:imagenId/archivo`** lo reemplaza.
  Envía `multipart/form-data` con `archivo`, `orden` y `textoAlternativo` opcional.
  Se admiten JPG, PNG y WebP de hasta 3 MiB. Los archivos se guardan en
  PostgreSQL y siguen el ciclo de vida de la ficha de la imagen. La respuesta
  incluye una ruta de Tienda API para mostrar el archivo.
- **B06** importa `CatalogoModule` e inyecta `CatalogoService` de Tienda.
  Dentro de su transacción y tras bloquear el producto, llama a
  `obtenerSnapshotVenta(tx, tenantId, productoId)`. Recibe `productoId`,
  `nombreProducto`, `presentacionProducto`, `skuProducto`,
  `codigoBarrasProducto`, `categoriaId`, `categoriaNombre` y
  `precioUnitario` como `Prisma.Decimal`. A08 expone el detalle de lotes por
  producto. Al confirmar, B06 revalida stock y lotes y toma su costo histórico
  en el servidor. El precio y la categoría guardados en ventas anteriores
  se conservan al modificar el catálogo.

Las escrituras de ficha e imágenes usan la misma transacción que su
auditoría K04.
