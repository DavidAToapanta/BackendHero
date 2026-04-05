import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { EstadisticasService } from './estadisticas.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { getTenantIdOrThrow } from '../tenant/tenant-context.util';

@Controller('estadisticas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RECEPCIONISTA)
export class EstadisticasController {
  constructor(private readonly estadisticasService: EstadisticasService) {}

  @Get('ingresos')
  async obtenerIngresos(
    @Query('periodo') periodo: 'dia' | 'mes' | 'anio',
    @Request() req,
  ) {
    const datos = await this.estadisticasService.obtenerIngresos(
      periodo || 'mes',
      getTenantIdOrThrow(req.user),
    );
    return {
      labels: datos.map((d) => d.label),
      data: datos.map((d) => d.total),
    };
  }
}
