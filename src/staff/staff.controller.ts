import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { CreateStaffDto } from './dto/create-staff.dto';
import { ListStaffQueryDto } from './dto/list-staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffService } from './staff.service';

type TenantRequest = {
  user?: {
    tenantId?: number | null;
  };
};

@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  create(@Body() dto: CreateStaffDto, @Request() req: TenantRequest) {
    return this.staffService.create(dto, getTenantIdOrThrow(req.user));
  }

  @Get()
  findAll(@Query() query: ListStaffQueryDto, @Request() req: TenantRequest) {
    return this.staffService.findAll(
      {
        role: query.role,
        estado: query.estado,
      },
      getTenantIdOrThrow(req.user),
    );
  }

  @Get(':usuarioId')
  findOne(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Request() req: TenantRequest,
  ) {
    return this.staffService.findOne(usuarioId, getTenantIdOrThrow(req.user));
  }

  @Patch(':usuarioId')
  update(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body() dto: UpdateStaffDto,
    @Request() req: TenantRequest,
  ) {
    return this.staffService.update(
      usuarioId,
      dto,
      getTenantIdOrThrow(req.user),
    );
  }

  @Patch(':usuarioId/inactivar')
  inactivar(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Request() req: TenantRequest,
  ) {
    return this.staffService.inactivar(usuarioId, getTenantIdOrThrow(req.user));
  }

  @Patch(':usuarioId/reactivar')
  reactivar(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Request() req: TenantRequest,
  ) {
    return this.staffService.reactivar(usuarioId, getTenantIdOrThrow(req.user));
  }
}
