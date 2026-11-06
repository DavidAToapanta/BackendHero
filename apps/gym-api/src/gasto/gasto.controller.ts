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
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';
import { GastoService } from './gasto.service';

@Controller('gasto')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GastoController {
  constructor(private readonly gastoService: GastoService) {}

  @Post()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  create(@Body() dto: CreateGastoDto, @Request() req) {
    return this.gastoService.create(
      dto,
      req.user.sub,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findAll(@Request() req) {
    return this.gastoService.findAll(getTenantIdOrThrow(req.user));
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findOne(@Param('id') id: string, @Request() req) {
    return this.gastoService.findOne(+id, getTenantIdOrThrow(req.user));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  update(@Param('id') id: string, @Body() dto: UpdateGastoDto, @Request() req) {
    return this.gastoService.update(+id, dto, getTenantIdOrThrow(req.user));
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  remove(@Param('id') id: string, @Request() req) {
    return this.gastoService.remove(+id, getTenantIdOrThrow(req.user));
  }
}
