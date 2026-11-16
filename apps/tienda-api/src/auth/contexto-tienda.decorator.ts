import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ContextoTienda } from './auth.types';

export const ContextoTiendaActual = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ContextoTienda =>
    context.switchToHttp().getRequest<{ user: ContextoTienda }>().user,
);
