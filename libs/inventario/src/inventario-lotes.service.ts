import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  LoteInventario,
  ModoInventario,
  Prisma,
  EstadoVenta,
  TipoMovimientoInventario,
} from '@prisma/client';
import { InventarioService, ProductoInventario } from './inventario.service';
import type {
  LoteEntrada,
  OperacionInventario,
  SeleccionLote,
} from './inventario.types';

type OrigenSalida =
  | { compraLegacyId: number }
  | { asignacionVentaId: number; reservaId?: number };

@Injectable()
export class InventarioLotesService {
  constructor(private readonly inventario: InventarioService) {}

  async registrarEntrada(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    productoId: number,
    tipo: 'APERTURA' | 'ENTRADA',
    motivo: string,
    lotes: LoteEntrada[],
  ) {
    const { tenantId } = operacion;
    const producto = await this.inventario.bloquearProducto(
      tx,
      tenantId,
      productoId,
    );
    const apertura = tipo === 'APERTURA';
    if (apertura !== (producto.modoInventario === ModoInventario.LEGACY)) {
      throw new ConflictException(
        'La operación no corresponde al modo de inventario',
      );
    }
    if (
      !motivo.trim() ||
      lotes.some(
        (lote) =>
          !lote.codigo.trim() ||
          !Number.isInteger(lote.cantidad) ||
          lote.cantidad <= 0 ||
          !lote.costoUnitario.isFinite() ||
          lote.costoUnitario.isNegative() ||
          lote.costoUnitario.decimalPlaces() > 4 ||
          (lote.vencimiento !== undefined &&
            !Number.isFinite(lote.vencimiento.getTime())),
      )
    ) {
      throw new BadRequestException(
        'Motivo, cantidades o datos de lote inválidos',
      );
    }
    const total = lotes.reduce((cantidad, lote) => cantidad + lote.cantidad, 0);
    if (
      apertura &&
      (producto.stock !== total || producto.stockReservado !== 0)
    ) {
      throw new ConflictException(
        'Los lotes de apertura deben conciliar con el stock actual',
      );
    }
    if (!apertura && total === 0) {
      throw new BadRequestException('La entrada debe incluir al menos un lote');
    }

    const entrada = await tx.entradaInventario.create({
      data: {
        tenantId,
        responsableId: operacion.responsableId,
        motivo: motivo.trim(),
        claveIdempotencia: operacion.clave,
      },
    });
    const creados: LoteInventario[] = [];
    for (const lote of lotes) {
      const creado = await tx.loteInventario.create({
        data: {
          tenantId,
          productoId,
          entradaId: entrada.id,
          codigo: lote.codigo.trim(),
          cantidadFisica: lote.cantidad,
          costoUnitario: lote.costoUnitario,
          vencimiento: lote.vencimiento,
          esApertura: apertura,
        },
      });
      await this.registrarMovimiento(
        tx,
        operacion,
        {
          tipo: apertura
            ? TipoMovimientoInventario.APERTURA
            : TipoMovimientoInventario.ENTRADA,
          productoId,
          loteId: creado.id,
          entradaId: entrada.id,
          deltaFisico: lote.cantidad,
          deltaReservado: 0,
          costoUnitario: lote.costoUnitario,
          costoTotal: lote.costoUnitario.mul(lote.cantidad),
        },
        `lote:${creado.id}`,
      );
      creados.push(creado);
    }

    await tx.producto.update({
      where: { tenantId_id: { tenantId, id: productoId } },
      data: apertura
        ? { modoInventario: ModoInventario.LOTES }
        : { stock: { increment: total } },
    });
    return { entrada, lotes: creados };
  }

