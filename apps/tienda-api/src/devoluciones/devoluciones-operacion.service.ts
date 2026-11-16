import {
  InventarioLotesService,
  type ResultadoDevolucionInventario,
} from '@app/inventario';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  DestinoDevolucionVenta,
  MetodoCobro,
  Prisma,
  Venta,
} from '@prisma/client';
import { ACCIONES_AUDITORIA } from '../auditoria/auditoria-escritura';
import { CajaService } from '../caja/caja.service';
import { CuentasService } from '../cartera/cuentas.service';
import { CobrosOperacionService } from '../cobros/cobros-operacion.service';
import { CorreccionesCobroService } from '../cobros/correcciones-cobro.service';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import {
  ContextoOperacionTienda,
  importeTienda,
  textoObligatorio,
} from '../comun/operacion-tienda';

interface LineaDevuelta {
  asignacionVentaId: number;
  cantidad: number;
  destino: DestinoDevolucionVenta;
}

interface MedioReembolso {
  metodo: MetodoCobro;
  referencia?: string;
}

interface LiberacionCobro {
  aplicacionId: number;
  monto: string;
  reembolso?: MedioReembolso;
}

interface DatosCorreccionVenta {
  ventaId: number;
  motivo: string;
  turnos?: { reembolso: number };
  lineas: LineaDevuelta[];
  liberar: LiberacionCobro[];
}

@Injectable()
export class DevolucionesOperacionService {
  constructor(
    private readonly idempotencia: IdempotenciaService,
    private readonly caja: CajaService,
    private readonly cobros: CobrosOperacionService,
    private readonly correcciones: CorreccionesCobroService,
    private readonly cuentas: CuentasService,
    private readonly inventario: InventarioLotesService,
  ) {}

