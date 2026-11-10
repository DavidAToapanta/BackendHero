import { ModuleKey } from '@prisma/client';

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
  {
    codigo: 'store.roles.manage',
    modulo: 'STORE',
    descripcion: 'Gestionar roles de Tienda',
    delegable: false,
  },
  {
    codigo: 'store.catalog.read',
    modulo: 'STORE',
    descripcion: 'Consultar el catálogo de Tienda',
    delegable: true,
  },
  {
    codigo: 'store.catalog.write',
    modulo: 'STORE',
    descripcion: 'Modificar el catálogo de Tienda',
    delegable: true,
  },
] as const satisfies readonly {
  codigo: string;
  modulo: ModuleKey;
  descripcion: string;
  delegable: boolean;
}[];

export type CodigoPermiso = (typeof CATALOGO_PERMISOS)[number]['codigo'];

export const GESTION_POR_MODULO = {
  GYM: 'gym.roles.manage',
  STORE: 'store.roles.manage',
} as const satisfies Record<ModuleKey, CodigoPermiso>;

export function coincideConCatalogo(permiso: {
  codigo: string;
  modulo: ModuleKey;
  delegable: boolean;
}) {
  return CATALOGO_PERMISOS.some(
    (definicion) =>
      definicion.codigo === permiso.codigo &&
      definicion.modulo === permiso.modulo &&
      definicion.delegable === permiso.delegable,
  );
}
