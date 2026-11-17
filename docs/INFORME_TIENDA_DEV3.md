# Informe de verificación de Tienda API

**16 de noviembre de 2026 · Rama de prueba `dev3` · Base `origin/dev2` en `3845c40`.**

Este informe conserva la verificación de la base `3845c40`. El contrato actual
para las rutas de comprador implementadas después del ensayo está en el
[README del portal](../apps/tienda-api/src/portal/README.md).

## Alcance de la revisión

La comparación de `dev` (`ecce8c2`) con `dev2` abarca 440 archivos, con 33 589 líneas añadidas y 1 246 eliminadas. La revisión se guió por el [README de Tienda](../apps/tienda-api/README.md), la [guía de pruebas](../test/README.md), el [plan de implementación](PLAN_IMPLEMENTACION_TIENDA.md) y los README de cada módulo. El inventario se cotejó con las rutas que registra el servidor compilado.

| Área | Cambios revisados |
| --- | --- |
| Aplicaciones y operación | Arranque independiente de Gym y Tienda, configuración de compilación y despliegue, correlación HTTP y comprobaciones de salud. |
| Identidad y acceso | Selección de contexto para negocios con STORE, membresías, personal, roles delegables, permisos efectivos y revocación de sesiones. |
| Datos y catálogo | Esquema y migraciones de STORE, catálogo y categorías por negocio, consulta de mostrador, lotes, reservas, movimientos, bajas y auditoría. |
| Operación comercial | Idempotencia, clientes, apertura y cierre de caja, ventas de contado y crédito, cartera, abonos, reversiones, reembolsos, devoluciones y anulación. |
| Consultas y documentos | Comprobantes internos, gastos, análisis de ventas, conciliación financiera, panel y exportaciones en PDF y XLSX. |

## Hallazgos

- **31 rutas responden `501`.** Son todas las rutas de carrito, pedidos, portal y notificaciones, además de las operaciones genéricas de panel, finanzas y edición o eliminación de ventas. El backend permite operar el flujo de mostrador. El flujo de compra por carrito y pedidos sigue pendiente por HTTP. Las reservas de pedidos sí se ejercitan en la biblioteca de inventario.
- **La guía de pruebas está atrasada respecto de la suite.** El nombre histórico usado en el filtro del README de pruebas corresponde ahora al caso `vende, devuelve mercancía y anula el remanente sin duplicar stock` en la suite PostgreSQL.
- **El lint general falla.** La ejecución sin corrección automática informó 387 errores y 78 advertencias. Aparecen, por ejemplo, accesos inseguros a `any` en controladores de Gym. El script general tampoco incluye `apps/tienda-api/src` en su lista de rutas.

## Entorno y resultados

Las cinco migraciones se aplicaron sobre bases desechables UTF-8 en PostgreSQL 16, en un contenedor nuevo publicado solo en `127.0.0.1:55433`. El proceso compilado de Tienda se probó en el puerto local `18081`. Ambas rutas de salud devolvieron `200` y las respuestas incluyeron `X-Request-Id`. Un login con cuerpo vacío devolvió `400`. La consulta de sesión y el listado de ventas sin token devolvieron `401`.

| Verificación | Resultado |
| --- | --- |
| Compilación de Tienda y Gym | Ambas pasaron. |
| Pruebas unitarias | 234 de 234 en 58 suites. |
| Compatibilidad HTTP de Tienda y HTTP/WebSocket de Gym con proveedores de ensayo | 19 de 19. |
| Integración HTTP de Tienda con PostgreSQL | 19 de 19, ejecutadas en tres grupos con Node 24. |
| Suites adicionales de caja, clientes, idempotencia e inventario con PostgreSQL | 30 de 30. |
| Contraste con el servidor compilado | 118 rutas cotejadas. Se observaron 31 respuestas `501`. |

Con Node 24, la ejecución inicial de la suite principal en un solo proceso se cerró antes de emitir el resumen. Al repetir los casos en grupos de 3, 7 y 9, pasaron todos. La primera ejecución de las unitarias también se vio afectada por los permisos de la caché de Jest. Con una caché dentro del repositorio, pasaron las 58 suites.

### Flujos comerciales confirmados

