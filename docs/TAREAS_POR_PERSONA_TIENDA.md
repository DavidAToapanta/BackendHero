# Plan detallado de Tienda para dos desarrolladores

Este es el listado de trabajo para **ti**, identificado con `A`, y **Voncho**, identificado con `B`. Complementa la [guía de trabajo en equipo](./TRABAJO_EQUIPO_TIENDA.md), que contiene comandos, ramas, migraciones y verificaciones. El [plan funcional](./PLAN_IMPLEMENTACION_TIENDA.md) define los flujos que deben quedar funcionando.

El alcance es toda la **aplicación interna de Tienda**. Incluye personal, productos, inventario, caja, ventas, clientes comerciales, crédito presencial, comprobantes, devoluciones, Panel, finanzas e historial. La aplicación del comprador se retoma después. Tener un recurso Nest generado significa tener su estructura inicial; las tareas de este documento requieren implementación y pruebas.

## Cómo avanzar sin esperar a que el otro termine

1. Ambos parten del mismo commit y acuerdan los contratos de `C00`. Este acuerdo inicial describe entradas, salidas y errores; puede publicarse antes que la implementación.
2. Cada uno desarrolla su tarea con esos contratos y datos de prueba. Puede probar sus servicios con un sustituto controlado del servicio pendiente del compañero.
3. Una tarea puede estar **lista para integrar** aunque le falte una dependencia real. Mientras tanto, el responsable toma otra tarea de su lista.
4. Para marcarla **terminada**, se integra con las dependencias reales y se prueba el resultado en PostgreSQL. Los sustitutos permanecen en las pruebas. Un endpoint comercial se habilita con autenticación, permisos y efectos reales completos.

Estados para registrar en el PR o tablero: `pendiente`, `en desarrollo`, `lista para integrar`, `integrada` y `validada`. Las casillas siguientes se marcan al llegar a `validada`, con enlace al PR y a la prueba. **Todas las tareas A y B se presentan pendientes**, aunque algunas reutilizan servicios de libs que ya existen.

Cada ficha especifica lo que hay que construir, dónde, qué entrega, qué necesita y cómo comprobarlo. Las dependencias indicadas son para cerrar la tarea con funcionamiento real. Solo `C00` exige coordinación inicial antes de programar contra un contrato compartido.

## C00 — Acuerdo inicial que permite trabajar en paralelo

Responsables: ambos. Cada propietario publica la parte de su módulo en su futuro `README.md`, con versión del contrato y ejemplos. Esos README son entregables de las tareas, todavía no se dan por existentes. Mantener las definiciones de tipos en un único lugar e importar los tipos acordados en pruebas y consumidores.

- [ ] **K01 · Contexto y acceso — tú, A02/A03.** Definir guard, decorador o helper público, módulo que los exporta y contexto con `usuarioId`, `tenantId`, `membresiaId`, autorización vigente y rol efectivo. `responsableId` de las operaciones comerciales e inventario es **`UserTenant.id`**. Auditoría recibe por separado `Usuario.id` y `UserTenant.id`. El tenant sale de la sesión verificada.
- [ ] **K02 · Contrato HTTP — ambos.** Publicar método/ruta, DTO, respuesta, permiso, paginación, límites, filtros y errores por operación. Acordar importes como cadenas decimales JSON y cálculos con `Prisma.Decimal`: importes comerciales con 2 decimales, costos históricos con 4 y tasa de impuesto con 4, conforme al esquema. Fijar redondeo por línea y suma de totales. Fechas ISO con zona, reportes en `America/Guayaquil`, cantidades enteras. Serializar consecutivos BigInt como texto.
- [ ] **K03 · Inventario — tú, A08/A11; Voncho revisa B06/B10.** Documentar consulta de producto/lotes, validación bajo bloqueo, costos y salida/reintegro con `Prisma.TransactionClient`. Ya existen `OperacionInventario`, `SeleccionLote`, `LoteEntrada` y `InventarioLotesService.retirarVenta(tx, operacion, detalleVentaId)`. Faltan el contrato completo de selección validada/costos y el de devolución. Especificar errores para stock insuficiente, lote ajeno, vencido, reservado y producto fuera de LOTES.
- [ ] **K04 · Auditoría — tú, A05.** Publicar escritura con `tx`, contexto, acción, entidad, motivo, productos y UUID de correlación. Voncho entrega los nombres de sus acciones y los datos necesarios para rastrearlas. Para operaciones con varios productos, acordar una fila por producto con la misma correlación, y una presentación agrupada por operación en el historial.
- [ ] **K05 · Caja y cobros — Voncho, B03/B04/B05.** Publicar primitivas para validar/bloquear turno, registrar cobro y aplicación, registrar entrada/salida de efectivo y consultar saldos dentro del `tx` del llamador. Definir qué operaciones requieren turno abierto, quién puede usar cada caja y sus errores.
- [ ] **K06 · Idempotencia — Voncho, B01.** Propuesta de transporte: cabecera `Idempotency-Key`. Persistir tenant, alcance de actor, operación, clave y hash normalizado de datos relevantes. Definir respuesta al reintento, conflicto por contenido distinto y concurrencia. Entregar un módulo local de Tienda que también puedas usar en entradas y bajas.
- [ ] **K07 · Consultas del Panel — cada dueño del dato, Voncho compone B16.** Definir salidas de personal, stock, actividad, caja, ventas y cartera. Documentar permisos por bloque, periodos, significado de indicadores y tratamiento de un bloque no autorizado. Cada módulo mantiene sus propias consultas.
- [ ] **K08 · Transacciones — ambos.** Acordar y documentar el orden de bloqueos de turno, venta/cuenta/cobro y productos antes de integrar operaciones concurrentes. Productos siempre en orden de ID. Cada coordinador abre una transacción y pasa el mismo `tx` a todas las primitivas. Revisar también los bloqueos de triggers SQL. Probar reintentos acotados ante conflictos recuperables usando la misma clave.

Los códigos nuevos de permiso y las rutas por construir se publican en estos contratos. Actualmente `libs/permisos` solo incluye para STORE `store.roles.manage`, `store.catalog.read` y `store.catalog.write`; el resto forma parte de A03. Acordar los nombres en C00 evita que cada rama invente nombres distintos.

## Mapa de carpetas y responsables

Las rutas de recursos siguientes parten de `apps/tienda-api/src/`.

