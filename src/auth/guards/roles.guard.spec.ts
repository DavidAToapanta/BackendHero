import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

const makeContext = (user: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('autoriza staff por tenantRole', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.RECEPCIONISTA]);

    const allowed = guard.canActivate(
      makeContext({
        rol: 'SIN_ROL',
        tenantRole: 'RECEPCIONISTA',
      }),
    );

    expect(allowed).toBe(true);
  });

  it('OWNER hereda permisos de ADMIN', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    const allowed = guard.canActivate(
      makeContext({
        rol: 'ADMIN',
        tenantRole: 'OWNER',
      }),
    );

    expect(allowed).toBe(true);
  });

  it('CLIENTE no entra en rutas staff', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    const allowed = guard.canActivate(
      makeContext({
        rol: 'CLIENTE',
        tenantRole: null,
      }),
    );

    expect(allowed).toBe(false);
  });

  it('autoriza rutas cliente solo con rol CLIENTE aunque exista tenantRole staff', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.CLIENTE]);

    const allowed = guard.canActivate(
      makeContext({
        rol: 'CLIENTE',
        tenantRole: 'ADMIN',
      }),
    );

    expect(allowed).toBe(true);
  });

  it('mantiene fallback legacy por user.rol si no hay tenantRole', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    const allowed = guard.canActivate(
      makeContext({
        rol: 'ADMIN',
        tenantRole: null,
      }),
    );

    expect(allowed).toBe(true);
  });
});
