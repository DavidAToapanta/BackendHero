import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/prisma';
import { ModulosNegocioService } from '@app/negocios';
import type { ModuleKey, Prisma } from '@prisma/client';
import { traducirErrorCatalogo } from './errores-catalogo';

const CATEGORIA_DUPLICADA =
  'Ya existe una categoría con ese nombre en el módulo';
const ordenCategorias: Prisma.CategoriaProductoOrderByWithRelationInput[] = [
  { nombreNormalizado: 'asc' },
  { id: 'asc' },
];

type FiltrosCategorias = {
  q?: string;
  activo?: boolean;
  pagina?: number;
  limite?: number;
};

@Injectable()
export class CategoriasProductoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modulos: ModulosNegocioService,
  ) {}

  async findAll(tenantId: number, modulo: ModuleKey, activo?: boolean) {
    await this.validarModulo(tenantId, modulo);
    return this.prisma.categoriaProducto.findMany({
      where: { tenantId, modulo, activo },
      orderBy: ordenCategorias,
    });
  }

  async listarPaginado(
    tenantId: number,
    modulo: ModuleKey,
    { q, activo, pagina = 1, limite = 20 }: FiltrosCategorias = {},
    tx: Prisma.TransactionClient = this.prisma,
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
    await this.validarModulo(tenantId, modulo, tx);
    const nombre = q?.trim();
    const where: Prisma.CategoriaProductoWhereInput = {
      tenantId,
      modulo,
      activo,
      ...(nombre && {
        nombreNormalizado: {
          contains: this.normalizarNombre(nombre).nombreNormalizado.replace(
            /[\\%_]/g,
            '\\$&',
          ),
        },
      }),
    };
    const [data, total] = await Promise.all([
      tx.categoriaProducto.findMany({
        where,
        orderBy: ordenCategorias,
        skip,
        take: limite,
        select: { id: true, nombre: true, activo: true },
      }),
      tx.categoriaProducto.count({ where }),
    ]);
    return {
      data,
      meta: { pagina, limite, total, paginas: Math.ceil(total / limite) },
    };
  }

  async create(
    tenantId: number,
    modulo: ModuleKey,
    nombre: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    await this.validarModulo(tenantId, modulo, tx);
    try {
      return await tx.categoriaProducto.create({
        data: { tenantId, modulo, ...this.normalizarNombre(nombre) },
      });
    } catch (error) {
      traducirErrorCatalogo(error, { P2002: CATEGORIA_DUPLICADA });
    }
  }

  async update(
    tenantId: number,
    modulo: ModuleKey,
    id: number,
    { nombre, activo }: { nombre?: string; activo?: boolean },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    await this.validarModulo(tenantId, modulo, tx);
    try {
      return await tx.categoriaProducto.update({
        where: { tenantId_id: { tenantId, id }, modulo },
        data: {
          ...(nombre === undefined ? {} : this.normalizarNombre(nombre)),
          activo,
        },
      });
    } catch (error) {
      traducirErrorCatalogo(error, {
        P2002: CATEGORIA_DUPLICADA,
        P2025: 'Categoría no encontrada',
      });
    }
  }

  async asignarAProducto(
    tenantId: number,
    modulo: ModuleKey,
    productoId: number,
    categoriaId: number | null,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    await this.validarModulo(tenantId, modulo, tx);
    if (categoriaId !== null) {
      const categoria = await tx.categoriaProducto.findUnique({
        where: {
          tenantId_id: { tenantId, id: categoriaId },
          modulo,
          activo: true,
        },
        select: { id: true },
      });
      if (!categoria) {
        throw new NotFoundException(
          'Categoría activa no encontrada en el módulo',
        );
      }
    }

    try {
      return await tx.producto.update({
        where: { tenantId_id: { tenantId, id: productoId } },
        data: { categoriaId },
      });
    } catch (error) {
      traducirErrorCatalogo(error, { P2025: 'Producto no encontrado' });
    }
  }

  private async validarModulo(
    tenantId: number,
    modulo: ModuleKey,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const habilitado = await this.modulos.estaActivo(tenantId, modulo, tx);
    if (!habilitado) {
      throw new ForbiddenException(
        'El módulo no está habilitado para el negocio',
      );
    }
  }

  normalizarNombre(valor: string) {
    const nombre = valor.trim().replace(/\s+/g, ' ');
    if (!nombre) {
      throw new BadRequestException('El nombre de la categoría es obligatorio');
    }
    return { nombre, nombreNormalizado: nombre.normalize('NFC').toLowerCase() };
  }
}
