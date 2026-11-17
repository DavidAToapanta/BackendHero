import { randomUUID } from 'node:crypto';
import {
  CatalogoService as CatalogoCompartidoService,
  CategoriasProductoService,
  ImagenesProductoService,
} from '@app/catalogo';
import { InventarioLotesService } from '@app/inventario';
import { PermisosService } from '@app/permisos';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type CategoriaProducto,
  type ProductoImagen,
} from '@prisma/client';
import {
  ACCIONES_AUDITORIA,
  AuditoriaEscrituraService,
  type AccionAuditoria,
} from '../auditoria/auditoria-escritura';
import type { ContextoTienda } from '../auth';
import type {
  EditarCategoriaDto,
  ListaCategoriasDto,
} from './dto/categoria.dto';
import type {
  CrearImagenDto,
  CrearProductoDto,
  EditarImagenDto,
  EditarProductoDto,
  ListaProductosDto,
} from './dto/producto.dto';
import type { PaginacionCatalogoDto } from './dto/categoria.dto';

type FichaCatalogo = Awaited<
  ReturnType<CatalogoCompartidoService['obtenerFicha']>
>;

function imagenPublica({ id, url, orden, textoAlternativo }: ProductoImagen) {
  return { id, url, orden, textoAlternativo };
}

function categoriaStore({ categoria }: FichaCatalogo) {
  return categoria?.modulo === 'STORE'
    ? { id: categoria.id, nombre: categoria.nombre }
    : null;
}

function fichaMostrador(producto: FichaCatalogo, stockDisponible: number) {
  const { id, nombre, presentacion, precio, sku, codigoBarras } = producto;
  const [imagenPrincipal] = producto.productoImagen_producto;
  return {
    productoId: id,
    nombre,
    presentacion,
    precio: precio.toFixed(2),
    sku,
    codigoBarras,
    categoria: categoriaStore(producto),
    imagenPrincipal: imagenPrincipal ? imagenPublica(imagenPrincipal) : null,
    stockDisponible,
  };
}

