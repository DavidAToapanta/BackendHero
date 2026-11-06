import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrigenAsistencia, Prisma, SaasPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';

type BiometricAttendanceStatus =
  | 'processed'
  | 'duplicate'
  | 'unlinked'
  | 'rejectedByPlan'
  | 'invalid';

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

  private normalizeHistoricalDate(dateValue: string | Date) {
    const parsedDate =
      dateValue instanceof Date ? dateValue : new Date(dateValue);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('La fecha de asistencia no es valida');
    }

    const normalizedDate = this.normalizeAttendanceDate(parsedDate);
    const today = this.normalizeAttendanceDate();

    if (normalizedDate.getTime() > today.getTime()) {
      throw new BadRequestException(
        'No se puede registrar asistencia en una fecha futura',
      );
    }

    return normalizedDate;
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

  private async updateAttendanceWithBiometricMetadata(
    asistenciaId: number,
    data: {
      eventoBiometricoId: string;
      dispositivoSn?: string | null;
      biometricoPersonId: string;
    },
  ) {
    return this.prisma.asistencia.update({
      where: { id: asistenciaId },
      data: {
        origen: OrigenAsistencia.BIOMETRIA,
        eventoBiometricoId: data.eventoBiometricoId,
        dispositivoSn: data.dispositivoSn ?? null,
        biometricoPersonId: data.biometricoPersonId,
      },
    });
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

  async registrarAsistenciaBiometrica(input: {
    tenantId: number;
    eventoBiometricoId: string;
    occurredAt: string | Date;
    dispositivoSn?: string | null;
    biometricoPersonId: string;
  }): Promise<{ status: BiometricAttendanceStatus; asistencia?: unknown }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true, saasPlan: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    if (tenant.saasPlan !== SaasPlan.PLUS) {
      return { status: 'rejectedByPlan' };
    }

    const biometricoPersonId = input.biometricoPersonId?.trim();
    const eventoBiometricoId = input.eventoBiometricoId?.trim();

    if (!biometricoPersonId || !eventoBiometricoId) {
      return { status: 'invalid' };
    }

    const fechaEvento = this.normalizeHistoricalDate(input.occurredAt);
    const existingEvent = await this.prisma.asistencia.findFirst({
      where: {
        tenantId: tenant.id,
        eventoBiometricoId,
      },
    });

    if (existingEvent) {
      return { status: 'duplicate', asistencia: existingEvent };
    }

    const cliente = await this.prisma.cliente.findFirst({
      where: {
        tenantId: tenant.id,
        zkbioPersonId: biometricoPersonId,
      },
      select: {
        id: true,
        tenantId: true,
        activo: true,
      },
    });

    if (!cliente) {
      return { status: 'unlinked' };
    }

    if (!cliente.activo) {
      return { status: 'rejectedByPlan' };
    }

    try {
      await this.findPlanActivoOrThrow(cliente.id, tenant.id, fechaEvento);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return { status: 'rejectedByPlan' };
      }

      throw error;
    }

    const existingDailyAttendance = await this.prisma.asistencia.findFirst({
      where: {
        tenantId: tenant.id,
        clienteId: cliente.id,
        fecha: fechaEvento,
      },
    });

    if (existingDailyAttendance) {
      if (!existingDailyAttendance.eventoBiometricoId) {
        const asistencia = await this.updateAttendanceWithBiometricMetadata(
          existingDailyAttendance.id,
          {
            eventoBiometricoId,
            dispositivoSn: input.dispositivoSn,
            biometricoPersonId,
          },
        );

        return { status: 'processed', asistencia };
      }

      return { status: 'processed', asistencia: existingDailyAttendance };
    }

    const asistencia = await this.prisma.asistencia.create({
      data: {
        tenantId: tenant.id,
        clienteId: cliente.id,
        fecha: fechaEvento,
        horaEntrada: fechaEvento,
        origen: OrigenAsistencia.BIOMETRIA,
        eventoBiometricoId,
        dispositivoSn: input.dispositivoSn ?? null,
        biometricoPersonId,
      },
    });

    return { status: 'processed', asistencia };
  }

  async registrarAsistenciaHistorica(
    clienteId: number,
    fecha: string | Date,
    tenantId?: number,
  ) {
    const { cliente, tenantId: scopedTenantId } = await this.findClienteOrThrow(
      clienteId,
      tenantId,
    );

    if (!cliente.activo) {
      throw new BadRequestException('El cliente esta inactivo');
    }

    const fechaHistorica = this.normalizeHistoricalDate(fecha);

    await this.findPlanActivoOrThrow(
      cliente.id,
      scopedTenantId,
      fechaHistorica,
    );

    return this.createOrReuseAttendance(
      cliente.id,
      scopedTenantId,
      fechaHistorica,
      fechaHistorica,
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
