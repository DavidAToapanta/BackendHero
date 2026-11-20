import { randomUUID } from 'node:crypto';
import { PrismaService } from '@app/prisma';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule as GymAppModule } from '../apps/gym-api/src/app.module';
import { AppModule } from '../apps/tienda-api/src/app.module';
import { AuditoriaEscrituraService } from '../apps/tienda-api/src/auditoria/auditoria-escritura';
import type { AccesoTienda } from '../apps/tienda-api/src/auth/auth.types';

const suite =
  process.env.TIENDA_AUTH_POSTGRES_E2E === '1' ? describe : describe.skip;
const registro = '/auth/register-owner';

function datosDeEnsayo() {
  const id = randomUUID();
  return {
    cedula: `00-${id}`,
    password: ` clave-${id} `,
    nombres: 'Nombres de ensayo',
    apellidos: 'Apellidos de ensayo',
    email: `ensayo-${id}@example.com`,
    tenantNombre: 'Tienda de ensayo',
    tenantSlug: `registro-${id}`,
  };
}

suite('Registro de propietarios de Tienda con PostgreSQL', () => {
  let app: INestApplication<App>;
  let gym: INestApplication<App> | undefined;
  let prisma: PrismaService;
  const secretoAnterior = process.env.TIENDA_JWT_SECRET;

  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? '');
    if (
      database.hostname !== '127.0.0.1' ||
      database.pathname !== '/hero_tienda_auth_test'
    ) {
      throw new Error(
        'Se requiere la base local desechable hero_tienda_auth_test',
      );
    }
    process.env.TIENDA_JWT_SECRET ??= randomUUID();
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);
  }, 30_000);

  afterAll(async () => {
    await gym?.close();
    await app?.close();
    if (secretoAnterior === undefined) delete process.env.TIENDA_JWT_SECRET;
    else process.env.TIENDA_JWT_SECRET = secretoAnterior;
  });

  function http() {
    return request(app.getHttpServer());
  }

  async function alta(datos: ReturnType<typeof datosDeEnsayo>) {
    const respuesta = await http().post(registro).send(datos).expect(201);
    return respuesta.body as AccesoTienda;
  }

  it('crea una cuenta, emite acceso directo y permite operar en dos tiendas aisladas', async () => {
    const datos = datosDeEnsayo();
    const primera = await alta({ ...datos, email: datos.email.toUpperCase() });
    const { accessToken, context } = primera;
    expect(typeof accessToken).toBe('string');
    for (const id of [
      context.usuarioId,
      context.tenantId,
      context.membresiaId,
      context.versionAutorizacion,
    ]) {
      expect(Number.isInteger(id) && id > 0).toBe(true);
    }
    expect(primera).toEqual({
      requiresContextSelection: false,
      accessToken,
      context: {
        usuarioId: context.usuarioId,
        tenantId: context.tenantId,
        tenantNombre: datos.tenantNombre,
        membresiaId: context.membresiaId,
        versionAutorizacion: context.versionAutorizacion,
        modoAutorizacion: 'PERMISOS',
        rolEfectivo: { codigo: 'OWNER', nombre: 'OWNER' },
      },
    });
    const cuentaAntes = await prisma.usuario.findUniqueOrThrow({
      where: { id: primera.context.usuarioId },
    });
    expect(cuentaAntes.cedula).toBe(datos.cedula);
    expect(cuentaAntes.email).toBe(datos.email);
    expect(await bcrypt.compare(datos.password, cuentaAntes.password)).toBe(
      true,
    );
    expect(cuentaAntes.password).not.toBe(datos.password);
    const membresiaAntes = await prisma.userTenant.findUniqueOrThrow({
      where: { id: primera.context.membresiaId },
    });
    const tienda = await prisma.tenant.findUniqueOrThrow({
      where: { id: primera.context.tenantId },
      include: { modules: true, rolNegocio: true, auditoriaOperacion: true },
    });
    expect(tienda.tipoNegocio).toBe('STORE');
    expect(tienda.estado).toBe('ACTIVO');
    expect(tienda.modules).toMatchObject([{ module: 'STORE', activo: true }]);
    expect(tienda.rolNegocio.map(({ codigo }) => codigo)).toEqual(
      expect.arrayContaining(['OWNER', 'ADMIN', 'CAJERO', 'BODEGUERO']),
    );
    expect(tienda.auditoriaOperacion).toMatchObject([
      { accion: 'tienda.registrar' },
    ]);

    const segunda = await alta({
      ...datos,
      nombres: 'Nombre distinto',
      apellidos: 'Apellido distinto',
      tenantNombre: 'Otra tienda',
      tenantSlug: `${datos.tenantSlug}-segunda`,
    });
    expect(segunda.requiresContextSelection).toBe(false);
    expect(segunda.context.usuarioId).toBe(primera.context.usuarioId);
    expect(segunda.context.tenantId).not.toBe(primera.context.tenantId);
    expect(
      await prisma.usuario.findUnique({ where: { id: cuentaAntes.id } }),
    ).toEqual(cuentaAntes);
    expect(
      await prisma.userTenant.findUnique({ where: { id: membresiaAntes.id } }),
    ).toEqual(membresiaAntes);

    await http()
      .get('/auth/session')
      .auth(primera.accessToken, { type: 'bearer' })
      .expect(200, { context: primera.context });
    const categoria = await http()
      .post('/catalogo/categorias')
      .auth(primera.accessToken, { type: 'bearer' })
      .send({ nombre: 'Categoría aislada' })
      .expect(201);
    const { id } = categoria.body as { id: number };
    await http()
      .patch(`/catalogo/categorias/${id}`)
      .auth(segunda.accessToken, { type: 'bearer' })
      .send({ nombre: 'Cambio ajeno' })
      .expect(404);
    await http()
      .post('/auth/login')
      .send({ cedula: datos.cedula, password: datos.password })
      .expect(200)
      .expect(({ body }: { body: { contexts: { tenantId: number }[] } }) => {
        expect(body.contexts.map(({ tenantId }) => tenantId)).toEqual([
          primera.context.tenantId,
          segunda.context.tenantId,
        ]);
      });

    const moduloGym = await Test.createTestingModule({
      imports: [GymAppModule],
    }).compile();
    gym = moduloGym.createNestApplication({ logger: false });
    await gym.init();
    const httpGym = request(gym.getHttpServer());
    const otraCuenta = datosDeEnsayo();
    const accesoGym = await httpGym
      .post(registro)
      .send({ ...otraCuenta, password: otraCuenta.password.trim() })
      .expect(201);
    const { access_token } = accesoGym.body as { access_token: string };
    await httpGym
      .get('/tenants')
      .auth(primera.accessToken, { type: 'bearer' })
      .expect(401);
    await http()
      .get('/auth/session')
      .auth(access_token, { type: 'bearer' })
      .expect(401);
  }, 30_000);

  it('valida campos y rechaza credenciales, correos y slugs en conflicto', async () => {
    const datos = datosDeEnsayo();
    const restante = datosDeEnsayo();
    for (const campo of ['ownerUserId', 'tenantId', 'roles', 'permisos']) {
      await http()
        .post(registro)
        .send({ ...datos, [campo]: 1 })
        .expect(400);
    }
    await http()
      .post(registro)
      .send({ ...datos, password: '12345' })
      .expect(400);
    await http()
      .post(registro)
      .send({ ...datos, email: 'inválido' })
      .expect(400);
    await http()
      .post(registro)
      .send({ ...datos, tenantSlug: '---' })
      .expect(400);
    await alta(datos);
    await http()
      .post(registro)
      .send({
        ...datos,
        tenantSlug: restante.tenantSlug,
        password: 'incorrecta',
      })
      .expect(401)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toBe('Credenciales inválidas');
      });
    await http()
      .post(registro)
      .send({
        ...datos,
        tenantSlug: restante.tenantSlug,
        email: restante.email,
      })
      .expect(409);
    await http()
      .post(registro)
      .send({ ...restante, email: datos.email.toUpperCase() })
      .expect(409);
    await http()
      .post(registro)
      .send({ ...restante, tenantSlug: datos.tenantSlug.toUpperCase() })
      .expect(409)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toBe('El slug de la tienda ya está en uso');
      });
    expect(
      await prisma.usuario.count({ where: { cedula: restante.cedula } }),
    ).toBe(0);
    expect(
      await prisma.tenant.count({ where: { slug: restante.tenantSlug } }),
    ).toBe(0);
  }, 30_000);

  it('reutiliza una cuenta sin correo y deja intactos su perfil y acceso anterior', async () => {
    const datos = datosDeEnsayo();
    const existente = await prisma.usuario.create({
      data: {
        cedula: datos.cedula,
        password: await bcrypt.hash(datos.password, 4),
        nombres: 'Perfil anterior',
        apellidos: 'De ensayo',
      },
    });
    const negocio = await prisma.tenant.create({
      data: {
        nombre: 'Gimnasio de ensayo',
        slug: `gym-${randomUUID()}`,
        tipoNegocio: 'GYM',
        modules: { create: { module: 'GYM' } },
        users: { create: { usuarioId: existente.id, role: 'ADMIN' } },
      },
      include: { users: true },
    });
    const coincidencia = datosDeEnsayo();
    await alta(coincidencia);
    await http()
      .post(registro)
      .send({ ...datos, email: coincidencia.email })
      .expect(409);
    const acceso = await alta(datos);
    expect(acceso.context.usuarioId).toBe(existente.id);
    expect(
      await prisma.usuario.findUnique({ where: { id: existente.id } }),
    ).toEqual(existente);
    expect(
      await prisma.userTenant.findMany({ where: { tenantId: negocio.id } }),
    ).toEqual(negocio.users);
  });

  it('revierte la cuenta y toda la tienda si falla después de activar los permisos', async () => {
    const datos = datosDeEnsayo();
    const auditoria = app.get<AuditoriaEscrituraService>(
      AuditoriaEscrituraService,
    );
    let tenantId: number | undefined;
    const fallo = jest
      .spyOn(auditoria, 'registrar')
      .mockImplementationOnce((_tx, contexto) => {
        tenantId = contexto.tenantId;
        throw new Error('Fallo de ensayo');
      });
    try {
      await http().post(registro).send(datos).expect(500, {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'No se pudo completar el registro de la tienda',
      });
    } finally {
      fallo.mockRestore();
    }
    expect(tenantId).toBeDefined();
    const filtro = { tenantId: tenantId! };
    expect(
      await prisma.usuario.count({ where: { cedula: datos.cedula } }),
    ).toBe(0);
    expect(
      await prisma.tenant.count({ where: { slug: datos.tenantSlug } }),
    ).toBe(0);
    expect(
      await Promise.all([
        prisma.tenantModule.count({ where: filtro }),
        prisma.userTenant.count({ where: filtro }),
        prisma.rolNegocio.count({ where: filtro }),
        prisma.rolPermiso.count({ where: filtro }),
        prisma.asignacionRol.count({ where: filtro }),
      ]),
    ).toEqual([0, 0, 0, 0, 0]);
  });

  it('solo confirma una de dos altas concurrentes con el mismo slug', async () => {
    const primero = datosDeEnsayo();
    const segundo = { ...datosDeEnsayo(), tenantSlug: primero.tenantSlug };
    const respuestas = await Promise.all([
      http().post(registro).send(primero),
      http().post(registro).send(segundo),
    ]);
    expect(respuestas.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      await prisma.tenant.count({ where: { slug: primero.tenantSlug } }),
    ).toBe(1);
    expect(
      await prisma.usuario.count({
        where: { cedula: { in: [primero.cedula, segundo.cedula] } },
      }),
    ).toBe(1);
  }, 30_000);

  it('resuelve la carrera de identidad y permite reintentar con la cuenta existente', async () => {
    const primero = datosDeEnsayo();
    const id = randomUUID();
    const nombre = `Tienda Única ${id}`;
    const segundo = { ...primero, tenantNombre: nombre, tenantSlug: undefined };
    const respuestas = await Promise.all([
      http().post(registro).send(primero),
      http().post(registro).send(segundo),
    ]);
    expect(respuestas.map(({ status }) => status).sort()).toEqual([201, 409]);
    const indiceGanador = respuestas[0].status === 201 ? 0 : 1;
    const ganador = respuestas[indiceGanador].body as AccesoTienda;
    const reintento = await http()
      .post(registro)
      .send(indiceGanador === 0 ? segundo : primero)
      .expect(201);
    const acceso = reintento.body as AccesoTienda;
    expect(acceso.context.usuarioId).toBe(ganador.context.usuarioId);
    expect(acceso.context.tenantId).not.toBe(ganador.context.tenantId);
    expect(
      await prisma.tenant.count({
        where: { slug: `tienda-unica-${id}` },
      }),
    ).toBe(1);
  }, 30_000);
});
