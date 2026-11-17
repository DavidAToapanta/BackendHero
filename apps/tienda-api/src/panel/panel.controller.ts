import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { ConsultaPanelService } from './consulta-panel.service';

class PeriodoPanelDto {
  @IsString()
  desde: string;

  @IsString()
  hasta: string;
}

@Controller('panel')
export class PanelController {
  constructor(private readonly consultas: ConsultaPanelService) {}

  @Get()
  @RequierePermisoTienda('store.panel.read')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  consultar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() periodo: PeriodoPanelDto,
  ) {
    return this.consultas.consultar(contexto, periodo);
  }
}
