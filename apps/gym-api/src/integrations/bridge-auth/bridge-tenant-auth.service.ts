import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

type BridgeTenantAuthResult = {
  id: number;
};

@Injectable()
export class BridgeTenantAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantByBridgeKey(
    bridgeKey: string | undefined | null,
  ): Promise<BridgeTenantAuthResult> {
    const normalizedBridgeKey = bridgeKey?.trim();

    if (!normalizedBridgeKey) {
      throw new UnauthorizedException('x-bridge-key es requerido');
    }

    const tenants = await this.prisma.tenant.findMany({
      where: {
        bridgeKeyHash: {
          not: null,
        },
      },
      select: {
        id: true,
        bridgeKeyHash: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    for (const tenant of tenants) {
      if (
        tenant.bridgeKeyHash &&
        (await bcrypt.compare(normalizedBridgeKey, tenant.bridgeKeyHash))
      ) {
        return { id: tenant.id };
      }
    }

    throw new UnauthorizedException('x-bridge-key invalida');
  }
}
