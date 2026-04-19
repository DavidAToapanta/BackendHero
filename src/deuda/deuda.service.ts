import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateDeudaDto } from './dto/create-deuda.dto';
import { UpdateDeudaDto } from './dto/update-deuda.dto';

@Injectable()
export class DeudaService {
  constructor(private prisma: PrismaService) {}

  private async getScopedTenantId(tenantId?: number) {
    return resolveTenantIdOrDefault(this.prisma, tenantId);
  }

  private async findDeudaOrThrow(id: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const deuda = await this.prisma.deuda.findFirst({
      where: { id, tenantId: scopedTenantId },
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
            plan: {
              select: { nombre: true },
            },
          },
        },
      },
    });

    if (!deuda) {
      throw new NotFoundException('Deuda no encontrada');
    }

    return { deuda, tenantId: scopedTenantId };
  }

  async create(dto: CreateDeudaDto, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const clientePlan = await this.prisma.clientePlan.findFirst({
      where: { id: dto.clientePlanId, tenantId: scopedTenantId },
      select: { id: true },
    });

    if (!clientePlan) {
      throw new NotFoundException('ClientePlan no encontrado');
    }

    return this.prisma.deuda.create({
      data: {
        tenantId: scopedTenantId,
        clientePlanId: dto.clientePlanId,
        monto: dto.monto,
        solventada: dto.solventada,
      },
    });
  }

  async findAll(tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    return this.prisma.deuda.findMany({
      where: { tenantId: scopedTenantId },
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
            plan: {
              select: { nombre: true },
            },
          },
        },
      },
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number, tenantId?: number) {
    const { deuda } = await this.findDeudaOrThrow(id, tenantId);
    return deuda;
  }

  async update(id: number, dto: UpdateDeudaDto, tenantId?: number) {
    const { deuda, tenantId: scopedTenantId } = await this.findDeudaOrThrow(
      id,
      tenantId,
    );

    if (
      dto.clientePlanId !== undefined &&
      dto.clientePlanId !== deuda.clientePlanId
    ) {
      const clientePlan = await this.prisma.clientePlan.findFirst({
        where: { id: dto.clientePlanId, tenantId: scopedTenantId },
        select: { id: true },
      });

      if (!clientePlan) {
        throw new NotFoundException('ClientePlan no encontrado');
      }
    }

    return this.prisma.deuda.update({
      where: { id },
      data: {
        ...(dto.monto !== undefined && { monto: dto.monto }),
        ...(dto.solventada !== undefined && { solventada: dto.solventada }),
        ...(dto.clientePlanId !== undefined && {
          clientePlanId: dto.clientePlanId,
        }),
      },
    });
  }

  async remove(id: number, tenantId?: number) {
    const { deuda } = await this.findDeudaOrThrow(id, tenantId);
    return this.prisma.deuda.delete({ where: { id: deuda.id } });
  }

  async countDeudoresUnicos(tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const total = await this.prisma.cliente.count({
      where: {
        tenantId: scopedTenantId,
        planes: {
          some: {
            tenantId: scopedTenantId,
            deudas: {
              some: { tenantId: scopedTenantId, solventada: false },
            },
          },
        },
      },
    });
    return { total };
  }

  async getDeudoresUnicos(tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    return this.prisma.cliente.findMany({
      where: {
        tenantId: scopedTenantId,
        planes: {
          some: {
            tenantId: scopedTenantId,
            deudas: {
              some: {
                tenantId: scopedTenantId,
                solventada: false,
              },
            },
          },
        },
      },
      select: {
        id: true,
        tenantId: true,
        usuario: {
          select: {
            nombres: true,
            apellidos: true,
            cedula: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });
  }
}
