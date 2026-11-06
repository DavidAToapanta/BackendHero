import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { DevolverFacturaDto } from './dto/devolver-factura.dto';

type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class FacturaService {
  constructor(private prisma: PrismaService) {}

  private async getScopedTenantId(tenantId?: number) {
    return resolveTenantIdOrDefault(this.prisma, tenantId);
  }

  private mapFacturaConDevolucion(factura: any) {
    const cambioPlan = factura?.clientePlan?.cambiosComoNuevo?.[0];
    const devolucionPendiente = Number(
      (cambioPlan?.devolucionPendiente ?? 0).toFixed(2),
    );
    const devolucionDevueltaAcumulada = Number(
      (cambioPlan?.devolucionDevueltaAcumulada ?? 0).toFixed(2),
    );
    const estadoDevolucion = cambioPlan?.estadoDevolucion ?? 'NO_APLICA';

    const { clientePlan, ...facturaBase } = factura;
    const { cambiosComoNuevo, ...clientePlanSinCambios } = clientePlan;

    return {
      ...facturaBase,
      clientePlan: clientePlanSinCambios,
      devolucionPendiente,
      devolucionDevueltaAcumulada,
      estadoDevolucion,
    };
  }

  async crearFactura(
    clientePlanId: number,
    options?: { creditoAplicado?: number },
    tx?: PrismaTx,
    tenantId?: number,
  ) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const db = tx ?? this.prisma;

    const clientePlan = await db.clientePlan.findFirst({
      where: { id: clientePlanId, tenantId: scopedTenantId },
      include: {
        plan: true,
      },
    });

    if (!clientePlan) {
      throw new Error('ClientePlan no encontrado');
    }

    const IVA = 0.12;
    const total = clientePlan.plan.precio;
    const subtotal = Number((total / (1 + IVA)).toFixed(2));
    const iva = Number((total - subtotal).toFixed(2));
    const creditoAplicado = Number((options?.creditoAplicado ?? 0).toFixed(2));
    const totalPagado = 0;
    const saldo = Number(Math.max(total - creditoAplicado, 0).toFixed(2));
    const fecha = new Date();
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    const numeroFactura = `FAC-${yyyy}${mm}${dd}-${random}`;

    return db.factura.create({
      data: {
        tenantId: scopedTenantId,
        numero: numeroFactura,
        clientePlanId: clientePlan.id,
        subtotal,
        iva,
        total,
        totalPagado,
        creditoAplicado,
        saldo,
        estado: saldo <= 0.01 ? 'PAGADA' : 'PENDIENTE',
      },
    });
  }

  async anularFactura(clientePlanId: number, tx?: PrismaTx, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const db = tx ?? this.prisma;

    const factura = await db.factura.findFirst({
      where: {
        tenantId: scopedTenantId,
        clientePlanId,
        estado: { not: 'ANULADA' },
      },
    });

    if (!factura) {
      return null;
    }

    return db.factura.update({
      where: { id: factura.id },
      data: { estado: 'ANULADA' },
    });
  }

  async aplicarPago(
    clientePlanId: number,
    monto: number,
    tx?: PrismaTx,
    tenantId?: number,
  ) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const db = tx ?? this.prisma;

    const factura = await db.factura.findFirst({
      where: {
        tenantId: scopedTenantId,
        clientePlanId,
        estado: { not: 'ANULADA' },
      },
    });

    if (!factura) {
      throw new Error('Factura no encontrada para este plan');
    }

    if (monto > factura.saldo) {
      throw new Error(
        `El monto a pagar ($${monto}) excede el saldo pendiente ($${factura.saldo}). No se puede pagar de mas.`,
      );
    }

    const nuevoTotalPagado = Number((factura.totalPagado + monto).toFixed(2));
    const nuevoSaldo = Number(
      (factura.total - factura.creditoAplicado - nuevoTotalPagado).toFixed(2),
    );
    const nuevoEstado = nuevoSaldo <= 0.01 ? 'PAGADA' : 'PENDIENTE';

    return db.factura.update({
      where: { id: factura.id },
      data: {
        totalPagado: nuevoTotalPagado,
        saldo: Math.max(nuevoSaldo, 0),
        estado: nuevoEstado,
      },
    });
  }

  async findAll(
    filters?: {
      estado?: string;
      clienteId?: number;
      cedula?: string;
      desde?: string;
      hasta?: string;
    },
    page = 1,
    limit = 10,
    tenantId?: number,
  ) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const where: Prisma.FacturaWhereInput = {
      tenantId: scopedTenantId,
    };

    if (filters?.estado) {
      where.estado = filters.estado as any;
    }

    if (filters?.clienteId) {
      where.clientePlan = {
        tenantId: scopedTenantId,
        clienteId: filters.clienteId,
      };
    }

    if (filters?.cedula) {
      where.clientePlan = {
        ...(where.clientePlan || {}),
        tenantId: scopedTenantId,
        cliente: {
          tenantId: scopedTenantId,
          usuario: {
            cedula: {
              contains: filters.cedula,
            },
          },
        },
      } as any;
    }

    if (filters?.desde || filters?.hasta) {
      where.fechaEmision = {};
      if (filters.desde) {
        where.fechaEmision.gte = new Date(filters.desde);
      }
      if (filters.hasta) {
        where.fechaEmision.lte = new Date(filters.hasta);
      }
    }

    const take = Math.max(1, Math.min(limit, 50));
    const currentPage = Math.max(1, page);
    const skip = (currentPage - 1) * take;

    const [totalItems, facturas] = await Promise.all([
      this.prisma.factura.count({ where }),
      this.prisma.factura.findMany({
        where,
        skip,
        take,
        orderBy: { fechaEmision: 'desc' },
        include: {
          clientePlan: {
            include: {
              cliente: {
                include: {
                  usuario: {
                    select: { nombres: true, apellidos: true, cedula: true },
                  },
                },
              },
              plan: { select: { nombre: true, precio: true } },
              cambiosComoNuevo: {
                where: {
                  tenantId: scopedTenantId,
                },
                take: 1,
                orderBy: { id: 'desc' },
                select: {
                  devolucionPendiente: true,
                  devolucionDevueltaAcumulada: true,
                  estadoDevolucion: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const data = facturas.map((factura) =>
      this.mapFacturaConDevolucion(factura),
    );

    return {
      data,
      meta: {
        totalItems,
        itemCount: data.length,
        perPage: take,
        totalPages: Math.ceil(totalItems / take),
        currentPage,
      },
    };
  }

  async devolver(
    facturaId: number,
    dto: DevolverFacturaDto,
    tenantId?: number,
  ) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const monto = Number(dto.monto);

    if (!Number.isFinite(monto) || monto <= 0) {
      throw new BadRequestException('El monto a devolver debe ser mayor a 0');
    }

    const montoADevolver = Number(monto.toFixed(2));

    return this.prisma.$transaction(async (tx) => {
      const factura = await tx.factura.findFirst({
        where: { id: facturaId, tenantId: scopedTenantId },
        select: { id: true, clientePlanId: true },
      });

      if (!factura) {
        throw new NotFoundException('Factura no encontrada');
      }

      const cambioPlan = await tx.cambioPlan.findFirst({
        where: {
          tenantId: scopedTenantId,
          clientePlanNuevoId: factura.clientePlanId,
        },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          devolucionPendiente: true,
          devolucionDevueltaAcumulada: true,
          estadoDevolucion: true,
        },
      });

      if (!cambioPlan) {
        throw new BadRequestException(
          'La factura no tiene una devolucion asociada por cambio de plan',
        );
      }

      if (
        !['PENDIENTE', 'PARCIAL'].includes(cambioPlan.estadoDevolucion) ||
        cambioPlan.devolucionPendiente <= 0
      ) {
        throw new BadRequestException(
          'No existe devolucion pendiente para esta factura',
        );
      }

      if (montoADevolver > cambioPlan.devolucionPendiente) {
        throw new BadRequestException(
          `El monto a devolver ($${montoADevolver}) excede la devolucion pendiente ($${cambioPlan.devolucionPendiente})`,
        );
      }

      await tx.devolucionMovimiento.create({
        data: {
          tenantId: scopedTenantId,
          cambioPlanId: cambioPlan.id,
          facturaId: factura.id,
          monto: montoADevolver,
          motivo: dto.motivo ?? null,
        },
      });

      const pendienteCalculado = Number(
        (cambioPlan.devolucionPendiente - montoADevolver).toFixed(2),
      );
      const devolucionPendiente =
        pendienteCalculado <= 0.009 ? 0 : pendienteCalculado;
      const devolucionDevueltaAcumulada = Number(
        (cambioPlan.devolucionDevueltaAcumulada + montoADevolver).toFixed(2),
      );
      const estadoDevolucion =
        devolucionPendiente === 0 ? 'COMPLETADO' : 'PARCIAL';

      const cambioActualizado = await tx.cambioPlan.update({
        where: { id: cambioPlan.id },
        data: {
          devolucionPendiente,
          devolucionDevueltaAcumulada,
          estadoDevolucion,
        },
      });

      return {
        facturaId: factura.id,
        cambioPlanId: cambioActualizado.id,
        devolucionPendiente: cambioActualizado.devolucionPendiente,
        devolucionDevueltaAcumulada:
          cambioActualizado.devolucionDevueltaAcumulada,
        estadoDevolucion: cambioActualizado.estadoDevolucion,
      };
    });
  }

  async getResumen(tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const totalFacturas = await this.prisma.factura.count({
      where: { tenantId: scopedTenantId },
    });

    const facturasPagadas = await this.prisma.factura.count({
      where: { tenantId: scopedTenantId, estado: 'PAGADA' },
    });

    const pendientesGroup = await this.prisma.factura.groupBy({
      by: ['clientePlanId'],
      where: { tenantId: scopedTenantId, estado: 'PENDIENTE' },
    });
    const personasPendientes = pendientesGroup.length;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [ingresoMesResult, ingresosRapidosResult] = await Promise.all([
      this.prisma.factura.aggregate({
        _sum: {
          totalPagado: true,
        },
        where: {
          tenantId: scopedTenantId,
          fechaEmision: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
      }),
      (this.prisma as any).ingresoRapido.aggregate({
        _sum: {
          monto: true,
        },
        where: {
          tenantId: scopedTenantId,
          fecha: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
      }),
    ]);

    return {
      totalFacturas,
      facturasPagadas,
      personasPendientes,
      ingresoMes:
        (ingresoMesResult._sum.totalPagado || 0) +
        (ingresosRapidosResult._sum.monto || 0),
    };
  }

  async findOne(id: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const factura = await this.prisma.factura.findFirst({
      where: { id, tenantId: scopedTenantId },
      include: {
        clientePlan: {
          include: {
            cliente: {
              include: {
                usuario: { select: { nombres: true, apellidos: true } },
              },
            },
            plan: { select: { nombre: true, precio: true } },
            cambiosComoNuevo: {
              where: {
                tenantId: scopedTenantId,
              },
              take: 1,
              orderBy: { id: 'desc' },
              select: {
                devolucionPendiente: true,
                devolucionDevueltaAcumulada: true,
                estadoDevolucion: true,
              },
            },
          },
        },
      },
    });

    if (!factura) {
      throw new NotFoundException('Factura no encontrada');
    }

    return this.mapFacturaConDevolucion(factura);
  }
}
