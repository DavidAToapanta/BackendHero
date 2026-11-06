import { Injectable } from '@nestjs/common';
import { JwtStrategyBase } from '@app/seguridad';
import { GymJwtPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends JwtStrategyBase<GymJwtPayload> {
  validate(payload: GymJwtPayload) {
    return {
      sub: payload.sub,
      email: payload.email,
      userName: payload.userName,
      cedula: payload.cedula,
      rol: payload.rol,
      clienteId: payload.clienteId,
      tenantId: payload.tenantId,
      tenantNombre: payload.tenantNombre,
      tenantRole: payload.tenantRole,
      accessMode: payload.accessMode,
    };
  }
}
