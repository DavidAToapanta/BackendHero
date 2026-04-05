import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProductoService } from './producto.service';

const makePrisma = () => ({
  producto: {
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

describe('ProductoService', () => {
  let service: ProductoService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductoService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ProductoService>(ProductoService);
  });

  it('create guarda tenantId', async () => {
    const dto = { nombre: 'Proteina', precio: 45, stock: 8, estado: true };
    prisma.producto.create.mockResolvedValue({ id: 1, tenantId: 9, ...dto });

    await service.create(dto, 9);

    expect(prisma.producto.create).toHaveBeenCalledWith({
      data: {
        tenantId: 9,
        ...dto,
      },
    });
  });

  it('findAll filtra por tenant y search', async () => {
    prisma.producto.count.mockResolvedValue(1);
    prisma.producto.findMany.mockResolvedValue([
      { id: 1, tenantId: 9, nombre: 'Proteina', precio: 45, stock: 8, estado: true },
    ]);

    await service.findAll(1, 10, 'prote', 9);

    expect(prisma.producto.count).toHaveBeenCalledWith({
      where: {
        tenantId: 9,
        nombre: {
          contains: 'prote',
          mode: 'insensitive',
        },
      },
    });
  });

  it('findOne rechaza productos de otro tenant', async () => {
    prisma.producto.findFirst.mockResolvedValue(null);

    await expect(service.findOne(5, 9)).rejects.toThrow(NotFoundException);
  });
});