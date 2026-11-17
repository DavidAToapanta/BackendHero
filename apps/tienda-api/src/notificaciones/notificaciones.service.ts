import { randomUUID } from 'node:crypto';
import type { ContextoTienda } from '../auth';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import { PrismaService } from '@app/prisma';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { EstadoPedido, type EventoSalida, type Prisma } from '@prisma/client';
import type { ClientePortal } from '../portal/portal.service';

const vista = {
  id: true,
  tipo: true,
  titulo: true,
  mensaje: true,
  pedidoId: true,
  comprobanteId: true,
  cuentaId: true,
  createdAt: true,
  leidaAt: true,
} satisfies Prisma.NotificacionClienteSelect;
const tipos = [
  'ESTADO_PEDIDO',
  'COMPROBANTE_DISPONIBLE',
  'RECORDATORIO_DEUDA',
] as const;
const estados = {
  CONFIRMADO: 'Tu pedido fue confirmado.',
  EN_PREPARACION: 'Tu pedido está en preparación.',
  ENTREGADO: 'Tu pedido fue entregado.',
  CANCELADO: 'Tu pedido fue cancelado.',
  EXPIRADO: 'La reserva de tu pedido venció.',
} satisfies Record<EstadoPedido, string>;

@Injectable()
export class NotificacionesService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificacionesService.name);
  private timer?: NodeJS.Timeout;
  private trabajo?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencia: IdempotenciaService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      this.trabajo ??= this.procesarPendientes()
        .catch((error: unknown) =>
          this.logger.error('Falló el procesamiento de avisos', error),
        )
        .finally(() => {
          this.trabajo = undefined;
        });
    }, 2_000).unref();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.trabajo;
  }

  listar(
    { tenantId, clienteComercialId, vinculacionId }: ClientePortal,
    skip: number,
    take: number,
  ) {
    return this.prisma.notificacionCliente.findMany({
      where: { tenantId, clienteComercialId, vinculacionId },
      select: vista,
      orderBy: { id: 'desc' },
      skip,
      take,
    });
  }

  async obtener(
    { tenantId, clienteComercialId, vinculacionId }: ClientePortal,
    id: number,
  ) {
    const aviso = await this.prisma.notificacionCliente.findFirst({
      where: { tenantId, clienteComercialId, vinculacionId, id },
      select: vista,
    });
    if (!aviso) throw new NotFoundException('Aviso no encontrado');
    return aviso;
  }

  async marcarLeida(cliente: ClientePortal, id: number) {
    const { tenantId, clienteComercialId, vinculacionId } = cliente;
    await this.prisma.notificacionCliente.updateMany({
      where: { tenantId, clienteComercialId, vinculacionId, id, leidaAt: null },
      data: { leidaAt: new Date() },
    });
    return this.obtener(cliente, id);
  }

  recordar(staff: ContextoTienda, id: number, clave: string | undefined) {
    const { tenantId, usuarioId, membresiaId, rolEfectivo } = staff;
    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'cartera.recordar',
        datos: { id },
      },
      async (tx) => {
        const cuenta = await tx.cuentaPorCobrar.findFirst({
          where: { tenantId, id },
          select: { estado: true, clienteComercialId: true },
        });
        if (!cuenta)
          throw new NotFoundException('Cuenta por cobrar no encontrada');
        if (cuenta.estado !== 'ABIERTA')
          throw new ConflictException('La cuenta ya no tiene saldo pendiente');
        const { clienteComercialId } = cuenta;
        const vinculo = await tx.vinculacionClienteUsuario.findFirst({
          where: {
            tenantId,
            clienteComercialId,
            revocadaAt: null,
            clienteComercial: { activo: true },
          },
          select: { id: true },
        });
        if (!vinculo)
          throw new ConflictException(
            'El cliente no tiene una cuenta de portal activa',
          );
        const evento = await tx.eventoSalida.create({
          data: {
            tenantId,
            tipo: 'RECORDATORIO_DEUDA',
            entidadTipo: 'CuentaPorCobrar',
            entidadId: id,
            payload: { clienteComercialId },
          },
        });
        await tx.auditoriaOperacion.create({
          data: {
            tenantId,
            usuarioId,
            membresiaId,
            actor: 'USUARIO',
            rolCodigo: rolEfectivo.codigo,
            rolNombre: rolEfectivo.nombre,
            accion: 'cartera.recordar',
            entidadTipo: 'CuentaPorCobrar',
            entidadId: id,
            correlacionId: randomUUID(),
          },
        });
        return { recursoTipo: 'EventoSalida', recursoId: evento.id };
      },
    );
  }

  async procesarPendientes() {
    const candidatos = await this.prisma.eventoSalida.findMany({
      where: {
        tipo: { in: [...tipos] },
        estado: 'PENDIENTE',
        proximoIntentoAt: { lte: new Date() },
      },
      orderBy: [{ proximoIntentoAt: 'asc' }, { id: 'asc' }],
      take: 50,
      select: { id: true, intentos: true },
    });
    for (const candidato of candidatos) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const [fila] = await tx.$queryRaw<{ id: number }[]>`
            SELECT id FROM "EventoSalida" WHERE id = ${candidato.id}
              AND estado = 'PENDIENTE' AND "proximoIntentoAt" <= now()
            FOR UPDATE SKIP LOCKED
          `;
          if (!fila) return;
          const evento = await tx.eventoSalida.findUniqueOrThrow({
            where: { id: fila.id },
          });
          await this.materializar(tx, evento);
          await tx.eventoSalida.update({
            where: { id: evento.id },
            data: {
              estado: 'ENVIADO',
              enviadoAt: new Date(),
              intentos: { increment: 1 },
              ultimoError: null,
            },
          });
        });
      } catch (error) {
        const intentos = candidato.intentos + 1;
        await this.prisma.eventoSalida.updateMany({
          where: {
            id: candidato.id,
            estado: 'PENDIENTE',
            intentos: candidato.intentos,
          },
          data: {
            intentos,
            estado: intentos >= 8 ? 'FALLIDO' : 'PENDIENTE',
            proximoIntentoAt: new Date(Date.now() + 1000 * 2 ** intentos),
            ultimoError: error instanceof Error ? error.name : 'Error',
          },
        });
      }
    }
  }

  private async materializar(
    tx: Prisma.TransactionClient,
    evento: EventoSalida,
  ) {
    const { tenantId, entidadId, payload } = evento;
    const tipo = tipos.find((valor) => valor === evento.tipo);
    if (
      !tipo ||
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    )
      throw new Error('Evento inválido');
    const clienteComercialId = payload.clienteComercialId;
    if (
      typeof clienteComercialId !== 'number' ||
      !Number.isInteger(clienteComercialId)
    )
      throw new Error('Destinatario inválido');
    const vinculo = await tx.vinculacionClienteUsuario.findFirst({
      where: {
        tenantId,
        clienteComercialId,
        revocadaAt: null,
        verificadaAt: { lte: evento.createdAt },
        clienteComercial: { activo: true },
      },
      select: { id: true },
    });
    if (!vinculo) return;
    let contenido: {
      titulo: string;
      mensaje: string;
      pedidoId?: number;
      comprobanteId?: number;
      cuentaId?: number;
    };
    switch (tipo) {
      case 'ESTADO_PEDIDO': {
        const estado = Object.values(EstadoPedido).find(
          (valor) => valor === payload.estado,
        );
        if (!estado) throw new Error('Estado de pedido inválido');
        contenido = {
          titulo: 'Estado del pedido',
          mensaje: estados[estado],
          pedidoId: entidadId,
        };
        break;
      }
      case 'COMPROBANTE_DISPONIBLE':
        contenido = {
          titulo: 'Comprobante disponible',
          mensaje: 'Ya puedes consultar tu comprobante.',
          comprobanteId: entidadId,
        };
        break;
      case 'RECORDATORIO_DEUDA': {
        const cuenta = await tx.cuentaPorCobrar.findFirst({
          where: {
            id: entidadId,
            tenantId,
            clienteComercialId,
            estado: 'ABIERTA',
          },
          select: { id: true },
        });
        if (!cuenta) return;
        contenido = {
          titulo: 'Saldo pendiente',
          mensaje: 'Consulta el saldo en el historial de tu cuenta.',
          cuentaId: entidadId,
        };
        break;
      }
    }
    await tx.notificacionCliente.createMany({
      data: {
        ...contenido,
        tipo,
        tenantId,
        clienteComercialId,
        eventoId: evento.id,
        vinculacionId: vinculo.id,
      },
      skipDuplicates: true,
    });
  }
}
