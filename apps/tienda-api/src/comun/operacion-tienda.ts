import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccionAuditoria } from '../auditoria/auditoria-escritura';

export interface ContextoOperacionTienda {
  tenantId: number;
  usuarioId: number;
  membresiaId: number;
  auditar(
    tx: Prisma.TransactionClient,
    evento: {
      accion: AccionAuditoria;
      recursoTipo: string;
      recursoId: number;
      motivo?: string;
      productos?: readonly number[];
      correlacionId?: string;
      datos?: Prisma.InputJsonObject;
    },
  ): Promise<void>;
}

export function textoObligatorio(valor: string, campo: string): string {
  const texto = valor.trim();
  if (!texto) throw new BadRequestException(`${campo} es obligatorio`);
  return texto;
}

export function importeTienda(
  valor: string | Prisma.Decimal,
  admiteCero = false,
) {
  if (typeof valor === 'string' && !/^\d{1,16}(?:\.\d{1,2})?$/.test(valor)) {
    throw new BadRequestException('Importe inválido');
  }
  const importe = new Prisma.Decimal(valor);
  if (
    !importe.isFinite() ||
    importe.decimalPlaces() > 2 ||
    importe.gte('10000000000000000') ||
    importe.lt(0) ||
    (!admiteCero && importe.isZero())
  ) {
    throw new BadRequestException('Importe inválido');
  }
  return importe;
}

export function conflictoUnicidad(error: unknown, mensaje: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(mensaje);
  }
  throw error;
}

export function paginacion(pagina = 1, limite = 25) {
  if (
    !Number.isInteger(pagina) ||
    pagina < 1 ||
    pagina > 1_000_000 ||
    !Number.isInteger(limite) ||
    limite < 1 ||
    limite > 100
  ) {
    throw new BadRequestException('Paginación inválida');
  }
  return { skip: (pagina - 1) * limite, take: limite };
}
