import { randomUUID } from 'node:crypto';
import { InventarioLotesService } from '@app/inventario';
import { PermisosService } from '@app/permisos';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACCIONES_AUDITORIA,
  AuditoriaEscrituraService,
} from '../auditoria/auditoria-escritura';
import type { ContextoTienda } from '../auth';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import { conflictoUnicidad, paginacion } from '../comun/operacion-tienda';
import type {
  LotesInventarioDto,
  MovimientosInventarioDto,
  ProductosInventarioDto,
} from './dto/consulta-inventario.dto';
import type { RegistrarEntradaInventarioDto } from './dto/entrada-inventario.dto';

const lectura = 'store.inventory.read';
const recepcion = 'store.inventory.receive';
const lecturaConCostos = [lectura, 'store.inventory.cost.read'] as const;
const stockSelect = {
  id: true,
  tenantId: true,
  nombre: true,
  sku: true,
  precio: true,
  estado: true,
  modoInventario: true,
  stock: true,
  stockReservado: true,
} satisfies Prisma.ProductoSelect;

function resultadoPagina<T>(
  data: T[],
  total: number,
  pagina: number,
  limite: number,
) {
  return {
    data,
    meta: { pagina, limite, total, paginas: Math.ceil(total / limite) },
  };
}

@Injectable()
export class InventarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioLotesService,
    private readonly permisos: PermisosService,
    private readonly idempotencia: IdempotenciaService,
    private readonly auditoria: AuditoriaEscrituraService,
  ) {}

  async registrarEntrada(
    contexto: ContextoTienda,
    productoId: number,
    tipo: 'APERTURA' | 'ENTRADA',
    clave: string | undefined,
    datos: RegistrarEntradaInventarioDto,
  ) {
    await this.permisos.autorizar(contexto, recepcion);
    const { tenantId, usuarioId, membresiaId: responsableId } = contexto;
    const motivo = datos.motivo.trim();
    const referenciaExterna = datos.referenciaExterna?.trim() ?? null;
    const lotes = datos.lotes.map(
      ({ codigo, cantidad, costoUnitario, vencimiento }) => {
        const fecha =
          vencimiento === undefined ? undefined : new Date(vencimiento);
        if (fecha && !Number.isFinite(fecha.getTime())) {
          throw new BadRequestException('Vencimiento inválido');
        }
        return {
          codigo: codigo.trim(),
          cantidad,
          costoUnitario: new Prisma.Decimal(costoUnitario),
          vencimiento: fecha,
        };
      },
    );

    try {
      return await this.idempotencia.ejecutar(
        {
          tenantId,
          usuarioId,
          operacion:
            tipo === 'APERTURA' ? 'inventario.apertura' : 'inventario.entrada',
          clave,
          datos: {
            productoId,
            motivo,
            referenciaExterna,
            lotes: lotes.map((lote) => ({
              ...lote,
              costoUnitario: lote.costoUnitario.toFixed(4),
              vencimiento: lote.vencimiento?.toISOString() ?? null,
            })),
          },
        },
        async (tx, claveRecurso) => {
          await this.permisos.autorizar(contexto, recepcion, tx);
          const correlacionId = randomUUID();
          const { entrada, lotes: lotesCreados } =
            await this.inventario.registrarEntrada(
              tx,
              { tenantId, responsableId, clave: claveRecurso, correlacionId },
              productoId,
              tipo,
              motivo,
              lotes,
              {
                referenciaExterna: referenciaExterna ?? undefined,
                exigirVigencia: true,
              },
            );
          await this.auditoria.registrar(tx, contexto, {
            accion: ACCIONES_AUDITORIA.INVENTARIO_ENTRADA,
            entidadTipo: 'EntradaInventario',
            entidadId: entrada.id,
            motivo,
            correlacionId,
            productoIds: [productoId],
            datos: {
              tipo,
              referenciaExterna,
              loteIds: lotesCreados.map(({ id }) => id),
            },
          });
          return {
            recursoTipo: 'EntradaInventario',
            recursoId: entrada.id,
          };
        },
      );
    } catch (error) {
      conflictoUnicidad(error, 'La entrada de inventario ya está registrada');
    }
  }

  listarProductos(
    contexto: ContextoTienda,
    { q, activo, pagina = 1, limite = 20 }: ProductosInventarioDto,
  ) {
    const { skip, take } = paginacion(pagina, limite);
    const texto = q?.trim().replace(/[\\%_]/g, '\\$&');
    const contiene = { contains: texto, mode: 'insensitive' as const };
    const where: Prisma.ProductoWhereInput = {
      tenantId: contexto.tenantId,
      estado: activo,
      ...(texto && { OR: [{ nombre: contiene }, { sku: contiene }] }),
    };
    return this.consultar(contexto, false, async (tx) => {
      const [productos, total] = await Promise.all([
        tx.producto.findMany({
          where,
          select: stockSelect,
          skip,
          take,
          orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        }),
        tx.producto.count({ where }),
      ]);
      const disponibles = await this.inventario.consultarDisponibles(
        tx,
        contexto.tenantId,
        productos,
        new Date(),
      );
      return resultadoPagina(
        productos.map((producto) => ({
          productoId: producto.id,
          nombre: producto.nombre,
          sku: producto.sku,
          estado: producto.estado,
          modoInventario: producto.modoInventario,
          stockFisico: producto.stock,
          stockReservado: producto.stockReservado,
          stockDisponible: disponibles.get(producto.id) ?? 0,
        })),
        total,
        pagina,
        limite,
      );
    });
  }

  listarLotes(
    contexto: ContextoTienda,
    productoId: number,
    {
      soloVendibles = true,
      incluirCostos = false,
      pagina = 1,
      limite = 20,
    }: LotesInventarioDto,
  ) {
    const { skip, take } = paginacion(pagina, limite);
    return this.consultar(contexto, incluirCostos, async (tx) => {
      const { tenantId } = contexto;
      const producto = await this.producto(tx, tenantId, productoId);
      const ahora = new Date();
      const disponibles = await this.inventario.consultarDisponibles(
        tx,
        tenantId,
        [producto],
        ahora,
      );
      const disponible = disponibles.get(productoId) ?? 0;
      if (soloVendibles && disponible === 0)
        return resultadoPagina([], 0, pagina, limite);
      const where: Prisma.LoteInventarioWhereInput = {
        tenantId,
        productoId,
        ...(soloVendibles && {
          cantidadFisica: { gt: 0 },
          OR: [{ vencimiento: null }, { vencimiento: { gt: ahora } }],
        }),
      };
      const [lotes, total] = await Promise.all([
        tx.loteInventario.findMany({
          where,
          skip,
          take,
          orderBy: [
            { vencimiento: { sort: 'asc', nulls: 'last' } },
            { id: 'asc' },
          ],
          select: {
            id: true,
            codigo: true,
            vencimiento: true,
            cantidadFisica: true,
            costoUnitario: incluirCostos,
          },
        }),
        tx.loteInventario.count({ where }),
      ]);
      return resultadoPagina(
        lotes.map((lote) => ({
          loteId: lote.id,
          codigo: lote.codigo,
          vencimiento: lote.vencimiento,
          cantidadDisponible:
            lote.vencimiento === null || lote.vencimiento > ahora
              ? Math.min(lote.cantidadFisica, disponible)
              : 0,
          ...(incluirCostos && {
            costoUnitario: lote.costoUnitario.toFixed(4),
          }),
        })),
        total,
        pagina,
        limite,
      );
    });
  }

  listarMovimientos(
    contexto: ContextoTienda,
    productoId: number,
    {
      tipo,
      desde,
      hasta,
      incluirCostos = false,
      pagina = 1,
      limite = 20,
    }: MovimientosInventarioDto,
  ) {
    const { skip, take } = paginacion(pagina, limite);
    const inicio = desde === undefined ? undefined : new Date(desde);
    const fin = hasta === undefined ? undefined : new Date(hasta);
    if (inicio && fin && inicio >= fin)
      throw new BadRequestException('desde debe ser anterior a hasta');
    const where: Prisma.MovimientoInventarioWhereInput = {
      tenantId: contexto.tenantId,
      productoId,
      tipo,
      fecha: inicio || fin ? { gte: inicio, lt: fin } : undefined,
    };
    return this.consultar(contexto, incluirCostos, async (tx) => {
      await this.producto(tx, contexto.tenantId, productoId);
      const [filas, total] = await Promise.all([
        tx.movimientoInventario.findMany({
          where,
          skip,
          take,
          orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            tipo: true,
            fecha: true,
            deltaFisico: true,
            deltaReservado: true,
            loteId: true,
            responsableId: true,
            motivo: true,
            correlacionId: true,
            costoUnitario: incluirCostos,
            costoTotal: incluirCostos,
          },
        }),
        tx.movimientoInventario.count({ where }),
      ]);
      return resultadoPagina(
        filas.map(({ id, costoUnitario, costoTotal, ...movimiento }) => ({
          movimientoId: id,
          ...movimiento,
          ...(incluirCostos && {
            costoUnitario: costoUnitario?.toFixed(4) ?? null,
            costoTotal: costoTotal?.toFixed(4) ?? null,
          }),
        })),
        total,
        pagina,
        limite,
      );
    });
  }

  private async producto(
    tx: Prisma.TransactionClient,
    tenantId: number,
    productoId: number,
  ) {
    const producto = await tx.producto.findUnique({
      where: { tenantId_id: { tenantId, id: productoId } },
      select: stockSelect,
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return producto;
  }

  private consultar<T>(
    contexto: ContextoTienda,
    incluirCostos: boolean,
    operacion: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.permisos.autorizar(
          contexto,
          incluirCostos ? lecturaConCostos : lectura,
          tx,
        );
        return operacion(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
