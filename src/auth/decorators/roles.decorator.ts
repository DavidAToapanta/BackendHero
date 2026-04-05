import { SetMetadata } from '@nestjs/common';

export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  RECEPCIONISTA = 'RECEPCIONISTA',
  ENTRENADOR = 'ENTRENADOR',
  CAJERO = 'CAJERO',
  EMPLEADO = 'EMPLEADO',
  CLIENTE = 'CLIENTE',
}

export const STAFF_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.RECEPCIONISTA,
  Role.ENTRENADOR,
  Role.CAJERO,
  Role.EMPLEADO,
] as const;

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