- **Tú:** `auth/`, `accesos/`, `catalogo/`, `inventario/`, `auditoria/`; tareas A01–A14.
- **Voncho:** `clientes/`, `caja/`, `cobros/`, `ventas/`, `cartera/`, `devoluciones/`, `comprobantes/`, `finanzas/`, `panel/`; tareas B01–B17.
- **Voncho:** nueva carpeta propuesta `comun/idempotencia/`, de B01. La consumen ambos. Su módulo depende de Prisma y contratos técnicos; no importa `VentasModule` ni `InventarioModule`.
- **Tú mantienes libs:** `libs/identidad/`, `libs/negocios/`, `libs/permisos/`, `libs/catalogo/`, `libs/inventario/`. Coordinas cambios en `libs/prisma/` y `libs/seguridad/`. Voncho consume la API pública `@app/*` y solicita ampliaciones concretas.
- **Tú coordinas archivos compartidos:** `prisma/schema.prisma`, `prisma/migrations/`, configuración Nest/TypeScript, `package.json`, lockfile y raíz de `AppModule`. Ambos proponen cambios y revisan el efecto en sus módulos.
- **Etapa posterior:** `portal/`, `carrito/`, `pedidos/`, `notificaciones/`. Sus estructuras se conservan pendientes. Los recordatorios a la app, vinculación con cuenta de comprador, despacho y abonos en línea se implementarán en esa etapa.

En cada recurso, el controlador resuelve HTTP y permisos; los DTO validan; los servicios ejecutan casos de uso; el módulo declara dependencias y exporta solo lo necesario. Prisma define la persistencia. Si un servicio crece, separar por caso de uso dentro de la misma carpeta. La existencia de un CRUD generado no obliga a ofrecer borrado de ventas, cobros, cuentas o historial.

Para evitar ciclos entre módulos Nest, separar las primitivas de saldo/cuenta de los coordinadores que registran abonos o reversiones. Propuesta de B07/B09: un submódulo local en `cartera/` exporta esas primitivas y no importa `CobrosModule`; `CobrosModule` y el coordinador de `CarteraModule` lo consumen. Así cartera puede coordinar un abono usando cobros, y cobros puede ajustar una cuenta mediante el submódulo, sin importar de vuelta el módulo coordinador de cartera. El mismo criterio se aplica a ventas/devoluciones. Las libs nunca importan módulos de las aplicaciones.

Aplicar también esta separación a acceso y auditoría: A05 entrega un módulo local de escritura dentro de `auditoria/`, independiente de `AccesosModule`, que recibe el contexto ya validado. Accesos lo consume para registrar sus cambios; el módulo HTTP del historial consume el escritor y los guards de acceso. Así gestionar personal y consultar el historial no crea imports recíprocos entre ambos módulos.

## Tu lista de trabajo

### A01 — Base ejecutable, entorno y migraciones

- [ ] **Carpetas:** configuración raíz, `apps/tienda-api/src/main.ts`, `app.module.ts`, `test/`, Prisma y documentación de entorno.
- **Construir:** verificar que ambos recibieron la estructura versionada; preparar datos mínimos reproducibles de dos tiendas y un negocio Gym; documentar variables, migraciones y dos procesos independientes. Incorporar Tienda a los comandos de calidad que hoy solo abarcan Gym/libs cuando se ajuste la configuración.
- **Entregar:** instrucciones que Voncho reproduce en su computadora, commit base, usuarios de prueba y formas de obtener tenant/membresía/caja. Las credenciales de ensayo son locales y se distinguen de las reales.
- **Necesita:** de Voncho, confirmación de que pudo arrancar y requerimientos de datos B02/B03. La preparación inicial usa Prisma y puede empezar inmediatamente.
- **Prueba de cierre:** Gym y Tienda responden a la vez en sus puertos; reiniciar Tienda mantiene Gym disponible; historial de migraciones y datos de ensayo reproducibles en ambas computadoras. La base de datos continúa siendo una dependencia compartida.

### A02 — Login y selección de tienda

- [ ] **Carpetas/modelos:** `auth/`, `@app/identidad`, `@app/negocios`, `@app/seguridad`; `Usuario`, `Tenant`, `UserTenant`, `TenantModule`.
- **Construir:** login del personal, selección de negocio cuando haya varios, emisión de token de acceso y consulta de sesión/contexto. Validar credenciales, membresía activa y STORE habilitado. Distinguir token de selección y acceso; documentar la política de tokens entre Gym y Tienda sin alterar el login de Gym.
- **Entregar:** K01 implementado, ejemplos de login/selección y contexto con IDs correctos. La estrategia concreta de Tienda permanece en `auth/`; `libs/seguridad` conserva la base técnica.
- **Necesita:** C00 y entorno A01. Ninguna implementación comercial de Voncho. Puede probar los distintos contextos con fixtures propios.
- **Prueba de cierre:** usuario con una o varias tiendas, credenciales inválidas, membresía suspendida, STORE inactivo y token de selección usado indebidamente. Verificar aislamiento del contexto elegido.

### A03 — Autorización por operación y catálogo de permisos

- [ ] **Carpetas/modelos:** `accesos/`, `libs/permisos/`; `Permiso`, `RolNegocio`, `RolPermiso`, `AsignacionRol`, `UserTenant`, `Tenant`.
- **Construir:** guard/decorador y exportaciones para todas las rutas; añadir permisos de personal, categorías/productos, entradas/bajas, caja, clientes, venta/anulación, cobros/reversiones/reembolsos, cartera, gastos, comprobantes, historial y reportes. Separar permisos de lectura/escritura y operaciones administrativas. Verificar versiones de autorización para que una revocación sea efectiva.
- **Entregar:** matriz operación → permiso → roles iniciales, con la anulación reservada a autorización administrativa y límites de delegación. Voncho aplica este mecanismo en sus controladores.
- **Necesita:** K01/K02 y la lista de operaciones B02–B17 acordada en C00. A02 para prueba HTTP real. Puede desarrollar el guard con contextos simulados mientras se termina login.
- **Prueba de cierre:** denegación por permiso, tenant, módulo desactivado y versión obsoleta. Probar un negocio MIXTO antes de cambiar `Tenant.autorizacionVersion`, porque afecta a todo el negocio, incluido Gym.

### A04 — Gestión del personal, roles iniciales y personalizados

- [ ] **Carpetas/modelos:** `accesos/`, libs de identidad/negocios/permisos; `Usuario`, `UserTenant`, `RolNegocio`, `RolPermiso`, `AsignacionRol` y `StaffProfile` cuando corresponda al perfil común.
- **Construir:** alta o vinculación controlada de personal, edición de datos permitidos, suspensión, listado de cajeros/bodegueros/administradores y asignación de rol. Preparar roles iniciales y permitir roles personalizados compuestos de permisos existentes. Conservar las protecciones de OWNER y una asignación vigente por membresía.
- **Entregar:** endpoints administrativos y consulta paginada/filtrada de personal para los selectores de caja y el Panel de B16. Suspender la pertenencia a una tienda conserva el historial y los accesos válidos a otros negocios.
- **Necesita:** A02, A03 y escritura auditada A05. De Voncho, filtros y campos para B03/B14/B16 definidos en K07. Puede probar con membresías y roles de ensayo.
- **Prueba de cierre:** crear rol, asignarlo, revocar un permiso y comprobar el nuevo acceso; impedir escalación de privilegios, edición de personal ajeno y uso de una membresía suspendida.

