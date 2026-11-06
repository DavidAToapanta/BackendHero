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
import { ClientePlanService } from './cliente-plan.service';
import { CreateClientePlanDto } from './dto/create-cliente-plan.dto';
import { UpdateClientePlanDto } from './dto/update-cliente-plan.dto';
import { CambiarPlanDto } from './dto/cambiar-plan.dto';

type TenantRequest = {
  user?: {
    tenantId?: number | null;
  };
};

@Controller('cliente-plan')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientePlanController {
  constructor(private readonly clientePlanService: ClientePlanService) {}

  @Post()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  create(@Body() dto: CreateClientePlanDto, @Request() req: TenantRequest) {
    return this.clientePlanService.create(dto, getTenantIdOrThrow(req.user));
  }

  @Get()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findAll(@Request() req: TenantRequest) {
    return this.clientePlanService.findAll(getTenantIdOrThrow(req.user));
  }

  @Get('activos')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  obtenerClientesActivos(@Request() req: TenantRequest) {
    return this.clientePlanService
      .contarClientesActivos(getTenantIdOrThrow(req.user))
      .then((cantidad) => ({ activos: cantidad }));
  }

  @Post(':id/cambiar-plan')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  cambiarPlan(
    @Param('id') id: string,
    @Body() dto: CambiarPlanDto,
    @Request() req: TenantRequest,
  ) {
    return this.clientePlanService.cambiarPlan(
      +id,
      dto,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findOne(@Param('id') id: string, @Request() req: TenantRequest) {
    return this.clientePlanService.findOne(+id, getTenantIdOrThrow(req.user));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientePlanDto,
    @Request() req: TenantRequest,
  ) {
    return this.clientePlanService.update(
      +id,
      dto,
      getTenantIdOrThrow(req.user),
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  remove(@Param('id') id: string, @Request() req: TenantRequest) {
    return this.clientePlanService.remove(+id, getTenantIdOrThrow(req.user));
  }

  @Post('renovar/:clienteId')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  renovarPlan(
    @Param('clienteId') clienteId: string,
    @Body() dto: CreateClientePlanDto,
    @Request() req: TenantRequest,
  ) {
    dto.clienteId = +clienteId;
    return this.clientePlanService.create(dto, getTenantIdOrThrow(req.user));
  }
}
