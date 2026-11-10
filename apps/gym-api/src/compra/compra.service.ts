import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Compra, ModoInventario, Prisma } from '@prisma/client';
import { InventarioLotesService, InventarioService } from '@app/inventario';
import { MembresiasPersonalService } from '@app/negocios';
import { PrismaService } from '@app/prisma';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateCompraDto } from './dto/create-compra.dto';

@Injectable()
export class CompraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioService,
    private readonly lotes: InventarioLotesService,
    private readonly membresias: MembresiasPersonalService,
  ) {}

  async create(dto: CreateCompraDto, tenantId?: number, usuarioId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const { clienteId, detalles } = dto;
    if (!detalles.length) {
      throw new BadRequestException(
        'La compra debe incluir al menos un producto',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId, tenantId: scopedTenantId },
        select: { id: true },
      });
      if (!cliente) throw new NotFoundException('Cliente no encontrado');

      const ids = [...new Set(detalles.map(({ productoId }) => productoId))];
      const productos = await this.inventario.bloquearProductos(
        tx,
        scopedTenantId,
        ids,
      );
      const productosPorId = new Map(
        productos.map((producto) => [producto.id, producto]),
      );
      const responsable = productos.some(
        (producto) => producto.modoInventario === ModoInventario.LOTES,
      )
        ? await this.buscarResponsable(tx, scopedTenantId, usuarioId)
        : undefined;

      const compras: Compra[] = [];
      const correlacionId = randomUUID();
      for (const detalle of detalles) {
        const { productoId, cantidad, lotes } = detalle;
        const producto = productosPorId.get(productoId);
        if (!producto) {
          throw new BadRequestException(
            `Producto con ID ${productoId} no encontrado`,
          );
        }
        if (producto.modoInventario === ModoInventario.LEGACY) {
          if (lotes?.length) {
            throw new BadRequestException(
              'El producto legacy no admite selección de lotes',
            );
          }
          await this.inventario.retirarLegacy(
            tx,
            scopedTenantId,
            producto,
            cantidad,
          );
        } else if (!lotes?.length || !responsable) {
          throw new BadRequestException(
            'Selecciona los lotes para completar la compra',
          );
        }

        const compra = await tx.compra.create({
          data: {
            tenantId: scopedTenantId,
            clienteId,
            productoId,
            cantidad,
            total: producto.precio
              .mul(cantidad)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
              .toNumber(),
            fecha: new Date(),
          },
        });

        if (lotes?.length && responsable) {
          await this.lotes.retirarCompra(
            tx,
            {
              tenantId: scopedTenantId,
              responsableId: responsable.id,
              clave: `gym:compra:${compra.id}`,
              correlacionId,
            },
            compra,
            lotes,
          );
        }
        compras.push(compra);
      }
      return compras;
    });
  }

  private async buscarResponsable(
    tx: Prisma.TransactionClient,
    tenantId: number,
    usuarioId?: number,
  ) {
    if (!usuarioId)
      throw new ForbiddenException(
        'La compra por lotes requiere un responsable',
      );
    const responsable = await this.membresias.buscarActiva(
      usuarioId,
      tenantId,
      tx,
    );
    if (!responsable)
      throw new ForbiddenException(
        'El responsable no tiene una membresía activa',
      );
    return responsable;
  }
}
