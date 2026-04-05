import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ModuleKey,
  TenantEstado,
  TenantRole,
  TipoNegocio,
  UserTenantEstado,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const makePrisma = () => ({
  $transaction: jest.fn(),
  usuario: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  cliente: {
    findMany: jest.fn(),
  },
  userTenant: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  tenantModule: {
    create: jest.fn(),
  },
});

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof makePrisma>;
  let jwtService: { sign: jest.Mock; verify: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    jwtService = {
      sign: jest
        .fn()
        .mockImplementation((payload: { tokenType?: string }) =>
          payload.tokenType === 'CONTEXT_SELECTION'
            ? 'selection-token'
            : 'final-token',
        ),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('registra owner, crea tenant gym y devuelve login automatico', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.tenant.findUnique
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce(null);
    prisma.usuario.create.mockResolvedValue({ id: 101 });
    prisma.tenant.create.mockResolvedValue({ id: 202 });

    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hash-owner' as never);
    const loginSpy = jest
      .spyOn(service, 'login')
      .mockResolvedValue({ access_token: 'owner-token' });

    const result = await service.registerOwner({
      cedula: ' 0102030405 ',
      password: '123456',
      nombres: ' Ana ',
      apellidos: ' Perez ',
      email: ' OWNER@GYM.TEST ',
      userName: ' ana.owner ',
      tenantNombre: ' Gym Central ',
      tenantEmail: ' contacto@GYM.TEST ',
      telefono: ' 0999999999 ',
      direccion: ' Av. Principal ',
      ciudad: ' Quito ',
      pais: ' Ecuador ',
      logoUrl: 'https://example.com/logo.png',
      descripcion: ' Gym principal ',
    });

    expect(prisma.usuario.create).toHaveBeenCalledWith({
      data: {
        cedula: '0102030405',
        email: 'owner@gym.test',
        userName: 'ana.owner',
        password: 'hash-owner',
        nombres: 'Ana',
        apellidos: 'Perez',
      },
    });
    expect(prisma.tenant.create).toHaveBeenCalledWith({
      data: {
        nombre: 'Gym Central',
        slug: 'gym-central-2',
        tipoNegocio: TipoNegocio.GYM,
        estado: TenantEstado.ACTIVO,
        email: 'contacto@gym.test',
        telefono: '0999999999',
        direccion: 'Av. Principal',
        ciudad: 'Quito',
        pais: 'Ecuador',
        logoUrl: 'https://example.com/logo.png',
        descripcion: 'Gym principal',
      },
    });
    expect(prisma.userTenant.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 101,
        tenantId: 202,
        role: TenantRole.OWNER,
        estado: UserTenantEstado.ACTIVO,
      },
    });
    expect(prisma.tenantModule.create).toHaveBeenCalledWith({
      data: {
        tenantId: 202,
        module: ModuleKey.GYM,
        activo: true,
      },
    });
    expect(loginSpy).toHaveBeenCalledWith('0102030405', '123456');
    expect(result).toEqual({ access_token: 'owner-token' });
  });

  it('devuelve token directo cuando solo existe un contexto cliente', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 20,
      cedula: '0998877665',
      userName: 'cliente.activo',
      email: 'cliente@test.com',
      password: 'hash',
    });
    prisma.cliente.findMany.mockResolvedValue([
      {
        id: 55,
        tenantId: 1,
        tenant: { nombre: 'Gym Norte' },
      },
    ]);
    prisma.userTenant.findMany.mockResolvedValue([]);

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    const result = await service.login('0998877665', 'abcd');

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 20,
        rol: 'CLIENTE',
        clienteId: 55,
        tenantId: 1,
        tenantRole: null,
        accessMode: 'PLATFORM',
      }),
    );
    expect(result).toEqual({ access_token: 'final-token' });
  });

  it('devuelve token directo en ASISTENCIA cuando el contexto unico lo permite', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 21,
      cedula: '0101010101',
      userName: 'cliente.asistencia',
      email: 'cliente.asistencia@test.com',
      password: 'hash',
    });
    prisma.cliente.findMany.mockResolvedValue([
      {
        id: 56,
        tenantId: 2,
        tenant: { nombre: 'Gym Asistencia' },
      },
    ]);
    prisma.userTenant.findMany.mockResolvedValue([]);

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    const result = await service.login('0101010101', 'abcd', 'ASISTENCIA');

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 21,
        rol: 'CLIENTE',
        clienteId: 56,
        tenantId: 2,
        tenantRole: null,
        accessMode: 'ASISTENCIA',
      }),
    );
    expect(result).toEqual({ access_token: 'final-token' });
  });

  it('devuelve token directo cuando solo existe un contexto staff', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 30,
      cedula: '1112223334',
      userName: 'recep.tenant',
      email: 'recep@gym.test',
      password: 'hash',
    });
    prisma.cliente.findMany.mockResolvedValue([]);
    prisma.userTenant.findMany.mockResolvedValue([
      {
        tenantId: 99,
        role: TenantRole.RECEPCIONISTA,
        tenant: { nombre: 'Gym Centro' },
      },
    ]);

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    const result = await service.login('1112223334', 'abcd');

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 30,
        rol: 'RECEPCIONISTA',
        clienteId: null,
        tenantId: 99,
        tenantRole: TenantRole.RECEPCIONISTA,
        accessMode: 'PLATFORM',
      }),
    );
    expect(result).toEqual({ access_token: 'final-token' });
  });

  it('rechaza ASISTENCIA cuando el contexto unico no lo permite', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 31,
      cedula: '2223334445',
      userName: 'owner.platform',
      email: 'owner.platform@gym.test',
      password: 'hash',
    });
    prisma.cliente.findMany.mockResolvedValue([]);
    prisma.userTenant.findMany.mockResolvedValue([
      {
        tenantId: 100,
        role: TenantRole.OWNER,
        tenant: { nombre: 'Gym Owner' },
      },
    ]);

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    await expect(
      service.login('2223334445', 'abcd', 'ASISTENCIA'),
    ).rejects.toThrow(
      new BadRequestException(
        'El modo de acceso seleccionado no esta permitido para este contexto',
      ),
    );
  });

  it('devuelve selectionToken y contexts cuando hay multiples contextos', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 40,
      cedula: '1231231231',
      userName: 'multi.context',
      email: 'multi@gym.test',
      password: 'hash',
    });
    prisma.cliente.findMany.mockResolvedValue([
      {
        id: 88,
        tenantId: 7,
        tenant: { nombre: 'Gym Sur' },
      },
    ]);
    prisma.userTenant.findMany.mockResolvedValue([
      {
        tenantId: 9,
        role: TenantRole.ADMIN,
        tenant: { nombre: 'Gym Oeste' },
      },
    ]);

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    const result = await service.login('1231231231', 'abcd', 'ASISTENCIA');

    expect(result).toEqual({
      requiresContextSelection: true,
      selectionToken: 'selection-token',
      requestedAccessMode: 'ASISTENCIA',
      contexts: [
        {
          type: 'CLIENTE',
          tenantId: 7,
          tenantNombre: 'Gym Sur',
          clienteId: 88,
          tenantRole: null,
          allowedModes: ['PLATFORM', 'ASISTENCIA'],
        },
        {
          type: 'STAFF',
          tenantId: 9,
          tenantNombre: 'Gym Oeste',
          clienteId: null,
          tenantRole: TenantRole.ADMIN,
          allowedModes: ['PLATFORM', 'ASISTENCIA'],
        },
      ],
    });
  });

  it('select-context emite token para un contexto cliente valido', async () => {
    jwtService.verify.mockReturnValue({
      sub: 50,
      tokenType: 'CONTEXT_SELECTION',
    });
    prisma.usuario.findUnique.mockResolvedValue({
      id: 50,
      cedula: '5554443332',
      userName: 'cliente.contexto',
      email: 'cliente@ctx.test',
      password: 'hash',
    });
    prisma.cliente.findMany.mockResolvedValue([
      {
        id: 91,
        tenantId: 7,
        tenant: { nombre: 'Gym Contexto' },
      },
    ]);
    prisma.userTenant.findMany.mockResolvedValue([]);

    const result = await service.selectContext({
      selectionToken: 'selection-token',
      type: 'CLIENTE',
      tenantId: 7,
      clienteId: 91,
      accessMode: 'ASISTENCIA',
    });

    expect(jwtService.verify).toHaveBeenCalledWith('selection-token');
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 50,
        rol: 'CLIENTE',
        clienteId: 91,
        tenantId: 7,
        tenantRole: null,
        accessMode: 'ASISTENCIA',
      }),
    );
    expect(result).toEqual({ access_token: 'final-token' });
  });

  it('select-context emite token para staff usando TenantRole como fuente de verdad', async () => {
    jwtService.verify.mockReturnValue({
      sub: 60,
      tokenType: 'CONTEXT_SELECTION',
    });
    prisma.usuario.findUnique.mockResolvedValue({
      id: 60,
      cedula: '6665554443',
      userName: 'staff.contexto',
      email: 'staff@ctx.test',
      password: 'hash',
    });
    prisma.cliente.findMany.mockResolvedValue([]);
    prisma.userTenant.findMany.mockResolvedValue([
      {
        tenantId: 12,
        role: TenantRole.RECEPCIONISTA,
        tenant: { nombre: 'Gym Staff' },
      },
    ]);

    const result = await service.selectContext({
      selectionToken: 'selection-token',
      type: 'STAFF',
      tenantId: 12,
      tenantRole: TenantRole.RECEPCIONISTA,
      accessMode: 'ASISTENCIA',
    });

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 60,
        rol: 'RECEPCIONISTA',
        clienteId: null,
        tenantId: 12,
        tenantRole: TenantRole.RECEPCIONISTA,
        accessMode: 'ASISTENCIA',
      }),
    );
    expect(result).toEqual({ access_token: 'final-token' });
  });

  it('rechaza seleccionar un contexto que no pertenece al usuario', async () => {
    jwtService.verify.mockReturnValue({
      sub: 70,
      tokenType: 'CONTEXT_SELECTION',
    });
    prisma.usuario.findUnique.mockResolvedValue({
      id: 70,
      cedula: '7776665554',
      userName: 'ctx.invalido',
      email: 'invalido@ctx.test',
      password: 'hash',
    });
    prisma.cliente.findMany.mockResolvedValue([
      {
        id: 33,
        tenantId: 5,
        tenant: { nombre: 'Gym Uno' },
      },
    ]);
    prisma.userTenant.findMany.mockResolvedValue([]);

    await expect(
      service.selectContext({
        selectionToken: 'selection-token',
        type: 'CLIENTE',
        tenantId: 9,
        clienteId: 99,
        accessMode: 'PLATFORM',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'El contexto seleccionado no pertenece al usuario',
      ),
    );
  });

  it('rechaza usar un accessMode no permitido para el contexto', async () => {
    jwtService.verify.mockReturnValue({
      sub: 80,
      tokenType: 'CONTEXT_SELECTION',
    });
    prisma.usuario.findUnique.mockResolvedValue({
      id: 80,
      cedula: '8887776665',
      userName: 'owner.ctx',
      email: 'owner@ctx.test',
      password: 'hash',
    });
    prisma.cliente.findMany.mockResolvedValue([]);
    prisma.userTenant.findMany.mockResolvedValue([
      {
        tenantId: 3,
        role: TenantRole.OWNER,
        tenant: { nombre: 'Gym Owner' },
      },
    ]);

    await expect(
      service.selectContext({
        selectionToken: 'selection-token',
        type: 'STAFF',
        tenantId: 3,
        tenantRole: TenantRole.OWNER,
        accessMode: 'ASISTENCIA',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'El modo de acceso seleccionado no esta permitido para este contexto',
      ),
    );
  });

  it('rechaza selectionToken invalido', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('invalid');
    });

    await expect(
      service.selectContext({
        selectionToken: 'bad-token',
        type: 'CLIENTE',
        tenantId: 1,
        clienteId: 10,
        accessMode: 'PLATFORM',
      }),
    ).rejects.toThrow(new UnauthorizedException('Selection token invalido'));
  });
});
