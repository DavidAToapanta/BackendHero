import { CajaService } from '../caja/caja.service';
import { CuentasService } from '../cartera/cuentas.service';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MetodoCobro, Prisma } from '@prisma/client';
import { ACCIONES_AUDITORIA } from '../auditoria/auditoria-escritura';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import {
  ContextoOperacionTienda,
  importeTienda,
  paginacion,
} from '../comun/operacion-tienda';

export interface DatosCobroTienda {
  metodo: MetodoCobro;
  monto: Prisma.Decimal;
  referencia?: string | null;
  turnoId?: number | null;
  clienteComercialId?: number | null;
  claveRecurso: string;
}

@Injectable()
export class CobrosOperacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caja: CajaService,
    private readonly cuentas: CuentasService,
    private readonly idempotencia: IdempotenciaService,
  ) {}

  registrarYAplicar(
    contexto: ContextoOperacionTienda,
    datos: {
      ventaId: number;
      cuentaId?: number;
      metodo: MetodoCobro;
      monto: string;
      turnoId?: number;
      referencia?: string;
    },
    clave: string | undefined,
  ) {
    const { tenantId, usuarioId } = contexto;
    const { ventaId, cuentaId, metodo } = datos;
    const monto = importeTienda(datos.monto);
    const turnoId = datos.turnoId ?? null;
    const referencia = datos.referencia?.trim() || null;
    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'cobros.registrar-y-aplicar',
        datos: {
          ventaId,
          cuentaId: cuentaId ?? null,
          metodo,
          monto: monto.toFixed(2),
          turnoId,
          referencia,
        },
      },
      async (tx, claveRecurso) => {
        const venta = await tx.venta.findUnique({
          where: { tenantId_id: { tenantId, id: ventaId } },
          select: { clienteComercialId: true },
        });
        if (!venta) throw new NotFoundException('Venta no encontrada');
        const cobro = await this.registrar(tx, contexto, {
          metodo,
          monto,
          turnoId,
          referencia,
          clienteComercialId: venta.clienteComercialId,
          claveRecurso,
        });
        await this.aplicar(tx, contexto, {
          cobroId: cobro.id,
          ventaId,
          cuentaId,
          monto,
          claveRecurso,
        });
        return { recursoTipo: 'Cobro', recursoId: cobro.id };
      },
    );
  }

  async registrar(
    tx: Prisma.TransactionClient,
    contexto: ContextoOperacionTienda,
    datos: DatosCobroTienda,
  ) {
    const { tenantId, membresiaId } = contexto;
    const { metodo, claveRecurso, clienteComercialId } = datos;
    const turnoId = datos.turnoId ?? null;
    const monto = importeTienda(datos.monto);
    if (metodo === 'EFECTIVO' && turnoId === null) {
      throw new BadRequestException('El cobro en efectivo requiere un turno');
    }
    if (turnoId !== null)
      await this.caja.bloquearTurnoAbierto(tx, contexto, turnoId);
    if (clienteComercialId != null) {
      const cliente = await tx.clienteComercial.findUnique({
        where: { tenantId_id: { tenantId, id: clienteComercialId } },
        select: { id: true },
      });
      if (!cliente)
        throw new NotFoundException('Cliente comercial no encontrado');
    }
    const cobro = await tx.cobro.create({
      data: {
        tenantId,
        responsableId: membresiaId,
        metodo,
        turnoId,
        clienteComercialId,
        monto,
        referencia: datos.referencia?.trim() || null,
        claveIdempotencia: claveRecurso,
      },
    });
    if (metodo === 'EFECTIVO' && turnoId !== null) {
      await this.caja.registrarMovimiento(tx, contexto, {
        turnoId,
        monto,
        motivo: 'Cobro en efectivo',
        claveRecurso,
        origen: { tipo: 'cobro', id: cobro.id },
      });
    }
    await contexto.auditar(tx, {
      accion: ACCIONES_AUDITORIA.COBROS_REGISTRAR,
      recursoTipo: 'Cobro',
      recursoId: cobro.id,
    });
    return cobro;
  }

  async aplicar(
    tx: Prisma.TransactionClient,
    contexto: ContextoOperacionTienda,
    datos: {
      cobroId: number;
      ventaId: number;
      cuentaId?: number;
      monto: Prisma.Decimal;
      claveRecurso: string;
    },
  ) {
    const { tenantId, membresiaId } = contexto;
    const { cobroId, ventaId, cuentaId, claveRecurso } = datos;
    const monto = importeTienda(datos.monto);
    const cobro = await this.bloquearCobro(tx, tenantId, cobroId);
    if (cobro.estado !== 'CONFIRMADO')
      throw new ConflictException('El cobro no está confirmado');
    const venta = await this.bloquearVenta(tx, tenantId, ventaId);
    if (
      venta.estado !== 'COMPLETADA' ||
      venta.clienteComercialId !== cobro.clienteComercialId
    ) {
      throw new ConflictException(
        'La venta está anulada o el titular no coincide con el cobro',
      );
    }
    if (monto.gt(await this.disponible(tx, tenantId, cobroId, cobro.monto))) {
      throw new ConflictException(
        'La aplicación supera el dinero disponible del cobro',
      );
    }
    const aplicaciones = await tx.aplicacionCobro.aggregate({
      where: {
        tenantId,
        ventaId,
        cobro: { estado: 'CONFIRMADO' },
        reversionAplicacionCobro_aplicacion: { none: {} },
      },
      _sum: { monto: true },
    });
    const devoluciones = await tx.devolucionVenta.aggregate({
      where: { tenantId, ventaId, estado: 'APROBADA' },
      _sum: { total: true },
    });
    const pendiente = venta.total
      .minus(devoluciones._sum.total ?? 0)
      .minus(aplicaciones._sum.monto ?? 0);
    if (monto.gt(pendiente))
      throw new ConflictException('La aplicación supera el saldo de la venta');
    if (cuentaId !== undefined) {
      const cuenta = await this.cuentas.bloquear(tx, tenantId, cuentaId);
      if (
        cuenta.ventaId !== ventaId ||
        cuenta.clienteComercialId !== venta.clienteComercialId
      ) {
        throw new ConflictException('La cuenta no pertenece a la venta');
      }
      await this.cuentas.descontarAbono(tx, tenantId, cuentaId, monto);
    } else {
      const financiacion = await tx.cuentaPorCobrar.findUnique({
        where: { tenantId_ventaId: { tenantId, ventaId } },
        select: { id: true },
      });
      if (financiacion)
        throw new ConflictException('Aplique el abono a la cuenta por cobrar');
    }
    const aplicacion = await tx.aplicacionCobro.create({
      data: {
        tenantId,
        cobroId,
        ventaId,
        cuentaId,
        monto,
        clienteComercialId: venta.clienteComercialId,
        responsableId: membresiaId,
        claveIdempotencia: claveRecurso,
      },
    });
    await contexto.auditar(tx, {
      accion: ACCIONES_AUDITORIA.COBROS_APLICAR,
      recursoTipo: 'AplicacionCobro',
      recursoId: aplicacion.id,
    });
    return aplicacion;
  }

  async bloquearCobro(
    tx: Prisma.TransactionClient,
    tenantId: number,
    id: number,
  ) {
    const filas = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Cobro" WHERE "tenantId" = ${tenantId} AND id = ${id} FOR UPDATE
    `;
    if (!filas.length) throw new NotFoundException('Cobro no encontrado');
    return tx.cobro.findUniqueOrThrow({
      where: { tenantId_id: { tenantId, id } },
    });
  }

  async bloquearVenta(
    tx: Prisma.TransactionClient,
    tenantId: number,
    id: number,
  ) {
    const filas = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Venta" WHERE "tenantId" = ${tenantId} AND id = ${id} FOR UPDATE
    `;
    if (!filas.length) throw new NotFoundException('Venta no encontrada');
    return tx.venta.findUniqueOrThrow({
      where: { tenantId_id: { tenantId, id } },
    });
  }

  async disponible(
    tx: Prisma.TransactionClient,
    tenantId: number,
    cobroId: number,
    monto: Prisma.Decimal,
  ) {
    const aplicado = await tx.aplicacionCobro.aggregate({
      where: {
        tenantId,
        cobroId,
        reversionAplicacionCobro_aplicacion: { none: {} },
      },
      _sum: { monto: true },
    });
    const devuelto = await tx.reembolso.aggregate({
      where: { tenantId, cobroId, estado: 'CONFIRMADO' },
      _sum: { monto: true },
    });
    return monto
      .minus(aplicado._sum.monto ?? 0)
      .minus(devuelto._sum.monto ?? 0);
  }

  listar(
    tenantId: number,
    filtros: {
      clienteComercialId?: number;
      pagina?: number;
      limite?: number;
    } = {},
  ) {
    return this.prisma.cobro.findMany({
      where: { tenantId, clienteComercialId: filtros.clienteComercialId },
      omit: { claveIdempotencia: true },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      ...paginacion(filtros.pagina, filtros.limite),
    });
  }

  obtener(tenantId: number, id: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const cobro = await tx.cobro.findUnique({
          where: { tenantId_id: { tenantId, id } },
          omit: { claveIdempotencia: true },
          include: {
            aplicacionCobro_cobro: {
              orderBy: { id: 'asc' },
              select: {
                id: true,
                ventaId: true,
                cuentaId: true,
                monto: true,
                reversionAplicacionCobro_aplicacion: { select: { id: true } },
              },
            },
          },
        });
        if (!cobro) throw new NotFoundException('Cobro no encontrado');
        const montoDisponible =
          cobro.estado === 'CONFIRMADO'
            ? await this.disponible(tx, tenantId, id, cobro.monto)
            : new Prisma.Decimal(0);
        return { ...cobro, montoDisponible };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
