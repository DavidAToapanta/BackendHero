import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
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
import { RegistrarEntradaInventarioDto } from './dto/entrada-inventario.dto';
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

  @Post('productos/:productoId/apertura')
  @RequierePermisoTienda('store.inventory.receive')
  abrirLotes(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { productoId }: ProductoParamDto,
    @Headers('idempotency-key') clave: string | undefined,
    @Body() datos: RegistrarEntradaInventarioDto,
  ) {
    return this.inventario.registrarEntrada(
      contexto,
      productoId,
      'APERTURA',
      clave,
      datos,
    );
  }

  @Post('productos/:productoId/entradas')
  @RequierePermisoTienda('store.inventory.receive')
  recibirLotes(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { productoId }: ProductoParamDto,
    @Headers('idempotency-key') clave: string | undefined,
    @Body() datos: RegistrarEntradaInventarioDto,
  ) {
    return this.inventario.registrarEntrada(
      contexto,
      productoId,
      'ENTRADA',
      clave,
      datos,
    );
  }
}