  devolver(
    contexto: ContextoOperacionTienda,
    datos: DatosCorreccionVenta,
    clave: string | undefined,
    correlacionId: string,
  ) {
    const { tenantId, usuarioId } = contexto;
    const { ventaId } = datos;
    const motivo = textoObligatorio(datos.motivo, 'Motivo');
    const turnoId = datos.turnos?.reembolso ?? null;
    const lineas = [...datos.lineas].sort(
      (a, b) => a.asignacionVentaId - b.asignacionVentaId,
    );
    const liberar = datos.liberar
      .map(({ aplicacionId, monto, reembolso }) => ({
        aplicacionId,
        monto: importeTienda(monto),
        metodo: reembolso?.metodo ?? null,
        referencia: reembolso?.referencia?.trim() || null,
      }))
      .sort((a, b) => a.aplicacionId - b.aplicacionId);
    if (
      !lineas.length ||
      lineas.length > 100 ||
      liberar.length > 100 ||
      lineas.some(
        ({ cantidad }) => !Number.isInteger(cantidad) || cantidad <= 0,
      ) ||
      new Set(lineas.map(({ asignacionVentaId }) => asignacionVentaId)).size !==
        lineas.length ||
      new Set(liberar.map(({ aplicacionId }) => aplicacionId)).size !==
        liberar.length
    ) {
      throw new BadRequestException(
        'Líneas o aplicaciones de la corrección inválidas',
      );
    }
    if (
      (turnoId !== null) !==
      liberar.some(({ metodo }) => metodo === 'EFECTIVO')
    ) {
      throw new BadRequestException(
        'El turno corresponde a reembolsos en efectivo',
      );
    }
    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'devoluciones.aprobar',
        datos: {
          ventaId,
          motivo,
          turnoId,
          lineas: lineas.map(({ asignacionVentaId, cantidad, destino }) => ({
            asignacionVentaId,
            cantidad,
            destino,
          })),
          liberar: liberar.map((item) => ({
            ...item,
            monto: item.monto.toFixed(2),
          })),
        },
      },
      async (tx, claveRecurso) => {
        if (turnoId !== null)
          await this.caja.bloquearTurnoAbierto(tx, contexto, turnoId);
        const criterioAplicacion = {
          tenantId,
          ventaId,
          reversionAplicacionCobro_aplicacion: { none: {} },
          cobro: { estado: 'CONFIRMADO' as const },
        };
        const previas = await tx.aplicacionCobro.findMany({
          where: criterioAplicacion,
          select: { cobroId: true },
        });
        const idsCobros = [
          ...new Set(previas.map(({ cobroId }) => cobroId)),
        ].sort((a, b) => a - b);
        for (const cobroId of idsCobros)
          await this.cobros.bloquearCobro(tx, tenantId, cobroId);
        await this.inventario.bloquearVentaParaDevolucion(
          tx,
          tenantId,
          ventaId,
        );
        const venta = await tx.venta.findUniqueOrThrow({
          where: { tenantId_id: { tenantId, id: ventaId } },
        });
        if (venta.estado !== 'COMPLETADA')
          throw new ConflictException('La venta está anulada');
        const aplicaciones = await tx.aplicacionCobro.findMany({
          where: criterioAplicacion,
        });
        if (aplicaciones.some(({ cobroId }) => !idsCobros.includes(cobroId))) {
          throw new ConflictException(
            'Cambió el saldo de la venta; revise el reparto y reintente',
          );
        }

        const cuentaVista = await tx.cuentaPorCobrar.findUnique({
          where: { tenantId_ventaId: { tenantId, ventaId } },
          select: { id: true },
        });
        const cuenta = cuentaVista
          ? await this.cuentas.bloquear(tx, tenantId, cuentaVista.id)
          : null;
        const detalles = await this.prepararLineas(tx, venta, lineas);
        const sumar = (
          campo: 'subtotal' | 'descuento' | 'impuesto' | 'total',
        ) =>
          detalles.reduce(
            (total, item) => total.plus(item[campo]),
            new Prisma.Decimal(0),
          );
        const totalDevuelto = sumar('total');

        const porId = new Map(
          aplicaciones.map((aplicacion) => [aplicacion.id, aplicacion]),
        );
        let totalLiberado = new Prisma.Decimal(0);
        let inicialLiberado = new Prisma.Decimal(0);
        for (const item of liberar) {
          const aplicada = porId.get(item.aplicacionId);
          if (!aplicada || item.monto.gt(aplicada.monto)) {
            throw new ConflictException(
              'El importe a liberar supera la aplicación disponible',
            );
          }
          if (!item.metodo && venta.clienteComercialId === null) {
            throw new BadRequestException(
              'El dinero liberado de una venta anónima debe ser devuelto',
            );
          }
          totalLiberado = totalLiberado.plus(item.monto);
          if (aplicada.cuentaId === null)
            inicialLiberado = inicialLiberado.plus(item.monto);
        }

        const reduccionSaldo = totalDevuelto.minus(totalLiberado);
        if (reduccionSaldo.lt(0) || reduccionSaldo.gt(cuenta?.saldo ?? 0)) {
          throw new ConflictException(
            'El reparto entre deuda y cobros no concilia con la corrección',
          );
        }

        const devolucion = await tx.devolucionVenta.create({
          data: {
            tenantId,
            ventaId,
            responsableId: contexto.membresiaId,
            aprobadaPorId: contexto.membresiaId,
            aprobadaAt: new Date(),
            estado: 'APROBADA',
            motivo,
            subtotal: sumar('subtotal'),
            descuento: sumar('descuento'),
            impuesto: sumar('impuesto'),
            total: totalDevuelto,
            claveIdempotencia: claveRecurso,
          },
        });
        const movimientos: ResultadoDevolucionInventario[] = [];
        detalles.sort(
          (a, b) =>
            a.productoId - b.productoId ||
            a.asignacionVentaId - b.asignacionVentaId,
        );
        for (const detalle of detalles) {
          const fila = await tx.detalleDevolucionVenta.create({
            data: { ...detalle, tenantId, devolucionId: devolucion.id },
          });
          const retorno = await this.inventario.aplicarDevolucion(
            tx,
            {
              tenantId,
              responsableId: contexto.membresiaId,
              clave: claveRecurso,
              correlacionId,
            },
            fila.id,
          );
          movimientos.push(retorno);
        }

        for (const item of liberar) {
          const sufijo = claveRecurso + ':' + item.aplicacionId;
          const { aplicacion } = await this.correcciones.revertirAplicacion(
            tx,
            contexto,
            item.aplicacionId,
            motivo,
            sufijo,
          );
          const restante = aplicacion.monto.minus(item.monto);
          if (!restante.isZero()) {
            const nueva = await tx.aplicacionCobro.create({
              data: {
                tenantId,
                ventaId,
                cobroId: aplicacion.cobroId,
                cuentaId: aplicacion.cuentaId,
                clienteComercialId: aplicacion.clienteComercialId,
                responsableId: contexto.membresiaId,
                monto: restante,
                claveIdempotencia: sufijo,
              },
            });
            await contexto.auditar(tx, {
              accion: ACCIONES_AUDITORIA.COBROS_REAPLICAR,
              recursoTipo: 'AplicacionCobro',
              recursoId: nueva.id,
              motivo,
            });
          }
          if (item.metodo)
            await this.correcciones.confirmarReembolso(tx, contexto, {
              aplicacionId: aplicacion.id,
              monto: item.monto,
              metodo: item.metodo,
              motivo,
              turnoId: item.metodo === 'EFECTIVO' ? turnoId : null,
              referencia: item.referencia,
              devolucionId: devolucion.id,
              claveRecurso: sufijo,
            });
        }

        if (cuenta) {
          const deltaImporte = inicialLiberado.minus(totalDevuelto);
          const saldo = cuenta.saldo.minus(reduccionSaldo);
          if (!deltaImporte.isZero()) {
            await tx.ajusteCuentaPorCobrar.create({
              data: {
                tenantId,
                cuentaId: cuenta.id,
                ventaId,
                tipo: 'DEVOLUCION',
                devolucionId: devolucion.id,
                deltaImporte,
                responsableId: contexto.membresiaId,
                motivo,
                claveIdempotencia: claveRecurso,
              },
            });
          }
          await tx.cuentaPorCobrar.update({
            where: { tenantId_id: { tenantId, id: cuenta.id } },
            data: {
              importeExigible: cuenta.importeExigible.plus(deltaImporte),
              saldo,
              estado: saldo.isZero() ? 'PAGADA' : 'ABIERTA',
            },
          });
        }

        const resultado = {
          recursoTipo: 'DevolucionVenta',
          recursoId: devolucion.id,
        };
        await contexto.auditar(tx, {
          accion: ACCIONES_AUDITORIA.DEVOLUCIONES_APROBAR,
          ...resultado,
          motivo,
          productos: [...new Set(detalles.map(({ productoId }) => productoId))],
          datos: { movimientos },
        });
        return resultado;
      },
    );
  }

  private async prepararLineas(
    tx: Prisma.TransactionClient,
    venta: Venta,
    lineas: LineaDevuelta[],
  ) {
    if (!lineas.length) return [];
    const { id: ventaId, tenantId } = venta;
    const asignaciones = await tx.asignacionLoteVenta.findMany({
      where: {
        tenantId,
        ventaId,
        id: { in: lineas.map(({ asignacionVentaId }) => asignacionVentaId) },
      },
      include: { detalleVenta: true },
    });
    const porId = new Map(asignaciones.map((fila) => [fila.id, fila]));
    const criterio = {
      tenantId,
      ventaId,
      devolucion: { estado: 'APROBADA' as const },
    };
    const anterioresPorAsignacion = await tx.detalleDevolucionVenta.groupBy({
      by: ['asignacionVentaId'],
      where: criterio,
      _sum: { cantidad: true },
    });
    const anterioresPorDetalle = await tx.detalleDevolucionVenta.groupBy({
      by: ['detalleVentaId'],
      where: criterio,
      _sum: { cantidad: true, descuento: true, impuesto: true },
    });
    const cantidadesPorAsignacion = new Map(
      anterioresPorAsignacion.map((fila) => [
        fila.asignacionVentaId,
        fila._sum.cantidad ?? 0,
      ]),
    );
    const acumulados = new Map(
      anterioresPorDetalle.map(({ detalleVentaId, _sum }) => [
        detalleVentaId,
        {
          cantidad: _sum.cantidad ?? 0,
          descuento: _sum.descuento ?? new Prisma.Decimal(0),
          impuesto: _sum.impuesto ?? new Prisma.Decimal(0),
        },
      ]),
    );
    return lineas.map((linea) => {
      const asignacion = porId.get(linea.asignacionVentaId);
      if (
        !asignacion ||
        (cantidadesPorAsignacion.get(asignacion.id) ?? 0) + linea.cantidad >
          asignacion.cantidad
      ) {
        throw new ConflictException(
          'La cantidad excede las unidades de la asignación disponibles para devolución',
        );
      }
      const detalle = asignacion.detalleVenta;
      const anterior = acumulados.get(detalle.id) ?? {
        cantidad: 0,
        descuento: new Prisma.Decimal(0),
        impuesto: new Prisma.Decimal(0),
      };
      const restantes = detalle.cantidad - anterior.cantidad;
      if (linea.cantidad > restantes)
        throw new ConflictException('La cantidad supera el detalle de venta');
      const prorratear = (original: Prisma.Decimal, devuelto: Prisma.Decimal) =>
        original
          .minus(devuelto)
          .times(linea.cantidad)
          .div(restantes)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const subtotal = detalle.precioUnitario.times(linea.cantidad);
      const descuento = prorratear(detalle.descuento, anterior.descuento);
      const impuesto = prorratear(detalle.impuesto, anterior.impuesto);
      if (descuento.gt(subtotal) || descuento.lt(0) || impuesto.lt(0))
        throw new ConflictException(
          'Los importes históricos de devolución no concilian',
        );
      acumulados.set(detalle.id, {
        cantidad: anterior.cantidad + linea.cantidad,
        descuento: anterior.descuento.plus(descuento),
        impuesto: anterior.impuesto.plus(impuesto),
      });
      return {
        ...linea,
        ventaId,
        detalleVentaId: detalle.id,
        productoId: asignacion.productoId,
        loteId: asignacion.loteId,
        costoUnitario: asignacion.costoUnitario,
        costoTotal: asignacion.costoUnitario.times(linea.cantidad),
        subtotal,
        descuento,
        impuesto,
        total: subtotal.minus(descuento).plus(impuesto),
      };
    });
  }
}