### A05 — Escritura de auditoría para ambos

- [ ] **Carpetas/modelos:** `auditoria/`; `AuditoriaOperacion`.
- **Construir:** servicio exportado desde un módulo local de escritura independiente de accesos y del controlador de historial. Recibe `tx` y contexto validado de K04, conserva actor y rol usados en ese momento, motivo y relaciones con la operación. Para venta con varios productos registrar filas correlacionadas por producto y definir su agrupación de lectura.
- **Entregar:** método de escritura documentado, catálogo de acciones inicial y ejemplos para entradas, bajas, venta, abono, anulación, cierre y cambios de permisos. Publicar esta tarea pronto; el listado del historial se completa después en A12.
- **Necesita:** contrato de contexto K01 y eventos comerciales que Voncho define en C00. Puede implementarse con fixtures, sin esperar la venta ni el listado del historial.
- **Prueba de cierre:** rollback elimina operación y auditoría juntas; actor/membresía/tenant coinciden; cambiar nombre del rol no altera el snapshot anterior; una venta con dos productos es localizable por cualquiera de ellos.

### A06 — Administración de categorías

- [ ] **Carpetas/modelos:** `catalogo/`, `libs/catalogo/`; `CategoriaProducto` y relación con `Producto`.
- **Construir:** controlador/sección administrativa de categorías dentro de catálogo, usando `CategoriasProductoService`. Listar, crear, editar, desactivar y asignar/desasignar categoría. Validar tenant, módulo STORE, nombre normalizado y estado activo.
- **Entregar:** contrato de categorías para mantenimiento de productos y filtros de ventas. Preservar la categoría histórica de los detalles ya vendidos.
- **Necesita:** A03 para rutas y A05 para cambios auditados; ninguna implementación de Voncho. Puede probar reglas con datos de categorías propias.
- **Prueba de cierre:** nombre duplicado dentro del ámbito, categoría GYM o de otra tienda, asignación de categoría inactiva y desactivación sin pérdida del historial. Si la escritura auditada debe ser atómica, adaptar la primitiva compartida para aceptar el mismo `tx`.

### A07 — Productos, imágenes y búsqueda por código de barras

- [ ] **Carpetas/modelos:** `catalogo/`, `libs/catalogo/`; `Producto`, `ProductoImagen`, `CategoriaProducto`.
- **Construir:** listado paginado con imagen y existencias, detalle, alta/edición de ficha, precio, presentación, estado, SKU y código de barras. Ofrecer búsqueda manual y exacta por barras como texto, conservando ceros iniciales. Los cambios físicos de stock pasan por inventario.
- **Entregar:** endpoints para administración y búsqueda del mostrador B06; consulta de ficha y snapshots de precio/categoría. Gestionar orden y metadatos de imágenes. La librería actual guarda URL/metadatos: definir e implementar el mecanismo persistente de carga de archivos si la UI permite subirlos, con validación de tipo/tamaño y reemplazo; no dar por existente ese almacenamiento.
- **Necesita:** A03, A06 y A08 para existencias. De Voncho, campos del buscador de venta definidos en C00. Puede desarrollar ficha e imágenes mientras A08 se implementa.
- **Prueba de cierre:** duplicados por tienda, búsqueda por `001234`, productos inactivos, recurso de otro tenant, edición de precio sin reescribir ventas previas y rechazo de edición directa de stock LOTES.

### A08 — Disponibilidad y contrato transaccional de salida

- [ ] **Carpetas/modelos:** `inventario/`, `libs/inventario/`; `Producto`, `LoteInventario`, `MovimientoInventario`, `AsignacionLoteVenta` y reservas existentes.
- **Construir:** consultas paginadas de físico/reservado/disponible, lotes, vencimiento, costos y movimientos. Completar el contrato K03 para validar selección manual y obtener costos confiables bajo bloqueo dentro de la transacción de venta. Exponer únicamente los datos que cada rol puede consultar.
- **Entregar:** primitivas públicas y ejemplo ejecutable de salida. La firma existente `retirarVenta(tx, operacion, detalleVentaId)` lee las asignaciones ya creadas por B06, exige venta COMPLETADA sin pedido y valida que cubran la cantidad. No crea dichas asignaciones.
- **Necesita:** de B06, forma del detalle/asignaciones definida en K03; para desarrollar basta crear esos registros como fixtures. Para cerrar el flujo comercial, B06 debe consumir la librería real. Las lecturas HTTP necesitan A03.
- **Prueba de cierre:** lotes de producto/tenant incorrectos, expiración, costo con cuatro decimales, reservas, selección insuficiente y última unidad en concurrencia. Validar existencia apta dentro del `tx`; la consulta previa del mostrador es informativa.

### A09 — Apertura de lotes y entradas de inventario

- [ ] **Carpetas/modelos:** `inventario/`, `libs/inventario/`; `EntradaInventario`, `LoteInventario`, `MovimientoInventario`, `Producto`.
- **Construir:** recepción con referencia/motivo, responsable, lotes, cantidades, costo unitario y vencimiento; apertura conciliada a LOTES para stock previo y apertura desde cero para producto nuevo. Reutilizar `registrarEntrada` y distinguir APERTURA/ENTRADA.
- **Entregar:** endpoints de ingreso y datos que B06 puede vender. Acordar clave/correlación y registrar auditoría junto con stock y movimientos.
- **Necesita:** A03, A05, A08 y **B01 para reintentos de la operación HTTP**. Mientras B01 llega, implementar la transacción y probarla con su contrato simulado; conservar también las unicidades naturales de Prisma.
- **Prueba de cierre:** apertura no suma dos veces el saldo previo, costos previos requieren conciliación, ingreso repetido no duplica stock, fallo intermedio revierte todo y el físico equivale a la suma de lotes.

### A10 — Ajustes y bajas justificadas

