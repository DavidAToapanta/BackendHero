import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../apps/gym-api/src/app.module';
import { NotificationsService } from '../apps/gym-api/src/notifications/notifications.service';
import { PrismaService } from '../apps/gym-api/src/prisma/prisma.service';

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

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(NotificationsService)
      .useValue(notificationsService)
      .compile();

    app = module.createNestApplication();
    app.enableCors();
    app.useGlobalPipes(new ValidationPipe());
    await app.listen(0, '127.0.0.1');
  }, 30000);

  afterAll(async () => {
    await app?.close();
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
