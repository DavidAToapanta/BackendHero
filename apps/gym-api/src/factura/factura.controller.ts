import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { getTenantIdOrThrow } from '../tenant/tenant-context.util';
import { FacturaService } from './factura.service';
import { DevolverFacturaDto } from './dto/devolver-factura.dto';

@Controller('facturas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacturaController {
  constructor(private facturaService: FacturaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findAll(
    @Query('estado') estado: string | undefined,
    @Query('clienteId') clienteId: string | undefined,
    @Query('cedula') cedula: string | undefined,
    @Query('desde') desde: string | undefined,
    @Query('hasta') hasta: string | undefined,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Request() req,
  ) {
    return this.facturaService.findAll(
      {
        estado,
        clienteId: clienteId ? Number(clienteId) : undefined,
        cedula,
        desde,
        hasta,
      },
      Number(page) || 1,
      Number(limit) || 10,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get('resumen')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  getResumen(@Request() req) {
    return this.facturaService.getResumen(getTenantIdOrThrow(req.user));
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.facturaService.findOne(id, getTenantIdOrThrow(req.user));
  }

  @Post(':id/devolver')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  devolver(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DevolverFacturaDto,
    @Request() req,
  ) {
    return this.facturaService.devolver(id, dto, getTenantIdOrThrow(req.user));
  }
}
