import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RutinaService } from './rutina.service';

const makePrisma = () => ({
  cliente: {
    findFirst: jest.fn(),
  },
  rutina: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  entrenamiento: {
    create: jest.fn(),
  },
});

describe('RutinaService', () => {
  let service: RutinaService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RutinaService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<RutinaService>(RutinaService);
  });

  it('create valida cliente por clienteId + tenantId y crea la rutina en ese tenant', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 55, tenantId: 7 });
    prisma.rutina.create.mockResolvedValue({
      id: 11,
      tenantId: 7,
      clienteId: 55,
      rutina: Buffer.from('demo'),
    });
    prisma.entrenamiento.create.mockResolvedValue({
      id: 22,
      tenantId: 7,
      rutinaId: 11,
    });

    const result = await service.create(
      {
        clienteId: 55,
        rutina: 'data:image/jpeg;base64,ZGVtbw==',
        fechaInicio: '2026-04-01',
        fechaFin: '2026-04-30',
        observacion: 'Rutina inicial',
      },
      7,
    );

    expect(prisma.cliente.findFirst).toHaveBeenCalledWith({
      where: { id: 55, tenantId: 7 },
      select: { id: true, tenantId: true },
    });
    expect(prisma.rutina.create).toHaveBeenCalledWith({
      data: {
        tenantId: 7,
        clienteId: 55,
        rutina: Buffer.from('demo'),
        fechaInicio: new Date('2026-04-01'),
        fechaFin: new Date('2026-04-30'),
        observacion: 'Rutina inicial',
      },
      include: {
        cliente: {
          include: {
            usuario: {
              select: {
                nombres: true,
                apellidos: true,
              },
            },
          },
        },
      },
    });
    expect(prisma.entrenamiento.create).toHaveBeenCalledWith({
      data: {
        tenantId: 7,
        rutinaId: 11,
        finalizado: false,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 11,
        tenantId: 7,
        clienteId: 55,
      }),
    );
  });

  it('findByCliente consulta por clienteId dentro del tenant actual', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 55, tenantId: 7 });
    prisma.rutina.findMany.mockResolvedValue([{ id: 11 }]);

    const result = await service.findByCliente(55, 7);

    expect(prisma.rutina.findMany).toHaveBeenCalledWith({
      where: { clienteId: 55, tenantId: 7 },
      select: {
        id: true,
        tenantId: true,
        clienteId: true,
        fechaInicio: true,
        fechaFin: true,
        observacion: true,
        entrenamiento: true,
      },
      orderBy: {
        fechaInicio: 'desc',
      },
    });
    expect(result).toEqual([{ id: 11 }]);
  });

  it('create rechaza clientes fuera del tenant', async () => {
    prisma.cliente.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          clienteId: 55,
          rutina: 'data:image/jpeg;base64,ZGVtbw==',
          fechaInicio: '2026-04-01',
          fechaFin: '2026-04-30',
          observacion: 'Rutina inicial',
        },
        7,
      ),
    ).rejects.toThrow(new NotFoundException('Cliente no encontrado'));
  });
});
