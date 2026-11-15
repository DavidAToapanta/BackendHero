# Backend de Tienda entre dos personas

Esta guía organiza la implementación de la aplicación interna de Tienda entre tú y Voncho. Propone responsables por carpeta, entregas pequeñas y contratos para integrar ambas ramas. El reparto es una propuesta basada en las dependencias del código y se puede intercambiar por entregas completas.

El trabajo concreto de cada persona está en el [plan detallado por tareas](./TAREAS_POR_PERSONA_TIENDA.md): **A01–A14 para ti y B01–B17 para Voncho**. Cada tarea identifica carpetas, modelos, implementación, entregable, dependencia del compañero, trabajo posible mientras llega y prueba de cierre. Esta guía conserva las reglas comunes de ejecución e integración.

Ambos pueden desarrollar en paralelo desde los contratos iniciales C00. Una dependencia pendiente puede impedir validar el flujo real, pero permite avanzar con servicios y pruebas basados en el contrato. Los mocks se usan en pruebas; una tarea queda terminada después de integrar sus dependencias reales. Los hitos H0–H4 del plan detallado indican cuándo se valida cada recorrido conjunto.

El resultado esperado es que el personal pueda iniciar sesión, gestionar productos e inventario, vender, cobrar, cerrar caja, gestionar crédito y consultar el Panel. El portal del comprador, carrito, pedidos, despacho y abonos en línea pertenecen a la etapa posterior de la aplicación del cliente. La ficha comercial del cliente sí forma parte de la operación interna para crédito y comprobantes.

## Punto de partida para ambos

- [x] Hay 18 recursos Nest en `apps/tienda-api/src`, registrados en `AppModule`.
- [x] El proyecto `tienda-api` está registrado en Nest. Su puerto por defecto es `8081` y compila en `build/tienda-api`. Gym usa `8080` y `dist`.
- [x] Existen esquema, migraciones y librerías comunes. Las rutas generadas responden `501` mientras se implementa cada caso de uso.
- [ ] Verificar que ambos recibieron el mismo commit publicado con estructura, configuración y documentación. La copia local revisada tiene la base versionada; confirmar su disponibilidad en el remoto antes de compartirla.
- [ ] Verificar en cada computadora la base de desarrollo, las migraciones y el arranque real. Las pruebas previas con Prisma simulado verifican el arranque técnico.

Lecturas necesarias para empezar, en este orden.

1. [Plan de implementación](./PLAN_IMPLEMENTACION_TIENDA.md), para seguir los hitos funcionales.
2. [Tareas por persona](./TAREAS_POR_PERSONA_TIENDA.md), para elegir trabajo y conocer las entregas necesarias del compañero.
3. [Diseño de STORE](./DISENO_BASE_DATOS_STORE.md), especialmente identidad y permisos, catálogo e inventario, ventas y cartera, devoluciones, caja, comprobantes y auditoría.
4. [Esquema Prisma](../prisma/schema.prisma) y [migraciones](../prisma/migrations/), para consultar campos, relaciones, claves únicas y garantías SQL. Los triggers y restricciones también forman parte del contrato de datos.
5. [Estado del esquema](./ESQUEMA_STORE_IMPLEMENTADO.md), [permisos compartidos](./INFORME_PERMISOS_COMPARTIDOS.md) e [inventario compartido](../libs/inventario/README.md).

El [mapa de modelos](./MAPA_MODELOS_BACKEND.md) ayuda a localizar responsabilidades. Algunas asignaciones reflejan una etapa anterior a la extracción de inventario. Gym ya consume `@app/inventario` para compras por lotes. Al decidir una implementación, contrastar el mapa con el código actual.

## Tu responsabilidad

Las rutas siguientes parten de `apps/tienda-api/src/`.

### Acceso y configuración del personal

Carpetas `auth/` y `accesos/`.

- Implementar login y selección de negocio con `@app/identidad`, `@app/negocios` y la base JWT de `@app/seguridad`.
- Construir el contexto autenticado con usuario, tenant, membresía y versión de autorización. Aplicar `STORE` activo y autorización por operación en el backend.
- Exponer gestión del personal, roles y asignaciones desde `accesos/`. Bodeguero, Cajero y Administrador serán roles iniciales. Los roles personalizados se forman con permisos existentes y respetan el techo de delegación.
- Mantener el catálogo de permisos compartido. Voncho te entrega la lista de operaciones comerciales que necesita proteger.
- Definir y exportar desde el módulo el guard y el mecanismo de permisos que consumirán las rutas de Voncho. Evitar que cada controlador vuelva a implementar autenticación.

