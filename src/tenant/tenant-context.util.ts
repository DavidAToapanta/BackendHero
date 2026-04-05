import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type TenantAwareUser = {
  tenantId?: number | null;
};

export function getTenantIdOrThrow(user?: TenantAwareUser) {
  const tenantId = Number(user?.tenantId);

  if (!tenantId || Number.isNaN(tenantId)) {
    throw new UnauthorizedException('No se pudo resolver el tenant del usuario');
  }

  return tenantId;
}

export async function resolveTenantIdOrDefault(
  prisma: PrismaService,
  tenantId?: number | null,
) {
  const normalizedTenantId = Number(tenantId);
  if (normalizedTenantId && !Number.isNaN(normalizedTenantId)) {
    return normalizedTenantId;
  }

  const legacyTenant = await prisma.tenant.findUnique({
    where: { slug: 'gym-principal' },
    select: { id: true },
  });

  if (!legacyTenant) {
    throw new NotFoundException('Tenant legacy gym-principal no encontrado');
  }

  return legacyTenant.id;
}
