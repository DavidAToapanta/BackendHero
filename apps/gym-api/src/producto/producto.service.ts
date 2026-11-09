import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CatalogoService } from '@app/catalogo';
import { InventarioService } from '@app/inventario';
import { PrismaService } from '@app/prisma';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

@Injectable()
export class ProductoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: CatalogoService,
    private readonly inventario: InventarioService,
  ) {}

  // Las rutas existentes siguen entregando precio numerico al frontend GYM.
  // Los futuros servicios comerciales deben operar con el Decimal original.
  private toLegacyResponse<T extends { precio: Prisma.Decimal }>(producto: T) {
    return { ...producto, precio: Number(producto.precio) };
  }

  private async getScopedTenantId(tenantId?: number) {
    return resolveTenantIdOrDefault(this.prisma, tenantId);
  }

  async create(dto: CreateProductoDto, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const { nombre, precio, stock, estado } = dto;
    const producto = await this.catalogo.create(
      scopedTenantId,
      { nombre, precio, estado },
      stock,
    );
    return this.toLegacyResponse(producto);
  }

  async findAll(page = 1, limit = 10, search?: string, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const { data, meta } = await this.catalogo.findAll(
      scopedTenantId,
      page,
      limit,
      search,
    );

    return {
      data: data.map((producto) => this.toLegacyResponse(producto)),
      meta,
    };
  }

  async findOne(id: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const producto = await this.catalogo.findOne(scopedTenantId, id);
    return this.toLegacyResponse(producto);
  }

  async update(id: number, dto: UpdateProductoDto, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const { nombre, precio, estado, stock } = dto;
    const ficha = { nombre, precio, estado };

    if (stock === undefined) {
      const producto = await this.catalogo.updateFicha(
        scopedTenantId,
        id,
        ficha,
      );
      return this.toLegacyResponse(producto);
    }

    const producto = await this.prisma.$transaction(async (tx) => {
      await this.inventario.fijarStockLegacy(tx, scopedTenantId, id, stock);
      return this.catalogo.updateFicha(scopedTenantId, id, ficha, tx);
    });
    return this.toLegacyResponse(producto);
  }

  async remove(id: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const producto = await this.catalogo.remove(scopedTenantId, id);
    return this.toLegacyResponse(producto);
  }
}
