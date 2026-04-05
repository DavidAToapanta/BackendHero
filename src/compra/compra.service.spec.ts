import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { CompraService } from './compra.service';

const makeTx = () => ({
  producto: {
    update: jest.fn(),
  },
  compra: {
    create: jest.fn(),
  },
});

const makePrisma = () => {
  const tx = makeTx();
  const prisma = {
    cliente: {
      findFirst: jest.fn(),
    },
    producto: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (trx: typeof tx) => Promise<any>) => fn(tx)),
  };

  return { prisma, tx };
};

describe('CompraService', () => {
  let service: CompraService;
  let prisma: ReturnType<typeof makePrisma>['prisma'];
  let tx: ReturnType<typeof makePrisma>['tx'];

  beforeEach(async () => {
    const mocks = makePrisma();
    prisma = mocks.prisma;
    tx = mocks.tx;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompraService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CompraService>(CompraService);
  });

  it('rechaza compras para clientes fuera del tenant', async () => {
    prisma.cliente.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          clienteId: 7,
          detalles: [{ productoId: 1, cantidad: 1 }],
        },
        9,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('crea compras con tenantId y descuenta stock', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 7 });
    prisma.producto.findMany.mockResolvedValue([
      { id: 1, nombre: 'Proteina', precio: 45, stock: 10 },
    ]);
    tx.compra.create.mockResolvedValue({
      id: 11,
      tenantId: 9,
      clienteId: 7,
      productoId: 1,
      cantidad: 2,
      total: 90,
      fecha: new Date(),
    });

    await service.create(
      {
        clienteId: 7,
        detalles: [{ productoId: 1, cantidad: 2 }],
      },
      9,
    );

    expect(prisma.producto.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 9,
        id: { in: [1] },
      },
      select: {
        id: true,
        nombre: true,
        precio: true,
        stock: true,
      },
    });
    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        stock: {
          decrement: 2,
        },
      },
    });
    expect(tx.compra.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 9,
        clienteId: 7,
        productoId: 1,
        cantidad: 2,
        total: 90,
      }),
    });
  });

  it('valida stock acumulado cuando el mismo producto se repite', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 7 });
    prisma.producto.findMany.mockResolvedValue([
      { id: 1, nombre: 'Proteina', precio: 45, stock: 5 },
    ]);

    await expect(
      service.create(
        {
          clienteId: 7,
          detalles: [
            { productoId: 1, cantidad: 3 },
            { productoId: 1, cantidad: 4 },
          ],
        },
        9,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
