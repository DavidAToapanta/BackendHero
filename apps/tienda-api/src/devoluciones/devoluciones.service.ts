import { PrismaService } from '@app/prisma';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginacion } from '../comun/operacion-tienda';
import {
  CalculoDevolucionesService,
  type LineaDevuelta,
} from './calculo-devoluciones.service';
import type { ListaDevolucionesDto } from './dto/create-devolucion.dto';
import type { VistaPreviaDevolucion } from './dto/vista-previa-devolucion.dto';

@Injectable()
export class DevolucionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculo: CalculoDevolucionesService,
  ) {}

  vistaPrevia(
    tenantId: number,
    ventaId: number,
    seleccion: LineaDevuelta[],
  ): Promise<VistaPreviaDevolucion> {
    const lineas = this.calculo.ordenarLineas(seleccion, false);
    // Una misma instantánea para cantidades, importes, deuda y cobros.
    // No usa el coordinador de escrituras ni reserva las unidades consultadas.
    return this.prisma.$transaction(
      async (tx) => {
        const venta = await tx.venta.findUnique({
          where: { tenantId_id: { tenantId, id: ventaId } },
        });
        if (!venta) throw new NotFoundException('Venta no encontrada');
        if (venta.estado !== 'COMPLETADA')
          throw new ConflictException('La venta está anulada');
        const importes = await this.calculo.calcular(tx, venta, lineas);
        const cuenta = await tx.cuentaPorCobrar.findUnique({
          where: { tenantId_ventaId: { tenantId, ventaId } },
          select: { saldo: true },
        });
        const saldoPendiente = cuenta?.saldo ?? new Prisma.Decimal(0);
        const reduccionSaldoSugerida = Prisma.Decimal.min(
          importes.total,
          saldoPendiente,
        );
        const importeALiberar = importes.total.minus(reduccionSaldoSugerida);
        const aplicaciones = await tx.aplicacionCobro.findMany({
          where: {
            tenantId,
            ventaId,
            reversionAplicacionCobro_aplicacion: { none: {} },
            cobro: { estado: 'CONFIRMADO' },
          },
          orderBy: { id: 'asc' },
          select: { id: true, monto: true },
        });
        let pendiente = importeALiberar;
        const liberarSugerido: VistaPreviaDevolucion['liberarSugerido'] = [];
        for (const aplicacion of aplicaciones) {
          if (pendiente.isZero()) break;
          const monto = Prisma.Decimal.min(pendiente, aplicacion.monto);
          if (monto.lte(0)) continue;
          liberarSugerido.push({
            aplicacionId: aplicacion.id,
            monto: monto.toFixed(2),
          });
          pendiente = pendiente.minus(monto);
        }
        if (!pendiente.isZero())
          throw new ConflictException(
            'Las aplicaciones disponibles no cubren el importe a liberar',
          );
        return {
          ventaId,
          subtotal: importes.subtotal.toFixed(2),
          descuento: importes.descuento.toFixed(2),
          impuesto: importes.impuesto.toFixed(2),
          total: importes.total.toFixed(2),
          saldoPendiente: saldoPendiente.toFixed(2),
          reduccionSaldoSugerida: reduccionSaldoSugerida.toFixed(2),
          importeALiberar: importeALiberar.toFixed(2),
          liberarSugerido,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

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
