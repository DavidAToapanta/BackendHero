import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../apps/gym-api/src/app.module';
import { NotificationsService } from '../apps/gym-api/src/notifications/notifications.service';
import { PrismaService } from '@app/prisma';
import { ClienteService } from '../apps/gym-api/src/cliente/cliente.service';

describe('gym-api: compatibilidad HTTP y WebSocket', () => {
  let app: INestApplication<App>;
  const notifications = [
    {
      icon: 'info',
      title: 'Sin alertas',
      message: 'Prueba de transporte',
      color: 'bg-blue-50',
    },
  ];
  const notificationsService = {
    getCurrentNotifications: jest.fn().mockResolvedValue(notifications),
  };
  const customers = {
    data: [],
    meta: { totalItems: 0, currentPage: 1, itemsPerPage: 10 },
  };
  const clienteService = {
    findAll: jest.fn().mockResolvedValue(customers),
  };
  const legacyJwt = new JwtService({
    secret: process.env.JWT_SECRET || 'supersecret',
    signOptions: { expiresIn: '1d' },
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(NotificationsService)
      .useValue(notificationsService)
      .overrideProvider(ClienteService)
      .useValue(clienteService)
      .compile();

    app = module.createNestApplication();
    app.enableCors();
    app.useGlobalPipes(new ValidationPipe());
    await app.listen(0, '127.0.0.1');
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('conserva la ruta raiz y CORS para el frontend', async () => {
    await request(app.getHttpServer())
      .get('/')
      .set('Origin', 'http://localhost:4200')
      .expect('Access-Control-Allow-Origin', '*')
      .expect(200, 'Hello World!');
  });

  it.each([
    '/cliente',
    '/plan',
    '/pago',
    '/facturas',
    '/producto',
    '/asistencia',
  ])('mantiene registrada y protegida la ruta %s', async (route) => {
    await request(app.getHttpServer()).get(route).expect(401);
  });

  it.each(['ADMIN', 'OWNER'])(
    'acepta el JWT anterior y conserva el tenant autenticado para %s',
    async (tenantRole) => {
      const token = legacyJwt.sign({
        sub: 1,
        rol: 'ADMIN',
        tenantRole,
        tenantId: 101,
        clienteId: null,
        accessMode: 'PLATFORM',
      });

      await request(app.getHttpServer())
        .get('/cliente?tenantId=999')
        .auth(token, { type: 'bearer' })
        .expect(200, customers);

      expect(clienteService.findAll).toHaveBeenCalledWith(
        1,
        10,
        '',
        { activo: undefined, incluirInactivos: false },
        101,
      );
    },
  );

  it('rechaza tokens con firma incorrecta', async () => {
    const token = new JwtService({
      secret: 'otra-clave-solo-para-pruebas',
    }).sign({
      sub: 1,
      rol: 'ADMIN',
      tenantRole: 'ADMIN',
      tenantId: 101,
    });

    await request(app.getHttpServer())
      .get('/cliente')
      .auth(token, { type: 'bearer' })
      .expect(401);
    expect(clienteService.findAll).not.toHaveBeenCalled();
  });

  it('rechaza tokens vencidos', async () => {
    const token = legacyJwt.sign(
      { sub: 1, rol: 'ADMIN', tenantRole: 'ADMIN', tenantId: 101 },
      { expiresIn: -1 },
    );

    await request(app.getHttpServer())
      .get('/cliente')
      .auth(token, { type: 'bearer' })
      .expect(401);
    expect(clienteService.findAll).not.toHaveBeenCalled();
  });

  it('no utiliza tenant de query ni fallback si falta en el JWT autenticado', async () => {
    const token = legacyJwt.sign({ sub: 1, rol: 'ADMIN', tenantRole: 'ADMIN' });

    await request(app.getHttpServer())
      .get('/cliente?tenantId=999')
      .auth(token, { type: 'bearer' })
      .expect(401);
    expect(clienteService.findAll).not.toHaveBeenCalled();
  });

  it('mantiene aislado el rol CLIENTE en rutas de personal', async () => {
    const token = legacyJwt.sign({
      sub: 1,
      rol: 'CLIENTE',
      tenantRole: null,
      clienteId: 77,
      tenantId: 101,
    });

    await request(app.getHttpServer())
      .get('/cliente')
      .auth(token, { type: 'bearer' })
      .expect(403);
    expect(clienteService.findAll).not.toHaveBeenCalled();
  });

  it.each(['/auth/login', '/auth/select-context'])(
    'conserva la ruta %s y su validacion de entrada',
    async (route) => {
      await request(app.getHttpServer()).post(route).send({}).expect(400);
    },
  );

  it('conserva notificationsUpdate en el namespace notifications con JWT', async () => {
    const token = new JwtService({
      secret: process.env.JWT_SECRET || 'supersecret',
    }).sign({ sub: 1, tenantId: 101 });
    let socket: Socket | undefined;

    try {
      const baseUrl = await app.getUrl();
      const payload = await new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('No se recibio notificationsUpdate')),
          5000,
        );
        socket = io(`${baseUrl}/notifications`, {
          auth: { token },
          transports: ['websocket'],
          reconnection: false,
        });
        socket.once('notificationsUpdate', (data: unknown) => {
          clearTimeout(timeout);
          resolve(data);
        });
        socket.once('connect_error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      expect(payload).toEqual(notifications);
      expect(notificationsService.getCurrentNotifications).toHaveBeenCalledWith(
        101,
      );
    } finally {
      socket?.disconnect();
    }
  }, 10000);
});
