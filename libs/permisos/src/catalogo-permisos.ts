import type { ModuleKey } from '@prisma/client';

function permisoTienda<T extends `store.${string}`>(
  codigo: T,
  descripcion: string,
  delegable: boolean,
) {
  return { codigo, modulo: 'STORE' as const, descripcion, delegable };
}

export const CATALOGO_PERMISOS = [
  {
    codigo: 'gym.roles.manage',
    modulo: 'GYM',
    descripcion: 'Gestionar roles de Gym',
    delegable: false,
  },
  {
    codigo: 'gym.staff.read',
    modulo: 'GYM',
    descripcion: 'Consultar personal de Gym',
    delegable: true,
  },
  {
    codigo: 'gym.staff.write',
    modulo: 'GYM',
    descripcion: 'Modificar personal de Gym',
    delegable: true,
  },
  permisoTienda('store.roles.manage', 'Gestionar roles y asignaciones', false),
  permisoTienda('store.staff.read', 'Consultar personal', true),
  permisoTienda('store.staff.write', 'Gestionar personal', false),
  permisoTienda('store.catalog.read', 'Consultar el catálogo de Tienda', true),
  permisoTienda('store.catalog.write', 'Modificar el catálogo de Tienda', true),
  permisoTienda(
    'store.inventory.read',
    'Consultar inventario y movimientos',
    true,
  ),
  permisoTienda(
    'store.inventory.cost.read',
    'Consultar costos de inventario',
    true,
  ),
  permisoTienda(
    'store.inventory.receive',
    'Abrir lotes y registrar entradas',
    true,
  ),
  permisoTienda(
    'store.inventory.adjust',
    'Registrar ajustes de inventario',
    false,
  ),
  permisoTienda('store.inventory.loss', 'Registrar bajas de inventario', true),
  permisoTienda(
    'store.cash.read',
    'Consultar cajas, turnos y movimientos',
    true,
  ),
  permisoTienda('store.cash.manage', 'Configurar cajas', false),
  permisoTienda('store.cash.open', 'Abrir turno de caja', true),
  permisoTienda('store.cash.close', 'Cerrar turno de caja', true),
  permisoTienda(
    'store.cash.movements.write',
    'Registrar movimientos manuales de caja',
    false,
  ),
  permisoTienda('store.customers.read', 'Consultar clientes comerciales', true),
  permisoTienda(
    'store.customers.write',
    'Gestionar clientes comerciales',
    true,
  ),
  permisoTienda('store.sales.read', 'Consultar ventas', true),
  permisoTienda('store.sales.create', 'Registrar venta de mostrador', true),
  permisoTienda('store.sales.credit', 'Autorizar venta a crédito', false),
  permisoTienda('store.sales.void', 'Anular una venta', false),
  permisoTienda(
    'store.sales.analytics.read',
    'Consultar análisis de ventas',
    true,
  ),
  permisoTienda('store.payments.read', 'Consultar cobros', true),
  permisoTienda('store.payments.create', 'Registrar y aplicar un cobro', true),
  permisoTienda(
    'store.payments.reverse',
    'Revertir un cobro o su aplicación',
    false,
  ),
  permisoTienda('store.payments.refund', 'Registrar un reembolso', false),
  permisoTienda(
    'store.receivables.read',
    'Consultar cartera y cuentas por cobrar',
    true,
  ),
  permisoTienda(
    'store.receivables.collect',
    'Registrar abonos en cartera',
    true,
  ),
  permisoTienda(
    'store.receivables.adjust',
    'Ajustar una cuenta por cobrar',
    false,
  ),
  permisoTienda('store.returns.read', 'Consultar devoluciones', true),
  permisoTienda('store.returns.write', 'Registrar una devolución', false),
  permisoTienda(
    'store.receipts.read',
    'Consultar y descargar comprobantes',
    true,
  ),
  permisoTienda('store.receipts.issue', 'Emitir un comprobante', true),
  permisoTienda('store.expenses.read', 'Consultar gastos comerciales', true),
  permisoTienda('store.expenses.write', 'Registrar gastos comerciales', false),
  permisoTienda(
    'store.audit.read',
    'Consultar el historial de auditoría',
    true,
  ),
  permisoTienda('store.panel.read', 'Consultar el Panel administrativo', true),
  permisoTienda('store.reports.read', 'Consultar reportes financieros', true),
  permisoTienda('store.reports.export', 'Exportar reportes', true),
] as const satisfies readonly {
  codigo: string;
  modulo: ModuleKey;
  descripcion: string;
  delegable: boolean;
}[];

export type CodigoPermiso = (typeof CATALOGO_PERMISOS)[number]['codigo'];
export type CodigoPermisoTienda = Extract<CodigoPermiso, `store.${string}`>;

type DefinicionPermiso = (typeof CATALOGO_PERMISOS)[number];
export const CATALOGO_PERMISOS_TIENDA = CATALOGO_PERMISOS.filter(
  (permiso): permiso is Extract<DefinicionPermiso, { modulo: 'STORE' }> =>
    permiso.modulo === 'STORE',
);

const permisosPorCodigo = new Map<string, DefinicionPermiso>(
  CATALOGO_PERMISOS.map((permiso) => [permiso.codigo, permiso]),
);

export function obtenerDefinicionPermiso(codigo: string) {
  return permisosPorCodigo.get(codigo);
}

export const GESTION_POR_MODULO = {
  GYM: 'gym.roles.manage',
  STORE: 'store.roles.manage',
} as const satisfies Record<ModuleKey, CodigoPermiso>;

export function coincideConCatalogo(permiso: {
  codigo: string;
  modulo: ModuleKey;
  delegable: boolean;
}) {
  const definicion = obtenerDefinicionPermiso(permiso.codigo);
  return (
    definicion?.modulo === permiso.modulo &&
    definicion.delegable === permiso.delegable
  );
}
