import { PrismaService } from '@app/prisma';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma, TipoMovimientoCaja } from '@prisma/client';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import {
  conflictoUnicidad,
  ContextoOperacionTienda,
  importeTienda,
  paginacion,
  textoObligatorio,
} from '../comun/operacion-tienda';
import { CreateCajaDto } from './dto/create-caja.dto';
import { UpdateCajaDto } from './dto/update-caja.dto';

type OrigenMovimiento =
  | { tipo: 'manual'; direccion: TipoMovimientoCaja }
  | { tipo: 'cobro' | 'reembolso' | 'gasto'; id: number };

@Injectable()
export class CajaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencia: IdempotenciaService,
  ) {}

  listarCajas(tenantId: number, disponibles = false) {
    return this.prisma.caja.findMany({
      where: {
        tenantId,
        ...(disponibles && {
          activo: true,
          turnoCaja_caja: { none: { estado: 'ABIERTO' } },
        }),
      },
      include: {
        turnoCaja_caja: {
          where: { estado: 'ABIERTO' },
          select: { id: true, cajeroId: true, aperturaAt: true },
        },
      },
      orderBy: [{ codigo: 'asc' }, { id: 'asc' }],
    });
  }

  async configurar(
    contexto: ContextoOperacionTienda,
    datos: { codigo: string; nombre: string; activo?: boolean },
    id?: number,
  ) {
    const { tenantId } = contexto;
    const codigo = textoObligatorio(datos.codigo, 'Código');
    const nombre = textoObligatorio(datos.nombre, 'Nombre');
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (id !== undefined) {
          await this.bloquearCaja(tx, tenantId, id);
          if (
            datos.activo === false &&
            (await this.buscarTurno(tx, tenantId, id))
          ) {
            throw new ConflictException(
              'Cierre el turno antes de desactivar la caja',
            );
          }
        }
        const caja =
          id === undefined
            ? await tx.caja.create({
                data: { tenantId, codigo, nombre, activo: datos.activo },
              })
            : await tx.caja.update({
                where: { tenantId_id: { tenantId, id } },
                data: { codigo, nombre, activo: datos.activo },
              });
        await contexto.auditar(tx, {
          accion: 'caja.configurar',
          recursoTipo: 'Caja',
          recursoId: caja.id,
        });
        return caja;
      });
    } catch (error) {
      conflictoUnicidad(error, 'Ya existe una caja con ese código');
    }
  }

  turnoActivo(tenantId: number, cajaId: number) {
    return this.buscarTurno(this.prisma, tenantId, cajaId);
  }

  async abrirTurno(
    contexto: ContextoOperacionTienda,
    cajaId: number,
    monto: string,
    clave: string | undefined,
  ) {
    const { tenantId, usuarioId, membresiaId } = contexto;
    const fondoInicial = importeTienda(monto, true);
    try {
      return await this.idempotencia.ejecutar(
        {
          tenantId,
          usuarioId,
          clave,
          operacion: 'caja.abrir',
          datos: { cajaId, fondoInicial: fondoInicial.toFixed(2) },
        },
        async (tx) => {
          const caja = await this.bloquearCaja(tx, tenantId, cajaId);
          if (!caja.activo)
            throw new ConflictException('La caja está inactiva');
          const cajero = await tx.userTenant.findFirst({
            where: { tenantId, usuarioId, id: membresiaId, estado: 'ACTIVO' },
            select: { id: true },
          });
          if (!cajero)
            throw new ForbiddenException(
              'La membresía del cajero no está activa en el negocio',
            );
          if (await this.buscarTurno(tx, tenantId, cajaId)) {
            throw new ConflictException('La caja ya tiene un turno abierto');
          }
          const turno = await tx.turnoCaja.create({
            data: { tenantId, cajaId, cajeroId: cajero.id, fondoInicial },
          });
          await contexto.auditar(tx, {
            accion: 'caja.abrir',
            recursoTipo: 'TurnoCaja',
            recursoId: turno.id,
          });
          return { recursoTipo: 'TurnoCaja', recursoId: turno.id };
        },
      );
    } catch (error) {
      conflictoUnicidad(error, 'La caja ya tiene un turno abierto');
    }
  }

  async bloquearTurnoAbierto(
    tx: Prisma.TransactionClient,
    contexto: Pick<ContextoOperacionTienda, 'tenantId' | 'membresiaId'>,
    turnoId: number,
    cierreSupervisado = false,
  ) {
    const { tenantId, membresiaId } = contexto;
    const [turno] = await tx.$queryRaw<
      {
        id: number;
        estado: 'ABIERTO' | 'CERRADO';
        cajeroId: number;
        fondoInicial: Prisma.Decimal;
      }[]
    >`
      SELECT id, estado, "cajeroId", "fondoInicial" FROM "TurnoCaja"
      WHERE "tenantId" = ${tenantId} AND id = ${turnoId} FOR UPDATE
    `;
    if (!turno) throw new NotFoundException('Turno de caja no encontrado');
    if (turno.estado !== 'ABIERTO')
      throw new ConflictException('El turno está cerrado');
    if (turno.cajeroId !== membresiaId && !cierreSupervisado) {
      throw new ForbiddenException('El turno pertenece a otro cajero');
    }
    return turno;
  }

  async registrarMovimiento(
    tx: Prisma.TransactionClient,
    contexto: ContextoOperacionTienda,
    datos: {
      turnoId: number;
      monto: Prisma.Decimal;
      motivo: string;
      claveRecurso: string;
      origen: OrigenMovimiento;
    },
  ) {
    const { tenantId, membresiaId } = contexto;
    const { turnoId, origen, claveRecurso } = datos;
    const turno = await this.bloquearTurnoAbierto(tx, contexto, turnoId);
    const monto = importeTienda(datos.monto);
    const motivo = textoObligatorio(datos.motivo, 'Motivo');
    const tipo =
      origen.tipo === 'manual'
        ? origen.direccion
        : origen.tipo === 'cobro'
          ? 'ENTRADA'
          : 'SALIDA';
    if (
      tipo === 'SALIDA' &&
      monto.gt(
        await this.calcularEfectivo(tx, tenantId, turnoId, turno.fondoInicial),
      )
    ) {
      throw new ConflictException('La salida supera el efectivo disponible');
    }
    return tx.movimientoCaja.create({
      data: {
        tenantId,
        turnoId,
        responsableId: membresiaId,
        monto,
        motivo,
        tipo,
        claveIdempotencia: claveRecurso,
        cobroId: origen.tipo === 'cobro' ? origen.id : undefined,
        reembolsoId: origen.tipo === 'reembolso' ? origen.id : undefined,
        gastoId: origen.tipo === 'gasto' ? origen.id : undefined,
      },
    });
  }

  moverEfectivo(
    contexto: ContextoOperacionTienda,
    datos: {
      turnoId: number;
      monto: string;
      motivo: string;
      direccion: TipoMovimientoCaja;
    },
    clave: string | undefined,
  ) {
    const { tenantId, usuarioId } = contexto;
    const { turnoId, direccion } = datos;
    const monto = importeTienda(datos.monto);
    const motivo = textoObligatorio(datos.motivo, 'Motivo');
    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'caja.movimiento',
        datos: { turnoId, direccion, motivo, monto: monto.toFixed(2) },
      },
      async (tx, claveRecurso) => {
        const movimiento = await this.registrarMovimiento(tx, contexto, {
          turnoId,
          monto,
          motivo,
          claveRecurso,
          origen: { tipo: 'manual', direccion },
        });
        await contexto.auditar(tx, {
          accion: 'caja.movimiento',
          recursoTipo: 'MovimientoCaja',
          recursoId: movimiento.id,
          motivo,
        });
        return { recursoTipo: 'MovimientoCaja', recursoId: movimiento.id };
      },
    );
  }

  cerrarTurno(
    contexto: ContextoOperacionTienda,
    datos: { turnoId: number; efectivoContado: string; motivo?: string },
    clave: string | undefined,
    cierreSupervisado = false,
  ) {
    const { tenantId, usuarioId, membresiaId } = contexto;
    const { turnoId } = datos;
    const efectivoContado = importeTienda(datos.efectivoContado, true);
    const motivo = datos.motivo?.trim() || null;
    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'caja.cerrar',
        datos: { turnoId, efectivoContado: efectivoContado.toFixed(2), motivo },
      },
      async (tx) => {
        const { cajaId } = await this.obtenerTurno(tenantId, turnoId, tx);
        await this.bloquearCaja(tx, tenantId, cajaId);
        const { fondoInicial } = await this.bloquearTurnoAbierto(
          tx,
          contexto,
          turnoId,
          cierreSupervisado,
        );
        const efectivoEsperado = await this.calcularEfectivo(
          tx,
          tenantId,
          turnoId,
          fondoInicial,
        );
        await tx.turnoCaja.update({
          where: { tenantId_id: { tenantId, id: turnoId } },
          data: {
            estado: 'CERRADO',
            cierreAt: new Date(),
            cerradoPorId: membresiaId,
            efectivoEsperado,
            efectivoContado,
            diferencia: efectivoContado.minus(efectivoEsperado),
            motivoCierre: motivo,
          },
        });
        await contexto.auditar(tx, {
          accion: 'caja.cerrar',
          recursoTipo: 'TurnoCaja',
          recursoId: turnoId,
          motivo: motivo ?? undefined,
        });
        return { recursoTipo: 'TurnoCaja', recursoId: turnoId };
      },
    );
  }

  async obtenerTurno(
    tenantId: number,
    id: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const turno = await tx.turnoCaja.findUnique({
      where: { tenantId_id: { tenantId, id } },
    });
    if (!turno) throw new NotFoundException('Turno de caja no encontrado');
    return turno;
  }

  async listarMovimientos(
    tenantId: number,
    turnoId: number,
    pagina?: number,
    limite?: number,
  ) {
    await this.obtenerTurno(tenantId, turnoId);
    return this.prisma.movimientoCaja.findMany({
      where: { tenantId, turnoId },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      ...paginacion(pagina, limite),
    });
  }

  private async calcularEfectivo(
    tx: Prisma.TransactionClient,
    tenantId: number,
    turnoId: number,
    fondo: Prisma.Decimal,
  ) {
    const movimientos = await tx.movimientoCaja.groupBy({
      by: ['tipo'],
      where: { tenantId, turnoId },
      _sum: { monto: true },
    });
    return movimientos.reduce((saldo, movimiento) => {
      const monto = movimiento._sum.monto ?? 0;
      return movimiento.tipo === 'ENTRADA'
        ? saldo.plus(monto)
        : saldo.minus(monto);
    }, fondo);
  }

  private async bloquearCaja(
    tx: Prisma.TransactionClient,
    tenantId: number,
    id: number,
  ) {
    const [caja] = await tx.$queryRaw<{ id: number; activo: boolean }[]>`
      SELECT id, activo FROM "Caja" WHERE "tenantId" = ${tenantId} AND id = ${id} FOR UPDATE
    `;
    if (!caja) throw new NotFoundException('Caja no encontrada');
    return caja;
  }

  private buscarTurno(
    tx: Prisma.TransactionClient,
    tenantId: number,
    cajaId: number,
  ) {
    return tx.turnoCaja.findFirst({
      where: { tenantId, cajaId, estado: 'ABIERTO' },
    });
  }

  create(createCajaDto: CreateCajaDto): never {
    void createCajaDto;
    throw new NotImplementedException();
  }

  findAll(): never {
    throw new NotImplementedException();
  }

  findOne(id: number): never {
    void id;
    throw new NotImplementedException();
  }

  update(id: number, updateCajaDto: UpdateCajaDto): never {
    void id;
    void updateCajaDto;
    throw new NotImplementedException();
  }

  remove(id: number): never {
    void id;
    throw new NotImplementedException();
  }
}
