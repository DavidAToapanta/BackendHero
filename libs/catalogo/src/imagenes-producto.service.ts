import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@app/prisma';
import type { Prisma } from '@prisma/client';
import { traducirErrorCatalogo } from './errores-catalogo';

type ImagenProducto = {
  url: string;
  orden: number;
  claveArchivo?: string | null;
  textoAlternativo?: string | null;
};

const ORDEN_DUPLICADO = 'Ya existe una imagen en ese orden para el producto';

@Injectable()
export class ImagenesProductoService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: number, productoId: number) {
    return this.prisma.productoImagen.findMany({
      where: { tenantId, productoId },
      orderBy: { orden: 'asc' },
    });
  }

  async create(
    tenantId: number,
    productoId: number,
    imagen: ImagenProducto,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const { url, orden, claveArchivo, textoAlternativo } = imagen;
    this.validarImagen(url, orden);
    try {
      return await tx.productoImagen.create({
        data: {
          url: url.trim(),
          orden,
          claveArchivo,
          textoAlternativo,
          producto: { connect: { tenantId_id: { tenantId, id: productoId } } },
          tenant: { connect: { id: tenantId } },
        },
      });
    } catch (error) {
      traducirErrorCatalogo(error, {
        P2002: ORDEN_DUPLICADO,
        P2025: 'Producto no encontrado',
      });
    }
  }

  async update(
    tenantId: number,
    productoId: number,
    id: number,
    { url, orden, claveArchivo, textoAlternativo }: Partial<ImagenProducto>,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    this.validarImagen(url, orden);
    try {
      return await tx.productoImagen.update({
        where: { tenantId_id: { tenantId, id }, productoId },
        data: { url: url?.trim(), orden, claveArchivo, textoAlternativo },
      });
    } catch (error) {
      traducirErrorCatalogo(error, {
        P2002: ORDEN_DUPLICADO,
        P2025: 'Imagen no encontrada',
      });
    }
  }

  async remove(
    tenantId: number,
    productoId: number,
    id: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    try {
      return await tx.productoImagen.delete({
        where: { tenantId_id: { tenantId, id }, productoId },
      });
    } catch (error) {
      traducirErrorCatalogo(error, { P2025: 'Imagen no encontrada' });
    }
  }

  private validarImagen(url?: string, orden?: number) {
    if (url !== undefined && !url.trim()) {
      throw new BadRequestException('La URL de la imagen es obligatoria');
    }
    if (orden !== undefined && (!Number.isInteger(orden) || orden < 0)) {
      throw new BadRequestException(
        'El orden de la imagen debe ser un entero no negativo',
      );
    }
  }
}