Modelos involucrados `Usuario`, `Tenant`, `TenantModule`, `UserTenant`, `Permiso`, `RolNegocio`, `RolPermiso` y `AsignacionRol`. `Tenant.autorizacionVersion` pertenece al negocio. La activación en un negocio mixto requiere comprobar el flujo de Gym y la revalidación de tokens.

### Productos, categorías e inventario

Carpetas `catalogo/` e `inventario/` y librerías `libs/catalogo/` y `libs/inventario/`.

- Exponer productos con imagen, nombre, presentación, precio, categoría, código de barras y estado. Ofrecer búsqueda manual y búsqueda exacta por código de barras dentro del tenant. Conservar el código como texto.
- Dar a categorías su propia sección administrativa y sus rutas dentro de `catalogo/`, reutilizando `CategoriasProductoService`. `CategoriaProducto.modulo` identifica GYM o STORE y se valida junto con el tenant.
- Implementar entradas, apertura conciliada a LOTES, ajustes y bajas justificadas. Una baja registra motivo, responsable, cantidad, lote y costo histórico. La librería actual ofrece `ajustarLote`; falta completar la operación específica de tipo `BAJA`.
- Entregar las consultas de stock físico, reservado y disponible, y las operaciones transaccionales de salida y reintegro que consumirá Voncho.
- Mantener la selección manual de lotes y comprobar cantidad apta, vencimiento y existencias reservadas. Registrar movimientos e idempotencia junto con los cambios de saldo.

Modelos principales `Producto`, `CategoriaProducto`, `ProductoImagen`, `EntradaInventario`, `LoteInventario` y `MovimientoInventario`. Las ventas incorporan `AsignacionLoteVenta`. Las reservas existentes se consideran en la disponibilidad aunque el portal se implemente después.

### Historial e integración técnica

Carpeta `auditoria/`, archivos de arranque y configuración del proyecto.

- Exponer el Historial de Movimientos con fecha, actor, rol, producto y motivo. Aplicar paginación y un máximo de dos días por consulta, conservando todo el historial.
- Entregar a Voncho un servicio de escritura de `AuditoriaOperacion` que reciba la transacción y conserve el rol usado en ese momento.
- Coordinar cambios en `app.module.ts`, `main.ts`, `nest-cli.json`, `tsconfig*`, `package.json`, el lockfile y las migraciones. Cada PR puede proponer cambios y tú integras las modificaciones concurrentes.
- Preparar el juego de datos de prueba y las comprobaciones de aislamiento entre tiendas y compatibilidad de Gym.

## Responsabilidad de Voncho

### Clientes, venta, cobro y caja

Carpetas `clientes/`, `ventas/`, `cobros/` y `caja/`.

- En `clientes/`, gestionar la ficha comercial que usa el personal para identificar al comprador, registrar crédito y emitir comprobantes. Modelos `ClienteComercial` y sus relaciones comerciales.
- En `caja/`, administrar cajas y turnos, apertura, fondo inicial, movimientos, efectivo contado, cierre y diferencia. Modelos `Caja`, `TurnoCaja` y `MovimientoCaja`.
- En `ventas/`, coordinar la venta de mostrador, recibir selección de productos y lotes, calcular precios y totales en servidor y conservar los datos históricos de cada línea. Modelos `Venta`, `DetalleVenta` y `AsignacionLoteVenta`.
- En `cobros/`, registrar efectivo, transferencia u otros métodos admitidos, y aplicar el cobro a venta o cuenta. Modelos `Cobro`, `AplicacionCobro`, `ReversionAplicacionCobro` y `Reembolso`.
- Implementar pronto la idempotencia con `SolicitudIdempotente` en el módulo local propuesto `comun/idempotencia/` de Tienda, tarea B01. Ventas, cobros, entradas y bajas consumirán el mismo contrato. Reclamar la clave y confirmar el resultado de forma consistente, incluidos reintentos simultáneos y fallos parciales. Este módulo depende de Prisma y contratos técnicos, sin importar los módulos comerciales que lo consumen.
- Proteger cada ruta con el acceso entregado por tu compañero e incorporar la auditoría en la transacción. Solicitar las operaciones de inventario a través de `@app/inventario`.

