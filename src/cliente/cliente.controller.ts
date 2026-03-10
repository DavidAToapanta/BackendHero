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
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { ClienteService } from './cliente.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Controller('cliente')
@UseGuards(JwtAuthGuard)
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
  create(@Body() dto: CreateClienteDto) {
    return this.clienteService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.ENTRENADOR)
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search = '',
    @Query('activo') activo?: string,
    @Query('incluirInactivos') incluirInactivos?: string,
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
  findRecientes(@Query('limit') limit = '10') {
    return this.clienteService.findRecientes(Number(limit) || 10);
  }

  @Get('mi-perfil')
  @Roles(Role.CLIENTE)
  async getMiPerfil(@Request() req) {
    const usuarioId = req.user.sub;
    return this.clienteService.findByUsuarioId(usuarioId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA, Role.ENTRENADOR)
  findOne(@Param('id') id: string) {
    return this.clienteService.findOne(+id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  update(@Param('id') id: string, @Body() dto: UpdateClienteDto) {
    return this.clienteService.update(+id, dto);
  }

  @Patch(':id/desactivar')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  desactivar(@Param('id') id: string) {
    return this.clienteService.desactivar(+id);
  }

  @Patch(':id/reactivar')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  reactivar(@Param('id') id: string) {
    return this.clienteService.reactivar(+id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.clienteService.desactivar(+id);
  }
}
