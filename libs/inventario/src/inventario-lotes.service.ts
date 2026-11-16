import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LoteInventario,
  ModoInventario,
  Prisma,
  EstadoVenta,
  TipoMovimientoInventario,
} from '@prisma/client';
import { InventarioService, ProductoInventario } from './inventario.service';
import type {
  LoteEntrada,
  LineaSalidaVenta,
  LineaSalidaValidada,
  OperacionInventario,
  SeleccionLote,
} from './inventario.types';

type OrigenSalida =
  | { compraLegacyId: number }
  | { asignacionVentaId: number; reservaId?: number };

const enteroPositivo = (valor: number) =>
  Number.isInteger(valor) && valor > 0 && valor <= 2147483647;

@Injectable()
export class InventarioLotesService {
  constructor(private readonly inventario: InventarioService) {}

  async registrarEntrada(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    productoId: number,
    tipo: 'APERTURA' | 'ENTRADA',
    motivo: string,
    lotes: LoteEntrada[],
  ) {
    const { tenantId } = operacion;
    const producto = await this.inventario.bloquearProducto(
      tx,
      tenantId,
      productoId,
    );
    const apertura = tipo === 'APERTURA';
    if (apertura !== (producto.modoInventario === ModoInventario.LEGACY)) {
      throw new ConflictException(
        'La operación no corresponde al modo de inventario',
      );
    }
    if (
      !motivo.trim() ||
      lotes.some(
        (lote) =>
          !lote.codigo.trim() ||
          !Number.isInteger(lote.cantidad) ||
          lote.cantidad <= 0 ||
          !lote.costoUnitario.isFinite() ||
          lote.costoUnitario.isNegative() ||
          lote.costoUnitario.decimalPlaces() > 4 ||
          (lote.vencimiento !== undefined &&
            !Number.isFinite(lote.vencimiento.getTime())),
      )
    ) {
      throw new BadRequestException(
        'Motivo, cantidades o datos de lote inválidos',
      );
    }
    const total = lotes.reduce((cantidad, lote) => cantidad + lote.cantidad, 0);
    if (
      apertura &&
      (producto.stock !== total || producto.stockReservado !== 0)
    ) {
      throw new ConflictException(
        'Los lotes de apertura deben conciliar con el stock actual',
      );
    }
    if (!apertura && total === 0) {
      throw new BadRequestException('La entrada debe incluir al menos un lote');
    }

    const entrada = await tx.entradaInventario.create({
      data: {
        tenantId,
        responsableId: operacion.responsableId,
        motivo: motivo.trim(),
        claveIdempotencia: operacion.clave,
      },
    });
    const creados: LoteInventario[] = [];
    for (const lote of lotes) {
      const creado = await tx.loteInventario.create({
        data: {
          tenantId,
          productoId,
          entradaId: entrada.id,
          codigo: lote.codigo.trim(),
          cantidadFisica: lote.cantidad,
          costoUnitario: lote.costoUnitario,
          vencimiento: lote.vencimiento,
          esApertura: apertura,
        },
      });
      await this.registrarMovimiento(
        tx,
        operacion,
        {
          tipo: apertura
            ? TipoMovimientoInventario.APERTURA
            : TipoMovimientoInventario.ENTRADA,
          productoId,
          loteId: creado.id,
          entradaId: entrada.id,
          deltaFisico: lote.cantidad,
          deltaReservado: 0,
          costoUnitario: lote.costoUnitario,
          costoTotal: lote.costoUnitario.mul(lote.cantidad),
        },
        `lote:${creado.id}`,
      );
      creados.push(creado);
    }

    await tx.producto.update({
      where: { tenantId_id: { tenantId, id: productoId } },
      data: apertura
        ? { modoInventario: ModoInventario.LOTES }
        : { stock: { increment: total } },
    });
    return { entrada, lotes: creados };
  }

  async retirarCompra(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    compra: { id: number; productoId: number; cantidad: number },
    lotes: SeleccionLote[],
  ) {
    const producto = await this.inventario.bloquearProducto(
      tx,
      operacion.tenantId,
      compra.productoId,
    );
    if (
      !lotes.length ||
      new Set(lotes.map(({ loteId }) => loteId)).size !== lotes.length ||
      lotes.reduce((total, { cantidad }) => total + cantidad, 0) !==
        compra.cantidad
    ) {
      throw new BadRequestException(
        'Selecciona lotes distintos por la cantidad total comprada',
      );
    }
    const ahora = new Date();
    await this.validarDisponible(tx, producto, compra.cantidad, ahora);
    for (const lote of lotes) {
      await this.retirarLote(
        tx,
        operacion,
        producto.id,
        lote,
        { compraLegacyId: compra.id },
        ahora,
      );
    }
    await this.descontarSaldos(tx, producto, compra.cantidad, 0);
  }

