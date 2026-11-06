import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { FacturaService } from './factura.service';

const makeTx = () => ({
  factura: {
    findFirst: jest.fn(),
  },
  cambioPlan: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  devolucionMovimiento: {
    create: jest.fn(),
  },
});

const makePrisma = () => {
  const tx = makeTx();
  const prisma = {
    factura: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (trx: typeof tx) => Promise<any>) =>
      fn(tx),
    ),
  };

  return { prisma, tx };
};

describe('FacturaService', () => {
  let service: FacturaService;
  let prisma: ReturnType<typeof makePrisma>['prisma'];
  let tx: ReturnType<typeof makePrisma>['tx'];

  beforeEach(async () => {
    const mocks = makePrisma();
    prisma = mocks.prisma;
    tx = mocks.tx;

    const module: TestingModule = await Test.createTestingModule({
      providers: [FacturaService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<FacturaService>(FacturaService);
  });

  it('devolver usa tenantId en cambioPlan y devolucionMovimiento', async () => {
    tx.factura.findFirst.mockResolvedValue({ id: 45, clientePlanId: 12 });
    tx.cambioPlan.findFirst.mockResolvedValue({
      id: 100,
      devolucionPendiente: 50,
      devolucionDevueltaAcumulada: 0,
      estadoDevolucion: 'PENDIENTE',
    });
    tx.cambioPlan.update.mockResolvedValue({
      id: 100,
      devolucionPendiente: 30,
      devolucionDevueltaAcumulada: 20,
      estadoDevolucion: 'PARCIAL',
    });

    const resultado = await service.devolver(
      45,
      { monto: 20, motivo: 'Caja' },
      9,
    );

    expect(tx.cambioPlan.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 9,
        clientePlanNuevoId: 12,
      },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        devolucionPendiente: true,
        devolucionDevueltaAcumulada: true,
        estadoDevolucion: true,
      },
    });
    expect(tx.devolucionMovimiento.create).toHaveBeenCalledWith({
      data: {
        tenantId: 9,
        cambioPlanId: 100,
        facturaId: 45,
        monto: 20,
        motivo: 'Caja',
      },
    });
    expect(resultado).toEqual(
      expect.objectContaining({
        devolucionPendiente: 30,
        devolucionDevueltaAcumulada: 20,
        estadoDevolucion: 'PARCIAL',
      }),
    );
  });

  it('devolver rechaza montos mayores al pendiente', async () => {
    tx.factura.findFirst.mockResolvedValue({ id: 45, clientePlanId: 12 });
    tx.cambioPlan.findFirst.mockResolvedValue({
      id: 100,
      devolucionPendiente: 10,
      devolucionDevueltaAcumulada: 0,
      estadoDevolucion: 'PENDIENTE',
    });

    await expect(service.devolver(45, { monto: 20 }, 9)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('findAll filtra facturas y refunds por tenant', async () => {
    prisma.factura.count.mockResolvedValue(1);
    prisma.factura.findMany.mockResolvedValue([
      {
        id: 45,
        numero: 'FAC-20260309-1234',
        estado: 'PAGADA',
        clientePlan: {
          id: 12,
          plan: { nombre: 'Plan Pro', precio: 80 },
          cliente: {
            id: 1,
            usuario: { nombres: 'Ana', apellidos: 'Lopez', cedula: '123' },
          },
          cambiosComoNuevo: [
            {
              devolucionPendiente: 20,
              devolucionDevueltaAcumulada: 10,
              estadoDevolucion: 'PARCIAL',
            },
          ],
        },
      },
    ]);

    const resultado = await service.findAll({}, 1, 10, 9);

    expect(prisma.factura.count).toHaveBeenCalledWith({
      where: { tenantId: 9 },
    });
    const findManyArgs = prisma.factura.findMany.mock.calls[0][0];
    expect(findManyArgs.where).toEqual({ tenantId: 9 });
    expect(
      findManyArgs.include.clientePlan.include.cambiosComoNuevo.where,
    ).toEqual({ tenantId: 9 });
    expect(resultado.data[0]).toEqual(
      expect.objectContaining({
        id: 45,
        devolucionPendiente: 20,
        devolucionDevueltaAcumulada: 10,
        estadoDevolucion: 'PARCIAL',
      }),
    );
  });

  it('findOne usa id + tenantId', async () => {
    prisma.factura.findFirst.mockResolvedValue({
      id: 45,
      numero: 'FAC-20260309-1234',
      estado: 'PAGADA',
      clientePlan: {
        id: 12,
        plan: { nombre: 'Plan Pro', precio: 80 },
        cliente: {
          id: 1,
          usuario: { nombres: 'Ana', apellidos: 'Lopez' },
        },
        cambiosComoNuevo: [
          {
            devolucionPendiente: 0,
            devolucionDevueltaAcumulada: 30,
            estadoDevolucion: 'COMPLETADO',
          },
        ],
      },
    });

    const resultado = await service.findOne(45, 9);

    expect(prisma.factura.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 45, tenantId: 9 },
      }),
    );
    expect(resultado.estadoDevolucion).toBe('COMPLETADO');
  });
});
