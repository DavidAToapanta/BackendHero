import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { IngresoRapidoService } from './ingreso-rapido.service';

const makePrisma = () => ({
  ingresoRapido: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

describe('IngresoRapidoService', () => {
  let service: IngresoRapidoService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngresoRapidoService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<IngresoRapidoService>(IngresoRapidoService);
  });

  it('crea ingreso rapido en el tenant actual', async () => {
    prisma.ingresoRapido.create.mockResolvedValue({
      id: 1,
      tenantId: 7,
      concepto: 'Pase diario',
      monto: 2.5,
    });

    const result = await service.create(
      { concepto: 'Pase diario', monto: 2.5 },
      7,
    );

    expect(prisma.ingresoRapido.create).toHaveBeenCalledWith({
      data: {
        tenantId: 7,
        concepto: 'Pase diario',
        monto: 2.5,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({ tenantId: 7, concepto: 'Pase diario' }),
    );
  });

  it('lista ingresos del tenant actual', async () => {
    prisma.ingresoRapido.findMany.mockResolvedValue([{ id: 1 }]);

    const result = await service.findAll(7);

    expect(prisma.ingresoRapido.findMany).toHaveBeenCalledWith({
      where: { tenantId: 7 },
      orderBy: { fecha: 'desc' },
    });
    expect(result).toEqual([{ id: 1 }]);
  });

  it('rechaza buscar ingreso inexistente', async () => {
    prisma.ingresoRapido.findFirst.mockResolvedValue(null);

    await expect(service.findOne(99, 7)).rejects.toThrow(
      new NotFoundException('Ingreso rapido no encontrado'),
    );
  });
});
