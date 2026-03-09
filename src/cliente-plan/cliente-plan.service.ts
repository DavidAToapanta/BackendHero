import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateClientePlanDto } from './dto/create-cliente-plan.dto';
import { UpdateClientePlanDto } from './dto/update-cliente-plan.dto';
import { CambiarPlanDto } from './dto/cambiar-plan.dto';
import { FacturaService } from 'src/factura/factura.service';

@Injectable()
export class ClientePlanService {
    constructor(
      private prisma: PrismaService,
      private facturaService: FacturaService
    ){}

    async create(dto: CreateClientePlanDto) {
    const hoy = new Date();
    const planVigente = await this.prisma.clientePlan.findFirst({
      where: {
        clienteId: dto.clienteId,
        activado: true,
        estado: 'ACTIVO',
        fechaFin: { gte: hoy },
      },
      orderBy: { fechaFin: 'desc' },
    });

    if (planVigente) {
      throw new BadRequestException('No se puede asignar un nuevo plan porque el plan actual aún no termina');
    }

    // 1. Marcar todas las deudas anteriores del cliente como solventadas
    console.log(`[ClientePlan] Buscando deudas anteriores del cliente ${dto.clienteId}`);
    
    const deudasAnteriores = await this.prisma.deuda.findMany({
      where: {
        clientePlan: {
          clienteId: dto.clienteId,
        },
        solventada: false,
      },
    });

    if (deudasAnteriores.length > 0) {
      console.log(`[ClientePlan] Encontradas ${deudasAnteriores.length} deudas anteriores. Marcando como solventadas...`);
      
      await this.prisma.deuda.updateMany({
        where: {
          clientePlan: {
            clienteId: dto.clienteId,
          },
          solventada: false,
        },
        data: {
          solventada: true,
        },
      });
      
      console.log(`[ClientePlan] Deudas anteriores marcadas como solventadas`);
    } else {
      console.log(`[ClientePlan] No hay deudas anteriores para este cliente`);
    }

    // 2. Obtener el precio del plan para generar la deuda
    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    console.log(`[ClientePlan] Creando plan con deuda inicial de: $${plan.precio}`);

    // 3. Crear el nuevo plan con la deuda inicial
    const clientePlan = await this.prisma.clientePlan.create({
      data: {
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: new Date(dto.fechaFin),
        diaPago: dto.diaPago,
        activado: dto.activado,
        estado: 'ACTIVO',
        cliente: { connect: { id: dto.clienteId } },
        plan: { connect: { id: dto.planId } },
        deudas: {
          create: {
            monto: plan.precio,
            solventada: false,
          },
        },
      },
    });

    await this.facturaService.crearFactura(clientePlan.id);

    return clientePlan;
  }

