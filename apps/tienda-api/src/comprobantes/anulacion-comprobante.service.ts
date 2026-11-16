import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ACCIONES_AUDITORIA } from '../auditoria/auditoria-escritura';
import type { ContextoOperacionTienda } from '../comun/operacion-tienda';

@Injectable()
export class AnulacionComprobanteService {
  async anularDeVenta(
    tx: Prisma.TransactionClient,
    contexto: ContextoOperacionTienda,
    ventaId: number,
    motivo: string,
    anuladaAt: Date,
  ) {
    const { tenantId, membresiaId } = contexto;
    const documento = await tx.comprobanteVenta.findUnique({
      where: { tenantId_ventaId: { tenantId, ventaId } },
      select: { id: true },
    });
    if (!documento) return null;
    await tx.comprobanteVenta.update({
      where: { tenantId_id: { tenantId, id: documento.id } },
      data: {
        estado: 'ANULADO',
        anuladaAt,
        anuladoPorId: membresiaId,
        motivoAnulacion: motivo,
      },
    });
    await contexto.auditar(tx, {
      accion: ACCIONES_AUDITORIA.COMPROBANTES_ANULAR,
      recursoTipo: 'ComprobanteVenta',
      recursoId: documento.id,
      motivo,
    });
    return documento.id;
  }
}
