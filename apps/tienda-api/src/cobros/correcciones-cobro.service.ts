import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AplicacionCobro, MetodoCobro, Prisma } from '@prisma/client';
import { ACCIONES_AUDITORIA } from '../auditoria/auditoria-escritura';
import { CajaService } from '../caja/caja.service';
import { CuentasService } from '../cartera/cuentas.service';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import {
  ContextoOperacionTienda,
  importeTienda,
  textoObligatorio,
} from '../comun/operacion-tienda';
import { CobrosOperacionService } from './cobros-operacion.service';

@Injectable()
export class CorreccionesCobroService {
  constructor(
    private readonly idempotencia: IdempotenciaService,
    private readonly cobros: CobrosOperacionService,
    private readonly cuentas: CuentasService,
    private readonly caja: CajaService,
  ) {}

  corregirAplicacion(
    contexto: ContextoOperacionTienda,
    aplicacionId: number,
    razon: string,
    clave: string | undefined,
  ) {
    const { tenantId, usuarioId } = contexto;
    const motivo = textoObligatorio(razon, 'Motivo');
    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'cobros.corregir-aplicacion',
        datos: { aplicacionId, motivo },
      },
      async (tx, claveRecurso) => {
        const { aplicacion, reversion } = await this.revertirAplicacion(
          tx,
          contexto,
          aplicacionId,
          motivo,
          claveRecurso,
        );
        await this.restaurarSaldo(
          tx,
          contexto,
          aplicacion,
          reversion.id,
          motivo,
          claveRecurso,
        );
        return {
          recursoTipo: 'ReversionAplicacionCobro',
          recursoId: reversion.id,
        };
      },
    );
  }

  revertirCobro(
    contexto: ContextoOperacionTienda,
    cobroId: number,
    razon: string,
    clave: string | undefined,
  ) {
    const { tenantId, usuarioId, membresiaId } = contexto;
    const motivo = textoObligatorio(razon, 'Motivo');
    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'cobros.revertir',
        datos: { cobroId, motivo },
      },
      async (tx, claveRecurso) => {
        const where = { tenantId_id: { tenantId, id: cobroId } };
        const previo = await tx.cobro.findUnique({
          where,
          select: { metodo: true, turnoId: true },
        });
        if (!previo) throw new NotFoundException('Cobro no encontrado');
        const turnoId = previo.metodo === 'EFECTIVO' ? previo.turnoId : null;
        if (turnoId !== null)
          await this.caja.bloquearTurnoAbierto(tx, contexto, turnoId);

        const cobro = await this.cobros.bloquearCobro(tx, tenantId, cobroId);
        if (cobro.estado !== 'CONFIRMADO')
          throw new ConflictException('El cobro ya está reversado');
        if (
          cobro.metodo !== previo.metodo ||
          cobro.turnoId !== previo.turnoId
        ) {
          throw new ConflictException(
            'El medio de cobro cambió; vuelva a consultar el cobro',
          );
        }
        const reembolso = await tx.reembolso.findFirst({
          where: {
            tenantId,
            cobroId,
            estado: { in: ['PENDIENTE', 'CONFIRMADO'] },
          },
          select: { id: true },
        });
        if (reembolso)
          throw new ConflictException(
            'El cobro tiene un reembolso pendiente o confirmado',
          );

        const aplicaciones = await tx.aplicacionCobro.findMany({
          where: { tenantId, cobroId },
          orderBy: [{ ventaId: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            ventaId: true,
            reversionAplicacionCobro_aplicacion: { select: { id: true } },
          },
        });
        for (const ventaId of new Set(
          aplicaciones.map((item) => item.ventaId),
        )) {
          await this.cobros.bloquearVenta(tx, tenantId, ventaId);
        }
        for (const item of aplicaciones) {
          if (item.reversionAplicacionCobro_aplicacion.length) continue;
          const claveAplicacion = `${claveRecurso}:${item.id}`;
          const { aplicacion, reversion } = await this.revertirAplicacion(
            tx,
            contexto,
            item.id,
            motivo,
            claveAplicacion,
          );
          await this.restaurarSaldo(
            tx,
            contexto,
            aplicacion,
            reversion.id,
            motivo,
            claveAplicacion,
          );
        }

        if (turnoId !== null) {
          const movimiento = await this.caja.registrarMovimiento(tx, contexto, {
            turnoId,
            monto: cobro.monto,
            motivo: `Reversión del cobro ${cobroId} · ${motivo}`,
            claveRecurso,
            origen: { tipo: 'manual', direccion: 'SALIDA' },
          });
          await contexto.auditar(tx, {
            accion: ACCIONES_AUDITORIA.COBROS_COMPENSAR_CAJA,
            recursoTipo: 'MovimientoCaja',
            recursoId: movimiento.id,
            motivo,
          });
        }
        await tx.cobro.update({
          where,
          data: {
            estado: 'REVERSADO',
            reversadoAt: new Date(),
            reversadoPorId: membresiaId,
            motivoReversion: motivo,
          },
        });
        await contexto.auditar(tx, {
          accion: ACCIONES_AUDITORIA.COBROS_REVERTIR,
          recursoTipo: 'Cobro',
          recursoId: cobroId,
          motivo,
        });
        return { recursoTipo: 'Cobro', recursoId: cobroId };
      },
    );
  }

  private async restaurarSaldo(
    tx: Prisma.TransactionClient,
    contexto: ContextoOperacionTienda,
    aplicacion: AplicacionCobro,
    reversionId: number,
    motivo: string,
    claveRecurso: string,
  ) {
    const { tenantId, membresiaId } = contexto;
    const { ventaId, monto } = aplicacion;
    const cuenta = await tx.cuentaPorCobrar.findUnique({
      where: { tenantId_ventaId: { tenantId, ventaId } },
      select: { id: true },
    });
    if (!cuenta)
      throw new ConflictException(
        'La corrección dejaría una venta de contado con saldo',
      );
    const anterior = await this.cuentas.bloquear(tx, tenantId, cuenta.id);
    if (anterior.estado === 'CANCELADA')
      throw new ConflictException('La cuenta está cancelada');

    const saldo = importeTienda(anterior.saldo.plus(monto));
    let importeExigible = anterior.importeExigible;
    if (aplicacion.cuentaId === null) {
      importeExigible = importeTienda(importeExigible.plus(monto));
      await tx.ajusteCuentaPorCobrar.create({
        data: {
          tenantId,
          cuentaId: cuenta.id,
          ventaId,
          reversionId,
          tipo: 'CORRECCION_PAGO_INICIAL',
          deltaImporte: monto,
          motivo,
          responsableId: membresiaId,
          claveIdempotencia: claveRecurso,
        },
      });
    }
    await tx.cuentaPorCobrar.update({
      where: { tenantId_id: { tenantId, id: cuenta.id } },
      data: { saldo, estado: 'ABIERTA', importeExigible },
    });
  }

  async revertirAplicacion(
    tx: Prisma.TransactionClient,
    contexto: ContextoOperacionTienda,
    id: number,
    razon: string,
    claveRecurso: string,
  ) {
    const { tenantId, membresiaId } = contexto;
    const motivo = textoObligatorio(razon, 'Motivo');
    const aplicacion = await this.obtenerAplicacion(tx, tenantId, id);
    const cobro = await this.cobros.bloquearCobro(
      tx,
      tenantId,
      aplicacion.cobroId,
    );
    const venta = await this.cobros.bloquearVenta(
      tx,
      tenantId,
      aplicacion.ventaId,
    );
    if (cobro.estado !== 'CONFIRMADO' || venta.estado !== 'COMPLETADA') {
      throw new ConflictException(
        'Se requiere un cobro confirmado y una venta completada',
      );
    }
    const existente = await tx.reversionAplicacionCobro.findUnique({
      where: { tenantId_aplicacionId: { tenantId, aplicacionId: id } },
      select: { id: true },
    });
    if (existente)
      throw new ConflictException('La aplicación ya está revertida');
    const reversion = await tx.reversionAplicacionCobro.create({
      data: {
        tenantId,
        aplicacionId: id,
        ventaId: aplicacion.ventaId,
        responsableId: membresiaId,
        motivo,
        claveIdempotencia: claveRecurso,
      },
    });
    await contexto.auditar(tx, {
      accion: ACCIONES_AUDITORIA.COBROS_REVERTIR_APLICACION,
      recursoTipo: 'ReversionAplicacionCobro',
      recursoId: reversion.id,
      motivo,
    });
    return { aplicacion, reversion };
  }

  reembolsar(
    contexto: ContextoOperacionTienda,
    datos: {
      aplicacionId: number;
      monto: string;
      metodo: MetodoCobro;
      motivo: string;
      referencia?: string;
      turnoId?: number;
    },
    clave: string | undefined,
  ) {
    const { tenantId, usuarioId } = contexto;
    const motivo = textoObligatorio(datos.motivo, 'Motivo');
    const monto = importeTienda(datos.monto);
    const referencia = datos.referencia?.trim() || null;
    const turnoId = datos.turnoId ?? null;
    const { metodo, aplicacionId } = datos;
    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'cobros.reembolsar',
        datos: {
          aplicacionId,
          monto: monto.toFixed(2),
          metodo,
          motivo,
          referencia,
          turnoId,
        },
      },
      async (tx, claveRecurso) => {
        const reembolso = await this.confirmarReembolso(tx, contexto, {
          aplicacionId,
          monto,
          metodo,
          motivo,
          referencia,
          turnoId,
          claveRecurso,
        });
        return { recursoTipo: 'Reembolso', recursoId: reembolso.id };
      },
    );
  }

  async confirmarReembolso(
    tx: Prisma.TransactionClient,
    contexto: ContextoOperacionTienda,
    datos: {
      aplicacionId: number;
      monto: Prisma.Decimal;
      metodo: MetodoCobro;
      motivo: string;
      referencia: string | null;
      turnoId: number | null;
      devolucionId?: number;
      claveRecurso: string;
    },
  ) {
    const { tenantId, membresiaId } = contexto;
    const { metodo, turnoId, aplicacionId, claveRecurso, devolucionId } = datos;
    const monto = importeTienda(datos.monto);
    const motivo = textoObligatorio(datos.motivo, 'Motivo');
    if ((metodo === 'EFECTIVO') !== (turnoId !== null)) {
      throw new BadRequestException(
        'El turno es obligatorio exclusivamente para reembolsos en efectivo',
      );
    }
    if (turnoId !== null)
      await this.caja.bloquearTurnoAbierto(tx, contexto, turnoId);
    const aplicacion = await this.obtenerAplicacion(tx, tenantId, aplicacionId);
    const { cobroId, ventaId } = aplicacion;
    const cobro = await this.cobros.bloquearCobro(tx, tenantId, cobroId);
    await this.cobros.bloquearVenta(tx, tenantId, ventaId);
    if (cobro.estado !== 'CONFIRMADO')
      throw new ConflictException('Se requiere un cobro confirmado');

    const reversion = await tx.reversionAplicacionCobro.findUnique({
      where: { tenantId_aplicacionId: { tenantId, aplicacionId } },
      select: { id: true },
    });
    const totalReembolsado = await tx.reembolso.aggregate({
      where: {
        tenantId,
        aplicacionOriginalId: aplicacionId,
        estado: 'CONFIRMADO',
      },
      _sum: { monto: true },
    });
    if (
      !reversion ||
      monto.gt(aplicacion.monto.minus(totalReembolsado._sum.monto ?? 0)) ||
      monto.gt(await this.cobros.disponible(tx, tenantId, cobroId, cobro.monto))
    ) {
      throw new ConflictException('El monto no está disponible para reembolso');
    }
    if (devolucionId !== undefined) {
      const devolucion = await tx.devolucionVenta.findFirst({
        where: { id: devolucionId, tenantId, ventaId, estado: 'APROBADA' },
        select: { id: true },
      });
      if (!devolucion)
        throw new NotFoundException(
          'Devolución aprobada no encontrada para la venta',
        );
    }
    const reembolso = await tx.reembolso.create({
      data: {
        tenantId,
        ventaId,
        cobroId,
        aplicacionOriginalId: aplicacionId,
        devolucionId,
        turnoId,
        metodo,
        monto,
        referencia: datos.referencia,
        motivo,
        responsableId: membresiaId,
        estado: 'CONFIRMADO',
        confirmadoAt: new Date(),
        claveIdempotencia: claveRecurso,
      },
    });
    if (turnoId !== null) {
      await this.caja.registrarMovimiento(tx, contexto, {
        turnoId,
        monto,
        motivo,
        claveRecurso,
        origen: { tipo: 'reembolso', id: reembolso.id },
      });
    }
    await contexto.auditar(tx, {
      accion: ACCIONES_AUDITORIA.COBROS_REEMBOLSAR,
      recursoTipo: 'Reembolso',
      recursoId: reembolso.id,
      motivo,
    });
    return reembolso;
  }

  private async obtenerAplicacion(
    tx: Prisma.TransactionClient,
    tenantId: number,
    id: number,
  ) {
    const aplicacion = await tx.aplicacionCobro.findUnique({
      where: { tenantId_id: { tenantId, id } },
    });
    if (!aplicacion)
      throw new NotFoundException('Aplicación de cobro no encontrada');
    return aplicacion;
  }
}
