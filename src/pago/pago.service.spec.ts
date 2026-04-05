import { Test, TestingModule } from '@nestjs/testing';
import { PagoService } from './pago.service';
import { PrismaService } from '../prisma/prisma.service';
import { FacturaService } from '../factura/factura.service';

const makeTx = () => ({
  clientePlan: {
    findFirst: jest.fn(),
  },
  pago: {
    create: jest.fn(),
  },
  deuda: {
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
});

const makePrisma = () => ({
  pago: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  clientePlan: {
    findFirst: jest.fn(),
  },
  factura: {
    findFirst: jest.fn(),
  },
  deuda: {
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe('PagoService', () => {
  let service: PagoService;
  let prisma: ReturnType<typeof makePrisma>;
  let facturaService: { aplicarPago: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    facturaService = {
      aplicarPago: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PagoService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: FacturaService,
          useValue: facturaService,
        },
      ],
    }).compile();

    service = module.get<PagoService>(PagoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('crea pagos con tenantId y clientePlanId del tenant actual', async () => {
    const tx = makeTx();
    tx.clientePlan.findFirst.mockResolvedValue({
      id: 10,
      tenantId: 7,
      plan: { precio: 50 },
      pago: [],
    });
    tx.pago.create.mockResolvedValue({ id: 99, tenantId: 7, clientePlanId: 10 });
    tx.deuda.deleteMany.mockResolvedValue({ count: 1 });
    facturaService.aplicarPago.mockResolvedValue({ saldo: 0 });
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) =>
      fn(tx),
    );

    const result = await service.create(
      {
        clientePlanId: 10,
        monto: 50,
        fecha: '2026-03-14',
      },
      7,
    );

    expect(tx.pago.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 7,
        clientePlanId: 10,
        monto: 50,
      }),
    });
    expect(facturaService.aplicarPago).toHaveBeenCalledWith(10, 50, tx, 7);
    expect(result).toEqual(expect.objectContaining({ id: 99, tenantId: 7 }));
  });
});
