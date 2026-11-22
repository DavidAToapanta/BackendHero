import { randomUUID } from 'node:crypto';
import {
  InventarioLotesService,
  InventarioService,
  ReservasInventarioService,
} from '@app/inventario';
import { PermisosService } from '@app/permisos';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoPedido, Prisma } from '@prisma/client';
import {
  ACCIONES_AUDITORIA,
  AuditoriaEscrituraService,
} from '../auditoria/auditoria-escritura';
import type { ContextoTienda } from '../auth';
import { CajaService } from '../caja/caja.service';
import { CuentasService } from '../cartera/cuentas.service';
import { ClientesService } from '../clientes/clientes.service';
import { CarritoService } from '../carrito/carrito.service';
import { CatalogoService } from '../catalogo/catalogo.service';
import { CobrosOperacionService } from '../cobros/cobros-operacion.service';
import { fechaComercial, inicioFechaComercial } from '../comun/fecha-comercial';
import { IdempotenciaService } from '../comun/idempotencia/idempotencia.service';
import {
  desglosarIva,
  tarifaIvaVigente,
  totalesConIva,
} from '../comun/iva-tienda';
import { importeTienda, textoObligatorio } from '../comun/operacion-tienda';
import { PortalService, type ClientePortal } from '../portal/portal.service';
import type { EntregarPedidoDto } from './pedidos.dto';

const abiertos: EstadoPedido[] = ['CONFIRMADO', 'EN_PREPARACION'];
const relaciones = {
  detallePedido_pedido: { orderBy: { productoId: 'asc' } },
  historialEstadoPedido_pedido: { orderBy: { id: 'asc' } },
  venta_pedido: { select: { id: true } },
} satisfies Prisma.PedidoInclude;

