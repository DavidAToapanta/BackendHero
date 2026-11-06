import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateIngresoRapidoDto } from './dto/create-ingreso-rapido.dto';
import { UpdateIngresoRapidoDto } from './dto/update-ingreso-rapido.dto';

@Injectable()
export class IngresoRapidoService {
  constructor(private readonly prisma: PrismaService) {}

  private get ingresoRapidoRepo() {
    return (this.prisma as any).ingresoRapido;
  }

  private async getScopedTenantId(tenantId?: number) {
    return resolveTenantIdOrDefault(this.prisma, tenantId);
  }

  private async findIngresoOrThrow(id: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const ingreso = await this.ingresoRapidoRepo.findFirst({
      where: { id, tenantId: scopedTenantId },
    });

    if (!ingreso) {
      throw new NotFoundException('Ingreso rapido no encontrado');
    }

    return { ingreso, tenantId: scopedTenantId };
  }

  async create(dto: CreateIngresoRapidoDto, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    return this.ingresoRapidoRepo.create({
      data: {
        tenantId: scopedTenantId,
        concepto: dto.concepto.trim(),
        monto: dto.monto,
      },
    });
  }

  async findAll(tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    return this.ingresoRapidoRepo.findMany({
      where: { tenantId: scopedTenantId },
      orderBy: { fecha: 'desc' },
    });
  }

  async findOne(id: number, tenantId?: number) {
    const { ingreso } = await this.findIngresoOrThrow(id, tenantId);
    return ingreso;
  }

  async update(id: number, dto: UpdateIngresoRapidoDto, tenantId?: number) {
    await this.findIngresoOrThrow(id, tenantId);
    return this.ingresoRapidoRepo.update({
      where: { id },
      data: {
        ...(dto.concepto !== undefined
          ? { concepto: dto.concepto.trim() }
          : {}),
        ...(dto.monto !== undefined ? { monto: dto.monto } : {}),
      },
    });
  }

  async remove(id: number, tenantId?: number) {
    await this.findIngresoOrThrow(id, tenantId);
    return this.ingresoRapidoRepo.delete({ where: { id } });
  }
}
