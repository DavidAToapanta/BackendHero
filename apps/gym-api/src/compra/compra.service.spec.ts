import { MembresiasPersonalService } from '@app/negocios';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ModoInventario,
  Prisma,
  TipoMovimientoInventario,
} from '@prisma/client';
import { InventarioLotesService, InventarioService } from '@app/inventario';
import { PrismaService } from '@app/prisma';
import { CompraService } from './compra.service';

const makeTx = () => ({
  $queryRaw: jest.fn(),
  cliente: { findFirst: jest.fn() },
  userTenant: { findUnique: jest.fn() },
  producto: {
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  loteInventario: {
    aggregate: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  movimientoInventario: { create: jest.fn() },
  compra: {
    create: jest.fn(),
  },
});

const makePrisma = () => {
  const tx = makeTx();
  const prisma = {
    $transaction: jest.fn(async (fn: (trx: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };

  return { prisma, tx };
};

describe('CompraService', () => {
  let service: CompraService;
  let tx: ReturnType<typeof makePrisma>['tx'];

  beforeEach(async () => {
    const mocks = makePrisma();
    tx = mocks.tx;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompraService,
        MembresiasPersonalService,
        InventarioService,
        InventarioLotesService,
        { provide: PrismaService, useValue: mocks.prisma },
      ],
    }).compile();

    service = module.get<CompraService>(CompraService);
  });

  it('rechaza compras para clientes fuera del tenant', async () => {
    tx.cliente.findFirst.mockResolvedValue(null);

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
    tx.cliente.findFirst.mockResolvedValue({ id: 7 });
    tx.$queryRaw.mockResolvedValue([
      {
        id: 1,
        nombre: 'Proteina',
        precio: new Prisma.Decimal(45),
        modoInventario: ModoInventario.LEGACY,
      },
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

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.producto.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        tenantId: 9,
        modoInventario: ModoInventario.LEGACY,
        stock: { gte: 2 },
      },
      data: {
        stock: {
          decrement: 2,
        },
      },
    });
    const [compra] = tx.compra.create.mock.calls[0] as [
      { data: Prisma.CompraUncheckedCreateInput },
    ];
    expect(compra.data).toMatchObject({
      tenantId: 9,
      clienteId: 7,
      productoId: 1,
      cantidad: 2,
      total: 90,
    });
  });

  it('valida stock acumulado cuando el mismo producto se repite', async () => {
    tx.cliente.findFirst.mockResolvedValue({ id: 7 });
    tx.$queryRaw.mockResolvedValue([
      {
        id: 1,
        nombre: 'Proteina',
        precio: new Prisma.Decimal(45),
        modoInventario: ModoInventario.LEGACY,
      },
    ]);
    tx.producto.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

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

  it('calcula el total legacy con precio Decimal sin error binario', async () => {
    tx.cliente.findFirst.mockResolvedValue({ id: 7 });
    tx.$queryRaw.mockResolvedValue([
      {
        id: 1,
        nombre: 'Producto',
        precio: new Prisma.Decimal('0.10'),
        modoInventario: ModoInventario.LEGACY,
      },
    ]);
    tx.compra.create.mockResolvedValue({ id: 11 });

    await service.create(
      { clienteId: 7, detalles: [{ productoId: 1, cantidad: 3 }] },
      9,
    );

    const llamada = tx.compra.create.mock.calls[0] as [
      { data: { total: number } },
    ];
    expect(llamada[0].data.total).toBe(0.3);
  });

  it('rechaza la compra si la escritura no encuentra stock suficiente', async () => {
    tx.cliente.findFirst.mockResolvedValue({ id: 7 });
    tx.$queryRaw.mockResolvedValue([
      { id: 1, modoInventario: ModoInventario.LEGACY },
    ]);
    tx.producto.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.create(
        { clienteId: 7, detalles: [{ productoId: 1, cantidad: 1 }] },
        9,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(tx.compra.create).not.toHaveBeenCalled();
  });

  it('registra los movimientos por lote ligados a la misma compra de Gym', async () => {
    const producto = {
      id: 1,
      tenantId: 9,
      modoInventario: ModoInventario.LOTES,
      estado: true,
      stock: 5,
      stockReservado: 1,
      precio: new Prisma.Decimal(8),
    };
    tx.cliente.findFirst.mockResolvedValue({ id: 7 });
    tx.$queryRaw.mockResolvedValue([producto]);
    tx.userTenant.findUnique.mockResolvedValue({ id: 30 });
    tx.compra.create.mockResolvedValue({ id: 11, productoId: 1, cantidad: 2 });
    tx.loteInventario.aggregate.mockResolvedValue({
      _sum: { cantidadFisica: 5 },
    });
    tx.loteInventario.findFirst.mockResolvedValue({
      costoUnitario: new Prisma.Decimal('2.25'),
    });

    await service.create(
      {
        clienteId: 7,
        detalles: [
          { productoId: 1, cantidad: 2, lotes: [{ loteId: 4, cantidad: 2 }] },
        ],
      },
      9,
      2,
    );

    expect(tx.producto.updateMany).not.toHaveBeenCalled();
    const [movimiento] = tx.movimientoInventario.create.mock.calls[0] as [
      { data: Prisma.MovimientoInventarioUncheckedCreateInput },
    ];
    expect(movimiento.data).toMatchObject({
      tenantId: 9,
      tipo: TipoMovimientoInventario.VENTA,
      loteId: 4,
      compraLegacyId: 11,
      responsableId: 30,
      deltaFisico: -2,
      deltaReservado: 0,
      costoTotal: new Prisma.Decimal('4.5'),
    });
  });
});
