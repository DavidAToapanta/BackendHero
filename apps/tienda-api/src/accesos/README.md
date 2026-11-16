# Autorización por operación en Tienda

## Uso en un recurso

Importa `AccesosModule` en el módulo Nest que declara el controlador. Aplica
`RequierePermisoTienda` a cada operación protegida. La autenticación de A02
resuelve la sesión primero y `@app/permisos` comprueba los permisos vigentes.

```ts
import {
  AccesosModule,
  RequierePermisoTienda,
} from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';

// En el módulo del recurso
@Module({ imports: [AccesosModule], controllers: [VentasController] })
export class VentasModule {}

// Dentro del controlador
@Post()
@RequierePermisoTienda('store.sales.create')
registrar(@ContextoTiendaActual() contexto: ContextoTienda) {
  return this.ventas.registrar(contexto.tenantId, contexto.membresiaId);
}
```

Cada código adicional es obligatorio. Por ejemplo,
`@RequierePermisoTienda('store.sales.analytics.read', 'store.reports.export')`
autoriza una exportación de análisis de ventas. El servicio consulta los
recursos dentro de `contexto.tenantId` y aplica el alcance de turno, cliente o
registro que corresponda. Usa `contexto.membresiaId` como ID del responsable.

- `401` indica que la sesión de Tienda falta, es inválida o perdió vigencia.
- `403` indica que el contexto autenticado carece del permiso exigido. Los
  permisos por operación requieren que el negocio esté en modo `PERMISOS`.

## Matriz inicial para A04 y B02–B17

Administrador recibe todos los códigos de STORE de esta matriz. OWNER
conserva el acceso implícito del rol protegido en módulos activos. Las dos
columnas de perfiles operativos indican los permisos que reciben Cajero y
Bodeguero al configurarlos. El catálogo TypeScript de `@app/permisos` define
los códigos y la delegación. A04 prepara y asigna los perfiles del piloto.

| Tarea   | Operación                              | Código                       | Cajero | Bodeguero | Delegable |
| ------- | -------------------------------------- | ---------------------------- | ------ | --------- | --------- |
| A04     | Gestionar roles y asignaciones         | `store.roles.manage`         | —      | —         | No        |
| A04     | Consultar personal                     | `store.staff.read`           | —      | —         | Sí        |
| A04     | Gestionar personal                     | `store.staff.write`          | —      | —         | No        |
| A06–A07 | Consultar el catálogo de Tienda        | `store.catalog.read`         | Sí     | Sí        | Sí        |
| A06–A07 | Modificar el catálogo de Tienda        | `store.catalog.write`        | —      | —         | Sí        |
| A08     | Consultar inventario y movimientos     | `store.inventory.read`       | Sí     | Sí        | Sí        |
| A08     | Consultar costos de inventario         | `store.inventory.cost.read`  | —      | —         | Sí        |
| A09     | Abrir lotes y registrar entradas       | `store.inventory.receive`    | —      | Sí        | Sí        |
| A10     | Registrar ajustes de inventario        | `store.inventory.adjust`     | —      | —         | No        |
| A10     | Registrar bajas de inventario          | `store.inventory.loss`       | —      | Sí        | Sí        |
| B03–B04 | Consultar cajas, turnos y movimientos  | `store.cash.read`            | Sí     | —         | Sí        |
| B03     | Configurar cajas                       | `store.cash.manage`          | —      | —         | No        |
| B03     | Abrir turno de caja                    | `store.cash.open`            | Sí     | —         | Sí        |
| B04     | Cerrar turno de caja                   | `store.cash.close`           | Sí     | —         | Sí        |
| B04     | Registrar movimientos manuales de caja | `store.cash.movements.write` | —      | —         | No        |
| B02     | Consultar clientes comerciales         | `store.customers.read`       | Sí     | —         | Sí        |
| B02     | Gestionar clientes comerciales         | `store.customers.write`      | —      | —         | Sí        |
| B06/B14 | Consultar ventas                       | `store.sales.read`           | Sí     | —         | Sí        |
| B06     | Registrar venta de mostrador           | `store.sales.create`         | Sí     | —         | Sí        |
| B07     | Autorizar venta a crédito              | `store.sales.credit`         | —      | —         | No        |
| B11     | Anular una venta                       | `store.sales.void`           | —      | —         | No        |
| B14     | Consultar análisis de ventas           | `store.sales.analytics.read` | —      | —         | Sí        |
| B05     | Consultar cobros                       | `store.payments.read`        | Sí     | —         | Sí        |
| B05     | Registrar y aplicar un cobro           | `store.payments.create`      | Sí     | —         | Sí        |
| B09     | Revertir un cobro o su aplicación      | `store.payments.reverse`     | —      | —         | No        |
| B09     | Registrar un reembolso                 | `store.payments.refund`      | —      | —         | No        |
| B08     | Consultar cartera y cuentas por cobrar | `store.receivables.read`     | Sí     | —         | Sí        |
| B08     | Registrar abonos en cartera            | `store.receivables.collect`  | Sí     | —         | Sí        |
| B09     | Ajustar una cuenta por cobrar          | `store.receivables.adjust`   | —      | —         | No        |
| B10     | Consultar devoluciones                 | `store.returns.read`         | —      | —         | Sí        |
| B10     | Registrar una devolución               | `store.returns.write`        | —      | —         | No        |
| B12     | Consultar y descargar comprobantes     | `store.receipts.read`        | Sí     | —         | Sí        |
| B12     | Emitir un comprobante                  | `store.receipts.issue`       | Sí     | —         | Sí        |
| B13     | Consultar gastos comerciales           | `store.expenses.read`        | —      | —         | Sí        |
| B13     | Registrar gastos comerciales           | `store.expenses.write`       | —      | —         | No        |
| A12     | Consultar el historial de auditoría    | `store.audit.read`           | —      | —         | Sí        |
| B16     | Consultar el Panel administrativo      | `store.panel.read`           | —      | —         | Sí        |
| B15–B17 | Consultar reportes financieros         | `store.reports.read`         | —      | —         | Sí        |
| B15–B17 | Exportar reportes                      | `store.reports.export`       | —      | —         | Sí        |

### Alcances por operación

- **Cajero** consulta las cajas disponibles y opera su turno. Puede vender al
  contado, registrar cobros y abonos, y emitir comprobantes. El crédito nuevo
  exige `store.sales.credit`. Un abono exige `store.receivables.collect` y
  `store.payments.create`.
- **Bodeguero** registra entradas y bajas justificadas. El acceso a costos
  requiere `store.inventory.cost.read` además de lectura de inventario.
- **Anulación de ventas** usa `store.sales.void`. El permiso cubre la operación
  coordinada y sus efectos internos, incluida la anulación documental. Las
  rutas que exponen un reembolso o una devolución independientes usan sus
  permisos específicos.
- **Panel** usa `store.panel.read` para el acceso a la ruta y comprueba el
  permiso de la fuente para cada bloque. **Exportaciones** aplican el permiso
  de la fuente y `store.reports.export`. Por ejemplo, el cierre de caja usa
  `store.cash.read` y un reporte financiero usa `store.reports.read`.
- **Delegación** conserva el techo de `@app/permisos`. Los gestores delegados
  solo pueden otorgar permisos delegables que ya poseen en el módulo activo.
  Se conservan las protecciones del rol propio y las asignaciones protegidas.

La suite de [Tienda con PostgreSQL](../../../../test/tienda-auth-postgres.e2e-spec.ts)
prueba estos controles con los JWT de A02. Los pasos para ejecutarla están en
el [README de autenticación](../auth/README.md).
