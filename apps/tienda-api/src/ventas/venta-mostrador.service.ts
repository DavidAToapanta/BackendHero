import { InventarioLotesService } from '@app/inventario';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ACCIONES_AUDITORIA } from '../auditoria/auditoria-escritura';
import { CajaService } from '../caja/caja.service';
import { CuentasService } from '../cartera/cuentas.service';
import { CatalogoService } from '../catalogo/catalogo.service';
import { ClientesService } from '../clientes/clientes.service';
import { CobrosOperacionService } from '../cobros/cobros-operacion.service';
import { fechaComercial, inicioFechaComercial } from '../comun/fecha-comercial';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import {
  desglosarIva,
  tarifaIvaVigente,
  totalesConIva,
} from '../comun/iva-tienda';
import {
  importeTienda,
  type ContextoOperacionTienda,
} from '../comun/operacion-tienda';
import type {
  CreateVentaCreditoDto,
  CreateVentaDto,
} from './dto/create-venta.dto';

@Injectable()
export class VentaMostradorService {
  constructor(
    private readonly idempotencia: IdempotenciaService,
    private readonly caja: CajaService,
    private readonly clientes: ClientesService,
    private readonly catalogo: CatalogoService,
    private readonly inventario: InventarioLotesService,
    private readonly cobros: CobrosOperacionService,
    private readonly cuentas: CuentasService,
  ) {}

  confirmar(
    contexto: ContextoOperacionTienda,
    datos: CreateVentaDto | CreateVentaCreditoDto,
    clave: string | undefined,
    correlacionId: string,
  ) {
    const { tenantId, usuarioId, membresiaId } = contexto;
    const { turnoId, clienteComercialId, pago } = datos;
    const credito = 'vencimiento' in datos ? datos : null;
    const vencimiento = credito
      ? inicioFechaComercial(credito.vencimiento)
      : null;
    const lineas = datos.lineas
      .map(({ productoId, cantidad, lotes }) => ({
        productoId,
        cantidad,
        ...(lotes && {
          lotes: lotes
            .map(({ loteId, cantidad }) => ({ loteId, cantidad }))
            .sort((a, b) => a.loteId - b.loteId),
        }),
      }))
      .sort((a, b) => a.productoId - b.productoId);
    const productos = lineas.map(({ productoId }) => productoId);
    if (new Set(productos).size !== lineas.length) {
      throw new BadRequestException('Cada producto debe aparecer una sola vez');
    }
    const pagado = importeTienda(
      new Prisma.Decimal(pago?.monto ?? 0).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_DOWN,
      ),
      true,
    );
    const referencia = pago?.referencia?.trim() || null;

    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: credito ? 'ventas.credito' : 'ventas.contado',
        datos: {
          turnoId,
          clienteComercialId: clienteComercialId ?? null,
          lineas,
          pago: pago
            ? { metodo: pago.metodo, monto: pagado.toFixed(2), referencia }
            : null,
          ...(credito && { vencimiento: credito.vencimiento }),
        },
      },
      async (tx, claveRecurso) => {
        if (credito && credito.vencimiento < fechaComercial(new Date())) {
          throw new BadRequestException(
            'El vencimiento debe ser hoy o una fecha futura',
          );
        }
        await this.caja.bloquearTurnoAbierto(tx, contexto, turnoId);
        if (clienteComercialId != null) {
          await this.clientes.obtenerActivo(tx, tenantId, clienteComercialId);
        }
        const seleccion = await this.inventario.validarSeleccionVenta(
          tx,
          tenantId,
          lineas,
        );
        const cero = new Prisma.Decimal(0);
        const tasa =
          (await tarifaIvaVigente(tx, tenantId, new Date()))?.porcentaje ??
          cero;
        const fichas = await this.catalogo.obtenerSnapshotsVenta(
          tx,
          tenantId,
          productos,
          tasa,
        );
        const detalles = seleccion.map((linea, indice) => {
          const ficha = fichas[indice];
          const importes = desglosarIva(
            ficha.precioUnitario,
            linea.cantidad,
            ficha.tasaImpuesto ?? cero,
            ficha.unidadVenta,
          );
          return { ficha, linea, importes };
        });
        const totales = totalesConIva(detalles.map(({ importes }) => importes));
        const { total } = totales;
        const financiado = total.minus(pagado);
        if (credito && financiado.lte(0)) {
          throw new BadRequestException(
            'El pago inicial debe ser menor al total de la venta',
          );
        }
        if (!credito && !financiado.isZero()) {
          throw new BadRequestException(
            'El cobro debe coincidir con el total de la venta',
          );
        }

        const venta = await tx.venta.create({
          data: {
            tenantId,
            origen: 'CAJA',
            responsableId: membresiaId,
            clienteComercialId,
            ...totales,
            claveIdempotencia: claveRecurso,
          },
        });
        const creados = await tx.detalleVenta.createManyAndReturn({
          data: detalles.map(({ ficha, linea, importes }) => ({
            ...ficha,
            tenantId,
            ventaId: venta.id,
            cantidad: linea.cantidad,
            ...importes,
          })),
          select: { id: true, productoId: true },
        });
        const detallesPorProducto = new Map(
          creados.map((detalle) => [detalle.productoId, detalle.id]),
        );
        await tx.asignacionLoteVenta.createMany({
          data: seleccion.flatMap((linea) =>
            linea.lotes.map((lote) => ({
              ...lote,
              tenantId,
              ventaId: venta.id,
              detalleVentaId: detallesPorProducto.get(linea.productoId)!,
              productoId: linea.productoId,
            })),
          ),
        });
        await this.inventario.retirarLineasVenta(
          tx,
          {
            tenantId,
            responsableId: membresiaId,
            clave: claveRecurso,
            correlacionId,
          },
          creados.map(({ id }) => id),
        );
        if (pago && !pagado.isZero()) {
          const cobro = await this.cobros.registrar(tx, contexto, {
            metodo: pago.metodo,
            monto: pagado,
            referencia,
            turnoId,
            clienteComercialId,
            claveRecurso,
          });
          await this.cobros.aplicar(tx, contexto, {
            cobroId: cobro.id,
            ventaId: venta.id,
            monto: pagado,
            claveRecurso,
          });
        }
        if (credito && vencimiento) {
          await this.cuentas.crear(tx, {
            tenantId,
            ventaId: venta.id,
            clienteComercialId: credito.clienteComercialId,
            vencimiento,
            financiado,
          });
        }
        await contexto.auditar(tx, {
          accion: ACCIONES_AUDITORIA.VENTAS_REGISTRAR,
          recursoTipo: 'Venta',
          recursoId: venta.id,
          productos,
          ...(credito && {
            datos: {
              modalidad: 'CREDITO',
              pagoInicial: pagado.toFixed(2),
              financiado: financiado.toFixed(2),
              vencimiento: credito.vencimiento,
            },
          }),
        });
        return { recursoTipo: 'Venta', recursoId: venta.id };
      },
    );
  }
}
