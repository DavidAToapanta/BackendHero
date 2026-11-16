# Checklist de avance de Voncho · Tienda

**Corte del código** · 15 de noviembre de 2026, commit `fca3312` en `codex/voncho-tienda-b01-idempotencia`. La rama parte de `dev2` en `91d2f6d` y el PR está pendiente.

Este checklist registra el avance en la rama de trabajo. Las casillas marcadas corresponden a entregas internas implementadas y comprobaciones realizadas, algunas dentro de un flujo más amplio. El núcleo de **11 de las 17 tareas** está implementado y probado. Las otras **6 ya tienen código** y conservan pendientes de implementación o validación. El cierre formal sigue el [plan de reparto](./TAREAS_POR_PERSONA_TIENDA.md#criterio-común-para-cerrar-una-tarea).

## 11 tareas con el núcleo implementado y probado

- [x] **B01 · Idempotencia.** La misma clave devuelve el resultado original. Se probaron conflicto por contenido distinto, concurrencia y reversión ante fallos. El contrato K06 está disponible para entradas y bajas de inventario.
- [x] **B02 · Clientes comerciales.** Alta, edición, desactivación, búsqueda paginada y vínculo opcional con Gym. Se probaron búsqueda, duplicados y aislamiento por tienda. Queda validar el vínculo con datos reales de Gym.
- [x] **B03 · Apertura de caja.** Configuración de cajas, fondo inicial y turno activo. Se comprobó que dos aperturas simultáneas dejan un solo turno. Queda conectar el selector de personal.
- [x] **B04 · Movimientos y cierre.** Entrada, salida, efectivo esperado, contado y diferencia. Se probó el cierre con movimientos y gastos. Queda probar la carrera entre cobro y cierre y el permiso de supervisor.
- [x] **B05 · Cobros.** Registro y aplicación a venta o cuenta. El efectivo genera una entrada de caja. Se probó dentro del flujo de crédito y abonos.
- [x] **B07 · Venta a crédito.** Se probó una venta de $100 con $20 de inicial y $80 financiados. Queda probar la financiación sin inicial y el permiso de crédito en la API.
- [x] **B08 · Abonos y cartera.** Consultas de saldos y vencimientos, mora y registro de abonos. Se probó el rechazo de un sobrepago concurrente y el paso a pagada con el abono final.
- [x] **B09 · Reversiones y reembolsos.** Se probó revertir un cobro completo registrado por error, restaurar la deuda, compensar caja y recuperar el estado previo si falla la auditoría. Para efectivo, la compensación usa el turno original abierto.
- [x] **B12 · Comprobantes.** Emisión por venta con consecutivo, datos históricos y PDF. Se probó la emisión concurrente para una misma venta, la conservación del receptor y la generación del archivo.
- [x] **B13 · Gastos.** El efectivo registra una salida y la transferencia conserva el saldo de caja. Se probó el reintento sin duplicar el gasto.
- [x] **B14 · Análisis de ventas.** Listado, detalle, tendencias, productos, cajeros y ticket promedio. Se comprobó el cálculo con una venta real de ensayo. Queda ampliar la cobertura de filtros e historial.

## 6 tareas con pendientes concretos

- [ ] **B06 · Venta de contado.** Ya tiene confirmación, precios del servidor, cobro y salida de lotes. La salida se probó con el flujo de crédito. Falta acordar descuentos, impuestos y redondeo, y validar el flujo completo de contado con el catálogo y los lotes de David.
- [ ] **B10 · Devoluciones.** Pasó el escenario de devolución parcial y reembolso con un adaptador de inventario de ensayo. Falta conectar A11 y probar el retorno de mercancía apta y dañada con inventario real.
- [ ] **B11 · Anulación.** Se probó anular tras una devolución parcial, con la cancelación de la cuenta y del comprobante. Falta aplicar el permiso administrativo y validar la anulación que incluye una devolución física con A11.
- [ ] **B15 · Finanzas.** Se comprobó la conciliación de ventas, abonos, reembolsos, costos y anulación. Falta cotejar las pérdidas con las bajas y devoluciones reales de A10/A11.
- [ ] **B16 · Panel.** Los bloques están compuestos y se comprobó que las consultas sin permiso quedan excluidas. Falta conectar los permisos reales y las fuentes de personal, stock e historial de David.
- [ ] **B17 · Exportaciones.** Ya genera Excel y PDF. Se comprobó la lectura del Excel de ventas y la generación del PDF del comprobante. Faltan las descargas autorizadas, la revisión de los archivos restantes y las pruebas conjuntas de carga.

## Pendientes para coordinar entre David y Voncho

- [ ] **A02/A03/A05 · Acceso, permisos y auditoría.** Conectar el contexto verificado y registrar auditoría en la misma transacción. Esto habilita las rutas que utilizará el frontend.
- [ ] **K02 · Descuentos e impuestos.** Acordar entre ambos si el catálogo incluye impuesto, de dónde sale la tasa por producto, quién puede aplicar descuentos, si se aplican por línea o por venta y cómo se redondea. Registrar un ejemplo con total esperado antes de cerrar B06.
- [ ] **A07/A08 · Catálogo y lotes.** Conectar los selectores y comprobar el recorrido de contado desde la selección del producto.
- [ ] **A10/A11 · Bajas y retornos.** Conectar el adaptador de inventario real para cerrar B10, B11 y la validación de pérdidas de B15.
- [ ] **A04/A08/A12 · Panel.** Conectar personal, stock e historial.
- [ ] **H2–H4 · Pruebas conjuntas.** Validar los recorridos completos, los archivos descargados con permisos reales y la carga antes de cerrar las tareas del plan.

## Referencias para revisar el código

- `1cc2510` incorpora la idempotencia y documenta K06.
- `37aacf2` incorpora los servicios comerciales, reportes y exportaciones. Incluye una [migración nueva](../prisma/migrations/20261115120000_fix_store_sale_check_alias/migration.sql) que corrige un alias ambiguo en la comprobación SQL de ventas.
- `fca3312` incorpora la reversión de cobros completos registrados por error y amplía las pruebas.
- [Contratos y comandos de prueba](../apps/tienda-api/README.md#servicios-comerciales-de-b01b17) · [Contrato K06](../apps/tienda-api/src/comun/idempotencia/README.md) · [Prueba de operación con PostgreSQL](../test/tienda-operacion-postgres.e2e-spec.ts)