type ActorPedido = {
  usuarioId?: number;
  membresiaId?: number;
  rolEfectivo?: ContextoTienda['rolEfectivo'];
};

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portal: PortalService,
    private readonly carrito: CarritoService,
    private readonly catalogo: CatalogoService,
    private readonly inventario: InventarioService,
    private readonly lotes: InventarioLotesService,
    private readonly cuentas: CuentasService,
    private readonly clientes: ClientesService,
    private readonly permisos: PermisosService,
    private readonly reservas: ReservasInventarioService,
    private readonly idempotencia: IdempotenciaService,
    private readonly caja: CajaService,
    private readonly cobros: CobrosOperacionService,
    private readonly auditoria: AuditoriaEscrituraService,
  ) {}

  async listar(
    tenantId: number,
    skip: number,
    take: number,
    clienteComercialId?: number,
  ) {
    await this.expirarPendientes({ tenantId, clienteComercialId });
    const pedidos = await this.prisma.pedido.findMany({
      where: { tenantId, clienteComercialId },
      orderBy: { id: 'desc' },
      skip,
      take,
      select: {
        id: true,
        numero: true,
        estado: true,
        total: true,
        reservaHasta: true,
        entregadoAt: true,
        clienteComercialId: true,
      },
    });
    return pedidos;
  }

  async obtener(tenantId: number, id: number, clienteComercialId?: number) {
    await this.expirar(tenantId, id, clienteComercialId);
    const pedido = await this.prisma.pedido.findFirst({
      where: { tenantId, id, clienteComercialId },
      include: relaciones,
      omit: { claveIdempotencia: true },
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    return pedido;
  }

  async confirmar(
    cliente: ClientePortal,
    carritoId: number,
    clave: string | undefined,
  ) {
    const { tenantId, clienteComercialId, usuarioId } = cliente;
    const correlacionId = randomUUID();
    const borrador = await this.prisma.detalleCarrito.findMany({
      where: {
        tenantId,
        carritoId,
        carrito: { clienteComercialId, estado: 'ACTIVO' },
      },
      select: { productoId: true },
    });
    if (borrador.length) {
      await this.expirarPendientes({
        tenantId,
        detallePedido_pedido: {
          some: {
            productoId: { in: borrador.map(({ productoId }) => productoId) },
          },
        },
      });
    }
    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'pedidos.confirmar',
        datos: { carritoId, clienteComercialId },
      },
      async (tx, claveRecurso) => {
        await this.portal.bloquearVinculo(tx, cliente);
        await this.carrito.bloquearActivo(tx, cliente, carritoId);
        const lineas = await tx.detalleCarrito.findMany({
          where: { tenantId, carritoId },
          orderBy: { productoId: 'asc' },
        });
        if (!lineas.length)
          throw new BadRequestException('El carrito está vacío');
        const productos = await this.inventario.bloquearProductos(
          tx,
          tenantId,
          lineas.map((linea) => linea.productoId),
        );
        if (productos.length !== lineas.length)
          throw new NotFoundException('Producto no encontrado');
        const cero = new Prisma.Decimal(0);
        const confirmadoAt = new Date();
        const tasa =
          (await tarifaIvaVigente(tx, tenantId, confirmadoAt))?.porcentaje ??
          cero;
        const detalles: (Omit<
          Prisma.DetallePedidoCreateManyInput,
          'tenantId' | 'pedidoId'
        > &
          ReturnType<typeof desglosarIva>)[] = [];
        for (const { productoId, cantidad } of lineas) {
          const ficha = await this.catalogo.obtenerSnapshotVenta(
            tx,
            tenantId,
            productoId,
            tasa,
          );
          const importes = desglosarIva(
            ficha.precioUnitario,
            cantidad,
            ficha.tasaImpuesto ?? cero,
            ficha.unidadVenta,
          );
          detalles.push({ ...ficha, cantidad, ...importes });
        }
        const totales = totalesConIva(detalles);
        const pedido = await tx.pedido.create({
          data: {
            tenantId,
            clienteComercialId,
            carritoId,
            numero: randomUUID(),
            claveIdempotencia: claveRecurso,
            ...totales,
            confirmadoAt,
            reservaHasta: new Date(confirmadoAt.getTime() + 3_600_000),
          },
        });
        for (const linea of detalles) {
          const detalle = await tx.detallePedido.create({
            data: { ...linea, tenantId, pedidoId: pedido.id },
          });
          await this.reservas.reservar(
            tx,
            {
              tenantId,
              responsableId: null,
              correlacionId,
              clave: claveRecurso,
            },
            pedido.id,
            detalle.id,
          );
        }
        await tx.carrito.update({
          where: { id: carritoId },
          data: { estado: 'CONFIRMADO' },
        });
        await this.registrarEstado(
          tx,
          pedido,
          'CONFIRMADO',
          cliente,
          correlacionId,
          undefined,
          true,
        );
        return { recursoTipo: 'Pedido', recursoId: pedido.id };
      },
    );
  }

  async cancelar(
    actor: ClientePortal | ContextoTienda,
    id: number,
    motivo: string,
  ) {
    const { tenantId } = actor;
    const cliente = 'vinculacionId' in actor ? actor : undefined;
    const clienteComercialId = cliente?.clienteComercialId;
    await this.expirar(tenantId, id, clienteComercialId);
    return this.prisma.$transaction(async (tx) => {
      if (cliente) await this.portal.bloquearVinculo(tx, cliente);
      const pedido = await this.bloquear(tx, tenantId, id, clienteComercialId);
      if (pedido.estado === 'CANCELADO') return { id, estado: pedido.estado };
      this.exigirVigente(pedido);
      await this.liberar(
        tx,
        pedido,
        'CANCELADO',
        textoObligatorio(motivo, 'motivo'),
        actor,
      );
      return { id, estado: 'CANCELADO' };
    });
  }

  async preparar(staff: ContextoTienda, id: number) {
    await this.expirar(staff.tenantId, id);
    return this.prisma.$transaction(async (tx) => {
      const pedido = await this.bloquear(tx, staff.tenantId, id);
      this.exigirVigente(pedido);
      if (pedido.estado === 'CONFIRMADO') {
        await tx.pedido.update({
          where: { id },
          data: { estado: 'EN_PREPARACION' },
        });
        await this.registrarEstado(
          tx,
          pedido,
          'EN_PREPARACION',
          staff,
          randomUUID(),
        );
      }
      return { id, estado: 'EN_PREPARACION' };
    });
  }

  async entregar(
    staff: ContextoTienda,
    id: number,
    { turnoId, pago, lineas, vencimiento }: EntregarPedidoDto,
    clave: string | undefined,
  ) {
    const { tenantId, usuarioId, membresiaId } = staff;
    const referencia = pago?.referencia?.trim() || null;
    const importe = importeTienda(pago?.monto ?? '0', true);
    if (!pago && !vencimiento)
      throw new BadRequestException('Indica el pago para entregar el pedido');
    if (vencimiento) await this.permisos.autorizar(staff, 'store.sales.credit');
    const fechaVencimiento = vencimiento
      ? inicioFechaComercial(vencimiento)
      : null;
    const seleccion = lineas
      .map(({ productoId, cantidad, lotes }) => ({
        productoId,
        cantidad,
        lotes: lotes
          .map(({ loteId, cantidad }) => ({ loteId, cantidad }))
          .sort((a, b) => a.loteId - b.loteId),
      }))
      .sort((a, b) => a.productoId - b.productoId);
    const correlacionId = randomUUID();
    const contexto = this.auditoria.paraOperacion(staff, correlacionId);
    await this.expirar(tenantId, id);
    return this.idempotencia.ejecutar(
      {
        tenantId,
        usuarioId,
        clave,
        operacion: 'pedidos.entregar',
        datos: {
          id,
          turnoId,
          lineas: seleccion,
          pago: pago
            ? { metodo: pago.metodo, monto: importe.toFixed(2), referencia }
            : null,
          vencimiento: vencimiento ?? null,
        },
      },
      async (tx, claveRecurso) => {
        await this.caja.bloquearTurnoAbierto(tx, contexto, turnoId);
        const pedido = await this.bloquear(tx, tenantId, id);
        this.exigirVigente(pedido);
        if (pedido.estado !== 'EN_PREPARACION')
          throw new ConflictException('El pedido debe estar en preparación');
        const financiado = pedido.total.minus(importe);
        if (!fechaVencimiento && !financiado.isZero())
          throw new BadRequestException(
            'El cobro debe coincidir con el total confirmado',
          );
        if (fechaVencimiento) {
          if (
            !vencimiento ||
            vencimiento < fechaComercial(new Date()) ||
            financiado.lte(0)
          ) {
            throw new BadRequestException(
              'El crédito requiere vencimiento vigente y un pago inicial menor al total',
            );
          }
          await this.clientes.obtenerActivo(
            tx,
            tenantId,
            pedido.clienteComercialId,
          );
        }
        const detalles = await tx.detallePedido.findMany({
          where: { tenantId, pedidoId: id },
          orderBy: { productoId: 'asc' },
          include: { reservaInventario_detallePedido: true },
        });
        const cantidades = new Map(
          detalles.map(({ productoId, cantidad }) => [productoId, cantidad]),
        );
        if (
          seleccion.length !== detalles.length ||
          new Set(seleccion.map(({ productoId }) => productoId)).size !==
            detalles.length ||
          seleccion.some(
            ({ productoId, cantidad }) =>
              cantidades.get(productoId) !== cantidad,
          )
        ) {
          throw new BadRequestException(
            'Selecciona los lotes para todos los productos y cantidades del pedido',
          );
        }
        for (const linea of detalles) {
          const [reserva] = linea.reservaInventario_detallePedido;
          if (
            !reserva ||
            reserva.estado !== 'ACTIVA' ||
            reserva.cantidad !== linea.cantidad
          ) {
            throw new ConflictException('Falta la reserva activa del producto');
          }
        }
        const seleccionValidada = await this.lotes.validarSeleccionVenta(
          tx,
          tenantId,
          seleccion,
          cantidades,
        );
        const porProducto = new Map(
          seleccionValidada.map((linea) => [linea.productoId, linea.lotes]),
        );
        const entregadoAt = new Date();
        this.exigirVigente(pedido);
        await tx.pedido.update({
          where: { id },
          data: { estado: 'ENTREGADO', entregadoAt },
        });
        const { clienteComercialId, subtotal, descuento, impuesto, total } =
          pedido;
        const venta = await tx.venta.create({
          data: {
            tenantId,
            clienteComercialId,
            pedidoId: id,
            responsableId: membresiaId,
            origen: 'PORTAL',
            subtotal,
            descuento,
            impuesto,
            total,
            claveIdempotencia: claveRecurso,
          },
        });
        const operacion = {
          tenantId,
          responsableId: membresiaId,
          clave: claveRecurso,
          correlacionId,
        };
        for (const linea of detalles) {
          const {
            productoId,
            cantidad,
            nombreProducto,
            presentacionProducto,
            skuProducto,
            codigoBarrasProducto,
            categoriaId,
            categoriaNombre,
            precioUnitario,
            unidadVenta,
            descuento,
            tasaImpuesto,
            subtotal,
            impuesto,
            total,
          } = linea;
          const [reserva] = linea.reservaInventario_detallePedido;
          if (!reserva)
            throw new ConflictException('Falta la reserva del producto');
          const detalle = await tx.detalleVenta.create({
            data: {
              tenantId,
              ventaId: venta.id,
              productoId,
              cantidad,
              nombreProducto,
              presentacionProducto,
              skuProducto,
              codigoBarrasProducto,
              categoriaId,
              categoriaNombre,
              precioUnitario,
              unidadVenta,
              descuento,
              tasaImpuesto,
              subtotal,
              impuesto,
              total,
            },
          });
          await tx.asignacionLoteVenta.createMany({
            data: (porProducto.get(productoId) ?? []).map((lote) => ({
              ...lote,
              tenantId,
              ventaId: venta.id,
              detalleVentaId: detalle.id,
              productoId,
            })),
          });
          await this.reservas.consumir(tx, operacion, id, reserva.id);
        }
        if (pago && !importe.isZero()) {
          const cobro = await this.cobros.registrar(tx, contexto, {
            metodo: pago.metodo,
            monto: importe,
            referencia,
            turnoId,
            clienteComercialId,
            claveRecurso,
          });
          await this.cobros.aplicar(tx, contexto, {
            cobroId: cobro.id,
            ventaId: venta.id,
            monto: importe,
            claveRecurso,
          });
        }
        if (fechaVencimiento) {
          await this.cuentas.crear(tx, {
            tenantId,
            ventaId: venta.id,
            clienteComercialId,
            vencimiento: fechaVencimiento,
            financiado,
          });
        }
        await this.registrarEstado(
          tx,
          pedido,
          'ENTREGADO',
          staff,
          correlacionId,
        );
        await contexto.auditar(tx, {
          accion: ACCIONES_AUDITORIA.VENTAS_REGISTRAR,
          recursoTipo: 'Venta',
          recursoId: venta.id,
          productos: detalles.map(({ productoId }) => productoId),
          datos: {
            origen: 'PORTAL',
            pedidoId: id,
            ...(fechaVencimiento && {
              modalidad: 'CREDITO',
              financiado: financiado.toFixed(2),
              vencimiento: vencimiento ?? null,
            }),
          },
        });
        return { recursoTipo: 'Venta', recursoId: venta.id };
      },
    );
  }

  async expirarPendientes(filtro: Prisma.PedidoWhereInput = {}) {
    const pedidos = await this.prisma.pedido.findMany({
      where: {
        ...filtro,
        estado: { in: abiertos },
        reservaHasta: { lte: new Date() },
      },
      orderBy: [{ reservaHasta: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { tenantId: true, id: true },
    });
    for (const pedido of pedidos)
      await this.expirar(pedido.tenantId, pedido.id);
  }

  private expirar(tenantId: number, id: number, clienteComercialId?: number) {
    return this.prisma.$transaction(async (tx) => {
      const candidato = await tx.pedido.findFirst({
        where: {
          tenantId,
          id,
          clienteComercialId,
          estado: { in: abiertos },
          reservaHasta: { lte: new Date() },
        },
        select: { id: true },
      });
      if (!candidato) return;
      const pedido = await this.bloquear(tx, tenantId, id, clienteComercialId);
      if (
        abiertos.includes(pedido.estado) &&
        pedido.reservaHasta <= new Date()
      ) {
        await this.liberar(tx, pedido, 'EXPIRADO', 'Reserva vencida', {});
      }
    });
  }

  private async bloquear(
    tx: Prisma.TransactionClient,
    tenantId: number,
    id: number,
    clienteComercialId?: number,
  ) {
    const filas = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Pedido" WHERE "tenantId" = ${tenantId} AND id = ${id}
      ${clienteComercialId === undefined ? Prisma.empty : Prisma.sql`AND "clienteComercialId" = ${clienteComercialId}`}
      FOR UPDATE
    `;
    if (!filas.length) throw new NotFoundException('Pedido no encontrado');
    return tx.pedido.findUniqueOrThrow({ where: { id } });
  }

  private exigirVigente(pedido: { estado: EstadoPedido; reservaHasta: Date }) {
    if (
      !abiertos.includes(pedido.estado) ||
      pedido.reservaHasta <= new Date()
    ) {
      throw new ConflictException(
        'El pedido ya no está disponible para esta operación',
      );
    }
  }

  private async liberar(
    tx: Prisma.TransactionClient,
    pedido: Awaited<ReturnType<PedidosService['bloquear']>>,
    estado: 'CANCELADO' | 'EXPIRADO',
    motivo: string,
    actor: ActorPedido,
  ) {
    const { tenantId, id } = pedido;
    const correlacionId = randomUUID();
    await tx.pedido.update({
      where: { id },
      data: {
        estado,
        ...(estado === 'CANCELADO'
          ? { canceladoAt: new Date(), motivoCancelacion: motivo }
          : {}),
      },
    });
    const reservas = await tx.reservaInventario.findMany({
      where: { tenantId, pedidoId: id, estado: 'ACTIVA' },
      orderBy: { productoId: 'asc' },
    });
    for (const reserva of reservas) {
      await this.reservas.liberar(
        tx,
        {
          tenantId,
          responsableId: actor.membresiaId ?? null,
          correlacionId,
          clave: correlacionId,
        },
        id,
        reserva.id,
        motivo,
      );
    }
    await this.registrarEstado(
      tx,
      pedido,
      estado,
      actor,
      correlacionId,
      motivo,
    );
  }

  private async registrarEstado(
    tx: Prisma.TransactionClient,
    pedido: {
      id: number;
      tenantId: number;
      estado: EstadoPedido;
      clienteComercialId: number;
    },
    estado: EstadoPedido,
    actor: ActorPedido,
    correlacionId: string,
    motivo?: string,
    inicial = false,
  ) {
    const { tenantId, id, clienteComercialId } = pedido;
    const tipoActor = actor.usuarioId === undefined ? 'SISTEMA' : 'USUARIO';
    await tx.historialEstadoPedido.create({
      data: {
        tenantId,
        pedidoId: id,
        estadoAnterior: inicial ? null : pedido.estado,
        estadoNuevo: estado,
        responsableId: actor.membresiaId,
        actor: tipoActor,
        motivo,
      },
    });
    await tx.auditoriaOperacion.create({
      data: {
        tenantId,
        entidadTipo: 'Pedido',
        entidadId: id,
        accion: 'pedidos.estado',
        correlacionId,
        motivo,
        actor: tipoActor,
        usuarioId: actor.usuarioId,
        membresiaId: actor.membresiaId,
        rolCodigo: actor.rolEfectivo?.codigo,
        rolNombre: actor.rolEfectivo?.nombre,
        datos: { estado, clienteComercialId },
      },
    });
    await tx.eventoSalida.create({
      data: {
        tenantId,
        tipo: 'ESTADO_PEDIDO',
        entidadTipo: 'Pedido',
        entidadId: id,
        payload: { estado, clienteComercialId },
      },
    });
  }
}
