import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModoInventario, Prisma, Producto } from '@prisma/client';

export type ProductoInventario = Pick<
  Producto,
  | 'id'
  | 'tenantId'
  | 'nombre'
  | 'precio'
  | 'estado'
  | 'stock'
  | 'stockReservado'
  | 'modoInventario'
>;

@Injectable()
export class InventarioService {
  async bloquearProductos(
    tx: Prisma.TransactionClient,
    tenantId: number,
    ids: number[],
  ) {
    if (!ids.length) return [];
    return tx.$queryRaw<ProductoInventario[]>`
      SELECT id, "tenantId", nombre, precio, estado, stock, "stockReservado",
        "modoInventario"::text AS "modoInventario" FROM "Producto"
      WHERE "tenantId" = ${tenantId} AND id IN (${Prisma.join(ids)})
      ORDER BY id FOR UPDATE
    `;
  }

  async bloquearProducto(
    tx: Prisma.TransactionClient,
    tenantId: number,
    id: number,
  ) {
    const [producto] = await this.bloquearProductos(tx, tenantId, [id]);
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return producto;
  }

  async retirarLegacy(
    tx: Prisma.TransactionClient,
    tenantId: number,
    producto: Pick<Producto, 'id' | 'nombre'>,
    cantidad: number,
  ) {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new BadRequestException('La cantidad debe ser un entero positivo');
    }
    const { count } = await tx.producto.updateMany({
      where: {
        id: producto.id,
        tenantId,
        modoInventario: ModoInventario.LEGACY,
        stock: { gte: cantidad },
      },
      data: { stock: { decrement: cantidad } },
    });
    if (!count) {
      throw new BadRequestException(
        `Stock insuficiente para el producto ${producto.nombre}`,
      );
    }
  }

  async fijarStockLegacy(
    tx: Prisma.TransactionClient,
    tenantId: number,
    id: number,
    stock: number,
  ) {
    if (!Number.isInteger(stock) || stock < 0) {
      throw new BadRequestException('El stock debe ser un entero no negativo');
    }
    const { count } = await tx.producto.updateMany({
      where: { id, tenantId, modoInventario: ModoInventario.LEGACY },
      data: { stock },
    });
    if (count) return;

    const producto = await tx.producto.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    throw new ConflictException(
      'El stock por lotes debe modificarse desde inventario',
    );
  }
}
