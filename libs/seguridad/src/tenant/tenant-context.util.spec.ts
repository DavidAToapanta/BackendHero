import { UnauthorizedException } from '@nestjs/common';
import { getTenantIdOrThrow, TenantAwareUser } from './tenant-context.util';

describe('getTenantIdOrThrow', () => {
  it('obtiene el tenant del contexto autenticado', () => {
    expect(getTenantIdOrThrow({ tenantId: 42 })).toBe(42);
  });

  it('conserva la conversion numerica de contextos existentes', () => {
    const user = { tenantId: '42' } as unknown as TenantAwareUser;
    expect(getTenantIdOrThrow(user)).toBe(42);
  });

  it.each([
    undefined,
    {},
    { tenantId: null },
    { tenantId: 0 },
    { tenantId: Number.NaN },
    { tenantId: 'invalido' } as unknown as TenantAwareUser,
  ])('rechaza un contexto sin tenant resoluble: %j', (user) => {
    expect(() => getTenantIdOrThrow(user)).toThrow(
      new UnauthorizedException('No se pudo resolver el tenant del usuario'),
    );
  });
});
