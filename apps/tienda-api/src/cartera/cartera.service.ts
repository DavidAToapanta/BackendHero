import { PrismaService } from '@app/prisma';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fechaComercial, inicioFechaComercial } from '../comun/fecha-comercial';
import { paginacion } from '../comun/operacion-tienda';

const milisegundosPorDia = 86_400_000;

@Injectable()
export class CarteraService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(tenantId: number, id: number) {
    const cuenta = await this.prisma.cuentaPorCobrar.findUnique({
      where: { tenantId_id: { tenantId, id } },
      include: {
        aplicacionCobro_cuenta: {
          orderBy: { id: 'asc' },
          omit: { claveIdempotencia: true },
          include: {
            reversionAplicacionCobro_aplicacion: {
              omit: { claveIdempotencia: true },
            },
            cobro: { select: { estado: true, metodo: true, fecha: true } },
          },
        },
        ajusteCuentaPorCobrar_cuenta: {
          orderBy: { id: 'asc' },
          omit: { claveIdempotencia: true },
        },
      },
    });
    if (!cuenta) throw new NotFoundException('Cuenta por cobrar no encontrada');
    const hoy = inicioFechaComercial(fechaComercial(new Date()));
    const vence = inicioFechaComercial(fechaComercial(cuenta.vencimiento));
    const diasMora =
      cuenta.estado === 'ABIERTA'
        ? Math.max(
            0,
            Math.round((hoy.getTime() - vence.getTime()) / milisegundosPorDia),
          )
        : 0;
    return { ...cuenta, diasMora };
  }

  listarPendientes(
    tenantId: number,
    filtros: {
      clienteComercialId?: number;
      vencida?: boolean;
      hasta?: string;
      pagina?: number;
      limite?: number;
    } = {},
  ) {
    const hoy = inicioFechaComercial(fechaComercial(new Date()));
    const hastaExclusivo = filtros.hasta
      ? new Date(
          inicioFechaComercial(filtros.hasta).getTime() + milisegundosPorDia,
        )
      : undefined;
    const vencimiento: Prisma.DateTimeFilter = {
      gte: filtros.vencida === false ? hoy : undefined,
      lt:
        filtros.vencida === true && (!hastaExclusivo || hoy < hastaExclusivo)
          ? hoy
          : hastaExclusivo,
    };
    return this.prisma.cuentaPorCobrar.findMany({
      where: {
        tenantId,
        estado: 'ABIERTA',
        saldo: { gt: 0 },
        clienteComercialId: filtros.clienteComercialId,
        vencimiento,
      },
      orderBy: [{ vencimiento: 'asc' }, { id: 'asc' }],
      ...paginacion(filtros.pagina, filtros.limite),
    });
  }

  async listarDeudores(tenantId: number, pagina?: number, limite?: number) {
    const deudores = await this.prisma.cuentaPorCobrar.groupBy({
      by: ['clienteComercialId'],
      where: { tenantId, estado: 'ABIERTA', saldo: { gt: 0 } },
      _sum: { saldo: true },
      orderBy: [{ _sum: { saldo: 'desc' } }, { clienteComercialId: 'asc' }],
      ...paginacion(pagina, limite),
    });
    return deudores.map(({ clienteComercialId, _sum }) => ({
      clienteComercialId,
      saldoPendiente: _sum.saldo,
    }));
  }

  async resumen(tenantId: number, clienteComercialId?: number) {
    const hoy = inicioFechaComercial(fechaComercial(new Date()));
    const pendiente = {
      tenantId,
      clienteComercialId,
      estado: 'ABIERTA' as const,
      saldo: { gt: 0 },
    };
    const [vigente, vencida] = await this.prisma.$transaction(
      [
        this.prisma.cuentaPorCobrar.aggregate({
          where: { ...pendiente, vencimiento: { gte: hoy } },
          _sum: { saldo: true },
        }),
        this.prisma.cuentaPorCobrar.aggregate({
          where: { ...pendiente, vencimiento: { lt: hoy } },
          _sum: { saldo: true },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const saldoVigente = vigente._sum.saldo ?? new Prisma.Decimal(0);
    const saldoVencido = vencida._sum.saldo ?? new Prisma.Decimal(0);
    return {
      saldoVigente,
      saldoVencido,
      saldoPendiente: saldoVigente.plus(saldoVencido),
    };
  }
}
