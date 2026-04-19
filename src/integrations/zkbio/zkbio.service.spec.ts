import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ZkbioService } from './zkbio.service';
import { AsistenciaService } from '../../asistencia/asistencia.service';
import { SyncZkbioDto } from './dto/sync-zkbio.dto';
import { PrismaService } from '../../prisma/prisma.service';

const makeAsistenciaService = () => ({
  registrarAsistenciaBiometrica: jest.fn(),
});

const makePrismaService = () => ({
  tenant: {
    findUnique: jest.fn(),
  },
  cliente: {
    findMany: jest.fn(),
  },
});

describe('ZkbioService', () => {
  let service: ZkbioService;
  let asistenciaService: ReturnType<typeof makeAsistenciaService>;
  let prisma: ReturnType<typeof makePrismaService>;

  beforeEach(async () => {
    asistenciaService = makeAsistenciaService();
    prisma = makePrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZkbioService,
        {
          provide: AsistenciaService,
          useValue: asistenciaService,
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ZkbioService>(ZkbioService);
  });

  const validBatch = (): SyncZkbioDto => ({
    device: {
      sn: 'CN8R224760308',
      name: 'Gym',
      ip: '192.168.100.200',
    },
    events: [
      {
        eventId: 'evt-1',
        occurredAt: '2026-04-03T08:15:00.000Z',
        personId: '2',
      },
    ],
  });

  it('no usa tenantId del body y resume resultados por lote', async () => {
    const payload = {
      ...validBatch(),
      tenantId: 99,
    } as SyncZkbioDto & { tenantId: number };

    await expect(service.sync(payload, 7)).rejects.toThrow(BadRequestException);
    expect(
      asistenciaService.registrarAsistenciaBiometrica,
    ).not.toHaveBeenCalled();
  });

  it('resume procesados, duplicados, no vinculados, rechazados e invalidos', async () => {
    asistenciaService.registrarAsistenciaBiometrica
      .mockResolvedValueOnce({ status: 'processed' })
      .mockResolvedValueOnce({ status: 'duplicate' })
      .mockResolvedValueOnce({ status: 'unlinked' })
      .mockResolvedValueOnce({ status: 'rejectedByPlan' });

    const payload: SyncZkbioDto = {
      ...validBatch(),
      events: [
        validBatch().events[0],
        {
          eventId: 'evt-2',
          occurredAt: '2026-04-03T08:16:00.000Z',
          personId: '2',
        },
        {
          eventId: 'evt-3',
          occurredAt: '2026-04-03T08:17:00.000Z',
          personId: '999',
        },
        {
          eventId: 'evt-4',
          occurredAt: '2026-04-03T08:18:00.000Z',
          personId: '2',
        },
        {
          eventId: 'evt-5',
          occurredAt: 'not-a-date',
          personId: '2',
        },
      ],
    };
    const result = await service.sync(payload, 7);

    expect(
      asistenciaService.registrarAsistenciaBiometrica,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tenantId: 7,
        eventoBiometricoId: 'evt-1',
        biometricoPersonId: '2',
      }),
    );
    expect(result).toEqual({
      procesados: 1,
      duplicados: 1,
      noVinculados: 1,
      rechazadosPorPlan: 1,
      invalidos: 1,
    });
  });

  it('calcula estado de acceso por cliente vinculado', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 7, saasPlan: 'PLUS' });
    prisma.cliente.findMany.mockResolvedValue([
      {
        id: 1,
        activo: true,
        zkbioPersonId: '2',
        usuario: { nombres: 'Ana', apellidos: 'Lopez' },
        planes: [{ id: 10 }],
      },
      {
        id: 2,
        activo: true,
        zkbioPersonId: '3',
        usuario: { nombres: 'Luis', apellidos: 'Diaz' },
        planes: [],
      },
      {
        id: 3,
        activo: false,
        zkbioPersonId: '4',
        usuario: { nombres: 'Eva', apellidos: 'Mora' },
        planes: [{ id: 11 }],
      },
    ]);

    const result = await service.getAccessState(7);

    expect(prisma.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 7,
          zkbioPersonId: { not: null },
        },
      }),
    );
    expect(result.clients).toEqual([
      expect.objectContaining({
        clienteId: 1,
        zkbioPersonId: '2',
        shouldHaveAccess: true,
        reason: 'ACTIVE_CLIENT_WITH_VALID_PLAN',
      }),
      expect.objectContaining({
        clienteId: 2,
        zkbioPersonId: '3',
        shouldHaveAccess: false,
        reason: 'NO_VALID_ACTIVE_PLAN',
      }),
      expect.objectContaining({
        clienteId: 3,
        zkbioPersonId: '4',
        shouldHaveAccess: false,
        reason: 'CLIENT_INACTIVE',
      }),
    ]);
  });
});
