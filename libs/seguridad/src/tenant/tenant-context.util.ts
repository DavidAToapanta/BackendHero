import { UnauthorizedException } from '@nestjs/common';

export type TenantAwareUser = {
  tenantId?: number | null;
};

export function getTenantIdOrThrow(user?: TenantAwareUser) {
  const tenantId = Number(user?.tenantId);

  if (!tenantId || Number.isNaN(tenantId)) {
    throw new UnauthorizedException(
      'No se pudo resolver el tenant del usuario',
    );
  }

  return tenantId;
}
