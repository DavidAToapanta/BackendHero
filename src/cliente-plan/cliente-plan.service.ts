import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { FacturaService } from 'src/factura/factura.service';
import { CreateClientePlanDto } from './dto/create-cliente-plan.dto';
import { UpdateClientePlanDto } from './dto/update-cliente-plan.dto';
import { CambiarPlanDto } from './dto/cambiar-plan.dto';

@Injectable()
export class ClientePlanService {
  constructor(
    private prisma: PrismaService,
    private facturaService: FacturaService,
  ) {}

  private calcularDiaPago(fechaInicio: string | Date): number {
    const fecha =
      fechaInicio instanceof Date ? fechaInicio : new Date(fechaInicio);

    if (isNaN(fecha.getTime())) {
      throw new BadRequestException('fechaInicio no es una fecha valida');
    }

    return fecha.getUTCDate();
  }

  private async findClientePlanOrThrow(id: number, tenantId?: number) {
    if (!id || Number.isNaN(id)) {
      throw new BadRequestException('ID no valido');
    }

    const scopedTenantId = await resolveTenantIdOrDefault(this.prisma, tenantId);
    const clientePlan = await this.prisma.clientePlan.findFirst({
      where: { id, tenantId: scopedTenantId },
    });

    if (!clientePlan) {
      throw new NotFoundException(`ClientePlan con id ${id} no encontrado`);
    }

    return { clientePlan, tenantId: scopedTenantId };
  }

  async create(dto: CreateClientePlanDto, tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(this.prisma, tenantId);
    const hoy = new Date();

    const [cliente, plan, planVigente] = await Promise.all([
      this.prisma.cliente.findFirst({
        where: { id: dto.clienteId, tenantId: scopedTenantId },
        select: { id: true },
      }),
      this.prisma.plan.findFirst({
        where: { id: dto.planId, tenantId: scopedTenantId },
        select: { id: true, precio: true },
      }),
      this.prisma.clientePlan.findFirst({
        where: {
          tenantId: scopedTenantId,
          clienteId: dto.clienteId,
          activado: true,
          estado: 'ACTIVO',
          fechaFin: { gte: hoy },
        },
        orderBy: { fechaFin: 'desc' },
      }),
    ]);

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    if (planVigente) {
      throw new BadRequestException(
        'No se puede asignar un nuevo plan porque el plan actual aun no termina',
      );
    }

    await this.prisma.deuda.updateMany({
      where: {
        tenantId: scopedTenantId,
        clientePlan: {
          tenantId: scopedTenantId,
          clienteId: dto.clienteId,
        },
        solventada: false,
      },
      data: {
        solventada: true,
      },
    });

    const diaPago = this.calcularDiaPago(dto.fechaInicio);

    const clientePlan = await this.prisma.clientePlan.create({
      data: {
        tenantId: scopedTenantId,
        clienteId: dto.clienteId,
        planId: dto.planId,
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: new Date(dto.fechaFin),
        diaPago,
        activado: dto.activado,
        estado: 'ACTIVO',
        deudas: {
          create: {
            tenantId: scopedTenantId,
            monto: plan.precio,
            solventada: false,
          },
        },
      },
    });

    await this.facturaService.crearFactura(clientePlan.id, undefined, undefined, scopedTenantId);

    return clientePlan;
  }

  async findAll(tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(this.prisma, tenantId);
    return this.prisma.clientePlan.findMany({
      where: { tenantId: scopedTenantId },
      include: {
        cliente: {
          include: {
            usuario: { select: { nombres: true, apellidos: true } },
          },
        },
        plan: { select: { nombre: true } },
      },
    });
  }

  async findOne(id: number, tenantId?: number) {
    if (!id || Number.isNaN(id)) {
      throw new BadRequestException('ID no valido');
    }

    const scopedTenantId = await resolveTenantIdOrDefault(this.prisma, tenantId);
    const clientePlan = await this.prisma.clientePlan.findFirst({
      where: { id, tenantId: scopedTenantId },
    });

    if (!clientePlan) {
      throw new NotFoundException(`ClientePlan con id ${id} no encontrado`);
    }

    return clientePlan;
  }