- [ ] **Carpetas/modelos:** `inventario/`, `libs/inventario/`; `MovimientoInventario`, `LoteInventario`, `Producto`.
- **Construir:** acciones de ajuste y baja por daño, vencimiento u otro motivo autorizado, con cantidad/lote y justificación obligatoria. La librería actual `ajustarLote` genera AJUSTE; implementar el tipo BAJA con sus reglas y origen, sin confundirlo con un ajuste genérico.
- **Entregar:** movimiento con costo histórico y consulta de bajas por periodo para B15. El historial conserva motivo, responsable y correlación; la pérdida se calcula una vez.
- **Necesita:** A03, A05, A08 y B01. De B15, forma de la consulta de pérdidas acordada en K07. Puede avanzar con lotes de ensayo y sustituto de idempotencia.
- **Prueba de cierre:** motivo vacío, exceso de cantidad, unidades reservadas, lote ajeno, doble envío y baja concurrente con venta. Comprobar conciliación física y costo de la pérdida.

### A11 — Inventario de devoluciones

- [ ] **Carpetas/modelos:** `libs/inventario/` y adaptación local si procede; `DetalleDevolucionVenta`, `AsignacionLoteVenta`, `LoteInventario`, `MovimientoInventario`.
- **Construir:** primitiva que recibe el `tx` del coordinador B10/B11 y referencias originales verificadas. Mercancía devuelta apta reintegra unidades; mercancía devuelta no apta registra entrada de devolución y baja vinculadas con costo original. Evitar un segundo descuento de unidades que ya salieron.
- **Entregar:** contrato público de reintegro/tratamiento no apto, resultados y errores. La decisión comercial de cuánto devolver/reembolsar sigue en B10/B11.
- **Necesita:** A08/A10 y de **B10, el contrato y referencias de devolución/asignación original**. Se puede implementar y probar con fixtures de esos modelos antes de que exista el endpoint de devolución.
- **Prueba de cierre:** devolución apta, dañada/vencida, parcial y repetida; referencias ajenas; costo original preservado. El rollback del coordinador revierte todos los movimientos de retorno.

### A12 — Historial de Movimientos del Panel

- [ ] **Carpetas/modelos:** `auditoria/`; `AuditoriaOperacion` y relaciones autorizadas.
- **Construir:** consulta paginada con fechas, rol, producto, actor, acción y detalle de operación. Aplicar máximo de dos días por consulta; acordar semántica exacta del intervalo y zona en K02. Conservar todo el historial. Agrupar filas por correlación sin perder la búsqueda por producto.
- **Entregar:** endpoints de historial y resumen de actividad reciente para B16. Distinguir historial de auditoría de los movimientos contables de inventario/caja.
- **Necesita:** A03/A05. De B06/B08/B10/B11, eventos reales para la validación final. Puede desarrollar filtros y paginación con registros simulados desde el inicio.
- **Prueba de cierre:** límites de fechas y paginación estable, rol histórico, búsqueda de cualquiera de los productos de una venta, acceso entre tiendas y conservación de registros antiguos.

### A13 — Datos, aislamiento y regresiones compartidas

- [ ] **Carpetas:** `test/`, specs de tus recursos y libs; coordinación de fixtures con B17.
- **Construir:** ampliar datos de A01 con roles, lotes agotados/vencidos, reservas, cajas, clientes y escenarios financieros preparados por Voncho. Añadir pruebas de tus reglas y de compatibilidad de consumidores Gym al modificar libs.
- **Entregar:** preparación de datos reproducible, pruebas de aislamiento por tenant y módulos, y resultado de regresiones Gym HTTP/WebSocket. Cada persona escribe las pruebas de sus propios casos de uso.
- **Necesita:** A02–A12 y ejemplos financieros **B06–B15** para la validación conjunta. Puede adelantar entorno, aislamiento y pruebas unitarias de cada entrega sin esperar toda la aplicación.
- **Prueba de cierre:** ningún ID de otro tenant permite acceder/cambiar datos; la revocación se respeta; Gym conserva los flujos afectados por las libs; cada escenario informa datos iniciales y resultado esperado.

### A14 — Rendimiento, operación independiente y entrega técnica

- [ ] **Carpetas:** configuración de ejecución/despliegue, pruebas de carga y documentación del entorno; migraciones de índices solo si las mediciones las justifican.
- **Construir:** arranque/compilación independientes, configuración por API, estrategia de reinicio y comprobación de salud; definir el presupuesto de conexiones Prisma para las réplicas previstas. Registrar correlación, tiempos, errores y esperas de conexión/bloqueo. Medir carga representativa de cajas e inventario junto con actividad Gym.
- **Entregar:** procedimiento de ejecución, diagnóstico y recuperación; medición p95, errores y capacidad observada, con volumen y umbral acordados para el piloto. Reportes y generación de archivos se ejecutan fuera de la transacción de venta; medir si necesitan límites o procesamiento separado.
- **Necesita:** **B06, B04, B15/B17** funcionando para medir venta, cierre y reportes reales, más A13. Puede preparar instrumentación y escenarios antes. Voncho optimiza las consultas de sus módulos según los resultados.
- **Prueba de cierre:** reinicios independientes, venta concurrente con reportes e inventario, y evidencia de los límites de carga. Puertos/procesos separados aíslan el proceso de Gym y Tienda; los módulos de Tienda siguen compartiendo proceso y ambos servicios pueden depender de la misma base.

## Lista de trabajo de Voncho

Las tareas B se detallan a continuación. En todas las rutas se integran A02/A03 para contexto y permisos, y las escrituras auditadas usan A05. Esto es un requisito de habilitación HTTP; los servicios y pruebas pueden desarrollarse contra K01/K04 desde C00.

### B01 — Idempotencia reutilizable dentro de Tienda

- [ ] **Carpetas/modelos:** nueva `comun/idempotencia/`; `SolicitudIdempotente`.
- **Construir:** módulo/servicio independiente de los módulos comerciales, basado en K06. Reclamar clave, comparar hash, localizar resultado confirmado y gestionar solicitudes simultáneas. Registrar clave y recurso dentro de la misma transacción; documentar el comportamiento ante rollback y reintento. El esquema guarda referencia al recurso; definir cómo reconstruir la respuesta estable sin inventar una columna de respuesta inexistente.
- **Entregar a tu compañero:** import/export, firma y ejemplos para A09/A10. El coordinador recibe el `tx` de esta operación o lo proporciona según el contrato único elegido; evitar transacciones anidadas.
- **Necesita:** C00 y Prisma; ninguna implementación de venta/inventario. Definir temprano cómo el alcance de actor y la clave general se traducen a las claves naturales de venta/entrada, que son únicas por tenant, para evitar colisiones entre operaciones o usuarios.
- **Prueba de cierre:** misma clave/datos retorna recurso sin repetir efectos; contenido distinto da conflicto; dos reintentos simultáneos crean un recurso; fallo intermedio permite reintento seguro. No depender de memoria local, porque habrá procesos independientes.

### B02 — Clientes comerciales administrados por la tienda

