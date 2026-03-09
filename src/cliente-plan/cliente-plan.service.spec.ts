import { Test, TestingModule } from '@nestjs/testing';
import { ClientePlanService } from './cliente-plan.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FacturaService } from 'src/factura/factura.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// ─── Mock factories ────────────────────────────────────────────────────────────

const makePlanActivo = (overrides: Partial<any> = {}) => ({
  id: 1,
  clienteId: 10,
  planId: 5,
  fechaInicio: new Date(), // ahora mismo → dentro de la ventana de 72h
  fechaFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  diaPago: 8,
  activado: true,
  estado: 'ACTIVO',
  plan: { id: 5, nombre: 'Plan Básico', precio: 50 },
  pago: [], // sin pagos por defecto
  ...overrides,
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
  $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => {
    // Ejecuta la fn pasándole un mock de tx con los mismos mocks
    return fn(makeTx());
  }),
});

const makeTx = (): any => ({
  clientePlan: { update: jest.fn(), create: jest.fn() },
  deuda: { deleteMany: jest.fn(), create: jest.fn() },
  factura: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  cambioPlan: { create: jest.fn() },
});

const makeFacturaService = (): any => ({
  crearFactura: jest.fn().mockResolvedValue({ id: 99 }),
  anularFactura: jest.fn().mockResolvedValue(null),
  aplicarPago: jest.fn(),
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ClientePlanService - cambiarPlan', () => {
  let service: ClientePlanService;
  let prisma: ReturnType<typeof makePrisma>;
  let facturaService: ReturnType<typeof makeFacturaService>;

  const dtoCambio = {
    nuevoPlanId: 6,
    fechaInicio: new Date().toISOString(),
    fechaFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    diaPago: 8,
    motivo: 'Subida de plan',
  };

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

  // ────────────────────────────────────────────────────────────────────────────
  // Validaciones de entrada
  // ────────────────────────────────────────────────────────────────────────────

  it('lanza NotFoundException si el ClientePlan no existe', async () => {
    prisma.clientePlan.findUnique.mockResolvedValue(null);

    await expect(service.cambiarPlan(999, dtoCambio)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza BadRequestException si el plan no está ACTIVO', async () => {
    const planCambiado = makePlanActivo({ estado: 'CAMBIADO' });
    prisma.clientePlan.findUnique.mockResolvedValue(planCambiado);

    await expect(service.cambiarPlan(1, dtoCambio)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lanza BadRequestException si se intenta cambiar al mismo plan', async () => {
    const planActual = makePlanActivo({ planId: 6 }); // mismo que nuevoPlanId
    prisma.clientePlan.findUnique.mockResolvedValue(planActual);

    await expect(service.cambiarPlan(1, { ...dtoCambio, nuevoPlanId: 6 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lanza BadRequestException si han pasado más de 72h desde el inicio', async () => {
    const fechaInicio = new Date(Date.now() - 73 * 60 * 60 * 1000); // hace 73h
    const planFuera = makePlanActivo({ fechaInicio });
    prisma.clientePlan.findUnique.mockResolvedValue(planFuera);

    await expect(service.cambiarPlan(1, dtoCambio)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lanza NotFoundException si el nuevo plan no existe', async () => {
    const planActual = makePlanActivo();
    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.plan.findUnique.mockResolvedValue(null); // nuevo plan no existe

    await expect(service.cambiarPlan(1, dtoCambio)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Casos de éxito
  // ────────────────────────────────────────────────────────────────────────────

  it('retorna resumen correcto cuando NO hay pagos previos (crédito = 0)', async () => {
    const planActual = makePlanActivo({ pago: [] }); // sin pagos
    const nuevoPlanData = { id: 6, nombre: 'Plan Premium', precio: 80 };
    const nuevoClientePlan = { id: 2, clienteId: 10, fechaInicio: new Date(), fechaFin: new Date() };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.plan.findUnique.mockResolvedValue(nuevoPlanData);

    // setup $transaction para que la fn reciba un tx con create que devuelva el nuevo plan
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      return fn(tx);
    });

    const resultado = await service.cambiarPlan(1, dtoCambio);

    expect(resultado.financiero.creditoAplicado).toBe(0);
    expect(resultado.financiero.faltante).toBe(80); // precio completo como deuda
    expect(resultado.financiero.devolucionPendiente).toBe(0);
    expect(resultado.planNuevo.id).toBe(2);
  });

  it('calcula faltante = 0 cuando crédito >= precio nuevo (hay devolución)', async () => {
    const pagos = [{ id: 1, monto: 100, fecha: new Date(), clientePlanId: 1 }];
    const planActual = makePlanActivo({ pago: pagos });
    const nuevoPlanData = { id: 6, nombre: 'Plan Básico', precio: 60 };
    const nuevoClientePlan = { id: 2, clienteId: 10, fechaInicio: new Date(), fechaFin: new Date() };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.plan.findUnique.mockResolvedValue(nuevoPlanData);

    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      return fn(tx);
    });

    const resultado = await service.cambiarPlan(1, dtoCambio);

    expect(resultado.financiero.creditoAplicado).toBe(100);
    expect(resultado.financiero.faltante).toBe(0); // 60 - 100 = ≤ 0 → 0
    expect(resultado.financiero.devolucionPendiente).toBe(40); // 100 - 60 = 40
  });

  it('calcula faltante > 0 cuando crédito < precio nuevo', async () => {
    const pagos = [{ id: 1, monto: 30, fecha: new Date(), clientePlanId: 1 }];
    const planActual = makePlanActivo({ pago: pagos });
    const nuevoPlanData = { id: 6, nombre: 'Plan Premium', precio: 80 };
    const nuevoClientePlan = { id: 2, clienteId: 10, fechaInicio: new Date(), fechaFin: new Date() };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
    prisma.plan.findUnique.mockResolvedValue(nuevoPlanData);

    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = makeTx();
      tx.clientePlan.create.mockResolvedValue(nuevoClientePlan);
      tx.cambioPlan.create.mockResolvedValue({});
      return fn(tx);
    });

    const resultado = await service.cambiarPlan(1, dtoCambio);

    expect(resultado.financiero.creditoAplicado).toBe(30);
    expect(resultado.financiero.faltante).toBe(50); // 80 - 30 = 50
    expect(resultado.financiero.devolucionPendiente).toBe(0);
  });

  it('llama a anularFactura y crearFactura dentro de la transacción', async () => {
    const planActual = makePlanActivo({ pago: [{ id: 1, monto: 50, fecha: new Date(), clientePlanId: 1 }] });
    const nuevoPlanData = { id: 6, nombre: 'Plan Pro', precio: 80 };
    const nuevoClientePlan = { id: 2, clienteId: 10, fechaInicio: new Date(), fechaFin: new Date() };

    prisma.clientePlan.findUnique.mockResolvedValue(planActual);
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

    // Verificar que se llamó a los métodos de facturaService con el tx
    expect(facturaService.anularFactura).toHaveBeenCalledWith(1, captureTx);
    expect(facturaService.crearFactura).toHaveBeenCalledWith(
      nuevoClientePlan.id,
      { creditoAplicado: 50 },
      captureTx,
    );
  });

  it('el plan anterior queda con estado CAMBIADO y activado=false', async () => {
    const planActual = makePlanActivo({ pago: [] });
    const nuevoPlanData = { id: 6, nombre: 'Plan X', precio: 50 };
    const nuevoClientePlan = { id: 2, clienteId: 10, fechaInicio: new Date(), fechaFin: new Date() };

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
