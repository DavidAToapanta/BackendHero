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
import { PagoService } from './pago.service';
import { CreatePagoDto } from './dto/create-pago.dto';
import { UpdatePagoDto } from './dto/update-pago.dto';

@Controller('pago')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PagoController {
  constructor(private readonly pagoService: PagoService) {}

  @Post()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  create(@Body() dto: CreatePagoDto, @Request() req) {
    return this.pagoService.create(dto, getTenantIdOrThrow(req.user));
  }

  @Get()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search = '',
    @Request() req,
  ) {
    return this.pagoService.findAll(
      Number(page) || 1,
      Number(limit) || 10,
      search,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get('ingresos-mes')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  async ingresosDelMes(@Request() req) {
    const total = await this.pagoService.obtenerIngresoDelMes(
      getTenantIdOrThrow(req.user),
    );
    return { ingresos: total };
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findOne(@Param('id') id: string, @Request() req) {
    return this.pagoService.findOne(+id, getTenantIdOrThrow(req.user));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  update(@Param('id') id: string, @Body() dto: UpdatePagoDto, @Request() req) {
    return this.pagoService.update(+id, dto, getTenantIdOrThrow(req.user));
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  remove(@Param('id') id: string, @Request() req) {
    return this.pagoService.remove(+id, getTenantIdOrThrow(req.user));
  }
}
