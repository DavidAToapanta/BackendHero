import { BadRequestException } from '@nestjs/common';
import { TenantRole, UserTenantEstado } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from './staff.service';
import * as bcrypt from 'bcrypt';

type LegacyStaffProfileFixture = {
  id: number;
  tenantId: number;
  tenantRole: TenantRole;
  horario: string;
  sueldo: number;
};

type UsuarioStaffFixture = {
  id: number;
  email: string | null;
  userName: string | null;
  nombres: string;
  apellidos: string;
  cedula: string;
  fechaNacimiento: string | null;
  staffProfiles: LegacyStaffProfileFixture[];
};

type StaffMembershipFixture = {
  id: number;
  usuarioId: number;
  tenantId: number;
  role: TenantRole;
  estado: UserTenantEstado;
  createdAt: Date;
  updatedAt: Date;
  usuario: UsuarioStaffFixture;
};

type UsuarioFindUniqueArgs = {
  where: {
    cedula?: string;
    email?: string;
    userName?: string;
  };
};

const makePrisma = () => ({
  $transaction: jest.fn(),
  usuario: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userTenant: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  staffProfile: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
});

const makeStaffDetail = (
  overrides: Partial<StaffMembershipFixture> = {},
): StaffMembershipFixture => ({
  id: 30,
  usuarioId: 20,
  tenantId: 7,
  role: TenantRole.RECEPCIONISTA,
  estado: UserTenantEstado.ACTIVO,
  createdAt: new Date('2026-04-04T12:00:00.000Z'),
  updatedAt: new Date('2026-04-04T12:00:00.000Z'),
  usuario: {
    id: 20,
    email: 'staff@gym.test',
    userName: 'staff.user',
    nombres: 'Maria',
    apellidos: 'Lopez',
    cedula: '0102030405',
    fechaNacimiento: '1998-05-10',
    staffProfiles: [
      {
        id: 90,
        tenantId: 7,
        tenantRole: TenantRole.RECEPCIONISTA,
        horario: '08:00-17:00',
        sueldo: 550,
      },
    ],
  },
  ...overrides,
});

