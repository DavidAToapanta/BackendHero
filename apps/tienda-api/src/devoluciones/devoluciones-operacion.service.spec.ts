import type { InventarioLotesService } from '@app/inventario';
import type { PrismaService } from '@app/prisma';
import { ConflictException } from '@nestjs/common';
import { Prisma, type Venta } from '@prisma/client';
import type { CajaService } from '../caja/caja.service';
import type { CuentasService } from '../cartera/cuentas.service';
import type { CobrosOperacionService } from '../cobros/cobros-operacion.service';
import type { CorreccionesCobroService } from '../cobros/correcciones-cobro.service';
import type { AnulacionComprobanteService } from '../comprobantes/anulacion-comprobante.service';
import type { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import {
  CalculoDevolucionesService,
  type LineaDevuelta,
} from './calculo-devoluciones.service';
import { DevolucionesOperacionService } from './devoluciones-operacion.service';
import { DevolucionesService } from './devoluciones.service';

const decimal = (monto: string) => new Prisma.Decimal(monto);
const doble = <T>(objeto: object) => objeto as T;

function escenario(
  precio: string,
  saldo: string,
  descuento = '0',
  impuesto = '0',
) {
  const venta = {
    tenantId: 4,
    id: 15,
    estado: 'COMPLETADA',
    clienteComercialId: 9,
  } as Venta;
  const cuenta = {
    id: 50,
    saldo: decimal(saldo),
    importeExigible: decimal(saldo),
  };
  const detalle = {
    id: 20,
    cantidad: 3,
    precioUnitario: decimal(precio),
    descuento: decimal(descuento),
    impuesto: decimal(impuesto),
  };
  const asignacion = {
    id: 42,
    cantidad: 3,
    productoId: 7,
    loteId: 8,
    costoUnitario: decimal('1'),
    detalleVenta: detalle,
  };
  const lineas: LineaDevuelta[] = [
    { asignacionVentaId: 42, cantidad: 1, destino: 'REINTEGRO_APTO' },
  ];
  const totalVenta = detalle.precioUnitario
    .times(3)
    .minus(descuento)
    .plus(impuesto);
  const pagado = totalVenta.minus(cuenta.saldo);
  const inicial = Prisma.Decimal.min(pagado, decimal('20.00'));
  cuenta.importeExigible = totalVenta.minus(inicial);
  const aplicaciones: {
    id: number;
    cobroId: number;
    cuentaId: number | null;
    monto: Prisma.Decimal;
  }[] = pagado.isZero()
    ? []
    : [
        { id: 60, cobroId: 70, cuentaId: null, monto: inicial },
        { id: 62, cobroId: 72, cuentaId: 50, monto: pagado.minus(inicial) },
      ];
  const reversadas = new Set<number>();
  const anteriores: {
    cantidad: number;
    descuento: Prisma.Decimal;
    impuesto: Prisma.Decimal;
  }[] = [];
  const tx = {
    venta: {
      findUnique: jest.fn(() => Promise.resolve(venta)),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(venta)),
    },
    cuentaPorCobrar: {
      findUnique: jest.fn(() => Promise.resolve(cuenta)),
      update: jest.fn(({ data }: { data: object }) => {
        Object.assign(cuenta, data);
        return Promise.resolve(cuenta);
      }),
    },
    asignacionLoteVenta: {
      findMany: jest.fn(() => Promise.resolve([asignacion])),
    },
    detalleDevolucionVenta: {
      groupBy: jest.fn(({ by }: { by: string[] }) => {
        const cantidad = anteriores.reduce((s, p) => s + p.cantidad, 0);
        return Promise.resolve(
          by[0] === 'asignacionVentaId'
            ? [{ asignacionVentaId: 42, _sum: { cantidad } }]
            : [
                {
                  detalleVentaId: 20,
                  _sum: {
                    cantidad,
                    descuento: anteriores.reduce(
                      (s, p) => s.plus(p.descuento),
                      decimal('0'),
                    ),
                    impuesto: anteriores.reduce(
                      (s, p) => s.plus(p.impuesto),
                      decimal('0'),
                    ),
                  },
                },
              ],
        );
      }),
      create: jest.fn(({ data }: { data: (typeof anteriores)[number] }) => {
        anteriores.push(data);
        return Promise.resolve({ ...data, id: anteriores.length });
      }),
    },
    aplicacionCobro: {
      findMany: jest.fn(() =>
        Promise.resolve(aplicaciones.filter(({ id }) => !reversadas.has(id))),
      ),
      create: jest.fn(
        ({ data }: { data: Omit<(typeof aplicaciones)[number], 'id'> }) => {
          const nueva = { ...data, id: 100 + aplicaciones.length };
          aplicaciones.push(nueva);
          return Promise.resolve(nueva);
        },
      ),
    },
    devolucionVenta: {
      create: jest.fn(({ data }: { data: object }) =>
        Promise.resolve({ ...data, id: anteriores.length + 1 }),
      ),
    },
    ajusteCuentaPorCobrar: { create: jest.fn(() => Promise.resolve({})) },
  };
  const prisma = doble<PrismaService>({
    $transaction: (leer: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      leer(doble<Prisma.TransactionClient>(tx)),
  });
  const idempotencia = doble<IdempotenciaService>({
    ejecutar: (
      _datos: unknown,
      escribir: (
        tx: Prisma.TransactionClient,
        clave: string,
      ) => Promise<unknown>,
    ) => escribir(doble<Prisma.TransactionClient>(tx), 'clave-ensayo'),
  });
  const reembolsar = jest.fn();
  const correcciones = doble<CorreccionesCobroService>({
    revertirAplicacion: (_tx: unknown, _contexto: unknown, id: number) => {
      const aplicacion = aplicaciones.find(
        (a) => a.id === id && !reversadas.has(id),
      );
      if (!aplicacion) throw new ConflictException();
      reversadas.add(id);
      return Promise.resolve({ aplicacion });
    },
    confirmarReembolso: reembolsar,
  });
  const calculo = new CalculoDevolucionesService();
  const operaciones = new DevolucionesOperacionService(
    idempotencia,
    doble<CajaService>({}),
    doble<CobrosOperacionService>({ bloquearCobro: jest.fn() }),
    correcciones,
    doble<CuentasService>({ bloquear: () => Promise.resolve({ ...cuenta }) }),
    doble<InventarioLotesService>({
      bloquearVentaParaDevolucion: jest.fn(),
      aplicarDevolucion: jest.fn(),
    }),
    doble<AnulacionComprobanteService>({}),
    prisma,
    calculo,
  );
  const consultas = new DevolucionesService(prisma, calculo);
  const contexto = {
    tenantId: 4,
    usuarioId: 1,
    membresiaId: 2,
    auditar: jest.fn().mockResolvedValue(undefined),
  };
  const confirmar = (liberar: { aplicacionId: number; monto: string }[] = []) =>
    operaciones.devolver(
      contexto,
      { ventaId: 15, motivo: 'Ensayo', lineas, liberar },
      'clave',
      'correlacion',
    );
  return {
    consultas,
    confirmar,
    tx,
    anteriores,
    cuenta,
    reembolsar,
    reversadas,
    aplicaciones,
    lineas,
  };
}

describe('Devoluciones · vista previa y confirmación con el mismo cálculo', () => {
  it.each([
    { precio: '30.00', saldo: '40.00', reduccion: '30.00', liberacion: '0.00' },
    {
      precio: '70.00',
      saldo: '40.00',
      reduccion: '40.00',
      liberacion: '30.00',
    },
    {
      precio: '10.00',
      saldo: '31.00',
      descuento: '1.00',
      impuesto: '2.00',
      reduccion: '10.33',
      liberacion: '0.00',
    },
  ])(
    'confirma exactamente la vista previa ($precio, deuda $saldo)',
    async (caso) => {
      const e = escenario(
        caso.precio,
        caso.saldo,
        caso.descuento,
        caso.impuesto,
      );
      const previa = await e.consultas.vistaPrevia(4, 15, e.lineas);
      expect(previa.reduccionSaldoSugerida).toBe(caso.reduccion);
      expect(previa.importeALiberar).toBe(caso.liberacion);
      expect(e.tx.devolucionVenta.create).not.toHaveBeenCalled();
      expect(e.tx.detalleDevolucionVenta.create).not.toHaveBeenCalled();
      expect(e.tx.aplicacionCobro.create).not.toHaveBeenCalled();
      expect(e.tx.cuentaPorCobrar.update).not.toHaveBeenCalled();
      expect(e.tx.ajusteCuentaPorCobrar.create).not.toHaveBeenCalled();
      expect(e.reversadas.size).toBe(0);
      await expect(e.confirmar(previa.liberarSugerido)).resolves.toEqual({
        recursoTipo: 'DevolucionVenta',
        recursoId: 1,
      });
      for (const campo of [
        'subtotal',
        'descuento',
        'impuesto',
        'total',
      ] as const) {
        expect(e.tx.devolucionVenta.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            [campo]: decimal(previa[campo]),
          }) as unknown,
        });
      }
      expect(e.cuenta.saldo.toFixed(2)).toBe(
        decimal(caso.saldo).minus(caso.reduccion).toFixed(2),
      );
      expect(e.reembolsar).not.toHaveBeenCalled();
    },
  );

  it('recalcula los céntimos restantes antes de guardar y rechaza unidades agotadas', async () => {
    const e = escenario('10.00', '31.00', '1.00', '2.00');
    const primera = await e.consultas.vistaPrevia(4, 15, e.lineas);
    expect(primera.total).toBe('10.33');
    await e.confirmar();
    // Reutilizar las mismas líneas no reutiliza el cálculo de la primera vista.
    await e.confirmar();
    expect(e.tx.devolucionVenta.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ total: decimal('10.34') }) as unknown,
    });
    const ultima = await e.consultas.vistaPrevia(4, 15, e.lineas);
    expect(ultima.total).toBe('10.33');
    await e.confirmar();
    expect(e.cuenta.saldo.toFixed(2)).toBe('0.00');
    await expect(
      e.consultas.vistaPrevia(4, 15, e.lineas),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(e.confirmar()).rejects.toBeInstanceOf(ConflictException);
    expect(e.tx.devolucionVenta.create).toHaveBeenCalledTimes(3);
  });

  it('revalida aplicaciones y saldo que cambiaron después de consultar', async () => {
    const e = escenario('70.00', '40.00');
    const previa = await e.consultas.vistaPrevia(4, 15, e.lineas);
    e.reversadas.add(previa.liberarSugerido[0].aplicacionId);
    await expect(e.confirmar(previa.liberarSugerido)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(e.tx.devolucionVenta.create).not.toHaveBeenCalled();
    e.reversadas.clear();
    e.cuenta.saldo = decimal('10.00');
    await expect(e.confirmar(previa.liberarSugerido)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(e.tx.devolucionVenta.create).not.toHaveBeenCalled();
  });
});
