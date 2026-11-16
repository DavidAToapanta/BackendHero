import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JWT_TIENDA_ESTRATEGIA } from './auth.config';

@Injectable()
export class TiendaJwtGuard extends AuthGuard(JWT_TIENDA_ESTRATEGIA) {}