  async validarSeleccionVenta(
    tx: Prisma.TransactionClient,
    tenantId: number,
    lineas: readonly LineaSalidaVenta[],
  ): Promise<LineaSalidaValidada[]> {
    if (lineas.length === 0)
      throw new BadRequestException('Selecciona al menos una línea de venta');
    const porProducto = new Map<
      number,
      { cantidad: number; lotes: Map<number, number> }
    >();
    const loteIds = new Set<number>();
    for (const { productoId, cantidad, lotes } of lineas) {
      const ids = new Set(lotes.map(({ loteId }) => loteId));
      if (
        !enteroPositivo(productoId) ||
        !enteroPositivo(cantidad) ||
        ids.size !== lotes.length ||
        lotes.some(
          (lote) =>
            !enteroPositivo(lote.loteId) || !enteroPositivo(lote.cantidad),
        ) ||
        lotes.reduce((total, lote) => total + lote.cantidad, 0) !== cantidad
      ) {
        throw new BadRequestException(
          'Selecciona lotes distintos por la cantidad total de cada línea',
        );
      }

      const acumulado = porProducto.get(productoId) ?? {
        cantidad: 0,
        lotes: new Map(),
      };
      acumulado.cantidad += cantidad;
      for (const lote of lotes) {
        loteIds.add(lote.loteId);
        acumulado.lotes.set(
          lote.loteId,
          (acumulado.lotes.get(lote.loteId) ?? 0) + lote.cantidad,
        );
      }
      porProducto.set(productoId, acumulado);
    }
    const productos = await this.inventario.bloquearProductos(tx, tenantId, [
      ...porProducto.keys(),
    ]);
    if (productos.length !== porProducto.size)
      throw new NotFoundException('Producto no encontrado');
    for (const producto of productos) this.validarProductoActivo(producto);

    const ahora = new Date();
    const seleccionados = await tx.loteInventario.findMany({
      where: { tenantId, id: { in: [...loteIds] } },
      select: {
        id: true,
        productoId: true,
        vencimiento: true,
        cantidadFisica: true,
        costoUnitario: true,
      },
    });
    const porLote = new Map(seleccionados.map((lote) => [lote.id, lote]));
    for (const [productoId, { lotes }] of porProducto) {
      for (const [loteId, cantidad] of lotes) {
        const lote = porLote.get(loteId);
        if (lote?.productoId !== productoId)
          throw new NotFoundException('Lote no encontrado para el producto');
        if (lote.vencimiento !== null && lote.vencimiento <= ahora) {
          throw new BadRequestException('El lote seleccionado está vencido');
        }
        if (lote.cantidadFisica < cantidad)
          throw new BadRequestException(
            'Stock insuficiente en el lote seleccionado',
          );
      }
    }

    const disponibles = await this.consultarDisponibles(
      tx,
      tenantId,
      productos,
      ahora,
    );
    for (const producto of productos) {
      if (
        porProducto.get(producto.id)!.cantidad >
        (disponibles.get(producto.id) ?? 0)
      ) {
        throw new BadRequestException(
          `Stock disponible insuficiente para el producto ${producto.nombre}`,
        );
      }
    }
    return lineas.map(({ productoId, cantidad, lotes }) => ({
      productoId,
      cantidad,
      lotes: lotes.map(({ loteId, cantidad }) => {
        const { costoUnitario } = porLote.get(loteId)!;
        return {
          loteId,
          cantidad,
          costoUnitario,
          costoTotal: costoUnitario.mul(cantidad),
        };
      }),
    }));
  }

