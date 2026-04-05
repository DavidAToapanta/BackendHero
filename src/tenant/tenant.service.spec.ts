import { Test, TestingModule } from '@nestjs/testing';
import { ModuleKey, TenantRole, TipoNegocio } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from './tenant.service';

const makePrisma = () => ({
  tenant: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
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

    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'gym-central',
          users: {
            create: expect.objectContaining({
              usuarioId: 7,
              role: TenantRole.OWNER,
            }),
          },
          modules: {
            create: [{ module: ModuleKey.GYM, activo: true }],
          },
        }),
      }),
    );
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

    expect(prisma.userTenant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          usuarioId: 5,
          tenantId: 10,
          role: TenantRole.OWNER,
        }),
      }),
    );
    expect(result).toEqual({ id: 30, role: TenantRole.OWNER });
  });
});
