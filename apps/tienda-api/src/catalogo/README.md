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
