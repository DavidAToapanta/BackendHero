import { CajaService } from '../caja/caja.service';
import { PrismaService } from '@app/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';
import { MetodoCobro } from '@prisma/client';
import { ACCIONES_AUDITORIA } from '../auditoria/auditoria-escritura';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import {
  ContextoOperacionTienda,
  importeTienda,
  paginacion,
  textoObligatorio,
} from '../comun/operacion-tienda';

@Injectable()
export class GastosComercialesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caja: CajaService,
    private readonly idempotencia: IdempotenciaService,
  ) {}

  registrar(
    contexto: ContextoOperacionTienda,
    entrada: {
      concepto: string;
      categoria?: string;
      metodo: MetodoCobro;
      monto: string;
      referencia?: string;
      turnoId?: number;
      fecha?: Date;
    },
    clave: string | undefined,
  ) {
    const { tenantId, usuarioId, membresiaId } = contexto;
    const concepto = textoObligatorio(entrada.concepto, 'Concepto');
    const categoria = entrada.categoria?.trim() || null;
    const referencia = entrada.referencia?.trim() || null;
    const monto = importeTienda(entrada.monto);
    const { metodo, fecha } = entrada;
    const turnoId = entrada.turnoId ?? null;
    if ((metodo === 'EFECTIVO') !== (turnoId !== null)) {
      throw new BadRequestException(
        'El turno es obligatorio exclusivamente para gastos en efectivo',
      );
    }
    if (fecha && !Number.isFinite(fecha.getTime())) {
      throw new BadRequestException('Fecha de gasto inválida');
    }

    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'gastos.registrar',
        datos: {
          concepto,
          categoria,
          referencia,
          metodo,
          turnoId,
          monto: monto.toFixed(2),
          fecha: fecha?.toISOString() ?? null,
        },
      },
      async (tx, claveRecurso) => {
        if (turnoId !== null)
          await this.caja.bloquearTurnoAbierto(tx, contexto, turnoId);
        const gasto = await tx.gastoComercial.create({
          data: {
            tenantId,
            responsableId: membresiaId,
            concepto,
            categoria,
            referencia,
            metodo,
            turnoId,
            monto,
            fecha,
            claveIdempotencia: claveRecurso,
          },
        });
        if (turnoId !== null) {
          await this.caja.registrarMovimiento(tx, contexto, {
            turnoId,
            motivo: concepto,
            monto,
            claveRecurso,
            origen: { tipo: 'gasto', id: gasto.id },
          });
        }
        await contexto.auditar(tx, {
          accion: ACCIONES_AUDITORIA.GASTOS_REGISTRAR,
          recursoTipo: 'GastoComercial',
          recursoId: gasto.id,
          motivo: concepto,
        });
        return { recursoTipo: 'GastoComercial', recursoId: gasto.id };
      },
    );
  }

  listar(
    tenantId: number,
    filtros: {
      desde?: Date;
      hasta?: Date;
      pagina?: number;
      limite?: number;
    } = {},
  ) {
    if (filtros.desde && filtros.hasta && filtros.desde >= filtros.hasta) {
      throw new BadRequestException('El inicio debe ser anterior al fin');
    }
    return this.prisma.gastoComercial.findMany({
      omit: { claveIdempotencia: true },
      where: { tenantId, fecha: { gte: filtros.desde, lt: filtros.hasta } },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      ...paginacion(filtros.pagina, filtros.limite),
    });
  }
}
