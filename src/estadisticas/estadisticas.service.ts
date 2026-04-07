import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class EstadisticasService {
  constructor(private prisma: PrismaService) {}

  private get ingresoRapidoRepo() {
    return (this.prisma as any).ingresoRapido;
  }

  async obtenerIngresos(periodo: 'dia' | 'mes' | 'anio', tenantId: number) {
    if (periodo === 'dia') {
      const [pagos, ingresosRapidos] = await Promise.all([
        this.prisma.pago.groupBy({
          by: ['fecha'],
          _sum: { monto: true },
          where: { tenantId },
          orderBy: { fecha: 'asc' },
        }),
        this.ingresoRapidoRepo.groupBy({
          by: ['fecha'],
          _sum: { monto: true },
          where: { tenantId },
          orderBy: { fecha: 'asc' },
        }),
      ]);

      const totalsByDate = new Map<string, number>();

      for (const pago of pagos) {
        const label = pago.fecha.toISOString().slice(0, 10);
        totalsByDate.set(
          label,
          (totalsByDate.get(label) ?? 0) + (pago._sum.monto ?? 0),
        );
      }

      for (const ingreso of ingresosRapidos) {
        const label = ingreso.fecha.toISOString().slice(0, 10);
        totalsByDate.set(
          label,
          (totalsByDate.get(label) ?? 0) + (ingreso._sum.monto ?? 0),
        );
      }

      return [...totalsByDate.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, total]) => ({ label, total }));
    }

    if (periodo === 'mes') {
      const year = new Date().getFullYear();
      const [pagos, ingresosRapidos] = await Promise.all([
        this.prisma.$queryRaw<{ mes: number; total: number }[]>`
        SELECT EXTRACT(MONTH FROM fecha) AS mes, SUM(monto) AS total
        FROM "Pago"
        WHERE EXTRACT(YEAR FROM fecha) = ${year}
          AND "tenantId" = ${tenantId}
        GROUP BY mes
        ORDER BY mes;
      `,
        this.prisma.$queryRaw<{ mes: number; total: number }[]>`
        SELECT EXTRACT(MONTH FROM fecha) AS mes, SUM(monto) AS total
        FROM "IngresoRapido"
        WHERE EXTRACT(YEAR FROM fecha) = ${year}
          AND "tenantId" = ${tenantId}
        GROUP BY mes
        ORDER BY mes;
      `,
      ]);

      const totalsByMonth = new Map<number, number>();

      for (const pago of pagos) {
        totalsByMonth.set(
          pago.mes,
          (totalsByMonth.get(pago.mes) ?? 0) + Number(pago.total),
        );
      }

      for (const ingreso of ingresosRapidos) {
        totalsByMonth.set(
          ingreso.mes,
          (totalsByMonth.get(ingreso.mes) ?? 0) + Number(ingreso.total),
        );
      }

      return [...totalsByMonth.entries()]
        .sort(([left], [right]) => left - right)
        .map(([mes, total]) => ({
          label: new Date(0, mes - 1).toLocaleString('es', { month: 'short' }),
          total,
        }));
    }

    if (periodo === 'anio') {
      const [pagos, ingresosRapidos] = await Promise.all([
        this.prisma.$queryRaw<{ anio: number; total: number }[]>`
        SELECT EXTRACT(YEAR FROM fecha) AS anio, SUM(monto) AS total
        FROM "Pago"
        WHERE "tenantId" = ${tenantId}
        GROUP BY anio
        ORDER BY anio;
      `,
        this.prisma.$queryRaw<{ anio: number; total: number }[]>`
        SELECT EXTRACT(YEAR FROM fecha) AS anio, SUM(monto) AS total
        FROM "IngresoRapido"
        WHERE "tenantId" = ${tenantId}
        GROUP BY anio
        ORDER BY anio;
      `,
      ]);

      const totalsByYear = new Map<number, number>();

      for (const pago of pagos) {
        totalsByYear.set(
          pago.anio,
          (totalsByYear.get(pago.anio) ?? 0) + Number(pago.total),
        );
      }

      for (const ingreso of ingresosRapidos) {
        totalsByYear.set(
          ingreso.anio,
          (totalsByYear.get(ingreso.anio) ?? 0) + Number(ingreso.total),
        );
      }

      return [...totalsByYear.entries()]
        .sort(([left], [right]) => left - right)
        .map(([anio, total]) => ({
          label: String(anio),
          total,
        }));
    }

    return [];
  }
}
