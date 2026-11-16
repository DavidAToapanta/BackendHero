import { randomUUID } from 'node:crypto';
import { MembresiasPersonalService } from '@app/negocios';
import {
  InventarioLotesService,
  InventarioService,
  ReservasInventarioService,
  type LineaSalidaVenta,
} from '@app/inventario';
import { PrismaService } from '@app/prisma';
import { DestinoDevolucionVenta, EstadoPedido, Prisma } from '@prisma/client';
import { CompraService } from '../apps/gym-api/src/compra/compra.service';

const suite =
  process.env.INVENTARIO_POSTGRES_E2E === '1' ? describe : describe.skip;

suite('Inventario con PostgreSQL y migraciones vigentes', () => {
  const prisma = new PrismaService();
  const inventario = new InventarioService();
  const lotes = new InventarioLotesService(inventario);
  const reservas = new ReservasInventarioService(inventario, lotes);
  const compras = new CompraService(
    prisma,
    inventario,
    lotes,
    new MembresiasPersonalService(prisma),
  );
  let tenantId: number;
  let usuarioId: number;
  let clienteId: number;
  let responsableId: number;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/hero_inventario_test'
    ) {
      throw new Error(
        'Se requiere una base local desechable hero_inventario_test',
      );
    }
    const slug = randomUUID();
    const tenant = await prisma.tenant.create({
      data: { nombre: 'Ensayo inventario', slug, tipoNegocio: 'MIXTO' },
    });
    tenantId = tenant.id;
    const usuario = await prisma.usuario.create({
      data: {
        nombres: 'Ensayo',
        apellidos: 'Inventario',
        cedula: slug,
        password: 'solo-ensayo',
      },
    });
    usuarioId = usuario.id;
    const responsable = await prisma.userTenant.create({
      data: { tenantId, usuarioId, role: 'OWNER' },
    });
    responsableId = responsable.id;
    const cliente = await prisma.cliente.create({
      data: {
        tenantId,
        usuarioId,
        horario: '',
        sexo: '',
        observaciones: '',
        objetivos: '',
        tiempoEntrenar: 1,
      },
    });
    clienteId = cliente.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function operacion() {
    return {
      tenantId,
      responsableId,
      clave: randomUUID(),
      correlacionId: randomUUID(),
    };
  }

  async function productoConStock(stock: number) {
    return prisma.producto.create({
      data: {
        tenantId,
        nombre: 'Producto ensayo',
        precio: '1.25',
        estado: true,
        stock,
      },
    });
  }

  async function abrirLote(
    productoId: number,
    cantidad: number,
    costo = '0.5',
  ) {
    const resultado = await prisma.$transaction((tx) =>
      lotes.registrarEntrada(
        tx,
        operacion(),
        productoId,
        'APERTURA',
        'Conciliación',
        [{ codigo: 'L1', cantidad, costoUnitario: new Prisma.Decimal(costo) }],
      ),
    );
    return resultado.lotes[0];
  }

  function vender(
    lineas: LineaSalidaVenta[],
    opciones: {
      alterarCosto?: boolean;
      abortar?: boolean;
      clave?: string;
    } = {},
  ) {
    return prisma.$transaction(async (tx) => {
      const salida = { ...operacion(), clave: opciones.clave ?? randomUUID() };
      const seleccion = await lotes.validarSeleccionVenta(tx, tenantId, lineas);
      const venta = await tx.venta.create({
        data: {
          tenantId,
          responsableId,
          origen: 'CAJA',
          subtotal: 0,
          total: 0,
          claveIdempotencia: salida.clave,
        },
      });
      const detalleIds: number[] = [];
      for (const linea of seleccion) {
        const detalle = await tx.detalleVenta.create({
          data: {
            tenantId,
            ventaId: venta.id,
            productoId: linea.productoId,
            nombreProducto: 'Producto de ensayo K03',
            cantidad: linea.cantidad,
            precioUnitario: 0,
            subtotal: 0,
            total: 0,
          },
        });
        detalleIds.push(detalle.id);
        await tx.asignacionLoteVenta.createMany({
          data: linea.lotes.map((lote) => ({
            ...lote,
            tenantId,
            productoId: linea.productoId,
            ventaId: venta.id,
            detalleVentaId: detalle.id,
            ...(opciones.alterarCosto && {
              costoUnitario: lote.costoUnitario.plus('0.0001'),
              costoTotal: lote.costoUnitario.plus('0.0001').mul(lote.cantidad),
            }),
          })),
        });
      }
      for (const detalleId of detalleIds)
        await lotes.retirarVenta(tx, salida, detalleId);
      if (opciones.abortar) throw new Error('Abortar después de retirar');
      return venta;
    });
  }

  async function ventaParaDevolucion(cantidad: number) {
    const producto = await productoConStock(cantidad);
    const lote = await abrirLote(producto.id, cantidad, '1.2345');
    const venta = await vender([
      {
        productoId: producto.id,
        cantidad,
        lotes: [{ loteId: lote.id, cantidad }],
      },
    ]);
    const asignacion = await prisma.asignacionLoteVenta.findFirstOrThrow({
      where: { tenantId, ventaId: venta.id },
    });
    return { producto, lote, venta, asignacion };
  }

  async function devolver(
    tx: Prisma.TransactionClient,
    asignacion: Awaited<ReturnType<typeof ventaParaDevolucion>>['asignacion'],
    cantidad: number,
    destino: DestinoDevolucionVenta,
    retorno = operacion(),
    costoUnitario = asignacion.costoUnitario,
  ) {
    const {
      id: asignacionVentaId,
      ventaId,
      detalleVentaId,
      productoId,
      loteId,
    } = asignacion;
    await lotes.bloquearVentaParaDevolucion(tx, tenantId, ventaId);
    const devolucion = await tx.devolucionVenta.create({
      data: {
        tenantId,
        ventaId,
        responsableId,
        estado: 'APROBADA',
        aprobadaAt: new Date(),
        aprobadaPorId: responsableId,
        subtotal: 0,
        total: 0,
        motivo: 'Retorno de ensayo',
        claveIdempotencia: retorno.clave,
      },
    });
    const detalle = await tx.detalleDevolucionVenta.create({
      data: {
        tenantId,
        devolucionId: devolucion.id,
        asignacionVentaId,
        ventaId,
        detalleVentaId,
        productoId,
        loteId,
        cantidad,
        destino,
        subtotal: 0,
        total: 0,
        costoUnitario,
        costoTotal: costoUnitario.mul(cantidad),
      },
    });
    return {
      detalle,
      movimientos: await lotes.aplicarDevolucion(tx, retorno, detalle.id),
    };
  }

  it.each(['LEGACY', 'LOTES'])(
    'solo una compra concurrente obtiene la última unidad en %s',
    async (modo) => {
      const producto = await productoConStock(1);
      const seleccion =
        modo === 'LOTES'
          ? [{ loteId: (await abrirLote(producto.id, 1)).id, cantidad: 1 }]
          : undefined;
      const payload = {
        clienteId,
        detalles: [{ productoId: producto.id, cantidad: 1, lotes: seleccion }],
      };

      const resultados = await Promise.allSettled([
        compras.create(payload, tenantId, usuarioId),
        compras.create(payload, tenantId, usuarioId),
      ]);

      expect(resultados.map(({ status }) => status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      const fallida = resultados.find(
        (resultado) => resultado.status === 'rejected',
      );
      expect(fallida).toMatchObject({ reason: { status: 400 } });
      const where = { tenantId, productoId: producto.id };
      expect(await prisma.compra.count({ where })).toBe(1);
      expect(
        await prisma.producto.findUnique({ where: { id: producto.id } }),
      ).toMatchObject({
        stock: 0,
        stockReservado: 0,
        modoInventario: modo,
      });
      if (seleccion) {
        expect(
          await prisma.loteInventario.findUnique({
            where: { id: seleccion[0].loteId },
          }),
        ).toMatchObject({ cantidadFisica: 0 });
        expect(
          await prisma.movimientoInventario.count({
            where: { ...where, tipo: 'VENTA' },
          }),
        ).toBe(1);
      }
    },
  );

  it('protege stock reservado y lo devuelve al cancelar el pedido', async () => {
    const producto = await productoConStock(2);
    const lote = await abrirLote(producto.id, 2);
    const comprador = await prisma.clienteComercial.create({
      data: { tenantId, nombres: 'Ensayo' },
    });
    const confirmadoAt = new Date();
    const { pedido, reserva } = await prisma.$transaction(async (tx) => {
      const clave = randomUUID();
      const pedido = await tx.pedido.create({
        data: {
          tenantId,
          clienteComercialId: comprador.id,
          numero: clave,
          claveIdempotencia: clave,
          confirmadoAt,
          reservaHasta: new Date(confirmadoAt.getTime() + 600_000),
          subtotal: 2.5,
          total: 2.5,
        },
      });
      const detalle = await tx.detallePedido.create({
        data: {
          tenantId,
          pedidoId: pedido.id,
          productoId: producto.id,
          nombreProducto: producto.nombre,
          cantidad: 2,
          precioUnitario: 1.25,
          subtotal: 2.5,
          total: 2.5,
        },
      });
      return {
        pedido,
        reserva: await reservas.reservar(
          tx,
          operacion(),
          pedido.id,
          detalle.id,
        ),
      };
    });
    const payload = {
      clienteId,
      detalles: [
        {
          productoId: producto.id,
          cantidad: 1,
          lotes: [{ loteId: lote.id, cantidad: 1 }],
        },
      ],
    };
    await expect(
      prisma.$transaction((tx) =>
        lotes.validarSeleccionVenta(tx, tenantId, [
          {
            productoId: producto.id,
            cantidad: 1,
            lotes: [{ loteId: lote.id, cantidad: 1 }],
          },
        ]),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining(
        'Stock disponible insuficiente',
      ) as unknown,
    });
    await expect(
      compras.create(payload, tenantId, usuarioId),
    ).rejects.toMatchObject({ status: 400 });
    const entradaVencida = await prisma.$transaction((tx) =>
      lotes.registrarEntrada(
        tx,
        operacion(),
        producto.id,
        'ENTRADA',
        'Ensayo',
        [
          {
            codigo: 'VENCIDO',
            cantidad: 1,
            costoUnitario: new Prisma.Decimal('0.5'),
            vencimiento: new Date('2020-01-01T00:00:00Z'),
          },
        ],
      ),
    );
    await expect(
      prisma.$transaction((tx) =>
        lotes.registrarBaja(tx, operacion(), producto.id, lote.id, 1, 'Daño'),
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: 'El movimiento afectaría unidades reservadas',
    });
    await expect(
      prisma.$transaction((tx) =>
        lotes.registrarBaja(
          tx,
          operacion(),
          producto.id,
          entradaVencida.lotes[0].id,
          1,
          'Vencimiento',
        ),
      ),
    ).resolves.toMatchObject({ movimiento: { tipo: 'BAJA', deltaFisico: -1 } });
    expect(
      await prisma.compra.count({
        where: { tenantId, productoId: producto.id },
      }),
    ).toBe(0);

    await prisma.$transaction(async (tx) => {
      await tx.pedido.update({
        where: { id: pedido.id },
        data: {
          estado: EstadoPedido.CANCELADO,
          canceladoAt: new Date(),
          motivoCancelacion: 'Ensayo',
        },
      });
      await reservas.liberar(tx, operacion(), pedido.id, reserva.id, 'Ensayo');
    });
    await expect(
      compras.create(payload, tenantId, usuarioId),
    ).resolves.toHaveLength(1);
    expect(
      await prisma.producto.findUnique({ where: { id: producto.id } }),
    ).toMatchObject({
      stock: 1,
      stockReservado: 0,
    });
  });

  it('valida el acumulado de un lote y guarda movimientos distintos para dos líneas de venta', async () => {
    const producto = await productoConStock(8);
    const costoUnitario = new Prisma.Decimal('0.4321');
    const {
      lotes: [principal],
    } = await prisma.$transaction((tx) =>
      lotes.registrarEntrada(
        tx,
        operacion(),
        producto.id,
        'APERTURA',
        'Ensayo K03',
        [
          { codigo: 'PRINCIPAL', cantidad: 6, costoUnitario },
          { codigo: 'OTRO', cantidad: 2, costoUnitario },
        ],
      ),
    );
    const linea = (cantidad: number) => ({
      productoId: producto.id,
      cantidad,
      lotes: [{ loteId: principal.id, cantidad }],
    });
    await expect(vender([linea(3), linea(4)])).rejects.toMatchObject({
      status: 400,
      message: 'Stock insuficiente en el lote seleccionado',
    });
    await expect(vender([{ ...linea(3), cantidad: 4 }])).rejects.toMatchObject({
      status: 400,
    });
    await expect(vender([linea(1)], { alterarCosto: true })).rejects.toThrow(
      'Lote vencido o costo historico incorrecto',
    );
    const clave = randomUUID();
    await expect(vender([linea(1)], { abortar: true, clave })).rejects.toThrow(
      'Abortar después de retirar',
    );
    expect(
      await prisma.venta.count({
        where: { tenantId, claveIdempotencia: clave },
      }),
    ).toBe(0);
    expect(
      await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } }),
    ).toMatchObject({ stock: 8 });
    expect(
      await prisma.loteInventario.findUniqueOrThrow({
        where: { id: principal.id },
      }),
    ).toMatchObject({ cantidadFisica: 6 });

    const venta = await vender([linea(3), linea(3)]);
    const asignaciones = await prisma.asignacionLoteVenta.findMany({
      where: { tenantId, ventaId: venta.id },
      orderBy: { id: 'asc' },
    });
    expect(asignaciones).toHaveLength(2);
    expect(
      new Set(asignaciones.map(({ detalleVentaId }) => detalleVentaId)).size,
    ).toBe(2);
    expect(
      asignaciones.map(({ costoUnitario, costoTotal }) => [
        costoUnitario.toFixed(4),
        costoTotal.toFixed(4),
      ]),
    ).toEqual([
      ['0.4321', '1.2963'],
      ['0.4321', '1.2963'],
    ]);
    const movimientos = await prisma.movimientoInventario.findMany({
      where: { tenantId, productoId: producto.id, tipo: 'VENTA' },
      orderBy: { id: 'asc' },
    });
    expect(
      movimientos.map(({ claveIdempotencia, deltaFisico }) => [
        claveIdempotencia,
        deltaFisico,
      ]),
    ).toEqual(
      asignaciones.map(({ id }) => [
        venta.claveIdempotencia + ':asignacion:' + id,
        -3,
      ]),
    );
    expect(
      await prisma.loteInventario.findUniqueOrThrow({
        where: { id: principal.id },
      }),
    ).toMatchObject({ cantidadFisica: 0 });
  });

  it('rechaza lotes vencidos, lotes de otro producto y selecciones de otro tenant', async () => {
    const producto = await productoConStock(2);
    const {
      lotes: [vencido],
    } = await prisma.$transaction((tx) =>
      lotes.registrarEntrada(
        tx,
        operacion(),
        producto.id,
        'APERTURA',
        'Ensayo K03',
        [
          {
            codigo: 'VENCIDO',
            cantidad: 1,
            costoUnitario: new Prisma.Decimal(1),
            vencimiento: new Date(Date.now() - 60000),
          },
          {
            codigo: 'VIGENTE',
            cantidad: 1,
            costoUnitario: new Prisma.Decimal(1),
          },
        ],
      ),
    );
    const otro = await productoConStock(1);
    const loteAjeno = await abrirLote(otro.id, 1);
    const tiendaAjena = await prisma.tenant.create({
      data: {
        slug: randomUUID(),
        nombre: 'Otro negocio',
        tipoNegocio: 'STORE',
      },
    });
    const seleccionar = (loteId: number, negocio = tenantId) =>
      prisma.$transaction((tx) =>
        lotes.validarSeleccionVenta(tx, negocio, [
          {
            productoId: producto.id,
            cantidad: 1,
            lotes: [{ loteId, cantidad: 1 }],
          },
        ]),
      );
    await expect(seleccionar(vencido.id)).rejects.toMatchObject({
      status: 400,
      message: 'El lote seleccionado está vencido',
    });
    await expect(seleccionar(loteAjeno.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(seleccionar(vencido.id, tiendaAjena.id)).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it('solo permite una salida de la última unidad entre dos ventas concurrentes', async () => {
    const producto = await productoConStock(1);
    const lote = await abrirLote(producto.id, 1);
    const lineas = [
      {
        productoId: producto.id,
        cantidad: 1,
        lotes: [{ loteId: lote.id, cantidad: 1 }],
      },
    ];
    const resultados = await Promise.allSettled([
      vender(lineas),
      vender(lineas),
    ]);
    expect(resultados.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(
      resultados.find(({ status }) => status === 'rejected'),
    ).toMatchObject({ reason: { status: 400 } });
    expect(
      await prisma.movimientoInventario.count({
        where: { tenantId, productoId: producto.id, tipo: 'VENTA' },
      }),
    ).toBe(1);
    expect(
      await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } }),
    ).toMatchObject({ stock: 0 });
  });

  it('serializa la baja y la venta que compiten por la última unidad', async () => {
    const producto = await productoConStock(1);
    const lote = await abrirLote(producto.id, 1);
    const resultados = await Promise.allSettled([
      vender([
        {
          productoId: producto.id,
          cantidad: 1,
          lotes: [{ loteId: lote.id, cantidad: 1 }],
        },
      ]),
      prisma.$transaction((tx) =>
        lotes.registrarBaja(tx, operacion(), producto.id, lote.id, 1, 'Daño'),
      ),
    ]);
    expect(resultados.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    if (resultados[0].status === 'rejected') {
      expect(resultados[0].reason).toMatchObject({ status: 400 });
    } else {
      expect(resultados[1]).toMatchObject({ reason: { status: 409 } });
    }
    const salidas = await prisma.movimientoInventario.findMany({
      where: { tenantId, productoId: producto.id, deltaFisico: { lt: 0 } },
    });
    expect(salidas).toHaveLength(1);
    expect(salidas[0]).toMatchObject({
      tipo: resultados[0].status === 'fulfilled' ? 'VENTA' : 'BAJA',
      deltaFisico: -1,
    });
    expect(
      await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } }),
    ).toMatchObject({ stock: 0, stockReservado: 0 });
    expect(
      await prisma.loteInventario.findUniqueOrThrow({ where: { id: lote.id } }),
    ).toMatchObject({ cantidadFisica: 0 });
  });

  it('procesa retornos parciales con costo original y contabiliza la devolución dañada una sola vez', async () => {
    const { asignacion, lote, producto } = await ventaParaDevolucion(3);
    await prisma.loteInventario.update({
      where: { id: lote.id },
      data: { costoUnitario: '9' },
    });
    await expect(
      prisma.$transaction((tx) =>
        devolver(
          tx,
          asignacion,
          1,
          'REINTEGRO_APTO',
          operacion(),
          new Prisma.Decimal(9),
        ),
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: 'La devolución no coincide con la salida y costo originales',
    });
    const apto = await prisma.$transaction((tx) =>
      devolver(tx, asignacion, 1, 'REINTEGRO_APTO'),
    );
    expect(apto.movimientos.movimientoBajaId).toBeNull();
    await prisma.loteInventario.update({
      where: { id: lote.id },
      data: { vencimiento: new Date('2020-01-01T00:00:00Z') },
    });
    await expect(
      prisma.$transaction((tx) =>
        devolver(tx, asignacion, 1, 'REINTEGRO_APTO'),
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: 'El lote vencido requiere una baja explícita',
    });
    const noApto = await prisma.$transaction((tx) =>
      devolver(tx, asignacion, 1, 'BAJA_NO_APTO'),
    );
    for (const retorno of [apto, noApto]) {
      await expect(
        prisma.$transaction(async (tx) => {
          await lotes.bloquearVentaParaDevolucion(
            tx,
            tenantId,
            asignacion.ventaId,
          );
          return lotes.aplicarDevolucion(tx, operacion(), retorno.detalle.id);
        }),
      ).resolves.toEqual(retorno.movimientos);
    }
    await expect(
      prisma.$transaction((tx) => devolver(tx, asignacion, 2, 'BAJA_NO_APTO')),
    ).rejects.toMatchObject({
      status: 409,
      message: 'La cantidad excede lo pendiente de devolver',
    });
    const movimientos = await prisma.movimientoInventario.findMany({
      where: {
        tenantId,
        productoId: producto.id,
        detalleDevolucionId: { not: null },
      },
      orderBy: { id: 'asc' },
    });
    expect(
      movimientos.map(({ tipo, deltaFisico, costoTotal }) => [
        tipo,
        deltaFisico,
        costoTotal?.toFixed(4),
      ]),
    ).toEqual([
      ['DEVOLUCION', 1, '1.2345'],
      ['DEVOLUCION', 1, '1.2345'],
      ['BAJA', -1, '1.2345'],
    ]);
    const [, devolucion, baja] = movimientos;
    expect(baja).toMatchObject({
      correlacionId: devolucion.correlacionId,
      detalleDevolucionId: noApto.detalle.id,
      motivo: 'Retorno de ensayo',
    });
    await expect(
      lotes.consultarTotalPerdidas(
        prisma,
        tenantId,
        baja.fecha,
        new Date(baja.fecha.getTime() + 1),
      ),
    ).resolves.toEqual({ totalPerdidas: '1.2345' });
    expect(
      await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } }),
    ).toMatchObject({ stock: 1, stockReservado: 0 });
    expect(
      await prisma.loteInventario.findUniqueOrThrow({ where: { id: lote.id } }),
    ).toMatchObject({ cantidadFisica: 1 });

    const tiendaAjena = await prisma.tenant.create({
      data: { nombre: 'Otra tienda', slug: randomUUID(), tipoNegocio: 'STORE' },
    });
    await expect(
      prisma.$transaction((tx) =>
        lotes.bloquearVentaParaDevolucion(
          tx,
          tiendaAjena.id,
          asignacion.ventaId,
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      prisma.$transaction((tx) =>
        lotes.aplicarDevolucion(
          tx,
          { ...operacion(), tenantId: tiendaAjena.id },
          noApto.detalle.id,
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each(['REINTEGRO_APTO', 'BAJA_NO_APTO'] as const)(
    'revierte el retorno %s junto con la escritura del coordinador',
    async (destino) => {
      const { asignacion, producto, lote } = await ventaParaDevolucion(1);
      const retorno = operacion();
      await expect(
        prisma.$transaction(async (tx) => {
          await devolver(tx, asignacion, 1, destino, retorno);
          throw new Error('Fallo del coordinador');
        }),
      ).rejects.toThrow('Fallo del coordinador');
      expect(
        await prisma.devolucionVenta.count({
          where: { tenantId, claveIdempotencia: retorno.clave },
        }),
      ).toBe(0);
      expect(
        await prisma.detalleDevolucionVenta.count({
          where: { tenantId, asignacionVentaId: asignacion.id },
        }),
      ).toBe(0);
      expect(
        await prisma.movimientoInventario.count({
          where: {
            tenantId,
            productoId: producto.id,
            detalleDevolucionId: { not: null },
          },
        }),
      ).toBe(0);
      expect(
        await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } }),
      ).toMatchObject({ stock: 0 });
      expect(
        await prisma.loteInventario.findUniqueOrThrow({
          where: { id: lote.id },
        }),
      ).toMatchObject({ cantidadFisica: 0 });
      await expect(
        prisma.$transaction((tx) =>
          devolver(tx, asignacion, 1, destino, retorno),
        ),
      ).resolves.toBeDefined();
    },
  );

  it('serializa dos devoluciones por la última unidad pendiente', async () => {
    const { asignacion, venta, producto, lote } = await ventaParaDevolucion(1);
    const ejecutar = () =>
      prisma.$transaction((tx) =>
        devolver(tx, asignacion, 1, 'REINTEGRO_APTO'),
      );
    const resultados = await Promise.allSettled([ejecutar(), ejecutar()]);
    expect(resultados.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(
      resultados.find(({ status }) => status === 'rejected'),
    ).toMatchObject({
      reason: {
        status: 409,
        message: 'La cantidad excede lo pendiente de devolver',
      },
    });
    expect(
      await prisma.devolucionVenta.count({
        where: { tenantId, ventaId: venta.id },
      }),
    ).toBe(1);
    expect(
      await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } }),
    ).toMatchObject({ stock: 1, stockReservado: 0 });
    expect(
      await prisma.loteInventario.findUniqueOrThrow({ where: { id: lote.id } }),
    ).toMatchObject({ cantidadFisica: 1 });
  });
});
