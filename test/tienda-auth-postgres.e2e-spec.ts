import { randomUUID } from 'node:crypto';
import {
  PermisosService,
  RolesNegocioService,
  type CodigoPermisoTienda,
} from '@app/permisos';
import { PrismaService } from '@app/prisma';
import {
  Controller,
  Get,
  INestApplication,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule as GymAppModule } from '../apps/gym-api/src/app.module';
import {
  AccesosModule,
  RequierePermisoTienda,
} from '../apps/tienda-api/src/accesos/accesos.module';
import { AppModule } from '../apps/tienda-api/src/app.module';
import {
  ContextoTiendaActual,
  type ContextoTienda,
} from '../apps/tienda-api/src/auth';
import type {
  AccesoTienda,
  SeleccionTienda,
} from '../apps/tienda-api/src/auth/auth.types';

const suite =
  process.env.TIENDA_AUTH_POSTGRES_E2E === '1' ? describe : describe.skip;

@Controller('ensayo-accesos')
class EnsayoAccesosController {
  @Get('ventas/:tenantId')
  @RequierePermisoTienda('store.sales.create')
  venta(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param('tenantId', ParseIntPipe) tenantId: number,
  ) {
    if (contexto.tenantId !== tenantId) {
      throw new NotFoundException();
    }
    return { tenantId: contexto.tenantId };
  }

  @Get('abonos')
  @RequierePermisoTienda('store.receivables.collect', 'store.payments.create')
  abono() {
    return { autorizado: true };
  }

  @Get('anulaciones')
  @RequierePermisoTienda('store.sales.void')
  anulacion() {
    return { autorizado: true };
  }
}

@Module({ imports: [AccesosModule], controllers: [EnsayoAccesosController] })
class EnsayoAccesosModule {}

