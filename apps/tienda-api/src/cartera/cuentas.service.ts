import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { importeTienda } from '../comun/operacion-tienda';

@Injectable()
export class CuentasService {
  crear(
    tx: Prisma.TransactionClient,
    datos: {
      tenantId: number;
      ventaId: number;
      clienteComercialId: number;
      vencimiento: Date;
      financiado: Prisma.Decimal;
    },
  ) {
    const { financiado, ...cuenta } = datos;
    const importe = importeTienda(financiado);
    return tx.cuentaPorCobrar.create({
      data: {
        ...cuenta,
        estado: 'ABIERTA',
        importeFinanciadoInicial: importe,
        importeExigible: importe,
        saldo: importe,
      },
    });
  }

  async bloquear(tx: Prisma.TransactionClient, tenantId: number, id: number) {
    const filas = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "CuentaPorCobrar" WHERE "tenantId" = ${tenantId} AND id = ${id} FOR UPDATE
    `;
    if (!filas.length)
      throw new NotFoundException('Cuenta por cobrar no encontrada');
    return tx.cuentaPorCobrar.findUniqueOrThrow({
      where: { tenantId_id: { tenantId, id } },
    });
  }

  async descontarAbono(
    tx: Prisma.TransactionClient,
    tenantId: number,
    id: number,
    monto: Prisma.Decimal,
  ) {
    const cuenta = await this.bloquear(tx, tenantId, id);
    const saldo = cuenta.saldo.minus(importeTienda(monto));
    if (cuenta.estado !== 'ABIERTA' || saldo.lt(0)) {
      throw new ConflictException(
        'El abono supera el saldo pendiente de la cuenta',
      );
    }
    return tx.cuentaPorCobrar.update({
      where: { tenantId_id: { tenantId, id } },
      data: { saldo, estado: saldo.isZero() ? 'PAGADA' : 'ABIERTA' },
    });
  }
}