- [ ] **Carpetas/modelos:** `clientes/`; `ClienteComercial`, relaciones con venta/cuenta/comprobante.
- **Construir:** alta, edición, desactivación, listado paginado, detalle y búsqueda por nombre o identificación. Validar unicidad del identificador dentro de la tienda y vínculo opcional con `Cliente` de Gym del mismo tenant. La ficha puede existir sin cuenta de usuario.
- **Entregar:** consulta de cliente válido para B06/B07/B12 y datos del receptor. El resumen de deuda consume B08; no necesita estar listo para entregar el mantenimiento de fichas.
- **Necesita de tu compañero:** K01/K02 y A03/A05 para integración. Puede trabajar desde el inicio con tenant/membresía de ensayo; no espera productos ni inventario.
- **Prueba de cierre:** duplicados, búsquedas, cliente ajeno y desactivación conservando relaciones; contrato de consulta de cliente identificado probado con fixtures. Exigir cliente al vender a crédito se valida en B07/H3, sin retrasar la entrega de B02. La vinculación a la app del comprador pertenece a la etapa posterior.

### B03 — Cajas y apertura de turno

- [ ] **Carpetas/modelos:** `caja/`; `Caja`, `TurnoCaja`, relación con `UserTenant`.
- **Construir:** crear/configurar/desactivar cajas, listar disponibles, abrir turno con fondo inicial y consultar turno activo. Validar que la caja y el cajero pertenecen al negocio; definir quién puede operar/cerrar cada turno.
- **Entregar:** contrato K05 y primitiva de validación/bloqueo de turno para venta, cobro, gasto y cierre. La gestión de personal sigue en A04.
- **Necesita de tu compañero:** A03/A05 y consulta de personal A04 para el selector real. Puede desarrollar con membresías de ensayo y caja local mientras se implementa el login. Usa B01 en operaciones de apertura reintentables.
- **Prueba de cierre:** dos aperturas simultáneas de la misma caja dejan un único turno activo; rechazar caja inactiva, fondo inválido y personal ajeno; el fondo inicial se cuenta una vez.

### B04 — Movimientos y cierre de caja

- [ ] **Carpetas/modelos:** `caja/`; `MovimientoCaja`, `TurnoCaja`, orígenes cobro/reembolso/gasto.
- **Construir:** primitivas de entrada/salida con `tx`, consulta de movimientos, movimientos manuales autorizados con motivo y cierre con efectivo contado, esperado y diferencia. Mantener los orígenes exclusivos y enlaces únicos del esquema.
- **Entregar:** funciones para B05/B09/B13 y consultas del cierre para Panel/exportación. Cerrar bloquea turno/caja y calcula el saldo en esa misma transacción. Un turno cerrado mantiene su cierre histórico.
- **Necesita:** B03/B01 y **A03/A05**. Puede probar con movimientos propios antes del cobro real; después B05/B06 aportan los escenarios de cobro concurrente con cierre.
- **Prueba de cierre:** esperado = fondo + entradas de efectivo − salidas; tarjetas/transferencias y aplicaciones del cobro no suman efectivo. Impedir movimientos después del cierre y cierres duplicados. Reembolso posterior utiliza el turno vigente.

### B05 — Cobros y aplicaciones del dinero recibido

- [ ] **Carpetas/modelos:** `cobros/`; `Cobro`, `AplicacionCobro`, `MovimientoCaja` a través de caja.
- **Construir:** registro confirmado por personal de efectivo, transferencia, tarjeta u otro método del esquema; referencia, responsable y turno cuando corresponda. Aplicar a venta y, para abonos posteriores, a cuenta. Validar titularidad, importes positivos, dinero disponible y límites del saldo.
- **Entregar:** primitivas transaccionales a B06/B07/B08 y consultas de cobros/saldos. Un cobro en efectivo genera una entrada de caja; sus aplicaciones distribuyen el dinero, sin entradas adicionales.
- **Necesita:** B01/B04 y **A03/A05**. Puede probar con ventas/cuentas creadas como fixtures antes de que exista el endpoint B06. La integración completa llega en el hito H2.
- **Prueba de cierre:** sobreaplicación rechazada, cobro y venta de distintos clientes/tenants rechazados, rollback y doble envío. Documentar manejo de efectivo entregado/vuelto: el cobro aplicado no incluye el dinero que se devuelve como cambio al pagar.

### B06 — Venta de mostrador pagada por completo

- [ ] **Carpetas/modelos:** `ventas/`; `Venta`, `DetalleVenta`, `AsignacionLoteVenta`, con cobros/caja/inventario por sus servicios.
- **Construir:** confirmar una lista de productos, cantidades y lotes; recalcular precios, descuentos autorizados, impuestos y totales en servidor. Definir la fuente/regla de descuentos e impuestos en K02 antes de habilitar ventas. Guardar snapshots de nombre, presentación, barras, categoría, precio y costos. Listar ventas y consultar detalle. Añadir/quitar líneas antes de confirmar es estado del mostrador; no exige usar el módulo futuro `carrito/`.
- **Entregar:** operación transaccional completa y contrato para el frontend de caja. Bloquear/validar turno y productos, crear venta COMPLETADA y detalles, crear asignaciones con costo confiable de lote y suma exacta de cantidades, llamar a `retirarVenta`, registrar cobro/aplicación/caja, auditoría e idempotencia. Cualquier fallo revierte todo antes de confirmar.
- **Necesita de tu compañero:** **A07** para ficha/precio/barras, **A08/K03** para validación y salida, **A03** para permisos y **A05** para auditoría. Necesita B01/B03/B04/B05; B02 cuando se identifica comprador. Puede desarrollar cálculo, DTO y coordinación con mocks de K03/K04, y trabajar en B02/B12/B14 si falta integración.
- **Prueba de cierre:** lectura por barras o selección manual llega a la misma venta; precio enviado por cliente no manipula el total; última unidad desde dos cajas solo se vende una vez; reintento no duplica dinero ni stock; fallo de cobro/auditoría revierte la salida.

### B07 — Venta a crédito y creación de cuenta

- [ ] **Carpetas/modelos:** `ventas/`, `cartera/`; `CuentaPorCobrar`, `Venta`, `ClienteComercial`, aplicaciones del cobro inicial.
- **Construir:** extender el coordinador de B06 con cliente obligatorio, autorización de crédito, vencimiento y financiación parcial o total. Crear la cuenta por el importe financiado dentro de la misma transacción. Conservar importe inicial y proyecciones conciliadas.
- **Entregar:** caso venta 100, inicial 20, cuenta 80; también venta sin pago inicial. La aplicación inicial pertenece a la venta sin cuenta; los abonos posteriores apuntan a venta y cuenta. Exportar primitivas de cuenta/saldo mediante el submódulo local definido en el mapa de carpetas, independiente de los coordinadores de ventas y cobros.
- **Necesita:** B02/B05/B06 y **A03** para permiso de crédito; inventario/auditoría ya integrados por B06. Puede desarrollar reglas y pruebas de financiación con fixtures mientras se completa la venta de contado.
- **Prueba de cierre:** cuenta única por venta, rechazo de financiación sin cliente, vencimiento válido y conciliación de saldo de venta/cuenta. Venta, cuenta, pago y stock se confirman juntos.

