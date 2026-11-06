import { OrigenAsistencia, SaasPlan } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AsistenciaService } from './asistencia.service';
import { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  tenant: {
    findUnique: jest.fn(),
  },
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
    update: jest.fn(),
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

  it('registra asistencia historica con fecha pasada dentro del tenant', async () => {
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
      fechaInicio: new Date('2026-04-01'),
      fechaFin: new Date('2026-04-30'),
    });
    prisma.asistencia.create.mockResolvedValue({
      id: 3,
      tenantId: 7,
      clienteId: 5,
      fecha: new Date('2026-04-03'),
    });

    await service.registrarAsistenciaHistorica(
      5,
      '2026-04-03T12:00:00.000Z',
      7,
    );
    const createCalls = prisma.asistencia.create.mock.calls as Array<
      [
        {
          data: {
            tenantId: number;
            clienteId: number;
            fecha: Date;
          };
        },
      ]
    >;
    const createArgs = createCalls[0]?.[0];

    expect(createArgs?.data.tenantId).toBe(7);
    expect(createArgs?.data.clienteId).toBe(5);
    expect(createArgs?.data.fecha.toISOString()).toContain('2026-04-03');
  });

  it('rechaza asistencia historica en fecha futura', async () => {
    prisma.cliente.findFirst.mockResolvedValue({
      id: 5,
      tenantId: 7,
      activo: true,
      usuario: { id: 10 },
    });

    const manana = new Date();
    manana.setDate(manana.getDate() + 1);

    await expect(
      service.registrarAsistenciaHistorica(5, manana.toISOString(), 7),
    ).rejects.toThrow(
      new BadRequestException(
        'No se puede registrar asistencia en una fecha futura',
      ),
    );
  });

  it('rechaza asistencia historica si no tenia plan vigente en esa fecha', async () => {
    prisma.cliente.findFirst.mockResolvedValue({
      id: 5,
      tenantId: 7,
      activo: true,
      usuario: { id: 10 },
    });
    prisma.clientePlan.findFirst.mockResolvedValue(null);

    await expect(
      service.registrarAsistenciaHistorica(5, '2026-04-03T12:00:00.000Z', 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza biometria cuando el tenant esta en FREE', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 7,
      saasPlan: SaasPlan.FREE,
    });

    const result = await service.registrarAsistenciaBiometrica({
      tenantId: 7,
      eventoBiometricoId: 'evt-1',
      occurredAt: '2026-04-03T12:00:00.000Z',
      biometricoPersonId: '2',
      dispositivoSn: 'SN-1',
    });

    expect(result).toEqual({ status: 'rejectedByPlan' });
    expect(prisma.cliente.findFirst).not.toHaveBeenCalled();
  });

  it('acepta biometria cuando el tenant esta en PLUS y crea asistencia valida', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 7,
      saasPlan: SaasPlan.PLUS,
    });
    prisma.asistencia.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.cliente.findFirst.mockResolvedValue({
      id: 5,
      tenantId: 7,
      activo: true,
    });
    prisma.clientePlan.findFirst.mockResolvedValue({
      id: 20,
      tenantId: 7,
      plan: { nombre: 'Mensual', precio: 30 },
      fechaInicio: new Date('2026-04-01'),
      fechaFin: new Date('2026-04-30'),
    });
    prisma.asistencia.create.mockResolvedValue({
      id: 30,
      tenantId: 7,
      clienteId: 5,
      origen: OrigenAsistencia.BIOMETRIA,
    });

    const result = await service.registrarAsistenciaBiometrica({
      tenantId: 7,
      eventoBiometricoId: 'evt-2',
      occurredAt: '2026-04-03T12:00:00.000Z',
      biometricoPersonId: '2',
      dispositivoSn: 'SN-1',
    });
    const biometricCreateCalls = prisma.asistencia.create.mock.calls as Array<
      [
        {
          data: {
            tenantId: number;
            clienteId: number;
            origen: OrigenAsistencia;
            eventoBiometricoId: string;
            dispositivoSn: string;
            biometricoPersonId: string;
          };
        },
      ]
    >;
    const biometricCreateArg = biometricCreateCalls[0]?.[0];

    expect(result.status).toBe('processed');
    expect(biometricCreateArg?.data.tenantId).toBe(7);
    expect(biometricCreateArg?.data.clienteId).toBe(5);
    expect(biometricCreateArg?.data.origen).toBe(OrigenAsistencia.BIOMETRIA);
    expect(biometricCreateArg?.data.eventoBiometricoId).toBe('evt-2');
    expect(biometricCreateArg?.data.dispositivoSn).toBe('SN-1');
    expect(biometricCreateArg?.data.biometricoPersonId).toBe('2');
  });

  it('no duplica por eventoBiometricoId', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 7,
      saasPlan: SaasPlan.PLUS,
    });
    prisma.asistencia.findFirst.mockResolvedValueOnce({
      id: 40,
      tenantId: 7,
      eventoBiometricoId: 'evt-3',
    });

    const result = await service.registrarAsistenciaBiometrica({
      tenantId: 7,
      eventoBiometricoId: 'evt-3',
      occurredAt: '2026-04-03T12:00:00.000Z',
      biometricoPersonId: '2',
      dispositivoSn: 'SN-1',
    });

    expect(result.status).toBe('duplicate');
    expect(prisma.asistencia.create).not.toHaveBeenCalled();
  });

  it('no duplica por asistencia del mismo dia y reutiliza la existente', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 7,
      saasPlan: SaasPlan.PLUS,
    });
    prisma.asistencia.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 41,
        tenantId: 7,
        clienteId: 5,
        eventoBiometricoId: 'evt-previo',
      });
    prisma.cliente.findFirst.mockResolvedValue({
      id: 5,
      tenantId: 7,
      activo: true,
    });
    prisma.clientePlan.findFirst.mockResolvedValue({
      id: 20,
      tenantId: 7,
      plan: { nombre: 'Mensual', precio: 30 },
      fechaInicio: new Date('2026-04-01'),
      fechaFin: new Date('2026-04-30'),
    });

    const result = await service.registrarAsistenciaBiometrica({
      tenantId: 7,
      eventoBiometricoId: 'evt-4',
      occurredAt: '2026-04-03T12:00:00.000Z',
      biometricoPersonId: '2',
      dispositivoSn: 'SN-1',
    });

    expect(result.status).toBe('processed');
    expect(prisma.asistencia.create).not.toHaveBeenCalled();
    expect(prisma.asistencia.update).not.toHaveBeenCalled();
  });

  it('marca no vinculado cuando no existe cliente con zkbioPersonId', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 7,
      saasPlan: SaasPlan.PLUS,
    });
    prisma.asistencia.findFirst.mockResolvedValueOnce(null);
    prisma.cliente.findFirst.mockResolvedValue(null);

    const result = await service.registrarAsistenciaBiometrica({
      tenantId: 7,
      eventoBiometricoId: 'evt-5',
      occurredAt: '2026-04-03T12:00:00.000Z',
      biometricoPersonId: '999',
      dispositivoSn: 'SN-1',
    });

    expect(result.status).toBe('unlinked');
  });

  it('rechaza biometria cuando el cliente no tiene plan vigente', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 7,
      saasPlan: SaasPlan.PLUS,
    });
    prisma.asistencia.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.cliente.findFirst.mockResolvedValue({
      id: 5,
      tenantId: 7,
      activo: true,
    });
    prisma.clientePlan.findFirst.mockResolvedValue(null);

    const result = await service.registrarAsistenciaBiometrica({
      tenantId: 7,
      eventoBiometricoId: 'evt-6',
      occurredAt: '2026-04-03T12:00:00.000Z',
      biometricoPersonId: '2',
      dispositivoSn: 'SN-1',
    });

    expect(result.status).toBe('rejectedByPlan');
  });
});
