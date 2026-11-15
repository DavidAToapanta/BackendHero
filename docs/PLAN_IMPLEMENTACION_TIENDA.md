# Plan de implementación de Tienda

El primer flujo es **iniciar sesión → seleccionar negocio → crear producto → registrar entrada → consultar stock**. El segundo es **abrir caja → vender → cobrar → verificar el descuento de stock → cerrar caja**. La primera entrega permite empezar el frontend de administración. La segunda habilita el frontend de mostrador. La aplicación interna de Tienda incluye también cartera, Panel, finanzas y auditoría. La aplicación del cliente se aborda después de completar la operación interna.

Marca cada casilla cuando esté disponible la evidencia indicada al cierre de su etapa. Anota el enlace al PR, contrato o resultado de pruebas en esa etapa.

El reparto entre los dos desarrolladores, los contratos y el orden de merge están en la [guía de trabajo en equipo](./TRABAJO_EQUIPO_TIENDA.md).

Para ejecutar ese reparto, usar el [plan detallado por persona](./TAREAS_POR_PERSONA_TIENDA.md): A01–A14 para ti, B01–B17 para Voncho. Cada tarea indica carpetas, modelos Prisma, entregable, dependencia concreta del compañero, cómo avanzar mientras llega y prueba de cierre. C00 define los contratos iniciales y H0–H4 los puntos de integración. El desarrollo puede avanzar en paralelo; validar un flujo completo exige integrar sus dependencias reales.

## 0. Base disponible y arranque independiente

- [x] Confirmar que Gym es el proyecto Nest por defecto.
- [x] Localizar los modelos y las dos migraciones de `STORE` en el historial único de Prisma. El informe documenta su aplicación en desarrollo. [Esquema](../prisma/schema.prisma) · [Migraciones](../prisma/migrations/) · [Informe de desarrollo](./ESQUEMA_STORE_IMPLEMENTADO.md)
- [x] Identificar las librerías reutilizables `@app/prisma`, `@app/seguridad`, `@app/identidad`, `@app/negocios`, `@app/permisos`, `@app/catalogo` y `@app/inventario`. [Librerías](../libs/README.md)
- [x] Crear `main.ts`, `app.module.ts` y `tsconfig.app.json` en `apps/tienda-api` y registrar el proyecto en Nest. Importar lo compartido con `@app/*`. El alias `src/*` resuelve a Gym.
- [ ] Verificar el arranque simultáneo de Gym y Tienda y documentar el entorno de pruebas.
- [ ] Configurar `PORT`, `DATABASE_URL` y la configuración JWT por servicio. Usar, por ejemplo, Gym en `8080` y Tienda en `8081` si comparten host. Preparar el despliegue de Tienda como servicio independiente y conservar la URL pública actual de Gym.
- [ ] Documentar quién ejecuta las migraciones del esquema compartido y verificar su estado en el entorno de pruebas de Tienda. Crear datos de prueba reproducibles para dos negocios con `STORE` y un negocio de Gym, con usuarios y permisos conocidos.
- [ ] Definir `connection_limit` por instancia de Prisma, considerando el máximo previsto de réplicas de ambas APIs y el margen para otras conexiones. Cada proceso crea su propio pool aunque importe el mismo `PrismaModule`.

**Evidencia de cierre.** Ambas APIs compilan y responden al mismo tiempo. Se puede reiniciar Tienda con Gym atendiendo una petición. Quedan documentados los comandos, la configuración y la verificación de migraciones del entorno de pruebas.

## 1. Acceso, catálogo e inventario

- [ ] `auth/` — Implementar login de personal, selección de negocio y emisión de JWT de Tienda con las librerías de identidad, negocios y seguridad. Distinguir el token de selección del token de acceso y devolver al frontend el contexto válido del negocio elegido.
- [ ] `accesos/` — Resolver `tenantId` y membresía desde el contexto autenticado, verificar `STORE` activo y la vigencia de la autorización, y aplicar `@app/permisos` a cada ruta protegida. Preparar roles y asignaciones de los negocios piloto y añadir los permisos de inventario al catálogo. Probar también la gestión de roles y asignaciones.
- [ ] `catalogo/` — Exponer productos, categorías e imágenes mediante `@app/catalogo`. Cubrir listado paginado, búsqueda, detalle, creación y edición. Definir con el frontend el formato decimal de precio y las respuestas para SKU o código de barras duplicados dentro del negocio.
- [ ] `inventario/` — Exponer consulta de existencias por producto y lote, historial, entradas y ajustes con motivo mediante `@app/inventario`. Registrar responsable y movimiento. Exponer stock físico, reservado y disponible cuando corresponda.
- [ ] Implementar la apertura a `LOTES` según el flujo existente. Probar la apertura con stock cero para productos nuevos y conciliar cantidades y costos antes de habilitar lotes en productos con existencias previas.
- [ ] Probar de punta a punta el flujo inicial y verificar que una sesión sin permiso, con módulo inactivo o de otro tenant no pueda leer ni modificar los datos. Probar también cambios de autorización y diferencias entre los tokens de Tienda y Gym.
- [ ] Publicar el contrato de las rutas de esta etapa en el repo, con método, ruta, autenticación, permisos, cuerpos de ejemplo, paginación, formatos de dinero y fechas, y errores que debe manejar la UI. Documentar la URL de pruebas y cómo generar las cuentas y datos de ejemplo.

**Evidencia de cierre para frontend de administración.** Un desarrollador puede seguir el contrato y, con las cuentas de prueba, iniciar sesión, elegir negocio, crear un producto, ingresar stock y ver el saldo resultante. Las pruebas de aislamiento y permisos pasan.

