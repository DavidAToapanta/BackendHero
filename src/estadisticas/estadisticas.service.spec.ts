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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('filtra ingresos diarios por tenant', async () => {
    prisma.pago.groupBy.mockResolvedValue([
      {
        fecha: new Date('2026-03-14T00:00:00.000Z'),
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

    expect(prisma.pago.groupBy).toHaveBeenCalled();
    expect(prisma.ingresoRapido.groupBy).toHaveBeenCalled();
    expect(result).toEqual([{ label: '2026-03-14', total: 30 }]);
  });
});