### Crédito, anulaciones y comprobantes

Carpetas `cartera/`, `devoluciones/` y `comprobantes/`.

- En `cartera/`, crear la cuenta por el importe financiado y gestionar saldo, abonos registrados en tienda, ajustes, próximos vencimientos y días de mora. Modelos `CuentaPorCobrar` y `AjusteCuentaPorCobrar`, con cobros y aplicaciones.
- Calcular vigente o vencida por saldo y fecha al consultar. Prisma guarda ABIERTA, PAGADA y CANCELADA. Una venta de 100 con pago inicial de 20 financia 80.
- En `devoluciones/`, coordinar devoluciones, anulación, reembolso o ajuste de deuda con justificante y autorización administrativa. Modelos `DevolucionVenta` y `DetalleDevolucionVenta`, junto con los modelos de cobro y cartera.
- Solicitar al inventario el reintegro de mercancía apta o la baja correspondiente cuando regresa dañada. Las cantidades devueltas deben respetar las salidas y devoluciones anteriores.
- En `comprobantes/`, emitir y consultar documentos internos con datos históricos del receptor y consecutivo por negocio. Modelos `ComprobanteVenta`, `DetalleComprobanteVenta` y `SecuenciaComprobante`.

La emisión del comprobante consulta la venta ya realizada y su saldo. La factura de membresía de Gym conserva su modelo `Factura`. El documento comercial tiene su propia numeración y reglas.

### Panel, finanzas y exportaciones

Carpetas `panel/` y `finanzas/`.

- En `panel/`, componer indicadores de operación, deudores, personal y actividad para el Panel administrativo. Consumir los servicios de consulta de los módulos responsables de cada dato.
- En `ventas/`, ofrecer tendencias semanales y mensuales, productos más vendidos, ticket promedio, ventas por cajero y filtros por cajero, categoría y producto.
- En `finanzas/`, consultar dinero recibido, costos, gastos y pérdidas por periodo. La tarea B13 implementa registro y consulta de `GastoComercial` en un servicio/controlador dedicado dentro de finanzas. El modelo actual carece de estado o reversión del gasto; definir la regla y posible migración antes de habilitar correcciones que afecten a caja o reportes.
- Calcular ventas netas, costo vendido y utilidad con sus fuentes correspondientes. Un abono es dinero recibido; la venta original ya está registrada. Registrar las bajas a costo y evitar duplicar su pérdida en otro gasto.
- Exportar Excel y PDF con los mismos datos autorizados que las consultas. Los periodos comerciales usan `America/Guayaquil`. El límite de dos días corresponde a la consulta de auditoría; los reportes admiten los periodos acordados de día, semana o meses.

## Reglas de las carpetas y de libs

En cada recurso, `*.controller.ts` recibe HTTP, aplica acceso y llama al caso de uso. `dto/` valida entradas y documenta el contrato. `*.service.ts` ejecuta las reglas y coordina dependencias. `*.module.ts` declara imports, providers, controllers y los servicios públicos necesarios. Los `.spec.ts` verifican comportamiento. Las clases de `entities/` generadas son plantillas y la persistencia se define en Prisma.

Las operaciones deben seguir el negocio. Por ejemplo, la baja de un lote, el cierre de caja y la anulación de una venta necesitan acciones explícitas con motivo y trazabilidad. Los listados de Panel y auditoría se implementan como consultas. El CRUD generado sirve como punto de partida para definir estas rutas.

Responsables de las librerías compartidas.

- **Tú** mantienes `libs/catalogo/` y `libs/inventario/`, además de las adaptaciones necesarias en `libs/identidad/`, `libs/negocios/` y `libs/permisos/`.
- **Tú** coordinas cambios técnicos en `libs/prisma/` y `libs/seguridad/`. Prisma es la conexión y el cliente común. Seguridad conserva sus utilidades técnicas independientes de Prisma y las aplicaciones.
- **Voncho** consume estas librerías mediante `@app/*` y propone ampliaciones con firma, comportamiento y ejemplo de uso. Para trabajar en paralelo puede usar mocks en pruebas basados en el contrato acordado.
- **Ambos** revisan un cambio de API pública de una librería y verifican sus consumidores de Gym. Las librerías exportan su API por `src/index.ts`. Una librería se incorpora al proceso de cada aplicación.