- **Mostrador, devoluciones y anulación.** Con un fondo de `5.00`, la venta de tres unidades cobró `15.60`. Dos intentos concurrentes por el mismo stock produjeron un solo cobro. Repetir la solicitud con la misma clave devolvió la misma venta. Se comprobó una devolución apta, otra dañada y la anulación del remanente, con tres reembolsos, venta en estado `ANULADA`, una unidad disponible y pérdida de inventario de `2.00` en el escenario actual de la suite. El cierre terminó en `5.00` con diferencia cero.
- **Reportes.** El mismo flujo comprobó el análisis de ventas, el resumen financiero, los bloques visibles del panel según permisos y los importes dentro de los PDF y XLSX de ventas, finanzas y cierre. La exportación de un turno ajeno al cajero sin permiso de gestión devolvió `403`. La solicitud desde otra tienda devolvió `404`.
- **Crédito y cartera.** Se confirmó la venta a crédito, el saldo pendiente, el efecto de abonos concurrentes, las reversiones y los reembolsos. El escenario comprobó un saldo de cartera de `180.00` y el saldo de `100.00` después de aplicar abonos.
- **Comprobantes internos.** Las pruebas comprobaron que se emite un solo documento por venta, que se preserva su información histórica y que la anulación queda reflejada.
- **Caja, clientes, idempotencia e inventario.** Pasaron 30 pruebas adicionales con PostgreSQL. Caja aportó 7, clientes 3, idempotencia 9 e inventario 11. Se verificaron el cierre concurrente con cobros, el aislamiento de clientes, la atomicidad de los reintentos y la competencia por la última unidad.

### Datos para consumir la API

El login recibe `cedula` y `password`. Si hay varias tiendas elegibles, la selección recibe `selectionToken` y `tenantId`. Las operaciones protegidas obtienen el negocio de la sesión. Cuando la tabla indica varios permisos separados por comas, se exigen todos. Los requisitos de titularidad y supervisión de caja se comprueban además del permiso de ruta. Una cabecera `Idempotency-Key` identifica una escritura reintentable. Debe reutilizarse para reintentar la misma operación con los mismos datos.

Los cuerpos y consultas se identifican por su DTO en cada fila. Hay ejemplos y reglas de negocio en los README de [autenticación](../apps/tienda-api/src/auth/README.md), [caja](../apps/tienda-api/src/caja/README.md), [ventas](../apps/tienda-api/src/ventas/README.md), [cobros](../apps/tienda-api/src/cobros/README.md), [devoluciones](../apps/tienda-api/src/devoluciones/README.md) y [exportaciones](../apps/tienda-api/src/exportaciones/README.md).

## Repetir el flujo comercial

1. Crear una base local desechable `hero_tienda_auth_test` y apuntar `DATABASE_URL` a ella.
2. Configurar `TIENDA_JWT_SECRET` con un valor de ensayo y `TIENDA_AUTH_POSTGRES_E2E=1`.
3. Ejecutar `npx.cmd prisma generate` y `npx.cmd prisma migrate deploy`.
4. Ejecutar `npm.cmd run test:e2e -- --runInBand --verbose tienda-auth-postgres`. La suite crea sus usuarios, negocios y productos de prueba. Para ejecutar solo el flujo combinado de contado, agregar `-t "vende, devuelve mercancía y anula el remanente"`.
5. Para repetir la comprobación del arranque, ejecutar `npm.cmd run build:tienda` y `npm.cmd run start:prod:tienda` con un puerto disponible. Consultar `GET /health/live` y `GET /health/ready`.

## Inventario de endpoints

118 rutas explícitas, incluidas 31 que devuelven 501. Los enlaces llevan al controlador y a los DTO importados en él, donde están los campos, límites y validaciones. Los parámetros escritos como `:id` o similares se envían en la ruta. Los permisos `store.*` requieren un token de acceso de Tienda en `Authorization: Bearer <token>`.

