import { Prisma } from '@prisma/client';
import { desglosarIva, totalesConIva } from './iva-tienda';

describe('IVA incluido en Tienda', () => {
  it.each([
    [15, '43.48', '6.52'],
    [16, '43.10', '6.90'],
    [0, '50.00', '0.00'],
  ])('conserva el precio final con una tarifa del %d %%', (tasa, base, iva) => {
    const linea = desglosarIva(
      new Prisma.Decimal(50),
      1,
      new Prisma.Decimal(tasa),
    );
    expect(linea.subtotal.toFixed(2)).toBe(base);
    expect(linea.impuesto.toFixed(2)).toBe(iva);
    expect(linea.total.toFixed(2)).toBe('50.00');
  });

  it('concilia líneas de distintas tarifas con varias unidades', () => {
    const linea = (precio: string, cantidad: number, tasa: number) =>
      desglosarIva(
        new Prisma.Decimal(precio),
        cantidad,
        new Prisma.Decimal(tasa),
      );
    const totales = totalesConIva([linea('0.99', 3, 15), linea('2.30', 2, 0)]);
    expect(totales.subtotal.toFixed(2)).toBe('7.18');
    expect(totales.impuesto.toFixed(2)).toBe('0.39');
    expect(totales.total.toFixed(2)).toBe('7.57');
  });
});