  async retirarVenta(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    detalleVentaId: number,
  ) {
    const { tenantId } = operacion;
    const detalle = await tx.detalleVenta.findUnique({
      where: { tenantId_id: { tenantId, id: detalleVentaId } },
      select: {
        productoId: true,
        cantidad: true,
        venta: { select: { estado: true, pedidoId: true } },
        asignacionLoteVenta_detalleVenta: true,
      },
    });
    if (
      !detalle ||
      detalle.venta.estado !== EstadoVenta.COMPLETADA ||
      detalle.venta.pedidoId !== null
    ) {
      throw new ConflictException(
        'La salida requiere una venta de mostrador completada',
      );
    }
    const producto = await this.inventario.bloquearProducto(
      tx,
      tenantId,
      detalle.productoId,
    );
    const asignaciones = detalle.asignacionLoteVenta_detalleVenta;
    if (
      asignaciones.reduce((total, lote) => total + lote.cantidad, 0) !==
      detalle.cantidad
    ) {
      throw new ConflictException(
        'Los lotes asignados deben cubrir la cantidad vendida',
      );
    }
    const ahora = new Date();
    await this.validarDisponible(tx, producto, detalle.cantidad, ahora);
    for (const asignacion of asignaciones) {
      await this.retirarLote(
        tx,
        operacion,
        producto.id,
        asignacion,
        {
          asignacionVentaId: asignacion.id,
        },
        ahora,
        asignacion,
      );
    }
    await this.descontarSaldos(tx, producto, detalle.cantidad, 0);
  }

  async ajustarLote(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    productoId: number,
    loteId: number,
    delta: number,
    motivo: string,
  ) {
    if (!Number.isInteger(delta) || !delta || !motivo.trim()) {
      throw new BadRequestException(
        'El ajuste exige un cambio entero y un motivo',
      );
    }
    const { tenantId } = operacion;
    const producto = await this.inventario.bloquearProducto(
      tx,
      tenantId,
      productoId,
    );
    if (producto.modoInventario !== ModoInventario.LOTES) {
      throw new ConflictException('El ajuste requiere inventario por lotes');
    }
    const where = {
      tenantId_id_productoId: { tenantId, id: loteId, productoId },
    };
    const lote = await tx.loteInventario.findUnique({ where });
    if (!lote || lote.cantidadFisica + delta < 0) {
      throw new BadRequestException(
        'Lote ajeno al producto o sin stock suficiente',
      );
    }
    const ahora = new Date();
    const apto = lote.vencimiento === null || lote.vencimiento > ahora;
    if (
      producto.stock + delta < producto.stockReservado ||
      (delta < 0 &&
        apto &&
        producto.stockReservado > 0 &&
        (await this.stockApto(tx, producto, ahora)) + delta <
          producto.stockReservado)
    ) {
      throw new ConflictException('El ajuste afectaría unidades reservadas');
    }
    const actualizado = await tx.loteInventario.update({
      where,
      data: { cantidadFisica: { increment: delta } },
    });
    await tx.producto.update({
      where: { tenantId_id: { tenantId, id: productoId } },
      data: { stock: { increment: delta } },
    });
    await this.registrarMovimiento(
      tx,
      operacion,
      {
        tipo: TipoMovimientoInventario.AJUSTE,
        productoId,
        loteId,
        deltaFisico: delta,
        deltaReservado: 0,
        motivo: motivo.trim(),
        costoUnitario: lote.costoUnitario,
        costoTotal: lote.costoUnitario.mul(Math.abs(delta)),
      },
      `lote:${loteId}`,
    );
    return actualizado;
  }

  async validarDisponible(
    tx: Prisma.TransactionClient,
    producto: ProductoInventario,
    cantidad: number,
    ahora: Date,
  ) {
    this.validarProductoActivo(producto);
    const disponibles = await this.consultarDisponibles(
      tx,
      producto.tenantId,
      [producto],
      ahora,
    );
    if ((disponibles.get(producto.id) ?? 0) < cantidad) {
      throw new BadRequestException(
        `Stock disponible insuficiente para el producto ${producto.nombre}`,
      );
    }
  }

  async consultarDisponibles(
    tx: Prisma.TransactionClient,
    tenantId: number,
    productos: readonly ProductoInventario[],
    ahora: Date,
  ) {
    const aptos = productos.filter(
      (producto) =>
        producto.tenantId === tenantId &&
        producto.estado &&
        producto.modoInventario === ModoInventario.LOTES,
    );
    const stockPorProducto = await this.stockAptoPorProducto(
      tx,
      tenantId,
      aptos.map(({ id }) => id),
      ahora,
    );
    const disponibles = new Map(productos.map(({ id }) => [id, 0]));
    for (const { id, stock, stockReservado } of aptos) {
      disponibles.set(
        id,
        Math.max(
          0,
          Math.min(stock, stockPorProducto.get(id) ?? 0) - stockReservado,
        ),
      );
    }
    return disponibles;
  }

