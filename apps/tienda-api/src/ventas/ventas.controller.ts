import { randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Patch,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { AuditoriaEscrituraService } from '../auditoria/auditoria-escritura';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { VentaMostradorService } from './venta-mostrador.service';
import { VentasService } from './ventas.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';

@Controller('ventas')
export class VentasController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly mostrador: VentaMostradorService,
    private readonly auditoria: AuditoriaEscrituraService,
  ) {}

  @Post()
  @RequierePermisoTienda('store.sales.create')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  confirmar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() datos: CreateVentaDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    const correlacionId = randomUUID();
    return this.mostrador.confirmar(
      this.auditoria.paraOperacion(contexto, correlacionId),
      datos,
      clave,
      correlacionId,
    );
  }

  @Get()
  findAll() {
    return this.ventasService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ventasService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateVentaDto: UpdateVentaDto) {
    return this.ventasService.update(+id, updateVentaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ventasService.remove(+id);
  }
}
