import { Test, TestingModule } from '@nestjs/testing';
import { EstadisticasService } from './estadisticas.service';
import { PrismaService } from '../prisma/prisma.service';

const makePrisma = () => ({
  pago: {
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

    const result = await service.obtenerIngresos('dia', 11);

    expect(prisma.pago.groupBy).toHaveBeenCalledWith({
      by: ['fecha'],
      _sum: { monto: true },
      where: { tenantId: 11 },
      orderBy: { fecha: 'asc' },
    });
    expect(result).toEqual([{ label: '2026-03-14', total: 25 }]);
  });
});
