import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { PortalService, type ClientePortal } from './portal.service';

type SolicitudPortal = {
  headers: { authorization?: string };
  clientePortal?: ClientePortal;
};

@Injectable()
export class PortalGuard implements CanActivate {
  constructor(private readonly portal: PortalService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<SolicitudPortal>();
    const token = /^Bearer ([^ ]+)$/i.exec(
      req.headers.authorization ?? '',
    )?.[1];
    if (!token) throw new UnauthorizedException();
    req.clientePortal = await this.portal.autenticar(token);
    return true;
  }
}

export const ClientePortalActual = createParamDecorator(
  (_dato: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<SolicitudPortal>().clientePortal,
);
