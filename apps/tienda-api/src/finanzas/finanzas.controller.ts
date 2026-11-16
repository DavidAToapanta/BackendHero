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
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { PeriodoComercialDto } from '../comun/consulta-tienda.dto';
import { ConsultaFinanzasService } from './consulta-finanzas.service';
import { FinanzasService } from './finanzas.service';
import { CreateFinanzaDto } from './dto/create-finanza.dto';
import { UpdateFinanzaDto } from './dto/update-finanza.dto';

@Controller('finanzas')
export class FinanzasController {
  constructor(
    private readonly finanzasService: FinanzasService,
    private readonly consulta: ConsultaFinanzasService,
  ) {}

  @Post()
  create(@Body() createFinanzaDto: CreateFinanzaDto) {
    return this.finanzasService.create(createFinanzaDto);
  }

  @Get()
  findAll() {
    return this.finanzasService.findAll();
  }

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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.finanzasService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFinanzaDto: UpdateFinanzaDto) {
    return this.finanzasService.update(+id, updateFinanzaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.finanzasService.remove(+id);
  }
}
