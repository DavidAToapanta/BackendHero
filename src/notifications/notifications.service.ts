import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addDays } from 'date-fns';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}
  async getCurrentNotifications() {
    const hoy = new Date();

    const pagosVencidos = await this.prisma.deuda.count({
      where: { solventada: false },
    });

    const proximasMembresias = await this.prisma.clientePlan.count({
      where: {
        activado: true,
        estado: 'ACTIVO',
        fechaFin: {
          gte: hoy,
          lte: addDays(hoy, 7),
        },
      },
    });

    const productosBajos = await this.prisma.producto.count({
      where: { stock: { lt: 5 }, estado: true },
    });

    return [
      {
        icon: 'alert-triangle',
        title: `${pagosVencidos} pagos vencidos`,
        message: 'Requieren seguimiento inmediato',
        color: 'bg-red-50 border-red-200 text-red-700',
      },
      {
        icon: 'clock',
        title: `${proximasMembresias} membresías expiran pronto`,
        message: 'En los próximos 7 días',
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
