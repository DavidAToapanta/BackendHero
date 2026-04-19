import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlanService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePlanDto, tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    return this.prisma.plan.create({
      data: {
        ...dto,
        tenantId: scopedTenantId,
      },
    });
  }

  async findAll(page = 1, limit = 10, tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const take = Math.max(1, Math.min(limit, 50));
    const currentPage = Math.max(1, page);
    const skip = (currentPage - 1) * take;

    const [data, total] = await Promise.all([
      this.prisma.plan.findMany({
        where: {
          tenantId: scopedTenantId,
          activo: true,
        },
        skip,
        take,
        orderBy: { id: 'desc' },
      }),
      this.prisma.plan.count({
        where: {
          tenantId: scopedTenantId,
          activo: true,
        },
      }),
    ]);

    return {
      data,
      total,
      page: currentPage,
      totalPages: Math.ceil(total / take),
    };
  }

  async findOne(id: number, tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const plan = await this.prisma.plan.findFirst({
      where: { id, tenantId: scopedTenantId },
    });

    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    return plan;
  }

  async update(id: number, dto: UpdatePlanDto, tenantId?: number) {
    await this.findOne(id, tenantId);
    return this.prisma.plan.update({ where: { id }, data: dto });
  }

  async delete(id: number, tenantId?: number) {
    await this.findOne(id, tenantId);
    return this.prisma.plan.update({
      where: { id },
      data: { activo: false },
    });
  }

  async deleteWithCascade(id: number, tenantId?: number) {
    await this.findOne(id, tenantId);
    try {
      return await this.prisma.plan.delete({
        where: { id },
      });
    } catch {
      throw new BadRequestException(
        'No se puede eliminar el plan porque tiene registros asociados. Se requiere limpieza manual o implementacion de borrado en profundidad.',
      );
    }
  }
}
