import {
  InventarioLotesService,
  type LineaSalidaValidada,
} from '@app/inventario';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ACCIONES_AUDITORIA } from '../auditoria/auditoria-escritura';
import { CajaService } from '../caja/caja.service';
import { CatalogoService } from '../catalogo/catalogo.service';
import { ClientesService } from '../clientes/clientes.service';
import { CobrosOperacionService } from '../cobros/cobros-operacion.service';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import {
  importeTienda,
  type ContextoOperacionTienda,
} from '../comun/operacion-tienda';
import type { CreateVentaDto } from './dto/create-venta.dto';

@Injectable()
export class VentaMostradorService {
  constructor(
    private readonly idempotencia: IdempotenciaService,
    private readonly caja: CajaService,
    private readonly clientes: ClientesService,
    private readonly catalogo: CatalogoService,
    private readonly inventario: InventarioLotesService,
    private readonly cobros: CobrosOperacionService,
  ) {}

  confirmar(
    contexto: ContextoOperacionTienda,
    datos: CreateVentaDto,
    clave: string | undefined,
    correlacionId: string,
  ) {
    const { tenantId, usuarioId, membresiaId } = contexto;
    const { turnoId, clienteComercialId, pago } = datos;
    const lineas = datos.lineas
      .map(({ productoId, cantidad, lotes }) => ({
        productoId,
        cantidad,
        lotes: lotes
          .map(({ loteId, cantidad }) => ({ loteId, cantidad }))
          .sort((a, b) => a.loteId - b.loteId),
      }))
      .sort((a, b) => a.productoId - b.productoId);
    const productos = lineas.map(({ productoId }) => productoId);
    if (new Set(productos).size !== lineas.length) {
      throw new BadRequestException('Cada producto debe aparecer una sola vez');
    }
    const pagado = importeTienda(
      new Prisma.Decimal(pago.monto).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_DOWN,
      ),
      true,
    );
    const referencia = pago.referencia?.trim() || null;

    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'ventas.contado',
        datos: {
          turnoId,
          clienteComercialId: clienteComercialId ?? null,
          lineas,
          pago: { metodo: pago.metodo, monto: pagado.toFixed(2), referencia },
        },
      },
      async (tx, claveRecurso) => {
        await this.caja.bloquearTurnoAbierto(tx, contexto, turnoId);
        if (clienteComercialId != null) {
          await this.clientes.obtenerActivo(tx, tenantId, clienteComercialId);
        }
        const seleccion = await this.inventario.validarSeleccionVenta(
          tx,
          tenantId,
          lineas,
        );
        const detalles: {
          ficha: Awaited<ReturnType<CatalogoService['obtenerSnapshotVenta']>>;
          linea: LineaSalidaValidada;
          subtotal: Prisma.Decimal;
        }[] = [];
        for (const linea of seleccion) {
          const ficha = await this.catalogo.obtenerSnapshotVenta(
            tx,
            tenantId,
            linea.productoId,
          );
          const subtotal = importeTienda(
            ficha.precioUnitario
              .times(linea.cantidad)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
            true,
          );
          detalles.push({ ficha, linea, subtotal });
        }
        const total = importeTienda(
          detalles.reduce(
            (suma, detalle) => suma.plus(detalle.subtotal),
            new Prisma.Decimal(0),
          ),
          true,
        );
        if (!pagado.eq(total)) {
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
            subtotal: total,
            total,
            claveIdempotencia: claveRecurso,
          },
        });
        for (const { ficha, linea, subtotal } of detalles) {
          const detalle = await tx.detalleVenta.create({
            data: {
              ...ficha,
              tenantId,
              ventaId: venta.id,
              cantidad: linea.cantidad,
              subtotal,
              total: subtotal,
            },
          });
          await tx.asignacionLoteVenta.createMany({
            data: linea.lotes.map((lote) => ({
              ...lote,
              tenantId,
              ventaId: venta.id,
              detalleVentaId: detalle.id,
              productoId: linea.productoId,
            })),
          });
          await this.inventario.retirarVenta(
            tx,
            {
              tenantId,
              responsableId: membresiaId,
              clave: claveRecurso,
              correlacionId,
            },
            detalle.id,
          );
        }
        if (!total.isZero()) {
          const cobro = await this.cobros.registrar(tx, contexto, {
            metodo: pago.metodo,
            monto: total,
            referencia,
            turnoId,
            clienteComercialId,
            claveRecurso,
          });
          await this.cobros.aplicar(tx, contexto, {
            cobroId: cobro.id,
            ventaId: venta.id,
            monto: total,
            claveRecurso,
          });
        }
        await contexto.auditar(tx, {
          accion: ACCIONES_AUDITORIA.VENTAS_REGISTRAR,
          recursoTipo: 'Venta',
          recursoId: venta.id,
          productos,
        });
        return { recursoTipo: 'Venta', recursoId: venta.id };
      },
    );
  }
}
