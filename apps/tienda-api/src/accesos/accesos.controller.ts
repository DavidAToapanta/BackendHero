import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ContextoTiendaActual,
  TiendaJwtGuard,
  type ContextoTienda,
} from '../auth';
import { AccesosService } from './accesos.service';
import {
  AltaPersonalDto,
  AsignarRolDto,
  CrearRolTiendaDto,
  EditarRolTiendaDto,
  EstadoPersonalDto,
  ListaPersonalDto,
  MembresiaParamDto,
  MotivoAccesoDto,
  PerfilPersonalDto,
  RolParamDto,
  VincularPersonalDto,
} from './dto/acceso.dto';
import { RequierePermisoTienda } from './permisos-tienda';

@Controller('accesos')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class AccesosController {
  constructor(private readonly accesos: AccesosService) {}

  @Post('roles/preparar')
  @HttpCode(200)
  @UseGuards(TiendaJwtGuard)
  preparar(@ContextoTiendaActual() contexto: ContextoTienda) {
    return this.accesos.preparar(contexto);
  }

  @Post('roles/activar')
  @HttpCode(200)
  @UseGuards(TiendaJwtGuard)
  activar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() { motivo }: MotivoAccesoDto,
  ) {
    return this.accesos.activar(contexto, motivo);
  }

  @Get('personal')
  @RequierePermisoTienda('store.staff.read')
  listarPersonal(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ListaPersonalDto,
  ) {
    return this.accesos.listarPersonal(contexto, filtros);
  }

  @Post('personal')
  @RequierePermisoTienda('store.staff.write', 'store.roles.manage')
  altaPersonal(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() datos: AltaPersonalDto,
  ) {
    return this.accesos.altaPersonal(contexto, datos);
  }

  @Post('personal/vincular')
  @RequierePermisoTienda('store.staff.write', 'store.roles.manage')
  vincularPersonal(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() datos: VincularPersonalDto,
  ) {
    return this.accesos.vincularPersonal(contexto, datos);
  }

  @Get('personal/:membresiaId')
  @RequierePermisoTienda('store.staff.read', 'store.staff.write')
  obtenerPersonal(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { membresiaId }: MembresiaParamDto,
  ) {
    return this.accesos.obtenerPersonal(contexto, membresiaId);
  }

  @Patch('personal/:membresiaId/perfil')
  @RequierePermisoTienda('store.staff.read', 'store.staff.write')
  editarPerfil(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { membresiaId }: MembresiaParamDto,
    @Body() datos: PerfilPersonalDto,
  ) {
    return this.accesos.editarPerfil(contexto, membresiaId, datos);
  }

  @Patch('personal/:membresiaId/estado')
  @RequierePermisoTienda('store.staff.write')
  cambiarEstado(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { membresiaId }: MembresiaParamDto,
    @Body() datos: EstadoPersonalDto,
  ) {
    return this.accesos.cambiarEstado(contexto, membresiaId, datos);
  }

  @Get('roles')
  @RequierePermisoTienda('store.roles.manage')
  listarRoles(@ContextoTiendaActual() contexto: ContextoTienda) {
    return this.accesos.listarRoles(contexto);
  }

  @Post('roles')
  @RequierePermisoTienda('store.roles.manage')
  crearRol(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() datos: CrearRolTiendaDto,
  ) {
    return this.accesos.crearRol(contexto, datos);
  }

  @Patch('roles/:rolId')
  @RequierePermisoTienda('store.roles.manage')
  editarRol(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { rolId }: RolParamDto,
    @Body() datos: EditarRolTiendaDto,
  ) {
    return this.accesos.editarRol(contexto, rolId, datos);
  }

  @Put('personal/:membresiaId/rol')
  @RequierePermisoTienda('store.roles.manage')
  asignarRol(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { membresiaId }: MembresiaParamDto,
    @Body() { rolId }: AsignarRolDto,
  ) {
    return this.accesos.asignarRol(contexto, membresiaId, rolId);
  }
}
