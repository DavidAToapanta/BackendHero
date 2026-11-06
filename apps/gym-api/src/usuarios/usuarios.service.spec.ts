import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { UsuariosService } from './usuarios.service';

const makePrisma = () => ({
  usuario: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  administrador: {
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  entrenador: {
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  recepcionista: {
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  userTenant: {
    count: jest.fn(),
  },
  staffProfile: {
    deleteMany: jest.fn(),
  },
  cliente: {
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  gasto: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe('UsuariosService', () => {
  let service: UsuariosService;
  let prisma: ReturnType<typeof makePrisma>;
  let tenantService: {
    ensureLegacyMembership: jest.Mock;
    ensureLegacyDefaultTenant: jest.Mock;
  };

  beforeEach(async () => {
    prisma = makePrisma();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    tenantService = {
      ensureLegacyMembership: jest.fn().mockResolvedValue(undefined),
      ensureLegacyDefaultTenant: jest.fn().mockResolvedValue({ id: 7 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: TenantService,
          useValue: tenantService,
        },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('crea administrador legacy y genera membresia SaaS', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({
      id: 1,
      email: 'admin@gym.test',
      userName: 'admin',
      password: 'hashed',
      nombres: 'Admin',
      apellidos: 'Principal',
      cedula: '0102030405',
      fechaNacimiento: null,
    });
    prisma.administrador.create.mockResolvedValue({ id: 1, usuarioId: 1 });
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);

    const result = await service.crear({
      email: 'admin@gym.test',
      userName: 'admin',
      password: '123456',
      nombres: 'Admin',
      apellidos: 'Principal',
      cedula: '0102030405',
      rol: 'administrador',
    });

    expect(tenantService.ensureLegacyMembership).toHaveBeenCalledWith(
      1,
      'administrador',
      prisma,
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 1,
        email: 'admin@gym.test',
        userName: 'admin',
      }),
    );
    expect(result).not.toHaveProperty('password');
  });

  it('rechaza crear usuario sin cedula', async () => {
    await expect(
      service.crear({
        email: 'admin@gym.test',
        userName: 'admin',
        password: '123456',
        nombres: 'Admin',
        apellidos: 'Principal',
        cedula: '   ',
        rol: 'administrador',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('crea cliente legacy sin asignar id manualmente', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({
      id: 11,
      email: 'cliente@gym.test',
      userName: 'cliente',
      password: 'hashed',
      nombres: 'Cliente',
      apellidos: 'Legacy',
      cedula: '0999999999',
      fechaNacimiento: null,
    });
    prisma.cliente.create.mockResolvedValue({
      id: 25,
      usuarioId: 11,
      tenantId: 7,
    });
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);

    const result = await service.crear({
      email: 'cliente@gym.test',
      userName: 'cliente',
      password: '123456',
      nombres: 'Cliente',
      apellidos: 'Legacy',
      cedula: '0999999999',
      rol: 'cliente',
      horario: '08:00-10:00',
      sexo: 'M',
      observaciones: 'Sin novedades',
      objetivos: 'Definir',
      tiempoEntrenar: 45,
    });

    expect(tenantService.ensureLegacyDefaultTenant).toHaveBeenCalledWith(
      prisma,
    );
    expect(prisma.cliente.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 11,
        tenantId: 7,
        horario: '08:00-10:00',
        sexo: 'M',
        observaciones: 'Sin novedades',
        objetivos: 'Definir',
        tiempoEntrenar: 45,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 11,
        email: 'cliente@gym.test',
        userName: 'cliente',
      }),
    );
    expect(result).not.toHaveProperty('password');
  });

  it('bloquea la eliminacion legacy si el usuario tiene clientes multi-tenant', async () => {
    prisma.cliente.count.mockResolvedValue(2);
    prisma.userTenant.count.mockResolvedValue(0);

    await expect(service.eliminar(11)).rejects.toThrow(
      new BadRequestException(
        'La eliminacion legacy de usuarios cliente ya no esta soportada; use el flujo tenant-aware',
      ),
    );
  });

  it('bloquea la eliminacion legacy si el usuario tiene membresias staff tenant-aware', async () => {
    prisma.cliente.count.mockResolvedValue(0);
    prisma.userTenant.count.mockResolvedValue(1);

    await expect(service.eliminar(11)).rejects.toThrow(
      new BadRequestException(
        'La eliminacion legacy de usuarios staff ya no esta soportada; use el flujo /staff por tenant',
      ),
    );
  });
});
