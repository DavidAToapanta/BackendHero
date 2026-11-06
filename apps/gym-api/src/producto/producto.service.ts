import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@app/prisma';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

@Injectable()
export class ProductoService {
  constructor(private prisma: PrismaService) {}

  // Las rutas existentes siguen entregando precio numerico al frontend GYM.
  // Los futuros servicios comerciales deben operar con el Decimal original.
  private toLegacyResponse<T extends { precio: Prisma.Decimal }>(producto: T) {
    return { ...producto, precio: Number(producto.precio) };
  }

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
    const producto = await this.prisma.producto.create({
      data: {
        tenantId: scopedTenantId,
        ...dto,
      },
    });
    return this.toLegacyResponse(producto);
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
      data: productos.map((producto) => this.toLegacyResponse(producto)),
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
    return this.toLegacyResponse(producto);
  }

  async update(id: number, dto: UpdateProductoDto, tenantId?: number) {
    await this.findProductoOrThrow(id, tenantId);
    const producto = await this.prisma.producto.update({
      where: { id },
      data: dto,
    });
    return this.toLegacyResponse(producto);
  }

  async remove(id: number, tenantId?: number) {
    await this.findProductoOrThrow(id, tenantId);
    const producto = await this.prisma.producto.delete({ where: { id } });
    return this.toLegacyResponse(producto);
  }
}
