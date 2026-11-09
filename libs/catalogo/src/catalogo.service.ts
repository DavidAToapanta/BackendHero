import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/prisma';
import { Prisma } from '@prisma/client';
import { traducirErrorCatalogo } from './errores-catalogo';

type FichaProducto = {
  nombre: string;
  precio: number | Prisma.Decimal;
  estado: boolean;
  sku?: string | null;
  codigoBarras?: string | null;
  marca?: string | null;
  presentacion?: string | null;
  descripcion?: string | null;
};

const SKU_O_BARRAS_DUPLICADO =
  'El SKU o código de barras ya existe en el negocio';
const PRODUCTO_NO_ENCONTRADO = 'Producto no encontrado';

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: number, ficha: FichaProducto, stockInicialLegacy = 0) {
    if (!Number.isInteger(stockInicialLegacy) || stockInicialLegacy < 0) {
      throw new BadRequestException(
        'El stock inicial debe ser un entero no negativo',
      );
    }

    const { nombre, precio, estado } = ficha;
    try {
      return await this.prisma.producto.create({
        data: {
          ...this.datosFicha(ficha),
          tenantId,
          nombre,
          precio,
          estado,
          stock: stockInicialLegacy,
        },
      });
    } catch (error) {
      traducirErrorCatalogo(error, { P2002: SKU_O_BARRAS_DUPLICADO });
    }
  }

  async findOne(tenantId: number, id: number) {
    const producto = await this.prisma.producto.findFirst({
      where: { id, tenantId },
    });

    if (!producto) {
      throw new NotFoundException(PRODUCTO_NO_ENCONTRADO);
    }

    return producto;
  }

  async findAll(
    tenantId: number,
    page: number,
    limit: number,
    search?: string,
  ) {
    const take = Math.max(1, Math.min(limit, 50));
    const currentPage = Math.max(1, page);
    const skip = (currentPage - 1) * take;
    const trimmedSearch = search?.trim();

    const where: Prisma.ProductoWhereInput = {
      tenantId,
      ...(trimmedSearch
        ? { nombre: { contains: trimmedSearch, mode: 'insensitive' } }
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

  async updateFicha(
    tenantId: number,
    id: number,
    ficha: Partial<FichaProducto>,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    try {
      return await tx.producto.update({
        where: { tenantId_id: { tenantId, id } },
        data: this.datosFicha(ficha),
      });
    } catch (error) {
      traducirErrorCatalogo(error, {
        P2025: PRODUCTO_NO_ENCONTRADO,
        P2002: SKU_O_BARRAS_DUPLICADO,
      });
    }
  }

  async remove(tenantId: number, id: number) {
    try {
      return await this.prisma.producto.delete({
        where: { tenantId_id: { tenantId, id } },
      });
    } catch (error) {
      traducirErrorCatalogo(error, {
        P2025: PRODUCTO_NO_ENCONTRADO,
        P2003:
          'El producto tiene registros asociados. Puedes desactivarlo desde su ficha',
      });
    }
  }

  private datosFicha({
    nombre,
    precio,
    estado,
    sku,
    codigoBarras,
    marca,
    presentacion,
    descripcion,
  }: Partial<FichaProducto>) {
    return {
      nombre,
      precio,
      estado,
      sku: sku === undefined ? undefined : sku?.trim() || null,
      codigoBarras:
        codigoBarras === undefined ? undefined : codigoBarras?.trim() || null,
      marca,
      presentacion,
      descripcion,
    };
  }
}