Mantener las reglas comerciales específicas en Tienda. Compartir una utilidad cuando ambas aplicaciones tengan un uso concreto y el mismo comportamiento. Los imports de Tienda usan rutas relativas locales o `@app/*`; `src/*` apunta al código de Gym.

## Contrato de integración entre los dos

Antes de implementar endpoints que se llamen entre sí, publicar un PR pequeño con los siguientes acuerdos. Cada propietario documenta sus rutas al lado de su recurso en un `README.md`, con ejemplos de solicitud, respuesta, errores y permisos. Esta ubicación permite editar contratos en paralelo.

- [ ] **Tú** defines el contexto autenticado y el guard público. Usuario, tenant y membresía se resuelven desde la sesión verificada. `responsableId` comercial y de inventario referencia `UserTenant.id`; auditoría distingue `usuarioId` y `membresiaId`. Un ID de producto, cliente, lote o turno siempre se comprueba dentro de ese negocio.
- [ ] **Ambos** fijan códigos de permiso, formatos de respuesta, paginación, filtros, zona horaria y representación de importes. Como propuesta inicial, usar cadenas decimales en JSON y `Prisma.Decimal` para cálculos: importes comerciales con 2 decimales y costos históricos/tasa de impuesto con 4, según Prisma. Definir el redondeo, cantidades enteras, fechas ISO con zona explícita y serialización BigInt como texto.
- [ ] **Tú** documentas las firmas existentes de inventario y lo que falta para bajas y devoluciones. Ya existen `OperacionInventario`, `SeleccionLote` y `LoteEntrada` en la API pública de `@app/inventario`. `retirarVenta(tx, operacion, detalleVentaId)` requiere que Voncho haya creado el detalle y sus asignaciones de lotes con costos confiables; no crea las asignaciones.
- [ ] **Voncho** define el contrato de caja y cobros que utilizará la venta, con contexto y cliente transaccional como parámetros. Las operaciones internas participan en la transacción que abre la venta.
- [ ] **Tú** entregas pronto la firma de escritura de auditoría con `Prisma.TransactionClient`, tenant, actor, rol, acción, entidad, motivo y correlación. Para una operación con varios productos, registrar filas por producto con igual correlación y agruparlas al consultar; `AuditoriaOperacion` tiene un `productoId` por fila.
- [ ] **Voncho** propone el alcance de las claves de idempotencia y la respuesta a reintentos. Misma clave y contenido devuelve el resultado previo; contenido distinto produce conflicto. Las claves se delimitan por tenant y operación.

Para una venta completa, Voncho abre `prisma.$transaction`. Dentro coordina turno, productos bloqueados, venta y detalles, asignación manual de lotes, salida mediante inventario, cobro y aplicación, cuenta financiada cuando corresponda, movimiento de efectivo, auditoría y resultado idempotente. Ambos acuerdan un orden de bloqueos coherente con cierre de turno, devolución y ajuste de inventario. El inventario ya exige bloquear productos en orden de ID.

Una llamada interna recibe `tx` y todas sus escrituras usan ese cliente. Si dentro de esa operación se usa el Prisma global, se pierde la atomicidad entre los pasos. Los servicios de caja e inventario ofrecen primitivas para la venta; el caso de uso de venta coordina la operación completa y evita dependencias circulares.

Reglas verificables de aceptación.

- Stock físico igual a la suma de lotes, con stock reservado entre cero y el físico. Salida de un producto realizada una vez por operación.
- Costo de salida guardado desde los lotes elegidos. Precio y categoría históricos conservados en el detalle de venta.
- Saldo de la cuenta conciliado con importes financiados, ajustes y aplicaciones vigentes.
- Efectivo esperado igual a fondo inicial más entradas menos salidas de efectivo. Un cobro produce un movimiento de caja cuando corresponde.
- Toda baja y anulación identifica motivo, responsable y operación. Reembolso y reducción de deuda se concilian con el importe devuelto.
- Comprobante emitido una vez por venta, con numeración del negocio y sin otro descuento de stock.