## 2. Venta de mostrador, cobro y caja

- [ ] `caja/` — Implementar alta o configuración de caja, apertura de turno, movimientos, consulta y cierre con efectivo esperado, contado y diferencia. Aplicar permisos por operación y verificar la apertura concurrente de una misma caja.
- [ ] `ventas/` y `cobros/` — Implementar venta de mostrador con pago completo y sin pedido previo. Recalcular precios y totales en el servidor, conservar los importes de la venta, validar cantidades enteras y permitir selección manual de lotes.
- [ ] Ejecutar venta, asignación y salida de lotes, cobro, aplicación del cobro y movimiento de caja cuando corresponda en una sola transacción. Bloquear productos en orden de ID. Un cobro en efectivo genera un movimiento de efectivo. Transferencias y tarjetas se registran según su método y quedan fuera del saldo de efectivo.
- [ ] Implementar idempotencia por tenant y operación. Un reintento con la misma clave y datos devuelve la misma venta. Una clave reutilizada con datos distintos genera conflicto. Probar reintentos simultáneos y reversión completa ante un fallo dentro de la transacción.
- [ ] Publicar el contrato de mostrador con ejemplos de apertura, venta, consulta y cierre. Documentar cómo enviar la clave de idempotencia y cómo manejar stock insuficiente, lote no disponible o turno cerrado.
- [ ] Probar con PostgreSQL que, al vender la última unidad desde dos cajas, se registra una sola venta y quedan consistentes stock, cobro y caja. Probar también una venta concurrente con una entrada de inventario y conciliar los saldos al cierre.
- [ ] Medir en pruebas un pico representativo de tiendas, con varias cajas vendiendo y registrando inventario mientras Gym marca asistencias. Acordar volumen y latencia aceptable con base en la operación esperada. Registrar latencia p95, errores, espera por conexiones y bloqueos, y ajustar consultas, transacciones o capacidad según los resultados.
- [ ] Ejecutar las regresiones de Gym, incluida la suite HTTP/WebSocket, y verificar la compilación de ambas APIs. Mantener las tareas como correos y reportes fuera de la transacción de venta.

**Evidencia de cierre para frontend de mostrador.** El contrato y el entorno permiten abrir caja, vender con un reintento seguro, consultar el saldo de inventario y cerrar turno. Quedan guardados los resultados de concurrencia, carga y regresiones de Gym para decidir la salida a operación.

## 3. Administración y operación interna

- [ ] Implementar devoluciones, anulaciones y reembolsos con trazabilidad de venta, cobro, destino del inventario y caja.
- [ ] `clientes/` — Gestionar las fichas de clientes comerciales desde el Panel de Tienda.
- [ ] `cartera/` — Registrar ventas a crédito, abonos recibidos en tienda, reversiones y ajustes. Mostrar saldos, vencimientos, días de mora y clientes deudores. Conciliar el saldo con aplicaciones, reversiones y devoluciones.
- [ ] `panel/` — Reunir resúmenes de ventas, cartera y actividad para el personal. Aplicar permisos de lectura por negocio.
- [ ] `finanzas/` — Consultar ingresos, costos, gastos y pérdidas por periodo. Proveer exportaciones Excel y PDF con los mismos filtros y permisos.
- [ ] `auditoria/` — Registrar ventas, anulaciones, entradas y bajas con actor, rol, motivo y fecha. Consultar el Historial de Movimientos por rol y producto, con paginación y un rango máximo de dos días por consulta.
- [ ] Emitir comprobantes internos sin volver a descontar inventario. La integración con SRI queda para una etapa futura.
- [ ] Publicar los contratos y probar cada flujo, con permisos, integridad de saldos y resultados de reintentos donde haya escritura.

**Evidencia de cierre.** El frontend puede integrar los flujos de esta etapa con los contratos publicados y cada operación queda conciliada con su historial.

## 4. Aplicación del cliente

Esta etapa se retoma después de la operación interna. Incluye vínculo con una
cuenta, portal, carrito, pedidos y avisos al cliente. Despacho y abonos en línea
se evaluarán en esa etapa.

- [ ] Verificar el vínculo entre el cliente comercial y su cuenta, y exponer su historial propio en `portal/`.
- [ ] `carrito/` — Gestionar los productos seleccionados. La disponibilidad se compromete al confirmar el pedido.
- [ ] `pedidos/` — Fijar el precio al confirmar y reservar stock con `ReservasInventarioService`. Liberar al cancelar o al vencer en un máximo de una hora. Verificar el vencimiento al entregar y requerir un pedido nuevo tras la expiración.
- [ ] Convertir el pedido en una sola venta al entregar. Consumir la reserva y descontar el stock físico en esa transición. Registrar el pago en tienda y comprobar que emitir el comprobante mantiene el stock resultante.
- [ ] Procesar los avisos al cliente mediante `EventoSalida`, con reintentos y deduplicación.
- [ ] Publicar el contrato y probar cancelaciones, expiración, entregas simultáneas o reintentadas y aislamiento del historial por cliente y negocio.

**Evidencia de cierre.** El frontend del cliente puede reproducir el flujo de catálogo a retiro en tienda y consultar los estados de sus pedidos.

Referencias del repo. [Arquitectura de BackendHero](./ARQUITECTURA_BACKEND.md) · [Diseño funcional de Tienda](./DISENO_BASE_DATOS_STORE.md) · [Permisos compartidos](./INFORME_PERMISOS_COMPARTIDOS.md) · [Inventario compartido](../libs/inventario/README.md)
