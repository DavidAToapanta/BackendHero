import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/prisma';
import { ModuleKey, Prisma } from '@prisma/client';
import { CatalogoService } from './catalogo.service';
import { CategoriasProductoService } from './categorias-producto.service';
import { ImagenesProductoService } from './imagenes-producto.service';

describe('Catálogo compartido', () => {
  const prisma = {
    producto: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    categoriaProducto: { create: jest.fn(), findUnique: jest.fn() },
    tenantModule: { findUnique: jest.fn() },
    productoImagen: { create: jest.fn(), update: jest.fn() },
  };
  const client = prisma as unknown as PrismaService;
  const catalogo = new CatalogoService(client);
  const categorias = new CategoriasProductoService(client);
  const imagenes = new ImagenesProductoService(client);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('crea la ficha con stock inicial cero y mantiene los ceros del código de barras', async () => {
    await catalogo.create(9, {
      nombre: 'Proteína',
      estado: true,
      precio: new Prisma.Decimal('2.50'),
      sku: ' ',
      codigoBarras: ' 00123 ',
    });

    expect(prisma.producto.create).toHaveBeenCalledWith({
      data: {
        tenantId: 9,
        nombre: 'Proteína',
        estado: true,
        precio: new Prisma.Decimal('2.50'),
        stock: 0,
        sku: null,
        codigoBarras: '00123',
      },
    });
  });

  it('impide eliminar un producto cuando la base protege sus registros asociados', async () => {
    prisma.producto.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('FK', {
        code: 'P2003',
        clientVersion: Prisma.prismaVersion.client,
      }),
    );

    await expect(catalogo.remove(9, 5)).rejects.toThrow(ConflictException);
    expect(prisma.producto.delete).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: 9, id: 5 } },
    });
  });

  it('normaliza el nombre dentro del módulo habilitado del tenant', async () => {
    prisma.tenantModule.findUnique.mockResolvedValue({ id: 1 });

    await categorias.create(9, ModuleKey.STORE, '  Bebidas   Frías  ');

    expect(prisma.tenantModule.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_module: { tenantId: 9, module: ModuleKey.STORE },
        activo: true,
      },
      select: { id: true },
    });
    expect(prisma.categoriaProducto.create).toHaveBeenCalledWith({
      data: {
        tenantId: 9,
        modulo: ModuleKey.STORE,
        nombre: 'Bebidas Frías',
        nombreNormalizado: 'bebidas frías',
      },
    });
  });

  it('rechaza la creación de categorías en un módulo deshabilitado', async () => {
    prisma.tenantModule.findUnique.mockResolvedValue(null);

    await expect(
      categorias.create(9, ModuleKey.STORE, 'Bebidas'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.categoriaProducto.create).not.toHaveBeenCalled();
  });

  it('solo permite asignar una categoría activa del mismo tenant y módulo', async () => {
    prisma.tenantModule.findUnique.mockResolvedValue({ id: 1 });
    prisma.categoriaProducto.findUnique.mockResolvedValue(null);

    await expect(
      categorias.asignarAProducto(9, ModuleKey.STORE, 5, 3),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.categoriaProducto.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_id: { tenantId: 9, id: 3 },
        modulo: ModuleKey.STORE,
        activo: true,
      },
      select: { id: true },
    });
    expect(prisma.producto.update).not.toHaveBeenCalled();
  });

  it('vincula una imagen a un producto por la clave que incluye el tenant', async () => {
    await imagenes.create(9, 5, {
      url: ' https://ejemplo.test/producto.jpg ',
      orden: 0,
    });

    expect(prisma.productoImagen.create).toHaveBeenCalledWith({
      data: {
        url: 'https://ejemplo.test/producto.jpg',
        orden: 0,
        producto: { connect: { tenantId_id: { tenantId: 9, id: 5 } } },
        tenant: { connect: { id: 9 } },
      },
    });
  });

  it('limita la edición de una imagen al producto y tenant indicados', async () => {
    await imagenes.update(9, 5, 1, { orden: 2 });

    expect(prisma.productoImagen.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: 9, id: 1 }, productoId: 5 },
      data: { orden: 2 },
    });
  });
});
