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
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import type {
  EditarCategoriaDto,
  ListaCategoriasDto,
} from './dto/categoria.dto';
import type {
  CrearImagenDto,
  CrearProductoDto,
  DatosArchivoImagenDto,
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

function tipoDeImagen(contenido?: Buffer) {
  if (contenido?.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg';
  }
  if (
    contenido?.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  ) {
    return 'image/png';
  }
  if (
    contenido?.toString('ascii', 0, 4) === 'RIFF' &&
    contenido.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  throw new BadRequestException('Selecciona una imagen JPG, PNG o WebP válida');
}

function categoriaStore({ categoria }: Pick<FichaCatalogo, 'categoria'>) {
  return categoria?.modulo === 'STORE'
    ? { id: categoria.id, nombre: categoria.nombre }
    : null;
}

function fichaMostrador(producto: FichaCatalogo, stockDisponible: number) {
  const { id, nombre, presentacion, precio, sku, codigoBarras, unidadVenta } =
    producto;
  const [imagenPrincipal] = producto.productoImagen_producto;
  return {
    productoId: id,
    nombre,
    presentacion,
    precio: precio.toFixed(2),
    unidadVenta,
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
    stockMinimo: producto.stockMinimo,
    stockBajo:
      estado &&
      producto.stockMinimo != null &&
      stockDisponible <= producto.stockMinimo,
    ivaTarifaCero: producto.ivaTarifaCero,
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
    private readonly idempotencia: IdempotenciaService,
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

  alertasStock(contexto: ContextoTienda) {
    return this.leerCatalogo(contexto, async (tx) => {
      const { tenantId } = contexto;
      const candidatos = await tx.producto.findMany({
        where: { tenantId, estado: true, stockMinimo: { not: null } },
        select: {
          id: true,
          tenantId: true,
          nombre: true,
          precio: true,
          stock: true,
          stockReservado: true,
          estado: true,
          modoInventario: true,
          stockMinimo: true,
          unidadVenta: true,
        },
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      });
      const disponibles = await this.inventario.consultarDisponibles(
        tx,
        tenantId,
        candidatos,
        new Date(),
      );
      const alertas = candidatos.flatMap(
        ({ id, nombre, stockMinimo, unidadVenta }) => {
          const stockDisponible = disponibles.get(id) ?? 0;
          return stockMinimo !== null && stockDisponible <= stockMinimo
            ? [
                {
                  productoId: id,
                  nombre,
                  stockMinimo,
                  stockDisponible,
                  unidadVenta,
                },
              ]
            : [];
        },
      );
      return { total: alertas.length, productos: alertas.slice(0, 5) };
    });
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
    tasaGeneral?: Prisma.Decimal,
  ) {
    const [ficha] = await this.obtenerSnapshotsVenta(
      tx,
      tenantId,
      [productoId],
      tasaGeneral,
    );
    return ficha;
  }

  async obtenerSnapshotsVenta(
    tx: Prisma.TransactionClient,
    tenantId: number,
    productosIds: readonly number[],
    tasaGeneral?: Prisma.Decimal,
  ) {
    const productos = await tx.producto.findMany({
      where: { tenantId, estado: true, id: { in: [...productosIds] } },
      select: {
        id: true,
        nombre: true,
        presentacion: true,
        sku: true,
        codigoBarras: true,
        precio: true,
        unidadVenta: true,
        ivaTarifaCero: true,
        categoria: { select: { id: true, nombre: true, modulo: true } },
      },
    });
    const porId = new Map(productos.map((producto) => [producto.id, producto]));
    return productosIds.map((id) => {
      const producto = porId.get(id);
      if (!producto) throw new NotFoundException('Producto no encontrado');
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
        unidadVenta: producto.unidadVenta,
        ...(tasaGeneral && {
          tasaImpuesto: producto.ivaTarifaCero
            ? new Prisma.Decimal(0)
            : tasaGeneral,
        }),
      };
    });
  }

  async crearProducto(
    contexto: ContextoTienda,
    dto: CrearProductoDto,
    clave?: string,
  ) {
    const { tenantId, usuarioId, membresiaId } = contexto;
    const { stockInicial, ...ficha } = dto;
    const crear = async (
      tx: Prisma.TransactionClient,
      claveRecurso: string,
    ) => {
      if (ficha.ivaTarifaCero)
        await this.permisos.exigirPropietarioTienda(contexto, tx);
      if (stockInicial)
        await this.permisos.autorizar(contexto, 'store.inventory.receive', tx);
      const correlacionId = randomUUID();
      const producto = await this.fichas.create(
        tenantId,
        {
          ...ficha,
          nombre: ficha.nombre.trim(),
          precio: new Prisma.Decimal(ficha.precio),
          estado: ficha.estado ?? true,
        },
        0,
        tx,
      );
      await this.auditoria.registrar(tx, contexto, {
        accion: ACCIONES_AUDITORIA.PRODUCTOS_CREAR,
        entidadTipo: 'Producto',
        entidadId: producto.id,
        productoIds: [producto.id],
        correlacionId,
        datos: { nombre: producto.nombre, precio: producto.precio.toFixed(2) },
      });
      if (stockInicial) {
        const motivo = 'Existencias iniciales';
        const { entrada, lotes } = await this.inventario.registrarEntrada(
          tx,
          {
            tenantId,
            responsableId: membresiaId,
            clave: claveRecurso,
            correlacionId,
          },
          producto.id,
          'ENTRADA',
          motivo,
          [
            {
              ...stockInicial,
              codigo: 'ALTA-' + producto.id,
              costoUnitario: new Prisma.Decimal(stockInicial.costoUnitario),
            },
          ],
          { abrirSiVacio: true },
        );
        await this.auditoria.registrar(tx, contexto, {
          accion: ACCIONES_AUDITORIA.INVENTARIO_ENTRADA,
          entidadTipo: 'EntradaInventario',
          entidadId: entrada.id,
          motivo,
          correlacionId,
          productoIds: [producto.id],
          datos: { tipo: 'ENTRADA', loteIds: lotes.map(({ id }) => id) },
        });
      }
      return { recursoTipo: 'Producto', recursoId: producto.id };
    };
    if (!stockInicial && clave === undefined) {
      return this.escribirCatalogo(contexto, async (tx) => {
        const { recursoId } = await crear(tx, randomUUID());
        return this.detalleProducto(tx, tenantId, recursoId);
      });
    }
    const { recursoId } = await this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'catalogo.producto.alta',
        datos: {
          ...Object.fromEntries(
            Object.entries(ficha).filter(([, valor]) => valor !== undefined),
          ),
          stockInicial: stockInicial ? { ...stockInicial } : null,
        },
      },
      async (tx, claveRecurso) => {
        await this.permisos.autorizar(contexto, 'store.catalog.write', tx);
        return crear(tx, claveRecurso);
      },
    );
    return this.escribirCatalogo(contexto, (tx) =>
      this.detalleProducto(tx, tenantId, recursoId),
    );
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
      if (dto.ivaTarifaCero !== undefined) {
        await this.permisos.exigirPropietarioTienda(contexto, tx);
      }
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
      async (tx) => {
        const imagen = await this.imagenes.update(
          contexto.tenantId,
          productoId,
          imagenId,
          {
            ...dto,
            claveArchivo: dto.url === undefined ? undefined : null,
          },
          tx,
        );
        if (dto.url !== undefined) {
          await tx.archivoProductoImagen.deleteMany({
            where: { imagenId: imagen.id },
          });
        }
        return imagen;
      },
    );
  }

  guardarArchivoImagen(
    contexto: ContextoTienda,
    productoId: number,
    imagenId: number | null,
    dto: DatosArchivoImagenDto,
    contenido?: Buffer,
  ) {
    const tipo = tipoDeImagen(contenido);
    const clave = randomUUID();
    const datos = {
      url: 'catalogo/imagenes/archivo/' + clave,
      claveArchivo: clave,
      orden: dto.orden,
      textoAlternativo: dto.textoAlternativo?.trim() || null,
    };
    return this.escribirImagen(
      contexto,
      productoId,
      imagenId === null
        ? ACCIONES_AUDITORIA.IMAGENES_CREAR
        : ACCIONES_AUDITORIA.IMAGENES_EDITAR,
      async (tx) => {
        const { tenantId } = contexto;
        const imagen =
          imagenId === null
            ? await this.imagenes.create(tenantId, productoId, datos, tx)
            : await this.imagenes.update(
                tenantId,
                productoId,
                imagenId,
                datos,
                tx,
              );
        await tx.archivoProductoImagen.upsert({
          where: { imagenId: imagen.id },
          create: { imagenId: imagen.id, clave, tipo, contenido: contenido! },
          update: { clave, tipo, contenido: contenido! },
        });
        return imagen;
      },
    );
  }

  async obtenerArchivoImagen(clave: string) {
    const archivo = await this.prisma.archivoProductoImagen.findUnique({
      where: { clave },
      select: { tipo: true, contenido: true },
    });
    if (!archivo) throw new NotFoundException('Imagen no encontrada');
    return archivo;
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
