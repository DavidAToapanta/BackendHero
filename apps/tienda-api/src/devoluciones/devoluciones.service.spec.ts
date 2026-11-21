import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Venta } from '@prisma/client';
import {
  CalculoDevolucionesService,
  type LineaDevuelta,
} from './calculo-devoluciones.service';
import { DevolucionesService } from './devoluciones.service';

const decimal = (monto: string) => new Prisma.Decimal(monto);
const linea = (cantidad = 1, asignacionVentaId = 42): LineaDevuelta => ({
  asignacionVentaId,
  cantidad,
  destino: 'REINTEGRO_APTO',
});

function escenario() {
  const venta = { id: 15, tenantId: 4, estado: 'COMPLETADA' } as Venta;
  const detalle = {
    id: 20,
    cantidad: 3,
    precioUnitario: decimal('70.00'),
    descuento: decimal('0'),
    impuesto: decimal('0'),
  };
  const asignaciones = [
    {
      id: 42,
      cantidad: 3,
      productoId: 7,
      loteId: 8,
      costoUnitario: decimal('1.0000'),
      detalleVenta: detalle,
    },
  ];
  const previas: {
    asignacionVentaId: number;
    cantidad: number;
    descuento: Prisma.Decimal;
    impuesto: Prisma.Decimal;
  }[] = [];
  const aplicaciones = [
    { id: 60, monto: decimal('20.00') },
    { id: 62, monto: decimal('50.00') },
  ];
  let saldo: Prisma.Decimal | null = decimal('40.00');
  const tx = {
    venta: {
      findUnique: jest.fn(({ where }: Prisma.VentaFindUniqueArgs) =>
        Promise.resolve(
          where.tenantId_id?.tenantId === venta.tenantId &&
            where.tenantId_id.id === venta.id
            ? venta
            : null,
        ),
      ),
    },
    asignacionLoteVenta: {
      findMany: jest.fn(({ where }: Prisma.AsignacionLoteVentaFindManyArgs) =>
        Promise.resolve(
          where?.tenantId === venta.tenantId && where.ventaId === venta.id
            ? asignaciones
            : [],
        ),
      ),
    },
    detalleDevolucionVenta: {
      groupBy: jest.fn(({ by }: { by: string[] }) =>
        Promise.resolve(
          by[0] === 'asignacionVentaId'
            ? previas.map((anterior) => ({
                asignacionVentaId: anterior.asignacionVentaId,
                _sum: { cantidad: anterior.cantidad },
              }))
            : previas.length
              ? [
                  {
                    detalleVentaId: detalle.id,
                    _sum: {
                      cantidad: previas.reduce((s, p) => s + p.cantidad, 0),
                      descuento: previas.reduce(
                        (s, p) => s.plus(p.descuento),
                        decimal('0'),
                      ),
                      impuesto: previas.reduce(
                        (s, p) => s.plus(p.impuesto),
                        decimal('0'),
                      ),
                    },
                  },
                ]
              : [],
        ),
      ),
    },
    cuentaPorCobrar: {
      findUnique: jest.fn(() =>
        Promise.resolve(saldo === null ? null : { saldo }),
      ),
    },
    aplicacionCobro: { findMany: jest.fn(() => Promise.resolve(aplicaciones)) },
  };
  // Solo se exponen consultas. Cualquier acceso a una escritura o SQL crudo falla.
  const soloLectura = (objeto: object): object =>
    new Proxy(objeto, {
      get(target, propiedad) {
        if (!(propiedad in target))
          throw new Error(`Operación no permitida: ${String(propiedad)}`);
        const valor: unknown = Reflect.get(target, propiedad);
        return valor && typeof valor === 'object' ? soloLectura(valor) : valor;
      },
    });
  const transaction = jest.fn(
    (leer: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      leer(soloLectura(tx) as Prisma.TransactionClient),
  );
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  return {
    service: new DevolucionesService(prisma, new CalculoDevolucionesService()),
    tx,
    transaction,
    venta,
    detalle,
    asignaciones,
    previas,
    aplicaciones,
    saldo: (valor: string | null) => {
      saldo = valor === null ? null : decimal(valor);
    },
  };
}

describe('Vista previa de devoluciones', () => {
  it('reduce solo deuda y usa una instantánea de lectura', async () => {
    const e = escenario();
    e.detalle.precioUnitario = decimal('30.00');
    await expect(e.service.vistaPrevia(4, 15, [linea()])).resolves.toEqual({
      ventaId: 15,
      subtotal: '30.00',
      descuento: '0.00',
      impuesto: '0.00',
      total: '30.00',
      saldoPendiente: '40.00',
      reduccionSaldoSugerida: '30.00',
      importeALiberar: '0.00',
      liberarSugerido: [],
    });
    expect(e.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });

  it('combina deuda y liberación sin exceder ninguna aplicación, de la más antigua a la más reciente', async () => {
    const e = escenario();
    const antes = JSON.stringify({
      venta: e.venta,
      detalle: e.detalle,
      aplicaciones: e.aplicaciones,
      previas: e.previas,
    });
    await expect(
      e.service.vistaPrevia(4, 15, [linea()]),
    ).resolves.toMatchObject({
      total: '70.00',
      saldoPendiente: '40.00',
      reduccionSaldoSugerida: '40.00',
      importeALiberar: '30.00',
      liberarSugerido: [
        { aplicacionId: 60, monto: '20.00' },
        { aplicacionId: 62, monto: '10.00' },
      ],
    });
    expect(
      JSON.stringify({
        venta: e.venta,
        detalle: e.detalle,
        aplicaciones: e.aplicaciones,
        previas: e.previas,
      }),
    ).toBe(antes);
    expect(e.tx.aplicacionCobro.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 4,
        ventaId: 15,
        reversionAplicacionCobro_aplicacion: { none: {} },
        cobro: { estado: 'CONFIRMADO' },
      },
      orderBy: { id: 'asc' },
      select: { id: true, monto: true },
    });
  });

  it('sin cuenta pendiente sugiere liberar todo, sin registrar un reembolso', async () => {
    const e = escenario();
    e.saldo(null);
    await expect(
      e.service.vistaPrevia(4, 15, [linea()]),
    ).resolves.toMatchObject({
      saldoPendiente: '0.00',
      reduccionSaldoSugerida: '0.00',
      importeALiberar: '70.00',
      liberarSugerido: [
        { aplicacionId: 60, monto: '20.00' },
        { aplicacionId: 62, monto: '50.00' },
      ],
    });
  });

  it('prorratea importes históricos y conserva los céntimos en devoluciones sucesivas', async () => {
    const e = escenario();
    e.detalle.precioUnitario = decimal('10.00');
    e.detalle.descuento = decimal('1.00');
    e.detalle.impuesto = decimal('2.00');
    const resultados: string[] = [];
    for (const [descuento, impuesto, total] of [
      ['0.33', '0.66', '10.33'],
      ['0.33', '0.67', '10.34'],
      ['0.34', '0.67', '10.33'],
    ]) {
      const vista = await e.service.vistaPrevia(4, 15, [linea()]);
      expect(vista).toMatchObject({
        subtotal: '10.00',
        descuento,
        impuesto,
        total,
      });
      resultados.push(vista.total);
      e.previas.push({
        asignacionVentaId: 42,
        cantidad: 1,
        descuento: decimal(descuento),
        impuesto: decimal(impuesto),
      });
    }
    expect(
      resultados.reduce((s, p) => s.plus(p), decimal('0')).toFixed(2),
    ).toBe('31.00');
    await expect(
      e.service.vistaPrevia(4, 15, [linea()]),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('ordena asignaciones de un mismo detalle y acumula su prorrateo', async () => {
    const e = escenario();
    e.detalle.precioUnitario = decimal('10.00');
    e.detalle.descuento = decimal('1.00');
    e.detalle.impuesto = decimal('2.00');
    e.asignaciones[0].cantidad = 1;
    e.asignaciones.push({ ...e.asignaciones[0], id: 43, cantidad: 2 });
    await expect(
      e.service.vistaPrevia(4, 15, [linea(1, 43), linea()]),
    ).resolves.toMatchObject({
      subtotal: '20.00',
      descuento: '0.66',
      impuesto: '1.33',
      total: '20.67',
    });
  });

  it('rechaza cantidades ya devueltas y consulta solo devoluciones aprobadas de la tienda', async () => {
    const e = escenario();
    e.previas.push({
      asignacionVentaId: 42,
      cantidad: 2,
      descuento: decimal('0'),
      impuesto: decimal('0'),
    });
    await expect(
      e.service.vistaPrevia(4, 15, [linea(2)]),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(e.tx.detalleDevolucionVenta.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 4, ventaId: 15, devolucion: { estado: 'APROBADA' } },
      }),
    );
  });

  it('rechaza asignaciones ausentes, de otra tienda o de otra venta', async () => {
    const e = escenario();
    e.asignaciones.length = 0;
    await expect(
      e.service.vistaPrevia(4, 15, [linea()]),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(e.tx.asignacionLoteVenta.findMany).toHaveBeenCalledWith({
      where: { tenantId: 4, ventaId: 15, id: { in: [42] } },
      include: { detalleVenta: true },
    });
  });

  it('oculta ventas ajenas y rechaza ventas anuladas', async () => {
    const e = escenario();
    await expect(
      e.service.vistaPrevia(5, 15, [linea()]),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(e.tx.asignacionLoteVenta.findMany).not.toHaveBeenCalled();
    e.venta.estado = 'ANULADA';
    await expect(
      e.service.vistaPrevia(4, 15, [linea()]),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza un reparto que no se puede cubrir con aplicaciones vigentes', async () => {
    const e = escenario();
    e.aplicaciones.length = 0;
    await expect(
      e.service.vistaPrevia(4, 15, [linea()]),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(
    [
      [],
      [linea(0)],
      [linea(1.5)],
      [linea(), linea()],
      Array.from({ length: 101 }, (_, i) => linea(1, i + 1)),
    ].map((lineas) => ({ lineas })),
  )('rechaza líneas inválidas antes de consultar (%#)', ({ lineas }) => {
    const e = escenario();
    expect(() => e.service.vistaPrevia(4, 15, lineas)).toThrow(
      BadRequestException,
    );
    expect(e.transaction).not.toHaveBeenCalled();
  });
});