  async retirarCompra(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    compra: { id: number; productoId: number; cantidad: number },
    lotes: SeleccionLote[],
  ) {
    const producto = await this.inventario.bloquearProducto(
      tx,
      operacion.tenantId,
      compra.productoId,
    );
    if (
      !lotes.length ||
      new Set(lotes.map(({ loteId }) => loteId)).size !== lotes.length ||
      lotes.reduce((total, { cantidad }) => total + cantidad, 0) !==
        compra.cantidad
    ) {
      throw new BadRequestException(
        'Selecciona lotes distintos por la cantidad total comprada',
      );
    }
    const ahora = new Date();
    await this.validarDisponible(tx, producto, compra.cantidad, ahora);
    for (const lote of lotes) {
      await this.retirarLote(
        tx,
        operacion,
        producto.id,
        lote,
        { compraLegacyId: compra.id },
        ahora,
      );
    }
    await this.descontarSaldos(tx, producto, compra.cantidad, 0);
  }

  async retirarVenta(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    detalleVentaId: number,
  ) {
    const { tenantId } = operacion;
    const detalle = await tx.detalleVenta.findUnique({
      where: { tenantId_id: { tenantId, id: detalleVentaId } },
      select: {
        productoId: true,
        cantidad: true,
        venta: { select: { estado: true, pedidoId: true } },
        asignacionLoteVenta_detalleVenta: true,
      },
    });
    if (
      !detalle ||
      detalle.venta.estado !== EstadoVenta.COMPLETADA ||
      detalle.venta.pedidoId !== null
    ) {
      throw new ConflictException(
        'La salida requiere una venta de mostrador completada',
      );
    }
    const producto = await this.inventario.bloquearProducto(
      tx,
      tenantId,
      detalle.productoId,
    );
    const asignaciones = detalle.asignacionLoteVenta_detalleVenta;
    if (
      asignaciones.reduce((total, lote) => total + lote.cantidad, 0) !==
      detalle.cantidad
    ) {
      throw new ConflictException(
        'Los lotes asignados deben cubrir la cantidad vendida',
      );
    }
    const ahora = new Date();
    await this.validarDisponible(tx, producto, detalle.cantidad, ahora);
    for (const asignacion of asignaciones) {
      await this.retirarLote(
        tx,
        operacion,
        producto.id,
        asignacion,
        {
          asignacionVentaId: asignacion.id,
        },
        ahora,
      );
    }
    await this.descontarSaldos(tx, producto, detalle.cantidad, 0);
  }

  async ajustarLote(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    productoId: number,
    loteId: number,
    delta: number,
    motivo: string,
  ) {
    if (!Number.isInteger(delta) || !delta || !motivo.trim()) {
      throw new BadRequestException(
        'El ajuste exige un cambio entero y un motivo',
      );
    }
    const { tenantId } = operacion;
    const producto = await this.inventario.bloquearProducto(
      tx,
      tenantId,
      productoId,
    );
    if (producto.modoInventario !== ModoInventario.LOTES) {
      throw new ConflictException('El ajuste requiere inventario por lotes');
    }
    const where = {
      tenantId_id_productoId: { tenantId, id: loteId, productoId },
    };
    const lote = await tx.loteInventario.findUnique({ where });
    if (!lote || lote.cantidadFisica + delta < 0) {
      throw new BadRequestException(
        'Lote ajeno al producto o sin stock suficiente',
      );
    }
    const ahora = new Date();
    const apto = lote.vencimiento === null || lote.vencimiento > ahora;
    if (
      producto.stock + delta < producto.stockReservado ||
      (delta < 0 &&
        apto &&
        producto.stockReservado > 0 &&
        (await this.stockApto(tx, producto, ahora)) + delta <
          producto.stockReservado)
    ) {
      throw new ConflictException('El ajuste afectaría unidades reservadas');
    }
    const actualizado = await tx.loteInventario.update({
      where,
      data: { cantidadFisica: { increment: delta } },
    });
    await tx.producto.update({
      where: { tenantId_id: { tenantId, id: productoId } },
      data: { stock: { increment: delta } },
    });
    await this.registrarMovimiento(
      tx,
      operacion,
      {
        tipo: TipoMovimientoInventario.AJUSTE,
        productoId,
        loteId,
        deltaFisico: delta,
        deltaReservado: 0,
        motivo: motivo.trim(),
        costoUnitario: lote.costoUnitario,
        costoTotal: lote.costoUnitario.mul(Math.abs(delta)),
      },
      `lote:${loteId}`,
    );
    return actualizado;
  }

