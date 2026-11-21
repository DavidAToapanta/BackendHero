import {
  InventarioLotesService,
  type ResultadoDevolucionInventario,
} from '@app/inventario';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { MetodoCobro, Prisma } from '@prisma/client';
import {
  CalculoDevolucionesService,
  type LineaDevuelta,
} from './calculo-devoluciones.service';
import { ACCIONES_AUDITORIA } from '../auditoria/auditoria-escritura';
import { CajaService } from '../caja/caja.service';
import { CuentasService } from '../cartera/cuentas.service';
import { CobrosOperacionService } from '../cobros/cobros-operacion.service';
import { CorreccionesCobroService } from '../cobros/correcciones-cobro.service';
import { AnulacionComprobanteService } from '../comprobantes/anulacion-comprobante.service';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import {
  ContextoOperacionTienda,
  importeTienda,
  textoObligatorio,
} from '../comun/operacion-tienda';

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
    private readonly comprobantes: AnulacionComprobanteService,
    private readonly prisma: PrismaService,
    private readonly calculo: CalculoDevolucionesService,
  ) {}

  devolver(
    contexto: ContextoOperacionTienda,
    datos: DatosCorreccionVenta,
    clave: string | undefined,
    correlacionId: string,
  ) {
    return this.procesar(contexto, datos, clave, correlacionId, false);
  }

  async anular(
    contexto: ContextoOperacionTienda,
    datos: DatosCorreccionVenta,
    clave: string | undefined,
    correlacionId: string,
  ) {
    const resultado = await this.procesar(
      contexto,
      datos,
      clave,
      correlacionId,
      true,
    );
    const evento = await this.prisma.auditoriaOperacion.findFirstOrThrow({
      where: {
        tenantId: contexto.tenantId,
        accion: ACCIONES_AUDITORIA.VENTAS_ANULAR,
        entidadTipo: 'Venta',
        entidadId: resultado.recursoId,
      },
      orderBy: { id: 'desc' },
      select: { datos: true },
    });
    return { ...resultado, efectos: evento.datos };
  }

  private procesar(
    contexto: ContextoOperacionTienda,
    datos: DatosCorreccionVenta,
    clave: string | undefined,
    correlacionId: string,
    anular: boolean,
  ) {
    const { tenantId, usuarioId } = contexto;
    const { ventaId } = datos;
    const motivo = textoObligatorio(datos.motivo, 'Motivo');
    const turnoId = datos.turnos?.reembolso ?? null;
    const lineas = this.calculo.ordenarLineas(datos.lineas, anular);
    const liberar = datos.liberar
      .map(({ aplicacionId, monto, reembolso }) => ({
        aplicacionId,
        monto: importeTienda(monto),
        metodo: reembolso?.metodo ?? null,
        referencia: reembolso?.referencia?.trim() || null,
      }))
      .sort((a, b) => a.aplicacionId - b.aplicacionId);
    if (
      (!anular && liberar.length > 100) ||
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
        operacion: anular ? 'ventas.anular' : 'devoluciones.aprobar',
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
        const {
          detalles,
          subtotal,
          descuento,
          impuesto,
          total: totalDevuelto,
        } = await this.calculo.calcular(tx, venta, lineas);

        const porId = new Map(
          aplicaciones.map((aplicacion) => [aplicacion.id, aplicacion]),
        );
        let totalLiberado = new Prisma.Decimal(0);
        let inicialLiberado = new Prisma.Decimal(0);
        for (const item of liberar) {
          const aplicada = porId.get(item.aplicacionId);
          if (
            !aplicada ||
            item.monto.gt(aplicada.monto) ||
            (anular && !item.monto.eq(aplicada.monto))
          ) {
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
        if (
          anular
            ? liberar.length !== aplicaciones.length
            : reduccionSaldo.lt(0) || reduccionSaldo.gt(cuenta?.saldo ?? 0)
        ) {
          throw new ConflictException(
            'El reparto entre deuda y cobros no concilia con la corrección',
          );
        }

        const devolucion = detalles.length
          ? await tx.devolucionVenta.create({
              data: {
                tenantId,
                ventaId,
                responsableId: contexto.membresiaId,
                aprobadaPorId: contexto.membresiaId,
                aprobadaAt: new Date(),
                estado: 'APROBADA',
                motivo,
                subtotal,
                descuento,
                impuesto,
                total: totalDevuelto,
                claveIdempotencia: claveRecurso,
              },
            })
          : null;
        const movimientos: ResultadoDevolucionInventario[] = [];
        if (devolucion) {
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
        }

        const reembolsos: number[] = [];
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
          if (item.metodo) {
            const reembolso = await this.correcciones.confirmarReembolso(
              tx,
              contexto,
              {
                aplicacionId: aplicacion.id,
                monto: item.monto,
                metodo: item.metodo,
                motivo,
                turnoId: item.metodo === 'EFECTIVO' ? turnoId : null,
                referencia: item.referencia,
                devolucionId: devolucion?.id,
                claveRecurso: sufijo,
              },
            );
            reembolsos.push(reembolso.id);
          }
        }

        if (cuenta) {
          const deltaImporte = anular
            ? cuenta.importeExigible.negated()
            : inicialLiberado.minus(totalDevuelto);
          const saldo = anular
            ? new Prisma.Decimal(0)
            : cuenta.saldo.minus(reduccionSaldo);
          if (!deltaImporte.isZero()) {
            await tx.ajusteCuentaPorCobrar.create({
              data: {
                tenantId,
                cuentaId: cuenta.id,
                ventaId,
                tipo: anular ? 'ANULACION' : 'DEVOLUCION',
                devolucionId: anular ? undefined : devolucion?.id,
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
              estado: anular
                ? 'CANCELADA'
                : saldo.isZero()
                  ? 'PAGADA'
                  : 'ABIERTA',
            },
          });
        }

        if (anular) {
          const anuladaAt = new Date();
          await tx.venta.update({
            where: { tenantId_id: { tenantId, id: ventaId } },
            data: {
              estado: 'ANULADA',
              motivoAnulacion: motivo,
              anuladaAt,
              anuladaPorId: contexto.membresiaId,
            },
          });
          const comprobanteId = await this.comprobantes.anularDeVenta(
            tx,
            contexto,
            ventaId,
            motivo,
            anuladaAt,
          );
          const resultado = { recursoTipo: 'Venta', recursoId: ventaId };
          await contexto.auditar(tx, {
            accion: ACCIONES_AUDITORIA.VENTAS_ANULAR,
            ...resultado,
            motivo,
            productos: [
              ...new Set(detalles.map(({ productoId }) => productoId)),
            ],
            datos: {
              cuentaCanceladaId: cuenta?.id ?? null,
              saldoCancelado: cuenta?.saldo.toFixed(2) ?? '0.00',
              devolucionId: devolucion?.id ?? null,
              comprobanteId,
              movimientos,
              reembolsos,
              saldoLiberadoSinReembolso: liberar
                .filter(({ metodo }) => metodo === null)
                .reduce(
                  (suma, item) => suma.plus(item.monto),
                  new Prisma.Decimal(0),
                )
                .toFixed(2),
            },
          });
          return resultado;
        }
        const resultado = {
          recursoTipo: 'DevolucionVenta',
          recursoId: devolucion!.id,
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
}