### B08 — Abonos, cartera y deudores

- [ ] **Carpetas/modelos:** `cartera/`, consumo de `cobros/`; `CuentaPorCobrar`, `AplicacionCobro`, ajustes/reversiones relacionados.
- **Construir:** registrar abonos recibidos en tienda, consultar cuenta/historial, total pendiente y vencido por cliente, facturas próximas a vencer y días de mora. Bloquear antes de aplicar abonos concurrentes. La gestión de dinero sigue en B05.
- **Entregar:** endpoints de cartera para el personal, dona vigente/vencida y deudores que consume B16. Prisma usa ABIERTA/PAGADA/CANCELADA; vencida se calcula por saldo positivo y vencimiento. Fijar límite del día local y cálculo de mora en el contrato.
- **Necesita:** B02/B05/B07 y **A03/A05**. Puede desarrollar consultas y casos de saldo con cuentas de ensayo. Recordatorios a la app y pagos en línea quedan en la etapa del comprador.
- **Prueba de cierre:** abonos parciales y pago final dejan el saldo correcto; dos abonos concurrentes no sobrepagan; cuenta pasa a PAGADA al llegar a cero; indicadores excluyen cuentas canceladas según su significado. El abono no crea otra venta.

### B09 — Reversiones, ajustes de deuda y reembolsos

- [ ] **Carpetas/modelos:** `cobros/` y primitivas en `cartera/`; `ReversionAplicacionCobro`, `Reembolso`, `AjusteCuentaPorCobrar`, `Cobro`.
- **Construir:** acciones autorizadas y justificadas de reversión completa de aplicación, corrección del pago inicial y reembolso con origen válido. Revertir un cobro trata sus aplicaciones consistentemente; ajustar la financiación cuando corresponda. Un reembolso en efectivo registra una salida en turno abierto.
- **Entregar:** primitivas con `tx` para B10/B11, disponibilidad por cobro y reglas de conciliación. Cobros consume el submódulo de primitivas de cuenta/saldo de B07, sin importar el `CarteraModule` que coordina abonos. Una corrección parcial requiere aplicaciones desglosadas; no borrar el historial original. El dinero no devuelto queda identificado y disponible, sin contabilizar un nuevo ingreso.
- **Necesita:** B01/B04/B05/B07 y **A03/A05**. Los orígenes de devolución/anulación se acuerdan con B10/B11 y se pueden crear en fixtures; el escenario real se valida en H3.
- **Prueba de cierre:** reversión duplicada, exceso de reembolso, origen/titular ajeno y corrección del inicial 20 de la venta 100/20/80. Conciliar venta, cuenta, aplicaciones y caja después de cada operación.

### B10 — Devoluciones parciales y totales

- [ ] **Carpetas/modelos:** `devoluciones/`; `DevolucionVenta`, `DetalleDevolucionVenta`, asignaciones originales y primitivas de cobros/cartera/inventario.
- **Construir:** seleccionar detalle/asignación original, validar cantidad pendiente de devolver, motivo y destino REINTEGRO_APTO/BAJA_NO_APTO. Calcular importe devuelto con descuento/impuesto originales. Distribuir el efecto entre deuda y dinero que corresponde reembolsar.
- **Entregar a tu compañero:** contrato temprano de referencia de devolución para **A11**, antes del endpoint completo. El coordinador crea los detalles y llama al reintegro/baja, ajuste de deuda, reversión/reembolso y auditoría dentro del mismo `tx`.
- **Necesita:** **A11** para stock real, **A03/A05** y B01/B06/B07/B09. Puede desarrollar reglas, DTO y coordinación contra un mock del reintegro; avanzar B12/B14 mientras llega A11.
- **Prueba de cierre:** devolución parcial, segunda devolución, producto dañado y venta a crédito con abonos. Reembolso más reducción efectiva de saldo no supera el importe devuelto; las cantidades no superan las originalmente entregadas menos devoluciones previas.

### B11 — Anulación administrativa de una venta

- [ ] **Carpetas/modelos:** `ventas/` como entrada de la acción y coordinación en `devoluciones/` o servicio de caso de uso explícito; `Venta`, cobros/cuenta/devolución/comprobante relacionados.
- **Construir:** operación idempotente con permiso administrativo, motivo y tratamiento completo de deuda, dinero, mercancía y documento. Conservar venta y comprobante anulados. Resolver identificación/reembolso en venta anónima; no crear un saldo sin titular. Restituir stock solo por mercancía físicamente devuelta y apta.
- **Entregar:** ruta de anulación y respuesta con efectos financieros e inventario. Definir un único coordinador y dependencias dirigidas: ventas puede invocarlo sin que el módulo de devoluciones vuelva a importar `VentasModule` para acceder a sus datos.
- **Necesita:** **A03** para restricción administrativa, **A11/A05**, B01/B09/B10 y primitiva de anulación documental **B12** cuando exista comprobante. Puede probar la coordinación y autorizaciones con contratos antes de disponer de todas las implementaciones.
- **Prueba de cierre:** cajero denegado, motivo vacío, reintento/doble anulación, devolución física parcial o inexistente y cuenta con abonos. No marcar la operación resuelta si algún efecto obligatorio queda sin completar.

### B12 — Comprobantes internos y representación PDF

- [ ] **Carpetas/modelos:** `comprobantes/`; `ComprobanteVenta`, `DetalleComprobanteVenta`, `SecuenciaComprobante`.
- **Construir:** emitir desde una venta existente, capturar datos históricos del receptor/detalles, consultar/listar y anular documentalmente desde B11. Asignar consecutivo por tenant bajo bloqueo; número `COMP-` y unicidad por venta. Generar el PDF desde el documento confirmado fuera de la transacción.
- **Entregar:** emisión, consulta, PDF y primitiva de anulación con `tx`. Reintentar la descarga PDF no vuelve a emitir. Mantener BigInt como texto en JSON; conservar el consecutivo al anular.
- **Necesita:** B02 para receptor identificado, B06/B01 y **A03/A05**. Puede desarrollar plantilla, snapshots y numeración con ventas de ensayo; la prueba de anulación real se completa con B11.
- **Prueba de cierre:** emisiones simultáneas generan números únicos, una venta no duplica documento, cambios posteriores del cliente/producto no alteran el comprobante, y emisión/descarga no cambian stock, deuda ni caja. Es documento interno; SRI y envío a la app pertenecen a trabajo posterior.

