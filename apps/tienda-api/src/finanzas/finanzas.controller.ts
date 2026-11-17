import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { PeriodoComercialDto } from '../comun/consulta-tienda.dto';
import { ConsultaFinanzasService } from './consulta-finanzas.service';

@Controller('finanzas')
export class FinanzasController {
  constructor(private readonly consulta: ConsultaFinanzasService) {}

  @Get('resumen')
  @RequierePermisoTienda('store.reports.read')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  resumen(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() periodo: PeriodoComercialDto,
  ) {
    return this.consulta.consultar(contexto.tenantId, periodo);
  }
}
