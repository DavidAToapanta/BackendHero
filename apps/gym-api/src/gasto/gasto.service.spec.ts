import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { GastoService } from './gasto.service';

const makePrisma = () => ({
  gasto: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

describe('GastoService', () => {
  let service: GastoService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GastoService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<GastoService>(GastoService);
  });

  it('create guarda tenantId', async () => {
    const dto = { descripcion: 'Limpieza', monto: 25 };
    prisma.gasto.create.mockResolvedValue({
      id: 1,
      tenantId: 9,
      usuarioId: 3,
      ...dto,
    });

    await service.create(dto, 3, 9);

    expect(prisma.gasto.create).toHaveBeenCalledWith({
      data: {
        tenantId: 9,
        descripcion: 'Limpieza',
        monto: 25,
        usuarioId: 3,
      },
    });
  });

  it('findAll filtra por tenant', async () => {
    prisma.gasto.findMany.mockResolvedValue([]);

    await service.findAll(9);

    expect(prisma.gasto.findMany).toHaveBeenCalledWith({
      where: { tenantId: 9 },
      orderBy: { fecha: 'desc' },
    });
  });

  it('findOne rechaza gastos de otro tenant', async () => {
    prisma.gasto.findFirst.mockResolvedValue(null);

    await expect(service.findOne(7, 9)).rejects.toThrow(NotFoundException);
  });
});