### B13 — Gastos comerciales

- [ ] **Carpetas/modelos:** `finanzas/`, servicio/controlador dedicado a gastos dentro del módulo; `GastoComercial`.
- **Construir:** registrar y listar concepto, categoría textual opcional, monto, fecha, método, referencia y responsable. Si sale efectivo, enlazar exactamente una salida de caja y validar turno. Aplicar idempotencia y auditoría.
- **Entregar:** contrato de gastos para la administración y fuente de gasto del reporte B15. Conservar separado el modelo `Gasto` usado por Gym.
- **Necesita:** B01/B04 y **A03/A05**. Puede avanzar con turno de ensayo sin esperar la venta. Definir el tratamiento de correcciones antes de ofrecer esa acción: el modelo actual no tiene estado ni reversión/anulación. Una ampliación requiere propuesta de regla/esquema al responsable A01 y una migración, si aplica.
- **Prueba de cierre:** gasto efectivo crea una salida; transferencia no modifica efectivo; reintento no duplica gasto; importe/tenant/turno inválidos se rechazan. No habilitar edición/borrado genérico que altere un gasto contabilizado sin conciliación.

### B14 — Gestión y análisis de ventas

- [ ] **Carpetas/modelos:** consultas en `ventas/`; `Venta`, `DetalleVenta`, asignaciones/devoluciones y responsables.
- **Construir:** listado completadas/anuladas, detalle, tendencias semanales/mensuales, productos más vendidos, ventas por cajero y ticket promedio. Filtros por fechas, cajero, categoría y producto. Definir numerador/denominador de cada indicador y cómo trata anulaciones/devoluciones.
- **Entregar:** consultas reutilizables para pantalla de ventas, B16 y B17. La categoría y precio históricos vienen del detalle de venta; no reclasificar resultados anteriores según el catálogo actual.
- **Necesita:** B06/B10/B11 para validación de cifras; **A04/A07** para selectores y **A03** para acceso. Puede desarrollar consultas con datos de ventas conocidos antes de integrar el flujo de mostrador.
- **Prueba de cierre:** cambiar categoría/precio actual no reescribe el pasado; filtros por cajero/tenant correctos; días sin venta y ticket promedio sin división por cero. Validar totales contra un conjunto de datos calculado a mano.

### B15 — Finanzas y conciliación de indicadores

- [ ] **Carpetas/modelos:** consultas en `finanzas/`; ventas/detalles/costos, cobros/aplicaciones/reembolsos, cuentas, gastos y bajas de inventario.
- **Construir:** periodo por día, semana, mes o rango de meses; distinguir ventas netas, dinero efectivamente recibido/devuelto, costo neto vendido, gastos y pérdida de inventario. Utilidad bruta = ventas netas − costo neto vendido. Resultado operativo estimado resta gastos y pérdidas que todavía no estén incluidas.
- **Entregar:** consultas y definición de cada cifra para B16/B17, con fechas/fuentes de reconocimiento documentadas. Un abono es dinero recibido; una baja es pérdida a costo. Reversiones/devoluciones ajustan sus fuentes sin duplicarlas.
- **Necesita de tu compañero:** **A10/A11** para bajas y costo de devoluciones, **A03** para acceso. Necesita B08/B09/B10/B11/B13/B14. Puede desarrollar fórmulas y consultas con un escenario financiero de prueba mientras llegan esos flujos.
- **Prueba de cierre:** conciliar venta 100/inicial 20/abono posterior, devolución parcial, gasto efectivo, baja vencida y venta anulada. Preservar cuatro decimales en costos hasta el redondeo definido; comprobar cambio de mes y zona horaria.

### B16 — Panel administrativo

- [ ] **Carpetas:** `panel/`, consumo de servicios públicos de consulta de otros módulos.
- **Construir:** resumen de ventas/actividad, cartera corriente y vencida, próximas cuentas, clientes deudores, personal por rol y situación de cajas/inventario según K07. Publicar respuesta por bloque para que el frontend pueda presentar las secciones autorizadas.
- **Entregar:** contrato del **Panel** con ejemplos por rol y periodo. Reutilizar estilo visual del Gym es trabajo del frontend; los datos y reglas comerciales los sirve Tienda. Consultar a los módulos propietarios evita reimplementar sus cálculos.
- **Necesita de tu compañero:** **A04** personal, **A08** stock, **A12** actividad y **A03** permisos. Necesita B04/B08/B14/B15. Puede componer respuestas con mocks K07 y validar cada bloque cuando se integre su fuente.
- **Prueba de cierre:** cifras coinciden con las pantallas origen, permisos por bloque no exponen deuda/costos indebidamente y periodos son coherentes. Acotar consultas costosas; distinguir claramente bloque no autorizado o error de un valor cero real.

### B17 — Exportaciones y entrega de los flujos comerciales

- [ ] **Carpetas:** `finanzas/` para Excel/PDF de reportes, `caja/` para datos de cierre, `comprobantes/` para su PDF; specs de módulos y `test/` para integración.
- **Construir:** exportar las consultas de ventas/finanzas y cierres con los mismos filtros, permisos y totales que las pantallas. Coordinar dependencias de generación de archivos con A01; fijar límites de periodo/filas y tratamiento de trabajos grandes. Publicar ejemplos HTTP o colección de pruebas y errores que debe manejar el frontend.
- **Entregar:** contratos completos B02–B16, archivos comprobados y escenarios de compra de contado, crédito/abonos, cierre, devolución y anulación reproducibles. Cada módulo incluye sus pruebas conforme se implementa; esta tarea verifica el recorrido integrado.
- **Necesita:** B04/B12/B14/B15/B16 y **A13** para datos/regresiones. Puede adelantar plantillas y documentación con datos conocidos. B17 entrega primero la funcionalidad verificada; después A14 la consume en la prueba de carga conjunta. Voncho corrige los hallazgos de carga de sus exportaciones durante H4, sin convertir A14 en requisito de la entrega inicial de B17.
- **Prueba de cierre:** Excel/PDF abren correctamente y muestran importes/filtros/fechas coherentes, exportar no cambia datos ni bloquea la transacción de venta, y permisos/tenant se conservan. Ejecutar los flujos comerciales con servicios reales en PostgreSQL y entregar pasos de reproducción.

## Entregas concretas entre compañeros

Estas son las dependencias que deben anunciarse al otro con contrato, PR/commit y ejemplo. No basta con comunicar que una carpeta está terminada.

