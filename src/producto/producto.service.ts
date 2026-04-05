import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

@Injectable()
export class ProductoService {
  constructor(private prisma: PrismaService) {}

  private async getScopedTenantId(tenantId?: number) {
    return resolveTenantIdOrDefault(this.prisma, tenantId);
  }

  private async findProductoOrThrow(id: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const producto = await this.prisma.producto.findFirst({
      where: { id, tenantId: scopedTenantId },
    });

    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }

    return { producto, tenantId: scopedTenantId };
  }

  async create(dto: CreateProductoDto, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    return this.prisma.producto.create({
      data: {
        tenantId: scopedTenantId,
        ...dto,
      },
    });
  }

  async findAll(page = 1, limit = 10, search?: string, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const take = Math.max(1, Math.min(limit, 50));
    const currentPage = Math.max(1, page);
    const skip = (currentPage - 1) * take;
    const trimmedSearch = search?.trim();

    const where: Prisma.ProductoWhereInput = {
      tenantId: scopedTenantId,
      ...(trimmedSearch
        ? {
            nombre: {
              contains: trimmedSearch,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [totalItems, productos] = await Promise.all([
      this.prisma.producto.count({ where }),
      this.prisma.producto.findMany({
        where,
        skip,
        take,
        orderBy: { nombre: 'asc' },
      }),
    ]);

    return {
      data: productos,
      meta: {
        totalItems,
        itemCount: productos.length,
        perPage: take,
        totalPages: Math.ceil(totalItems / take),
        currentPage,
      },
    };
  }

  async findOne(id: number, tenantId?: number) {
    const { producto } = await this.findProductoOrThrow(id, tenantId);
    return producto;
  }

  async update(id: number, dto: UpdateProductoDto, tenantId?: number) {
    await this.findProductoOrThrow(id, tenantId);
    return this.prisma.producto.update({ where: { id }, data: dto });
  }

  async remove(id: number, tenantId?: number) {
    await this.findProductoOrThrow(id, tenantId);
    return this.prisma.producto.delete({ where: { id } });
  }
}
