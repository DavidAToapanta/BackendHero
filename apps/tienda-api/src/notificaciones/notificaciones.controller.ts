import {
  Controller,
  Get,
  Headers,
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
import { NotificacionesService } from './notificaciones.service';

@Controller('notificaciones')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Post('cartera/:id/recordatorio')
  @RequierePermisoTienda('store.receivables.collect')
  recordar(
    @ContextoTiendaActual() staff: ContextoTienda,
    @Param() { id }: IdPortalDto,
    @Headers('idempotency-key') clave?: string,
  ) {
    return this.notificaciones.recordar(staff, id, clave);
  }

  @Get()
  @UseGuards(PortalGuard)
  listar(
    @ClientePortalActual() cliente: ClientePortal,
    @Query() { pagina, limite }: PaginaTiendaDto,
  ) {
    const { skip, take } = paginacion(pagina, limite);
    return this.notificaciones.listar(cliente, skip, take);
  }

  @Get(':id')
  @UseGuards(PortalGuard)
  obtener(
    @ClientePortalActual() cliente: ClientePortal,
    @Param() { id }: IdPortalDto,
  ) {
    return this.notificaciones.obtener(cliente, id);
  }

  @Patch(':id')
  @UseGuards(PortalGuard)
  marcarLeida(
    @ClientePortalActual() cliente: ClientePortal,
    @Param() { id }: IdPortalDto,
  ) {
    return this.notificaciones.marcarLeida(cliente, id);
  }
}
