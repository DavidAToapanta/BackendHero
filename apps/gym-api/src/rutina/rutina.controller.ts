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
import { RutinaService } from './rutina.service';
import { CreateRutinaDto } from './dto/create-rutina.dto';
import { UpdateRutinaDto } from './dto/update-rutina.dto';

@Controller('rutina')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RutinaController {
  constructor(private readonly rutinaService: RutinaService) {}

  @Post()
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  create(@Body() dto: CreateRutinaDto, @Request() req) {
    return this.rutinaService.create(dto, getTenantIdOrThrow(req.user));
  }

  @Get()
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  findAll(@Request() req) {
    return this.rutinaService.findAll(getTenantIdOrThrow(req.user));
  }

  @Get('cliente/:clienteId')
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  findByCliente(@Param('clienteId') clienteId: string, @Request() req) {
    return this.rutinaService.findByCliente(
      +clienteId,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  findOne(@Param('id') id: string, @Request() req) {
    return this.rutinaService.findOne(+id, getTenantIdOrThrow(req.user));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRutinaDto,
    @Request() req,
  ) {
    return this.rutinaService.update(+id, dto, getTenantIdOrThrow(req.user));
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.ENTRENADOR)
  remove(@Param('id') id: string, @Request() req) {
    return this.rutinaService.remove(+id, getTenantIdOrThrow(req.user));
  }
}