  private async stockApto(
    tx: Prisma.TransactionClient,
    producto: ProductoInventario,
    ahora: Date,
  ) {
    const aptos = await this.stockAptoPorProducto(
      tx,
      producto.tenantId,
      [producto.id],
      ahora,
    );
    return aptos.get(producto.id) ?? 0;
  }

  private async stockAptoPorProducto(
    tx: Prisma.TransactionClient,
    tenantId: number,
    productoIds: number[],
    ahora: Date,
  ) {
    if (productoIds.length === 0) return new Map<number, number>();
    const lotes = await tx.loteInventario.groupBy({
      by: ['productoId'],
      where: {
        tenantId,
        productoId: { in: productoIds },
        OR: [{ vencimiento: null }, { vencimiento: { gt: ahora } }],
      },
      _sum: { cantidadFisica: true },
    });
    return new Map(
      lotes.map(({ productoId, _sum }) => [
        productoId,
        _sum.cantidadFisica ?? 0,
      ]),
    );
  }

  validarProductoActivo(producto: ProductoInventario) {
    if (producto.modoInventario !== ModoInventario.LOTES || !producto.estado) {
      throw new ConflictException(
        'El producto debe estar activo y operar por lotes',
      );
    }
  }

  async retirarLote(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    productoId: number,
    { loteId, cantidad }: SeleccionLote,
    origen: OrigenSalida,
    ahora: Date,
    costoEsperado?: {
      costoUnitario: Prisma.Decimal;
      costoTotal: Prisma.Decimal;
    },
  ) {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new BadRequestException(
        'La cantidad de lote debe ser un entero positivo',
      );
    }
    const { tenantId } = operacion;
    const lote = await tx.loteInventario.findFirst({
      where: {
        tenantId,
        id: loteId,
        productoId,
        cantidadFisica: { gte: cantidad },
        OR: [{ vencimiento: null }, { vencimiento: { gt: ahora } }],
      },
      select: { costoUnitario: true },
    });
    if (!lote)
      throw new BadRequestException(
        'Lote vencido, ajeno al producto o sin stock suficiente',
      );
    const costoTotal = lote.costoUnitario.mul(cantidad);
    if (
      costoEsperado &&
      (!lote.costoUnitario.equals(costoEsperado.costoUnitario) ||
        !costoTotal.equals(costoEsperado.costoTotal))
    ) {
      throw new ConflictException(
        'El costo de la asignación no coincide con el costo del lote',
      );
    }

    await tx.loteInventario.update({
      where: { tenantId_id_productoId: { tenantId, id: loteId, productoId } },
      data: { cantidadFisica: { decrement: cantidad } },
    });
    const consumeReserva =
      'reservaId' in origen && origen.reservaId !== undefined;
    await this.registrarMovimiento(
      tx,
      operacion,
      {
        ...origen,
        productoId,
        loteId,
        tipo: consumeReserva
          ? TipoMovimientoInventario.CONSUMO_RESERVA
          : TipoMovimientoInventario.VENTA,
        deltaFisico: -cantidad,
        deltaReservado: consumeReserva ? -cantidad : 0,
        costoUnitario: lote.costoUnitario,
        costoTotal,
      },
      'asignacionVentaId' in origen && !consumeReserva
        ? `asignacion:${origen.asignacionVentaId}`
        : `lote:${loteId}`,
    );
  }

  async descontarSaldos(
    tx: Prisma.TransactionClient,
    producto: ProductoInventario,
    fisico: number,
    reservado: number,
  ) {
    await tx.producto.update({
      where: { tenantId_id: { tenantId: producto.tenantId, id: producto.id } },
      data: {
        stock: { decrement: fisico },
        stockReservado: { decrement: reservado },
      },
    });
  }

  registrarMovimiento(
    tx: Prisma.TransactionClient,
    operacion: OperacionInventario,
    datos: Omit<
      Prisma.MovimientoInventarioUncheckedCreateInput,
      'tenantId' | 'responsableId' | 'claveIdempotencia' | 'correlacionId'
    >,
    sufijo: string,
  ) {
    return tx.movimientoInventario.create({
      data: {
        ...datos,
        tenantId: operacion.tenantId,
        responsableId: operacion.responsableId,
        correlacionId: operacion.correlacionId,
        claveIdempotencia: `${operacion.clave}:${sufijo}`,
      },
    });
  }
}