function fichaAdministrativa(producto: FichaCatalogo, stockDisponible: number) {
  const { estado, marca, descripcion, stock, stockReservado, modoInventario } =
    producto;
  return {
    ...fichaMostrador(producto, stockDisponible),
    estado,
    marca,
    descripcion,
    stockFisico: stock,
    stockReservado,
    modoInventario,
  };
}

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
    private readonly fichas: CatalogoCompartidoService,
    private readonly inventario: InventarioLotesService,
    private readonly imagenes: ImagenesProductoService,
  ) {}

  listarCategorias(contexto: ContextoTienda, filtros: ListaCategoriasDto) {
    return this.leerCatalogo(contexto, (tx) =>
      this.categorias.listarPaginado(contexto.tenantId, 'STORE', filtros, tx),
    );
  }

  crearCategoria(contexto: ContextoTienda, nombre: string) {
    return this.escribirCatalogo(contexto, async (tx) => {
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
    return this.escribirCatalogo(contexto, async (tx) => {
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
    return this.escribirCatalogo(contexto, async (tx) => {
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

  listarProductos(contexto: ContextoTienda, filtros: ListaProductosDto) {
    return this.listarFichas(contexto, filtros, fichaAdministrativa);
  }

  buscarMostrador(contexto: ContextoTienda, filtros: PaginacionCatalogoDto) {
    return this.listarFichas(
      contexto,
      { ...filtros, activo: true },
      fichaMostrador,
    );
  }

  buscarPortal(tenantId: number, filtros: PaginacionCatalogoDto) {
    return this.listarFichas(
      { tenantId },
      { ...filtros, activo: true },
      fichaMostrador,
    );
  }

  buscarPorBarras(contexto: ContextoTienda, codigoBarras: string) {
    return this.leerCatalogo(contexto, async (tx) => {
      const { tenantId } = contexto;
      const producto = await this.fichas.obtenerFicha(
        tenantId,
        { codigoBarras: codigoBarras.trim() },
        tx,
        { soloActivos: true },
      );
      const disponibles = await this.inventario.consultarDisponibles(
        tx,
        tenantId,
        [producto],
        new Date(),
      );
      return fichaMostrador(producto, disponibles.get(producto.id) ?? 0);
    });
  }

  obtenerProducto(contexto: ContextoTienda, productoId: number) {
    return this.leerCatalogo(contexto, (tx) =>
      this.detalleProducto(tx, contexto.tenantId, productoId),
    );
  }

  async obtenerSnapshotVenta(
    tx: Prisma.TransactionClient,
    tenantId: number,
    productoId: number,
  ) {
    const producto = await this.fichas.obtenerFicha(
      tenantId,
      { id: productoId },
      tx,
      { soloActivos: true },
    );
    const categoria = categoriaStore(producto);
    return {
      productoId: producto.id,
      nombreProducto: producto.nombre,
      presentacionProducto: producto.presentacion,
      skuProducto: producto.sku,
      codigoBarrasProducto: producto.codigoBarras,
      categoriaId: categoria?.id ?? null,
      categoriaNombre: categoria?.nombre ?? null,
      precioUnitario: producto.precio,
    };
  }

  crearProducto(contexto: ContextoTienda, dto: CrearProductoDto) {
    return this.escribirCatalogo(contexto, async (tx) => {
      const { tenantId } = contexto;
      const producto = await this.fichas.create(
        tenantId,
        {
          ...dto,
          nombre: dto.nombre.trim(),
          precio: new Prisma.Decimal(dto.precio),
          estado: dto.estado ?? true,
        },
        0,
        tx,
      );
      await this.auditoria.registrar(tx, contexto, {
        accion: ACCIONES_AUDITORIA.PRODUCTOS_CREAR,
        entidadTipo: 'Producto',
        entidadId: producto.id,
        productoIds: [producto.id],
        correlacionId: randomUUID(),
        datos: { nombre: producto.nombre, precio: producto.precio.toFixed(2) },
      });
      return this.detalleProducto(tx, tenantId, producto.id);
    });
  }

  editarProducto(
    contexto: ContextoTienda,
    productoId: number,
    dto: EditarProductoDto,
  ) {
    const campos = Object.keys(dto).filter(
      (campo) => dto[campo as keyof EditarProductoDto] !== undefined,
    );
    if (campos.length === 0)
      throw new BadRequestException('Indica un campo de la ficha');
    return this.escribirCatalogo(contexto, async (tx) => {
      const { tenantId } = contexto;
      await this.fichas.updateFicha(
        tenantId,
        productoId,
        {
          ...dto,
          nombre: dto.nombre?.trim(),
          precio:
            dto.precio === undefined
              ? undefined
              : new Prisma.Decimal(dto.precio),
        },
        tx,
      );
      await this.auditoria.registrar(tx, contexto, {
        accion: ACCIONES_AUDITORIA.PRODUCTOS_EDITAR,
        entidadTipo: 'Producto',
        entidadId: productoId,
        productoIds: [productoId],
        correlacionId: randomUUID(),
        datos: { campos },
      });
      return this.detalleProducto(tx, tenantId, productoId);
    });
  }

  crearImagen(
    contexto: ContextoTienda,
    productoId: number,
    dto: CrearImagenDto,
  ) {
    return this.escribirImagen(
      contexto,
      productoId,
      ACCIONES_AUDITORIA.IMAGENES_CREAR,
      (tx) => this.imagenes.create(contexto.tenantId, productoId, dto, tx),
    );
  }

  editarImagen(
    contexto: ContextoTienda,
    productoId: number,
    imagenId: number,
    dto: EditarImagenDto,
  ) {
    if (
      dto.url === undefined &&
      dto.orden === undefined &&
      dto.textoAlternativo === undefined
    ) {
      throw new BadRequestException('Indica un campo de la imagen');
    }
    return this.escribirImagen(
      contexto,
      productoId,
      ACCIONES_AUDITORIA.IMAGENES_EDITAR,
      (tx) =>
        this.imagenes.update(
          contexto.tenantId,
          productoId,
          imagenId,
          {
            ...dto,
            claveArchivo: dto.url === undefined ? undefined : null,
          },
          tx,
        ),
    );
  }

  eliminarImagen(
    contexto: ContextoTienda,
    productoId: number,
    imagenId: number,
  ) {
    return this.escribirImagen(
      contexto,
      productoId,
      ACCIONES_AUDITORIA.IMAGENES_ELIMINAR,
      (tx) => this.imagenes.remove(contexto.tenantId, productoId, imagenId, tx),
    );
  }

  private escribirImagen(
    contexto: ContextoTienda,
    productoId: number,
    accion: AccionAuditoria,
    operacion: (tx: Prisma.TransactionClient) => Promise<ProductoImagen>,
  ) {
    return this.escribirCatalogo(contexto, async (tx) => {
      const imagen = await operacion(tx);
      await this.auditoria.registrar(tx, contexto, {
        accion,
        entidadTipo: 'ProductoImagen',
        entidadId: imagen.id,
        productoIds: [productoId],
        correlacionId: randomUUID(),
        datos: { orden: imagen.orden },
      });
      return imagenPublica(imagen);
    });
  }

  private listarFichas<T>(
    contexto: ContextoTienda | Pick<ContextoTienda, 'tenantId'>,
    filtros: ListaProductosDto,
    presentar: (producto: FichaCatalogo, stockDisponible: number) => T,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        if ('membresiaId' in contexto)
          await this.permisos.autorizar(contexto, 'store.catalog.read', tx);
        const { tenantId } = contexto;
        const { data, meta } = await this.fichas.listarFichas(
          tenantId,
          'STORE',
          filtros,
          tx,
        );
        const disponibles = await this.inventario.consultarDisponibles(
          tx,
          tenantId,
          data,
          new Date(),
        );
        return {
          data: data.map((producto) =>
            presentar(producto, disponibles.get(producto.id) ?? 0),
          ),
          meta,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async detalleProducto(
    tx: Prisma.TransactionClient,
    tenantId: number,
    productoId: number,
  ) {
    const producto = await this.fichas.obtenerFicha(
      tenantId,
      { id: productoId },
      tx,
      { todasLasImagenes: true },
    );
    const disponibles = await this.inventario.consultarDisponibles(
      tx,
      tenantId,
      [producto],
      new Date(),
    );
    return {
      ...fichaAdministrativa(producto, disponibles.get(producto.id) ?? 0),
      imagenes: producto.productoImagen_producto.map(imagenPublica),
    };
  }

  private leerCatalogo<T>(
    contexto: ContextoTienda,
    operacion: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.permisos.autorizar(contexto, 'store.catalog.read', tx);
        return operacion(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async escribirCatalogo<T>(
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
}
