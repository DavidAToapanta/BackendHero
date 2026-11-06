import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { BridgeTenantAuthGuard } from '../bridge-auth/bridge-tenant-auth.guard';
import { SyncZkbioDto } from './dto/sync-zkbio.dto';
import { ZkbioService } from './zkbio.service';

type BridgeTenantRequest = Request & {
  bridgeTenant?: { id: number };
};

@Controller('integrations/zkbio')
export class ZkbioController {
  constructor(private readonly zkbioService: ZkbioService) {}

  @Get('access-state')
  @UseGuards(BridgeTenantAuthGuard)
  accessState(
    @Req() req: BridgeTenantRequest,
    @Query('tenantId') tenantId?: string,
    @Headers('x-tenant-id') tenantHeaderId?: string,
  ) {
    if (tenantId !== undefined || tenantHeaderId !== undefined) {
      throw new BadRequestException(
        'tenantId no se acepta; el tenant se resuelve solo por x-bridge-key',
      );
    }

    return this.zkbioService.getAccessState(Number(req.bridgeTenant?.id));
  }

  @Post('sync')
  @UseGuards(BridgeTenantAuthGuard)
  sync(
    @Body() dto: SyncZkbioDto,
    @Req() req: BridgeTenantRequest,
    @Query('tenantId') tenantId?: string,
    @Headers('x-tenant-id') tenantHeaderId?: string,
  ) {
    if (tenantId !== undefined || tenantHeaderId !== undefined) {
      throw new BadRequestException(
        'tenantId no se acepta; el tenant se resuelve solo por x-bridge-key',
      );
    }

    return this.zkbioService.sync(dto, Number(req.bridgeTenant?.id));
  }
}