## Entregas y orden de merge

El orden siguiente resume los hitos. El desglose para asignar PR y registrar avances está en [Tareas por persona](./TAREAS_POR_PERSONA_TIENDA.md). Cada PR deja una entrega revisable y puede ser menor que una tarea completa. El otro compañero revisa el contrato, las pruebas y los efectos en las librerías. Una tarea se cierra cuando llega a la rama de integración y ambos pueden usarla en su base local con sus dependencias reales.

### Base común

- [ ] **Tú** verificas la estructura publicada y entregas la guía actualizada. **Voncho** confirma el commit recibido.
- [ ] **Ambos** preparan PostgreSQL local y el juego de prueba reproducible, con dos tiendas y un negocio Gym o mixto, usuarios con permisos distintos, productos, lotes, cliente comercial y caja.
- [ ] **Ambos** publican los contratos C00 de acceso, inventario, caja, cobros, auditoría e idempotencia antes de sus consumidores. Las implementaciones se desarrollan en paralelo y se integran antes de validar la venta completa.

### Primer bloque en paralelo

- [ ] **Tú** entregas login, selección de negocio, acceso y escritura de auditoría A05. Después integras personal, catálogo, categorías y búsqueda por código. El listado del historial se desarrolla en A12 sin retrasar el escritor que consume Voncho.
- [ ] **Voncho** entrega B01 idempotencia, fichas comerciales y apertura/cierre de caja. Puede desarrollar servicios y pruebas con el contexto acordado mientras llega el guard. Las rutas funcionales se integran con autorización efectiva.

### Segundo bloque en paralelo

- [ ] **Tú** entregas entradas, apertura a lotes, bajas justificadas, operaciones públicas de salida e historial de auditoría.
- [ ] **Voncho** entrega cobros, aplicaciones y la estructura transaccional de venta usando B01. Integra la venta completa después de recibir la salida de inventario y auditoría.
- [ ] **Ambos** demuestran el recorrido login → producto → entrada → apertura de caja → venta → saldo → cierre, usando los endpoints reales.

### Tercer bloque en paralelo

- [ ] **Voncho** entrega crédito y abonos presenciales, comprobantes, anulaciones y devoluciones. Coordina primero el contrato de reintegro/baja con inventario.
- [ ] **Tú** entregas reintegros y bajas de devolución y completas auditoría, roles personalizados y regresiones de Gym. Preparas casos de concurrencia y datos para los reportes de Voncho.

### Cierre de la aplicación interna

- [ ] **Voncho** entrega Panel, análisis de ventas, finanzas y exportaciones sobre los datos integrados.
- [ ] **Tú** verificas permisos por pantalla/operación, aislamiento y carga concurrente de Gym y Tienda. Voncho corrige los hallazgos de sus módulos.
- [ ] **Ambos** validan última unidad desde dos cajas, reintento de venta, fallo intermedio con rollback, cobro simultáneo con cierre, abonos concurrentes y devolución parcial.
- [ ] **Ambos** dejan contratos y ejemplos listos para el frontend de tienda, con errores que debe manejar y un entorno reproducible.

El siguiente trabajo compartido es la aplicación del cliente. `portal/`, `carrito/`, `pedidos/` y el envío de avisos en `notificaciones/` se retomarán entonces. La solicitud de recordatorio y la lectura de deuda desde el Panel se definirán en cartera; su entrega al cliente depende de esa etapa posterior.

## Ramas y revisión entre computadoras

Propuesta inicial de rama de integración `dev2`, que es la rama local revisada. Sustituirla en los comandos si el equipo acuerda otra. Para cada entrega usar una rama corta identificada por responsable y función, por ejemplo `codex/tu-acceso-tienda`, `codex/voncho-caja-tienda` y después `codex/tu-inventario-tienda` o `codex/voncho-venta-tienda`.

Una vez publicada la base y con el trabajo local guardado, crear la rama de la entrega.

```powershell
git fetch origin
git switch dev2
git pull --ff-only origin dev2
git switch -c codex/voncho-caja-tienda
```

Después del merge de una dependencia, incorporar la rama de integración desde la rama de trabajo.

