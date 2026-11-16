import type { VersionAutorizacion } from '@prisma/client';

export const MAX_PRISMA_INT = 2147483647;

export type ContextoTienda = {
  usuarioId: number;
  tenantId: number;
  tenantNombre: string;
  membresiaId: number;
  versionAutorizacion: number;
  modoAutorizacion: VersionAutorizacion;
  rolEfectivo: { codigo: string; nombre: string };
};

export type TokenAccesoTienda = Pick<
  ContextoTienda,
  'tenantId' | 'membresiaId' | 'versionAutorizacion' | 'modoAutorizacion'
> & { sub: number; tokenType: 'ACCESS' };

export type TokenSeleccionTienda = {
  sub: number;
  tokenType: 'CONTEXT_SELECTION';
};

export type AccesoTienda = {
  requiresContextSelection: false;
  accessToken: string;
  context: ContextoTienda;
};

export type SeleccionTienda = {
  requiresContextSelection: true;
  selectionToken: string;
  contexts: Pick<ContextoTienda, 'tenantId' | 'tenantNombre'>[];
};
