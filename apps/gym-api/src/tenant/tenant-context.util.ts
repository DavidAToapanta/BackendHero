import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@app/prisma';

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