  async update(id: number, dto: UpdateClientePlanDto, tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(this.prisma, tenantId);
    await this.findOne(id, scopedTenantId);

    if (dto.clienteId) {
      const cliente = await this.prisma.cliente.findFirst({
        where: { id: dto.clienteId, tenantId: scopedTenantId },
        select: { id: true },
      });
      if (!cliente) {
        throw new NotFoundException('Cliente no encontrado');
      }
    }

    if (dto.planId) {
      const plan = await this.prisma.plan.findFirst({
        where: { id: dto.planId, tenantId: scopedTenantId },
        select: { id: true },
      });
      if (!plan) {
        throw new NotFoundException('Plan no encontrado');
      }
    }

    const diaPago = dto.fechaInicio
      ? this.calcularDiaPago(dto.fechaInicio)
      : undefined;

    return this.prisma.clientePlan.update({
      where: { id },
      data: {
        fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : undefined,
        fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : undefined,
        diaPago,
        activado: dto.activado,
        cliente: dto.clienteId
          ? { connect: { id: dto.clienteId } }
          : undefined,
        plan: dto.planId ? { connect: { id: dto.planId } } : undefined,
      },
    });
  }

  async remove(id: number, tenantId?: number) {
    const { clientePlan, tenantId: scopedTenantId } =
      await this.findClientePlanOrThrow(id, tenantId);

    if (!clientePlan.activado || clientePlan.estado !== 'ACTIVO') {
      throw new BadRequestException('Solo se puede quitar un plan activo');
    }

    const ahora = new Date();
    const fechaFinCancelada =
      clientePlan.fechaFin > ahora ? ahora : clientePlan.fechaFin;

    const planCancelado = await this.prisma.$transaction(async (tx) => {
      await this.facturaService.anularFactura(id, tx, scopedTenantId);

      await tx.deuda.deleteMany({
        where: {
          tenantId: scopedTenantId,
          clientePlanId: id,
          solventada: false,
        },
      });

      return tx.clientePlan.update({
        where: { id },
        data: {
          activado: false,
          estado: 'CANCELADO',
          fechaFin: fechaFinCancelada,
        },
      });
    });

    return {
      mensaje: 'Plan quitado correctamente',
      clientePlan: planCancelado,
    };
  }

  async contarClientesActivos(tenantId?: number): Promise<number> {
    const scopedTenantId = await resolveTenantIdOrDefault(this.prisma, tenantId);
    const clientes = await this.prisma.clientePlan.findMany({
      where: {
        tenantId: scopedTenantId,
        activado: true,
        estado: 'ACTIVO',
        fechaFin: { gte: new Date() },
      },
      select: {
        clienteId: true,
      },
    });

    return new Set(clientes.map((c) => c.clienteId)).size;
  }

