import { randomUUID } from 'node:crypto';
import { PermisosService } from '@app/permisos';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { AuditoriaEscrituraService } from '../auditoria/auditoria-escritura';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { CobrosOperacionService } from './cobros-operacion.service';
import {
  CobroParamDto,
  ListaCobrosDto,
  RegistrarCobroDto,
} from './dto/operacion-cobro.dto';

@Controller('cobros')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CobrosController {
  constructor(
    private readonly cobros: CobrosOperacionService,
    private readonly auditoria: AuditoriaEscrituraService,
    private readonly permisos: PermisosService,
  ) {}

  @Post()
  @RequierePermisoTienda('store.payments.create')
  async registrar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() datos: RegistrarCobroDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    if (datos.cuentaId !== undefined) {
      await this.permisos.autorizar(contexto, 'store.receivables.collect');
    }
    return this.cobros.registrarYAplicar(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      datos,
      clave,
    );
  }

  @Get()
  @RequierePermisoTienda('store.payments.read')
  listar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ListaCobrosDto,
  ) {
    return this.cobros.listar(contexto.tenantId, filtros);
  }

  @Get(':id')
  @RequierePermisoTienda('store.payments.read')
  obtener(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: CobroParamDto,
  ) {
    return this.cobros.obtener(contexto.tenantId, id);
  }
}
