import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { FacturaService } from './factura.service';

const makeTx = () => ({
  factura: {
    findUnique: jest.fn(),
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
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (trx: any) => Promise<any>) => fn(tx)),
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
      providers: [
        FacturaService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<FacturaService>(FacturaService);
  });

  it('devolucion parcial de 20 sobre 50 deja pendiente 30 y estado PARCIAL', async () => {
    tx.factura.findUnique.mockResolvedValue({ id: 45, clientePlanId: 12 });
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

    const resultado = await service.devolver(45, { monto: 20, motivo: 'Caja' });

    expect(tx.devolucionMovimiento.create).toHaveBeenCalledWith({
      data: {
        cambioPlanId: 100,
        facturaId: 45,
        monto: 20,
        motivo: 'Caja',
      },
    });
    expect(tx.cambioPlan.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: {
        devolucionPendiente: 30,
        devolucionDevueltaAcumulada: 20,
        estadoDevolucion: 'PARCIAL',
      },
    });
    expect(resultado.devolucionPendiente).toBe(30);
    expect(resultado.devolucionDevueltaAcumulada).toBe(20);
    expect(resultado.estadoDevolucion).toBe('PARCIAL');
  });

  it('devolucion total deja pendiente 0 y estado COMPLETADO', async () => {
    tx.factura.findUnique.mockResolvedValue({ id: 45, clientePlanId: 12 });
    tx.cambioPlan.findFirst.mockResolvedValue({
      id: 100,
      devolucionPendiente: 20,
      devolucionDevueltaAcumulada: 10,
      estadoDevolucion: 'PARCIAL',
    });
    tx.cambioPlan.update.mockResolvedValue({
      id: 100,
      devolucionPendiente: 0,
      devolucionDevueltaAcumulada: 30,
      estadoDevolucion: 'COMPLETADO',
    });

    const resultado = await service.devolver(45, { monto: 20 });

    expect(resultado.devolucionPendiente).toBe(0);
    expect(resultado.estadoDevolucion).toBe('COMPLETADO');
  });

  it('lanza error si intenta devolver mas del pendiente', async () => {
    tx.factura.findUnique.mockResolvedValue({ id: 45, clientePlanId: 12 });
    tx.cambioPlan.findFirst.mockResolvedValue({
      id: 100,
      devolucionPendiente: 10,
      devolucionDevueltaAcumulada: 0,
      estadoDevolucion: 'PENDIENTE',
    });

    await expect(service.devolver(45, { monto: 20 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lanza NotFoundException cuando factura no existe en devolver', async () => {
    tx.factura.findUnique.mockResolvedValue(null);

    await expect(service.devolver(999, { monto: 5 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('GET /facturas devuelve refund flat por fila', async () => {
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

    const resultado = await service.findAll({}, 1, 10);

    expect(resultado.data[0]).toEqual(
      expect.objectContaining({
        id: 45,
        devolucionPendiente: 20,
        devolucionDevueltaAcumulada: 10,
        estadoDevolucion: 'PARCIAL',
      }),
    );
  });

  it('GET /facturas/:id devuelve refund flat en detalle', async () => {
    prisma.factura.findUnique.mockResolvedValue({
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

    const resultado = await service.findOne(45);

    expect(resultado).toEqual(
      expect.objectContaining({
        id: 45,
        devolucionPendiente: 0,
        devolucionDevueltaAcumulada: 30,
        estadoDevolucion: 'COMPLETADO',
      }),
    );
  });
});
