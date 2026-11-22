import { Prisma } from '@prisma/client';
import { factorCantidad } from '@app/inventario';
import type { UnidadVenta } from '@prisma/client';
import { importeTienda } from './operacion-tienda';

export function tarifaIvaVigente(
  tx: Prisma.TransactionClient,
  tenantId: number,
  fecha: Date,
) {
  return tx.tarifaIvaTienda.findFirst({
    where: { tenantId, vigenteDesde: { lte: fecha } },
    orderBy: { vigenteDesde: 'desc' },
  });
}

export function desglosarIva(
  precioFinal: Prisma.Decimal,
  cantidad: number,
  tasaImpuesto: Prisma.Decimal,
  unidadVenta?: UnidadVenta,
) {
  const total = importeTienda(
    precioFinal
      .times(cantidad)
      .div(factorCantidad(unidadVenta))
      .toDecimalPlaces(
        2,
        unidadVenta === 'LIBRA'
          ? Prisma.Decimal.ROUND_HALF_UP
          : Prisma.Decimal.ROUND_DOWN,
      ),
    true,
  );
  const subtotal = total
    .times(100)
    .div(tasaImpuesto.plus(100))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { tasaImpuesto, subtotal, impuesto: total.minus(subtotal), total };
}

export function totalesConIva(
  lineas: readonly ReturnType<typeof desglosarIva>[],
) {
  const sumar = (campo: 'subtotal' | 'impuesto' | 'total') =>
    importeTienda(
      lineas.reduce(
        (suma, linea) => suma.plus(linea[campo]),
        new Prisma.Decimal(0),
      ),
      true,
    );
  return {
    subtotal: sumar('subtotal'),
    impuesto: sumar('impuesto'),
    total: sumar('total'),
  };
}
