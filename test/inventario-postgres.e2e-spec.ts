import { randomUUID } from 'node:crypto';
import { MembresiasPersonalService } from '@app/negocios';
import {
  InventarioLotesService,
  InventarioService,
  ReservasInventarioService,
} from '@app/inventario';
import { PrismaService } from '@app/prisma';
import { EstadoPedido, Prisma } from '@prisma/client';
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

  async function abrirLote(productoId: number, cantidad: number) {
    const resultado = await prisma.$transaction((tx) =>
      lotes.registrarEntrada(
        tx,
        operacion(),
        productoId,
        'APERTURA',
        'Conciliación',
        [{ codigo: 'L1', cantidad, costoUnitario: new Prisma.Decimal('0.5') }],
      ),
    );
    return resultado.lotes[0];
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
      compras.create(payload, tenantId, usuarioId),
    ).rejects.toMatchObject({ status: 400 });
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
});