```powershell
git fetch origin
git merge origin/dev2
```

Resolver un conflicto revisando ambas intenciones. En `app.module.ts` conservar los imports y módulos necesarios. En `package.json` y el lockfile comprobar las dependencias finales. Revisar el SQL de cualquier migración en conflicto y ejecutar las verificaciones nuevamente.

Al entregar, revisar el diff, añadir los archivos de la tarea, hacer commit y publicar la rama. Abrir un PR hacia la rama de integración con resumen del flujo, rutas nuevas, contrato consumido, cambios de esquema y comandos de validación. El compañero revisa antes del merge. Publicar las dependencias primero y sincronizar después las ramas que las consumen.

Los cambios en carpetas de la otra persona se coordinan en el PR. El responsable principal evita dos implementaciones distintas de la misma regla; ambos pueden corregir o revisar cualquier módulo. Si un PR necesita inventario y venta a la vez, dividir primero el contrato común y luego los consumidores, o integrar ese cambio conjuntamente.

## Entorno local y migraciones

Cada computadora usa su propio checkout y su base de desarrollo. La base se prepara con el historial de `prisma/migrations` y datos de ensayo reproducibles. El contenedor local definido en `docker-compose.yml` expone PostgreSQL en `5433`; elegir una base con el historial compatible con el proyecto.

```powershell
npm.cmd ci
npx.cmd prisma generate
npx.cmd prisma migrate status
npx.cmd prisma migrate deploy
```

Ejecutar `migrate deploy` tras comprobar que `DATABASE_URL` señala la base local prevista. Para una base ya existente, revisar su historial antes de aplicar el baseline. El informe de reconciliación del repo describe el caso histórico. `.env` pertenece a cada computadora y las credenciales se configuran localmente.

Para cambios de esquema, quien detecte la necesidad propone campos, relaciones, impacto y reglas. Tú coordinas la generación de la migración con el esquema más reciente, incluyendo SQL de integridad cuando haga falta. Voncho revisa los consumidores comerciales. Integrar esa migración antes de la funcionalidad dependiente. Después del merge, ambos aplican la migración local y regeneran Prisma Client. Las migraciones aplicadas se conservan y las correcciones se agregan en una migración posterior.

La ejecución de Nest usa las variables del proceso. Para cargar explícitamente un `.env` local con Node compatible, en dos terminales desde la raíz del repo usar los comandos siguientes.

```powershell
# Terminal de Gym
$env:PORT = '8080'
npm.cmd run start:dev -- --env-file .env
```

```powershell
# Terminal de Tienda
$env:PORT = '8081'
npm.cmd run start:dev -- tienda-api --env-file .env
```

Cada persona verifica sus endpoints en `localhost:8081` y las regresiones de Gym en `localhost:8080`. Para compartir una reproducción, entregar pasos y datos de ensayo al compañero.

## Verificación antes de integrar

Primero revisar formato y lint. El comando global actual aplica correcciones en Gym y libs; revisar su diff. Tienda necesita además su comprobación explícita de ESLint.

```powershell
npm.cmd run lint
npx.cmd eslint "apps/tienda-api/src/**/*.ts"
npm.cmd test -- --runInBand
npm.cmd run build
npx.cmd nest build tienda-api
npm.cmd run test:e2e:gym -- --runInBand
```

Si aparece una falla previa ajena al cambio, documentar el resultado y su comparación con la base. Resolver las regresiones introducidas por la entrega. Los tests generados comprueban instanciación; añadir casos de comportamiento para las reglas que se implementen. Las pruebas de rollback, concurrencia, restricciones y saldos requieren PostgreSQL de ensayo y verificaciones sobre los datos resultantes.

- [ ] Contrato HTTP documentado y permisos aplicados, con tenant autenticado.
- [ ] Flujo correcto, entrada inválida, acceso denegado y recurso de otro negocio probados.
- [ ] Reintentos, fallos parciales y concurrencia probados cuando la operación lo requiere.
- [ ] Compilación y pruebas del alcance pasan, con regresiones de Gym al modificar libs.
- [ ] Compañero puede reproducir el flujo desde el commit publicado.
- [ ] Casilla del plan funcional actualizada con referencia al PR y a la evidencia.
