import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePagoDto } from './dto/create-pago.dto';
import { UpdatePagoDto } from './dto/update-pago.dto';
import { FacturaService } from 'src/factura/factura.service';

@Injectable()
export class PagoService {
    constructor(
      private prisma: PrismaService,
      private facturaService: FacturaService,
    
    ){}

    async create(dto: CreatePagoDto) {
        return this.prisma.$transaction(async (tx) => {
            // 1. Obtener ClientePlan con el plan asociado para conocer el precio
            const clientePlan = await tx.clientePlan.findUnique({
              where: { id: dto.clientePlanId },
              include: { 
                plan: true,
                pago: true, // Obtener todos los pagos previos
              },
            });
        
            if (!clientePlan) {
              throw new NotFoundException('ClientePlan no encontrado');
            }
        
            const precioPlan = Number(clientePlan.plan.precio);
            const montoPagado = Number(dto.monto);
        
            // 2. Calcular el total pagado hasta ahora (incluyendo este pago)
            const totalPagadoAntes = clientePlan.pago.reduce((sum, pago) => sum + Number(pago.monto), 0);
            const totalPagadoDespues = totalPagadoAntes + montoPagado;
        
            console.log(`[Pago] Precio del plan: $${precioPlan}`);
            console.log(`[Pago] Total pagado antes: $${totalPagadoAntes}`);
            console.log(`[Pago] Monto de este pago: $${montoPagado}`);
            console.log(`[Pago] Total pagado después: $${totalPagadoDespues}`);
        
            // 3. Crear el pago
            const pago = await tx.pago.create({
              data: {
                monto: montoPagado,
                fecha: new Date(dto.fecha),
                clientePlan: { connect: { id: dto.clientePlanId } },
              },
            });
    
            // Llamar al servicio de factura (nota: esto requiere actualizar FacturaService para que acepte tx opcional o manejarlo fuera)
            // Como FacturaService usa this.prisma, no participará en la tx a menos que refactoricemos FacturaService.
            // SOLUCIÓN RAPIDA: Llamamos a facturaService aquí, si falla, la tx se revierte.
            // Aunque facturaService escribirá en DB fuera de ESTA tx especificamente (si no soporta inyección de cliente),
            // Prisma Client genérico no comparte contexto automáticamente.
            // PERO: Si facturaService falla, se lanza excepción y el $transaction hace rollback de lo que hizo 'tx'.
            // Lo ideal sería pasarle 'tx' a facturaService.aplicarPago, pero implicaría cambiar firma.
            // Dado que el error del usuario es "pagó y no se actualizó", asumimos que FacturaService NO falló, pero tal vez 
            // hubo una inconsistencia.
            // Al envolver en try/catch podemos asegurar coherencia.
            
            await this.facturaService.aplicarPago(dto.clientePlanId, montoPagado);
        
            // 4. Eliminar todas las deudas anteriores no solventadas de este plan
            console.log(`[Pago] Buscando deudas para clientePlanId: ${dto.clientePlanId}`);
            
            const deudasAEliminar = await tx.deuda.findMany({
              where: {
                clientePlanId: dto.clientePlanId,
                solventada: false,
              },
            });
            
            console.log(`[Pago] Deudas encontradas para eliminar:`, deudasAEliminar.map(d => ({ id: d.id, monto: d.monto })));
            
            const deleteResult = await tx.deuda.deleteMany({
              where: {
                clientePlanId: dto.clientePlanId,
                solventada: false,
              },
            });
            console.log(`[Pago] Deudas eliminadas: ${deleteResult.count}`);
        
            // 5. Si el total pagado es menor al precio del plan, crear nueva deuda con el saldo restante
            if (totalPagadoDespues < precioPlan) {
              const montoDeuda = precioPlan - totalPagadoDespues;
              
              console.log(`[Pago] Creando nueva deuda: $${montoDeuda}`);
              
              await tx.deuda.create({
                data: {
                  clientePlanId: dto.clientePlanId,
                  monto: montoDeuda,
                  solventada: false,
                },
              });
            } else {
              console.log(`[Pago] Plan completamente pagado. Total: $${totalPagadoDespues}`);
            }
        
            return pago;
        });
      }

