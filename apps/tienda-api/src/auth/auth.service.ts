import { IdentidadService } from '@app/identidad';
import { MembresiasPersonalService } from '@app/negocios';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  CONTEXT_SELECTION_TOKEN_EXPIRES_IN,
} from '@app/seguridad';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  JWT_TIENDA_ACCESO,
  JWT_TIENDA_EMISOR,
  JWT_TIENDA_SELECCION,
} from './auth.config';
import {
  MAX_PRISMA_INT,
  type AccesoTienda,
  type ContextoTienda,
  type SeleccionTienda,
  type TokenAccesoTienda,
  type TokenSeleccionTienda,
} from './auth.types';
import { LoginDto } from './dto/login.dto';
import { SelectContextDto } from './dto/select-context.dto';

type Claims<T> = Partial<T> & { exp?: number };

function esEnteroPositivo(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_PRISMA_INT
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly identidad: IdentidadService,
    private readonly membresias: MembresiasPersonalService,
    private readonly jwt: JwtService,
  ) {}

  async login({
    cedula,
    password,
  }: LoginDto): Promise<AccesoTienda | SeleccionTienda> {
    const resultado = await this.identidad.verifyCredentials(
      cedula.trim(),
      password,
    );
    if (resultado.status !== 'valid') {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const usuarioId = resultado.account.id;
    const contextos = await this.listarContextos(usuarioId);
    if (contextos.length === 0) {
      throw new ForbiddenException('El usuario no tiene tiendas disponibles');
    }
    if (contextos.length === 1) {
      return this.emitirAcceso(contextos[0]);
    }

    const payload: TokenSeleccionTienda = {
      sub: usuarioId,
      tokenType: 'CONTEXT_SELECTION',
    };
    return {
      requiresContextSelection: true,
      selectionToken: await this.jwt.signAsync(payload, {
        audience: JWT_TIENDA_SELECCION,
        expiresIn: CONTEXT_SELECTION_TOKEN_EXPIRES_IN,
      }),
      contexts: contextos.map(({ tenantId, tenantNombre }) => ({
        tenantId,
        tenantNombre,
      })),
    };
  }

  async selectContext({
    selectionToken,
    tenantId,
  }: SelectContextDto): Promise<AccesoTienda> {
    const payload = await this.verificarSeleccion(selectionToken);
    const [contexto] = await this.listarContextos(payload.sub, tenantId);
    if (!contexto) {
      throw new ForbiddenException('La tienda seleccionada no está disponible');
    }
    return this.emitirAcceso(contexto);
  }

  async validarAcceso(
    payload: Claims<TokenAccesoTienda>,
  ): Promise<ContextoTienda> {
    if (
      payload?.tokenType !== 'ACCESS' ||
      !esEnteroPositivo(payload.sub) ||
      !esEnteroPositivo(payload.tenantId) ||
      !esEnteroPositivo(payload.membresiaId) ||
      !esEnteroPositivo(payload.versionAutorizacion) ||
      typeof payload.exp !== 'number'
    ) {
      throw new UnauthorizedException('Token de acceso inválido');
    }

    const [contexto] = await this.listarContextos(
      payload.sub,
      payload.tenantId,
    );
    if (
      !contexto ||
      contexto.membresiaId !== payload.membresiaId ||
      contexto.versionAutorizacion !== payload.versionAutorizacion ||
      contexto.modoAutorizacion !== payload.modoAutorizacion
    ) {
      throw new UnauthorizedException('La sesión de Tienda ya no es válida');
    }
    return contexto;
  }

  private async verificarSeleccion(token: string) {
    const payload = await this.jwt
      .verifyAsync<Claims<TokenSeleccionTienda>>(token, {
        issuer: JWT_TIENDA_EMISOR,
        audience: JWT_TIENDA_SELECCION,
        algorithms: ['HS256'],
      })
      .catch(() => null);
    if (
      payload?.tokenType !== 'CONTEXT_SELECTION' ||
      !esEnteroPositivo(payload.sub) ||
      typeof payload.exp !== 'number'
    ) {
      throw new UnauthorizedException('Token de selección inválido o vencido');
    }
    return { sub: payload.sub };
  }

  private async listarContextos(
    usuarioId: number,
    tenantId?: number,
  ): Promise<ContextoTienda[]> {
    const membresias = await this.membresias.listarActivasPorModulo(
      usuarioId,
      'STORE',
      tenantId,
    );
    return membresias.flatMap((membresia) => {
      const modoAutorizacion = membresia.tenant.autorizacionVersion;
      const rolEfectivo =
        modoAutorizacion === 'LEGACY'
          ? { codigo: membresia.role, nombre: membresia.role }
          : membresia.asignacionRol_membresia[0]?.rol;
      if (!rolEfectivo) return [];

      return [
        {
          usuarioId,
          tenantId: membresia.tenantId,
          tenantNombre: membresia.tenant.nombre,
          membresiaId: membresia.id,
          versionAutorizacion: membresia.versionAutorizacion,
          modoAutorizacion,
          rolEfectivo,
        },
      ];
    });
  }

  private async emitirAcceso(context: ContextoTienda): Promise<AccesoTienda> {
    const {
      usuarioId,
      tenantId,
      membresiaId,
      versionAutorizacion,
      modoAutorizacion,
    } = context;
    const payload: TokenAccesoTienda = {
      sub: usuarioId,
      tokenType: 'ACCESS',
      tenantId,
      membresiaId,
      versionAutorizacion,
      modoAutorizacion,
    };
    return {
      requiresContextSelection: false,
      accessToken: await this.jwt.signAsync(payload, {
        audience: JWT_TIENDA_ACCESO,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      }),
      context,
    };
  }
}
