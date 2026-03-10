import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FacturaService } from 'src/factura/factura.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ClientePlanService } from './cliente-plan.service';

const makePlanActivo = (overrides: Partial<any> = {}) => ({
  id: 1,
  clienteId: 10,
  planId: 5,
  fechaInicio: new Date(),
  fechaFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  diaPago: 8,
  activado: true,
  estado: 'ACTIVO',
  plan: { id: 5, nombre: 'Plan Basico', precio: 50 },
  pago: [],
  ...overrides,
});

const makeFacturaActiva = (overrides: Partial<any> = {}) => ({
  id: 101,
  clientePlanId: 1,
  creditoAplicado: 0,
  totalPagado: 0,
  estado: 'PENDIENTE',
  ...overrides,
});

const makeTx = (): any => ({
  clientePlan: { update: jest.fn(), create: jest.fn() },
  deuda: { deleteMany: jest.fn(), create: jest.fn() },
  factura: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  cambioPlan: { create: jest.fn() },
  devolucionMovimiento: { create: jest.fn() },
});

const makePrisma = (): any => ({
  clientePlan: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  plan: {
    findUnique: jest.fn(),
  },
  deuda: {
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
  factura: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  cambioPlan: {
    create: jest.fn(),
  },
  devolucionMovimiento: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => {
    return fn(makeTx());
  }),
});

const makeFacturaService = (): any => ({
  crearFactura: jest.fn().mockResolvedValue({ id: 99 }),
  anularFactura: jest.fn().mockResolvedValue(null),
  aplicarPago: jest.fn(),
});

