import * as bcrypt from 'bcrypt';
import { Test, TestingModule } from '@nestjs/testing';
import { ModuleKey, SaasPlan, TenantRole, TipoNegocio } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from './tenant.service';

const makePrisma = () => ({
  tenant: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  tenantModule: {
    upsert: jest.fn(),
  },
  userTenant: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  usuario: {
    findUnique: jest.fn(),
  },
});

describe('TenantService', () => {
  let service: TenantService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('crea el tenant con owner y modulos deduplicados', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id: 7 });
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.tenant.create.mockResolvedValue({
      id: 1,
      slug: 'gym-central',
      modules: [{ module: ModuleKey.GYM }],
      users: [{ role: TenantRole.OWNER }],
    });

    const result = await service.create({
      nombre: 'Gym Central',
      tipoNegocio: TipoNegocio.GYM,
      ownerUserId: 7,
      modules: [ModuleKey.GYM, ModuleKey.GYM],
    });
    const tenantCreateCalls = prisma.tenant.create.mock.calls as Array<
      [
        {
          data: {
            slug: string;
            users?: { create: { usuarioId: number; role: TenantRole } };
            modules: { create: Array<{ module: ModuleKey; activo: boolean }> };
          };
        },
      ]
    >;
    const tenantCreateArg = tenantCreateCalls[0]?.[0];

    expect(tenantCreateArg).toBeDefined();
    expect(tenantCreateArg?.data.slug).toBe('gym-central');
    expect(tenantCreateArg?.data.users).toEqual({
      create: {
        usuarioId: 7,
        role: TenantRole.OWNER,
        estado: 'ACTIVO',
      },
    });
    expect(tenantCreateArg?.data.modules).toEqual({
      create: [{ module: ModuleKey.GYM, activo: true }],
    });
    expect(result.id).toBe(1);
  });

  it('asigna OWNER al primer administrador legacy', async () => {
    prisma.userTenant.findFirst.mockResolvedValue(null);
    prisma.tenant.upsert.mockResolvedValue({ id: 10 });
    prisma.tenantModule.upsert.mockResolvedValue({ id: 20 });
    prisma.userTenant.upsert.mockResolvedValue({
      id: 30,
      role: TenantRole.OWNER,
    });

    const result = await service.ensureLegacyMembership(5, 'administrador');
    const membershipCalls = prisma.userTenant.upsert.mock.calls as Array<
      [
        {
          create: {
            usuarioId: number;
            tenantId: number;
            role: TenantRole;
          };
        },
      ]
    >;
    const membershipArg = membershipCalls[0]?.[0];

    expect(membershipArg).toBeDefined();
    expect(membershipArg?.create).toEqual({
      usuarioId: 5,
      tenantId: 10,
      role: TenantRole.OWNER,
      estado: 'ACTIVO',
    });
    expect(result).toEqual({ id: 30, role: TenantRole.OWNER });
  });

  it('rota la bridge key y guarda solo el hash', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 10,
      slug: 'gym-central',
      modules: [],
      users: [],
    });
    prisma.tenant.update.mockResolvedValue({ id: 10 });
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-bridge-key' as never);

    const result = await service.rotateBridgeKey(10);

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { bridgeKeyHash: 'hashed-bridge-key' },
    });
    expect(result.tenantId).toBe(10);
    expect(result.headerName).toBe('x-bridge-key');
    expect(result.bridgeKey).not.toBe('hashed-bridge-key');
  });

  it('actualiza solo el saasPlan del tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 10,
      slug: 'gym-central',
      saasPlan: SaasPlan.FREE,
      modules: [],
      users: [],
    });
    prisma.tenant.update.mockResolvedValue({
      id: 10,
      slug: 'gym-central',
      saasPlan: SaasPlan.PLUS,
      modules: [],
      users: [],
    });

    const result = await service.updateSaasPlan(10, {
      saasPlan: SaasPlan.PLUS,
    });

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { saasPlan: SaasPlan.PLUS },
      include: expect.any(Object),
    });
    expect(result.saasPlan).toBe(SaasPlan.PLUS);
  });

  it('responde de forma idempotente si el tenant ya tiene ese plan', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 10,
      slug: 'gym-central',
      saasPlan: SaasPlan.PLUS,
      modules: [],
      users: [],
    });

    const result = await service.updateSaasPlan(10, {
      saasPlan: SaasPlan.PLUS,
    });

    expect(prisma.tenant.update).not.toHaveBeenCalled();
    expect(result.saasPlan).toBe(SaasPlan.PLUS);
  });
});
