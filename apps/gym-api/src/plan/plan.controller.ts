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
import { PlanService } from './plan.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

type TenantRequest = {
  user?: {
    tenantId?: number | null;
  };
};

@Controller('plan')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Post()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  create(@Body() dto: CreatePlanDto, @Request() req: TenantRequest) {
    return this.planService.create(dto, getTenantIdOrThrow(req.user));
  }

  @Get()
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Request() req: TenantRequest,
  ) {
    return this.planService.findAll(
      Number(page) || 1,
      Number(limit) || 10,
      getTenantIdOrThrow(req.user),
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  findOne(@Param('id') id: string, @Request() req: TenantRequest) {
    return this.planService.findOne(+id, getTenantIdOrThrow(req.user));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @Request() req: TenantRequest,
  ) {
    return this.planService.update(+id, dto, getTenantIdOrThrow(req.user));
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RECEPCIONISTA)
  delete(@Param('id') id: string, @Request() req: TenantRequest) {
    return this.planService.delete(+id, getTenantIdOrThrow(req.user));
  }

  @Delete(':id/cascade')
  @Roles(Role.ADMIN)
  deleteWithCascade(@Param('id') id: string, @Request() req: TenantRequest) {
    return this.planService.deleteWithCascade(
      +id,
      getTenantIdOrThrow(req.user),
    );
  }
}
