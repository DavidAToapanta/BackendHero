import { randomUUID } from 'node:crypto';
import { InventarioLotesService } from '@app/inventario';
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
  AccesosService,
  RequierePermisoTienda,
} from '../apps/tienda-api/src/accesos/accesos.module';
import { AppModule } from '../apps/tienda-api/src/app.module';
import {
  ACCIONES_AUDITORIA,
  AuditoriaEscrituraService,
} from '../apps/tienda-api/src/auditoria/auditoria-escritura';
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

  async function loginTienda(
    { cedula, password }: { cedula: string; password: string },
    tenantId?: number,
  ) {
    const respuesta = await http()
      .post('/auth/login')
      .send({ cedula, password })
      .expect(200);
    const login = respuesta.body as AccesoTienda | SeleccionTienda;
    if (login.requiresContextSelection) {
      const seleccion = await http()
        .post('/auth/select-context')
        .send({ selectionToken: login.selectionToken, tenantId })
        .expect(200);
      return seleccion.body as AccesoTienda;
    }
    return login;
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
      await http()
        .post('/accesos/roles/preparar')
        .auth(legacy.accessToken, { type: 'bearer' })
        .expect(403);
      await prisma.tenant.update({
        where: { id: tienda.id },
        data: { autorizacionVersion: 'PERMISOS' },
      });
      await consultarTienda(legacy.accessToken).expect(401);
      const permisos = await loginTienda(credenciales);
      await consultarTienda(permisos.accessToken).expect(200);
      await http()
        .get('/accesos/personal')
        .auth(permisos.accessToken, { type: 'bearer' })
        .expect(200);
      await http()
        .post('/accesos/roles')
        .auth(permisos.accessToken, { type: 'bearer' })
        .send({ codigo: 'LECTOR', nombre: 'Lector', permisos: [] })
        .expect(403);
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

  it('prepara y activa personal STORE, protege roles y registra la auditoría de las escrituras', async () => {
    const tienda = await crearNegocio();
    const { usuario: propietario, credenciales } = await registrarPersonal();
    const owner = await prisma.userTenant.create({
      data: { tenantId: tienda.id, usuarioId: propietario.id, role: 'OWNER' },
    });
    const inicial = await loginTienda(credenciales);
    const bearer = { type: 'bearer' } as const;
    const preparar = (token: string) =>
      http().post('/accesos/roles/preparar').auth(token, bearer);
    const activar = (token: string) =>
      http()
        .post('/accesos/roles/activar')
        .auth(token, bearer)
        .send({ motivo: 'Inicio del piloto' });
    await activar(inicial.accessToken).expect(409);
    const preparado = await preparar(inicial.accessToken).expect(200);
    expect(preparado.body).toMatchObject({
      requiereNuevoLogin: true,
      asignacionesCreadas: 1,
    });
    await activar(inicial.accessToken).expect(401);

    const administrador = await registrarPersonal();
    await vincularPersonal(administrador.usuario.id, tienda.id);
    const adminLegacy = await loginTienda(administrador.credenciales);
    await preparar(adminLegacy.accessToken).expect(403);
    const previa = await loginTienda(credenciales);
    await activar(previa.accessToken).expect(409);
    await preparar(previa.accessToken).expect(200);
    const repetido = await preparar(previa.accessToken).expect(200);
    expect(repetido.body).toMatchObject({
      rolesCreados: 0,
      permisosAgregados: 0,
      asignacionesCreadas: 0,
      requiereNuevoLogin: false,
    });
    await activar(previa.accessToken).expect(200, {
      tenantId: tienda.id,
      modo: 'PERMISOS',
      requiereNuevoLogin: true,
    });
    await http()
      .get('/accesos/personal')
      .auth(previa.accessToken, bearer)
      .expect(401);
    const sesionOwner = await loginTienda(credenciales);
    const sesionAdmin = await loginTienda(administrador.credenciales);
    const ownerToken = sesionOwner.accessToken;
    const roles = await http()
      .get('/accesos/roles')
      .auth(ownerToken, bearer)
      .expect(200);
    const perfiles = new Map(
      (roles.body as { id: number; codigo: string; permisos: string[] }[]).map(
        (rol) => [rol.codigo, rol],
      ),
    );
    const cajero = perfiles.get('CAJERO')!;
    const bodega = perfiles.get('BODEGUERO')!;
    expect(cajero.permisos).toContain('store.receivables.collect');
    expect(cajero.permisos).not.toContain('store.sales.void');
    expect(bodega.permisos).toContain('store.inventory.loss');

    const datosAlta = {
      cedula: 'nuevo-' + randomUUID(),
      password: 'clave de alta',
      nombres: 'Elena',
      apellidos: 'Mostrador',
      rolId: cajero.id,
    };
    const alta = (token: string, datos: object) =>
      http().post('/accesos/personal').auth(token, bearer).send(datos);
    await alta(sesionAdmin.accessToken, datosAlta).expect(403);
    expect(
      await prisma.usuario.count({ where: { cedula: datosAlta.cedula } }),
    ).toBe(0);
    await alta(ownerToken, { ...datosAlta, tenantId: tienda.id }).expect(400);
    const creada = await alta(ownerToken, datosAlta).expect(201);
    const miembro = (creada.body as { membresiaId: number }).membresiaId;
    expect(creada.body).toMatchObject({
      estado: 'ACTIVO',
      rolEfectivo: { codigo: 'CAJERO' },
    });
    await alta(ownerToken, datosAlta).expect(409);
    const perfil = { horario: 'Lunes 08:00–16:00', sueldo: '500.25' };
    const editarPerfil = (id: number) =>
      http()
        .patch('/accesos/personal/' + id + '/perfil')
        .auth(ownerToken, bearer)
        .send(perfil);
    await editarPerfil(owner.id).expect(403);
    await editarPerfil(miembro).expect(200, { membresiaId: miembro, perfil });
    const selector = await http()
      .get('/accesos/personal')
      .query({
        q: 'mostrador elena',
        estado: 'ACTIVO',
        rolCodigo: 'CAJERO',
        pagina: 1,
        limite: 1,
      })
      .auth(ownerToken, bearer)
      .expect(200);
    expect(selector.body).toMatchObject({
      data: [{ membresiaId: miembro }],
      meta: { total: 1, limite: 1 },
    });
    expect((selector.body as { data: object[] }).data[0]).not.toHaveProperty(
      'perfil',
    );
    const resumen = await app
      .get(AccesosService)
      .resumenPersonal(sesionOwner.context);
    expect(resumen).toMatchObject({ total: 3, sinRol: 0 });
    expect(resumen.roles.map(({ codigo }) => codigo)).toEqual([
      'ADMIN',
      'CAJERO',
      'OWNER',
    ]);

    const crearRol = (codigo: string, permisos: string[]) =>
      http()
        .post('/accesos/roles')
        .auth(ownerToken, bearer)
        .send({ codigo, nombre: codigo, permisos });
    await crearRol('ESCALADO', ['store.sales.void']).expect(403);
    await crearRol('AJENO', ['gym.staff.read']).expect(400);
    const nuevo = await crearRol('MOSTRADOR', ['store.sales.create']).expect(
      201,
    );
    const rolId = (nuevo.body as { id: number }).id;
    const asignar = (id: number, rolId: number) =>
      http()
        .put('/accesos/personal/' + id + '/rol')
        .auth(ownerToken, bearer)
        .send({ rolId });
    await asignar(owner.id, rolId).expect(403);
    await asignar(miembro, rolId).expect(200);
    const detalle = await http()
      .get('/accesos/personal/' + miembro)
      .auth(ownerToken, bearer)
      .expect(200);
    expect(detalle.body).toMatchObject({
      perfil,
      rolEfectivo: { codigo: 'MOSTRADOR' },
    });
    const nuevaSesion = await loginTienda(datosAlta);
    const urlVenta = '/ensayo-accesos/ventas/' + tienda.id;
    await http()
      .get(urlVenta)
      .auth(nuevaSesion.accessToken, bearer)
      .expect(200);
    await http()
      .patch('/accesos/roles/' + rolId)
      .auth(ownerToken, bearer)
      .send({ permisos: [] })
      .expect(200);
    await http()
      .get(urlVenta)
      .auth(nuevaSesion.accessToken, bearer)
      .expect(401);
    const revocada = await loginTienda(datosAlta);
    await http().get(urlVenta).auth(revocada.accessToken, bearer).expect(403);

    const auditar = jest
      .spyOn(app.get(AuditoriaEscrituraService), 'registrar')
      .mockImplementationOnce(() => {
        throw new Error('Fallo del escritor de ensayo');
      });
    const cambiarEstado = (id: number, estado: string) =>
      http()
        .patch('/accesos/personal/' + id + '/estado')
        .auth(ownerToken, bearer)
        .send({ estado, motivo: 'Cambio operativo' });
    try {
      await cambiarEstado(miembro, 'INACTIVO').expect(500);
    } finally {
      auditar.mockRestore();
    }
    const vigente = await prisma.userTenant.findUniqueOrThrow({
      where: { id: miembro },
    });
    expect(vigente).toMatchObject({
      estado: 'ACTIVO',
      versionAutorizacion: revocada.context.versionAutorizacion,
    });

    const existente = await registrarPersonal('clave ya existente');
    const email = randomUUID() + '@example.test';
    await prisma.usuario.update({
      where: { id: existente.usuario.id },
      data: { email },
    });
    const otroNegocio = await crearNegocio();
    const miembroAjeno = await vincularPersonal(
      existente.usuario.id,
      otroNegocio.id,
    );
    const otraSesion = await loginTienda(existente.credenciales);
    await editarPerfil(miembroAjeno.id).expect(404);
    const vincular = (token: string, correo: string) => {
      const datos = {
        cedula: existente.credenciales.cedula,
        email: correo,
        rolId: bodega.id,
      };
      return http()
        .post('/accesos/personal/vincular')
        .auth(token, bearer)
        .send(datos);
    };
    await vincular(sesionAdmin.accessToken, email).expect(403);
    await vincular(ownerToken, 'otro@example.test').expect(404);
    const vinculada = await vincular(ownerToken, email).expect(201);
    await vincular(ownerToken, email).expect(409);
    const idVinculada = (vinculada.body as { membresiaId: number }).membresiaId;
    const sesionVinculada = await loginTienda(
      existente.credenciales,
      tienda.id,
    );
    await cambiarEstado(idVinculada, 'INACTIVO').expect(200);
    await http()
      .get('/auth/session')
      .auth(sesionVinculada.accessToken, bearer)
      .expect(401);
    await http()
      .get('/auth/session')
      .auth(otraSesion.accessToken, bearer)
      .expect(200);
    expect(
      await prisma.asignacionRol.count({
        where: { tenantId: tienda.id, membresiaId: idVinculada },
      }),
    ).toBe(1);
    await cambiarEstado(idVinculada, 'ACTIVO').expect(200);
    await loginTienda(existente.credenciales, tienda.id);

    const auditoria = await prisma.auditoriaOperacion.findMany({
      where: {
        tenantId: tienda.id,
        accion: { in: ['ACCESOS_PERMISOS_ACTIVAR', 'ACCESOS_PERSONAL_PERFIL'] },
      },
      orderBy: { id: 'asc' },
    });
    expect(auditoria).toMatchObject([
      {
        accion: 'ACCESOS_PERMISOS_ACTIVAR',
        usuarioId: propietario.id,
        membresiaId: owner.id,
        rolCodigo: 'OWNER',
      },
      {
        accion: 'ACCESOS_PERSONAL_PERFIL',
        datos: { campos: ['horario', 'sueldo'] },
      },
    ]);
    expect(JSON.stringify(auditoria)).not.toContain(perfil.sueldo);
    expect(
      await prisma.auditoriaOperacion.count({
        where: {
          tenantId: tienda.id,
          accion: 'ACCESOS_PERSONAL_ESTADO',
          entidadId: miembro,
        },
      }),
    ).toBe(0);
  }, 25000);

  it('localiza una venta por ambos productos y revierte venta, existencias y auditoría juntas', async () => {
    const { usuario, credenciales } = await registrarPersonal();
    const { id: tenantId } = await crearNegocio({
      autorizacionVersion: 'PERMISOS',
    });
    const membresia = await vincularPersonal(usuario.id, tenantId);
    const rol = await asignarRol(tenantId, membresia.id);
    const { context: contexto } = await loginTienda(credenciales);
    const auditoria = app.get(AuditoriaEscrituraService);
    const inventario = app.get(InventarioLotesService);
    const cero = new Prisma.Decimal(0);
    const items = await prisma.$transaction(async (tx) => {
      const items: { productoId: number; loteId: number; nombre: string }[] =
        [];
      for (const nombre of ['Producto uno', 'Producto dos']) {
        const producto = await tx.producto.create({
          data: { tenantId, nombre, precio: cero, stock: 2, estado: true },
        });
        const { lotes } = await inventario.registrarEntrada(
          tx,
          {
            tenantId,
            responsableId: membresia.id,
            clave: randomUUID(),
            correlacionId: randomUUID(),
          },
          producto.id,
          'APERTURA',
          'Inventario de ensayo',
          [{ codigo: 'LOTE', cantidad: 2, costoUnitario: cero }],
        );
        items.push({ productoId: producto.id, loteId: lotes[0].id, nombre });
      }
      return items;
    });
    const productoIds = items.map(({ productoId }) => productoId);
    const registrarVenta = async (
      tx: Prisma.TransactionClient,
      actor: ContextoTienda,
      correlacionId: string,
    ) => {
      // Los importes de ensayo son cero para ejercitar la auditoría sin crear un cobro.
      const venta = await tx.venta.create({
        data: {
          tenantId,
          responsableId: actor.membresiaId,
          origen: 'CAJA',
          subtotal: cero,
          total: cero,
          claveIdempotencia: correlacionId,
        },
      });
      for (const { productoId, loteId, nombre } of items) {
        const detalle = await tx.detalleVenta.create({
          data: {
            tenantId,
            ventaId: venta.id,
            productoId,
            nombreProducto: nombre,
            cantidad: 1,
            precioUnitario: cero,
            subtotal: cero,
            total: cero,
          },
        });
        await tx.asignacionLoteVenta.create({
          data: {
            tenantId,
            ventaId: venta.id,
            detalleVentaId: detalle.id,
            loteId,
            productoId,
            cantidad: 1,
            costoUnitario: cero,
            costoTotal: cero,
          },
        });
        await inventario.retirarVenta(
          tx,
          {
            tenantId,
            responsableId: actor.membresiaId,
            clave: correlacionId,
            correlacionId,
          },
          detalle.id,
        );
      }
      await auditoria.registrar(tx, actor, {
        accion: ACCIONES_AUDITORIA.VENTAS_REGISTRAR,
        entidadTipo: 'Venta',
        entidadId: venta.id,
        productoIds,
        correlacionId,
        motivo: 'Venta de ensayo',
      });
      return venta;
    };

    const correlacionId = randomUUID();
    const venta = await prisma.$transaction((tx) =>
      registrarVenta(tx, contexto, correlacionId),
    );
    await prisma.rolNegocio.update({
      where: { id: rol.id },
      data: { nombre: 'Bodega sucursal' },
    });
    const { context: actualizado } = await loginTienda(credenciales);
    expect(actualizado.rolEfectivo.nombre).toBe('Bodega sucursal');
    for (const productoId of productoIds) {
      const fila = await prisma.auditoriaOperacion.findFirstOrThrow({
        where: { tenantId, productoId },
      });
      expect(fila).toMatchObject({
        correlacionId,
        usuarioId: usuario.id,
        membresiaId: membresia.id,
        rolCodigo: rol.codigo,
        rolNombre: rol.nombre,
        entidadId: venta.id,
        motivo: 'Venta de ensayo',
      });
      const grupo = await prisma.auditoriaOperacion.findMany({
        where: { tenantId, correlacionId: fila.correlacionId },
        orderBy: { productoId: 'asc' },
      });
      expect(grupo.map(({ productoId }) => productoId)).toEqual(productoIds);
    }

    const revertida = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        await registrarVenta(tx, actualizado, revertida);
        expect(
          await tx.auditoriaOperacion.count({
            where: { tenantId, correlacionId: revertida },
          }),
        ).toBe(2);
        throw new Error('Abortar la venta después de auditar');
      }),
    ).rejects.toThrow('Abortar la venta después de auditar');
    expect(
      await prisma.venta.count({
        where: { tenantId, claveIdempotencia: revertida },
      }),
    ).toBe(0);
    expect(
      await prisma.auditoriaOperacion.count({
        where: { tenantId, correlacionId: revertida },
      }),
    ).toBe(0);
    expect(
      await prisma.movimientoInventario.count({
        where: { tenantId, correlacionId: revertida },
      }),
    ).toBe(0);
    expect(
      await prisma.producto.count({
        where: { tenantId, id: { in: productoIds }, stock: 1 },
      }),
    ).toBe(2);
    const loteIds = items.map(({ loteId }) => loteId);
    expect(
      await prisma.loteInventario.count({
        where: { tenantId, id: { in: loteIds }, cantidadFisica: 1 },
      }),
    ).toBe(2);
  });

  it('rechaza una membresía auditada con un usuario o un tenant ajeno', async () => {
    const { usuario, credenciales } = await registrarPersonal();
    const tienda = await crearNegocio();
    const otraTienda = await crearNegocio();
    const otraPersona = await registrarPersonal();
    const membresia = await vincularPersonal(usuario.id, tienda.id);
    const { context: contexto } = await loginTienda(credenciales);
    const auditoria = app.get(AuditoriaEscrituraService);
    const correlacionId = randomUUID();
    for (const actor of [
      { ...contexto, usuarioId: otraPersona.usuario.id },
      { ...contexto, tenantId: otraTienda.id },
    ]) {
      await expect(
        prisma.$transaction((tx) =>
          auditoria.registrar(tx, actor, {
            accion: ACCIONES_AUDITORIA.ACCESOS_PERSONAL_ESTADO,
            entidadTipo: 'UserTenant',
            entidadId: membresia.id,
            correlacionId,
          }),
        ),
      ).rejects.toMatchObject({ code: 'P2003' });
    }
    expect(
      await prisma.auditoriaOperacion.count({ where: { correlacionId } }),
    ).toBe(0);
  });
});
