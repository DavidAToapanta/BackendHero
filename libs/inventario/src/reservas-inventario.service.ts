import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoPedido,
  EstadoReservaInventario,
  Prisma,
  TipoMovimientoInventario,
} from '@prisma/client';
import { InventarioLotesService } from './inventario-lotes.service';
import { InventarioService } from './inventario.service';
import type { OperacionInventario } from './inventario.types';

@Injectable()
export class ReservasInventarioService {
  constructor(
    private readonly inventario: InventarioService,
    private readonly lotes: InventarioLotesService,
  ) {}

  async reservar(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    pedidoId: number,
    detallePedidoId: number,
  ) {
    const { tenantId } = operacion;
    const pedido = await this.bloquearPedido(tx, tenantId, pedidoId);
    if (pedido.estado !== EstadoPedido.CONFIRMADO) {
      throw new ConflictException(
        'Solo un pedido confirmado admite nuevas reservas',
      );
    }
    const detalle = await tx.detallePedido.findFirst({
      where: { tenantId, pedidoId, id: detallePedidoId },
      select: { productoId: true, cantidad: true },
    });
    if (!detalle)
      throw new NotFoundException('Detalle de pedido no encontrado');

    const producto = await this.inventario.bloquearProducto(
      tx,
      tenantId,
      detalle.productoId,
    );
    const ahora = new Date();
    if (pedido.reservaHasta <= ahora)
      throw new ConflictException('El pedido está vencido');
    await this.lotes.validarDisponible(tx, producto, detalle.cantidad, ahora);

    const reserva = await tx.reservaInventario.create({
      data: {
        tenantId,
        pedidoId,
        detallePedidoId,
        reservaHasta: pedido.reservaHasta,
        ...detalle,
      },
    });
    await tx.producto.update({
      where: { tenantId_id: { tenantId, id: producto.id } },
      data: { stockReservado: { increment: detalle.cantidad } },
    });
    await this.lotes.registrarMovimiento(
      tx,
      operacion,
      {
        tipo: TipoMovimientoInventario.RESERVA,
        productoId: producto.id,
        reservaId: reserva.id,
        deltaFisico: 0,
        deltaReservado: detalle.cantidad,
      },
      `reserva:${reserva.id}`,
    );
    return reserva;
  }

  async liberar(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    pedidoId: number,
    reservaId: number,
    motivo: string,
  ) {
    const { tenantId } = operacion;
    const pedido = await this.bloquearPedido(tx, tenantId, pedidoId);
    const expira = pedido.estado === EstadoPedido.EXPIRADO;
    if (!expira && pedido.estado !== EstadoPedido.CANCELADO) {
      throw new ConflictException(
        'El pedido debe cancelarse o expirar en la misma transacción',
      );
    }
    const reserva = await this.buscarReserva(tx, tenantId, pedidoId, reservaId);
    const producto = await this.inventario.bloquearProducto(
      tx,
      tenantId,
      reserva.productoId,
    );
    const ahora = new Date();
    if (expira && reserva.reservaHasta > ahora) {
      throw new ConflictException('La reserva todavía está vigente');
    }

    const liberada = await tx.reservaInventario.update({
      where: {
        tenantId_id: { tenantId, id: reservaId },
        estado: EstadoReservaInventario.ACTIVA,
      },
      data: {
        estado: expira
          ? EstadoReservaInventario.EXPIRADA
          : EstadoReservaInventario.LIBERADA,
        liberadaAt: ahora,
        motivo,
      },
    });
    await this.lotes.descontarSaldos(tx, producto, 0, reserva.cantidad);
    await this.lotes.registrarMovimiento(
      tx,
      operacion,
      {
        tipo: TipoMovimientoInventario.LIBERACION_RESERVA,
        productoId: producto.id,
        reservaId,
        motivo,
        deltaFisico: 0,
        deltaReservado: -reserva.cantidad,
      },
      `reserva:${reservaId}`,
    );
    return liberada;
  }

  async consumir(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    pedidoId: number,
    reservaId: number,
  ) {
    const { tenantId } = operacion;
    const pedido = await this.bloquearPedido(tx, tenantId, pedidoId);
    if (pedido.estado !== EstadoPedido.ENTREGADO) {
      throw new ConflictException(
        'El pedido debe entregarse en la misma transacción',
      );
    }
    const reserva = await this.buscarReserva(tx, tenantId, pedidoId, reservaId);
    const producto = await this.inventario.bloquearProducto(
      tx,
      tenantId,
      reserva.productoId,
    );
    const ahora = new Date();
    if (reserva.reservaHasta <= ahora)
      throw new ConflictException('La reserva está vencida');
    this.lotes.validarProductoActivo(producto);
    const asignaciones = await tx.asignacionLoteVenta.findMany({
      where: {
        tenantId,
        productoId: producto.id,
        detalleVenta: { venta: { pedidoId } },
      },
      orderBy: { loteId: 'asc' },
    });
    if (
      asignaciones.reduce(
        (total, asignacion) => total + asignacion.cantidad,
        0,
      ) !== reserva.cantidad
    ) {
      throw new ConflictException(
        'Los lotes asignados deben cubrir la cantidad reservada',
      );
    }

    for (const asignacion of asignaciones) {
      await this.lotes.retirarLote(
        tx,
        operacion,
        producto.id,
        asignacion,
        {
          asignacionVentaId: asignacion.id,
          reservaId,
        },
        ahora,
      );
    }
    await this.lotes.descontarSaldos(
      tx,
      producto,
      reserva.cantidad,
      reserva.cantidad,
    );
    return tx.reservaInventario.update({
      where: {
        tenantId_id: { tenantId, id: reservaId },
        estado: EstadoReservaInventario.ACTIVA,
      },
      data: { estado: EstadoReservaInventario.CONSUMIDA, consumidaAt: ahora },
    });
  }

  private async bloquearPedido(
    tx: Prisma.TransactionClient,
    tenantId: number,
    id: number,
  ) {
    const [pedido] = await tx.$queryRaw<
      { estado: EstadoPedido; reservaHasta: Date }[]
    >`
      SELECT estado::text AS estado, "reservaHasta" FROM "Pedido"
      WHERE "tenantId" = ${tenantId} AND id = ${id} FOR UPDATE
    `;
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    await tx.$queryRaw`
      SELECT p.id FROM "Producto" p
      JOIN "DetallePedido" d ON d."tenantId" = p."tenantId" AND d."productoId" = p.id
      WHERE d."tenantId" = ${tenantId} AND d."pedidoId" = ${id}
      ORDER BY p.id FOR UPDATE OF p
    `;
    return pedido;
  }

  private async buscarReserva(
    tx: Prisma.TransactionClient,
    tenantId: number,
    pedidoId: number,
    id: number,
  ) {
    const reserva = await tx.reservaInventario.findUnique({
      where: { tenantId_id: { tenantId, id }, pedidoId },
    });
    if (!reserva) throw new NotFoundException('Reserva no encontrada');
    if (reserva.estado !== EstadoReservaInventario.ACTIVA) {
      throw new ConflictException('La reserva ya no está activa');
    }
    return reserva;
  }
}
