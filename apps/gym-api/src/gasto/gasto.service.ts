import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';

@Injectable()
export class GastoService {
  constructor(private prisma: PrismaService) {}

  private async getScopedTenantId(tenantId?: number) {
    return resolveTenantIdOrDefault(this.prisma, tenantId);
  }

  private async findGastoOrThrow(id: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const gasto = await this.prisma.gasto.findFirst({
      where: { id, tenantId: scopedTenantId },
    });

    if (!gasto) {
      throw new NotFoundException('Gasto no encontrado');
    }

    return { gasto, tenantId: scopedTenantId };
  }

  async create(dto: CreateGastoDto, usuarioId: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    return this.prisma.gasto.create({
      data: {
        tenantId: scopedTenantId,
        descripcion: dto.descripcion,
        monto: dto.monto,
        usuarioId,
      },
    });
  }

  async findAll(tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    return this.prisma.gasto.findMany({
      where: { tenantId: scopedTenantId },
      orderBy: { fecha: 'desc' },
    });
  }

  async findOne(id: number, tenantId?: number) {
    const { gasto } = await this.findGastoOrThrow(id, tenantId);
    return gasto;
  }

  async update(id: number, dto: UpdateGastoDto, tenantId?: number) {
    await this.findGastoOrThrow(id, tenantId);
    return this.prisma.gasto.update({ where: { id }, data: dto });
  }

  async remove(id: number, tenantId?: number) {
    await this.findGastoOrThrow(id, tenantId);
    return this.prisma.gasto.delete({ where: { id } });
  }
}
