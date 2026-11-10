import { PrismaService } from '@app/prisma';
import { Prisma } from '@prisma/client';
import { MembresiasPersonalService } from './membresias-personal.service';
import { ModulosNegocioService } from './modulos-negocio.service';
import { NegociosService } from './negocios.service';

describe('@app/negocios', () => {
  const mockPrisma = {
    tenant: { create: jest.fn(), upsert: jest.fn(), findUnique: jest.fn() },
    tenantModule: { findUnique: jest.fn() },
    userTenant: { findMany: jest.fn() },
  };
  const prisma = mockPrisma as unknown as PrismaService;
  const negocios = new NegociosService(prisma);
  const modulos = new ModulosNegocioService(prisma);
  const membresias = new MembresiasPersonalService(prisma);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('crea el negocio, los módulos elegidos y el propietario en una escritura', async () => {
    const negocio = {
      nombre: 'Mixto',
      slug: 'mixto',
      tipoNegocio: 'MIXTO',
    } as const;
    const include = { modules: true, users: true } as const;
    mockPrisma.tenant.create.mockResolvedValue({ id: 1 });

    await expect(
      negocios.crear(negocio, {
        include,
        inicial: { modulos: ['GYM', 'STORE'], propietarioId: 5 },
      }),
    ).resolves.toEqual({ id: 1 });
    expect(mockPrisma.tenant.create).toHaveBeenCalledWith({
      data: {
        ...negocio,
        modules: {
          create: [
            { module: 'GYM', activo: true },
            { module: 'STORE', activo: true },
          ],
        },
        users: {
          create: { usuarioId: 5, role: 'OWNER', estado: 'ACTIVO' },
        },
      },
      include,
    });
  });

  it('asegura por slug sin sobrescribir un negocio existente y usa la transacción', async () => {
    const negocio = {
      nombre: 'Existente',
      slug: 'existente',
      tipoNegocio: 'GYM',
    } as const;
    const upsert = jest.fn().mockResolvedValue({ id: 2 });
    const tx = { tenant: { upsert } } as unknown as Prisma.TransactionClient;

    await expect(negocios.asegurarPorSlug(negocio, tx)).resolves.toEqual({
      id: 2,
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { slug: negocio.slug },
      update: {},
      create: negocio,
    });
    expect(mockPrisma.tenant.upsert).not.toHaveBeenCalled();
  });

  it('solo reconoce módulos activos y asegura por clave compuesta en la transacción', async () => {
    mockPrisma.tenantModule.findUnique
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(null);
    await expect(modulos.estaActivo(2, 'GYM')).resolves.toBe(true);
    await expect(modulos.estaActivo(2, 'STORE')).resolves.toBe(false);
    expect(mockPrisma.tenantModule.findUnique).toHaveBeenLastCalledWith({
      where: {
        tenantId_module: { tenantId: 2, module: 'STORE' },
        activo: true,
      },
      select: { id: true },
    });
    const upsert = jest.fn().mockResolvedValue({ id: 3 });
    const tx = {
      tenantModule: { upsert },
    } as unknown as Prisma.TransactionClient;
    await modulos.asegurarActivo(2, 'STORE', tx);
    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId_module: { tenantId: 2, module: 'STORE' } },
      create: { tenantId: 2, module: 'STORE', activo: true },
      update: { activo: true },
    });
  });

  it('busca contextos activos en negocios activos y conserva el orden', async () => {
    mockPrisma.userTenant.findMany.mockResolvedValue([]);
    await expect(membresias.listarActivasParaUsuario(5)).resolves.toEqual([]);
    expect(mockPrisma.userTenant.findMany).toHaveBeenCalledWith({
      where: { usuarioId: 5, estado: 'ACTIVO', tenant: { estado: 'ACTIVO' } },
      orderBy: { tenantId: 'asc' },
      select: {
        tenantId: true,
        role: true,
        tenant: { select: { nombre: true } },
      },
    });
  });

  it('acota los cambios de rol y estado al negocio y a la transacción recibida', async () => {
    const updateManyAndReturn = jest.fn().mockResolvedValue([{ id: 1 }]);
    const tx = {
      userTenant: { updateManyAndReturn },
    } as unknown as Prisma.TransactionClient;
    await membresias.cambiarRol(1, 2, 'CAJERO', tx);
    await membresias.cambiarEstado(1, 2, 'INACTIVO', tx);

    expect(updateManyAndReturn).toHaveBeenNthCalledWith(1, {
      where: { id: 1, tenantId: 2, role: { not: 'CAJERO' } },
      data: { role: 'CAJERO', versionAutorizacion: { increment: 1 } },
    });
    expect(updateManyAndReturn).toHaveBeenNthCalledWith(2, {
      where: { id: 1, tenantId: 2, estado: { not: 'INACTIVO' } },
      data: { estado: 'INACTIVO', versionAutorizacion: { increment: 1 } },
    });
  });
});
