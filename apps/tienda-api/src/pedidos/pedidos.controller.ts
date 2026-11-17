import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { PaginaTiendaDto } from '../comun/consulta-tienda.dto';
import { paginacion } from '../comun/operacion-tienda';
import { IdPortalDto } from '../portal/portal.dto';
import { ClientePortalActual, PortalGuard } from '../portal/portal.guard';
import type { ClientePortal } from '../portal/portal.service';
import {
  CancelarPedidoDto,
  ConfirmarPedidoDto,
  EntregarPedidoDto,
} from './pedidos.dto';
import { PedidosService } from './pedidos.service';

@Controller('pedidos')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Post()
  @UseGuards(PortalGuard)
  confirmar(
    @ClientePortalActual() cliente: ClientePortal,
    @Body() datos: ConfirmarPedidoDto,
    @Headers('idempotency-key') clave?: string,
  ) {
    return this.pedidos.confirmar(cliente, datos.carritoId, clave);
  }

  @Get()
  @UseGuards(PortalGuard)
  listar(
    @ClientePortalActual() cliente: ClientePortal,
    @Query() { pagina, limite }: PaginaTiendaDto,
  ) {
    const { skip, take } = paginacion(pagina, limite);
    return this.pedidos.listar(
      cliente.tenantId,
      skip,
      take,
      cliente.clienteComercialId,
    );
  }

  @Get('operacion')
  @RequierePermisoTienda('store.sales.read')
  operacion(
    @ContextoTiendaActual() staff: ContextoTienda,
    @Query() { pagina, limite }: PaginaTiendaDto,
  ) {
    const { skip, take } = paginacion(pagina, limite);
    return this.pedidos.listar(staff.tenantId, skip, take);
  }

  @Get('operacion/:id')
  @RequierePermisoTienda('store.sales.read')
  detalleOperacion(
    @ContextoTiendaActual() staff: ContextoTienda,
    @Param() { id }: IdPortalDto,
  ) {
    return this.pedidos.obtener(staff.tenantId, id);
  }

  @Get(':id')
  @UseGuards(PortalGuard)
  detalle(
    @ClientePortalActual() cliente: ClientePortal,
    @Param() { id }: IdPortalDto,
  ) {
    return this.pedidos.obtener(
      cliente.tenantId,
      id,
      cliente.clienteComercialId,
    );
  }

  @Delete(':id')
  @UseGuards(PortalGuard)
  cancelar(
    @ClientePortalActual() cliente: ClientePortal,
    @Param() { id }: IdPortalDto,
    @Body() datos: CancelarPedidoDto,
  ) {
    return this.pedidos.cancelar(cliente, id, datos.motivo);
  }

  @Patch(':id/preparacion')
  @RequierePermisoTienda('store.sales.create')
  preparar(
    @ContextoTiendaActual() staff: ContextoTienda,
    @Param() { id }: IdPortalDto,
  ) {
    return this.pedidos.preparar(staff, id);
  }

  @Delete('operacion/:id')
  @RequierePermisoTienda('store.sales.create')
  cancelarOperacion(
    @ContextoTiendaActual() staff: ContextoTienda,
    @Param() { id }: IdPortalDto,
    @Body() datos: CancelarPedidoDto,
  ) {
    return this.pedidos.cancelar(staff, id, datos.motivo);
  }

  @Post(':id/entrega')
  @HttpCode(200)
  @RequierePermisoTienda('store.sales.create')
  entregar(
    @ContextoTiendaActual() staff: ContextoTienda,
    @Param() { id }: IdPortalDto,
    @Body() datos: EntregarPedidoDto,
    @Headers('idempotency-key') clave?: string,
  ) {
    return this.pedidos.entregar(staff, id, datos, clave);
  }
}
