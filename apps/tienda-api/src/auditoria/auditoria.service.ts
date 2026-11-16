import { PermisosService } from '@app/permisos';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ContextoTienda } from '../auth';
import { paginacion } from '../comun/operacion-tienda';
import {
  detallarOperacion,
  resumenSelect,
  resumirOperacion,
} from './auditoria-presentacion';
import type { ConsultaAuditoriaDto } from './dto/consulta-auditoria.dto';

const maximoRangoMs = 48 * 60 * 60 * 1000;
const ordenReciente = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.AuditoriaOperacionOrderByWithRelationInput[];
const ultimaFila = Prisma.sql`NOT EXISTS (
  SELECT 1 FROM "AuditoriaOperacion" posterior
  WHERE posterior."tenantId" = a."tenantId" AND posterior."correlacionId" = a."correlacionId"
    AND (posterior."createdAt", posterior.id) > (a."createdAt", a.id)
)`;

@Injectable()
export class AuditoriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
  ) {}

  listar(contexto: ContextoTienda, filtros: ConsultaAuditoriaDto) {
    const desde = new Date(filtros.desde);
    const hasta = new Date(filtros.hasta);
    const duracion = hasta.getTime() - desde.getTime();
    if (!(duracion > 0 && duracion <= maximoRangoMs)) {
      throw new BadRequestException(
        'El rango debe ser positivo y de hasta 48 horas',
      );
    }

    const {
      pagina = 1,
      limite = 20,
      productoId,
      usuarioId,
      actor,
      rolCodigo,
      accion,
    } = filtros;
    const { skip, take } = paginacion(pagina, limite);
    const condiciones = [
      Prisma.sql`a."createdAt" >= ${desde} AND a."createdAt" < ${hasta}`,
    ];
    if (productoId !== undefined) {
      condiciones.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "AuditoriaOperacion" p
        WHERE p."tenantId" = a."tenantId" AND p."correlacionId" = a."correlacionId" AND p."productoId" = ${productoId}
      )`);
    }
    const campos = [
      ...(usuarioId === undefined
        ? []
        : [Prisma.sql`f."usuarioId" = ${usuarioId}`]),
      ...(actor === undefined
        ? []
        : [Prisma.sql`f.actor = ${actor}::"TipoActorOperacion"`]),
      ...(rolCodigo === undefined
        ? []
        : [Prisma.sql`f."rolCodigo" = ${rolCodigo.trim()}`]),
      ...(accion === undefined
        ? []
        : [Prisma.sql`f.accion = ${accion.trim()}`]),
    ];
    if (campos.length) {
      condiciones.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "AuditoriaOperacion" f
        WHERE f."tenantId" = a."tenantId" AND f."correlacionId" = a."correlacionId"
          AND ${Prisma.join(campos, ' AND ')}
      )`);
    }
    const tenantId = contexto.tenantId;
    const candidatos = Prisma.sql`a."tenantId" = ${tenantId} AND ${Prisma.join(condiciones, ' AND ')} AND ${ultimaFila}`;
    return this.consultar(contexto, async (tx) => {
      const [{ cantidad }] = await tx.$queryRaw<{ cantidad: bigint }[]>`
        SELECT count(*) AS cantidad FROM "AuditoriaOperacion" a WHERE ${candidatos}
      `;
      const total = Number(cantidad);
      const data =
        skip < total
          ? await this.resumenes(tx, tenantId, candidatos, take, skip)
          : [];
      return {
        data,
        meta: { pagina, limite, total, paginas: Math.ceil(total / limite) },
      };
    });
  }

  actividadReciente(contexto: ContextoTienda) {
    const tenantId = contexto.tenantId;
    const candidatos = Prisma.sql`a."tenantId" = ${tenantId} AND ${ultimaFila}`;
    return this.consultar(contexto, async (tx) => ({
      data: await this.resumenes(tx, tenantId, candidatos, 10),
    }));
  }

  detalle(contexto: ContextoTienda, correlacionId: string) {
    return this.consultar(contexto, async (tx) => {
      const filas = await tx.auditoriaOperacion.findMany({
        where: { tenantId: contexto.tenantId, correlacionId },
        select: {
          ...resumenSelect,
          entidadTipo: true,
          entidadId: true,
          motivo: true,
          datos: true,
          productoId: true,
        },
        orderBy: ordenReciente,
      });
      const [ultima] = filas;
      if (!ultima)
        throw new NotFoundException('Operación de auditoría no encontrada');
      return detallarOperacion(ultima, filas);
    });
  }

  private async resumenes(
    tx: Prisma.TransactionClient,
    tenantId: number,
    candidatos: Prisma.Sql,
    limite: number,
    skip = 0,
  ) {
    const ids = await tx.$queryRaw<{ id: number }[]>`
      SELECT a.id FROM "AuditoriaOperacion" a WHERE ${candidatos}
      ORDER BY a."createdAt" DESC, a.id DESC LIMIT ${limite} OFFSET ${skip}
    `;
    if (!ids.length) return [];
    const filas = await tx.auditoriaOperacion.findMany({
      where: { tenantId, id: { in: ids.map(({ id }) => id) } },
      select: resumenSelect,
      orderBy: ordenReciente,
    });
    return filas.map(resumirOperacion);
  }

  private consultar<T>(
    contexto: ContextoTienda,
    consulta: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.permisos.autorizar(contexto, 'store.audit.read', tx);
        return consulta(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