    findAll(){
        return this.prisma.clientePlan.findMany({
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

    async findOne(id: number) {
      if (!id || isNaN(id)) {
        throw new Error('ID no válido');
      }
    
      return this.prisma.clientePlan.findUnique({
        where: {
          id: id,
        },
      });
    }

    async update(id: number, dto: UpdateClientePlanDto) {
        await this.findOne(id);
        return this.prisma.clientePlan.update({
          where: { id },
          data: {
            fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : undefined,
            fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : undefined,
            diaPago: dto.diaPago,
            activado: dto.activado,
            cliente: dto.clienteId ? { connect: { id: dto.clienteId } } : undefined,
            plan: dto.planId ? { connect: { id: dto.planId } } : undefined,
          },
        });
      }

    async remove(id: number) {
        await this.findOne(id);
        return this.prisma.clientePlan.delete({ where: { id } });
      }

      async contarClientesActivos(): Promise<number> {
        const ahora = new Date();
    
        const clientes = await this.prisma.clientePlan.findMany({
          where: {
            activado: true,
            estado: 'ACTIVO',
            fechaFin: { gte: ahora },
          },
          select: {
            clienteId: true,
          },
        });
    
        const idsUnicos = new Set(clientes.map(c => c.clienteId));
    
        return idsUnicos.size;
      }

    /**
     * Cambia el plan activo de un cliente de forma atómica.
     * 
     * Flujo:
     * 1. Validar que el plan existe y está ACTIVO
     * 2. Validar que han pasado menos de 72h desde el inicio
     * 3. Validar que no es el mismo plan
     * 4. Calcular crédito (suma de pagos del plan actual)
     * 5. En transacción:
     *    - Marcar plan viejo como CAMBIADO
     *    - Anular factura vieja
     *    - Eliminar deudas pendientes del plan viejo
     *    - Crear nuevo plan
     *    - Crear nueva factura con creditoAplicado
     *    - Si hay faltante, crear deuda nueva
     *    - Registrar auditoría en CambioPlan
     */
    async cambiarPlan(clientePlanId: number, dto: CambiarPlanDto) {
      // --- PASO 1: Buscar el plan actual con sus pagos ---
      const planActual = await this.prisma.clientePlan.findUnique({
        where: { id: clientePlanId },
        include: {
          plan: true,
          pago: true,
        },
      });

      if (!planActual) {
        throw new NotFoundException(`ClientePlan con id ${clientePlanId} no encontrado`);
      }

      // --- PASO 2: Validar que esté ACTIVO ---
      if (planActual.estado !== 'ACTIVO') {
        throw new BadRequestException(
          `El plan no está activo. Estado actual: ${planActual.estado}`,
        );
      }

      // --- PASO 3: Validar que no sea el mismo plan ---
      if (planActual.planId === dto.nuevoPlanId) {
        throw new BadRequestException('No se puede cambiar al mismo plan que ya tiene activo');
      }

      // --- PASO 4: Validar ventana de 72 horas ---
      const ahora = new Date();
      const limiteVentana = new Date(planActual.fechaInicio);
      limiteVentana.setHours(limiteVentana.getHours() + 72);

      if (ahora > limiteVentana) {
        throw new BadRequestException(
          'Solo se puede cambiar el plan dentro de las primeras 72 horas desde el inicio del plan actual',
        );
      }

      // --- PASO 5: Calcular crédito (suma de todos los pagos del plan) ---
      const creditoTotal = Number(
        planActual.pago.reduce((sum, p) => sum + p.monto, 0).toFixed(2),
      );

      // --- PASO 6: Obtener precio del nuevo plan ---
      const nuevoPlan = await this.prisma.plan.findUnique({
        where: { id: dto.nuevoPlanId },
      });

      if (!nuevoPlan) {
        throw new NotFoundException(`Plan con id ${dto.nuevoPlanId} no encontrado`);
      }

      const precioNuevo = Number(nuevoPlan.precio.toFixed(2));
      const creditoAplicado = Number(Math.min(creditoTotal, precioNuevo).toFixed(2));
      const devolucionPendiente = Number(Math.max(creditoTotal - precioNuevo, 0).toFixed(2));
      const faltante = Number(Math.max(precioNuevo - creditoAplicado, 0).toFixed(2));

      // --- PASO 7: Transacción atómica ---
      const resultado = await this.prisma.$transaction(async (tx) => {
        // 7.1 Marcar plan viejo como CAMBIADO
        await tx.clientePlan.update({
          where: { id: clientePlanId },
          data: {
            estado: 'CAMBIADO',
            activado: false,
          },
        });

        // 7.2 Anular factura vieja
        await this.facturaService.anularFactura(clientePlanId, tx);

        // 7.3 Eliminar deudas pendientes del plan viejo
        await tx.deuda.deleteMany({
          where: {
            clientePlanId,
            solventada: false,
          },
        });

        // 7.4 Crear nuevo ClientePlan
        const nuevoClientePlan = await tx.clientePlan.create({
          data: {
            fechaInicio: new Date(dto.fechaInicio),
            fechaFin: new Date(dto.fechaFin),
            diaPago: dto.diaPago,
            activado: true,
            estado: 'ACTIVO',
            cliente: { connect: { id: planActual.clienteId } },
            plan: { connect: { id: dto.nuevoPlanId } },
          },
        });

        // 7.5 Crear nueva factura con creditoAplicado
        await this.facturaService.crearFactura(
          nuevoClientePlan.id,
          { creditoAplicado: creditoAplicado },
          tx,
        );

        // 7.6 Si hay faltante, crear deuda nueva
        if (faltante > 0) {
          await tx.deuda.create({
            data: {
              clientePlanId: nuevoClientePlan.id,
              monto: faltante,
              solventada: false,
            },
          });
        }

        // 7.7 Registrar auditoría
        const estadoDevolucion = devolucionPendiente > 0 ? 'PENDIENTE' : 'NO_APLICA';

        await tx.cambioPlan.create({
          data: {
            clienteId: planActual.clienteId,
            clientePlanAnteriorId: clientePlanId,
            clientePlanNuevoId: nuevoClientePlan.id,
            montoPagadoTransferido: creditoAplicado,
            montoDevuelto: devolucionPendiente,
            estadoDevolucion,
            motivo: dto.motivo ?? null,
          },
        });

        return nuevoClientePlan;
      });

      // --- PASO 8: Retornar resumen ---
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
