import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { AuditoriaEscrituraService } from '../auditoria/auditoria-escritura';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { DevolucionesOperacionService } from './devoluciones-operacion.service';
import { DevolucionesService } from './devoluciones.service';
import {
  CreateDevolucionDto,
  DevolucionParamDto,
  ListaDevolucionesDto,
} from './dto/create-devolucion.dto';
import { VistaPreviaDevolucionDto } from './dto/vista-previa-devolucion.dto';

@Controller('devoluciones')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class DevolucionesController {
  constructor(
    private readonly consultas: DevolucionesService,
    private readonly operaciones: DevolucionesOperacionService,
    private readonly auditoria: AuditoriaEscrituraService,
  ) {}

  @Post()
  @RequierePermisoTienda('store.returns.write')
  devolver(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() datos: CreateDevolucionDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    const correlacionId = randomUUID();
    return this.operaciones.devolver(
      this.auditoria.paraOperacion(contexto, correlacionId),
      { ...datos, liberar: datos.liberar ?? [] },
      clave,
      correlacionId,
    );
  }

  @Get()
  @RequierePermisoTienda('store.returns.read')
  listar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ListaDevolucionesDto,
  ) {
    return this.consultas.listar(contexto.tenantId, filtros);
  }

  @Get('ventas/:id')
  @RequierePermisoTienda('store.returns.read')
  consultarVenta(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: DevolucionParamDto,
  ) {
    return this.consultas.consultarVenta(contexto.tenantId, id);
  }

  @Post('ventas/:id/vista-previa')
  @HttpCode(200)
  @RequierePermisoTienda('store.returns.read')
  vistaPrevia(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: DevolucionParamDto,
    @Body() datos: VistaPreviaDevolucionDto,
  ) {
    return this.consultas.vistaPrevia(contexto.tenantId, id, datos.lineas);
  }

  @Get(':id')
  @RequierePermisoTienda('store.returns.read')
  obtener(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: DevolucionParamDto,
  ) {
    return this.consultas.obtener(contexto.tenantId, id);
  }
}
