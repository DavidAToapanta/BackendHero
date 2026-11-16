# Escritura de auditoría K04

Importa `AuditoriaEscrituraModule` e inyecta `AuditoriaEscrituraService`.
Llama a `registrar(tx, contexto, operacion)` y espera el resultado dentro de
la transacción del caso de uso. Importa los códigos de `ACCIONES_AUDITORIA`
y el tipo `AccionAuditoria` desde `./auditoria-escritura`.

```ts
await this.auditoria.registrar(tx, contexto, {
  accion: ACCIONES_AUDITORIA.ACCESOS_ROL_EDITAR,
  entidadTipo: 'RolNegocio',
  entidadId: rolId,
  motivo: 'Revocación de acceso a ventas',
  correlacionId,
  datos: { campos: ['permisos'], permisos: ['store.catalog.read'] },
});
```

`contexto` aporta el tenant, `Usuario.id`, `UserTenant.id` y el código y
nombre del rol autenticado. `productoIds` es opcional. Se guarda una fila
por producto distinto con la misma correlación, o una fila con producto
nulo para una operación sin productos. El error de escritura se propaga al
llamador para que se revierta la transacción.

## Adaptador para servicios comerciales

Genera un UUID por operación y conserva ese valor en todos sus eventos y
movimientos de inventario. B02 y los servicios que reciben
`ContextoOperacionTienda` pueden usar el adaptador con el contexto de A02.

```ts
const operacion = this.auditoria.paraOperacion(
  contextoAutenticado,
  correlacionId,
);
return this.clientes.registrar(operacion, ficha);
```

Dentro de su transacción, el servicio llama a
`operacion.auditar(tx, { accion, recursoTipo, recursoId, productos, motivo, datos })`.
Los campos `productos`, `motivo` y `datos` son opcionales en el escritor.
Si el evento aporta su propio `correlacionId`, ese UUID tiene prioridad. El
coordinador valida el motivo cuando corresponde y gestiona la idempotencia
de su operación.

## Acciones iniciales y ejemplos de datos

Los ejemplos indican los valores de `entidadTipo`, `entidadId`, `productoIds`,
`motivo` y `datos` del escritor. En el adaptador se usan sus nombres equivalentes.

- **`inventario.entrada`** registra `EntradaInventario` e `entrada.id`, con
  `[productoId]`, motivo «Reposición» y `datos: { loteIds }`.
- **`inventario.baja`** registra `MovimientoInventario` y `movimiento.id`,
  con `[productoId]`, motivo «Producto vencido» y `datos: { loteId, cantidad }`.
- **`ventas.registrar`** registra `Venta` y `venta.id`, con los IDs de todos
  sus productos y `datos: { turnoId }`.
- **`cartera.abonar`** registra `Cobro` y `cobro.id`, con
  `datos: { cuentaPorCobrarId, aplicacionCobroId }`.
- **`ventas.anular`** registra `Venta` y `venta.id`, con los IDs de los
  productos afectados, el motivo de anulación y `datos: { turnoId }` cuando aplique.
- **`caja.cerrar`** registra `TurnoCaja` y `turno.id`, con motivo «Fin de
  turno» y `datos: { cajaId }`.
- **`caja.configurar`**, **`caja.abrir`** y **`caja.movimiento`** registran
  la caja, el turno y el movimiento de efectivo respectivamente.
- **`cobros.registrar`** y **`cobros.aplicar`** registran el cobro y su
  aplicación a la venta con el mismo identificador de correlación.
- **`clientes.registrar`**, **`clientes.editar`** y **`clientes.desactivar`**
  registran `ClienteComercial` y la ID de la ficha.
- **`catalogo.categorias.crear`**, **`catalogo.categorias.editar`**,
  **`catalogo.categorias.desactivar`** y **`catalogo.categorias.reactivar`**
  registran `CategoriaProducto` con su estado anterior y actual cuando aplica.
- **`catalogo.productos.categoria.asignar`** y
  **`catalogo.productos.categoria.desasignar`** registran `Producto` con
  su ID en `productoIds` y `datos: { categoriaIdAnterior, categoriaId }`.

A04 conserva los códigos `ACCESOS_ROLES_PREPARAR` y
`ACCESOS_PERMISOS_ACTIVAR` para `Tenant`; `ACCESOS_PERSONAL_ALTA`,
`ACCESOS_PERSONAL_VINCULAR`, `ACCESOS_PERSONAL_PERFIL`,
`ACCESOS_PERSONAL_ESTADO` y `ACCESOS_ROL_ASIGNAR` para `UserTenant`; y
`ACCESOS_ROL_CREAR` y `ACCESOS_ROL_EDITAR` para `RolNegocio`.
Los datos de estos eventos guardan referencias y campos modificados.

## Agrupación para A12

Cada par `(tenantId, correlacionId)` identifica una operación. Dentro de ella,
las filas con la misma acción, tipo de entidad e ID de entidad representan un
evento. Para filtrar por producto, primero encuentra las operaciones con una
fila del producto en el tenant autenticado. Luego recupera todas las filas
de esas operaciones dentro del mismo tenant, incluidos sus otros productos.
La paginación cuenta operaciones. A12 implementa esta lectura en el historial.
