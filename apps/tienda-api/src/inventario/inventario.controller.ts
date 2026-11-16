import {
  Controller,
  Get,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { ProductoParamDto } from '../comun/consulta-tienda.dto';
import {
  LotesInventarioDto,
  MovimientosInventarioDto,
  ProductosInventarioDto,
} from './dto/consulta-inventario.dto';
import { InventarioService } from './inventario.service';

@Controller('inventario')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  @Get('productos')
  @RequierePermisoTienda('store.inventory.read')
  listarProductos(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ProductosInventarioDto,
  ) {
    return this.inventario.listarProductos(contexto, filtros);
  }

  @Get('productos/:productoId/lotes')
  @RequierePermisoTienda('store.inventory.read')
  listarLotes(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { productoId }: ProductoParamDto,
    @Query() filtros: LotesInventarioDto,
  ) {
    return this.inventario.listarLotes(contexto, productoId, filtros);
  }

  @Get('productos/:productoId/movimientos')
  @RequierePermisoTienda('store.inventory.read')
  listarMovimientos(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { productoId }: ProductoParamDto,
    @Query() filtros: MovimientosInventarioDto,
  ) {
    return this.inventario.listarMovimientos(contexto, productoId, filtros);
  }
}
