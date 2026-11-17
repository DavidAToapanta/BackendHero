import { randomUUID } from 'node:crypto';
import { PrismaService } from '@app/prisma';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CatalogoService } from '../catalogo/catalogo.service';
import { PortalService, type ClientePortal } from '../portal/portal.service';
import type { GuardarCarritoDto } from './carrito.dto';

const vista = {
  id: true,
  estado: true,
  updatedAt: true,
  detalleCarrito_carrito: {
    orderBy: { productoId: 'asc' },
    select: {
      cantidad: true,
      productoId: true,
      producto: { select: { nombre: true, precio: true, estado: true } },
    },
  },
} satisfies Prisma.CarritoSelect;

@Injectable()
export class CarritoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portal: PortalService,
    private readonly catalogo: CatalogoService,
  ) {}

  async consultar(cliente: ClientePortal, id?: number) {
    const carrito = await this.prisma.carrito.findFirst({
      where: {
        tenantId: cliente.tenantId,
        clienteComercialId: cliente.clienteComercialId,
        ...(id === undefined ? { estado: 'ACTIVO' } : { id }),
      },
      select: vista,
    });
    if (id !== undefined && !carrito)
      throw new NotFoundException('Carrito no encontrado');
    return carrito;
  }

  guardar(cliente: ClientePortal, { lineas }: GuardarCarritoDto, id?: number) {
    const { tenantId, clienteComercialId } = cliente;
    return this.prisma.$transaction(async (tx) => {
      await this.portal.bloquearVinculo(tx, cliente);
      const anterior =
        id === undefined ? null : await this.bloquearActivo(tx, cliente, id);
      if (
        !anterior &&
        (await tx.carrito.findFirst({
          where: { tenantId, clienteComercialId, estado: 'ACTIVO' },
          select: { id: true },
        }))
      ) {
        throw new ConflictException('Ya existe un carrito activo');
      }
      for (const { productoId } of lineas) {
        await this.catalogo.obtenerSnapshotVenta(tx, tenantId, productoId);
      }
      const carrito = anterior
        ? await tx.carrito.update({
            where: { id: anterior.id },
            data: { updatedAt: new Date() },
          })
        : await tx.carrito.create({ data: { tenantId, clienteComercialId } });
      if (anterior)
        await tx.detalleCarrito.deleteMany({
          where: { tenantId, carritoId: carrito.id },
        });
      if (lineas.length) {
        await tx.detalleCarrito.createMany({
          data: lineas.map(({ productoId, cantidad }) => ({
            tenantId,
            carritoId: carrito.id,
            productoId,
            cantidad,
          })),
        });
      }
      await this.auditar(
        tx,
        cliente,
        carrito.id,
        anterior ? 'carrito.editar' : 'carrito.crear',
      );
      return tx.carrito.findUniqueOrThrow({
        where: { id: carrito.id },
        select: vista,
      });
    });
  }

  abandonar(cliente: ClientePortal, id: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.portal.bloquearVinculo(tx, cliente);
      await this.bloquearActivo(tx, cliente, id);
      await tx.carrito.update({
        where: { id },
        data: { estado: 'ABANDONADO' },
      });
      await this.auditar(tx, cliente, id, 'carrito.abandonar');
    });
  }

  async bloquearActivo(
    tx: Prisma.TransactionClient,
    cliente: ClientePortal,
    id: number,
  ) {
    const [carrito] = await tx.$queryRaw<{ id: number; estado: string }[]>`
      SELECT id, estado::text FROM "Carrito"
      WHERE "tenantId" = ${cliente.tenantId} AND "clienteComercialId" = ${cliente.clienteComercialId} AND id = ${id}
      FOR UPDATE
    `;
    if (!carrito) throw new NotFoundException('Carrito no encontrado');
    if (carrito.estado !== 'ACTIVO')
      throw new ConflictException('El carrito ya no está activo');
    return carrito;
  }

  private auditar(
    tx: Prisma.TransactionClient,
    cliente: ClientePortal,
    entidadId: number,
    accion: string,
  ) {
    return tx.auditoriaOperacion.create({
      data: {
        tenantId: cliente.tenantId,
        usuarioId: cliente.usuarioId,
        actor: 'USUARIO',
        entidadTipo: 'Carrito',
        entidadId,
        accion,
        correlacionId: randomUUID(),
      },
    });
  }
}
