import { TenantRole } from '@prisma/client';

export const AUTH_CONTEXT_TYPES = ['CLIENTE', 'STAFF'] as const;
export type AuthContextType = (typeof AUTH_CONTEXT_TYPES)[number];

export const AUTH_ACCESS_MODES = ['PLATFORM', 'ASISTENCIA'] as const;
export type AuthAccessMode = (typeof AUTH_ACCESS_MODES)[number];

export type ClienteAuthContext = {
  type: 'CLIENTE';
  tenantId: number;
  tenantNombre: string;
  clienteId: number;
  tenantRole: null;
  allowedModes: AuthAccessMode[];
};

export type StaffAuthContext = {
  type: 'STAFF';
  tenantId: number;
  tenantNombre: string;
  clienteId: null;
  tenantRole: TenantRole;
  allowedModes: AuthAccessMode[];
};

export type AvailableAuthContext = ClienteAuthContext | StaffAuthContext;

export type ContextSelectionTokenPayload = {
  sub: number;
  tokenType: 'CONTEXT_SELECTION';
};
