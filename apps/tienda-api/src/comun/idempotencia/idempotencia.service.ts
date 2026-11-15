import { createHash } from 'node:crypto';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EstadoSolicitudIdempotente, Prisma } from '@prisma/client';

export type DatosIdempotentes =
  | null
  | boolean
  | number
  | string
  | DatosIdempotentes[]
  | { readonly [campo: string]: DatosIdempotentes };

export interface SolicitudIdempotenteTienda {
  tenantId: number;
  usuarioId: number;
  operacion: string;
  clave: string | undefined;
  datos: DatosIdempotentes;
}

export interface RecursoIdempotente {
  recursoTipo: string;
  recursoId: number;
}

function serializarDatos(valor: DatosIdempotentes): string {
  if (Array.isArray(valor)) {
    return `[${Array.from(valor, serializarDatos).join(',')}]`;
  }

  if (valor !== null && typeof valor === 'object') {
    const prototipo: unknown = Object.getPrototypeOf(valor);
    if (prototipo === Object.prototype || prototipo === null) {
      const campos = Object.keys(valor)
        .sort()
        .map(
          (campo) =>
            `${JSON.stringify(campo)}:${serializarDatos(valor[campo])}`,
        );
      return `{${campos.join(',')}}`;
    }
  }

  if (
    valor === null ||
    typeof valor === 'boolean' ||
    typeof valor === 'string' ||
    (typeof valor === 'number' && Number.isFinite(valor))
  ) {
    return JSON.stringify(valor);
  }

  throw new BadRequestException('Los datos idempotentes deben ser JSON válido');
}

function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

@Injectable()
export class IdempotenciaService {
  constructor(private readonly prisma: PrismaService) {}

  async ejecutar(
    solicitud: SolicitudIdempotenteTienda,
    escribir: (
      tx: Prisma.TransactionClient,
      claveRecurso: string,
    ) => Promise<RecursoIdempotente>,
  ): Promise<RecursoIdempotente> {
    const { tenantId, usuarioId, operacion, clave, datos } = solicitud;
    if (typeof clave !== 'string' || !/^[!-~]{1,128}$/.test(clave)) {
      throw new BadRequestException(
        'Idempotency-Key debe tener 1 a 128 caracteres ASCII visibles',
      );
    }

    const alcance = `usuario:${usuarioId}`;
    const identidad = { tenantId, alcance, operacion, clave };
    const donde = { tenantId_alcance_operacion_clave: identidad };
    const hashSolicitud = sha256(serializarDatos(datos));
    const claveRecurso = `idem:v1:${sha256(JSON.stringify([tenantId, alcance, operacion, clave]))}`;

    return this.prisma.$transaction(
      async (tx) => {
        // PostgreSQL espera a que se resuelva cualquier inserción de la misma clave.
        const { count } = await tx.solicitudIdempotente.createMany({
          data: { ...identidad, usuarioId, hashSolicitud },
          skipDuplicates: true,
        });

        if (count === 1) {
          const { recursoTipo, recursoId } = await escribir(tx, claveRecurso);
          await tx.solicitudIdempotente.update({
            where: donde,
            data: {
              estado: EstadoSolicitudIdempotente.COMPLETADA,
              recursoTipo,
              recursoId,
            },
          });
          return { recursoTipo, recursoId };
        }

        const anterior = await tx.solicitudIdempotente.findUniqueOrThrow({
          where: donde,
        });
        if (anterior.hashSolicitud !== hashSolicitud) {
          throw new ConflictException(
            'La clave idempotente ya se usó con otros datos',
          );
        }
        const { estado, recursoTipo, recursoId } = anterior;
        if (
          estado !== EstadoSolicitudIdempotente.COMPLETADA ||
          recursoTipo === null ||
          recursoId === null
        ) {
          throw new ConflictException(
            'La solicitud idempotente sigue en proceso',
          );
        }
        return { recursoTipo, recursoId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
