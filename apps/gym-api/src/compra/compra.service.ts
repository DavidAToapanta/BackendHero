import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Compra, Prisma } from '@prisma/client';
import { PrismaService } from '@app/prisma';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateCompraDto } from './dto/create-compra.dto';

@Injectable()
export class CompraService {
  constructor(private prisma: PrismaService) {}

  private async getScopedTenantId(tenantId?: number) {
    return resolveTenantIdOrDefault(this.prisma, tenantId);
  }

  async create(createCompraDto: CreateCompraDto, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const { clienteId, detalles } = createCompraDto;

    if (!detalles.length) {
      throw new BadRequestException(
        'La compra debe incluir al menos un producto',
      );
    }

    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, tenantId: scopedTenantId },
      select: { id: true },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const productoIds = [
      ...new Set(detalles.map((detalle) => detalle.productoId)),
    ];
    const productos = await this.prisma.producto.findMany({
      where: {
        tenantId: scopedTenantId,
        id: { in: productoIds },
      },
      select: {
        id: true,
        nombre: true,
        precio: true,
        stock: true,
      },
    });

    if (productos.length !== productoIds.length) {
      const productosEncontrados = new Set(
        productos.map((producto) => producto.id),
      );
      const productoFaltante = productoIds.find(
        (id) => !productosEncontrados.has(id),
      );

      throw new BadRequestException(
        `Producto con ID ${productoFaltante} no encontrado`,
      );
    }

    const cantidadesPorProducto = new Map<number, number>();
    for (const detalle of detalles) {
      cantidadesPorProducto.set(
        detalle.productoId,
        (cantidadesPorProducto.get(detalle.productoId) ?? 0) + detalle.cantidad,
      );
    }

    const productosPorId = new Map(
      productos.map((producto) => [producto.id, producto]),
    );

    for (const [productoId, cantidad] of cantidadesPorProducto.entries()) {
      const producto = productosPorId.get(productoId);

      if (!producto) {
        throw new BadRequestException(
          `Producto con ID ${productoId} no encontrado`,
        );
      }

      if (producto.stock < cantidad) {
        throw new BadRequestException(
          `Stock insuficiente para el producto ${producto.nombre}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const compras: Compra[] = [];
      const stockDisponible = new Map(
        productos.map((producto) => [producto.id, producto.stock]),
      );

      for (const detalle of detalles) {
        const producto = productosPorId.get(detalle.productoId);
        const stockActual = stockDisponible.get(detalle.productoId);

        if (!producto || stockActual === undefined) {
          throw new BadRequestException(
            `Producto con ID ${detalle.productoId} no encontrado`,
          );
        }

        if (stockActual < detalle.cantidad) {
          throw new BadRequestException(
            `Stock insuficiente para el producto ${producto.nombre}`,
          );
        }

        stockDisponible.set(detalle.productoId, stockActual - detalle.cantidad);

        await tx.producto.update({
          where: { id: detalle.productoId },
          data: {
            stock: {
              decrement: detalle.cantidad,
            },
          },
        });

        const compra = await tx.compra.create({
          data: {
            tenantId: scopedTenantId,
            clienteId,
            productoId: detalle.productoId,
            cantidad: detalle.cantidad,
            // Compra conserva su importe Float y contrato legacy. El precio
            // nuevo se calcula en Decimal antes de convertir ese resultado.
            total: new Prisma.Decimal(producto.precio)
              .mul(detalle.cantidad)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
              .toNumber(),
            fecha: new Date(),
          },
        });

        compras.push(compra);
      }

      return compras;
    });
  }
}
