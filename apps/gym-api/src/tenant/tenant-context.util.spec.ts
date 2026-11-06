import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@app/prisma';
import { resolveTenantIdOrDefault } from './tenant-context.util';

describe('compatibilidad del tenant legacy del gimnasio', () => {
  const makePrisma = () => ({ tenant: { findUnique: jest.fn() } });

  it('conserva el tenant recibido sin consultar el predeterminado', async () => {
    const prisma = makePrisma();

    await expect(
      resolveTenantIdOrDefault(prisma as unknown as PrismaService, 7),
    ).resolves.toBe(7);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('busca gym-principal cuando no se recibe tenant', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ id: 9 });

    await expect(
      resolveTenantIdOrDefault(prisma as unknown as PrismaService),
    ).resolves.toBe(9);
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { slug: 'gym-principal' },
      select: { id: true },
    });
  });

  it('conserva el error si el tenant legacy no existe', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(
      resolveTenantIdOrDefault(prisma as unknown as PrismaService),
    ).rejects.toThrow(
      new NotFoundException('Tenant legacy gym-principal no encontrado'),
    );
  });
});
