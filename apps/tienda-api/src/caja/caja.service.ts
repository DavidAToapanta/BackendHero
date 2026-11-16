import { PrismaService } from '@app/prisma';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import {
  conflictoUnicidad,
  ContextoOperacionTienda,
  importeTienda,
  textoObligatorio,
} from '../comun/operacion-tienda';
import { CreateCajaDto } from './dto/create-caja.dto';
import { UpdateCajaDto } from './dto/update-caja.dto';

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
