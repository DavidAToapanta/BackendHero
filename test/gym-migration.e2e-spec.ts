import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../apps/gym-api/src/app.module';
import { PrismaService } from '../apps/gym-api/src/prisma/prisma.service';

// Solo se habilita expresamente sobre una copia local de ensayo. Nunca siembra
// hero_gym_dev ni una base de produccion al ejecutar test:e2e normalmente.
const migrationSuite =
  process.env.GYM_MIGRATION_E2E === '1' ? describe : describe.skip;

migrationSuite('Compatibilidad GYM despues de migrar STORE', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let otherToken: string;
  let tenantId: number;
  let otherTenantId: number;
  let productId: number;
  const suffix = Date.now().toString();
  const password = 'Solo-Prueba-' + suffix;
  const ownerCedula = 'owner-' + suffix;

  beforeAll(async () => {
    const destination = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname) ||
      destination.port !== '5433' ||
      !/^\/hero_gym_migration_upgrade_\d+$/.test(destination.pathname)
    ) {
      throw new Error('La prueba requiere una copia local de migracion');
    }
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);
    for (const other of [false, true]) {
      const response = await request(app.getHttpServer())
        .post('/auth/register-owner')
        .send({
          cedula: other ? 'other-' + suffix : ownerCedula,
          password,
          nombres: 'Ensayo',
          apellidos: 'GYM',
          email: `${other ? 'other' : 'owner'}-${suffix}@example.invalid`,
          tenantNombre: 'GYM Ensayo ' + (other ? 'B ' : 'A ') + suffix,
        })
        .expect(201);
      const body = response.body as {
        access_token: string;
        tenantId: number;
      };
      expect(body.access_token).toEqual(expect.any(String));
      if (other) {
        otherToken = body.access_token;
        otherTenantId = body.tenantId;
      } else {
        token = body.access_token;
        tenantId = body.tenantId;
      }
    }
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  it('registra cliente, vende producto, asigna plan, cobra y conserva factura/deuda', async () => {
    const http = app.getHttpServer();
    const customer = await request(http)
      .post('/cliente/registro')
      .auth(token, { type: 'bearer' })
      .send({
        nombres: 'Cliente',
        apellidos: 'Ensayo',
        cedula: 'customer-' + suffix,
        email: `customer-${suffix}@example.invalid`,
        password,
        horario: 'Manana',
        sexo: 'M',
        observaciones: 'Ensayo aislado',
        objetivos: 'Entrenar',
        tiempoEntrenar: 1,
      })
      .expect(201);
    const customerId = (customer.body as { id: number }).id;
    expect(customerId).toEqual(expect.any(Number));

    const product = await request(http)
      .post('/producto')
      .auth(token, { type: 'bearer' })
      .send({ nombre: 'Agua ensayo', precio: 0.1, stock: 10, estado: true })
      .expect(201);
    productId = (product.body as { id: number }).id;
    expect((product.body as { precio: number }).precio).toBe(0.1);
    await request(http)
      .patch('/producto/' + productId)
      .auth(token, { type: 'bearer' })
      .send({ precio: 0.2 })
      .expect(200);
    const purchase = await request(http)
      .post('/compra')
      .auth(token, { type: 'bearer' })
      .send({
        clienteId: customerId,
        detalles: [{ productoId: productId, cantidad: 3 }],
      })
      .expect(201);
    expect((purchase.body as Array<{ total: number }>)[0].total).toBe(0.6);
    const stored = await prisma.producto.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(stored.stock).toBe(7);
    expect(stored.modoInventario).toBe('LEGACY');
    expect(stored.stockReservado).toBe(0);
    const list = await request(http)
      .get('/producto')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(
      (list.body as { data: Array<{ precio: number }> }).data[0].precio,
    ).toBe(0.2);
    await request(http)
      .get('/producto/' + productId)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);

    const plan = await request(http)
      .post('/plan')
      .auth(token, { type: 'bearer' })
      .send({
        nombre: 'Mensual ensayo',
        precio: 30,
        duracion: 1,
        unidadDuracion: 'MESES',
      })
      .expect(201);
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 86400000);
    const membership = await request(http)
      .post('/cliente-plan')
      .auth(token, { type: 'bearer' })
      .send({
        clienteId: customerId,
        planId: (plan.body as { id: number }).id,
        fechaInicio: start.toISOString(),
        fechaFin: end.toISOString(),
        activado: true,
      })
      .expect(201);
    const membershipId = (membership.body as { id: number }).id;
    await request(http)
      .post('/pago')
      .auth(token, { type: 'bearer' })
      .send({
        clientePlanId: membershipId,
        monto: 10,
        fecha: start.toISOString(),
      })
      .expect(201);
    const invoice = await prisma.factura.findFirstOrThrow({
      where: { tenantId, clientePlanId: membershipId },
    });
    expect(invoice.totalPagado).toBe(10);
    expect(invoice.saldo).toBe(20);
    expect(invoice.estado).toBe('PENDIENTE');
    expect(
      await prisma.deuda.findFirst({
        where: { tenantId, clientePlanId: membershipId, solventada: false },
      }),
    ).toEqual(expect.objectContaining({ monto: 20 }));
    await request(http)
      .post('/pago')
      .auth(token, { type: 'bearer' })
      .send({
        clientePlanId: membershipId,
        monto: 20,
        fecha: start.toISOString(),
      })
      .expect(201);
    const paid = await prisma.factura.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(paid.estado).toBe('PAGADA');
    expect(paid.saldo).toBe(0);
    expect(
      await prisma.deuda.count({
        where: { tenantId, clientePlanId: membershipId, solventada: false },
      }),
    ).toBe(0);
    await request(http)
      .post('/asistencia/registrar/' + customerId)
      .auth(token, { type: 'bearer' })
      .expect(201);
    for (const endpoint of [
      '/cliente',
      '/facturas',
      '/deuda',
      '/estadisticas/ingresos?periodo=dia',
    ]) {
      await request(http)
        .get(endpoint)
        .auth(token, { type: 'bearer' })
        .expect(200);
    }
  }, 60000);

  it('conserva login y seleccion de contextos STAFF/CLIENTE', async () => {
    const user = await prisma.usuario.findUniqueOrThrow({
      where: { cedula: ownerCedula },
    });
    await prisma.cliente.create({
      data: {
        usuarioId: user.id,
        tenantId: otherTenantId,
        horario: 'Tarde',
        sexo: 'M',
        observaciones: 'Ensayo',
        objetivos: 'Entrenar',
        tiempoEntrenar: 1,
      },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ cedula: ownerCedula, password })
      .expect(201);
    const selection = login.body as {
      requiresContextSelection: boolean;
      selectionToken: string;
    };
    expect(selection.requiresContextSelection).toBe(true);
    const selected = await request(app.getHttpServer())
      .post('/auth/select-context')
      .send({
        selectionToken: selection.selectionToken,
        type: 'STAFF',
        tenantId,
        tenantRole: 'OWNER',
        accessMode: 'PLATFORM',
      })
      .expect(201);
    await request(app.getHttpServer())
      .get('/producto')
      .auth((selected.body as { access_token: string }).access_token, {
        type: 'bearer',
      })
      .expect(200);
  });

  it('rechaza referencias entre negocios y stock LOTES sin apertura', async () => {
    await expect(
      prisma.productoImagen.create({
        data: {
          tenantId: otherTenantId,
          productoId: productId,
          url: 'https://example.invalid/image.png',
          orden: 0,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.producto.update({
          where: { id: productId },
          data: { modoInventario: 'LOTES' },
        });
      }),
    ).rejects.toThrow();
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: productId } }))
        .modoInventario,
    ).toBe('LEGACY');
  });

  it('rechaza reserva mayor de una hora y carrito activo duplicado', async () => {
    const client = await prisma.clienteComercial.create({
      data: { tenantId, nombres: 'Cliente de restricciones' },
    });
    await prisma.carrito.create({
      data: { tenantId, clienteComercialId: client.id },
    });
    await expect(
      prisma.carrito.create({
        data: { tenantId, clienteComercialId: client.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const now = new Date();
    await expect(
      prisma.pedido.create({
        data: {
          tenantId,
          clienteComercialId: client.id,
          numero: 'pedido-invalido-' + suffix,
          confirmadoAt: now,
          reservaHasta: new Date(now.getTime() + 61 * 60000),
          subtotal: 1,
          total: 1,
          claveIdempotencia: 'pedido-invalido-' + suffix,
        },
      }),
    ).rejects.toThrow();
  });
});
