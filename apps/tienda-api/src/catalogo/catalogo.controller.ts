import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
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
  ProductoCategoriaParamDto,
} from './dto/categoria.dto';
import { CreateCatalogoDto } from './dto/create-catalogo.dto';
import { UpdateCatalogoDto } from './dto/update-catalogo.dto';

const validacionCategorias = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('catalogo')
export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  @Get('categorias')
  @RequierePermisoTienda('store.catalog.read')
  @UsePipes(validacionCategorias)
  listarCategorias(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ListaCategoriasDto,
  ) {
    return this.catalogoService.listarCategorias(contexto, filtros);
  }

  @Post('categorias')
  @RequierePermisoTienda('store.catalog.write')
  @UsePipes(validacionCategorias)
  crearCategoria(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() { nombre }: CrearCategoriaDto,
  ) {
    return this.catalogoService.crearCategoria(contexto, nombre);
  }

  @Patch('categorias/:categoriaId')
  @RequierePermisoTienda('store.catalog.write')
  @UsePipes(validacionCategorias)
  editarCategoria(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { categoriaId }: CategoriaParamDto,
    @Body() cambios: EditarCategoriaDto,
  ) {
    return this.catalogoService.editarCategoria(contexto, categoriaId, cambios);
  }

  @Put('productos/:productoId/categoria')
  @RequierePermisoTienda('store.catalog.write')
  @UsePipes(validacionCategorias)
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

  @Post()
  create(@Body() createCatalogoDto: CreateCatalogoDto) {
    return this.catalogoService.create(createCatalogoDto);
  }

  @Get()
  findAll() {
    return this.catalogoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.catalogoService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCatalogoDto: UpdateCatalogoDto,
  ) {
    return this.catalogoService.update(+id, updateCatalogoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.catalogoService.remove(+id);
  }
}
