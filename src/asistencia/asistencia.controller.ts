import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { getTenantIdOrThrow } from '../tenant/tenant-context.util';
import { AsistenciaService } from './asistencia.service';
import { CreateAsistenciaDto } from './dto/create-asistencia.dto';
import { MarcarAsistenciaDto } from './dto/marcar-asistencia.dto';

@Controller('asistencia')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AsistenciaController {
  constructor(private readonly asistenciaService: AsistenciaService) {}

  private getClienteIdOrThrow(req) {
    const clienteId = Number(req.user?.clienteId);

    if (!clienteId || Number.isNaN(clienteId)) {
      throw new UnauthorizedException(
        'No se pudo resolver el cliente de la sesion',
      );
    }

    return clienteId;
  }

  @Post('registrar/:clienteId')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.ENTRENADOR)
  registrar(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Request() req,
  ) {
    return this.asistenciaService.registrarAsistencia(
      clienteId,
      getTenantIdOrThrow(req.user),
    );
  }

  @Post()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.CLIENTE)
  marcarAsistencia(@Body() dto: MarcarAsistenciaDto, @Request() req) {
    const usuarioId =
      req.user?.rol === Role.CLIENTE ? Number(req.user.sub) : dto.usuarioId;

    return this.asistenciaService.marcarAsistencia(
      usuarioId,
      getTenantIdOrThrow(req.user),
    );
  }

  @Post('historica')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPCIONISTA)
  registrarHistorica(@Body() dto: CreateAsistenciaDto, @Request() req) {
    return this.asistenciaService.registrarAsistenciaHistorica(
      dto.clienteId,
      dto.fecha,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get('mi-historial')
  @Roles(Role.CLIENTE)
  miHistorial(@Request() req) {
    return this.asistenciaService.historial(
      this.getClienteIdOrThrow(req),
      getTenantIdOrThrow(req.user),
    );
  }

  @Get('historial/:clienteId')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.ENTRENADOR)
  historial(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Request() req,
  ) {
    return this.asistenciaService.historial(
      clienteId,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get('todas')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.ENTRENADOR)
  todas(@Request() req) {
    return this.asistenciaService.todas(getTenantIdOrThrow(req.user));
  }

  @Get()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.ENTRENADOR)
  findAll(@Request() req) {
    return this.asistenciaService.findAll(getTenantIdOrThrow(req.user));
  }

  @Get('mi-estadisticas')
  @Roles(Role.CLIENTE)
  miEstadisticas(@Request() req) {
    return this.asistenciaService.getEstadisticasPorPlan(
      this.getClienteIdOrThrow(req),
      getTenantIdOrThrow(req.user),
    );
  }

  @Get('estadisticas/:clienteId')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.ENTRENADOR)
  estadisticas(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Request() req,
  ) {
    return this.asistenciaService.getEstadisticasPorPlan(
      clienteId,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get('cliente/:clienteId')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.ENTRENADOR)
  findByCliente(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Request() req,
  ) {
    return this.asistenciaService.findByCliente(
      clienteId,
      getTenantIdOrThrow(req.user),
    );
  }
}