describe('StaffService', () => {
  let service: StaffService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<StaffService>(StaffService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('crea staff nuevo en el tenant actual', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({
      id: 20,
      email: 'staff@gym.test',
      userName: 'staff.user',
      nombres: 'Maria',
      apellidos: 'Lopez',
      cedula: '0102030405',
      fechaNacimiento: '1998-05-10',
    });
    prisma.userTenant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeStaffDetail());
    prisma.staffProfile.findFirst.mockResolvedValue(null);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-staff' as never);

    const result = await service.create(
      {
        nombres: 'Maria',
        apellidos: 'Lopez',
        cedula: '0102030405',
        fechaNacimiento: '1998-05-10',
        userName: 'staff.user',
        email: 'staff@gym.test',
        password: '123456',
        tenantRole: TenantRole.RECEPCIONISTA,
        horario: '08:00-17:00',
        sueldo: 550,
      },
      7,
    );

    expect(prisma.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          nombres: 'Maria',
          apellidos: 'Lopez',
          cedula: '0102030405',
          fechaNacimiento: '1998-05-10',
          email: 'staff@gym.test',
          userName: 'staff.user',
          password: 'hashed-staff',
        },
      }),
    );
    expect(prisma.userTenant.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 20,
        tenantId: 7,
        role: TenantRole.RECEPCIONISTA,
        estado: UserTenantEstado.ACTIVO,
      },
    });
    expect(prisma.staffProfile.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 20,
        tenantId: 7,
        tenantRole: TenantRole.RECEPCIONISTA,
        horario: '08:00-17:00',
        sueldo: 550,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        usuarioId: 20,
        tenantId: 7,
        tenantRole: TenantRole.RECEPCIONISTA,
        horario: '08:00-17:00',
        sueldo: 550,
      }),
    );
  });

  it('reutiliza Usuario existente y crea la membresia staff del tenant', async () => {
    prisma.usuario.findUnique.mockImplementation(
      ({ where }: UsuarioFindUniqueArgs) => {
        if (where.cedula || where.email || where.userName) {
          return {
            id: 20,
            email: 'staff@gym.test',
            userName: 'staff.user',
            nombres: 'Maria',
            apellidos: 'Lopez',
            cedula: '0102030405',
            fechaNacimiento: '1998-05-10',
          };
        }

        return null;
      },
    );
    prisma.userTenant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        makeStaffDetail({
          role: TenantRole.ADMIN,
          usuario: {
            ...makeStaffDetail().usuario,
            staffProfiles: [],
          },
        }),
      );

    const hashSpy = jest.spyOn(bcrypt, 'hash');

    const result = await service.create(
      {
        nombres: 'Maria',
        apellidos: 'Lopez',
        cedula: '0102030405',
        userName: 'staff.user',
        email: 'staff@gym.test',
        password: '123456',
        tenantRole: TenantRole.ADMIN,
      },
      7,
    );

    expect(prisma.usuario.create).not.toHaveBeenCalled();
    expect(hashSpy).not.toHaveBeenCalled();
    expect(prisma.userTenant.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 20,
        tenantId: 7,
        role: TenantRole.ADMIN,
        estado: UserTenantEstado.ACTIVO,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        usuarioId: 20,
        tenantRole: TenantRole.ADMIN,
      }),
    );
  });

  it('rechaza duplicado UserTenant(usuarioId, tenantId)', async () => {
    prisma.usuario.findUnique.mockImplementation(
      ({ where }: UsuarioFindUniqueArgs) =>
        where.cedula
          ? {
              id: 20,
              email: 'staff@gym.test',
              userName: 'staff.user',
              nombres: 'Maria',
              apellidos: 'Lopez',
              cedula: '0102030405',
              fechaNacimiento: '1998-05-10',
            }
          : null,
    );
    prisma.userTenant.findFirst.mockResolvedValueOnce({
      id: 1,
      usuarioId: 20,
      tenantId: 7,
      role: TenantRole.ADMIN,
      estado: UserTenantEstado.ACTIVO,
    });

    await expect(
      service.create(
        {
          nombres: 'Maria',
          apellidos: 'Lopez',
          cedula: '0102030405',
          password: '123456',
          tenantRole: TenantRole.ADMIN,
        },
        7,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Este usuario ya pertenece al staff de este gimnasio',
      ),
    );
  });

  it('lista staff solo del tenant actual y filtra por TenantRole', async () => {
    prisma.userTenant.findMany.mockResolvedValue([
      makeStaffDetail({
        tenantId: 7,
        role: TenantRole.ADMIN,
        usuario: {
          ...makeStaffDetail().usuario,
          staffProfiles: [],
        },
      }),
    ]);

    const result = await service.findAll({ role: TenantRole.ADMIN }, 7);

    expect(prisma.userTenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 7,
          role: TenantRole.ADMIN,
        },
        orderBy: [{ estado: 'asc' }, { usuarioId: 'asc' }],
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        tenantId: 7,
        tenantRole: TenantRole.ADMIN,
      }),
    ]);
  });

  it('inactiva y reactiva la membresia staff del tenant actual', async () => {
    prisma.userTenant.findFirst
      .mockResolvedValueOnce(makeStaffDetail())
      .mockResolvedValueOnce({
        ...makeStaffDetail(),
        estado: UserTenantEstado.INACTIVO,
      })
      .mockResolvedValueOnce({
        ...makeStaffDetail(),
        estado: UserTenantEstado.INACTIVO,
      })
      .mockResolvedValueOnce(makeStaffDetail());

    await service.inactivar(20, 7);
    await service.reactivar(20, 7);

    expect(prisma.userTenant.update).toHaveBeenNthCalledWith(1, {
      where: { id: 30 },
      data: { estado: UserTenantEstado.INACTIVO },
    });
    expect(prisma.userTenant.update).toHaveBeenNthCalledWith(2, {
      where: { id: 30 },
      data: { estado: UserTenantEstado.ACTIVO },
    });
  });
});
