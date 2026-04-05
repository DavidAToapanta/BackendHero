import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class EstadisticasService {
  constructor(private prisma: PrismaService) {}

  async obtenerIngresos(
    periodo: 'dia' | 'mes' | 'anio',
    tenantId: number,
  ) {
    if (periodo === 'dia') {
      const pagos = await this.prisma.pago.groupBy({
        by: ['fecha'],
        _sum: { monto: true },
        where: { tenantId },
        orderBy: { fecha: 'asc' },
      });

      return pagos.map((p) => ({
        label: p.fecha.toISOString().slice(0, 10),
        total: p._sum.monto ?? 0,
      }));
    }

    if (periodo === 'mes') {
      const year = new Date().getFullYear();
      const pagos = await this.prisma.$queryRaw<
        { mes: number; total: number }[]
      >`
        SELECT EXTRACT(MONTH FROM fecha) AS mes, SUM(monto) AS total
        FROM "Pago"
        WHERE EXTRACT(YEAR FROM fecha) = ${year}
          AND "tenantId" = ${tenantId}
        GROUP BY mes
        ORDER BY mes;
      `;

      return pagos.map((p) => ({
        label: new Date(0, p.mes - 1).toLocaleString('es', { month: 'short' }),
        total: Number(p.total),
      }));
    }

    if (periodo === 'anio') {
      const pagos = await this.prisma.$queryRaw<
        { anio: number; total: number }[]
      >`
        SELECT EXTRACT(YEAR FROM fecha) AS anio, SUM(monto) AS total
        FROM "Pago"
        WHERE "tenantId" = ${tenantId}
        GROUP BY anio
        ORDER BY anio;
      `;

      return pagos.map((p) => ({
        label: String(p.anio),
        total: Number(p.total),
      }));
    }

    return [];
  }
}
