import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class FacturaService {

    constructor(
        private prisma: PrismaService
    ){}

    async crearFactura(clientePlanId: number) {
  // TODO: aquí después metemos la lógica real (subtotal, iva, total, etc.)
    const clientePlan = await this.prisma.clientePlan.findUnique({
      where: { id: clientePlanId },
        include: {
        plan: true,
      },
    });

    if (!clientePlan) {
      throw new Error('ClientePlan no encontrado');
    }
  
    const IVA = 0.12;

    //rOTAL ES EL PRECIO DEL PLAN (YA INCLUYE IVA)
    const total = clientePlan.plan.precio;

    //Subtotal = precio sin IVA
    const subtotal = Number((total / (1 + IVA)).toFixed(2));

    //IVA = la diferencia
    const iva = Number((total - subtotal).toFixed(2));

    //Al inicio no ha pagado nada
    const totalPagado = 0;
    const saldo = total;
    
    // Generar número de factura (simple y seguro)
    const fecha = new Date();
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');

    // contador simple por ahora (luego se puede mejorar)
    const random = Math.floor(1000 + Math.random() * 9000);

    const numeroFactura = `FAC-${yyyy}${mm}${dd}-${random}`;

      // Crear la factura
    const factura = await this.prisma.factura.create({
    data: {
      numero: numeroFactura,
      clientePlanId: clientePlan.id,
      subtotal,
      iva,
      total,
      totalPagado,
      saldo,
      estado: 'PENDIENTE',
    },
  });

    return factura;

    
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
  const nuevoSaldo = Number((factura.total - nuevoTotalPagado).toFixed(2));
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
      
        // Filtro por estado
        if (filters?.estado) {
          where.estado = filters.estado;
        }
      
        // Filtro por cliente (ID directo)
        if (filters?.clienteId) {
          where.clientePlan = {
            clienteId: filters.clienteId,
          };
        }

        // Filtro por cédula (buscando en la relación)
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
      
        // Filtro por rango de fechas
        if (filters?.desde || filters?.hasta) {
          where.fechaEmision = {};
          if (filters.desde) {
            where.fechaEmision.gte = new Date(filters.desde);
          }
          if (filters.hasta) {
            // Ajustar hasta el final del día si es necesario, o asumir que viene correcto
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
        // Total Facturas
        const totalFacturas = await this.prisma.factura.count();

        // Facturas Pagadas
        const facturasPagadas = await this.prisma.factura.count({
          where: { estado: 'PAGADA' },
        });

        // Personas Pendientes (Unique clients with PENDIENTE invoices)
        // Prisma doesn't support distinct count easily on relations in a single call,
        // so we can group by clientePlanId inside factura where estado is PENDIENTE
        const pendientesGroup = await this.prisma.factura.groupBy({
          by: ['clientePlanId'],
          where: { estado: 'PENDIENTE' },
        });
        const personasPendientes = pendientesGroup.length;

        // Ingreso del Mes (Sum totalPagado of invoices emitted this month)
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