  async cambiarPlan(
    clientePlanId: number,
    dto: CambiarPlanDto,
    tenantId?: number,
  ) {
    const scopedTenantId = await resolveTenantIdOrDefault(this.prisma, tenantId);
    const planActual = await this.prisma.clientePlan.findFirst({
      where: { id: clientePlanId, tenantId: scopedTenantId },
      include: {
        plan: true,
      },
    });

    if (!planActual) {
      throw new NotFoundException(
        `ClientePlan con id ${clientePlanId} no encontrado`,
      );
    }

    if (planActual.estado !== 'ACTIVO') {
      throw new BadRequestException(
        `El plan no esta activo. Estado actual: ${planActual.estado}`,
      );
    }

    if (planActual.planId === dto.nuevoPlanId) {
      throw new BadRequestException(
        'No se puede cambiar al mismo plan que ya tiene activo',
      );
    }

    const limiteVentana = new Date(planActual.fechaInicio);
    limiteVentana.setHours(limiteVentana.getHours() + 72);
    if (new Date() > limiteVentana) {
      throw new BadRequestException(
        'Solo se puede cambiar el plan dentro de las primeras 72 horas desde el inicio del plan actual',
      );
    }

    const facturaActiva = await this.prisma.factura.findFirst({
      where: {
        tenantId: scopedTenantId,
        clientePlanId,
        estado: { not: 'ANULADA' },
      },
    });

    if (!facturaActiva) {
      throw new NotFoundException(
        `No se encontro factura activa para el ClientePlan ${clientePlanId}`,
      );
    }

    const nuevoPlan = await this.prisma.plan.findFirst({
      where: { id: dto.nuevoPlanId, tenantId: scopedTenantId },
    });

    if (!nuevoPlan) {
      throw new NotFoundException(
        `Plan con id ${dto.nuevoPlanId} no encontrado`,
      );
    }

    const montoCubiertoActual = Number(
      (
        Number(facturaActiva.creditoAplicado ?? 0) +
        Number(facturaActiva.totalPagado ?? 0)
      ).toFixed(2),
    );
    const creditoTotal = montoCubiertoActual;
    const precioNuevo = Number(nuevoPlan.precio.toFixed(2));
    const creditoAplicado = Number(
      Math.min(creditoTotal, precioNuevo).toFixed(2),
    );
    const devolucionPendiente = Number(
      Math.max(creditoTotal - precioNuevo, 0).toFixed(2),
    );
    const faltante = Number(
      Math.max(precioNuevo - creditoAplicado, 0).toFixed(2),
    );
    const diaPago = this.calcularDiaPago(dto.fechaInicio);

    if (devolucionPendiente > 0 && faltante > 0) {
      throw new BadRequestException(
        'No puede existir faltante y devolucion pendiente al mismo tiempo',
      );
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      await tx.clientePlan.update({
        where: { id: clientePlanId },
        data: {
          estado: 'CAMBIADO',
          activado: false,
        },
      });

      await this.facturaService.anularFactura(clientePlanId, tx, scopedTenantId);

      await tx.deuda.deleteMany({
        where: {
          tenantId: scopedTenantId,
          clientePlanId,
          solventada: false,
        },
      });

      const nuevoClientePlan = await tx.clientePlan.create({
        data: {
          tenantId: scopedTenantId,
          clienteId: planActual.clienteId,
          planId: dto.nuevoPlanId,
          fechaInicio: new Date(dto.fechaInicio),
          fechaFin: new Date(dto.fechaFin),
          diaPago,
          activado: true,
          estado: 'ACTIVO',
        },
      });

      await this.facturaService.crearFactura(
        nuevoClientePlan.id,
        { creditoAplicado },
        tx,
        scopedTenantId,
      );

      if (faltante > 0) {
        await tx.deuda.create({
          data: {
            tenantId: scopedTenantId,
            clientePlanId: nuevoClientePlan.id,
            monto: faltante,
            solventada: false,
          },
        });
      }

      await tx.cambioPlan.create({
        data: {
          tenantId: scopedTenantId,
          clienteId: planActual.clienteId,
          clientePlanAnteriorId: clientePlanId,
          clientePlanNuevoId: nuevoClientePlan.id,
          montoPagadoTransferido: creditoAplicado,
          devolucionPendiente: devolucionPendiente > 0 ? devolucionPendiente : 0,
          devolucionDevueltaAcumulada: 0,
          estadoDevolucion:
            devolucionPendiente > 0 ? 'PENDIENTE' : 'NO_APLICA',
          motivo: dto.motivo ?? null,
        },
      });

      return nuevoClientePlan;
    });

    return {
      mensaje: 'Plan cambiado exitosamente',
      planAnterior: {
        id: clientePlanId,
        planNombre: planActual.plan.nombre,
        estado: 'CAMBIADO',
      },
      planNuevo: {
        id: resultado.id,
        planNombre: nuevoPlan.nombre,
        fechaInicio: resultado.fechaInicio,
        fechaFin: resultado.fechaFin,
      },
      financiero: {
        creditoTotal,
        creditoAplicado,
        devolucionPendiente,
        faltante,
        precioNuevoPlan: precioNuevo,
      },
    };
  }
}
