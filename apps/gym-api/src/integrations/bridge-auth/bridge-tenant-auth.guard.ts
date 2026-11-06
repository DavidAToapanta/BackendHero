import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { BridgeTenantAuthService } from './bridge-tenant-auth.service';

type BridgeTenantRequest = Request & {
  bridgeTenant?: { id: number };
  tenantId?: number;
};

@Injectable()
export class BridgeTenantAuthGuard implements CanActivate {
  constructor(
    private readonly bridgeTenantAuthService: BridgeTenantAuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<BridgeTenantRequest>();
    const bridgeKeyHeader = request.headers['x-bridge-key'];
    const bridgeKey = Array.isArray(bridgeKeyHeader)
      ? bridgeKeyHeader[0]
      : bridgeKeyHeader;
    const tenant = await this.bridgeTenantAuthService.resolveTenantByBridgeKey(
      typeof bridgeKey === 'string' ? bridgeKey : undefined,
    );

    request.bridgeTenant = tenant;
    request.tenantId = tenant.id;

    return true;
  }
}
