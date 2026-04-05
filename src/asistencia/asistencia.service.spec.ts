import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AsistenciaService } from './asistencia.service';
import { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  cliente: {
    findFirst: jest.fn(),
  },
  clientePlan: {
    findFirst: jest.fn(),
  },
  asistencia: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
});

describe('AsistenciaService', () => {
  let service: AsistenciaService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsistenciaService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<AsistenciaService>(AsistenciaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('registra asistencia con tenantId del contexto', async () => {
    prisma.cliente.findFirst.mockResolvedValue({
      id: 5,
      tenantId: 7,
      activo: true,
      usuario: { id: 10 },
    });
    prisma.clientePlan.findFirst.mockResolvedValue({
      id: 20,
      tenantId: 7,
      plan: { nombre: 'Mensual', precio: 30 },
      fechaInicio: new Date('2026-03-01'),
      fechaFin: new Date('2026-03-31'),
    });
    prisma.asistencia.create.mockResolvedValue({
      id: 1,
      tenantId: 7,
      clienteId: 5,
    });

    await service.registrarAsistencia(5, 7);
    const createCalls = prisma.asistencia.create.mock.calls as Array<
      [
        {
          data: {
            tenantId: number;
            clienteId: number;
          };
        },
      ]
    >;
    const createArgs = createCalls[0][0];

    expect(createArgs).toBeDefined();
    expect(createArgs.data.tenantId).toBe(7);
    expect(createArgs.data.clienteId).toBe(5);
  });

  it('rechaza asistencia si el cliente no tiene plan activo en el tenant', async () => {
    prisma.cliente.findFirst.mockResolvedValue({
      id: 5,
      tenantId: 7,
      activo: true,
      usuario: { id: 10 },
    });
    prisma.clientePlan.findFirst.mockResolvedValue(null);

    await expect(service.registrarAsistencia(5, 7)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('marcarAsistencia resuelve el cliente por usuarioId + tenantId', async () => {
    const ahora = new Date();
    const haceUnDia = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const enUnDia = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

    prisma.cliente.findFirst.mockResolvedValue({
      id: 5,
      tenantId: 7,
      activo: true,
      planes: [
        {
          id: 20,
          activado: true,
          fechaInicio: haceUnDia,
          fechaFin: enUnDia,
          plan: { nombre: 'Mensual' },
        },
      ],
    });
    prisma.asistencia.create.mockResolvedValue({
      id: 2,
      tenantId: 7,
      clienteId: 5,
    });

    await service.marcarAsistencia(10, 7);
    const createCalls = prisma.asistencia.create.mock.calls as Array<
      [
        {
          data: {
            tenantId: number;
            clienteId: number;
          };
        },
      ]
    >;
    const createArgs = createCalls[0][0];

    expect(prisma.cliente.findFirst).toHaveBeenCalledWith({
      where: { usuarioId: 10, tenantId: 7 },
      include: {
        planes: {
          where: {
            tenantId: 7,
            activado: true,
            estado: 'ACTIVO',
          },
          include: { plan: true },
        },
      },
    });
    expect(createArgs).toBeDefined();
    expect(createArgs.data.tenantId).toBe(7);
    expect(createArgs.data.clienteId).toBe(5);
  });

  it('marcarAsistencia rechaza si no existe cliente para ese usuario en el tenant', async () => {
    prisma.cliente.findFirst.mockResolvedValue(null);

    await expect(service.marcarAsistencia(10, 7)).rejects.toThrow(
      new NotFoundException(
        'No existe un cliente con este ID de usuario en este tenant',
      ),
    );
  });

  it('historial consulta asistencias por clienteId dentro del tenant actual', async () => {
    prisma.cliente.findFirst.mockResolvedValue({
      id: 5,
      tenantId: 7,
      activo: true,
      usuario: { id: 10 },
    });
    prisma.asistencia.findMany.mockResolvedValue([{ id: 1 }]);

    const result = await service.historial(5, 7);

    expect(prisma.asistencia.findMany).toHaveBeenCalledWith({
      where: { tenantId: 7, clienteId: 5 },
      orderBy: {
        fecha: 'desc',
      },
    });
    expect(result).toEqual([{ id: 1 }]);
  });
});
