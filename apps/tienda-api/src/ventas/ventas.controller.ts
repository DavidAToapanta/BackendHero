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
import { DevolucionesOperacionService } from '../devoluciones/devoluciones-operacion.service';
import {
  AnularVentaDto,
  DevolucionParamDto,
} from '../devoluciones/dto/create-devolucion.dto';
import { VentaMostradorService } from './venta-mostrador.service';
import { VentasService } from './ventas.service';
import { CreateVentaCreditoDto, CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';

const validarVenta = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('ventas')
export class VentasController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly mostrador: VentaMostradorService,
    private readonly auditoria: AuditoriaEscrituraService,
    private readonly devoluciones: DevolucionesOperacionService,
  ) {}

  @Post()
  @RequierePermisoTienda('store.sales.create')
  @UsePipes(validarVenta)
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

  @Post('credito')
  @RequierePermisoTienda('store.sales.create', 'store.sales.credit')
  @UsePipes(validarVenta)
  confirmarCredito(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() datos: CreateVentaCreditoDto,
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

  @Post(':id/anulacion')
  @RequierePermisoTienda('store.sales.void')
  @UsePipes(validarVenta)
  anular(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: DevolucionParamDto,
    @Body() datos: AnularVentaDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    const correlacionId = randomUUID();
    return this.devoluciones.anular(
      this.auditoria.paraOperacion(contexto, correlacionId),
      {
        ...datos,
        ventaId: id,
        lineas: datos.lineas ?? [],
        liberar: datos.liberar ?? [],
      },
      clave,
      correlacionId,
    );
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