  async validarDisponible(
    tx: Prisma.TransactionClient,
    producto: ProductoInventario,
    cantidad: number,
    ahora: Date,
  ) {
    this.validarProductoActivo(producto);
    const apto = await this.stockApto(tx, producto, ahora);
    if (Math.min(apto, producto.stock) - producto.stockReservado < cantidad) {
      throw new BadRequestException(
        `Stock disponible insuficiente para el producto ${producto.nombre}`,
      );
    }
  }

  private async stockApto(
    tx: Prisma.TransactionClient,
    producto: ProductoInventario,
    ahora: Date,
  ) {
    const { _sum } = await tx.loteInventario.aggregate({
      where: {
        tenantId: producto.tenantId,
        productoId: producto.id,
        OR: [{ vencimiento: null }, { vencimiento: { gt: ahora } }],
      },
      _sum: { cantidadFisica: true },
    });
    return _sum.cantidadFisica ?? 0;
  }

  validarProductoActivo(producto: ProductoInventario) {
    if (producto.modoInventario !== ModoInventario.LOTES || !producto.estado) {
      throw new ConflictException(
        'El producto debe estar activo y operar por lotes',
      );
    }
  }

  async retirarLote(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    productoId: number,
    { loteId, cantidad }: SeleccionLote,
    origen: OrigenSalida,
    ahora: Date,
  ) {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new BadRequestException(
        'La cantidad de lote debe ser un entero positivo',
      );
    }
    const { tenantId } = operacion;
    const lote = await tx.loteInventario.findFirst({
      where: {
        tenantId,
        id: loteId,
        productoId,
        cantidadFisica: { gte: cantidad },
        OR: [{ vencimiento: null }, { vencimiento: { gt: ahora } }],
      },
      select: { costoUnitario: true },
    });
    if (!lote)
      throw new BadRequestException(
        'Lote vencido, ajeno al producto o sin stock suficiente',
      );

    await tx.loteInventario.update({
      where: { tenantId_id_productoId: { tenantId, id: loteId, productoId } },
      data: { cantidadFisica: { decrement: cantidad } },
    });
    const consumeReserva =
      'reservaId' in origen && origen.reservaId !== undefined;
    await this.registrarMovimiento(
      tx,
      operacion,
      {
        ...origen,
        productoId,
        loteId,
        tipo: consumeReserva
          ? TipoMovimientoInventario.CONSUMO_RESERVA
          : TipoMovimientoInventario.VENTA,
        deltaFisico: -cantidad,
        deltaReservado: consumeReserva ? -cantidad : 0,
        costoUnitario: lote.costoUnitario,
        costoTotal: lote.costoUnitario.mul(cantidad),
      },
      `lote:${loteId}`,
    );
  }

  async descontarSaldos(
    tx: Prisma.TransactionClient,
    producto: ProductoInventario,
    fisico: number,
    reservado: number,
  ) {
    await tx.producto.update({
      where: { tenantId_id: { tenantId: producto.tenantId, id: producto.id } },
      data: {
        stock: { decrement: fisico },
        stockReservado: { decrement: reservado },
      },
    });
  }

  registrarMovimiento(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    datos: Omit<
      Prisma.MovimientoInventarioUncheckedCreateInput,
      'tenantId' | 'responsableId' | 'claveIdempotencia' | 'correlacionId'
    >,
    sufijo: string,
  ) {
    return tx.movimientoInventario.create({
      data: {
        ...datos,
        tenantId: operacion.tenantId,
        responsableId: operacion.responsableId,
        correlacionId: operacion.correlacionId,
        claveIdempotencia: `${operacion.clave}:${sufijo}`,
      },
    });
  }
}
