import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { AuditoriaService } from './auditoria.service';
import { ConsultaAuditoriaDto } from './dto/consulta-auditoria.dto';

@Controller('auditoria')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  @RequierePermisoTienda('store.audit.read')
  listar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ConsultaAuditoriaDto,
  ) {
    return this.auditoriaService.listar(contexto, filtros);
  }

  @Get('actividad-reciente')
  @RequierePermisoTienda('store.audit.read')
  actividadReciente(@ContextoTiendaActual() contexto: ContextoTienda) {
    return this.auditoriaService.actividadReciente(contexto);
  }

  @Get(':correlacionId')
  @RequierePermisoTienda('store.audit.read')
  detalle(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param('correlacionId', ParseUUIDPipe) correlacionId: string,
  ) {
    return this.auditoriaService.detalle(contexto, correlacionId);
  }
}
