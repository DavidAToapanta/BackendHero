import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthAccessMode } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'supersecret',
    });
  }

  validate(payload: {
    sub: number;
    email?: string | null;
    userName?: string | null;
    cedula?: string | null;
    rol: string;
    clienteId?: number | null;
    tenantId?: number | null;
    tenantRole?: string | null;
    accessMode?: AuthAccessMode | null;
  }) {
    return {
      sub: payload.sub,
      email: payload.email,
      userName: payload.userName,
      cedula: payload.cedula,
      rol: payload.rol,
      clienteId: payload.clienteId,
      tenantId: payload.tenantId,
      tenantRole: payload.tenantRole,
      accessMode: payload.accessMode,
    };
  }
}
