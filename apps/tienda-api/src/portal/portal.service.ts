import { randomUUID } from 'node:crypto';
import { IdentidadService } from '@app/identidad';
import { PrismaService } from '@app/prisma';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import { JWT_TIENDA_EMISOR } from '../auth/auth.config';
import type { ContextoTienda } from '../auth';
import { EmisionComprobanteService } from '../comprobantes/emision-comprobante.service';
import { conflictoUnicidad } from '../comun/operacion-tienda';
import type { LoginPortalDto } from './portal.dto';

const acceso = 'tienda-portal';
const pruebaCuenta = 'tienda-portal-vinculacion';
const tiendaActiva = {
  estado: 'ACTIVO',
  modules: { some: { module: 'STORE', activo: true } },
} as const;

export type ClientePortal = {
  tenantId: number;
  usuarioId: number;
  clienteComercialId: number;
  vinculacionId: number;
};

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identidad: IdentidadService,
    private readonly jwt: JwtService,
    private readonly comprobantes: EmisionComprobanteService,
  ) {}

  private async verificarCuenta(datos: LoginPortalDto) {
    const resultado = await this.identidad.verifyCredentials(
      datos.cedula.trim(),
      datos.password,
    );
    if (resultado.status !== 'valid')
      throw new UnauthorizedException('Credenciales inválidas');
    const tienda = await this.prisma.tenant.findFirst({
      where: { id: datos.tenantId, ...tiendaActiva },
      select: { id: true },
    });
    if (!tienda) throw new ForbiddenException('Tienda no disponible');
    return resultado.account.id;
  }

  async verificarParaVincular(datos: LoginPortalDto) {
    const sub = await this.verificarCuenta(datos);
    return {
      prueba: await this.jwt.signAsync(
        { sub, tenantId: datos.tenantId, jti: randomUUID() },
        {
          audience: pruebaCuenta,
          expiresIn: '10m',
        },
      ),
    };
  }

  async login(datos: LoginPortalDto) {
    const usuarioId = await this.verificarCuenta(datos);
    const vinculo = await this.prisma.vinculacionClienteUsuario.findFirst({
      where: {
        usuarioId,
        tenantId: datos.tenantId,
        revocadaAt: null,
        clienteComercial: { activo: true },
      },
    });
    if (!vinculo)
      throw new ForbiddenException(
        'La cuenta no está vinculada a un cliente activo',
      );
    const accessToken = await this.jwt.signAsync(
      {
        sub: usuarioId,
        tenantId: vinculo.tenantId,
        vinculo: vinculo.id,
      },
      { audience: acceso, expiresIn: '1d' },
    );
    return {
      accessToken,
      tenantId: vinculo.tenantId,
      clienteComercialId: vinculo.clienteComercialId,
    };
  }

  private async verificarToken(token: string, audience: string) {
    return this.jwt
      .verifyAsync<{
        sub: number;
        tenantId: number;
        vinculo?: number;
        jti?: string;
      }>(token, {
        issuer: JWT_TIENDA_EMISOR,
        audience,
        algorithms: ['HS256'],
      })
      .catch(() => {
        throw new UnauthorizedException('Token inválido o vencido');
      });
  }

  async autenticar(token: string): Promise<ClientePortal> {
    const {
      sub: usuarioId,
      tenantId,
      vinculo,
    } = await this.verificarToken(token, acceso);
    if (!Number.isInteger(vinculo))
      throw new UnauthorizedException('Sesión inválida');
    const vinculoActivo = await this.prisma.vinculacionClienteUsuario.findFirst(
      {
        where: {
          id: vinculo,
          usuarioId,
          tenantId,
          revocadaAt: null,
          tenant: tiendaActiva,
          clienteComercial: { activo: true },
        },
        select: { id: true, clienteComercialId: true },
      },
    );
    if (!vinculoActivo) throw new UnauthorizedException('Vinculación inactiva');
    return {
      usuarioId,
      tenantId,
      clienteComercialId: vinculoActivo.clienteComercialId,
      vinculacionId: vinculoActivo.id,
    };
  }

  async bloquearVinculo(tx: Prisma.TransactionClient, cliente: ClientePortal) {
    const { tenantId, clienteComercialId, vinculacionId, usuarioId } = cliente;
    const filas = await tx.$queryRaw<{ id: number }[]>`
      SELECT v.id FROM "VinculacionClienteUsuario" v
      JOIN "ClienteComercial" c ON c.id = v."clienteComercialId" AND c."tenantId" = v."tenantId"
      WHERE v.id = ${vinculacionId} AND v."tenantId" = ${tenantId} AND v."usuarioId" = ${usuarioId}
        AND v."clienteComercialId" = ${clienteComercialId} AND v."revocadaAt" IS NULL AND c.activo
      FOR UPDATE OF c, v
    `;
    if (!filas.length) throw new UnauthorizedException('Vinculación inactiva');
  }

  async vincular(
    staff: ContextoTienda,
    clienteComercialId: number,
    token: string,
  ) {
    const { tenantId } = staff;
    const prueba = await this.verificarToken(token, pruebaCuenta);
    if (prueba.tenantId !== tenantId || !prueba.jti)
      throw new ForbiddenException('La verificación pertenece a otra tienda');
    const correlacionId = prueba.jti;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cliente = await tx.clienteComercial.findFirst({
          where: { id: clienteComercialId, tenantId, activo: true },
          select: { clienteGym: { select: { usuarioId: true } } },
        });
        if (!cliente)
          throw new NotFoundException('Cliente comercial no encontrado');
        if (cliente.clienteGym && cliente.clienteGym.usuarioId !== prueba.sub) {
          throw new ConflictException(
            'La cuenta no coincide con el cliente de Gym',
          );
        }
        // El identificador firmado se conserva en auditoría para impedir que se reutilice tras revocar el vínculo.
        const usado = await tx.auditoriaOperacion.findFirst({
          where: { tenantId, correlacionId, accion: 'portal.vincular' },
          select: { id: true },
        });
        if (usado) throw new ConflictException('La verificación ya se usó');
        const vinculo = await tx.vinculacionClienteUsuario.create({
          data: {
            tenantId,
            clienteComercialId,
            usuarioId: prueba.sub,
            verificadorId: staff.membresiaId,
            verificadaAt: new Date(),
            metodo: 'PERSONAL_AUTORIZADO',
          },
        });
        await this.auditarVinculo(
          tx,
          staff,
          vinculo.id,
          'portal.vincular',
          correlacionId,
        );
        return { id: vinculo.id, clienteComercialId, usuarioId: prueba.sub };
      });
    } catch (error) {
      conflictoUnicidad(
        error,
        'El cliente o la cuenta ya tienen una vinculación activa',
      );
    }
  }

  async revocar(staff: ContextoTienda, clienteComercialId: number) {
    return this.prisma.$transaction(async (tx) => {
      const vinculo = await tx.vinculacionClienteUsuario.findFirst({
        where: {
          tenantId: staff.tenantId,
          clienteComercialId,
          revocadaAt: null,
        },
      });
      if (!vinculo)
        throw new NotFoundException('Vinculación activa no encontrada');
      const { count } = await tx.vinculacionClienteUsuario.updateMany({
        where: { id: vinculo.id, revocadaAt: null },
        data: {
          revocadaAt: new Date(),
          motivoRevocacion: 'Revocación por personal autorizado',
        },
      });
      if (!count) throw new ConflictException('La vinculación ya fue revocada');
      await this.auditarVinculo(
        tx,
        staff,
        vinculo.id,
        'portal.revocar',
        randomUUID(),
      );
    });
  }

  private auditarVinculo(
    tx: Prisma.TransactionClient,
    staff: ContextoTienda,
    entidadId: number,
    accion: string,
    correlacionId: string,
  ) {
    return tx.auditoriaOperacion.create({
      data: {
        tenantId: staff.tenantId,
        usuarioId: staff.usuarioId,
        membresiaId: staff.membresiaId,
        rolCodigo: staff.rolEfectivo.codigo,
        rolNombre: staff.rolEfectivo.nombre,
        actor: 'USUARIO',
        entidadTipo: 'VinculacionClienteUsuario',
        entidadId,
        accion,
        correlacionId,
      },
    });
  }

  async comprobante(cliente: ClientePortal, id: number) {
    const { tenantId, clienteComercialId } = cliente;
    const documento = await this.prisma.comprobanteVenta.findFirst({
      where: { tenantId, clienteComercialId, id },
      select: { id: true },
    });
    if (!documento) throw new NotFoundException('Comprobante no encontrado');
    return this.comprobantes.descargarPdf(tenantId, id);
  }

  async historial(cliente: ClientePortal, skip: number, take: number) {
    const { tenantId, clienteComercialId } = cliente;
    const where = { tenantId, clienteComercialId };
    const [ventas, comprobantes, cuentas, ficha] =
      await this.prisma.$transaction([
        this.prisma.venta.findMany({
          where,
          orderBy: { id: 'desc' },
          skip,
          take,
          select: {
            id: true,
            pedidoId: true,
            estado: true,
            total: true,
            fecha: true,
          },
        }),
        this.prisma.comprobanteVenta.findMany({
          where,
          orderBy: { id: 'desc' },
          skip,
          take,
          select: {
            id: true,
            ventaId: true,
            numero: true,
            estado: true,
            fechaEmision: true,
            total: true,
          },
        }),
        this.prisma.cuentaPorCobrar.findMany({
          where,
          orderBy: { id: 'desc' },
          skip,
          take,
          select: {
            id: true,
            ventaId: true,
            estado: true,
            saldo: true,
            vencimiento: true,
          },
        }),
        this.prisma.clienteComercial.findFirst({
          where: {
            tenantId,
            id: clienteComercialId,
            clienteGym: { usuarioId: cliente.usuarioId },
          },
          select: { clienteGymId: true },
        }),
      ]);
    const gym = ficha?.clienteGymId
      ? await this.historialGym(tenantId, ficha.clienteGymId, skip, take)
      : null;
    return { tienda: { ventas, comprobantes, cuentas }, gym };
  }

  private async historialGym(
    tenantId: number,
    clienteId: number,
    skip: number,
    take: number,
  ) {
    const [membresias, deudas] = await this.prisma.$transaction([
      this.prisma.clientePlan.findMany({
        where: { tenantId, clienteId },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.deuda.findMany({
        where: { tenantId, clientePlan: { tenantId, clienteId } },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);
    return { membresias, deudas };
  }
}
