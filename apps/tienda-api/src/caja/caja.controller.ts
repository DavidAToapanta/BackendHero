import { randomUUID } from 'node:crypto';
import { PermisosService } from '@app/permisos';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { AuditoriaEscrituraService } from '../auditoria/auditoria-escritura';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { CajaService } from './caja.service';
import {
  AbrirTurnoDto,
  CajaParamDto,
  CerrarTurnoDto,
  ConfigurarCajaDto,
  EditarCajaDto,
  ListaCajasDto,
  ListaMovimientosDto,
  MovimientoCajaDto,
} from './dto/operacion-caja.dto';

@Controller('caja')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CajaController {
  constructor(
    private readonly caja: CajaService,
    private readonly auditoria: AuditoriaEscrituraService,
    private readonly permisos: PermisosService,
  ) {}

  @Post()
  @RequierePermisoTienda('store.cash.manage')
  crear(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() datos: ConfigurarCajaDto,
  ) {
    return this.caja.configurar(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      datos,
    );
  }

  @Get()
  @RequierePermisoTienda('store.cash.read')
  async listar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ListaCajasDto,
  ) {
    const cajas = await this.caja.listarCajas(
      contexto.tenantId,
      filtros.disponibles === 'true',
    );
    return cajas.map(({ turnoCaja_caja, ...caja }) => ({
      ...caja,
      disponible: caja.activo && turnoCaja_caja.length === 0,
    }));
  }

  @Get(':id')
  @RequierePermisoTienda('store.cash.read')
  obtenerCaja(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: CajaParamDto,
  ) {
    return this.caja.obtenerCaja(contexto.tenantId, id);
  }

  @Patch(':id')
  @RequierePermisoTienda('store.cash.manage')
  editar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: CajaParamDto,
    @Body() datos: EditarCajaDto,
  ) {
    if (Object.values(datos).every((valor) => valor === undefined)) {
      throw new BadRequestException('Indique al menos un campo para editar');
    }
    return this.caja.configurar(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      datos,
      id,
    );
  }

  @Delete(':id')
  @RequierePermisoTienda('store.cash.manage')
  desactivar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: CajaParamDto,
  ) {
    return this.caja.configurar(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      { activo: false },
      id,
    );
  }

  @Post(':id/turnos')
  @RequierePermisoTienda('store.cash.open')
  abrir(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: CajaParamDto,
    @Body() { fondoInicial }: AbrirTurnoDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    return this.caja.abrirTurno(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      id,
      fondoInicial,
      clave,
    );
  }

  @Get(':id/turno-activo')
  @RequierePermisoTienda('store.cash.read')
  async obtenerActivo(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: CajaParamDto,
  ) {
    await this.caja.obtenerCaja(contexto.tenantId, id);
    const turno = await this.caja.turnoActivo(contexto.tenantId, id);
    if (!turno) throw new NotFoundException('La caja no tiene un turno activo');
    await this.verificarAlcanceTurno(contexto, turno.cajeroId);
    return turno;
  }

  @Get('turnos/:id')
  @RequierePermisoTienda('store.cash.read')
  async obtenerTurno(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: CajaParamDto,
  ) {
    const turno = await this.caja.obtenerTurno(contexto.tenantId, id);
    await this.verificarAlcanceTurno(contexto, turno.cajeroId);
    return turno;
  }

  @Get('turnos/:id/movimientos')
  @RequierePermisoTienda('store.cash.read')
  async movimientos(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: CajaParamDto,
    @Query() filtros: ListaMovimientosDto,
  ) {
    const turno = await this.caja.obtenerTurno(contexto.tenantId, id);
    await this.verificarAlcanceTurno(contexto, turno.cajeroId);
    return this.caja.listarMovimientos(
      contexto.tenantId,
      id,
      filtros.pagina,
      filtros.limite,
    );
  }

  @Post('turnos/:id/movimientos')
  @RequierePermisoTienda('store.cash.movements.write')
  mover(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: CajaParamDto,
    @Body() datos: MovimientoCajaDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    return this.caja.moverEfectivo(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      { ...datos, turnoId: id },
      clave,
    );
  }

  @Post('turnos/:id/cierre')
  @HttpCode(200)
  @RequierePermisoTienda('store.cash.close')
  async cerrar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: CajaParamDto,
    @Body() datos: CerrarTurnoDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    const turno = await this.caja.obtenerTurno(contexto.tenantId, id);
    const supervisado = await this.verificarAlcanceTurno(
      contexto,
      turno.cajeroId,
    );
    return this.caja.cerrarTurno(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      { ...datos, turnoId: id },
      clave,
      supervisado,
    );
  }

  private async verificarAlcanceTurno(
    contexto: ContextoTienda,
    cajeroId: number,
  ) {
    const esAjeno = contexto.membresiaId !== cajeroId;
    if (esAjeno) await this.permisos.autorizar(contexto, 'store.cash.manage');
    return esAjeno;
  }
}