### accesos

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/accesos/roles/preparar`](../apps/tienda-api/src/accesos/accesos.controller.ts#L47) | Prepara roles predefinidos | JWT Tienda + OWNER | — |
| [POST `/accesos/roles/activar`](../apps/tienda-api/src/accesos/accesos.controller.ts#L54) | Activa el modo de permisos | JWT Tienda + OWNER | Cuerpo `MotivoAccesoDto` |
| [GET `/accesos/personal`](../apps/tienda-api/src/accesos/accesos.controller.ts#L64) | Lista personal | store.staff.read | Consulta `ListaPersonalDto` |
| [POST `/accesos/personal`](../apps/tienda-api/src/accesos/accesos.controller.ts#L73) | Da de alta una cuenta y su membresía | store.staff.write, store.roles.manage | Cuerpo `AltaPersonalDto` |
| [POST `/accesos/personal/vincular`](../apps/tienda-api/src/accesos/accesos.controller.ts#L82) | Vincula una cuenta existente | store.staff.write, store.roles.manage | Cuerpo `VincularPersonalDto` |
| [GET `/accesos/personal/:membresiaId`](../apps/tienda-api/src/accesos/accesos.controller.ts#L91) | Consulta una membresía | store.staff.read, store.staff.write | Ruta `MembresiaParamDto` |
| [PATCH `/accesos/personal/:membresiaId/perfil`](../apps/tienda-api/src/accesos/accesos.controller.ts#L100) | Edita el perfil del personal | store.staff.read, store.staff.write | Ruta `MembresiaParamDto` · Cuerpo `PerfilPersonalDto` |
| [PATCH `/accesos/personal/:membresiaId/estado`](../apps/tienda-api/src/accesos/accesos.controller.ts#L110) | Cambia el estado de la membresía | store.staff.write | Ruta `MembresiaParamDto` · Cuerpo `EstadoPersonalDto` |
| [GET `/accesos/roles`](../apps/tienda-api/src/accesos/accesos.controller.ts#L120) | Lista roles | store.roles.manage | — |
| [POST `/accesos/roles`](../apps/tienda-api/src/accesos/accesos.controller.ts#L126) | Crea un rol | store.roles.manage | Cuerpo `CrearRolTiendaDto` |
| [PATCH `/accesos/roles/:rolId`](../apps/tienda-api/src/accesos/accesos.controller.ts#L135) | Edita un rol | store.roles.manage | Ruta `RolParamDto` · Cuerpo `EditarRolTiendaDto` |
| [PUT `/accesos/personal/:membresiaId/rol`](../apps/tienda-api/src/accesos/accesos.controller.ts#L145) | Asigna un rol a la membresía | store.roles.manage | Ruta `MembresiaParamDto` · Cuerpo `AsignarRolDto` |

### auditoria

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [GET `/auditoria`](../apps/tienda-api/src/auditoria/auditoria.controller.ts#L26) | Lista eventos históricos | store.audit.read | Consulta `ConsultaAuditoriaDto` |
| [GET `/auditoria/actividad-reciente`](../apps/tienda-api/src/auditoria/auditoria.controller.ts#L35) | Consulta actividad reciente | store.audit.read | — |
| [GET `/auditoria/:correlacionId`](../apps/tienda-api/src/auditoria/auditoria.controller.ts#L41) | Consulta eventos por correlación | store.audit.read | — |

### auth

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/auth/login`](../apps/tienda-api/src/auth/auth.controller.ts#L24) | Valida credenciales y entrega un token de acceso o de selección | Público | Cuerpo `LoginDto` |
| [POST `/auth/select-context`](../apps/tienda-api/src/auth/auth.controller.ts#L30) | Selecciona la tienda y emite el token de acceso | Público | Cuerpo `SelectContextDto` |
| [GET `/auth/session`](../apps/tienda-api/src/auth/auth.controller.ts#L36) | Consulta el contexto y permisos de la sesión | JWT Tienda | — |

### caja

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/caja`](../apps/tienda-api/src/caja/caja.controller.ts#L49) | Configura una caja | store.cash.manage | Cuerpo `ConfigurarCajaDto` |
| [GET `/caja`](../apps/tienda-api/src/caja/caja.controller.ts#L61) | Lista cajas y su disponibilidad | store.cash.read | Consulta `ListaCajasDto` |
| [GET `/caja/:id`](../apps/tienda-api/src/caja/caja.controller.ts#L73) | Consulta una caja | store.cash.read | Ruta `CajaParamDto` |
| [PATCH `/caja/:id`](../apps/tienda-api/src/caja/caja.controller.ts#L82) | Edita la configuración | store.cash.manage | Ruta `CajaParamDto` · Cuerpo `EditarCajaDto` |
| [DELETE `/caja/:id`](../apps/tienda-api/src/caja/caja.controller.ts#L99) | Desactiva una caja | store.cash.manage | Ruta `CajaParamDto` |
| [POST `/caja/:id/turnos`](../apps/tienda-api/src/caja/caja.controller.ts#L112) | Abre un turno con fondo inicial | store.cash.open | Ruta `CajaParamDto` · Cuerpo `AbrirTurnoDto` · Cabecera `idempotency-key` |
| [GET `/caja/:id/turno-activo`](../apps/tienda-api/src/caja/caja.controller.ts#L128) | Consulta el turno activo de la caja | store.cash.read | Ruta `CajaParamDto` |
| [GET `/caja/turnos/:id`](../apps/tienda-api/src/caja/caja.controller.ts#L141) | Consulta un turno | store.cash.read | Ruta `CajaParamDto` |
| [GET `/caja/turnos/:id/movimientos`](../apps/tienda-api/src/caja/caja.controller.ts#L152) | Lista los movimientos del turno | store.cash.read | Ruta `CajaParamDto` · Consulta `ListaMovimientosDto` |
| [POST `/caja/turnos/:id/movimientos`](../apps/tienda-api/src/caja/caja.controller.ts#L169) | Registra un movimiento manual | store.cash.movements.write | Ruta `CajaParamDto` · Cuerpo `MovimientoCajaDto` · Cabecera `idempotency-key` |
| [POST `/caja/turnos/:id/cierre`](../apps/tienda-api/src/caja/caja.controller.ts#L184) | Cierra y concilia el turno | store.cash.close | Ruta `CajaParamDto` · Cuerpo `CerrarTurnoDto` · Cabecera `idempotency-key` |

### carrito

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/carrito`](../apps/tienda-api/src/carrito/carrito.controller.ts#L18) | Alta de carrito | 501 | Cuerpo `CreateCarritoDto` |
| [GET `/carrito`](../apps/tienda-api/src/carrito/carrito.controller.ts#L23) | Listado de carrito | 501 | — |
| [GET `/carrito/:id`](../apps/tienda-api/src/carrito/carrito.controller.ts#L28) | Detalle de carrito | 501 | — |
| [PATCH `/carrito/:id`](../apps/tienda-api/src/carrito/carrito.controller.ts#L33) | Edición de carrito | 501 | Cuerpo `UpdateCarritoDto` |
| [DELETE `/carrito/:id`](../apps/tienda-api/src/carrito/carrito.controller.ts#L38) | Eliminación de carrito | 501 | — |

### cartera

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [GET `/cartera`](../apps/tienda-api/src/cartera/cartera.controller.ts#L77) | Lista cuentas pendientes | store.receivables.read | Consulta `PendientesCarteraDto` |
| [GET `/cartera/deudores`](../apps/tienda-api/src/cartera/cartera.controller.ts#L86) | Lista deudores | store.receivables.read | Consulta `PaginaTiendaDto` |
| [GET `/cartera/resumen`](../apps/tienda-api/src/cartera/cartera.controller.ts#L99) | Resume los saldos de cartera | store.receivables.read | Consulta `ClienteCarteraDto` |
| [GET `/cartera/:id`](../apps/tienda-api/src/cartera/cartera.controller.ts#L108) | Consulta una cuenta por cobrar | store.receivables.read | Ruta `CuentaParamDto` |

### catalogo

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [GET `/catalogo/categorias`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L48) | Lista categorías | store.catalog.read | Consulta `ListaCategoriasDto` |
| [POST `/catalogo/categorias`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L57) | Crea una categoría | store.catalog.write | Cuerpo `CrearCategoriaDto` |
| [PATCH `/catalogo/categorias/:categoriaId`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L66) | Edita una categoría | store.catalog.write | Ruta `CategoriaParamDto` · Cuerpo `EditarCategoriaDto` |
| [PUT `/catalogo/productos/:productoId/categoria`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L76) | Asigna o retira la categoría de un producto | store.catalog.write | Ruta `ProductoCategoriaParamDto` · Cuerpo `AsignarCategoriaDto` |
| [GET `/catalogo/productos`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L90) | Lista productos del catálogo | store.catalog.read | Consulta `ListaProductosDto` |
| [GET `/catalogo/productos/mostrador`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L99) | Busca productos para mostrador | store.catalog.read | Consulta `PaginacionCatalogoDto` |
| [GET `/catalogo/productos/mostrador/por-barras`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L108) | Busca un producto por código de barras | store.catalog.read | Consulta `CodigoBarrasDto` |
| [GET `/catalogo/productos/:productoId`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L117) | Consulta un producto | store.catalog.read | Ruta `ProductoCategoriaParamDto` |
| [POST `/catalogo/productos`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L126) | Crea un producto | store.catalog.write | Cuerpo `CrearProductoDto` |
| [PATCH `/catalogo/productos/:productoId`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L135) | Edita un producto | store.catalog.write | Ruta `ProductoCategoriaParamDto` · Cuerpo `EditarProductoDto` |
| [POST `/catalogo/productos/:productoId/imagenes`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L145) | Agrega una imagen | store.catalog.write | Ruta `ProductoCategoriaParamDto` · Cuerpo `CrearImagenDto` |
| [PATCH `/catalogo/productos/:productoId/imagenes/:imagenId`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L155) | Edita una imagen | store.catalog.write | Ruta `ImagenParamDto` · Cuerpo `EditarImagenDto` |
| [DELETE `/catalogo/productos/:productoId/imagenes/:imagenId`](../apps/tienda-api/src/catalogo/catalogo.controller.ts#L170) | Elimina una imagen | store.catalog.write | Ruta `ImagenParamDto` |

### clientes

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/clientes`](../apps/tienda-api/src/clientes/clientes.controller.ts#L37) | Crea una ficha de cliente comercial | store.customers.write | Cuerpo `CreateClienteDto` |
| [GET `/clientes`](../apps/tienda-api/src/clientes/clientes.controller.ts#L49) | Lista o busca clientes | store.customers.read | Consulta `ListaClientesDto` |
| [GET `/clientes/:id`](../apps/tienda-api/src/clientes/clientes.controller.ts#L64) | Consulta la ficha de un cliente | store.customers.read | Ruta `ClienteParamDto` |
| [PATCH `/clientes/:id`](../apps/tienda-api/src/clientes/clientes.controller.ts#L73) | Actualiza la ficha | store.customers.write | Ruta `ClienteParamDto` · Cuerpo `UpdateClienteDto` |
| [DELETE `/clientes/:id`](../apps/tienda-api/src/clientes/clientes.controller.ts#L90) | Desactiva el cliente | store.customers.write | Ruta `ClienteParamDto` |

### cobros

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/cobros`](../apps/tienda-api/src/cobros/cobros.controller.ts#L43) | Registra un cobro y sus aplicaciones | store.payments.create | Cuerpo `RegistrarCobroDto` · Cabecera `idempotency-key` |
| [GET `/cobros`](../apps/tienda-api/src/cobros/cobros.controller.ts#L60) | Lista cobros | store.payments.read | Consulta `ListaCobrosDto` |
| [POST `/cobros/:id/reversion`](../apps/tienda-api/src/cobros/cobros.controller.ts#L69) | Revierte un cobro | store.payments.reverse | Ruta `CobroParamDto` · Cuerpo `MotivoCorreccionCobroDto` · Cabecera `idempotency-key` |
| [POST `/cobros/aplicaciones/:id/reversion`](../apps/tienda-api/src/cobros/cobros.controller.ts#L85) | Revierte la aplicación del cobro | store.payments.reverse, store.receivables.adjust | Ruta `CobroParamDto` · Cuerpo `MotivoCorreccionCobroDto` · Cabecera `idempotency-key` |
| [POST `/cobros/reembolsos`](../apps/tienda-api/src/cobros/cobros.controller.ts#L101) | Registra un reembolso | store.payments.refund | Cuerpo `ReembolsarCobroDto` · Cabecera `idempotency-key` |
| [GET `/cobros/:id`](../apps/tienda-api/src/cobros/cobros.controller.ts#L115) | Consulta el detalle del cobro | store.payments.read | Ruta `CobroParamDto` |

### comprobantes

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/comprobantes`](../apps/tienda-api/src/comprobantes/comprobantes.controller.ts#L67) | Emite un comprobante interno por venta | store.receipts.issue | Cuerpo `EmitirComprobanteDto` · Cabecera `idempotency-key` |
| [GET `/comprobantes`](../apps/tienda-api/src/comprobantes/comprobantes.controller.ts#L81) | Lista comprobantes | store.receipts.read | Consulta `ListaComprobantesDto` |
| [GET `/comprobantes/:id`](../apps/tienda-api/src/comprobantes/comprobantes.controller.ts#L94) | Consulta un comprobante histórico | store.receipts.read | Ruta `ComprobanteParamDto` |
| [GET `/comprobantes/:id/pdf`](../apps/tienda-api/src/comprobantes/comprobantes.controller.ts#L103) | Descarga el PDF del comprobante | store.receipts.read | Ruta `ComprobanteParamDto` |

### devoluciones

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/devoluciones`](../apps/tienda-api/src/devoluciones/devoluciones.controller.ts#L39) | Registra una devolución con reintegro o baja y compensación según la operación | store.returns.write | Cuerpo `CreateDevolucionDto` · Cabecera `idempotency-key` |
| [GET `/devoluciones`](../apps/tienda-api/src/devoluciones/devoluciones.controller.ts#L55) | Lista devoluciones | store.returns.read | Consulta `ListaDevolucionesDto` |
| [GET `/devoluciones/ventas/:id`](../apps/tienda-api/src/devoluciones/devoluciones.controller.ts#L64) | Consulta el estado de devoluciones de una venta | store.returns.read | Ruta `DevolucionParamDto` |
| [GET `/devoluciones/:id`](../apps/tienda-api/src/devoluciones/devoluciones.controller.ts#L73) | Consulta una devolución | store.returns.read | Ruta `DevolucionParamDto` |

### exportaciones

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [GET `/exportaciones/ventas/:formato`](../apps/tienda-api/src/exportaciones/exportaciones.controller.ts#L53) | Descarga el reporte de ventas en XLSX o PDF | store.sales.analytics.read, store.reports.export | Ruta `ArchivoParamDto` · Consulta `AnalizarVentasDto` |
| [GET `/exportaciones/finanzas/:formato`](../apps/tienda-api/src/exportaciones/exportaciones.controller.ts#L70) | Descarga el reporte financiero en XLSX o PDF | store.reports.read, store.reports.export | Ruta `ArchivoParamDto` · Consulta `PeriodoComercialDto` |
| [GET `/exportaciones/caja/turnos/:id/:formato`](../apps/tienda-api/src/exportaciones/exportaciones.controller.ts#L86) | Descarga el cierre de un turno en XLSX o PDF | store.cash.read, store.reports.export | Ruta `ArchivoTurnoParamDto` |

### finanzas

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/finanzas`](../apps/tienda-api/src/finanzas/finanzas.controller.ts#L28) | Altas genéricas de finanzas | 501 | Cuerpo `CreateFinanzaDto` |
| [GET `/finanzas`](../apps/tienda-api/src/finanzas/finanzas.controller.ts#L33) | Listado genérico de finanzas | 501 | — |
| [GET `/finanzas/resumen`](../apps/tienda-api/src/finanzas/finanzas.controller.ts#L38) | Concilia ventas, cobros, gastos y pérdidas del periodo | store.reports.read | Consulta `PeriodoComercialDto` |
| [GET `/finanzas/:id`](../apps/tienda-api/src/finanzas/finanzas.controller.ts#L54) | Detalle genérico de finanzas | 501 | — |
| [PATCH `/finanzas/:id`](../apps/tienda-api/src/finanzas/finanzas.controller.ts#L59) | Edición genérica de finanzas | 501 | Cuerpo `UpdateFinanzaDto` |
| [DELETE `/finanzas/:id`](../apps/tienda-api/src/finanzas/finanzas.controller.ts#L64) | Eliminación genérica de finanzas | 501 | — |

### Gastos comerciales

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/finanzas/gastos`](../apps/tienda-api/src/finanzas/gastos-comerciales.controller.ts#L32) | Registra un gasto comercial y su impacto en caja cuando aplica | store.expenses.write | Cuerpo `RegistrarGastoDto` · Cabecera `idempotency-key` |
| [GET `/finanzas/gastos`](../apps/tienda-api/src/finanzas/gastos-comerciales.controller.ts#L49) | Lista gastos comerciales | store.expenses.read | Consulta `ListaGastosDto` |

### inventario

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [GET `/inventario/productos`](../apps/tienda-api/src/inventario/inventario.controller.ts#L39) | Lista productos y sus saldos | store.inventory.read | Consulta `ProductosInventarioDto` |
| [GET `/inventario/productos/:productoId/lotes`](../apps/tienda-api/src/inventario/inventario.controller.ts#L48) | Lista lotes de un producto | store.inventory.read | Ruta `ProductoParamDto` · Consulta `LotesInventarioDto` |
| [GET `/inventario/productos/:productoId/movimientos`](../apps/tienda-api/src/inventario/inventario.controller.ts#L58) | Lista movimientos del producto | store.inventory.read | Ruta `ProductoParamDto` · Consulta `MovimientosInventarioDto` |
| [POST `/inventario/productos/:productoId/apertura`](../apps/tienda-api/src/inventario/inventario.controller.ts#L68) | Registra existencia inicial | store.inventory.receive | Ruta `ProductoParamDto` · Cabecera `idempotency-key` · Cuerpo `RegistrarEntradaInventarioDto` |
| [POST `/inventario/productos/:productoId/entradas`](../apps/tienda-api/src/inventario/inventario.controller.ts#L85) | Registra una entrada de mercancía | store.inventory.receive | Ruta `ProductoParamDto` · Cabecera `idempotency-key` · Cuerpo `RegistrarEntradaInventarioDto` |
| [POST `/inventario/productos/:productoId/lotes/:loteId/ajustes`](../apps/tienda-api/src/inventario/inventario.controller.ts#L102) | Ajusta un lote | store.inventory.adjust | Ruta `LoteParamDto` · Cabecera `idempotency-key` · Cuerpo `AjusteInventarioDto` |
| [POST `/inventario/productos/:productoId/lotes/:loteId/bajas`](../apps/tienda-api/src/inventario/inventario.controller.ts#L119) | Da de baja unidades de un lote | store.inventory.loss | Ruta `LoteParamDto` · Cabecera `idempotency-key` · Cuerpo `BajaInventarioDto` |

### notificaciones

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/notificaciones`](../apps/tienda-api/src/notificaciones/notificaciones.controller.ts#L18) | Alta de notificaciones | 501 | Cuerpo `CreateNotificacionDto` |
| [GET `/notificaciones`](../apps/tienda-api/src/notificaciones/notificaciones.controller.ts#L23) | Listado de notificaciones | 501 | — |
| [GET `/notificaciones/:id`](../apps/tienda-api/src/notificaciones/notificaciones.controller.ts#L28) | Detalle de notificaciones | 501 | — |
| [PATCH `/notificaciones/:id`](../apps/tienda-api/src/notificaciones/notificaciones.controller.ts#L33) | Edición de notificaciones | 501 | Cuerpo `UpdateNotificacionDto` |
| [DELETE `/notificaciones/:id`](../apps/tienda-api/src/notificaciones/notificaciones.controller.ts#L41) | Eliminación de notificaciones | 501 | — |

### panel

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/panel`](../apps/tienda-api/src/panel/panel.controller.ts#L36) | Alta de panel | 501 | Cuerpo `CreatePanelDto` |
| [GET `/panel`](../apps/tienda-api/src/panel/panel.controller.ts#L41) | Consulta los bloques del panel según los permisos de la sesión | store.panel.read | Consulta `PeriodoPanelDto` |
| [GET `/panel/:id`](../apps/tienda-api/src/panel/panel.controller.ts#L57) | Detalle de panel | 501 | — |
| [PATCH `/panel/:id`](../apps/tienda-api/src/panel/panel.controller.ts#L62) | Edición de panel | 501 | Cuerpo `UpdatePanelDto` |
| [DELETE `/panel/:id`](../apps/tienda-api/src/panel/panel.controller.ts#L67) | Eliminación de panel | 501 | — |

### pedidos

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/pedidos`](../apps/tienda-api/src/pedidos/pedidos.controller.ts#L18) | Alta de pedidos | 501 | Cuerpo `CreatePedidoDto` |
| [GET `/pedidos`](../apps/tienda-api/src/pedidos/pedidos.controller.ts#L23) | Listado de pedidos | 501 | — |
| [GET `/pedidos/:id`](../apps/tienda-api/src/pedidos/pedidos.controller.ts#L28) | Detalle de pedidos | 501 | — |
| [PATCH `/pedidos/:id`](../apps/tienda-api/src/pedidos/pedidos.controller.ts#L33) | Edición de pedidos | 501 | Cuerpo `UpdatePedidoDto` |
| [DELETE `/pedidos/:id`](../apps/tienda-api/src/pedidos/pedidos.controller.ts#L38) | Eliminación de pedidos | 501 | — |

### portal

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/portal`](../apps/tienda-api/src/portal/portal.controller.ts#L18) | Alta de portal | 501 | Cuerpo `CreatePortalDto` |
| [GET `/portal`](../apps/tienda-api/src/portal/portal.controller.ts#L23) | Listado de portal | 501 | — |
| [GET `/portal/:id`](../apps/tienda-api/src/portal/portal.controller.ts#L28) | Detalle de portal | 501 | — |
| [PATCH `/portal/:id`](../apps/tienda-api/src/portal/portal.controller.ts#L33) | Edición de portal | 501 | Cuerpo `UpdatePortalDto` |
| [DELETE `/portal/:id`](../apps/tienda-api/src/portal/portal.controller.ts#L38) | Eliminación de portal | 501 | — |

### ventas

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| [POST `/ventas`](../apps/tienda-api/src/ventas/ventas.controller.ts#L50) | Confirma una venta de contado con salida de inventario y cobro | store.sales.create | Cuerpo `CreateVentaDto` · Cabecera `idempotency-key` |
| [POST `/ventas/credito`](../apps/tienda-api/src/ventas/ventas.controller.ts#L67) | Confirma una venta a crédito y genera el saldo de cartera | store.sales.create, store.sales.credit | Cuerpo `CreateVentaCreditoDto` · Cabecera `idempotency-key` |
| [GET `/ventas`](../apps/tienda-api/src/ventas/ventas.controller.ts#L84) | Lista ventas | store.sales.read | Consulta `ListarVentasDto` |
| [GET `/ventas/analisis`](../apps/tienda-api/src/ventas/ventas.controller.ts#L94) | Analiza ventas por periodo y filtros comerciales | store.sales.analytics.read | Consulta `AnalizarVentasDto` |
| [POST `/ventas/:id/anulacion`](../apps/tienda-api/src/ventas/ventas.controller.ts#L108) | Anula la venta y concilia el remanente de inventario y dinero | store.sales.void | Ruta `DevolucionParamDto` · Cuerpo `AnularVentaDto` · Cabecera `idempotency-key` |
| [GET `/ventas/:id`](../apps/tienda-api/src/ventas/ventas.controller.ts#L131) | Consulta una venta | store.sales.read | Ruta `VentaParamDto` |
| [PATCH `/ventas/:id`](../apps/tienda-api/src/ventas/ventas.controller.ts#L141) | Edición genérica de venta | 501 | Cuerpo `UpdateVentaDto` |
| [DELETE `/ventas/:id`](../apps/tienda-api/src/ventas/ventas.controller.ts#L146) | Eliminación genérica de venta | 501 | — |

### Salud del servicio

| Endpoint | Propósito | Acceso | Entrada |
| --- | --- | --- | --- |
| GET `/health/live` | Comprueba que el proceso responde | Público | — |
| GET `/health/ready` | Comprueba acceso a PostgreSQL y devuelve 503 si falla | Público | — |
