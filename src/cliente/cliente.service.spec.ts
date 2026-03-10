import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ClienteService } from './cliente.service';

const makePrisma = () => ({
  cliente: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
});

describe('ClienteService', () => {
  let service: ClienteService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClienteService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ClienteService>(ClienteService);
  });

  it('GET /cliente suma devolucionPendiente de cambios pendientes', async () => {
    prisma.cliente.count.mockResolvedValue(1);
    prisma.cliente.findMany.mockResolvedValue([
      {
        id: 123,
        usuario: { nombres: 'Ana', apellidos: 'Lopez' },
        planes: [],
        cambiosPlan: [
          { devolucionPendiente: 12.5 },
          { devolucionPendiente: 7.5 },
        ],
      },
    ]);

    const resultado = await service.findAll(1, 10);

    expect(resultado.data[0]).toEqual(
      expect.objectContaining({
        id: 123,
        devolucionPendiente: 20,
      }),
    );
  });

  it('GET /cliente/:id devuelve devolucionPendiente top-level', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      id: 123,
      usuario: { nombres: 'Ana', apellidos: 'Lopez' },
      planes: [],
      cambiosPlan: [{ devolucionPendiente: 20 }],
    });

    const resultado = await service.findOne(123);

    expect(resultado).toEqual(
      expect.objectContaining({
        id: 123,
        devolucionPendiente: 20,
      }),
    );
  });

  it('GET /cliente/:id lanza NotFoundException si no existe', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('GET /cliente usa activo=true por defecto', async () => {
    prisma.cliente.count.mockResolvedValue(0);
    prisma.cliente.findMany.mockResolvedValue([]);

    await service.findAll(1, 10);

    expect(prisma.cliente.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ activo: true }),
    });
  });

  it('GET /cliente permite listar solo inactivos con activo=false', async () => {
    prisma.cliente.count.mockResolvedValue(0);
    prisma.cliente.findMany.mockResolvedValue([]);

    await service.findAll(1, 10, '', { activo: false });

    expect(prisma.cliente.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ activo: false }),
    });
  });

  it('GET /cliente permite incluir activos e inactivos con incluirInactivos=true', async () => {
    prisma.cliente.count.mockResolvedValue(0);
    prisma.cliente.findMany.mockResolvedValue([]);

    await service.findAll(1, 10, '', { incluirInactivos: true });

    const countCall = prisma.cliente.count.mock.calls[0][0];
    expect(countCall.where.activo).toBeUndefined();
  });

  it('reactivar cambia activo=true', async () => {
    prisma.cliente.findUnique.mockResolvedValue({ id: 5, activo: false });
    prisma.cliente.update.mockResolvedValue({ id: 5, activo: true });

    const resultado = await service.reactivar(5);

    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { activo: true },
    });
    expect(resultado).toEqual(expect.objectContaining({ activo: true }));
  });

  it('desactivar cambia activo=false', async () => {
    prisma.cliente.findUnique.mockResolvedValue({ id: 6, activo: true });
    prisma.cliente.update.mockResolvedValue({ id: 6, activo: false });

    const resultado = await service.desactivar(6);

    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 6 },
      data: { activo: false },
    });
    expect(resultado).toEqual(expect.objectContaining({ activo: false }));
  });
});