describe('ClientePlanService - cambiarPlan', () => {
  let service: ClientePlanService;
  let prisma: ReturnType<typeof makePrisma>;
  let facturaService: ReturnType<typeof makeFacturaService>;

  const dtoCambio = {
    nuevoPlanId: 6,
    fechaInicio: new Date().toISOString(),
    fechaFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    motivo: 'Subida de plan',
  };

  beforeEach(async () => {
    prisma = makePrisma();
    facturaService = makeFacturaService();
    prisma.factura.findFirst.mockResolvedValue(makeFacturaActiva());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientePlanService,
        { provide: PrismaService, useValue: prisma },
        { provide: FacturaService, useValue: facturaService },
      ],
    }).compile();

    service = module.get<ClientePlanService>(ClientePlanService);
  });

  it('lanza NotFoundException si el ClientePlan no existe', async () => {
    prisma.clientePlan.findUnique.mockResolvedValue(null);

    await expect(service.cambiarPlan(999, dtoCambio)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza BadRequestException si el plan no esta ACTIVO', async () => {
    prisma.clientePlan.findUnique.mockResolvedValue(
      makePlanActivo({ estado: 'CAMBIADO' }),
    );

    await expect(service.cambiarPlan(1, dtoCambio)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lanza BadRequestException si se intenta cambiar al mismo plan', async () => {
    prisma.clientePlan.findUnique.mockResolvedValue(makePlanActivo({ planId: 6 }));

    await expect(
      service.cambiarPlan(1, { ...dtoCambio, nuevoPlanId: 6 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lanza BadRequestException si han pasado mas de 72h desde el inicio', async () => {
    const fechaInicio = new Date(Date.now() - 73 * 60 * 60 * 1000);
    prisma.clientePlan.findUnique.mockResolvedValue(
      makePlanActivo({ fechaInicio }),
    );

    await expect(service.cambiarPlan(1, dtoCambio)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lanza NotFoundException si el nuevo plan no existe', async () => {
    prisma.clientePlan.findUnique.mockResolvedValue(makePlanActivo());
    prisma.plan.findUnique.mockResolvedValue(null);

    await expect(service.cambiarPlan(1, dtoCambio)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('retorna resumen correcto cuando no hay pagos previos (credito = 0)', async () => {
    const planActual = makePlanActivo({ pago: [] });
    const nuevoPlanData = { id: 6, nombre: 'Plan Premium', precio: 80 };
    const nuevoClientePlan = {
      id: 2,
      clienteId: 10,
      fechaInicio: new Date(),
      fechaFin: new Date(),
    };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.plan.findUnique.mockResolvedValue(nuevoPlanData);

    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      return fn(tx);
    });

    const resultado = await service.cambiarPlan(1, dtoCambio);

    expect(resultado.financiero.creditoAplicado).toBe(0);
    expect(resultado.financiero.faltante).toBe(80);
    expect(resultado.financiero.devolucionPendiente).toBe(0);
    expect(resultado.planNuevo.id).toBe(2);
  });

  it('calcula faltante = 0 cuando credito >= precio nuevo (hay devolucion)', async () => {
    const planActual = makePlanActivo();
    const nuevoPlanData = { id: 6, nombre: 'Plan Basico', precio: 60 };
    const nuevoClientePlan = {
      id: 2,
      clienteId: 10,
      fechaInicio: new Date(),
      fechaFin: new Date(),
    };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.factura.findFirst.mockResolvedValue(
      makeFacturaActiva({ clientePlanId: planActual.id, totalPagado: 100 }),
    );
    prisma.plan.findUnique.mockResolvedValue(nuevoPlanData);

    let txMock: any;
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      txMock = tx;
      return fn(tx);
    });

    const resultado = await service.cambiarPlan(1, dtoCambio);

    expect(resultado.financiero.creditoAplicado).toBe(60);
    expect(resultado.financiero.faltante).toBe(0);
    expect(resultado.financiero.devolucionPendiente).toBe(40);
    expect(txMock.deuda.create).not.toHaveBeenCalled();
    expect(txMock.cambioPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          devolucionPendiente: 40,
          devolucionDevueltaAcumulada: 0,
          estadoDevolucion: 'PENDIENTE',
        }),
      }),
    );
  });

  it('calcula faltante > 0 cuando credito < precio nuevo', async () => {
    const planActual = makePlanActivo();
    const nuevoPlanData = { id: 6, nombre: 'Plan Premium', precio: 80 };
    const nuevoClientePlan = {
      id: 2,
      clienteId: 10,
      fechaInicio: new Date(),
      fechaFin: new Date(),
    };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.factura.findFirst.mockResolvedValue(
      makeFacturaActiva({ clientePlanId: planActual.id, totalPagado: 30 }),
    );
    prisma.plan.findUnique.mockResolvedValue(nuevoPlanData);

    let txMock: any;
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      txMock = tx;
      return fn(tx);
    });

    const resultado = await service.cambiarPlan(1, dtoCambio);

    expect(resultado.financiero.creditoAplicado).toBe(30);
    expect(resultado.financiero.faltante).toBe(50);
    expect(resultado.financiero.devolucionPendiente).toBe(0);
    expect(txMock.deuda.create).toHaveBeenCalled();
    expect(txMock.cambioPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          devolucionPendiente: 0,
          devolucionDevueltaAcumulada: 0,
          estadoDevolucion: 'NO_APLICA',
        }),
      }),
    );
  });

  it('10 -> 30, pagar 20, volver a 10 => devolucion 20', async () => {
    const planActual = makePlanActivo({
      id: 20,
      planId: 30,
      plan: { id: 30, nombre: 'Plan 30', precio: 30 },
    });
    const dtoVolverA10 = {
      nuevoPlanId: 10,
      fechaInicio: new Date().toISOString(),
      fechaFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      motivo: 'Volver al plan base',
    };
    const planBase = { id: 10, nombre: 'Plan 10', precio: 10 };
    const nuevoClientePlan = {
      id: 21,
      clienteId: 10,
      fechaInicio: new Date(),
      fechaFin: new Date(),
    };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.factura.findFirst.mockResolvedValue(
      makeFacturaActiva({
        clientePlanId: planActual.id,
        creditoAplicado: 10,
        totalPagado: 20,
      }),
    );
    prisma.plan.findUnique.mockResolvedValue(planBase);

    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      return fn(tx);
    });

    const resultado = await service.cambiarPlan(planActual.id, dtoVolverA10);

    expect(resultado.financiero.creditoTotal).toBe(30);
    expect(resultado.financiero.creditoAplicado).toBe(10);
    expect(resultado.financiero.devolucionPendiente).toBe(20);
    expect(facturaService.crearFactura).toHaveBeenCalledWith(
      nuevoClientePlan.id,
      { creditoAplicado: 10 },
      expect.anything(),
    );
  });

  it('10 -> 30, no pagar nada mas, volver a 10 => devolucion 0', async () => {
    const planActual = makePlanActivo({
      id: 30,
      planId: 30,
      plan: { id: 30, nombre: 'Plan 30', precio: 30 },
    });
    const dtoVolverA10 = {
      nuevoPlanId: 10,
      fechaInicio: new Date().toISOString(),
      fechaFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      motivo: 'Volver al plan base',
    };
    const planBase = { id: 10, nombre: 'Plan 10', precio: 10 };
    const nuevoClientePlan = {
      id: 31,
      clienteId: 10,
      fechaInicio: new Date(),
      fechaFin: new Date(),
    };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.factura.findFirst.mockResolvedValue(
      makeFacturaActiva({
        clientePlanId: planActual.id,
        creditoAplicado: 10,
        totalPagado: 0,
      }),
    );
    prisma.plan.findUnique.mockResolvedValue(planBase);

    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      return fn(tx);
    });

    const resultado = await service.cambiarPlan(planActual.id, dtoVolverA10);

    expect(resultado.financiero.creditoTotal).toBe(10);
    expect(resultado.financiero.creditoAplicado).toBe(10);
    expect(resultado.financiero.devolucionPendiente).toBe(0);
    expect(facturaService.crearFactura).toHaveBeenCalledWith(
      nuevoClientePlan.id,
      { creditoAplicado: 10 },
      expect.anything(),
    );
  });

  it('10 -> 30, pagar 5, volver a 10 => devolucion 5', async () => {
    const planActual = makePlanActivo({
      id: 40,
      planId: 30,
      plan: { id: 30, nombre: 'Plan 30', precio: 30 },
    });
    const dtoVolverA10 = {
      nuevoPlanId: 10,
      fechaInicio: new Date().toISOString(),
      fechaFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      motivo: 'Volver al plan base',
    };
    const planBase = { id: 10, nombre: 'Plan 10', precio: 10 };
    const nuevoClientePlan = {
      id: 41,
      clienteId: 10,
      fechaInicio: new Date(),
      fechaFin: new Date(),
    };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.factura.findFirst.mockResolvedValue(
      makeFacturaActiva({
        clientePlanId: planActual.id,
        creditoAplicado: 10,
        totalPagado: 5,
      }),
    );
    prisma.plan.findUnique.mockResolvedValue(planBase);

    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      return fn(tx);
    });

    const resultado = await service.cambiarPlan(planActual.id, dtoVolverA10);

    expect(resultado.financiero.creditoTotal).toBe(15);
    expect(resultado.financiero.creditoAplicado).toBe(10);
    expect(resultado.financiero.devolucionPendiente).toBe(5);
    expect(facturaService.crearFactura).toHaveBeenCalledWith(
      nuevoClientePlan.id,
      { creditoAplicado: 10 },
      expect.anything(),
    );
  });

  it('llama a anularFactura y crearFactura dentro de la transaccion', async () => {
    const planActual = makePlanActivo();
    const nuevoPlanData = { id: 6, nombre: 'Plan Pro', precio: 80 };
    const nuevoClientePlan = {
      id: 2,
      clienteId: 10,
      fechaInicio: new Date(),
      fechaFin: new Date(),
    };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.factura.findFirst.mockResolvedValue(
      makeFacturaActiva({ clientePlanId: planActual.id, totalPagado: 50 }),
    );
    prisma.plan.findUnique.mockResolvedValue(nuevoPlanData);

    let captureTx: any;
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      captureTx = tx;
      return fn(tx);
    });

    await service.cambiarPlan(1, dtoCambio);

    expect(facturaService.anularFactura).toHaveBeenCalledWith(1, captureTx);
    expect(facturaService.crearFactura).toHaveBeenCalledWith(
      nuevoClientePlan.id,
      { creditoAplicado: 50 },
      captureTx,
    );
  });

  it('crea el nuevo ClientePlan con diaPago calculado desde fechaInicio en UTC', async () => {
    const fechaInicio = '2026-03-01T23:30:00-05:00'; // UTC => 2026-03-02
    const planActual = makePlanActivo({ pago: [] });
    const nuevoPlanData = { id: 6, nombre: 'Plan Pro', precio: 80 };
    const nuevoClientePlan = {
      id: 2,
      clienteId: 10,
      fechaInicio: new Date(),
      fechaFin: new Date(),
    };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.plan.findUnique.mockResolvedValue(nuevoPlanData);

    let txMock: any;
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      txMock = tx;
      return fn(tx);
    });

    await service.cambiarPlan(1, { ...dtoCambio, fechaInicio });

    expect(txMock.clientePlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          diaPago: 2,
        }),
      }),
    );
  });

  it('el plan anterior queda con estado CAMBIADO y activado=false', async () => {
    const planActual = makePlanActivo({ pago: [] });
    const nuevoPlanData = { id: 6, nombre: 'Plan X', precio: 50 };
    const nuevoClientePlan = {
      id: 2,
      clienteId: 10,
      fechaInicio: new Date(),
      fechaFin: new Date(),
    };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.plan.findUnique.mockResolvedValue(nuevoPlanData);

    let txMock: any;
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      txMock = tx;
      return fn(tx);
    });

    await service.cambiarPlan(1, dtoCambio);

    expect(txMock.clientePlan.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { estado: 'CAMBIADO', activado: false },
    });
  });
});

