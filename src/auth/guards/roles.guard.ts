import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from '../decorators/roles.decorator';

type TenantAwareRequestUser = {
  rol?: string | null;
  tenantRole?: string | null;
};

const normalizedRoles: Record<string, Role> = {
  [Role.OWNER]: Role.OWNER,
  [Role.ADMIN]: Role.ADMIN,
  [Role.RECEPCIONISTA]: Role.RECEPCIONISTA,
  [Role.ENTRENADOR]: Role.ENTRENADOR,
  [Role.CAJERO]: Role.CAJERO,
  [Role.EMPLEADO]: Role.EMPLEADO,
  [Role.CLIENTE]: Role.CLIENTE,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{
      user?: TenantAwareRequestUser;
    }>();

    return requiredRoles.some((role) => this.matchesRequiredRole(user, role));
  }

  private matchesRequiredRole(
    user: TenantAwareRequestUser | undefined,
    requiredRole: Role,
  ) {
    if (!user) {
      return false;
    }

    if (requiredRole === Role.CLIENTE) {
      return user.rol === Role.CLIENTE;
    }

    const tenantRole = this.normalizeRole(user.tenantRole);
    if (tenantRole) {
      if (tenantRole === requiredRole) {
        return true;
      }

      if (tenantRole === Role.OWNER && requiredRole === Role.ADMIN) {
        return true;
      }
    }

    // Transitional fallback for legacy staff tokens until every staff flow
    // emits tenantRole consistently. CLIENTE stays isolated above.
    const legacyRole = this.normalizeRole(user.rol);
    return legacyRole === requiredRole;
  }

  private normalizeRole(role?: string | null): Role | null {
    if (!role) {
      return null;
    }

    return normalizedRoles[role] ?? null;
  }
}