suite('Tienda · autenticación y permisos con PostgreSQL', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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
    const module = await Test.createTestingModule({
      imports: [AppModule, EnsayoAccesosModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  async function registrarPersonal(password = ' clave a02 ') {
    const credenciales = {
      cedula: 'a02-' + randomUUID(),
      password,
    };
    const usuario = await prisma.usuario.create({
      data: {
        cedula: credenciales.cedula,
        password: await bcrypt.hash(credenciales.password, 4),
        nombres: 'Personal',
        apellidos: 'Ensayo',
      },
    });
    return { credenciales, usuario };
  }

  function crearNegocio(data: Partial<Prisma.TenantCreateInput> = {}) {
    return prisma.tenant.create({
      data: {
        slug: 'a02-' + randomUUID(),
        nombre: 'Tienda de ensayo',
        tipoNegocio: 'STORE',
        modules: { create: { module: 'STORE', activo: true } },
        ...data,
      },
    });
  }

  function vincularPersonal(
    usuarioId: number,
    tenantId: number,
    estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
  ) {
    return prisma.userTenant.create({
      data: { usuarioId, tenantId, role: 'ADMIN', estado },
    });
  }

  async function asignarRol(
    tenantId: number,
    membresiaId: number,
    activo = true,
  ) {
    const rol = await prisma.rolNegocio.create({
      data: { tenantId, codigo: 'BODEGUERO', nombre: 'Bodeguero', activo },
    });
    await prisma.asignacionRol.create({
      data: { tenantId, membresiaId, rolId: rol.id },
    });
    return rol;
  }

  function http() {
    return request(app.getHttpServer());
  }

  async function loginTienda(credenciales: {
    cedula: string;
    password: string;
  }) {
    const respuesta = await http()
      .post('/auth/login')
      .send(credenciales)
      .expect(200);
    return respuesta.body as AccesoTienda;
  }

  it('lista solo tiendas elegibles y vuelve a resolver la membresía al seleccionar', async () => {
    const { credenciales, usuario } = await registrarPersonal();
    const norte = await crearNegocio({ nombre: 'Norte' });
    const mixto = await crearNegocio({
      nombre: 'Mixto',
      tipoNegocio: 'MIXTO',
      autorizacionVersion: 'PERMISOS',
      modules: { create: [{ module: 'GYM' }, { module: 'STORE' }] },
    });
    const gym = await crearNegocio({
      tipoNegocio: 'GYM',
      modules: { create: { module: 'GYM' } },
    });
    const sinStore = await crearNegocio({
      modules: { create: { module: 'STORE', activo: false } },
    });
    const negocioSuspendido = await crearNegocio({ estado: 'SUSPENDIDO' });
    const membresiaSuspendida = await crearNegocio();
    const rolInactivo = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const ajeno = await crearNegocio();
    const miembroNorte = await vincularPersonal(usuario.id, norte.id);
    const miembroMixto = await vincularPersonal(usuario.id, mixto.id);
    await asignarRol(mixto.id, miembroMixto.id);
    for (const negocio of [gym, sinStore, negocioSuspendido]) {
      await vincularPersonal(usuario.id, negocio.id);
    }
    await vincularPersonal(usuario.id, membresiaSuspendida.id, 'INACTIVO');
    const miembroRolInactivo = await vincularPersonal(
      usuario.id,
      rolInactivo.id,
    );
    await asignarRol(rolInactivo.id, miembroRolInactivo.id, false);

    const login = await http()
      .post('/auth/login')
      .send(credenciales)
      .expect(200);
    const { selectionToken, contexts } = login.body as SeleccionTienda;
    expect(contexts).toEqual([
      { tenantId: norte.id, tenantNombre: 'Norte' },
      { tenantId: mixto.id, tenantNombre: 'Mixto' },
    ]);
    await http()
      .post('/auth/select-context')
      .send({ selectionToken, tenantId: ajeno.id })
      .expect(403);
    await prisma.userTenant.update({
      where: { id: miembroNorte.id },
      data: { estado: 'INACTIVO' },
    });
    await http()
      .post('/auth/select-context')
      .send({ selectionToken, tenantId: norte.id })
      .expect(403);

    const acceso = await http()
      .post('/auth/select-context')
      .send({ selectionToken, tenantId: mixto.id })
      .expect(200);
    const { context, accessToken } = acceso.body as AccesoTienda;
    expect(context).toEqual({
      usuarioId: usuario.id,
      tenantId: mixto.id,
      tenantNombre: 'Mixto',
      membresiaId: miembroMixto.id,
      versionAutorizacion: 1,
      modoAutorizacion: 'PERMISOS',
      rolEfectivo: { codigo: 'BODEGUERO', nombre: 'Bodeguero' },
    });
    await http()
      .get('/auth/session')
      .auth(accessToken, { type: 'bearer' })
      .expect(200, { context });
  });

  it('invalida una sesión al cambiar versión, modo, membresía o módulo', async () => {
    const { credenciales, usuario } = await registrarPersonal();
    const tienda = await crearNegocio();
    const membresia = await vincularPersonal(usuario.id, tienda.id);
    await asignarRol(tienda.id, membresia.id);
    async function login() {
      const respuesta = await http()
        .post('/auth/login')
        .send(credenciales)
        .expect(200);
      return respuesta.body as AccesoTienda;
    }
    function session(token: string) {
      return http().get('/auth/session').auth(token, { type: 'bearer' });
    }

    const legacy = await login();
    expect(legacy.context.rolEfectivo).toEqual({
      codigo: 'ADMIN',
      nombre: 'ADMIN',
    });
    await session(legacy.accessToken).expect(200, { context: legacy.context });
    await prisma.userTenant.update({
      where: { id: membresia.id },
      data: { versionAutorizacion: { increment: 1 } },
    });
    await session(legacy.accessToken).expect(401);

    const versionActual = await login();
    expect(versionActual.context.versionAutorizacion).toBe(2);
    await prisma.tenant.update({
      where: { id: tienda.id },
      data: { autorizacionVersion: 'PERMISOS' },
    });
    await session(versionActual.accessToken).expect(401);

    const permisos = await login();
    await prisma.userTenant.update({
      where: { id: membresia.id },
      data: { estado: 'INACTIVO' },
    });
    await session(permisos.accessToken).expect(401);
    await prisma.userTenant.update({
      where: { id: membresia.id },
      data: { estado: 'ACTIVO' },
    });

    const reactivada = await login();
    await prisma.tenantModule.update({
      where: { tenantId_module: { tenantId: tienda.id, module: 'STORE' } },
      data: { activo: false },
    });
    await session(reactivada.accessToken).expect(401);
    await http().post('/auth/login').send(credenciales).expect(403);
  });

  it('aplica permisos de STORE al negocio autenticado y revoca sesiones al editar un rol', async () => {
    const tienda = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const ajeno = await crearNegocio();
    const catalogo = await prisma.$transaction((tx) =>
      app.get(PermisosService).registrarCatalogo(tx),
    );

    async function perfil(
      codigo: string,
      permisos: readonly CodigoPermisoTienda[],
      base: 'OWNER' | 'ADMIN' | 'CAJERO' | 'EMPLEADO',
    ) {
      const { usuario, credenciales } = await registrarPersonal();
      const membresia = await prisma.userTenant.create({
        data: { usuarioId: usuario.id, tenantId: tienda.id, role: base },
      });
      const protegido = codigo === 'OWNER' || codigo === 'ADMIN';
      const rol = await prisma.rolNegocio.create({
        data: {
          tenantId: tienda.id,
          codigo,
          nombre: codigo,
          protegido,
          equivalenciaLegacy: protegido ? base : null,
          rolPermiso_rol: {
            createMany: {
              data: catalogo
                .filter(({ codigo }) =>
                  permisos.some((permiso) => permiso === codigo),
                )
                .map(({ id }) => ({ permisoId: id })),
            },
          },
        },
      });
      await prisma.asignacionRol.create({
        data: { tenantId: tienda.id, membresiaId: membresia.id, rolId: rol.id },
      });
      return { rol, credenciales, ...(await loginTienda(credenciales)) };
    }

    const cajero = await perfil(
      'CAJERO',
      [
        'store.sales.create',
        'store.payments.create',
        'store.receivables.collect',
      ],
      'CAJERO',
    );
    const bodeguero = await perfil(
      'BODEGUERO',
      ['store.inventory.read', 'store.inventory.receive'],
      'EMPLEADO',
    );
    const administrador = await perfil('ADMIN', ['store.sales.void'], 'ADMIN');
    const owner = await perfil('OWNER', [], 'OWNER');
    const venta = `/ensayo-accesos/ventas/${tienda.id}`;
    const abonos = '/ensayo-accesos/abonos';
    const anulaciones = '/ensayo-accesos/anulaciones';
    const consultar = (ruta: string, token: string) =>
      http().get(ruta).auth(token, { type: 'bearer' });

    await http().get(venta).expect(401);
    await consultar(venta, cajero.accessToken).expect(200, {
      tenantId: tienda.id,
    });
    await consultar(
      `/ensayo-accesos/ventas/${ajeno.id}`,
      cajero.accessToken,
    ).expect(404);
    await consultar(abonos, cajero.accessToken).expect(200);
    await consultar(venta, bodeguero.accessToken).expect(403);
    await consultar(anulaciones, cajero.accessToken).expect(403);
    await consultar(anulaciones, bodeguero.accessToken).expect(403);
    await consultar(anulaciones, administrador.accessToken).expect(200);
    await consultar(anulaciones, owner.accessToken).expect(200);

    const roles = app.get(RolesNegocioService);
    await expect(
      roles.crear(owner.context, {
        codigo: 'CUSTOM',
        nombre: 'Personalizado',
        permisos: ['store.sales.void'],
      }),
    ).rejects.toMatchObject({ status: 403 });
    await roles.editar(owner.context, cajero.rol.id, {
      permisos: ['store.sales.create', 'store.payments.create'],
    });
    await consultar(abonos, cajero.accessToken).expect(401);
    const sesionNueva = await loginTienda(cajero.credenciales);
    expect(sesionNueva.context.versionAutorizacion).toBe(
      cajero.context.versionAutorizacion + 1,
    );
    await consultar(venta, sesionNueva.accessToken).expect(200);
    await consultar(abonos, sesionNueva.accessToken).expect(403);
  });

  it('conserva el acceso de Gym en un negocio MIXTO durante la prueba de modo y módulo STORE', async () => {
    const { credenciales, usuario } =
      await registrarPersonal('clave-a03-ensayo');
    const tienda = await crearNegocio({
      tipoNegocio: 'MIXTO',
      modules: { create: [{ module: 'GYM' }, { module: 'STORE' }] },
    });
    const membresia = await prisma.userTenant.create({
      data: { usuarioId: usuario.id, tenantId: tienda.id, role: 'OWNER' },
    });
    const rol = await prisma.rolNegocio.create({
      data: {
        tenantId: tienda.id,
        codigo: 'OWNER',
        nombre: 'Dueño',
        protegido: true,
        equivalenciaLegacy: 'OWNER',
      },
    });
    await prisma.asignacionRol.create({
      data: { tenantId: tienda.id, membresiaId: membresia.id, rolId: rol.id },
    });

    const moduleGym = await Test.createTestingModule({
      imports: [GymAppModule],
    }).compile();
    const gym = moduleGym.createNestApplication<INestApplication<App>>({
      logger: false,
    });
    try {
      await gym.init();
      const gymHttp = request(gym.getHttpServer());
      const gymLogin = await gymHttp
        .post('/auth/login')
        .send(credenciales)
        .expect(201);
      const gymToken = (gymLogin.body as { access_token: string }).access_token;
      const consultarGym = () =>
        gymHttp.get('/producto').auth(gymToken, { type: 'bearer' }).expect(200);
      const consultarTienda = (token: string) =>
        http()
          .get('/ensayo-accesos/anulaciones')
          .auth(token, { type: 'bearer' });

      await consultarGym();
      const legacy = await loginTienda(credenciales);
      await consultarTienda(legacy.accessToken).expect(403);
      await prisma.tenant.update({
        where: { id: tienda.id },
        data: { autorizacionVersion: 'PERMISOS' },
      });
      await consultarTienda(legacy.accessToken).expect(401);
      const permisos = await loginTienda(credenciales);
      await consultarTienda(permisos.accessToken).expect(200);
      await consultarGym();

      await prisma.tenantModule.update({
        where: { tenantId_module: { tenantId: tienda.id, module: 'STORE' } },
        data: { activo: false },
      });
      await consultarTienda(permisos.accessToken).expect(401);
      await consultarGym();
    } finally {
      await gym.close();
    }
  });
});
