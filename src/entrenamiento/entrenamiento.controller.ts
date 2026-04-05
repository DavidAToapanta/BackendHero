import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { getTenantIdOrThrow } from '../tenant/tenant-context.util';
import { EntrenamientoService } from './entrenamiento.service';
import { CreateEntrenamientoDto } from './dto/create-entrenamiento.dto';
import { UpdateEntrenamientoDto } from './dto/update-entrenamiento.dto';

@Controller('entrenamiento')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EntrenamientoController {
  constructor(private readonly entrenamientoService: EntrenamientoService) {}

  @Post()
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  create(@Body() dto: CreateEntrenamientoDto, @Request() req) {
    return this.entrenamientoService.create(dto, getTenantIdOrThrow(req.user));
  }

  @Get()
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  findAll(@Request() req) {
    return this.entrenamientoService.findAll(getTenantIdOrThrow(req.user));
  }

  @Get('rutina/:rutinaId')
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  findByRutina(@Param('rutinaId') rutinaId: string, @Request() req) {
    return this.entrenamientoService.findByRutina(
      +rutinaId,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  findOne(@Param('id') id: string, @Request() req) {
    return this.entrenamientoService.findOne(+id, getTenantIdOrThrow(req.user));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEntrenamientoDto,
    @Request() req,
  ) {
    return this.entrenamientoService.update(
      +id,
      dto,
      getTenantIdOrThrow(req.user),
    );
  }

  @Patch('finalizar/rutina/:rutinaId')
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  finalizarPorRutina(@Param('rutinaId') rutinaId: string, @Request() req) {
    return this.entrenamientoService.finalizarPorRutina(
      +rutinaId,
      getTenantIdOrThrow(req.user),
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  remove(@Param('id') id: string, @Request() req) {
    return this.entrenamientoService.remove(+id, getTenantIdOrThrow(req.user));
  }
}
