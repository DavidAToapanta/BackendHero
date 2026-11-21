import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/prisma';
import { Prisma, type ModuleKey } from '@prisma/client';
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

type FiltrosFicha = {
  q?: string;
  activo?: boolean;
  categoriaId?: number;
  pagina?: number;
  limite?: number;
};

const categoriaFicha = {
  select: { id: true, nombre: true, modulo: true },
} as const;
const imagenesFicha = { orderBy: { orden: 'asc' } } as const;

const SKU_O_BARRAS_DUPLICADO =
  'El SKU o código de barras ya existe en el negocio';

function mensajeCodigoDuplicado(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const campos = error.meta?.target;
    if (Array.isArray(campos)) {
      if (campos.includes('codigoBarras'))
        return 'El código de barras ya existe en el negocio';
      if (campos.includes('sku')) return 'El SKU ya existe en el negocio';
    }
  }
  return SKU_O_BARRAS_DUPLICADO;
}
const PRODUCTO_NO_ENCONTRADO = 'Producto no encontrado';

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: number,
    ficha: FichaProducto,
    stockInicialLegacy = 0,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    if (!Number.isInteger(stockInicialLegacy) || stockInicialLegacy < 0) {
      throw new BadRequestException(
        'El stock inicial debe ser un entero no negativo',
      );
    }

    const { nombre, precio, estado } = ficha;
    try {
      return await tx.producto.create({
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
      traducirErrorCatalogo(error, { P2002: mensajeCodigoDuplicado(error) });
    }
  }

  async listarFichas(
    tenantId: number,
    modulo: ModuleKey,
    { q, activo, categoriaId, pagina = 1, limite = 20 }: FiltrosFicha,
    tx: Prisma.TransactionClient,
  ) {
    const skip = (pagina - 1) * limite;
    if (
      !Number.isInteger(pagina) ||
      pagina < 1 ||
      !Number.isInteger(limite) ||
      limite < 1 ||
      limite > 50 ||
      skip > 2147483647
    ) {
      throw new BadRequestException('Paginación inválida');
    }
    const texto = q?.trim().replace(/[\\%_]/g, '\\$&');
    const contiene = { contains: texto, mode: 'insensitive' as const };
    const where: Prisma.ProductoWhereInput = {
      tenantId,
      estado: activo,
      ...(categoriaId === undefined
        ? {}
        : { categoria: { id: categoriaId, modulo } }),
      ...(texto
        ? {
            OR: [
              { nombre: contiene },
              { presentacion: contiene },
              { sku: contiene },
              { codigoBarras: contiene },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      tx.producto.findMany({
        where,
        skip,
        take: limite,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        include: {
          categoria: categoriaFicha,
          productoImagen_producto: { ...imagenesFicha, take: 1 },
        },
      }),
      tx.producto.count({ where }),
    ]);
    return {
      data,
      meta: { pagina, limite, total, paginas: Math.ceil(total / limite) },
    };
  }

  async obtenerFicha(
    tenantId: number,
    identificador: { id: number } | { codigoBarras: string },
    tx: Prisma.TransactionClient,
    opciones: { soloActivos?: boolean; todasLasImagenes?: boolean } = {},
  ) {
    const producto = await tx.producto.findFirst({
      where: {
        tenantId,
        ...('id' in identificador
          ? { id: identificador.id }
          : { codigoBarras: identificador.codigoBarras }),
        estado: opciones.soloActivos ? true : undefined,
      },
      include: {
        categoria: categoriaFicha,
        productoImagen_producto: {
          ...imagenesFicha,
          take: opciones.todasLasImagenes ? undefined : 1,
        },
      },
    });
    if (!producto) throw new NotFoundException(PRODUCTO_NO_ENCONTRADO);
    return producto;
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
        P2002: mensajeCodigoDuplicado(error),
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
