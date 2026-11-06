import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class EstadisticasService {
  constructor(private prisma: PrismaService) {}

  private obtenerRangoDiaEcuador(fechaActual = new Date()) {
    const desplazamientoEcuador = 5 * 60 * 60 * 1000;
    const fechaEcuador = new Date(
      fechaActual.getTime() - desplazamientoEcuador,
    );
  
    const anio = fechaEcuador.getUTCFullYear();
    const mes = fechaEcuador.getUTCMonth();
    const dia = fechaEcuador.getUTCDate();
  
    // Ecuador está en UTC-5: las 00:00 locales corresponden a las 05:00 UTC.
    const inicioDia = new Date(Date.UTC(anio, mes, dia, 5, 0, 0, 0));
    const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);
  
    const etiquetaDia = [
      anio,
      String(mes + 1).padStart(2, '0'),
      String(dia).padStart(2, '0'),
    ].join('-');
  
    return { inicioDia, finDia, etiquetaDia };
  }

  private get ingresoRapidoRepo() {
    return (this.prisma as any).ingresoRapido;
  }

  async obtenerIngresos(periodo: 'dia' | 'mes' | 'anio', tenantId: number) {
    if (periodo === 'dia') {
      const { inicioDia, finDia, etiquetaDia } =
        this.obtenerRangoDiaEcuador();
    
      const [pagos, ingresosRapidos] = await Promise.all([
        this.prisma.pago.groupBy({
          by: ['fecha'],
          _sum: { monto: true },
          where: {
            tenantId,
            fecha: {
              gte: inicioDia,
              lt: finDia,
            },
          },
          orderBy: { fecha: 'asc' },
        }),
        this.ingresoRapidoRepo.groupBy({
          by: ['fecha'],
          _sum: { monto: true },
          where: {
            tenantId,
            fecha: {
              gte: inicioDia,
              lt: finDia,
            },
          },
          orderBy: { fecha: 'asc' },
        }),
      ]);
    
      const totalPagos = pagos.reduce(
        (total, pago) => total + Number(pago._sum.monto ?? 0),
        0,
      );
    
      const totalIngresosRapidos = ingresosRapidos.reduce(
        (total, ingreso) => total + Number(ingreso._sum.monto ?? 0),
        0,
      );
    
      const total = totalPagos + totalIngresosRapidos;
    
      // Si hoy no existen ingresos, el controlador devolverá data: [].
      // El frontend ya convierte ese resultado en 0 con su reduce.
      if (total === 0) {
        return [];
      }
    
      return [
        {
          label: etiquetaDia,
          total,
        },
      ];
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
