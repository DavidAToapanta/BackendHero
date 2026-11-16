import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { CatalogoService } from './catalogo.service';
import {
  AsignarCategoriaDto,
  CategoriaParamDto,
  CrearCategoriaDto,
  EditarCategoriaDto,
  ListaCategoriasDto,
  PaginacionCatalogoDto,
  ProductoCategoriaParamDto,
} from './dto/categoria.dto';
import {
  CodigoBarrasDto,
  CrearImagenDto,
  CrearProductoDto,
  EditarImagenDto,
  EditarProductoDto,
  ImagenParamDto,
  ListaProductosDto,
} from './dto/producto.dto';

const validacionCatalogo = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('catalogo')
@UsePipes(validacionCatalogo)
export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  @Get('categorias')
  @RequierePermisoTienda('store.catalog.read')
  listarCategorias(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ListaCategoriasDto,
  ) {
    return this.catalogoService.listarCategorias(contexto, filtros);
  }

  @Post('categorias')
  @RequierePermisoTienda('store.catalog.write')
  crearCategoria(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() { nombre }: CrearCategoriaDto,
  ) {
    return this.catalogoService.crearCategoria(contexto, nombre);
  }

  @Patch('categorias/:categoriaId')
  @RequierePermisoTienda('store.catalog.write')
  editarCategoria(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { categoriaId }: CategoriaParamDto,
    @Body() cambios: EditarCategoriaDto,
  ) {
    return this.catalogoService.editarCategoria(contexto, categoriaId, cambios);
  }

  @Put('productos/:productoId/categoria')
  @RequierePermisoTienda('store.catalog.write')
  asignarCategoria(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { productoId }: ProductoCategoriaParamDto,
    @Body() { categoriaId }: AsignarCategoriaDto,
  ) {
    return this.catalogoService.asignarCategoria(
      contexto,
      productoId,
      categoriaId,
    );
  }

  @Get('productos')
  @RequierePermisoTienda('store.catalog.read')
  listarProductos(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ListaProductosDto,
  ) {
    return this.catalogoService.listarProductos(contexto, filtros);
  }

  @Get('productos/mostrador')
  @RequierePermisoTienda('store.catalog.read')
  buscarMostrador(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: PaginacionCatalogoDto,
  ) {
    return this.catalogoService.buscarMostrador(contexto, filtros);
  }

  @Get('productos/mostrador/por-barras')
  @RequierePermisoTienda('store.catalog.read')
  buscarPorBarras(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() { codigoBarras }: CodigoBarrasDto,
  ) {
    return this.catalogoService.buscarPorBarras(contexto, codigoBarras);
  }

  @Get('productos/:productoId')
  @RequierePermisoTienda('store.catalog.read')
  obtenerProducto(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { productoId }: ProductoCategoriaParamDto,
  ) {
    return this.catalogoService.obtenerProducto(contexto, productoId);
  }

  @Post('productos')
  @RequierePermisoTienda('store.catalog.write')
  crearProducto(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() dto: CrearProductoDto,
  ) {
    return this.catalogoService.crearProducto(contexto, dto);
  }

  @Patch('productos/:productoId')
  @RequierePermisoTienda('store.catalog.write')
  editarProducto(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { productoId }: ProductoCategoriaParamDto,
    @Body() dto: EditarProductoDto,
  ) {
    return this.catalogoService.editarProducto(contexto, productoId, dto);
  }

  @Post('productos/:productoId/imagenes')
  @RequierePermisoTienda('store.catalog.write')
  crearImagen(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { productoId }: ProductoCategoriaParamDto,
    @Body() dto: CrearImagenDto,
  ) {
    return this.catalogoService.crearImagen(contexto, productoId, dto);
  }

  @Patch('productos/:productoId/imagenes/:imagenId')
  @RequierePermisoTienda('store.catalog.write')
  editarImagen(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { productoId, imagenId }: ImagenParamDto,
    @Body() dto: EditarImagenDto,
  ) {
    return this.catalogoService.editarImagen(
      contexto,
      productoId,
      imagenId,
      dto,
    );
  }

  @Delete('productos/:productoId/imagenes/:imagenId')
  @HttpCode(204)
  @RequierePermisoTienda('store.catalog.write')
  async eliminarImagen(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { productoId, imagenId }: ImagenParamDto,
  ) {
    await this.catalogoService.eliminarImagen(contexto, productoId, imagenId);
  }
}
