import { randomUUID } from 'node:crypto';
import { CategoriasProductoService } from '@app/catalogo';
import { PermisosService } from '@app/permisos';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma, type CategoriaProducto } from '@prisma/client';
import {
  ACCIONES_AUDITORIA,
  AuditoriaEscrituraService,
} from '../auditoria/auditoria-escritura';
import type { ContextoTienda } from '../auth';
import type {
  EditarCategoriaDto,
  ListaCategoriasDto,
} from './dto/categoria.dto';
import { CreateCatalogoDto } from './dto/create-catalogo.dto';
import { UpdateCatalogoDto } from './dto/update-catalogo.dto';

function categoriaPublica({
  id,
  nombre,
  activo,
}: Pick<CategoriaProducto, 'id' | 'nombre' | 'activo'>) {
  return { id, nombre, activo };
}

@Injectable()
export class CatalogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categorias: CategoriasProductoService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaEscrituraService,
  ) {}

  listarCategorias(contexto: ContextoTienda, filtros: ListaCategoriasDto) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.permisos.autorizar(contexto, 'store.catalog.read', tx);
        return this.categorias.listarPaginado(
          contexto.tenantId,
          'STORE',
          filtros,
          tx,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  crearCategoria(contexto: ContextoTienda, nombre: string) {
    return this.escribirCategoria(contexto, async (tx) => {
      const categoria = categoriaPublica(
        await this.categorias.create(contexto.tenantId, 'STORE', nombre, tx),
      );
      await this.auditoria.registrar(tx, contexto, {
        accion: ACCIONES_AUDITORIA.CATEGORIAS_CREAR,
        entidadTipo: 'CategoriaProducto',
        entidadId: categoria.id,
        correlacionId: randomUUID(),
        datos: { actual: categoria },
      });
      return categoria;
    });
  }

  editarCategoria(
    contexto: ContextoTienda,
    categoriaId: number,
    { nombre, activo }: EditarCategoriaDto,
  ) {
    if (nombre === undefined && activo === undefined) {
      throw new BadRequestException(
        'Indica un nombre o estado para la categoría',
      );
    }
    return this.escribirCategoria(contexto, async (tx) => {
      const { tenantId } = contexto;
      const previa = await tx.categoriaProducto.findUnique({
        where: { tenantId_id: { tenantId, id: categoriaId }, modulo: 'STORE' },
        select: { id: true, nombre: true, activo: true },
      });
      if (!previa) throw new NotFoundException('Categoría no encontrada');

      const cambiaNombre =
        nombre !== undefined &&
        this.categorias.normalizarNombre(nombre).nombre !== previa.nombre;
      const cambiaEstado = activo !== undefined && activo !== previa.activo;
      if (!cambiaNombre && !cambiaEstado) return previa;

      const actual = categoriaPublica(
        await this.categorias.update(
          tenantId,
          'STORE',
          categoriaId,
          {
            nombre: cambiaNombre ? nombre : undefined,
            activo: cambiaEstado ? activo : undefined,
          },
          tx,
        ),
      );
      const accion = cambiaEstado
        ? actual.activo
          ? ACCIONES_AUDITORIA.CATEGORIAS_REACTIVAR
          : ACCIONES_AUDITORIA.CATEGORIAS_DESACTIVAR
        : ACCIONES_AUDITORIA.CATEGORIAS_EDITAR;
      await this.auditoria.registrar(tx, contexto, {
        accion,
        entidadTipo: 'CategoriaProducto',
        entidadId: categoriaId,
        correlacionId: randomUUID(),
        datos: { anterior: previa, actual },
      });
      return actual;
    });
  }

  asignarCategoria(
    contexto: ContextoTienda,
    productoId: number,
    categoriaId: number | null,
  ) {
    return this.escribirCategoria(contexto, async (tx) => {
      const { tenantId } = contexto;
      const producto = await tx.producto.findUnique({
        where: { tenantId_id: { tenantId, id: productoId } },
        select: { categoriaId: true, categoria: { select: { modulo: true } } },
      });
      if (!producto) throw new NotFoundException('Producto no encontrado');
      if (producto.categoria?.modulo === 'GYM') {
        throw new ConflictException(
          'GYM debe quitar primero su categoría del producto',
        );
      }
      if (producto.categoriaId === categoriaId)
        return { productoId, categoriaId };

      await this.categorias.asignarAProducto(
        tenantId,
        'STORE',
        productoId,
        categoriaId,
        tx,
      );
      await this.auditoria.registrar(tx, contexto, {
        accion:
          categoriaId === null
            ? ACCIONES_AUDITORIA.PRODUCTOS_DESASIGNAR_CATEGORIA
            : ACCIONES_AUDITORIA.PRODUCTOS_ASIGNAR_CATEGORIA,
        entidadTipo: 'Producto',
        entidadId: productoId,
        productoIds: [productoId],
        correlacionId: randomUUID(),
        datos: { categoriaIdAnterior: producto.categoriaId, categoriaId },
      });
      return { productoId, categoriaId };
    });
  }

  private async escribirCategoria<T>(
    contexto: ContextoTienda,
    operacion: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.permisos.autorizar(contexto, 'store.catalog.write', tx);
          return operacion(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Otro cambio de catálogo coincidió con la operación. Reintenta.',
        );
      }
      throw error;
    }
  }

  create(createCatalogoDto: CreateCatalogoDto): never {
    void createCatalogoDto;
    throw new NotImplementedException();
  }

  findAll(): never {
    throw new NotImplementedException();
  }

  findOne(id: number): never {
    void id;
    throw new NotImplementedException();
  }

  update(id: number, updateCatalogoDto: UpdateCatalogoDto): never {
    void id;
    void updateCatalogoDto;
    throw new NotImplementedException();
  }

  remove(id: number): never {
    void id;
    throw new NotImplementedException();
  }
}
