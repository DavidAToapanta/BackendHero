import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateSaasPlanDto } from './dto/update-saas-plan.dto';
import { TenantService } from './tenant.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create(dto);
  }

  @Get()
  findAll() {
    return this.tenantService.findAll();
  }

  @Get('legacy/default')
  findDefaultTenant() {
    return this.tenantService.findDefaultTenant();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tenantService.findOne(id);
  }

  @Patch(':id/saas-plan')
  updateSaasPlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSaasPlanDto,
  ) {
    return this.tenantService.updateSaasPlan(id, dto);
  }

  @Post(':id/bridge-key/rotate')
  rotateBridgeKey(@Param('id', ParseIntPipe) id: number) {
    return this.tenantService.rotateBridgeKey(id);
  }
}