1. **A02/A03 → todos los módulos B.** Guard exportado, contexto real y permisos registrados. Hasta recibirlo, Voncho trabaja servicios y pruebas con K01. Antes de habilitar HTTP se integra el acceso real.
2. **A05 → escrituras B y tus operaciones de inventario.** Escritura auditada con el `tx` del coordinador. Hasta recibirla se usa mock en pruebas; para habilitar la operación se verifica rollback de auditoría y datos juntos.
3. **B01 → A09/A10 y coordinadores B.** Módulo local de idempotencia. Mientras llega, se prueban primitivas transaccionales; después se añade prueba HTTP de doble envío y concurrencia.
4. **A07/A08 → B06.** Producto/precio, selección validada, costos y salida. **B06 → A08.** Contrato de detalle y asignaciones que crea la venta. A08 se desarrolla con filas de ensayo; B06 con mock de salida. La integración comprueba la venta completa, sin dependencias HTTP entre módulos.
5. **B10 → A11.** Referencias de devolución y asignación original. **A11 → B10/B11.** Operación de stock de devolución. Se acuerdan primero las firmas y ambos usan fixtures para desarrollar; se integran juntos en H3.
6. **A10/A11 → B15.** Bajas y costos originales con origen/correlación. Voncho puede calcular reportes con datos conocidos; la prueba final compara bajas y devoluciones reales con esos reportes.
7. **A04/A08/A12 → B16.** Consultas de personal, inventario e historial. Mientras llegan, Voncho prepara la composición del Panel con K07; después reemplaza cada mock por su servicio y comprueba permisos y totales.
8. **B06–B17 → A13/A14.** Escenarios comerciales y fuentes reales para aislamiento, carga y regresiones. Tú preparas el entorno y las pruebas de tus módulos mientras se implementan; ambos corrigen los problemas de sus áreas.

## Orden recomendado de trabajo e integración

Es un orden por dependencias, no un calendario con días estimados. El reparto incluye más recursos comerciales para Voncho y más infraestructura compartida para ti; si una cola retrasa el hito, transferir una tarea completa con su contrato y pruebas, conservando un responsable único por entrega.

### H0 — Ambos pueden desarrollar

- **Tú avanzas:** A01 y contratos A02/A03/A05/A08.
- **Voncho avanza:** contrato e implementación B01, B02 y B03.
- **Se integra:** base versionada, C00, datos mínimos y APIs públicas mínimas. Para iniciar las tareas restantes basta el contrato de su dependencia; no hay que esperar todo el bloque de la otra persona.

### H1 — Administración y caja básica

- **Tú avanzas:** A02/A03/A05, después A04/A06/A07/A08/A09.
- **Voncho avanza:** B03/B04/B05 y cálculos/DTO/coordinación de B06; puede preparar B07/B12 con fixtures.
- **Se comprueba:** login → tienda → categoría/producto → entrada → stock, y cliente comercial → apertura/movimiento/cierre de caja. Usar autorización y auditoría reales.

### H2 — Venta de mostrador completa

- **Tú avanzas:** A10/A12 y contrato/implementación A11; corriges integración A07/A08.
- **Voncho avanza:** integra B06 y desarrolla B07/B08/B12/B13; entrega contrato B10 para A11.
- **Se comprueba:** abrir caja → vender/cobrar → salida de lotes → comprobante → cierre. Reintento seguro, última unidad, rollback y carrera venta/cierre con PostgreSQL. La consulta del historial no bloquea el desarrollo de ventas; su escritor A05 sí debe estar integrado.

### H3 — Crédito y correcciones comerciales

- **Tú avanzas:** completas A11/A12 y pruebas A13.
- **Voncho avanza:** B07/B08/B09/B10/B11/B12; puede desarrollar B14/B15 con escenarios controlados en paralelo a las integraciones pendientes.
- **Se comprueba:** crédito 100/20/80 → abonos → devolución parcial → tratamiento de deuda/reembolso/stock; anulación administrativa y comprobante anulado; caja cerrada conserva su historial.

### H4 — Panel, finanzas y preparación para operación

- **Tú avanzas:** A13/A14 y ajustes necesarios de tus consultas/libs.
- **Voncho avanza:** B13/B14/B15/B16/B17 y optimización de sus consultas.
- **Se comprueba:** indicadores/exportaciones conciliados, permisos por rol y tenant, carga conjunta Gym/Tienda, comandos reproducibles en ambas computadoras y contratos completos para el frontend.

## Cómo pedir y entregar una dependencia

Cuando aparezca una necesidad nueva, registrarla en el PR o tablero con este formato y avisar al compañero. El mensaje indica qué falta para avanzar, sin delegar la investigación de toda la tarea al otro.

```text
Tarea consumidora: B10 — devolución parcial
Responsable que solicita: Voncho
Tarea proveedora: A11 — inventario de devoluciones
Necesito: función que reciba tx, contexto y detalleDevolucionId
Debe devolver: referencia de movimientos creados o error documentado
Reglas: lote original, cantidad pendiente, costo original, apto/no apto
Mientras llega: implemento cálculo financiero y pruebas con mock K03
Bloquea: validación real H3, no el desarrollo de B12/B14
Contrato/ejemplo: enlace al README y al caso de prueba
Entrega recibida: PR/commit y resultado de la prueba integrada
```

El nombre de función del ejemplo es una propuesta, no una API ya implementada. Si cambia un contrato, actualizar primero sus tipos/ejemplos y avisar a todos los consumidores. Las nuevas rutas, métodos o columnas se agregan mediante su tarea/PR, no se presuponen por aparecer en este plan.

## Criterio común para cerrar una tarea

- [ ] Código del recurso y sus dependencias reales integrado en la rama común.
- [ ] Contrato con ejemplos, permisos, errores, filtros y dependencias publicado al lado del recurso.
- [ ] Pruebas de reglas, tenant y acceso; para dinero/stock, también idempotencia, concurrencia y rollback correspondientes.
- [ ] Migraciones revisadas/aplicadas y cliente Prisma regenerado cuando haya cambios de esquema.
- [ ] Compilación/verificaciones del alcance y regresiones de consumidores compartidos satisfactorias.
- [ ] El otro desarrollador puede reproducir la operación con el commit y los datos entregados.

Para ejecutar comandos, sincronizar ramas o resolver cambios de esquema, seguir la [guía de trabajo en equipo](./TRABAJO_EQUIPO_TIENDA.md). Para comprobar campos, enums y relaciones, consultar el [esquema Prisma](../prisma/schema.prisma), sus [migraciones](../prisma/migrations/) y el [diseño funcional STORE](./DISENO_BASE_DATOS_STORE.md).
