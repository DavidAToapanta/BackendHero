import { PermisosService, type CodigoPermisoTienda } from '@app/permisos';
import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TiendaJwtGuard, type ContextoTienda } from '../auth';

type PermisosRequeridos = readonly [
  CodigoPermisoTienda,
  ...CodigoPermisoTienda[],
];
const PERMISOS_TIENDA = Symbol('permisos-tienda');

@Injectable()
export class PermisosTiendaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permisos: PermisosService,
  ) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const { user } = execution
      .switchToHttp()
      .getRequest<{ user?: ContextoTienda }>();
    if (!user) {
      throw new UnauthorizedException();
    }
    const requeridos = this.reflector.get<PermisosRequeridos | undefined>(
      PERMISOS_TIENDA,
      execution.getHandler(),
    );
    if (!requeridos) {
      throw new ForbiddenException('Permiso insuficiente');
    }
    await this.permisos.autorizar(user, requeridos);
    return true;
  }
}

export function RequierePermisoTienda(
  ...permisos: PermisosRequeridos
): MethodDecorator {
  return applyDecorators(
    SetMetadata(PERMISOS_TIENDA, permisos),
    UseGuards(TiendaJwtGuard, PermisosTiendaGuard),
  );
}
