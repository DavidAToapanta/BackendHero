import { Injectable } from '@nestjs/common';
import { addDays } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async getCurrentNotifications(tenantId: number) {
    const hoy = new Date();

    const [pagosVencidos, proximasMembresias, productosBajos] = await Promise.all([
      this.prisma.deuda.count({
        where: {
          tenantId,
          solventada: false,
        },
      }),
      this.prisma.clientePlan.count({
        where: {
          tenantId,
          activado: true,
          estado: 'ACTIVO',
          fechaFin: {
            gte: hoy,
            lte: addDays(hoy, 7),
          },
        },
      }),
      this.prisma.producto.count({
        where: {
          tenantId,
          estado: true,
          stock: {
            lte: 5,
          },
        },
      }),
    ]);

    return [
      {
        icon: 'alert-triangle',
        title: `${pagosVencidos} pagos vencidos`,
        message: 'Requieren seguimiento inmediato',
        color: 'bg-red-50 border-red-200 text-red-700',
      },
      {
        icon: 'clock',
        title: `${proximasMembresias} membresias expiran pronto`,
        message: 'En los proximos 7 dias',
        color: 'bg-yellow-50 border-yellow-200 text-yellow-700',
      },
      {
        icon: 'info',
        title: `${productosBajos} productos con stock bajo`,
        message: 'Verificar inventario',
        color: 'bg-blue-50 border-blue-200 text-blue-700',
      },
    ];
  }
}
