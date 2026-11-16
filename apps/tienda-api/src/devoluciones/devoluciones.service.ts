import { PrismaService } from '@app/prisma';
import { Injectable, NotFoundException } from '@nestjs/common';
import { paginacion } from '../comun/operacion-tienda';
import type { ListaDevolucionesDto } from './dto/create-devolucion.dto';

@Injectable()
export class DevolucionesService {
  constructor(private readonly prisma: PrismaService) {}

  listar(tenantId: number, filtros: ListaDevolucionesDto) {
    return this.prisma.devolucionVenta.findMany({
      where: { tenantId, ventaId: filtros.ventaId },
      omit: { claveIdempotencia: true },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      ...paginacion(filtros.pagina, filtros.limite),
    });
  }

  async consultarVenta(tenantId: number, id: number) {
    const venta = await this.prisma.venta.findUnique({
      where: { tenantId_id: { tenantId, id } },
      select: {
        id: true,
        estado: true,
        total: true,
        cuentaPorCobrar_venta: { select: { saldo: true } },
        aplicacionCobro_venta: {
          where: {
            reversionAplicacionCobro_aplicacion: { none: {} },
            cobro: { estado: 'CONFIRMADO' },
          },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            monto: true,
            cobro: { select: { metodo: true } },
          },
        },
        detalleVenta_venta: {
          orderBy: { id: 'asc' },
          select: {
            nombreProducto: true,
            asignacionLoteVenta_detalleVenta: {
              orderBy: { id: 'asc' },
              select: {
                id: true,
                productoId: true,
                loteId: true,
                cantidad: true,
                detalleDevolucionVenta_asignacionVenta: {
                  where: { devolucion: { estado: 'APROBADA' } },
                  select: { cantidad: true },
                },
              },
            },
          },
        },
      },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');
    return {
      ventaId: venta.id,
      estado: venta.estado,
      total: venta.total,
      saldoPendiente: venta.cuentaPorCobrar_venta[0]?.saldo ?? '0',
      aplicaciones: venta.aplicacionCobro_venta,
      asignaciones: venta.detalleVenta_venta.flatMap((detalle) =>
        detalle.asignacionLoteVenta_detalleVenta.map((asignacion) => ({
          asignacionVentaId: asignacion.id,
          productoId: asignacion.productoId,
          nombreProducto: detalle.nombreProducto,
          loteId: asignacion.loteId,
          cantidadVendida: asignacion.cantidad,
          cantidadRestante:
            asignacion.cantidad -
            asignacion.detalleDevolucionVenta_asignacionVenta.reduce(
              (total, detalle) => total + detalle.cantidad,
              0,
            ),
        })),
      ),
    };
  }

  async obtener(tenantId: number, id: number) {
    const devolucion = await this.prisma.devolucionVenta.findUnique({
      where: { tenantId_id: { tenantId, id } },
      omit: { claveIdempotencia: true },
      include: {
        detalleDevolucionVenta_devolucion: {
          orderBy: { id: 'asc' },
          omit: { costoUnitario: true, costoTotal: true },
        },
        reembolso_devolucion: {
          orderBy: { id: 'asc' },
          select: { id: true, estado: true, metodo: true, monto: true },
        },
      },
    });
    if (!devolucion) throw new NotFoundException('Devolución no encontrada');
    return devolucion;
  }
}