describe('ClientePlanService - remove (quitar plan)', () => {
  let service: ClientePlanService;
  let prisma: ReturnType<typeof makePrisma>;
  let facturaService: ReturnType<typeof makeFacturaService>;

  beforeEach(async () => {
    prisma = makePrisma();
    facturaService = makeFacturaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientePlanService,
        { provide: PrismaService, useValue: prisma },
        { provide: FacturaService, useValue: facturaService },
      ],
    }).compile();

    service = module.get<ClientePlanService>(ClientePlanService);
  });

  it('lanza BadRequestException si el id no es valido', async () => {
    await expect(service.remove(Number.NaN)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lanza NotFoundException si el plan no existe', async () => {
    prisma.clientePlan.findUnique.mockResolvedValue(null);

    await expect(service.remove(999)).rejects.toThrow(NotFoundException);
  });

  it('lanza BadRequestException si el plan no esta activo', async () => {
    prisma.clientePlan.findUnique.mockResolvedValue(
      makePlanActivo({ activado: false, estado: 'CANCELADO' }),
    );

    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
  });

  it('cancela el plan activo sin eliminar registros relacionados', async () => {
    const planActual = makePlanActivo({
      fechaFin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    prisma.clientePlan.findUnique.mockResolvedValue(planActual);

    let txMock: any;
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.deuda.deleteMany.mockResolvedValue({ count: 1 });
      tx.clientePlan.update.mockResolvedValue({
        ...planActual,
        activado: false,
        estado: 'CANCELADO',
        fechaFin: new Date(),
      });
      txMock = tx;
      return fn(tx);
    });

    const resultado = await service.remove(planActual.id);

    expect(facturaService.anularFactura).toHaveBeenCalledWith(planActual.id, txMock);
    expect(txMock.deuda.deleteMany).toHaveBeenCalledWith({
      where: {
        clientePlanId: planActual.id,
        solventada: false,
      },
    });
    expect(txMock.clientePlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: planActual.id },
        data: expect.objectContaining({
          activado: false,
          estado: 'CANCELADO',
        }),
      }),
    );
    expect(resultado.mensaje).toBe('Plan quitado correctamente');
  });
});
