import { PrismaService } from '@app/prisma';
import { Injectable, NotFoundException } from '@nestjs/common';
import { EstadoVenta, Prisma } from '@prisma/client';
import { periodoComercial } from '../comun/fecha-comercial';
import { paginacion } from '../comun/operacion-tienda';

interface FiltrosVenta {
  desde: string;
  hasta: string;
  categoriaId?: number;
  productoId?: number;
  cajeroId?: number;
}

@Injectable()
export class ConsultaVentasService {
  constructor(private readonly prisma: PrismaService) {}

  listar(
    tenantId: number,
    filtros: FiltrosVenta & {
      estado?: EstadoVenta;
      pagina?: number;
      limite?: number;
    },
  ) {
    const { desde, hasta } = periodoComercial(filtros);
    const { categoriaId, productoId, cajeroId } = filtros;
    return this.prisma.venta.findMany({
      omit: { claveIdempotencia: true },
      where: {
        tenantId,
        estado: filtros.estado,
        responsableId: cajeroId,
        fecha: { gte: desde, lt: hasta },
        detalleVenta_venta:
          categoriaId !== undefined || productoId !== undefined
            ? { some: { categoriaId, productoId } }
            : undefined,
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      ...paginacion(filtros.pagina, filtros.limite),
    });
  }

  async obtener(tenantId: number, ventaId: number) {
    const venta = await this.prisma.venta.findUnique({
      where: { tenantId_id: { tenantId, id: ventaId } },
      omit: { claveIdempotencia: true },
      include: {
        detalleVenta_venta: {
          orderBy: { id: 'asc' },
          include: {
            asignacionLoteVenta_detalleVenta: {
              select: { loteId: true, cantidad: true },
              orderBy: { id: 'asc' },
            },
          },
        },
        devolucionVenta_venta: {
          select: {
            id: true,
            estado: true,
            fecha: true,
            aprobadaAt: true,
            total: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');
    return venta;
  }

  async analizar(
    tenantId: number,
    filtros: FiltrosVenta,
    granularidad: 'week' | 'month',
  ) {
    const { desde, hasta } = periodoComercial(filtros);
    const { categoriaId, productoId, cajeroId } = filtros;
    const lineas = Prisma.sql`
      SELECT v.id "ventaId", v."responsableId", v.fecha, d."productoId",
        d.cantidad - COALESCE(r.cantidad, 0) unidades, d.total - COALESCE(r.total, 0) neto
      FROM "Venta" v
      JOIN "DetalleVenta" d ON d."tenantId" = v."tenantId" AND d."ventaId" = v.id
      LEFT JOIN LATERAL (
        SELECT SUM(x.total) total, SUM(x.cantidad) cantidad
        FROM "DetalleDevolucionVenta" x
        JOIN "DevolucionVenta" h ON h."tenantId" = x."tenantId" AND h.id = x."devolucionId"
        WHERE x."tenantId" = d."tenantId" AND x."detalleVentaId" = d.id
          AND h.estado = 'APROBADA' AND h."aprobadaAt" < ${hasta}
      ) r ON true
      WHERE v."tenantId" = ${tenantId} AND v.estado = 'COMPLETADA'
        AND v.fecha >= ${desde} AND v.fecha < ${hasta}
        ${categoriaId === undefined ? Prisma.empty : Prisma.sql`AND d."categoriaId" = ${categoriaId}`}
        ${productoId === undefined ? Prisma.empty : Prisma.sql`AND d."productoId" = ${productoId}`}
        ${cajeroId === undefined ? Prisma.empty : Prisma.sql`AND v."responsableId" = ${cajeroId}`}
    `;
    const [series, productos, cajeros] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<
          { periodo: string; neto: Prisma.Decimal; ventas: number }[]
        >`
        WITH lineas AS (${lineas}), periodos AS (
          SELECT generate_series(
            date_trunc(${granularidad}, ${desde}::timestamptz AT TIME ZONE 'America/Guayaquil'),
            date_trunc(${granularidad}, (${hasta}::timestamptz - interval '1 microsecond') AT TIME ZONE 'America/Guayaquil'),
            CASE WHEN ${granularidad} = 'week' THEN interval '1 week' ELSE interval '1 month' END
          ) inicio
        )
        SELECT to_char(p.inicio, 'YYYY-MM-DD') periodo, COALESCE(SUM(l.neto), 0) neto,
          COUNT(DISTINCT l."ventaId")::int ventas
        FROM periodos p LEFT JOIN lineas l
          ON date_trunc(${granularidad}, l.fecha AT TIME ZONE 'America/Guayaquil') = p.inicio
        GROUP BY p.inicio ORDER BY p.inicio
      `,
        this.prisma.$queryRaw<
          { productoId: number; neto: Prisma.Decimal; unidades: number }[]
        >`
        WITH lineas AS (${lineas})
        SELECT "productoId", SUM(neto) neto, SUM(unidades)::float8 unidades
        FROM lineas GROUP BY "productoId" ORDER BY unidades DESC, "productoId" LIMIT 25
      `,
        this.prisma.$queryRaw<
          { responsableId: number; neto: Prisma.Decimal; ventas: number }[]
        >`
        WITH lineas AS (${lineas})
        SELECT "responsableId", SUM(neto) neto, COUNT(DISTINCT "ventaId")::int ventas
        FROM lineas GROUP BY "responsableId" ORDER BY neto DESC, "responsableId" LIMIT 100
      `,
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const neto = series.reduce(
      (suma, fila) => suma.plus(fila.neto),
      new Prisma.Decimal(0),
    );
    const ventas = series.reduce((suma, fila) => suma + fila.ventas, 0);
    return {
      series,
      productos,
      cajeros,
      neto,
      ventas,
      ticketPromedio: ventas
        ? neto.div(ventas).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
        : new Prisma.Decimal(0),
    };
  }
}
