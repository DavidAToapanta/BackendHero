import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ModoInventario, Prisma } from '@prisma/client';
import { PrismaService } from '@app/prisma';
import { CatalogoService } from '@app/catalogo';
import { InventarioService } from '@app/inventario';
import { ProductoService } from './producto.service';

const makePrisma = () => ({
  producto: {
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe('ProductoService', () => {
  let service: ProductoService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    prisma.$transaction.mockImplementation(
      (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductoService,
        CatalogoService,
        InventarioService,
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
      {
        id: 1,
        tenantId: 9,
        nombre: 'Proteina',
        precio: 45,
        stock: 8,
        estado: true,
      },
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

  it('conserva precio numerico al serializar un producto Decimal', async () => {
    prisma.producto.findFirst.mockResolvedValue({
      id: 5,
      tenantId: 9,
      precio: new Prisma.Decimal('1.25'),
    });

    const producto = await service.findOne(5, 9);

    expect(JSON.parse(JSON.stringify(producto))).toEqual({
      id: 5,
      tenantId: 9,
      precio: 1.25,
    });
  });

  it('conserva precio numerico en los listados', async () => {
    prisma.producto.count.mockResolvedValue(1);
    prisma.producto.findMany.mockResolvedValue([
      { id: 5, precio: new Prisma.Decimal('1.25') },
    ]);

    const resultado = await service.findAll(1, 10, undefined, 9);

    expect(resultado.data[0].precio).toBe(1.25);
  });

  it('edita solo la ficha del producto dentro del tenant', async () => {
    prisma.producto.update.mockResolvedValue({
      id: 5,
      precio: new Prisma.Decimal('2.50'),
    });

    await expect(service.update(5, { precio: 2.5 }, 9)).resolves.toEqual({
      id: 5,
      precio: 2.5,
    });
    expect(prisma.producto.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: 9, id: 5 } },
      data: { precio: 2.5 },
    });
    expect(prisma.producto.updateMany).not.toHaveBeenCalled();
  });

  it('edita stock legacy y ficha en la misma transaccion', async () => {
    prisma.producto.updateMany.mockResolvedValue({ count: 1 });
    prisma.producto.update.mockResolvedValue({
      id: 5,
      precio: new Prisma.Decimal('2.50'),
      stock: 3,
    });

    await expect(
      service.update(5, { precio: 2.5, stock: 3 }, 9),
    ).resolves.toEqual({ id: 5, precio: 2.5, stock: 3 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.producto.updateMany).toHaveBeenCalledWith({
      where: { id: 5, tenantId: 9, modoInventario: ModoInventario.LEGACY },
      data: { stock: 3 },
    });
    expect(prisma.producto.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: 9, id: 5 } },
      data: { precio: 2.5 },
    });
  });

  it('rechaza una edicion directa del stock por lotes sin cambiar la ficha', async () => {
    prisma.producto.updateMany.mockResolvedValue({ count: 0 });
    prisma.producto.findFirst.mockResolvedValue({ id: 5 });

    await expect(
      service.update(5, { precio: 2.5, stock: 3 }, 9),
    ).rejects.toThrow(ConflictException);
    expect(prisma.producto.update).not.toHaveBeenCalled();
  });
});
