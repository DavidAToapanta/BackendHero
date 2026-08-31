import { Test, TestingModule } from '@nestjs/testing';
import { EstadisticasService } from './estadisticas.service';
import { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  pago: {
    groupBy: jest.fn(),
  },
  ingresoRapido: {
    groupBy: jest.fn(),
  },
  $queryRaw: jest.fn(),
});

describe('EstadisticasService', () => {
  let service: EstadisticasService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstadisticasService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<EstadisticasService>(EstadisticasService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('filtra y suma los ingresos del día actual por tenant', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-14T15:00:00.000Z'));

    prisma.pago.groupBy.mockResolvedValue([
      {
        fecha: new Date('2026-03-14T06:00:00.000Z'),
        _sum: { monto: 25 },
      },
    ]);

    prisma.ingresoRapido.groupBy.mockResolvedValue([
      {
        fecha: new Date('2026-03-14T10:00:00.000Z'),
        _sum: { monto: 5 },
      },
    ]);

    const result = await service.obtenerIngresos('dia', 11);

    const rangoEsperado = {
      gte: new Date('2026-03-14T05:00:00.000Z'),
      lt: new Date('2026-03-15T05:00:00.000Z'),
    };

    expect(prisma.pago.groupBy).toHaveBeenCalledWith({
      by: ['fecha'],
      _sum: { monto: true },
      where: {
        tenantId: 11,
        fecha: rangoEsperado,
      },
      orderBy: { fecha: 'asc' },
    });

    expect(prisma.ingresoRapido.groupBy).toHaveBeenCalledWith({
      by: ['fecha'],
      _sum: { monto: true },
      where: {
        tenantId: 11,
        fecha: rangoEsperado,
      },
      orderBy: { fecha: 'asc' },
    });

    expect(result).toEqual([
      {
        label: '2026-03-14',
        total: 30,
      },
    ]);
  });

  it('devuelve una lista vacía cuando no existen ingresos del día', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-14T15:00:00.000Z'));

    prisma.pago.groupBy.mockResolvedValue([]);
    prisma.ingresoRapido.groupBy.mockResolvedValue([]);

    const result = await service.obtenerIngresos('dia', 11);

    expect(result).toEqual([]);
  });
});