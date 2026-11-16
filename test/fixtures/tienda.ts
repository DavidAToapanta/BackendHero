import { randomUUID } from 'node:crypto';
import type {
  OperacionInventario,
  ReservasInventarioService,
} from '@app/inventario';
import type { Prisma, Producto } from '@prisma/client';

export async function reservarPedidoEnsayo(
  tx: Prisma.TransactionClient,
  reservas: ReservasInventarioService,
  operacion: OperacionInventario,
  producto: Pick<Producto, 'id' | 'nombre' | 'precio'>,
  cantidad: number,
) {
  const { tenantId } = operacion;
  const cliente = await tx.clienteComercial.create({
    data: { tenantId, nombres: 'Comprador de ensayo' },
  });
  const clave = randomUUID();
  const confirmadoAt = new Date();
  const subtotal = producto.precio.mul(cantidad);
  const pedido = await tx.pedido.create({
    data: {
      tenantId,
      clienteComercialId: cliente.id,
      numero: clave,
      claveIdempotencia: clave,
      confirmadoAt,
      reservaHasta: new Date(confirmadoAt.getTime() + 600_000),
      subtotal,
      total: subtotal,
    },
  });
  const detalle = await tx.detallePedido.create({
    data: {
      tenantId,
      pedidoId: pedido.id,
      productoId: producto.id,
      nombreProducto: producto.nombre,
      cantidad,
      precioUnitario: producto.precio,
      subtotal,
      total: subtotal,
    },
  });
  const reserva = await reservas.reservar(tx, operacion, pedido.id, detalle.id);
  return { pedido, reserva };
}
