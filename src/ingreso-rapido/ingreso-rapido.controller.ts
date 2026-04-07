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
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { getTenantIdOrThrow } from '../tenant/tenant-context.util';
import { CreateIngresoRapidoDto } from './dto/create-ingreso-rapido.dto';
import { UpdateIngresoRapidoDto } from './dto/update-ingreso-rapido.dto';
import { IngresoRapidoService } from './ingreso-rapido.service';

@Controller('ingresos-rapidos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RECEPCIONISTA)
export class IngresoRapidoController {
  constructor(private readonly ingresoRapidoService: IngresoRapidoService) {}

  @Post()
  create(@Body() dto: CreateIngresoRapidoDto, @Request() req) {
    return this.ingresoRapidoService.create(dto, getTenantIdOrThrow(req.user));
  }

  @Get()
  findAll(@Request() req) {
    return this.ingresoRapidoService.findAll(getTenantIdOrThrow(req.user));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.ingresoRapidoService.findOne(+id, getTenantIdOrThrow(req.user));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIngresoRapidoDto,
    @Request() req,
  ) {
    return this.ingresoRapidoService.update(
      +id,
      dto,
      getTenantIdOrThrow(req.user),
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.ingresoRapidoService.remove(+id, getTenantIdOrThrow(req.user));
  }
}
