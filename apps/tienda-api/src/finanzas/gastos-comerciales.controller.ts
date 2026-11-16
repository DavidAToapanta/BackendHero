import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { AuditoriaEscrituraService } from '../auditoria/auditoria-escritura';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { ListaGastosDto, RegistrarGastoDto } from './dto/gasto-comercial.dto';
import { GastosComercialesService } from './gastos-comerciales.service';

@Controller('finanzas/gastos')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class GastosComercialesController {
  constructor(
    private readonly gastos: GastosComercialesService,
    private readonly auditoria: AuditoriaEscrituraService,
  ) {}

  @Post()
  @RequierePermisoTienda('store.expenses.write')
  registrar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() datos: RegistrarGastoDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    return this.gastos.registrar(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      {
        ...datos,
        fecha: datos.fecha === undefined ? undefined : new Date(datos.fecha),
      },
      clave,
    );
  }

  @Get()
  @RequierePermisoTienda('store.expenses.read')
  listar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ListaGastosDto,
  ) {
    return this.gastos.listar(contexto.tenantId, {
      desde: filtros.desde === undefined ? undefined : new Date(filtros.desde),
      hasta: filtros.hasta === undefined ? undefined : new Date(filtros.hasta),
      pagina: filtros.pagina,
      limite: filtros.limite,
    });
  }
}
