import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AsistenciaService {
  constructor(private prisma: PrismaService) {}

  async registrarAsistencia(clienteId: number) {
    const hoy = new Date();

    // Normalizar la fecha para evitar problemas de timestamps
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    try {
      return await this.prisma.asistencia.create({
        data: {
          clienteId,
          fecha,
          horaEntrada: new Date(),
        },
      });
    } catch (e) {
      // Si ya existe una asistencia para esa fecha devuelve esa asistencia
      return await this.prisma.asistencia.findFirst({
        where: {
          clienteId,
          fecha,
        },
      });
    }
  }

  async historial(clienteId: number) {
    return await this.prisma.asistencia.findMany({
      where: { clienteId },
      orderBy: {
        fecha: 'desc',
      },
    });
  }

  async todas() {
    return this.prisma.asistencia.findMany({
      orderBy: {
        fecha: 'desc',
      },
      include: {
        cliente: {
          include: {
            usuario: true,
          },
        },
      },
    });
  }

  async getEstadisticasPorPlan(clienteId: number) {
    // Obtener el plan activo del cliente
    const planActivo = await this.prisma.clientePlan.findFirst({
      where: {
        clienteId,
        activado: true,
      },
      include: {
        plan: true,
      },
    });

    if (!planActivo) {
      return {
        tienePlanActivo: false,
        mensaje: 'No tienes un plan activo',
      };
    }

    // Contar asistencias dentro del rango del plan
    const asistencias = await this.prisma.asistencia.count({
      where: {
        clienteId,
        fecha: {
          gte: planActivo.fechaInicio,
          lte: planActivo.fechaFin,
        },
      },
    });

    // Calcular días totales del plan
    const fechaInicio = new Date(planActivo.fechaInicio);
    const fechaFin = new Date(planActivo.fechaFin);
    const diasTotales = Math.ceil(
      (fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Calcular porcentaje
    const porcentajeAsistencia =
      diasTotales > 0 ? Math.round((asistencias / diasTotales) * 100) : 0;

    return {
      tienePlanActivo: true,
      diasAsistidos: asistencias,
      diasTotales,
      porcentajeAsistencia,
      fechaInicio: planActivo.fechaInicio,
      fechaFin: planActivo.fechaFin,
      nombrePlan: planActivo.plan.nombre,
      precioPlan: planActivo.plan.precio,
    };
  }

  async marcarAsistencia(usuarioId: number) {
    // Buscar el cliente relacionado con este usuario
    const cliente = await this.prisma.cliente.findUnique({
      where: { usuarioId },
      include: {
        planes: {
          where: { activado: true },
          include: { plan: true },
        },
      },
    });

    if (!cliente) {
      throw new NotFoundException(
        'No existe un cliente con este ID de usuario',
      );
    }

    // Verificar que el cliente tenga al menos un plan activo
    if (!cliente.planes || cliente.planes.length === 0) {
      throw new BadRequestException(
        'El cliente no tiene ningún plan activo. No se puede marcar asistencia',
      );
    }

    // Verificar que al menos un plan esté dentro de las fechas válidas
    const fechaActual = new Date();
    const tieneplanVigente = cliente.planes.some(
      (clientePlan) =>
        clientePlan.activado &&
        new Date(clientePlan.fechaInicio) <= fechaActual &&
        new Date(clientePlan.fechaFin) >= fechaActual,
    );

    if (!tieneplanVigente) {
      throw new BadRequestException(
        'El cliente no tiene ningún plan vigente. No se puede marcar asistencia',
      );
    }

    // Crear la asistencia
    return this.prisma.asistencia.create({
      data: {
        clienteId: cliente.id,
        fecha: new Date(),
      },
    });
  }

  async findAll() {
    return this.prisma.asistencia.findMany({
      include: {
        cliente: {
          include: {
            usuario: {
              select: {
                nombres: true,
                apellidos: true,
                cedula: true,
              },
            },
          },
        },
      },
      orderBy: { fecha: 'desc' },
    });
  }

  async findByCliente(clienteId: number) {
    return this.prisma.asistencia.findMany({
      where: { clienteId },
      orderBy: { fecha: 'desc' },
    });
  }
}
