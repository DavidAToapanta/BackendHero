import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';

@Injectable()
export class AsistenciaService {
  constructor(private prisma: PrismaService) {}

  private async getScopedTenantId(tenantId?: number) {
    return resolveTenantIdOrDefault(this.prisma, tenantId);
  }

  private normalizeAttendanceDate(referenceDate = new Date()) {
    return new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
    );
  }

  private async findClienteOrThrow(clienteId: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, tenantId: scopedTenantId },
      include: {
        usuario: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            cedula: true,
          },
        },
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return { cliente, tenantId: scopedTenantId };
  }

  private async findPlanActivoOrThrow(
    clienteId: number,
    tenantId: number,
    referenceDate = new Date(),
  ) {
    const planActivo = await this.prisma.clientePlan.findFirst({
      where: {
        tenantId,
        clienteId,
        activado: true,
        estado: 'ACTIVO',
        fechaInicio: { lte: referenceDate },
        fechaFin: { gte: referenceDate },
      },
      include: {
        plan: true,
      },
      orderBy: [{ fechaFin: 'desc' }, { id: 'desc' }],
    });

    if (!planActivo) {
      throw new BadRequestException(
        'El cliente no tiene ningun plan activo vigente en este tenant',
      );
    }

    return planActivo;
  }

  private async createOrReuseAttendance(
    clienteId: number,
    tenantId: number,
    fecha: Date,
    horaEntrada = new Date(),
  ) {
    try {
      return await this.prisma.asistencia.create({
        data: {
          tenantId,
          clienteId,
          fecha,
          horaEntrada,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.asistencia.findFirst({
          where: {
            tenantId,
            clienteId,
            fecha,
          },
        });
      }

      throw error;
    }
  }

  async registrarAsistencia(clienteId: number, tenantId?: number) {
    const { cliente, tenantId: scopedTenantId } = await this.findClienteOrThrow(
      clienteId,
      tenantId,
    );

    if (!cliente.activo) {
      throw new BadRequestException('El cliente esta inactivo');
    }

    await this.findPlanActivoOrThrow(cliente.id, scopedTenantId);

    const fecha = this.normalizeAttendanceDate();
    return this.createOrReuseAttendance(
      cliente.id,
      scopedTenantId,
      fecha,
      new Date(),
    );
  }

  async historial(clienteId: number, tenantId?: number) {
    const { cliente, tenantId: scopedTenantId } = await this.findClienteOrThrow(
      clienteId,
      tenantId,
    );

    return this.prisma.asistencia.findMany({
      where: { tenantId: scopedTenantId, clienteId: cliente.id },
      orderBy: {
        fecha: 'desc',
      },
    });
  }

  async todas(tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    return this.prisma.asistencia.findMany({
      where: { tenantId: scopedTenantId },
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

  async getEstadisticasPorPlan(clienteId: number, tenantId?: number) {
    const { cliente, tenantId: scopedTenantId } = await this.findClienteOrThrow(
      clienteId,
      tenantId,
    );
    const planActivo = await this.prisma.clientePlan.findFirst({
      where: {
        tenantId: scopedTenantId,
        clienteId: cliente.id,
        activado: true,
        estado: 'ACTIVO',
      },
      include: {
        plan: true,
      },
      orderBy: [{ fechaFin: 'desc' }, { id: 'desc' }],
    });

    if (!planActivo) {
      return {
        tienePlanActivo: false,
        mensaje: 'No tienes un plan activo',
      };
    }

    const asistencias = await this.prisma.asistencia.count({
      where: {
        tenantId: scopedTenantId,
        clienteId: cliente.id,
        fecha: {
          gte: planActivo.fechaInicio,
          lte: planActivo.fechaFin,
        },
      },
    });

    const fechaInicio = new Date(planActivo.fechaInicio);
    const fechaFin = new Date(planActivo.fechaFin);
    const diasTotales = Math.ceil(
      (fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24),
    );
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

  async marcarAsistencia(usuarioId: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const cliente = await this.prisma.cliente.findFirst({
      where: { usuarioId, tenantId: scopedTenantId },
      include: {
        planes: {
          where: {
            tenantId: scopedTenantId,
            activado: true,
            estado: 'ACTIVO',
          },
          include: { plan: true },
        },
      },
    });

    if (!cliente) {
      throw new NotFoundException(
        'No existe un cliente con este ID de usuario en este tenant',
      );
    }

    if (!cliente.activo) {
      throw new BadRequestException('El cliente esta inactivo');
    }

    const fechaActual = new Date();
    const tienePlanVigente = cliente.planes.some(
      (clientePlan) =>
        clientePlan.activado &&
        new Date(clientePlan.fechaInicio) <= fechaActual &&
        new Date(clientePlan.fechaFin) >= fechaActual,
    );

    if (!tienePlanVigente) {
      throw new BadRequestException(
        'El cliente no tiene ningun plan vigente. No se puede marcar asistencia',
      );
    }

    const fecha = this.normalizeAttendanceDate(fechaActual);
    return this.createOrReuseAttendance(
      cliente.id,
      scopedTenantId,
      fecha,
      fechaActual,
    );
  }

  async findAll(tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    return this.prisma.asistencia.findMany({
      where: { tenantId: scopedTenantId },
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

  async findByCliente(clienteId: number, tenantId?: number) {
    const { cliente, tenantId: scopedTenantId } = await this.findClienteOrThrow(
      clienteId,
      tenantId,
    );

    return this.prisma.asistencia.findMany({
      where: { tenantId: scopedTenantId, clienteId: cliente.id },
      orderBy: { fecha: 'desc' },
    });
  }
}
