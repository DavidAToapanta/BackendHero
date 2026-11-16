import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { ConsultaPanelService } from './consulta-panel.service';
import { PanelService } from './panel.service';
import { CreatePanelDto } from './dto/create-panel.dto';
import { UpdatePanelDto } from './dto/update-panel.dto';

class PeriodoPanelDto {
  @IsString()
  desde: string;

  @IsString()
  hasta: string;
}

@Controller('panel')
export class PanelController {
  constructor(
    private readonly panelService: PanelService,
    private readonly consultas: ConsultaPanelService,
  ) {}

  @Post()
  create(@Body() createPanelDto: CreatePanelDto) {
    return this.panelService.create(createPanelDto);
  }

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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.panelService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePanelDto: UpdatePanelDto) {
    return this.panelService.update(+id, updatePanelDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.panelService.remove(+id);
  }
}
