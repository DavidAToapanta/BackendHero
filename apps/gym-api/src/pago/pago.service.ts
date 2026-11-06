import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { FacturaService } from 'src/factura/factura.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreatePagoDto } from './dto/create-pago.dto';
import { UpdatePagoDto } from './dto/update-pago.dto';

type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class PagoService {
  constructor(
    private prisma: PrismaService,
    private facturaService: FacturaService,
  ) {}

  private async getScopedTenantId(tenantId?: number) {
    return resolveTenantIdOrDefault(this.prisma, tenantId);
  }

  private async findPagoOrThrow(id: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const pago = await this.prisma.pago.findFirst({
      where: { id, tenantId: scopedTenantId },
      include: {
        clientePlan: {
          include: {
            plan: true,
            cliente: {
              include: {
                usuario: {
                  select: { nombres: true, apellidos: true, cedula: true },
                },
              },
            },
          },
        },
      },
    });

    if (!pago) {
      throw new NotFoundException('Pago no encontrado');
    }

    return { pago, tenantId: scopedTenantId };
  }

  async create(dto: CreatePagoDto, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);

    return this.prisma.$transaction(async (tx) => {
      const clientePlan = await tx.clientePlan.findFirst({
        where: { id: dto.clientePlanId, tenantId: scopedTenantId },
        include: {
          plan: true,
          pago: {
            where: { tenantId: scopedTenantId },
          },
        },
      });

      if (!clientePlan) {
        throw new NotFoundException('ClientePlan no encontrado');
      }

      const montoPagado = Number(dto.monto);

      const pago = await tx.pago.create({
        data: {
          tenantId: scopedTenantId,
          clientePlanId: dto.clientePlanId,
          monto: montoPagado,
          fecha: new Date(dto.fecha),
        },
      });

      const facturaActualizada = await this.facturaService.aplicarPago(
        dto.clientePlanId,
        montoPagado,
        tx,
        scopedTenantId,
      );

      await tx.deuda.deleteMany({
        where: {
          tenantId: scopedTenantId,
          clientePlanId: dto.clientePlanId,
          solventada: false,
        },
      });

      const saldoPendiente = Number(facturaActualizada.saldo ?? 0);

      if (saldoPendiente > 0.01) {
        await tx.deuda.create({
          data: {
            tenantId: scopedTenantId,
            clientePlanId: dto.clientePlanId,
            monto: saldoPendiente,
            solventada: false,
          },
        });
      }

      return pago;
    });
  }

  async findAll(page = 1, limit = 10, search?: string, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const take = Math.max(1, Math.min(limit, 50));
    const currentPage = Math.max(1, page);
    const skip = (currentPage - 1) * take;
    const trimmedSearch = search?.trim();

    const where: Prisma.PagoWhereInput = {
      tenantId: scopedTenantId,
      ...(trimmedSearch
        ? {
            OR: [
              {
                clientePlan: {
                  cliente: {
                    usuario: {
                      nombres: {
                        contains: trimmedSearch,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
              {
                clientePlan: {
                  cliente: {
                    usuario: {
                      apellidos: {
                        contains: trimmedSearch,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
              {
                clientePlan: {
                  cliente: {
                    usuario: {
                      cedula: {
                        contains: trimmedSearch,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
              {
                clientePlan: {
                  plan: {
                    nombre: {
                      contains: trimmedSearch,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [totalItems, pagos] = await Promise.all([
      this.prisma.pago.count({ where }),
      this.prisma.pago.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          tenantId: true,
          monto: true,
          fecha: true,
          clientePlan: {
            select: {
              id: true,
              clienteId: true,
              plan: { select: { nombre: true } },
              cliente: {
                select: {
                  usuario: { select: { nombres: true, apellidos: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: pagos,
      meta: {
        totalItems,
        itemCount: pagos.length,
        perPage: take,
        totalPages: Math.ceil(totalItems / take),
        currentPage,
      },
    };
  }

  async findOne(id: number, tenantId?: number) {
    const { pago } = await this.findPagoOrThrow(id, tenantId);
    return pago;
  }

  async update(id: number, dto: UpdatePagoDto, tenantId?: number) {
    const { pago, tenantId: scopedTenantId } = await this.findPagoOrThrow(
      id,
      tenantId,
    );

    if (
      dto.clientePlanId !== undefined &&
      dto.clientePlanId !== pago.clientePlanId
    ) {
      const clientePlan = await this.prisma.clientePlan.findFirst({
        where: { id: dto.clientePlanId, tenantId: scopedTenantId },
        select: { id: true },
      });

      if (!clientePlan) {
        throw new NotFoundException('ClientePlan no encontrado');
      }
    }

    return this.prisma.pago.update({
      where: { id },
      data: {
        ...(dto.monto !== undefined && { monto: dto.monto }),
        ...(dto.fecha && { fecha: new Date(dto.fecha) }),
        ...(dto.clientePlanId !== undefined && {
          clientePlan: { connect: { id: dto.clientePlanId } },
        }),
      },
    });
  }

  async remove(id: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);

    return this.prisma.$transaction(async (tx) => {
      const pago = await tx.pago.findFirst({
        where: { id, tenantId: scopedTenantId },
        include: {
          clientePlan: {
            include: {
              plan: true,
            },
          },
        },
      });

      if (!pago) {
        throw new NotFoundException('Pago no encontrado');
      }

      const montoEliminado = Number(pago.monto);
      const clientePlanId = pago.clientePlanId;

      await tx.pago.delete({ where: { id: pago.id } });

      const factura = await tx.factura.findFirst({
        where: {
          tenantId: scopedTenantId,
          clientePlanId,
          estado: { not: 'ANULADA' },
        },
      });

      if (!factura) {
        return pago;
      }

      const nuevoTotalPagado = Number(
        (factura.totalPagado - montoEliminado).toFixed(2),
      );
      const nuevoSaldo = Number((factura.saldo + montoEliminado).toFixed(2));
      const nuevoEstado = nuevoSaldo > 0.01 ? 'PENDIENTE' : 'PAGADA';

      await tx.factura.update({
        where: { id: factura.id },
        data: {
          totalPagado: nuevoTotalPagado,
          saldo: nuevoSaldo,
          estado: nuevoEstado,
        },
      });

      await tx.deuda.deleteMany({
        where: {
          tenantId: scopedTenantId,
          clientePlanId,
          solventada: false,
        },
      });

      if (nuevoSaldo > 0.01) {
        await tx.deuda.create({
          data: {
            tenantId: scopedTenantId,
            clientePlanId,
            monto: nuevoSaldo,
            solventada: false,
          },
        });
      }

      return pago;
    });
  }

  async obtenerIngresoDelMes(tenantId?: number): Promise<number> {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);

    const [pagos, ingresosRapidos] = await Promise.all([
      this.prisma.pago.aggregate({
        _sum: {
          monto: true,
        },
        where: {
          tenantId: scopedTenantId,
          fecha: {
            gte: inicioMes,
            lte: finMes,
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
            gte: inicioMes,
            lte: finMes,
          },
        },
      }),
    ]);

    return (pagos._sum.monto ?? 0) + (ingresosRapidos._sum.monto ?? 0);
  }
}
