import { InventarioLotesService } from '@app/inventario';
import { PrismaService } from '@app/prisma';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { periodoComercial } from '../comun/fecha-comercial';

@Injectable()
export class ConsultaFinanzasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioLotesService,
  ) {}

  consultar(tenantId: number, periodo: { desde: string; hasta: string }) {
    const { desde, hasta } = periodoComercial(periodo);
    const fecha = { gte: desde, lt: hasta };
    const venta = { tenantId, fecha };
    const devolucion = {
      tenantId,
      estado: 'APROBADA' as const,
      aprobadaAt: fecha,
    };
    return this.prisma.$transaction(
      async (tx) => {
        const ventas = await tx.venta.aggregate({
          where: venta,
          _sum: { total: true },
        });
        const devoluciones = await tx.devolucionVenta.aggregate({
          where: devolucion,
          _sum: { total: true },
        });
        const costos = await tx.asignacionLoteVenta.aggregate({
          where: { tenantId, detalleVenta: { venta } },
          _sum: { costoTotal: true },
        });
        const costosDevueltos = await tx.detalleDevolucionVenta.aggregate({
          where: { tenantId, devolucion },
          _sum: { costoTotal: true },
        });
        const cobros = await tx.cobro.aggregate({
          where: { tenantId, estado: 'CONFIRMADO', fecha },
          _sum: { monto: true },
        });
        const reembolsos = await tx.reembolso.aggregate({
          where: { tenantId, estado: 'CONFIRMADO', confirmadoAt: fecha },
          _sum: { monto: true },
        });
        const gastos = await tx.gastoComercial.aggregate({
          where: { tenantId, fecha },
          _sum: { monto: true },
        });
        const bajas = await this.inventario.consultarTotalPerdidas(
          tx,
          tenantId,
          desde,
          hasta,
        );
        // Cada anulación compensa solo el remanente tras las devoluciones ya reconocidas.
        const [anulaciones] = await tx.$queryRaw<
          { venta: Prisma.Decimal; costo: Prisma.Decimal }[]
        >`
        SELECT COALESCE(SUM(v.total - COALESCE(r.total, 0)), 0) venta,
          COALESCE(SUM(COALESCE(a.costo, 0) - COALESCE(r.costo, 0)), 0) costo
        FROM "Venta" v
        LEFT JOIN LATERAL (
          SELECT SUM(x."costoTotal") costo
          FROM "AsignacionLoteVenta" x
          WHERE x."tenantId" = v."tenantId" AND x."ventaId" = v.id
        ) a ON true
        LEFT JOIN LATERAL (
          SELECT SUM(d.total) total, SUM(d."costoTotal") costo
          FROM "DetalleDevolucionVenta" d JOIN "DevolucionVenta" h
            ON h."tenantId" = d."tenantId" AND h.id = d."devolucionId"
          WHERE d."tenantId" = v."tenantId" AND d."ventaId" = v.id
            AND h.estado = 'APROBADA'
        ) r ON true
        WHERE v."tenantId" = ${tenantId} AND v.estado = 'ANULADA'
          AND v."anuladaAt" >= ${desde} AND v."anuladaAt" < ${hasta}
      `;
        const cero = new Prisma.Decimal(0);
        const ventasNetas = (ventas._sum.total ?? cero)
          .minus(devoluciones._sum.total ?? cero)
          .minus(anulaciones.venta);
        const costoNetoVendido = (costos._sum.costoTotal ?? cero)
          .minus(costosDevueltos._sum.costoTotal ?? cero)
          .minus(anulaciones.costo);
        const utilidadBruta = ventasNetas.minus(costoNetoVendido);
        const dineroRecibido = cobros._sum.monto ?? cero;
        const dineroDevuelto = reembolsos._sum.monto ?? cero;
        const gastosComerciales = gastos._sum.monto ?? cero;
        const perdidasInventario = new Prisma.Decimal(bajas.totalPerdidas).plus(
          anulaciones.costo,
        );
        return {
          ventasNetas,
          costoNetoVendido,
          utilidadBruta,
          dineroRecibido,
          dineroDevuelto,
          flujoCobros: dineroRecibido.minus(dineroDevuelto),
          gastosComerciales,
          perdidasInventario,
          resultadoOperativoEstimado: utilidadBruta
            .minus(gastosComerciales)
            .minus(perdidasInventario),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
