import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { getTenantIdOrThrow } from '../tenant/tenant-context.util';
import { ClienteService } from './cliente.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { LinkZkbioPersonDto } from './dto/link-zkbio-person.dto';
import { RegisterClienteDto } from './dto/register-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Controller('cliente')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClienteController {
  constructor(private readonly clienteService: ClienteService) {}

  private parseOptionalBoolean(value?: string): boolean | undefined {
    if (value === undefined) return undefined;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;

    return undefined;
  }

  @Post()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  create(@Body() dto: CreateClienteDto, @Request() req) {
    return this.clienteService.create(dto, getTenantIdOrThrow(req.user));
  }

  @Post('registro')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  registro(@Body() dto: RegisterClienteDto, @Request() req) {
    return this.clienteService.registrar(dto, getTenantIdOrThrow(req.user));
  }

  @Get()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.ENTRENADOR)
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search = '',
    @Query('activo') activo?: string,
    @Query('incluirInactivos') incluirInactivos?: string,
    @Request() req?,
  ) {
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;
    const activoFilter = this.parseOptionalBoolean(activo);
    const incluirInactivosFilter =
      this.parseOptionalBoolean(incluirInactivos) ?? false;

    try {
      const startTime = Date.now();
      const result = await this.clienteService.findAll(
        pageNumber,
        limitNumber,
        search,
        {
          activo: activoFilter,
          incluirInactivos: incluirInactivosFilter,
        },
        getTenantIdOrThrow(req.user),
      );
      const duration = Date.now() - startTime;
      console.log(
        `[Clientes] findAll completado en ${duration}ms - Pagina: ${pageNumber}, Limite: ${limitNumber}, Busqueda: "${search}", activo: ${activoFilter ?? 'default'}, incluirInactivos: ${incluirInactivosFilter}`,
      );
      return result;
    } catch (error) {
      console.error('[Clientes] Error en findAll:', error);
      throw error;
    }
  }

  @Get('recientes')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.ENTRENADOR)
  findRecientes(@Query('limit') limit = '10', @Request() req) {
    return this.clienteService.findRecientes(
      Number(limit) || 10,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get('mi-perfil')
  @Roles(Role.CLIENTE)
  async getMiPerfil(@Request() req) {
    const usuarioId = req.user.sub;
    return this.clienteService.findByUsuarioId(
      usuarioId,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.ENTRENADOR)
  findOne(@Param('id') id: string, @Request() req) {
    return this.clienteService.findOne(+id, getTenantIdOrThrow(req.user));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClienteDto,
    @Request() req,
  ) {
    return this.clienteService.update(+id, dto, getTenantIdOrThrow(req.user));
  }

  @Patch(':id/zkbio-link')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  linkZkbioPerson(
    @Param('id') id: string,
    @Body() dto: LinkZkbioPersonDto,
    @Request() req,
  ) {
    return this.clienteService.linkZkbioPerson(
      +id,
      dto.zkbioPersonId,
      getTenantIdOrThrow(req.user),
    );
  }

  @Patch(':id/desactivar')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  desactivar(@Param('id') id: string, @Request() req) {
    return this.clienteService.desactivar(+id, getTenantIdOrThrow(req.user));
  }

  @Patch(':id/reactivar')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  reactivar(@Param('id') id: string, @Request() req) {
    return this.clienteService.reactivar(+id, getTenantIdOrThrow(req.user));
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string, @Request() req) {
    return this.clienteService.desactivar(+id, getTenantIdOrThrow(req.user));
  }
}
