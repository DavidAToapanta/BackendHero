import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DestinoDevolucionVenta, Prisma, type Venta } from '@prisma/client';

export interface LineaDevuelta {
  asignacionVentaId: number;
  cantidad: number;
  destino: DestinoDevolucionVenta;
}

@Injectable()
export class CalculoDevolucionesService {
  ordenarLineas(lineas: LineaDevuelta[], admiteVacias = true) {
    if (
      (!admiteVacias && (!lineas.length || lineas.length > 100)) ||
      lineas.some(
        ({ cantidad }) => !Number.isInteger(cantidad) || cantidad <= 0,
      ) ||
      new Set(lineas.map(({ asignacionVentaId }) => asignacionVentaId)).size !==
        lineas.length
    ) {
      throw new BadRequestException('Líneas de la corrección inválidas');
    }
    return [...lineas].sort(
      (a, b) => a.asignacionVentaId - b.asignacionVentaId,
    );
  }

  async calcular(
    tx: Prisma.TransactionClient,
    venta: Venta,
    lineas: LineaDevuelta[],
  ) {
    const detalles = await this.prepararLineas(tx, venta, lineas);
    const sumar = (campo: 'subtotal' | 'descuento' | 'impuesto' | 'total') =>
      detalles.reduce(
        (suma, detalle) => suma.plus(detalle[campo]),
        new Prisma.Decimal(0),
      );
    return {
      detalles,
      subtotal: sumar('subtotal'),
      descuento: sumar('descuento'),
      impuesto: sumar('impuesto'),
      total: sumar('total'),
    };
  }

  private async prepararLineas(
    tx: Prisma.TransactionClient,
    venta: Venta,
    seleccion: LineaDevuelta[],
  ) {
    const lineas = this.ordenarLineas(seleccion);
    if (!lineas.length) return [];
    const { id: ventaId, tenantId } = venta;
    const asignaciones = await tx.asignacionLoteVenta.findMany({
      where: {
        tenantId,
        ventaId,
        id: { in: lineas.map(({ asignacionVentaId }) => asignacionVentaId) },
      },
      include: { detalleVenta: true },
    });
    const porId = new Map(asignaciones.map((fila) => [fila.id, fila]));
    const criterio = {
      tenantId,
      ventaId,
      devolucion: { estado: 'APROBADA' as const },
    };
    const anterioresPorAsignacion = await tx.detalleDevolucionVenta.groupBy({
      by: ['asignacionVentaId'],
      where: criterio,
      _sum: { cantidad: true },
    });
    const anterioresPorDetalle = await tx.detalleDevolucionVenta.groupBy({
      by: ['detalleVentaId'],
      where: criterio,
      _sum: { cantidad: true, descuento: true, impuesto: true },
    });
    const cantidadesPorAsignacion = new Map(
      anterioresPorAsignacion.map((fila) => [
        fila.asignacionVentaId,
        fila._sum.cantidad ?? 0,
      ]),
    );
    const acumulados = new Map(
      anterioresPorDetalle.map(({ detalleVentaId, _sum }) => [
        detalleVentaId,
        {
          cantidad: _sum.cantidad ?? 0,
          descuento: _sum.descuento ?? new Prisma.Decimal(0),
          impuesto: _sum.impuesto ?? new Prisma.Decimal(0),
        },
      ]),
    );
    return lineas.map((linea) => {
      const asignacion = porId.get(linea.asignacionVentaId);
      if (
        !asignacion ||
        (cantidadesPorAsignacion.get(asignacion.id) ?? 0) + linea.cantidad >
          asignacion.cantidad
      ) {
        throw new ConflictException(
          'La cantidad excede las unidades de la asignación disponibles para devolución',
        );
      }
      const detalle = asignacion.detalleVenta;
      const anterior = acumulados.get(detalle.id) ?? {
        cantidad: 0,
        descuento: new Prisma.Decimal(0),
        impuesto: new Prisma.Decimal(0),
      };
      const restantes = detalle.cantidad - anterior.cantidad;
      if (linea.cantidad > restantes)
        throw new ConflictException('La cantidad supera el detalle de venta');
      const prorratear = (original: Prisma.Decimal, devuelto: Prisma.Decimal) =>
        original
          .minus(devuelto)
          .times(linea.cantidad)
          .div(restantes)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const subtotal = detalle.precioUnitario.times(linea.cantidad);
      const descuento = prorratear(detalle.descuento, anterior.descuento);
      const impuesto = prorratear(detalle.impuesto, anterior.impuesto);
      if (descuento.gt(subtotal) || descuento.lt(0) || impuesto.lt(0))
        throw new ConflictException(
          'Los importes históricos de devolución no concilian',
        );
      acumulados.set(detalle.id, {
        cantidad: anterior.cantidad + linea.cantidad,
        descuento: anterior.descuento.plus(descuento),
        impuesto: anterior.impuesto.plus(impuesto),
      });
      return {
        ...linea,
        ventaId,
        detalleVentaId: detalle.id,
        productoId: asignacion.productoId,
        loteId: asignacion.loteId,
        costoUnitario: asignacion.costoUnitario,
        costoTotal: asignacion.costoUnitario.times(linea.cantidad),
        subtotal,
        descuento,
        impuesto,
        total: subtotal.minus(descuento).plus(impuesto),
      };
    });
  }
}
