import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { PaginaTiendaDto } from '../comun/consulta-tienda.dto';
import { paginacion } from '../comun/operacion-tienda';
import { ClientePortalActual, PortalGuard } from './portal.guard';
import { IdPortalDto, LoginPortalDto, VincularPortalDto } from './portal.dto';
import { PortalService, type ClientePortal } from './portal.service';
import { CatalogoService } from '../catalogo/catalogo.service';
import { PaginacionCatalogoDto } from '../catalogo/dto/categoria.dto';

@Controller('portal')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly catalogo: CatalogoService,
  ) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() datos: LoginPortalDto) {
    return this.portal.login(datos);
  }

  @Post('verificar-cuenta')
  @HttpCode(200)
  verificar(@Body() datos: LoginPortalDto) {
    return this.portal.verificarParaVincular(datos);
  }

  @Post('clientes/:id/vinculacion')
  @RequierePermisoTienda('store.customers.write')
  vincular(
    @ContextoTiendaActual() staff: ContextoTienda,
    @Param() { id }: IdPortalDto,
    @Body() datos: VincularPortalDto,
  ) {
    return this.portal.vincular(staff, id, datos.prueba);
  }

  @Delete('clientes/:id/vinculacion')
  @HttpCode(204)
  @RequierePermisoTienda('store.customers.write')
  revocar(
    @ContextoTiendaActual() staff: ContextoTienda,
    @Param() { id }: IdPortalDto,
  ) {
    return this.portal.revocar(staff, id);
  }

  @Get('historial')
  @UseGuards(PortalGuard)
  historial(
    @ClientePortalActual() cliente: ClientePortal,
    @Query() { pagina, limite }: PaginaTiendaDto,
  ) {
    const { skip, take } = paginacion(pagina, limite);
    return this.portal.historial(cliente, skip, take);
  }

  @Get('comprobantes/:id/pdf')
  @UseGuards(PortalGuard)
  async comprobante(
    @ClientePortalActual() cliente: ClientePortal,
    @Param() { id }: IdPortalDto,
  ) {
    return new StreamableFile(await this.portal.comprobante(cliente, id), {
      type: 'application/pdf',
      disposition: 'attachment; filename="comprobante-' + id + '.pdf"',
    });
  }

  @Get('catalogo')
  @UseGuards(PortalGuard)
  productos(
    @ClientePortalActual() cliente: ClientePortal,
    @Query() filtros: PaginacionCatalogoDto,
  ) {
    return this.catalogo.buscarPortal(cliente.tenantId, filtros);
  }
}
