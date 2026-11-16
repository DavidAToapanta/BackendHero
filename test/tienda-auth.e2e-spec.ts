import { IdentidadService } from '@app/identidad';
import { MembresiasPersonalService } from '@app/negocios';
import { PrismaService } from '@app/prisma';
import { getJwtSecret } from '@app/seguridad';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule as GymAppModule } from '../apps/gym-api/src/app.module';
import { AppModule } from '../apps/tienda-api/src/app.module';
import {
  JWT_TIENDA_ACCESO,
  JWT_TIENDA_EMISOR,
  JWT_TIENDA_SELECCION,
} from '../apps/tienda-api/src/auth/auth.config';
import type {
  AccesoTienda,
  SeleccionTienda,
} from '../apps/tienda-api/src/auth/auth.types';

describe('Tienda · autenticación HTTP', () => {
  const secret = 'secreto-tienda-http-ensayo';
  const credenciales = { cedula: '0012', password: 'ensayo' };
  const verifyCredentials = jest.fn();
  const listarActivasPorModulo = jest.fn();
  const anterior = process.env.TIENDA_JWT_SECRET;
  const jwt = new JwtService({ secret });
  const opcionesVerificacion = { issuer: JWT_TIENDA_EMISOR };
  const norte = {
    id: 31,
    tenantId: 41,
    role: 'ADMIN',
    versionAutorizacion: 1,
    tenant: { nombre: 'Tienda Norte', autorizacionVersion: 'LEGACY' },
    asignacionRol_membresia: [],
  };
  const sur = {
    id: 32,
    tenantId: 42,
    role: 'EMPLEADO',
    versionAutorizacion: 2,
    tenant: { nombre: 'Tienda Sur', autorizacionVersion: 'PERMISOS' },
    asignacionRol_membresia: [
      { rol: { codigo: 'BODEGUERO', nombre: 'Bodeguero' } },
    ],
  };
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.TIENDA_JWT_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(IdentidadService)
      .useValue({ verifyCredentials })
      .overrideProvider(MembresiasPersonalService)
      .useValue({ listarActivasPorModulo })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    if (anterior === undefined) delete process.env.TIENDA_JWT_SECRET;
    else process.env.TIENDA_JWT_SECRET = anterior;
    await app?.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    verifyCredentials.mockResolvedValue({
      status: 'valid',
      account: { id: 17 },
    });
    listarActivasPorModulo.mockImplementation(
      (usuarioId: number, modulo: string, tenantId?: number) =>
        Promise.resolve(
          usuarioId === 17 && modulo === 'STORE'
            ? [norte, sur].filter(
                (membresia) =>
                  tenantId === undefined || membresia.tenantId === tenantId,
              )
            : [],
        ),
    );
  });

  function http() {
    return request(app.getHttpServer());
  }

  async function loginParaSeleccion() {
    const respuesta = await http()
      .post('/auth/login')
      .send(credenciales)
      .expect(200);
    return respuesta.body as SeleccionTienda;
  }

  it('elige entre dos negocios y carga solo el contexto de la tienda elegida', async () => {
    const { requiresContextSelection, selectionToken, contexts } =
      await loginParaSeleccion();
    expect(requiresContextSelection).toBe(true);
    expect(contexts).toEqual([
      { tenantId: 41, tenantNombre: 'Tienda Norte' },
      { tenantId: 42, tenantNombre: 'Tienda Sur' },
    ]);
    const seleccion = jwt.verify<{ iat: number; exp: number }>(selectionToken, {
      ...opcionesVerificacion,
      audience: JWT_TIENDA_SELECCION,
    });
    expect(seleccion.exp - seleccion.iat).toBe(600);

    const acceso = await http()
      .post('/auth/select-context')
      .send({ selectionToken, tenantId: 42 })
      .expect(200);
    const { context, accessToken } = acceso.body as AccesoTienda;
    expect(context).toEqual({
      usuarioId: 17,
      tenantId: 42,
      tenantNombre: 'Tienda Sur',
      membresiaId: 32,
      versionAutorizacion: 2,
      modoAutorizacion: 'PERMISOS',
      rolEfectivo: { codigo: 'BODEGUERO', nombre: 'Bodeguero' },
    });
    const claims = jwt.verify<{ iat: number; exp: number }>(accessToken, {
      ...opcionesVerificacion,
      audience: JWT_TIENDA_ACCESO,
    });
    expect(claims.exp - claims.iat).toBe(86400);
    await http()
      .get('/auth/session?tenantId=41')
      .auth(accessToken, { type: 'bearer' })
      .expect(200, { context });

    await http()
      .get('/auth/session')
      .auth(selectionToken, { type: 'bearer' })
      .expect(401);
    await http()
      .post('/auth/select-context')
      .send({ selectionToken: accessToken, tenantId: 42 })
      .expect(401);
    await http()
      .post('/auth/select-context')
      .send({ selectionToken, tenantId: 999 })
      .expect(403);
    listarActivasPorModulo.mockResolvedValue([]);
    await http()
      .post('/auth/select-context')
      .send({ selectionToken, tenantId: 42 })
      .expect(403);
  });

  it('valida el cuerpo y distingue DTO inválido, credenciales inválidas y falta de acceso', async () => {
    await http().post('/auth/login').send([]).expect(400);
    await http()
      .post('/auth/login')
      .send({ ...credenciales, tenantId: 41 })
      .expect(400);
    await http()
      .post('/auth/login')
      .send({ ...credenciales, cedula: ' ' })
      .expect(400);
    await http()
      .post('/auth/select-context')
      .send({ selectionToken: 'token', tenantId: '41' })
      .expect(400);
    await http()
      .post('/auth/select-context')
      .send({ selectionToken: 'token', tenantId: 0 })
      .expect(400);
    await http()
      .post('/auth/select-context')
      .send({ selectionToken: 'token', tenantId: 2147483648 })
      .expect(400);
    await http().get('/auth/session').expect(401);
    expect(verifyCredentials).not.toHaveBeenCalled();
    verifyCredentials.mockResolvedValueOnce({ status: 'invalid-password' });
    await http().post('/auth/login').send(credenciales).expect(401);
    listarActivasPorModulo.mockResolvedValueOnce([]);
    await http().post('/auth/login').send(credenciales).expect(403);
  });

  it('rechaza tokens vencidos y separa los tokens de Gym y Tienda en ambas direcciones', async () => {
    const vencido = jwt.sign(
      { sub: 17, tokenType: 'CONTEXT_SELECTION' },
      {
        issuer: JWT_TIENDA_EMISOR,
        audience: JWT_TIENDA_SELECCION,
        expiresIn: -1,
      },
    );
    await http()
      .post('/auth/select-context')
      .send({ selectionToken: vencido, tenantId: 41 })
      .expect(401);
    const tokenGym = new JwtService({ secret: getJwtSecret() }).sign(
      { sub: 17, rol: 'ADMIN', tenantRole: 'ADMIN', tenantId: 41 },
      { expiresIn: '1d' },
    );
    await http()
      .get('/auth/session')
      .auth(tokenGym, { type: 'bearer' })
      .expect(401);

    listarActivasPorModulo.mockResolvedValue([norte]);
    const respuesta = await http()
      .post('/auth/login')
      .send(credenciales)
      .expect(200);
    const { accessToken, context } = respuesta.body as AccesoTienda;
    const accesoVencido = jwt.sign(
      {
        sub: context.usuarioId,
        tokenType: 'ACCESS',
        tenantId: context.tenantId,
        membresiaId: context.membresiaId,
        versionAutorizacion: context.versionAutorizacion,
        modoAutorizacion: context.modoAutorizacion,
      },
      {
        issuer: JWT_TIENDA_EMISOR,
        audience: JWT_TIENDA_ACCESO,
        expiresIn: -1,
      },
    );
    await http()
      .get('/auth/session')
      .auth(accesoVencido, { type: 'bearer' })
      .expect(401);
    await http()
      .get('/auth/session')
      .auth(accessToken, { type: 'bearer' })
      .expect(200, { context });
    const gymModule = await Test.createTestingModule({
      imports: [GymAppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const gym = gymModule.createNestApplication<INestApplication<App>>({
      logger: false,
    });
    try {
      await gym.init();
      await request(gym.getHttpServer())
        .get('/producto')
        .auth(accessToken, { type: 'bearer' })
        .expect(401);
      await http()
        .get('/auth/session')
        .auth(accessToken, { type: 'bearer' })
        .expect(200, { context });
    } finally {
      await gym.close();
    }
  });
});
