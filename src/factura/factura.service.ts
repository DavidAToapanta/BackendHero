import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class FacturaService {

    constructor(
        private prisma: PrismaService
    ){}

    async crearFactura(
      clientePlanId: number,
      options?: { creditoAplicado?: number },
      tx?: PrismaTx,
    ) {
      const db = tx ?? this.prisma;

      const clientePlan = await db.clientePlan.findUnique({
        where: { id: clientePlanId },
          include: {
          plan: true,
        },
      });

      if (!clientePlan) {
        throw new Error('ClientePlan no encontrado');
      }
    
      const IVA = 0.12;

      // TOTAL ES EL PRECIO DEL PLAN (YA INCLUYE IVA)
      const total = clientePlan.plan.precio;

      // Subtotal = precio sin IVA
      const subtotal = Number((total / (1 + IVA)).toFixed(2));

      // IVA = la diferencia
      const iva = Number((total - subtotal).toFixed(2));

      // Crédito aplicado del plan anterior (si hay)
      const creditoAplicado = Number((options?.creditoAplicado ?? 0).toFixed(2));

      // Al inicio no ha pagado nada con dinero real
      const totalPagado = 0;
      const saldo = Number(Math.max(total - creditoAplicado, 0).toFixed(2));
      
      // Generar número de factura
      const fecha = new Date();
      const yyyy = fecha.getFullYear();
      const mm = String(fecha.getMonth() + 1).padStart(2, '0');
      const dd = String(fecha.getDate()).padStart(2, '0');
      const random = Math.floor(1000 + Math.random() * 9000);
      const numeroFactura = `FAC-${yyyy}${mm}${dd}-${random}`;

      const factura = await db.factura.create({
        data: {
          numero: numeroFactura,
          clientePlanId: clientePlan.id,
          subtotal,
          iva,
          total,
          totalPagado,
          creditoAplicado,
          saldo,
          estado: saldo <= 0.01 ? 'PAGADA' : 'PENDIENTE',
        },
      });

      return factura;
    }

    /**
     * Marca la factura activa de un plan como ANULADA.
     * Retorna la factura anulada, o null si no existe ninguna.
     */
    async anularFactura(clientePlanId: number, tx?: PrismaTx) {
      const db = tx ?? this.prisma;

      const factura = await db.factura.findFirst({
        where: { clientePlanId, estado: { not: 'ANULADA' } },
      });

      if (!factura) return null;

      return db.factura.update({
        where: { id: factura.id },
        data: { estado: 'ANULADA' },
      });
    }

    async aplicarPago(clientePlanId: number, monto: number) {
      const factura = await this.prisma.factura.findFirst({
        where: { clientePlanId, estado: { not: 'ANULADA' } },
      });
      if (!factura) throw new Error('Factura no encontrada para este plan');

      // Validar que el monto no exceda el saldo pendiente
      if (monto > factura.saldo) {
        throw new Error(
          `El monto a pagar ($${monto}) excede el saldo pendiente ($${factura.saldo}). No se puede pagar de más.`
        );
      }

      const nuevoTotalPagado = Number((factura.totalPagado + monto).toFixed(2));
      const nuevoSaldo = Number((factura.total - factura.creditoAplicado - nuevoTotalPagado).toFixed(2));
      const nuevoEstado = nuevoSaldo <= 0.01 ? 'PAGADA' : 'PENDIENTE';

      await this.prisma.factura.update({
        where: { id: factura.id },
        data: {
          totalPagado: nuevoTotalPagado,
          saldo: Math.max(nuevoSaldo, 0),
          estado: nuevoEstado,
        },
      });
    }

    async findAll(
      filters?: {
        estado?: string;
        clienteId?: number;
        cedula?: string;
        desde?: string;
        hasta?: string;
      },
      page = 1,
      limit = 10,
    ) {
        const where: any = {};
      
        if (filters?.estado) {
          where.estado = filters.estado;
        }
      
        if (filters?.clienteId) {
          where.clientePlan = {
            clienteId: filters.clienteId,
          };
        }

        if (filters?.cedula) {
            where.clientePlan = {
                ...(where.clientePlan || {}),
                cliente: {
                    usuario: {
                        cedula: {
                            contains: filters.cedula
                        }
                    }
                }
            };
        }
      
        if (filters?.desde || filters?.hasta) {
          where.fechaEmision = {};
          if (filters.desde) {
            where.fechaEmision.gte = new Date(filters.desde);
          }
          if (filters.hasta) {
            where.fechaEmision.lte = new Date(filters.hasta);
          }
        }

        const take = Math.max(1, Math.min(limit, 50));
        const currentPage = Math.max(1, page);
        const skip = (currentPage - 1) * take;

        const [totalItems, facturas] = await Promise.all([
          this.prisma.factura.count({ where }),
          this.prisma.factura.findMany({
            where,
            skip,
            take,
            orderBy: { fechaEmision: 'desc' },
            include: {
              clientePlan: {
                include: {
                  cliente: {
                    include: {
                      usuario: { select: { nombres: true, apellidos: true, cedula: true } },
                    },
                  },
                  plan: { select: { nombre: true, precio: true } },
                },
              },
            },
          }),
        ]);
      
        return {
          data: facturas,
          meta: {
            totalItems,
            itemCount: facturas.length,
            perPage: take,
            totalPages: Math.ceil(totalItems / take),
            currentPage,
          },
        };
      }

      async getResumen() {
        const totalFacturas = await this.prisma.factura.count();

        const facturasPagadas = await this.prisma.factura.count({
          where: { estado: 'PAGADA' },
        });

        const pendientesGroup = await this.prisma.factura.groupBy({
          by: ['clientePlanId'],
          where: { estado: 'PENDIENTE' },
        });
        const personasPendientes = pendientesGroup.length;

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const ingresoMesResult = await this.prisma.factura.aggregate({
          _sum: {
            totalPagado: true,
          },
          where: {
            fechaEmision: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
        });
        const ingresoMes = ingresoMesResult._sum.totalPagado || 0;

        return {
          totalFacturas,
          facturasPagadas,
          personasPendientes,
          ingresoMes,
        };
      }


async findOne(id: number) {
  const factura = await this.prisma.factura.findUnique({
    where: { id },
    include: {
      clientePlan: {
        include: {
          cliente: {
            include: {
              usuario: { select: { nombres: true, apellidos: true } },
            },
          },
          plan: { select: { nombre: true, precio: true } },
        },
      },
    },
  });

  if (!factura) {
    throw new Error('Factura no encontrada');
  }

  return factura;
}

    
}
