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
import { DeudaService } from './deuda.service';
import { CreateDeudaDto } from './dto/create-deuda.dto';
import { UpdateDeudaDto } from './dto/update-deuda.dto';

@Controller('deuda')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeudaController {
  constructor(private readonly deudaService: DeudaService) {}

  @Post()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  create(@Body() dto: CreateDeudaDto, @Request() req) {
    return this.deudaService.create(dto, getTenantIdOrThrow(req.user));
  }

  @Get()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findAll(@Request() req) {
    return this.deudaService.findAll(getTenantIdOrThrow(req.user));
  }

  @Get('deudores')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  deudoresList(@Request() req) {
    return this.deudaService.getDeudoresUnicos(getTenantIdOrThrow(req.user));
  }

  @Get('deudores/count')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  deudoresCount(@Request() req) {
    return this.deudaService.countDeudoresUnicos(getTenantIdOrThrow(req.user));
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findOne(@Param('id') id: string, @Request() req) {
    return this.deudaService.findOne(+id, getTenantIdOrThrow(req.user));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  update(@Param('id') id: string, @Body() dto: UpdateDeudaDto, @Request() req) {
    return this.deudaService.update(+id, dto, getTenantIdOrThrow(req.user));
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  remove(@Param('id') id: string, @Request() req) {
    return this.deudaService.remove(+id, getTenantIdOrThrow(req.user));
  }
}