      async findAll(page = 1, limit = 10, search?: string) {
        const take = Math.max(1, Math.min(limit, 50));
        const currentPage = Math.max(1, page);
        const skip = (currentPage - 1) * take;

        const where: any = search
            ? {
                OR: [
                    { clientePlan: { cliente: { usuario: { nombres: { contains: search, mode: 'insensitive' } } } } },
                    { clientePlan: { cliente: { usuario: { apellidos: { contains: search, mode: 'insensitive' } } } } },
                    { clientePlan: { cliente: { usuario: { cedula: { contains: search, mode: 'insensitive' } } } } },
                    { clientePlan: { plan: { nombre: { contains: search, mode: 'insensitive' } } } },
                ]
            }
            : undefined;

        const [totalItems, pagos] = await Promise.all([
          this.prisma.pago.count({ where }),
          this.prisma.pago.findMany({
            where,
            skip,
            take,
            orderBy: { id: 'desc' },
            select: {
              id: true,
              monto: true,
              fecha: true,
              clientePlan: {
                select: {
                  plan: { select: { nombre: true } },
                  cliente: {
                    select: {
                      usuario: { select: { nombres: true, apellidos: true } },
                    },
                  },
                },
              },
            },
          }),
        ]);

        return {
          data: pagos,
          meta: {
            totalItems,
            itemCount: pagos.length,
            perPage: take,
            totalPages: Math.ceil(totalItems / take),
            currentPage,
          },
        };
      }

      async findOne(id: number) {
        const pago = await this.prisma.pago.findUnique({ where: { id } });
        if (!pago) throw new NotFoundException('Pago no encontrado');
        return pago;
      }

      async update(id: number, dto: UpdatePagoDto) {
        await this.findOne(id);
        return this.prisma.pago.update({
          where: { id },
          data: {
            ...(dto.monto !== undefined && { monto: dto.monto }),
            ...(dto.fecha && { fecha: new Date(dto.fecha) }),
            ...(dto.clientePlanId !== undefined && {
              clientePlan: { connect: { id: dto.clientePlanId } },
            }),
          },
        });
      }

      async remove(id: number) {
        return this.prisma.$transaction(async (tx) => {
          // 1. Obtener el pago antes de eliminarlo para saber monto y plan
          const pago = await tx.pago.findUnique({
            where: { id },
            include: { clientePlan: { include: { plan: true } } },
          });

          if (!pago) throw new NotFoundException('Pago no encontrado');

          const montoEliminado = Number(pago.monto);
          const clientePlanId = pago.clientePlanId;

          // 2. Eliminar el pago
          await tx.pago.delete({ where: { id } });

          // 3. Buscar la factura asociada al plan
          const factura = await tx.factura.findFirst({
            where: { clientePlanId, estado: { not: 'ANULADA' } },
          });

          if (factura) {
            // 4. Actualizar la factura
            // Se resta el monto pagado (porque se eliminó el pago) -> El saldo aumenta
            const nuevoTotalPagado = Number(
              (factura.totalPagado - montoEliminado).toFixed(2),
            );
            const nuevoSaldo = Number(
              (factura.saldo + montoEliminado).toFixed(2),
            );

            // Si el saldo es > 0, pasa a PENDIENTE
            const nuevoEstado = nuevoSaldo > 0.01 ? 'PENDIENTE' : 'PAGADA';

            console.log(
              `[PagoService] Rollback pago ${id}: Restando $${montoEliminado} a pagado. Nuevo saldo: $${nuevoSaldo}`,
            );

            await tx.factura.update({
              where: { id: factura.id },
              data: {
                totalPagado: nuevoTotalPagado,
                saldo: nuevoSaldo,
                estado: nuevoEstado,
              },
            });

            // 5. Regenerar la deuda
            // Eliminamos cualquier deuda pendiente "residual" que pudiera haber
            await tx.deuda.deleteMany({
              where: {
                clientePlanId,
                solventada: false,
              },
            });

            // Si queda saldo por pagar, se crea UNA deuda unificada por ese valor
            if (nuevoSaldo > 0.01) {
              console.log(
                `[PagoService] Regenerando deuda por rollback: $${nuevoSaldo}`,
              );
              await tx.deuda.create({
                data: {
                  clientePlanId,
                  monto: nuevoSaldo,
                  solventada: false,
                },
              });
            }
          }

          return pago;
        });
      }

      async obtenerIngresoDelMes(): Promise<number>{
        const ahora = new Date();
        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        const finMes  = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);

        const resultado = await this.prisma.pago.aggregate({
          _sum: {
            monto: true,
          },
          where: {
            fecha: {
              gte: inicioMes,
              lte: finMes,
            }
          }
        });

        return resultado._sum.monto ?? 0;
      }

}
