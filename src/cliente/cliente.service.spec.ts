import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { ClienteService } from './cliente.service';

const makeRegistroDto = () => ({
  nombres: 'Juan',
  apellidos: 'Perez',
  cedula: '0102030405',
  fechaNacimiento: '2000-01-01',
  userName: 'juan.perez',
  email: 'juan@test.com',
  password: '123456',
  horario: '08:00-10:00',
  sexo: 'M',
  observaciones: 'Sin novedades',
  objetivos: 'Ganar masa muscular',
  tiempoEntrenar: 60,
});

const makePrisma = () => ({
  $transaction: jest.fn(),
  usuario: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  cliente: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
});

describe('ClienteService', () => {
  let service: ClienteService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClienteService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ClienteService>(ClienteService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registrar crea Usuario y Cliente con el tenantId actual', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({
      id: 40,
      cedula: '0102030405',
      email: 'juan@test.com',
      userName: 'juan.perez',
      nombres: 'Juan',
      apellidos: 'Perez',
      fechaNacimiento: '2000-01-01',
    });
    prisma.cliente.create.mockResolvedValue({
      id: 55,
      usuarioId: 40,
      tenantId: 8,
    });
    const response = {
      id: 40,
      tenantId: 8,
      usuario: {
        id: 40,
        nombres: 'Juan',
        apellidos: 'Perez',
        cedula: '0102030405',
      },
      planes: [],
      devolucionPendiente: 0,
    };
    const findByUsuarioIdSpy = jest
      .spyOn(service, 'findByUsuarioId')
      .mockResolvedValue(response as any);

    jest.spyOn(bcrypt, 'hash').mockImplementation(async () => 'hash-cliente');

    const result = await service.registrar(
      {
        ...makeRegistroDto(),
        nombres: ' Juan ',
        apellidos: ' Perez ',
        cedula: ' 0102030405 ',
        fechaNacimiento: ' 2000-01-01 ',
        userName: ' juan.perez ',
        email: ' JUAN@TEST.COM ',
      },
      8,
    );

    expect(prisma.usuario.create).toHaveBeenCalledWith({
      data: {
        nombres: 'Juan',
        apellidos: 'Perez',
        cedula: '0102030405',
        fechaNacimiento: '2000-01-01',
        userName: 'juan.perez',
        email: 'juan@test.com',
        password: 'hash-cliente',
      },
      select: {
        id: true,
        cedula: true,
        email: true,
        userName: true,
        nombres: true,
        apellidos: true,
        fechaNacimiento: true,
      },
    });
    expect(prisma.cliente.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 40,
        tenantId: 8,
        horario: '08:00-10:00',
        sexo: 'M',
        observaciones: 'Sin novedades',
        objetivos: 'Ganar masa muscular',
        tiempoEntrenar: 60,
      },
    });
    expect(findByUsuarioIdSpy).toHaveBeenCalledWith(40, 8);
    expect(result).toEqual(response);
  });

  it('registrar reutiliza usuario existente y crea Cliente en otro tenant', async () => {
    prisma.usuario.findUnique.mockImplementation(async ({ where }) => {
      if (where.cedula) {
        return {
          id: 40,
          cedula: '0102030405',
          email: 'juan@test.com',
          userName: 'juan.perez',
          nombres: 'Juan',
          apellidos: 'Perez',
          fechaNacimiento: '2000-01-01',
        };
      }

      if (where.email || where.userName) {
        return {
          id: 40,
          cedula: '0102030405',
          email: 'juan@test.com',
          userName: 'juan.perez',
          nombres: 'Juan',
          apellidos: 'Perez',
          fechaNacimiento: '2000-01-01',
        };
      }

      return null;
    });
    prisma.cliente.findFirst.mockResolvedValueOnce(null);
    prisma.cliente.create.mockResolvedValue({
      id: 66,
      usuarioId: 40,
      tenantId: 9,
    });
    const response = {
      id: 66,
      tenantId: 9,
      usuario: {
        id: 40,
        nombres: 'Juan',
        apellidos: 'Perez',
        cedula: '0102030405',
      },
      planes: [],
      devolucionPendiente: 0,
    };
    const findByUsuarioIdSpy = jest
      .spyOn(service, 'findByUsuarioId')
      .mockResolvedValue(response as any);

    const hashSpy = jest.spyOn(bcrypt, 'hash');

    const result = await service.registrar(makeRegistroDto(), 9);

    expect(prisma.usuario.create).not.toHaveBeenCalled();
    expect(hashSpy).not.toHaveBeenCalled();
    expect(prisma.cliente.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 40,
        tenantId: 9,
        horario: '08:00-10:00',
        sexo: 'M',
        observaciones: 'Sin novedades',
        objetivos: 'Ganar masa muscular',
        tiempoEntrenar: 60,
      },
    });
    expect(findByUsuarioIdSpy).toHaveBeenCalledWith(40, 9);
    expect(result).toEqual(response);
  });

  it('registrar rechaza si el usuario ya es cliente del mismo gimnasio', async () => {
    prisma.usuario.findUnique.mockImplementation(async ({ where }) =>
      where.cedula
        ? {
            id: 40,
            cedula: '0102030405',
            email: 'juan@test.com',
            userName: 'juan.perez',
            nombres: 'Juan',
            apellidos: 'Perez',
            fechaNacimiento: '2000-01-01',
          }
        : null,
    );
    prisma.cliente.findFirst.mockResolvedValueOnce({
      id: 55,
      usuarioId: 40,
      tenantId: 8,
    });

    await expect(service.registrar(makeRegistroDto(), 8)).rejects.toThrow(
      'Este usuario ya es cliente de este gimnasio',
    );
    expect(prisma.usuario.create).not.toHaveBeenCalled();
    expect(prisma.cliente.create).not.toHaveBeenCalled();
  });

  it('registrar rechaza email de otro usuario cuando la cedula no existe', async () => {
    prisma.usuario.findUnique.mockImplementation(async ({ where }) =>
      where.email
        ? {
            id: 2,
            cedula: '9999999999',
            email: 'juan@test.com',
            userName: 'otro.user',
            nombres: 'Otro',
            apellidos: 'Usuario',
            fechaNacimiento: '1999-01-01',
          }
        : null,
    );

    await expect(service.registrar(makeRegistroDto(), 8)).rejects.toThrow(
      'El email ingresado ya pertenece a otro usuario',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('registrar rechaza userName de otro usuario cuando la cedula no existe', async () => {
    prisma.usuario.findUnique.mockImplementation(async ({ where }) =>
      where.userName
        ? {
            id: 3,
            cedula: '8888888888',
            email: 'otro@test.com',
            userName: 'juan.perez',
            nombres: 'Otro',
            apellidos: 'Usuario',
            fechaNacimiento: '1999-01-01',
          }
        : null,
    );

    await expect(service.registrar(makeRegistroDto(), 8)).rejects.toThrow(
      'El userName ingresado ya pertenece a otro usuario',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('registrar rechaza tenantId enviado por el request', async () => {
    await expect(
      service.registrar({ ...makeRegistroDto(), tenantId: 99 } as any, 8),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('registrar rechaza usuarioId enviado por el request', async () => {
    await expect(
      service.registrar({ ...makeRegistroDto(), usuarioId: 99 } as any, 8),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('findAll suma devolucionPendiente y filtra por tenant', async () => {
    prisma.cliente.count.mockResolvedValue(1);
    prisma.cliente.findMany.mockResolvedValue([
      {
        id: 123,
        usuario: { nombres: 'Ana', apellidos: 'Lopez' },
        planes: [],
        cambiosPlan: [
          { devolucionPendiente: 12.5 },
          { devolucionPendiente: 7.5 },
        ],
      },
    ]);

    const resultado = await service.findAll(1, 10, '', undefined, 5);

    expect(prisma.cliente.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 5,
        activo: true,
      }),
    });
    expect(resultado.data[0]).toEqual(
      expect.objectContaining({
        id: 123,
        devolucionPendiente: 20,
      }),
    );
  });

  it('findOne devuelve devolucionPendiente top-level por tenant', async () => {
    prisma.cliente.findFirst.mockResolvedValue({
      id: 123,
      usuario: { nombres: 'Ana', apellidos: 'Lopez' },
      planes: [],
      cambiosPlan: [{ devolucionPendiente: 20 }],
    });

    const resultado = await service.findOne(123, 5);

    expect(prisma.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 123, tenantId: 5 },
      }),
    );
    expect(resultado).toEqual(
      expect.objectContaining({
        id: 123,
        devolucionPendiente: 20,
      }),
    );
  });

  it('findOne lanza NotFoundException si no existe', async () => {
    prisma.cliente.findFirst.mockResolvedValue(null);

    await expect(service.findOne(999, 5)).rejects.toThrow(NotFoundException);
  });

  it('reactivar cambia activo=true', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 5, activo: false });
    prisma.cliente.update.mockResolvedValue({ id: 5, activo: true });

    const resultado = await service.reactivar(5, 5);

    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { activo: true },
    });
    expect(resultado).toEqual(expect.objectContaining({ activo: true }));
  });

  it('desactivar cambia activo=false', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 6, activo: true });
    prisma.cliente.update.mockResolvedValue({ id: 6, activo: false });

    const resultado = await service.desactivar(6, 5);

    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 6 },
      data: { activo: false },
    });
    expect(resultado).toEqual(expect.objectContaining({ activo: false }));
  });

  it('vincula zkbioPersonId usando el tenant del contexto', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 6, tenantId: 5 });
    prisma.cliente.update.mockResolvedValue({
      id: 6,
      tenantId: 5,
      zkbioPersonId: '88',
    });

    const result = await service.linkZkbioPerson(6, ' 88 ', 5);

    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 6 },
      data: { zkbioPersonId: '88' },
    });
    expect(result).toEqual(
      expect.objectContaining({ zkbioPersonId: '88', tenantId: 5 }),
    );
  });

  it('permite desvincular zkbioPersonId con null', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 6, tenantId: 5 });
    prisma.cliente.update.mockResolvedValue({
      id: 6,
      tenantId: 5,
      zkbioPersonId: null,
    });

    await service.linkZkbioPerson(6, null, 5);

    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 6 },
      data: { zkbioPersonId: null },
    });
  });

  it('respeta unicidad por tenant al vincular zkbioPersonId', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 6, tenantId: 5 });
    prisma.cliente.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.linkZkbioPerson(6, '88', 5)).rejects.toThrow(
      'Ese zkbioPersonId ya esta vinculado a otro cliente en este tenant',
    );
  });
});
