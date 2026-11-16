import { createJwtStrategyBase } from '@app/seguridad';
import { Injectable } from '@nestjs/common';
import {
  getTiendaJwtSecret,
  JWT_TIENDA_ACCESO,
  JWT_TIENDA_EMISOR,
  JWT_TIENDA_ESTRATEGIA,
} from './auth.config';
import { AuthService } from './auth.service';
import type { ContextoTienda, TokenAccesoTienda } from './auth.types';

@Injectable()
export class TiendaJwtStrategy extends createJwtStrategyBase<
  TokenAccesoTienda,
  ContextoTienda
>(JWT_TIENDA_ESTRATEGIA) {
  constructor(private readonly auth: AuthService) {
    super({
      secretOrKey: getTiendaJwtSecret(),
      issuer: JWT_TIENDA_EMISOR,
      audience: JWT_TIENDA_ACCESO,
      algorithms: ['HS256'],
    });
  }

  validate(payload: TokenAccesoTienda) {
    return this.auth.validarAcceso(payload);
  }
}
