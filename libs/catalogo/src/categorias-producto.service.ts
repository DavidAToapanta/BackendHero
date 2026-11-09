import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/prisma';
import { ModuleKey } from '@prisma/client';
import { traducirErrorCatalogo } from './errores-catalogo';

const CATEGORIA_DUPLICADA =
  'Ya existe una categoría con ese nombre en el módulo';

@Injectable()
export class CategoriasProductoService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: number, modulo: ModuleKey, activo?: boolean) {
    await this.validarModulo(tenantId, modulo);
    return this.prisma.categoriaProducto.findMany({
      where: { tenantId, modulo, activo },
      orderBy: [{ nombreNormalizado: 'asc' }, { id: 'asc' }],
    });
  }

  async create(tenantId: number, modulo: ModuleKey, nombre: string) {
    await this.validarModulo(tenantId, modulo);
    try {
      return await this.prisma.categoriaProducto.create({
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
  ) {
    await this.validarModulo(tenantId, modulo);
    try {
      return await this.prisma.categoriaProducto.update({
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
  ) {
    await this.validarModulo(tenantId, modulo);
    if (categoriaId !== null) {
      const categoria = await this.prisma.categoriaProducto.findUnique({
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
      return await this.prisma.producto.update({
        where: { tenantId_id: { tenantId, id: productoId } },
        data: { categoriaId },
      });
    } catch (error) {
      traducirErrorCatalogo(error, { P2025: 'Producto no encontrado' });
    }
  }

  private async validarModulo(tenantId: number, modulo: ModuleKey) {
    const habilitado = await this.prisma.tenantModule.findUnique({
      where: { tenantId_module: { tenantId, module: modulo }, activo: true },
      select: { id: true },
    });
    if (!habilitado) {
      throw new ForbiddenException(
        'El módulo no está habilitado para el negocio',
      );
    }
  }

  private normalizarNombre(valor: string) {
    const nombre = valor.trim().replace(/\s+/g, ' ');
    if (!nombre) {
      throw new BadRequestException('El nombre de la categoría es obligatorio');
    }
    return { nombre, nombreNormalizado: nombre.normalize('NFC').toLowerCase() };
  }
}
