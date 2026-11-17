import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  InventarioLotesService,
  InventarioService,
  ReservasInventarioService,
} from '@app/inventario';
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
import readExcelFile from 'read-excel-file/node';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule as GymAppModule } from '../apps/gym-api/src/app.module';
import {
  AccesosModule,
  AccesosService,
  RequierePermisoTienda,
} from '../apps/tienda-api/src/accesos/accesos.module';
import { AppModule } from '../apps/tienda-api/src/app.module';
import { CatalogoService } from '../apps/tienda-api/src/catalogo/catalogo.service';
import {
  ACCIONES_AUDITORIA,
  AuditoriaEscrituraService,
} from '../apps/tienda-api/src/auditoria/auditoria-escritura';
import { AuditoriaService } from '../apps/tienda-api/src/auditoria/auditoria.service';
import {
  ContextoTiendaActual,
  type ContextoTienda,
} from '../apps/tienda-api/src/auth';
import type {
  AccesoTienda,
  SeleccionTienda,
} from '../apps/tienda-api/src/auth/auth.types';
import { CuentasService } from '../apps/tienda-api/src/cartera/cuentas.service';
import { fechaComercial } from '../apps/tienda-api/src/comun/fecha-comercial';
import { InventarioService as InventarioTiendaService } from '../apps/tienda-api/src/inventario/inventario.service';
import { AnulacionComprobanteService } from '../apps/tienda-api/src/comprobantes/anulacion-comprobante.service';
import { NotificacionesService } from '../apps/tienda-api/src/notificaciones/notificaciones.service';
import { reservarPedidoEnsayo } from './fixtures/tienda';

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

  const rutaCategorias = '/catalogo/categorias';
  const rutaProductos = '/catalogo/productos';
  const rutaMostrador = rutaProductos + '/mostrador';
  const rutaBarras = rutaMostrador + '/por-barras';
  const rutaCategoriaProducto = (productoId: number) =>
    '/catalogo/productos/' + productoId + '/categoria';

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
    const cajero = await crearPerfilComercial(
      tienda.id,
      'CAJERO',
      [
        'store.sales.create',
        'store.payments.create',
        'store.receivables.collect',
      ],
      'CAJERO',
    );
    const bodeguero = await crearPerfilComercial(
      tienda.id,
      'BODEGUERO',
      ['store.inventory.read', 'store.inventory.receive'],
      'EMPLEADO',
    );
    const administrador = await crearPerfilComercial(
      tienda.id,
      'ADMIN',
      ['store.sales.void'],
      'ADMIN',
    );
    const owner = await crearPerfilComercial(tienda.id, 'OWNER', [], 'OWNER');
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

  async function crearPerfilComercial(
    tenantId: number,
    codigo: string,
    permisos: readonly CodigoPermisoTienda[],
    base: 'OWNER' | 'ADMIN' | 'CAJERO' | 'EMPLEADO',
  ) {
    const { usuario, credenciales } = await registrarPersonal();
    const catalogo = await prisma.$transaction((tx) =>
      app.get(PermisosService).registrarCatalogo(tx),
    );
    const membresia = await prisma.userTenant.create({
      data: { tenantId, usuarioId: usuario.id, role: base },
    });
    const protegido = codigo === 'OWNER' || codigo === 'ADMIN';
    const rol = await prisma.rolNegocio.create({
      data: {
        tenantId,
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
      data: { tenantId, membresiaId: membresia.id, rolId: rol.id },
    });
    return { rol, credenciales, ...(await loginTienda(credenciales)) };
  }

  it('habilita clientes con permisos efectivos, aislamiento de negocio y auditoría real', async () => {
    const tienda = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const otra = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const owner = await crearPerfilComercial(tienda.id, 'OWNER', [], 'OWNER');
    const cajero = await crearPerfilComercial(
      tienda.id,
      'CAJERO',
      ['store.customers.read'],
      'CAJERO',
    );
    const bodeguero = await crearPerfilComercial(
      tienda.id,
      'BODEGUERO',
      ['store.inventory.read'],
      'EMPLEADO',
    );
    const externo = await crearPerfilComercial(otra.id, 'OWNER', [], 'OWNER');
    const ficha = {
      nombres: 'Ana de Mostrador',
      tipoIdentificacion: 'cedula',
      identificacion: '00123456',
    };
    await http().get('/clientes').expect(401);
    await http()
      .get('/clientes')
      .auth(bodeguero.accessToken, { type: 'bearer' })
      .expect(403);
    await http()
      .post('/clientes')
      .auth(cajero.accessToken, { type: 'bearer' })
      .send(ficha)
      .expect(403);
    await http()
      .post('/clientes')
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ ...ficha, tenantId: otra.id })
      .expect(400);
    const creada = await http()
      .post('/clientes')
      .auth(owner.accessToken, { type: 'bearer' })
      .send(ficha)
      .expect(201);
    const { id } = creada.body as { id: number };
    const ruta = `/clientes/${id}`;
    expect(creada.body).toMatchObject({
      tenantId: tienda.id,
      identificacion: '00123456',
      tipoIdentificacion: 'CEDULA',
    });
    await http()
      .post('/clientes')
      .auth(owner.accessToken, { type: 'bearer' })
      .send(ficha)
      .expect(409);
    await http()
      .get(ruta)
      .auth(externo.accessToken, { type: 'bearer' })
      .expect(404);
    await http()
      .patch(ruta)
      .auth(externo.accessToken, { type: 'bearer' })
      .send({ nombres: 'Alterado' })
      .expect(404);
    await http()
      .get('/clientes?tenantId=' + otra.id)
      .auth(cajero.accessToken, { type: 'bearer' })
      .expect(400);
    await http()
      .get(ruta)
      .auth(cajero.accessToken, { type: 'bearer' })
      .expect(200);
    const lista = await http()
      .get('/clientes?q=ANA&activo=true&pagina=1&limite=1')
      .auth(cajero.accessToken, { type: 'bearer' })
      .expect(200);
    expect(lista.body).toMatchObject([{ id }]);
    await http()
      .patch(ruta)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ nombres: null })
      .expect(400);
    const editada = await http()
      .patch(ruta)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({
        apellidos: 'Ensayo',
        tipoIdentificacion: null,
        identificacion: null,
      })
      .expect(200);
    expect(editada.body).toMatchObject({
      id,
      apellidos: 'Ensayo',
      tipoIdentificacion: null,
      identificacion: null,
    });
    const desactivada = await http()
      .delete(ruta)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    expect(desactivada.body).toMatchObject({ id, activo: false });
    await http()
      .delete(ruta)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    await http()
      .get('/clientes?activo=true')
      .auth(cajero.accessToken, { type: 'bearer' })
      .expect(200, []);

    const eventos = await prisma.auditoriaOperacion.findMany({
      where: {
        tenantId: tienda.id,
        entidadTipo: 'ClienteComercial',
        entidadId: id,
      },
      orderBy: { id: 'asc' },
    });
    expect(eventos.map(({ accion }) => accion)).toEqual([
      ACCIONES_AUDITORIA.CLIENTES_REGISTRAR,
      ACCIONES_AUDITORIA.CLIENTES_EDITAR,
      ACCIONES_AUDITORIA.CLIENTES_DESACTIVAR,
    ]);
    for (const evento of eventos) {
      expect(evento).toMatchObject({
        tenantId: tienda.id,
        usuarioId: owner.context.usuarioId,
        membresiaId: owner.context.membresiaId,
        rolCodigo: 'OWNER',
      });
    }
    expect(
      new Set(eventos.map(({ correlacionId }) => correlacionId)).size,
    ).toBe(3);
  });

  it('abre y cierra caja por HTTP con el titular, el supervisor y la auditoría real', async () => {
    const tienda = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const otra = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const owner = await crearPerfilComercial(tienda.id, 'OWNER', [], 'OWNER');
    const cajero = await crearPerfilComercial(
      tienda.id,
      'CAJERO',
      ['store.cash.read', 'store.cash.open', 'store.cash.close'],
      'CAJERO',
    );
    const externo = await crearPerfilComercial(otra.id, 'OWNER', [], 'OWNER');
    const token = (perfil: AccesoTienda) => 'Bearer ' + perfil.accessToken;
    const fichaCaja = { codigo: 'C01', nombre: 'Caja de ensayo' };
    await http().get('/caja').expect(401);
    await http()
      .post('/caja')
      .set('Authorization', token(cajero))
      .send(fichaCaja)
      .expect(403);
    const creada = await http()
      .post('/caja')
      .set('Authorization', token(owner))
      .send(fichaCaja)
      .expect(201);
    const { id: cajaId } = creada.body as { id: number };
    const rutaCaja = `/caja/${cajaId}`;
    await http().get(rutaCaja).set('Authorization', token(externo)).expect(404);
    await http()
      .patch(rutaCaja)
      .set('Authorization', token(owner))
      .send({ nombre: 'Caja central' })
      .expect(200);
    const abrir = (perfil: AccesoTienda, clave: string) =>
      http()
        .post(rutaCaja + '/turnos')
        .set('Authorization', token(perfil))
        .set('Idempotency-Key', clave);
    await abrir(cajero, randomUUID())
      .send({ fondoInicial: '20', cajeroId: owner.context.membresiaId })
      .expect(400);
    await http()
      .post(rutaCaja + '/turnos')
      .set('Authorization', token(cajero))
      .send({ fondoInicial: '20' })
      .expect(400);
    const claveApertura = randomUUID();
    const apertura = await abrir(cajero, claveApertura)
      .send({ fondoInicial: '20' })
      .expect(201);
    const { recursoId: turnoId } = apertura.body as { recursoId: number };
    await abrir(cajero, claveApertura)
      .send({ fondoInicial: '20.00' })
      .expect(201, apertura.body as object);
    await abrir(owner, randomUUID()).send({ fondoInicial: '20' }).expect(409);
    await http()
      .get('/caja?disponibles=true')
      .set('Authorization', token(cajero))
      .expect(200, []);
    const activo = await http()
      .get(rutaCaja + '/turno-activo')
      .set('Authorization', token(cajero))
      .expect(200);
    expect(activo.body).toMatchObject({
      id: turnoId,
      cajeroId: cajero.context.membresiaId,
      estado: 'ABIERTO',
    });
    await http()
      .delete(rutaCaja)
      .set('Authorization', token(owner))
      .expect(409);

    const cajaOwner = await http()
      .post('/caja')
      .set('Authorization', token(owner))
      .send({ codigo: 'C02', nombre: 'Caja supervisor' })
      .expect(201);
    const aperturaOwner = await http()
      .post(`/caja/${(cajaOwner.body as { id: number }).id}/turnos`)
      .set('Authorization', token(owner))
      .set('Idempotency-Key', randomUUID())
      .send({ fondoInicial: '1' })
      .expect(201);
    const otroTurnoId = (aperturaOwner.body as { recursoId: number }).recursoId;
    const rutaMovimientos = `/caja/turnos/${otroTurnoId}/movimientos`;
    await http()
      .get(rutaMovimientos)
      .set('Authorization', token(cajero))
      .expect(403);
    await http()
      .get(rutaMovimientos)
      .set('Authorization', token(externo))
      .expect(404);
    const mover = (perfil: AccesoTienda, clave: string) =>
      http()
        .post(rutaMovimientos)
        .set('Authorization', token(perfil))
        .set('Idempotency-Key', clave)
        .send({
          monto: '2.50',
          direccion: 'ENTRADA',
          motivo: 'Entrada de ensayo',
        });
    await mover(cajero, randomUUID()).expect(403);
    const claveMovimiento = randomUUID();
    const movimiento = await mover(owner, claveMovimiento).expect(201);
    await mover(owner, claveMovimiento).expect(201, movimiento.body as object);

    const cerrar = (
      perfil: AccesoTienda,
      id: number,
      clave: string,
      monto: string,
    ) =>
      http()
        .post(`/caja/turnos/${id}/cierre`)
        .set('Authorization', token(perfil))
        .set('Idempotency-Key', clave)
        .send({ efectivoContado: monto });
    await cerrar(cajero, otroTurnoId, randomUUID(), '3.50').expect(403);
    const claveCierre = randomUUID();
    const cierre = await cerrar(owner, otroTurnoId, claveCierre, '3.00').expect(
      200,
    );
    await cerrar(owner, otroTurnoId, claveCierre, '3.00').expect(
      200,
      cierre.body as object,
    );
    await mover(owner, randomUUID()).expect(409);
    await cerrar(owner, turnoId, randomUUID(), '20').expect(200);
    const turnoCerrado = await http()
      .get(`/caja/turnos/${otroTurnoId}`)
      .set('Authorization', token(owner))
      .expect(200);
    expect(turnoCerrado.body).toMatchObject({
      estado: 'CERRADO',
      efectivoEsperado: '3.5',
      efectivoContado: '3',
      diferencia: '-0.5',
    });
    const eventos = await prisma.auditoriaOperacion.findMany({
      where: {
        tenantId: tienda.id,
        entidadTipo: 'TurnoCaja',
        entidadId: turnoId,
      },
      orderBy: { id: 'asc' },
    });
    expect(eventos).toMatchObject([
      {
        accion: ACCIONES_AUDITORIA.CAJA_ABRIR,
        membresiaId: cajero.context.membresiaId,
        rolCodigo: 'CAJERO',
      },
      {
        accion: ACCIONES_AUDITORIA.CAJA_CERRAR,
        membresiaId: owner.context.membresiaId,
        rolCodigo: 'OWNER',
      },
    ]);
    expect(
      await prisma.auditoriaOperacion.count({
        where: {
          tenantId: tienda.id,
          accion: ACCIONES_AUDITORIA.CAJA_MOVIMIENTO,
          entidadId: (movimiento.body as { recursoId: number }).recursoId,
        },
      }),
    ).toBe(1);
  });

  it('registra y aplica cobros por HTTP con permisos, idempotencia y una sola entrada de efectivo', async () => {
    const tienda = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const otra = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const owner = await crearPerfilComercial(tienda.id, 'OWNER', [], 'OWNER');
    const cajero = await crearPerfilComercial(
      tienda.id,
      'CAJERO',
      [
        'store.cash.open',
        'store.payments.read',
        'store.payments.create',
        'store.receivables.collect',
      ],
      'CAJERO',
    );
    const sinPermisoAbono = await crearPerfilComercial(
      tienda.id,
      'COBROS',
      ['store.payments.create'],
      'EMPLEADO',
    );
    const externo = await crearPerfilComercial(otra.id, 'OWNER', [], 'OWNER');
    const tenantId = tienda.id;
    const creado = await http()
      .post('/caja')
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ codigo: 'REC01', nombre: 'Caja de cobros' })
      .expect(201);
    const cajaId = (creado.body as { id: number }).id;
    const abierto = await http()
      .post(`/caja/${cajaId}/turnos`)
      .auth(cajero.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ fondoInicial: '0' })
      .expect(201);
    const turnoId = (abierto.body as { recursoId: number }).recursoId;

    // El crédito de ensayo se crea con las mismas restricciones de venta, lotes y cartera.
    const inventario = app.get(InventarioLotesService);
    const cuentas = app.get(CuentasService);
    const cuenta = await prisma.$transaction(async (tx) => {
      const total = new Prisma.Decimal(30);
      const costo = new Prisma.Decimal(4);
      const clave = randomUUID();
      const operacion = {
        tenantId,
        responsableId: cajero.context.membresiaId,
        clave,
        correlacionId: clave,
      };
      const cliente = await tx.clienteComercial.create({
        data: { tenantId, nombres: 'Cliente de ensayo' },
      });
      const producto = await tx.producto.create({
        data: {
          tenantId,
          nombre: 'Producto financiado',
          precio: total,
          stock: 1,
          estado: true,
        },
      });
      const { lotes } = await inventario.registrarEntrada(
        tx,
        { ...operacion, clave: randomUUID() },
        producto.id,
        'APERTURA',
        'Inventario de ensayo',
        [{ codigo: 'LOTE', cantidad: 1, costoUnitario: costo }],
      );
      const venta = await tx.venta.create({
        data: {
          tenantId,
          responsableId: operacion.responsableId,
          origen: 'CAJA',
          clienteComercialId: cliente.id,
          subtotal: total,
          total,
          claveIdempotencia: clave,
        },
      });
      const detalle = await tx.detalleVenta.create({
        data: {
          tenantId,
          ventaId: venta.id,
          productoId: producto.id,
          nombreProducto: producto.nombre,
          cantidad: 1,
          precioUnitario: total,
          subtotal: total,
          total,
        },
      });
      await tx.asignacionLoteVenta.create({
        data: {
          tenantId,
          ventaId: venta.id,
          detalleVentaId: detalle.id,
          loteId: lotes[0].id,
          productoId: producto.id,
          cantidad: 1,
          costoUnitario: costo,
          costoTotal: costo,
        },
      });
      await inventario.retirarVenta(tx, operacion, detalle.id);
      return cuentas.crear(tx, {
        tenantId,
        ventaId: venta.id,
        clienteComercialId: cliente.id,
        financiado: total,
        vencimiento: new Date('2099-01-01T05:00:00.000Z'),
      });
    });

    const pago = {
      ventaId: cuenta.ventaId,
      cuentaId: cuenta.id,
      metodo: 'EFECTIVO',
      turnoId,
      monto: '12.50',
    };
    const registrar = (
      sesion: AccesoTienda,
      clave: string,
      datos: object = pago,
    ) =>
      http()
        .post('/cobros')
        .auth(sesion.accessToken, { type: 'bearer' })
        .set('Idempotency-Key', clave)
        .send(datos);
    await http().get('/cobros').expect(401);
    await http()
      .get('/cobros')
      .auth(sinPermisoAbono.accessToken, { type: 'bearer' })
      .expect(403);
    await registrar(sinPermisoAbono, randomUUID()).expect(403);
    await registrar(externo, randomUUID()).expect(404);
    await registrar(cajero, randomUUID(), {
      ...pago,
      clienteComercialId: 999,
    }).expect(400);
    const pagoSinTurno = { ...pago, turnoId: undefined };
    await registrar(cajero, randomUUID(), pagoSinTurno).expect(400);
    const clave = randomUUID();
    const recibido = await registrar(cajero, clave).expect(201);
    await registrar(cajero, clave, { ...pago, monto: '12.5' }).expect(
      201,
      recibido.body as object,
    );
    await registrar(cajero, randomUUID(), { ...pago, monto: '20' }).expect(409);
    await registrar(cajero, randomUUID(), {
      ...pagoSinTurno,
      metodo: 'TRANSFERENCIA',
      monto: '17.50',
    }).expect(201);
    const id = (recibido.body as { recursoId: number }).recursoId;
    await http()
      .get(`/cobros/${id}`)
      .auth(externo.accessToken, { type: 'bearer' })
      .expect(404);
    const detalle = await http()
      .get(`/cobros/${id}`)
      .auth(cajero.accessToken, { type: 'bearer' })
      .expect(200);
    expect(detalle.body).toMatchObject({
      monto: '12.5',
      montoDisponible: '0',
      aplicacionCobro_cobro: [{ cuentaId: cuenta.id, monto: '12.5' }],
    });
    expect(detalle.body).not.toHaveProperty('claveIdempotencia');
    const listado = await http()
      .get('/cobros?clienteComercialId=' + cuenta.clienteComercialId)
      .auth(cajero.accessToken, { type: 'bearer' })
      .expect(200);
    expect(listado.body).toHaveLength(2);
    expect(
      await prisma.cuentaPorCobrar.findUnique({ where: { id: cuenta.id } }),
    ).toMatchObject({
      saldo: new Prisma.Decimal(0),
      estado: 'PAGADA',
    });
    expect(
      await prisma.movimientoCaja.count({ where: { tenantId, turnoId } }),
    ).toBe(1);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    const eventos = await prisma.auditoriaOperacion.findMany({
      where: {
        tenantId,
        accion: {
          in: [
            ACCIONES_AUDITORIA.COBROS_REGISTRAR,
            ACCIONES_AUDITORIA.COBROS_APLICAR,
          ],
        },
      },
      orderBy: { id: 'asc' },
    });
    expect(eventos.map(({ accion }) => accion)).toEqual([
      ACCIONES_AUDITORIA.COBROS_REGISTRAR,
      ACCIONES_AUDITORIA.COBROS_APLICAR,
      ACCIONES_AUDITORIA.COBROS_REGISTRAR,
      ACCIONES_AUDITORIA.COBROS_APLICAR,
    ]);
    expect(eventos[0].correlacionId).toBe(eventos[1].correlacionId);
    expect(eventos[2].correlacionId).toBe(eventos[3].correlacionId);
    expect(eventos[0].correlacionId).not.toBe(eventos[2].correlacionId);
  });

  it('emite un solo comprobante por venta y consulta sus datos históricos', async () => {
    const tienda = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const otra = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const tenantId = tienda.id;
    const owner = await crearPerfilComercial(tenantId, 'OWNER', [], 'OWNER');
    const lector = await crearPerfilComercial(
      tenantId,
      'LECTURA',
      ['store.receipts.read', 'store.sales.read'],
      'EMPLEADO',
    );
    const externo = await crearPerfilComercial(otra.id, 'OWNER', [], 'OWNER');
    const bearer = { type: 'bearer' } as const;
    const cliente = await prisma.clienteComercial.create({
      data: { tenantId, nombres: 'Cliente de ensayo' },
    });
    const categoria = await prisma.categoriaProducto.create({
      data: {
        tenantId,
        nombre: 'Categoría al vender',
        nombreNormalizado: 'categoría al vender',
        modulo: 'STORE',
      },
    });
    const producto = await prisma.producto.create({
      data: {
        tenantId,
        nombre: 'Producto de ensayo',
        precio: 10,
        stock: 1,
        estado: true,
      },
    });
    const inventario = app.get(InventarioLotesService);
    const cuentas = app.get(CuentasService);
    const venta = await prisma.$transaction(async (tx) => {
      const clave = randomUUID();
      const costo = new Prisma.Decimal(4);
      const operacion = {
        tenantId,
        responsableId: owner.context.membresiaId,
        clave,
        correlacionId: clave,
      };
      const { lotes } = await inventario.registrarEntrada(
        tx,
        { ...operacion, clave: randomUUID() },
        producto.id,
        'APERTURA',
        'Inventario de ensayo',
        [{ codigo: 'LOTE', cantidad: 1, costoUnitario: costo }],
      );
      const creada = await tx.venta.create({
        data: {
          tenantId,
          responsableId: operacion.responsableId,
          origen: 'CAJA',
          fecha: new Date('2026-11-02T04:59:59.999Z'),
          clienteComercialId: cliente.id,
          subtotal: 10,
          total: 10,
          claveIdempotencia: clave,
        },
      });
      const detalle = await tx.detalleVenta.create({
        data: {
          tenantId,
          ventaId: creada.id,
          productoId: producto.id,
          nombreProducto: producto.nombre,
          categoriaId: categoria.id,
          categoriaNombre: categoria.nombre,
          cantidad: 1,
          precioUnitario: 10,
          subtotal: 10,
          total: 10,
        },
      });
      await tx.asignacionLoteVenta.create({
        data: {
          tenantId,
          ventaId: creada.id,
          detalleVentaId: detalle.id,
          loteId: lotes[0].id,
          productoId: producto.id,
          cantidad: 1,
          costoUnitario: costo,
          costoTotal: costo,
        },
      });
      await inventario.retirarVenta(tx, operacion, detalle.id);
      await cuentas.crear(tx, {
        tenantId,
        ventaId: creada.id,
        clienteComercialId: cliente.id,
        financiado: new Prisma.Decimal(10),
        vencimiento: new Date('2099-01-01T05:00:00.000Z'),
      });
      return creada;
    });
    const estadoOperativo = () =>
      Promise.all([
        prisma.movimientoInventario.count({ where: { tenantId } }),
        prisma.movimientoCaja.count({ where: { tenantId } }),
        prisma.cuentaPorCobrar.findMany({
          where: { tenantId },
          select: { id: true, saldo: true, estado: true },
        }),
      ]);
    const estadoInicial = await estadoOperativo();

    const emitir = (sesion: AccesoTienda, clave: string) =>
      http()
        .post('/comprobantes')
        .auth(sesion.accessToken, bearer)
        .set('Idempotency-Key', clave)
        .send({ ventaId: venta.id });
    await http().get('/comprobantes').expect(401);
    await emitir(lector, randomUUID()).expect(403);
    await emitir(externo, randomUUID()).expect(404);
    const clave = randomUUID();
    const [primera, segunda] = await Promise.all([
      emitir(owner, clave).expect(201),
      emitir(owner, randomUUID()).expect(201),
    ]);
    expect(segunda.body).toEqual(primera.body);
    await emitir(owner, clave).expect(201, primera.body as object);
    const { recursoId } = primera.body as { recursoId: number };
    const ruta = `/comprobantes/${recursoId}`;

    await prisma.clienteComercial.update({
      where: { id: cliente.id },
      data: { nombres: 'Nombre actualizado' },
    });
    await prisma.producto.update({
      where: { id: producto.id },
      data: { nombre: 'Producto actualizado', precio: 20 },
    });
    await prisma.categoriaProducto.update({
      where: { id: categoria.id },
      data: {
        nombre: 'Categoría actualizada',
        nombreNormalizado: 'categoría actualizada',
      },
    });
    const filtros = {
      desde: '2026-11-01',
      hasta: '2026-11-09',
      productoId: producto.id,
      categoriaId: categoria.id,
      cajeroId: owner.context.membresiaId,
    };
    await http().get('/ventas').query(filtros).expect(401);
    const ventas = await http()
      .get('/ventas')
      .query({ ...filtros, estado: 'COMPLETADA' })
      .auth(lector.accessToken, bearer)
      .expect(200);
    expect(ventas.body).toEqual([
      expect.objectContaining({ id: venta.id, total: '10' }),
    ]);
    const ventaDetalle = await http()
      .get(`/ventas/${venta.id}`)
      .auth(lector.accessToken, bearer)
      .expect(200);
    expect(ventaDetalle.body).toMatchObject({
      detalleVenta_venta: [
        {
          nombreProducto: producto.nombre,
          categoriaNombre: categoria.nombre,
          precioUnitario: '10',
          asignacionLoteVenta_detalleVenta: [{ cantidad: 1 }],
        },
      ],
    });
    expect(ventaDetalle.body).not.toHaveProperty('claveIdempotencia');
    await http()
      .get(`/ventas/${venta.id}`)
      .auth(externo.accessToken, bearer)
      .expect(404);
    await http()
      .get('/ventas/analisis')
      .query(filtros)
      .auth(lector.accessToken, bearer)
      .expect(403);
    const analisis = await http()
      .get('/ventas/analisis')
      .query(filtros)
      .auth(owner.accessToken, bearer)
      .expect(200);
    expect(analisis.body).toEqual({
      series: [
        { periodo: '2026-10-26', neto: '10', ventas: 1 },
        { periodo: '2026-11-02', neto: '0', ventas: 0 },
      ],
      productos: [{ productoId: producto.id, neto: '10', unidades: 1 }],
      cajeros: [
        { responsableId: owner.context.membresiaId, neto: '10', ventas: 1 },
      ],
      neto: '10',
      ventas: 1,
      ticketPromedio: '10',
    });
    const vacio = await http()
      .get('/ventas/analisis')
      .query({ ...filtros, granularidad: 'mes' })
      .auth(externo.accessToken, bearer)
      .expect(200);
    expect(vacio.body).toMatchObject({
      ventas: 0,
      ticketPromedio: '0',
      series: [{ periodo: '2026-11-01', neto: '0', ventas: 0 }],
    });
    await http()
      .get('/ventas')
      .query({ ...filtros, desde: '2026-02-30' })
      .auth(owner.accessToken, bearer)
      .expect(400);
    const detalle = await http()
      .get(ruta)
      .auth(lector.accessToken, bearer)
      .expect(200);
    expect(detalle.body).toMatchObject({
      numero: 'COMP-1',
      consecutivo: '1',
      receptorNombre: cliente.nombres,
      total: '10',
      detalleComprobanteVenta_comprobante: [
        { nombreProducto: producto.nombre, precioUnitario: '10', cantidad: 1 },
      ],
    });
    const lista = await http()
      .get('/comprobantes?pagina=1&limite=1')
      .auth(lector.accessToken, bearer)
      .expect(200);
    expect(lista.body).toEqual([expect.objectContaining({ id: recursoId })]);
    await http().get(ruta).auth(externo.accessToken, bearer).expect(404);
    await http()
      .get(ruta + '/pdf')
      .auth(externo.accessToken, bearer)
      .expect(404);
    const pdf = await http()
      .get(ruta + '/pdf')
      .auth(lector.accessToken, bearer)
      .buffer(true)
      .parse((respuesta, terminar) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => terminar(null, Buffer.concat(partes)));
        respuesta.on('error', terminar);
      })
      .expect('Content-Type', /application\/pdf/)
      .expect('Content-Disposition', /attachment/)
      .expect(200);
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(await estadoOperativo()).toEqual(estadoInicial);
    expect(await prisma.comprobanteVenta.count({ where: { tenantId } })).toBe(
      1,
    );
    expect(
      await prisma.auditoriaOperacion.count({
        where: { tenantId, accion: ACCIONES_AUDITORIA.COMPROBANTES_EMITIR },
      }),
    ).toBe(1);
  });

  it('registra gastos por HTTP y descuenta efectivo de caja una sola vez', async () => {
    const tienda = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const otra = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const owner = await crearPerfilComercial(tienda.id, 'OWNER', [], 'OWNER');
    const lector = await crearPerfilComercial(
      tienda.id,
      'LECTURA',
      ['store.expenses.read'],
      'EMPLEADO',
    );
    const externo = await crearPerfilComercial(otra.id, 'OWNER', [], 'OWNER');
    const bearer = { type: 'bearer' } as const;
    const caja = await http()
      .post('/caja')
      .auth(owner.accessToken, bearer)
      .send({ codigo: 'G01', nombre: 'Caja de gastos' })
      .expect(201);
    const apertura = await http()
      .post(`/caja/${(caja.body as { id: number }).id}/turnos`)
      .auth(owner.accessToken, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({ fondoInicial: '20' })
      .expect(201);
    const turnoId = (apertura.body as { recursoId: number }).recursoId;
    const ruta = '/finanzas/gastos';
    const gasto = {
      concepto: 'Compra de insumos',
      categoria: 'Limpieza',
      monto: '3.50',
      metodo: 'EFECTIVO',
      turnoId,
      fecha: '2026-05-01T09:00:00-05:00',
    };
    const registrar = (token: string, clave: string, datos: object = gasto) =>
      http()
        .post(ruta)
        .auth(token, bearer)
        .set('Idempotency-Key', clave)
        .send(datos);
    await http().get(ruta).expect(401);
    await registrar(lector.accessToken, randomUUID()).expect(403);
    await registrar(externo.accessToken, randomUUID()).expect(404);
    await registrar(owner.accessToken, randomUUID(), {
      ...gasto,
      tenantId: otra.id,
    }).expect(400);
    await registrar(owner.accessToken, randomUUID(), {
      ...gasto,
      turnoId: undefined,
    }).expect(400);
    await registrar(owner.accessToken, randomUUID(), {
      ...gasto,
      monto: '0',
    }).expect(400);
    await registrar(owner.accessToken, randomUUID(), {
      ...gasto,
      monto: '21',
    }).expect(409);
    const clave = randomUUID();
    const registrado = await registrar(owner.accessToken, clave).expect(201);
    await registrar(owner.accessToken, clave, {
      ...gasto,
      monto: '3.5',
    }).expect(201, registrado.body as object);
    await registrar(owner.accessToken, randomUUID(), {
      ...gasto,
      metodo: 'TRANSFERENCIA',
      turnoId: undefined,
      monto: '4',
      fecha: '2026-04-30T23:30:00-05:00',
    }).expect(201);
    await http().get(ruta).auth(externo.accessToken, bearer).expect(200, []);
    const consulta = await http()
      .get(ruta)
      .auth(lector.accessToken, bearer)
      .query({
        desde: '2026-05-01T00:00:00-05:00',
        hasta: '2026-05-02T00:00:00-05:00',
        limite: 1,
      })
      .expect(200);
    const id = (registrado.body as { recursoId: number }).recursoId;
    expect(consulta.body).toMatchObject([{ id, monto: '3.5', turnoId }]);
    const consultarFinanzas = (
      token: string,
      desde: string,
      hasta: string,
    ): request.Test =>
      http()
        .get('/finanzas/resumen')
        .auth(token, bearer)
        .query({ desde, hasta });
    await consultarFinanzas(
      lector.accessToken,
      '2026-04-01',
      '2026-05-01',
    ).expect(403);
    const abril = await consultarFinanzas(
      owner.accessToken,
      '2026-04-01',
      '2026-05-01',
    ).expect(200);
    expect(abril.body).toMatchObject({
      gastosComerciales: '4',
      resultadoOperativoEstimado: '-4',
    });
    const mayo = await consultarFinanzas(
      owner.accessToken,
      '2026-05-01',
      '2026-06-01',
    ).expect(200);
    expect(mayo.body).toMatchObject({
      gastosComerciales: '3.5',
      resultadoOperativoEstimado: '-3.5',
    });
    const otroNegocio = await consultarFinanzas(
      externo.accessToken,
      '2026-04-01',
      '2026-06-01',
    ).expect(200);
    expect(otroNegocio.body).toMatchObject({
      gastosComerciales: '0',
      resultadoOperativoEstimado: '0',
    });
    await consultarFinanzas(
      owner.accessToken,
      '2026-05-01',
      '2026-05-01',
    ).expect(400);
    await http()
      .get(ruta)
      .auth(lector.accessToken, bearer)
      .query({ desde: '2026-05-02T00:00:00Z', hasta: '2026-05-01T00:00:00Z' })
      .expect(400);
    expect(
      await prisma.gastoComercial.count({ where: { tenantId: tienda.id } }),
    ).toBe(2);
    const movimientos = await prisma.movimientoCaja.findMany({
      where: { tenantId: tienda.id, turnoId },
    });
    expect(movimientos).toMatchObject([
      { tipo: 'SALIDA', gastoId: id, monto: new Prisma.Decimal('3.50') },
    ]);
    const eventos = await prisma.auditoriaOperacion.findMany({
      where: {
        tenantId: tienda.id,
        accion: ACCIONES_AUDITORIA.GASTOS_REGISTRAR,
      },
    });
    expect(eventos).toHaveLength(2);
    expect(eventos.find(({ entidadId }) => entidadId === id)).toMatchObject({
      entidadTipo: 'GastoComercial',
      rolCodigo: 'OWNER',
      membresiaId: owner.context.membresiaId,
    });
    await http()
      .post(`/caja/turnos/${turnoId}/cierre`)
      .auth(owner.accessToken, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({ efectivoContado: '16.50' })
      .expect(200);
    await registrar(owner.accessToken, randomUUID()).expect(409);
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

  it('administra categorías STORE y conserva los vínculos de GYM en un negocio mixto', async () => {
    const tienda = await crearNegocio({
      tipoNegocio: 'MIXTO',
      autorizacionVersion: 'PERMISOS',
      modules: { create: [{ module: 'GYM' }, { module: 'STORE' }] },
    });
    const { usuario, credenciales } = await registrarPersonal();
    const owner = await prisma.userTenant.create({
      data: { tenantId: tienda.id, usuarioId: usuario.id, role: 'OWNER' },
    });
    const rolOwner = await prisma.rolNegocio.create({
      data: {
        tenantId: tienda.id,
        codigo: 'OWNER',
        nombre: 'Dueño',
        protegido: true,
        equivalenciaLegacy: 'OWNER',
      },
    });
    await prisma.asignacionRol.create({
      data: { tenantId: tienda.id, membresiaId: owner.id, rolId: rolOwner.id },
    });
    const bearer = { type: 'bearer' } as const;
    const { accessToken } = await loginTienda(credenciales);

    const lector = await registrarPersonal();
    const membresiaLector = await vincularPersonal(
      lector.usuario.id,
      tienda.id,
    );
    const rolLector = await asignarRol(tienda.id, membresiaLector.id);
    const { accessToken: tokenLector } = await loginTienda(lector.credenciales);
    await http().get(rutaCategorias).expect(401);
    await http().get(rutaCategorias).auth(tokenLector, bearer).expect(403);
    const permisos = await prisma.$transaction((tx) =>
      app.get(PermisosService).registrarCatalogo(tx),
    );
    const permisoLectura = permisos.find(
      ({ codigo }) => codigo === 'store.catalog.read',
    )!;
    await prisma.rolPermiso.create({
      data: {
        tenantId: tienda.id,
        rolId: rolLector.id,
        permisoId: permisoLectura.id,
      },
    });
    await http().get(rutaCategorias).auth(tokenLector, bearer).expect(200);
    await http()
      .post(rutaCategorias)
      .auth(tokenLector, bearer)
      .send({ nombre: 'Sin escritura' })
      .expect(403);

    const crear = (nombre: string) =>
      http().post(rutaCategorias).auth(accessToken, bearer).send({ nombre });
    const creada = await crear('  Bebidas   Frías  ').expect(201);
    const categoria = creada.body as {
      id: number;
      nombre: string;
      activo: boolean;
    };
    expect(categoria).toEqual({
      id: categoria.id,
      nombre: 'Bebidas Frías',
      activo: true,
    });
    await crear('bebidas fri\u0301as').expect(409);
    await crear('Bebidas calientes').expect(201);
    const listado = await http()
      .get(rutaCategorias)
      .auth(tokenLector, bearer)
      .query({ q: '  BEBIDAS ', activo: true, pagina: 2, limite: 1 })
      .expect(200);
    expect(listado.body).toEqual({
      data: [categoria],
      meta: { pagina: 2, limite: 1, total: 2, paginas: 2 },
    });
    await http()
      .get(rutaCategorias)
      .auth(tokenLector, bearer)
      .query({ activo: '1' })
      .expect(400);

    const otro = await crearNegocio();
    const gym = await prisma.categoriaProducto.create({
      data: {
        tenantId: tienda.id,
        modulo: 'GYM',
        nombre: categoria.nombre,
        nombreNormalizado: 'bebidas frías',
      },
    });
    const ajena = await prisma.categoriaProducto.create({
      data: {
        tenantId: otro.id,
        modulo: 'STORE',
        nombre: categoria.nombre,
        nombreNormalizado: 'bebidas frías',
      },
    });
    const producto = (tenantId: number, categoriaId?: number) =>
      prisma.producto.create({
        data: {
          tenantId,
          nombre: 'Bebida',
          precio: 1,
          stock: 0,
          estado: true,
          categoriaId,
        },
      });
    const propio = await producto(tienda.id);
    const sinCategoria = await producto(tienda.id);
    const productoGym = await producto(tienda.id, gym.id);
    const ajeno = await producto(otro.id);
    const asignar = (id: number, categoriaId: number | null) =>
      http()
        .put(rutaCategoriaProducto(id))
        .auth(accessToken, bearer)
        .send({ categoriaId });
    const editar = (id: number, cambios: object) =>
      http()
        .patch(rutaCategorias + '/' + id)
        .auth(accessToken, bearer)
        .send(cambios);

    await editar(categoria.id, {}).expect(400);
    await editar(categoria.id, { nombre: null }).expect(400);
    await editar(categoria.id, { tenantId: otro.id }).expect(400);
    await editar(0, { activo: false }).expect(400);
    await http()
      .put(rutaCategoriaProducto(propio.id))
      .auth(accessToken, bearer)
      .send({})
      .expect(400);
    await editar(gym.id, { nombre: 'Prohibido' }).expect(404);
    await editar(ajena.id, { nombre: 'Prohibido' }).expect(404);
    await asignar(propio.id, gym.id).expect(404);
    await asignar(propio.id, ajena.id).expect(404);
    await asignar(ajeno.id, categoria.id).expect(404);
    await asignar(productoGym.id, null).expect(409);
    await asignar(productoGym.id, categoria.id).expect(409);
    expect(
      await prisma.producto.findUniqueOrThrow({
        where: { id: productoGym.id },
      }),
    ).toMatchObject({ categoriaId: gym.id });

    await asignar(propio.id, categoria.id).expect(200, {
      productoId: propio.id,
      categoriaId: categoria.id,
    });
    await asignar(propio.id, categoria.id).expect(200);
    await editar(categoria.id, { activo: false }).expect(200, {
      ...categoria,
      activo: false,
    });
    await editar(categoria.id, {
      activo: false,
      nombre: '  Bebidas  Frías  ',
    }).expect(200);
    await crear('bebidas frías').expect(409);
    await asignar(sinCategoria.id, categoria.id).expect(404);
    const inactivas = await http()
      .get(rutaCategorias)
      .query({ activo: false })
      .auth(accessToken, bearer)
      .expect(200);
    expect(inactivas.body).toMatchObject({
      data: [{ ...categoria, activo: false }],
    });
    expect(
      await prisma.producto.findUniqueOrThrow({ where: { id: propio.id } }),
    ).toMatchObject({ categoriaId: categoria.id });
    await editar(categoria.id, { activo: true }).expect(200, categoria);
    await asignar(propio.id, null).expect(200, {
      productoId: propio.id,
      categoriaId: null,
    });

    const auditoria = jest
      .spyOn(app.get(AuditoriaEscrituraService), 'registrar')
      .mockImplementationOnce(() => {
        throw new Error('Fallo de auditoría en categoría');
      });
    try {
      await editar(categoria.id, {
        nombre: 'Cambio que debe revertirse',
      }).expect(500);
    } finally {
      auditoria.mockRestore();
    }
    expect(
      await prisma.categoriaProducto.findUniqueOrThrow({
        where: { id: categoria.id },
      }),
    ).toMatchObject(categoria);
    const eventos = await prisma.auditoriaOperacion.findMany({
      where: {
        tenantId: tienda.id,
        entidadTipo: 'CategoriaProducto',
        entidadId: categoria.id,
      },
      orderBy: { id: 'asc' },
    });
    expect(eventos.map(({ accion }) => accion)).toEqual([
      ACCIONES_AUDITORIA.CATEGORIAS_CREAR,
      ACCIONES_AUDITORIA.CATEGORIAS_DESACTIVAR,
      ACCIONES_AUDITORIA.CATEGORIAS_REACTIVAR,
    ]);
    const vinculos = await prisma.auditoriaOperacion.findMany({
      where: {
        tenantId: tienda.id,
        entidadTipo: 'Producto',
        productoId: propio.id,
      },
      orderBy: { id: 'asc' },
    });
    expect(vinculos.map(({ accion }) => accion)).toEqual([
      ACCIONES_AUDITORIA.PRODUCTOS_ASIGNAR_CATEGORIA,
      ACCIONES_AUDITORIA.PRODUCTOS_DESASIGNAR_CATEGORIA,
    ]);
    expect(vinculos[0]).toMatchObject({
      usuarioId: usuario.id,
      membresiaId: owner.id,
      rolCodigo: 'OWNER',
      datos: { categoriaIdAnterior: null, categoriaId: categoria.id },
    });
    await prisma.tenantModule.update({
      where: { tenantId_module: { tenantId: tienda.id, module: 'STORE' } },
      data: { activo: false },
    });
    await http().get(rutaCategorias).auth(accessToken, bearer).expect(401);
    await editar(categoria.id, { activo: false }).expect(401);
  }, 20000);

  it('concilia aperturas y recibe lotes con idempotencia y auditoría atómicas', async () => {
    const { id: tenantId } = await crearNegocio({
      autorizacionVersion: 'PERMISOS',
    });
    const { id: tenantAjeno } = await crearNegocio();
    const permisos = await prisma.$transaction((tx) =>
      app.get(PermisosService).registrarCatalogo(tx),
    );
    const { usuario, credenciales } = await registrarPersonal();
    const membresia = await vincularPersonal(usuario.id, tenantId);
    const rol = await asignarRol(tenantId, membresia.id);
    const { accessToken } = await loginTienda(credenciales);
    const bearer = { type: 'bearer' } as const;
    const crearProducto = (stock: number, tienda = tenantId) =>
      prisma.producto.create({
        data: {
          tenantId: tienda,
          nombre: 'Producto A09',
          precio: 1,
          stock,
          estado: true,
        },
      });
    const previo = await crearProducto(5);
    const nuevo = await crearProducto(0);
    const ajeno = await crearProducto(0, tenantAjeno);
    const ruta = (id: number, operacion: string) =>
      `/inventario/productos/${id}/${operacion}`;
    const enviar = (
      id: number,
      operacion: string,
      datos: object,
      clave: string = randomUUID(),
    ) =>
      http()
        .post(ruta(id, operacion))
        .auth(accessToken, bearer)
        .set('Idempotency-Key', clave)
        .send(datos);
    const cero = { motivo: 'Alta de inventario', lotes: [] };
    await enviar(nuevo.id, 'apertura', cero).expect(403);
    await prisma.rolPermiso.createMany({
      data: permisos
        .filter(
          ({ codigo }) =>
            codigo === 'store.inventory.receive' ||
            codigo === 'store.inventory.read',
        )
        .map(({ id: permisoId }) => ({ tenantId, rolId: rol.id, permisoId })),
    });
    await enviar(ajeno.id, 'apertura', cero).expect(404);
    await http()
      .post(ruta(nuevo.id, 'apertura'))
      .auth(accessToken, bearer)
      .send(cero)
      .expect(400);
    await enviar(previo.id, 'apertura', cero).expect(409);
    await expect(
      prisma.producto.update({
        where: { id: previo.id },
        data: { stockReservado: 1 },
      }),
    ).rejects.toThrow('Producto_legacy_reserva_ck');
    const vigente = {
      codigo: ' VIGENTE ',
      cantidad: 3,
      costoUnitario: '1.2345',
    };
    const vencido = {
      codigo: 'VENCIDO',
      cantidad: 2,
      costoUnitario: '2',
      vencimiento: '2020-01-01T00:00:00Z',
    };
    const conciliacion = {
      motivo: ' Conteo inicial ',
      referenciaExterna: ' ACTA-01 ',
      lotes: [vigente, vencido],
    };
    await enviar(previo.id, 'apertura', {
      ...conciliacion,
      lotes: [{ codigo: 'SIN-COSTO', cantidad: 5 }],
    }).expect(400);
    await enviar(previo.id, 'apertura', {
      ...conciliacion,
      lotes: [{ ...vigente, stock: 3 }, vencido],
    }).expect(400);
    await enviar(nuevo.id, 'entradas', {
      motivo: 'Recepción sin apertura',
      lotes: [vigente],
    }).expect(409);
    const apertura = await enviar(previo.id, 'apertura', conciliacion).expect(
      201,
    );
    await enviar(previo.id, 'apertura', conciliacion).expect(409);
    await enviar(nuevo.id, 'apertura', cero).expect(201);
    await enviar(nuevo.id, 'entradas', cero).expect(400);
    await enviar(nuevo.id, 'entradas', { ...cero, lotes: [[]] }).expect(400);
    await enviar(nuevo.id, 'entradas', {
      motivo: 'Lote vencido',
      lotes: [vencido],
    }).expect(400);
    await enviar(nuevo.id, 'entradas', {
      motivo: 'Costo total fuera de rango',
      lotes: [{ ...vigente, costoUnitario: '99999999999999.9999' }],
    }).expect(400);
    const lotesPrevios = await http()
      .get(ruta(previo.id, 'lotes'))
      .auth(accessToken, bearer)
      .expect(200);
    expect(lotesPrevios.body).toMatchObject({
      data: [{ codigo: 'VIGENTE', cantidadDisponible: 3 }],
      meta: { total: 1 },
    });

    const ingreso = {
      motivo: 'Reposición',
      referenciaExterna: 'FACTURA-01',
      lotes: [{ ...vigente, vencimiento: '2099-07-20T12:00:00-05:00' }],
    };
    const clave = randomUUID();
    const [primero, segundo] = await Promise.all([
      enviar(nuevo.id, 'entradas', ingreso, clave).expect(201),
      enviar(nuevo.id, 'entradas', ingreso, clave).expect(201),
    ]);
    const entrada = primero.body as { recursoTipo: string; recursoId: number };
    expect(entrada.recursoTipo).toBe('EntradaInventario');
    expect(segundo.body).toEqual(entrada);
    const ingresoEquivalente = {
      ...ingreso,
      lotes: [
        {
          ...vigente,
          codigo: 'VIGENTE',
          costoUnitario: '01.2345',
          vencimiento: '2099-07-20T17:00:00Z',
        },
      ],
    };
    expect(
      (
        await enviar(nuevo.id, 'entradas', ingresoEquivalente, clave).expect(
          201,
        )
      ).body,
    ).toEqual(entrada);
    await enviar(
      nuevo.id,
      'entradas',
      { ...ingreso, referenciaExterna: 'OTRA' },
      clave,
    ).expect(409);
    await enviar(previo.id, 'entradas', ingreso, clave).expect(409);

    const estado = async () => {
      const [productos, entradas, lotes, movimientos, auditorias, solicitudes] =
        await Promise.all([
          prisma.producto.findMany({
            where: { tenantId },
            orderBy: { id: 'asc' },
          }),
          prisma.entradaInventario.findMany({
            where: { tenantId },
            orderBy: { id: 'asc' },
          }),
          prisma.loteInventario.findMany({
            where: { tenantId },
            orderBy: { id: 'asc' },
          }),
          prisma.movimientoInventario.findMany({
            where: { tenantId },
            orderBy: { id: 'asc' },
          }),
          prisma.auditoriaOperacion.findMany({
            where: { tenantId },
            orderBy: { id: 'asc' },
          }),
          prisma.solicitudIdempotente.findMany({
            where: { tenantId },
            orderBy: { id: 'asc' },
          }),
        ]);
      return {
        productos,
        entradas,
        lotes,
        movimientos,
        auditorias,
        solicitudes,
      };
    };
    const inicial = await estado();
    expect(inicial.entradas).toHaveLength(3);
    expect(inicial.auditorias).toHaveLength(3);
    expect(inicial.solicitudes).toHaveLength(3);
    expect(
      inicial.movimientos.map(({ tipo, deltaFisico }) => [tipo, deltaFisico]),
    ).toEqual([
      ['APERTURA', 3],
      ['APERTURA', 2],
      ['ENTRADA', 3],
    ]);
    expect(inicial.entradas[0]).toMatchObject({
      id: (apertura.body as { recursoId: number }).recursoId,
      referenciaExterna: 'ACTA-01',
      motivo: 'Conteo inicial',
      responsableId: membresia.id,
    });
    expect(inicial.entradas[2]).toMatchObject({
      id: entrada.recursoId,
      referenciaExterna: 'FACTURA-01',
    });
    expect(inicial.productos.map(({ stock }) => stock)).toEqual([5, 3]);
    expect(
      inicial.productos.every(
        ({ modoInventario }) => modoInventario === 'LOTES',
      ),
    ).toBe(true);
    for (const producto of inicial.productos) {
      expect(producto.stock).toBe(
        inicial.lotes
          .filter(({ productoId }) => productoId === producto.id)
          .reduce((total, { cantidadFisica }) => total + cantidadFisica, 0),
      );
    }
    const movimiento = inicial.movimientos[2];
    expect(movimiento).toMatchObject({
      entradaId: entrada.recursoId,
      responsableId: membresia.id,
      motivo: 'Reposición',
    });
    expect(movimiento.costoUnitario?.toFixed(4)).toBe('1.2345');
    expect(movimiento.costoTotal?.toFixed(4)).toBe('3.7035');
    expect(inicial.auditorias[2]).toMatchObject({
      usuarioId: usuario.id,
      membresiaId: membresia.id,
      rolCodigo: 'BODEGUERO',
      entidadId: entrada.recursoId,
      productoId: nuevo.id,
      correlacionId: movimiento.correlacionId,
      accion: ACCIONES_AUDITORIA.INVENTARIO_ENTRADA,
      datos: {
        tipo: 'ENTRADA',
        referenciaExterna: 'FACTURA-01',
        loteIds: [movimiento.loteId],
      },
    });

    const fallo = jest
      .spyOn(app.get(AuditoriaEscrituraService), 'registrar')
      .mockRejectedValueOnce(
        new Error('Fallo al escribir la auditoría de A09'),
      );
    const claveFallida = randomUUID();
    try {
      await enviar(nuevo.id, 'entradas', ingreso, claveFallida).expect(500);
    } finally {
      fallo.mockRestore();
    }
    expect(await estado()).toEqual(inicial);
    await enviar(nuevo.id, 'entradas', ingreso, claveFallida).expect(201);
    expect(
      await prisma.producto.findUnique({ where: { id: nuevo.id } }),
    ).toMatchObject({ stock: 6 });
  }, 20000);

  it('distingue ajustes de bajas y concilia pérdidas de inventario por tienda y periodo', async () => {
    const { usuario, credenciales } = await registrarPersonal();
    const permisos = await prisma.$transaction((tx) =>
      app.get(PermisosService).registrarCatalogo(tx),
    );
    const ajuste = permisos.find(
      ({ codigo }) => codigo === 'store.inventory.adjust',
    )!;
    const perdida = permisos.find(
      ({ codigo }) => codigo === 'store.inventory.loss',
    )!;
    const inventario = app.get(InventarioLotesService);
    const bearer = { type: 'bearer' } as const;
    async function prepararInventario() {
      const { id: tenantId } = await crearNegocio({
        autorizacionVersion: 'PERMISOS',
      });
      const { id: responsableId } = await vincularPersonal(
        usuario.id,
        tenantId,
      );
      const { id: rolId } = await asignarRol(tenantId, responsableId);
      await prisma.rolPermiso.create({
        data: { tenantId, rolId, permisoId: perdida.id },
      });
      const producto = await prisma.producto.create({
        data: {
          tenantId,
          nombre: 'Ensayo A10',
          precio: 3,
          stock: 8,
          estado: true,
        },
      });
      const costoUnitario = new Prisma.Decimal('1.2345');
      const {
        lotes: [vigente, vencido],
      } = await prisma.$transaction((tx) =>
        inventario.registrarEntrada(
          tx,
          {
            tenantId,
            responsableId,
            clave: randomUUID(),
            correlacionId: randomUUID(),
          },
          producto.id,
          'APERTURA',
          'Conciliación',
          [
            { codigo: 'VIGENTE', cantidad: 5, costoUnitario },
            {
              codigo: 'VENCIDO',
              cantidad: 3,
              costoUnitario,
              vencimiento: new Date('2020-01-01T00:00:00Z'),
            },
          ],
        ),
      );
      const { accessToken } = await loginTienda(credenciales, tenantId);
      return {
        tenantId,
        responsableId,
        rolId,
        producto,
        vigente,
        vencido,
        accessToken,
      };
    }
    const propio = await prepararInventario();
    const ajeno = await prepararInventario();
    const { tenantId, responsableId, rolId, producto, vigente, vencido } =
      propio;
    const enviar = (
      tipo: 'ajustes' | 'bajas',
      loteId: number,
      datos: object,
      clave: string = randomUUID(),
      tienda = propio,
    ) =>
      http()
        .post(
          `/inventario/productos/${tienda.producto.id}/lotes/${loteId}/${tipo}`,
        )
        .auth(tienda.accessToken, bearer)
        .set('Idempotency-Key', clave)
        .send(datos);
    const baja = { cantidad: 2, motivo: ' Vencimiento ' };
    await enviar('ajustes', vigente.id, { delta: 1, motivo: 'Conteo' }).expect(
      403,
    );
    await enviar('bajas', vencido.id, { ...baja, motivo: '   ' }).expect(400);
    await enviar('bajas', vencido.id, { ...baja, cantidad: '2' }).expect(400);
    await enviar('bajas', vencido.id, { ...baja, costoUnitario: '0' }).expect(
      400,
    );
    await enviar('bajas', vencido.id, { ...baja, cantidad: 4 }).expect(409);
    await enviar('bajas', ajeno.vencido.id, baja).expect(404);
    await enviar('bajas', vencido.id, baja, randomUUID(), {
      ...propio,
      accessToken: ajeno.accessToken,
    }).expect(404);
    await prisma.rolPermiso.create({
      data: { tenantId, rolId, permisoId: ajuste.id },
    });
    await enviar('ajustes', vigente.id, { delta: 0, motivo: 'Conteo' }).expect(
      400,
    );
    const clave = randomUUID();
    const aumento = await enviar(
      'ajustes',
      vigente.id,
      { delta: 1, motivo: 'Conteo' },
      clave,
    ).expect(201);
    await enviar('ajustes', vigente.id, { delta: -2, motivo: 'Conteo' }).expect(
      201,
    );
    const [primera, repetida] = await Promise.all([
      enviar('bajas', vencido.id, baja, clave).expect(201),
      enviar(
        'bajas',
        vencido.id,
        { ...baja, motivo: 'Vencimiento' },
        clave,
      ).expect(201),
    ]);
    expect(repetida.body).toEqual(primera.body);
    expect(aumento.body).not.toEqual(primera.body);
    await enviar('bajas', vencido.id, { ...baja, cantidad: 1 }, clave).expect(
      409,
    );
    const { recursoId } = primera.body as { recursoId: number };
    expect(primera.body).toEqual({
      recursoTipo: 'MovimientoInventario',
      recursoId,
    });
    const movimiento = await prisma.movimientoInventario.findUniqueOrThrow({
      where: { id: recursoId },
    });
    expect(movimiento).toMatchObject({
      tipo: 'BAJA',
      motivo: 'Vencimiento',
      responsableId,
      deltaFisico: -2,
      deltaReservado: 0,
    });
    expect(movimiento.costoTotal?.toFixed(4)).toBe('2.4690');
    expect(
      await prisma.auditoriaOperacion.findFirst({
        where: {
          tenantId,
          entidadTipo: 'MovimientoInventario',
          entidadId: recursoId,
        },
      }),
    ).toMatchObject({
      accion: ACCIONES_AUDITORIA.INVENTARIO_BAJA,
      correlacionId: movimiento.correlacionId,
      productoId: producto.id,
      membresiaId: responsableId,
      usuarioId: usuario.id,
      datos: { loteId: vencido.id, cantidad: 2 },
    });
    expect(
      await prisma.auditoriaOperacion.count({
        where: { tenantId, accion: ACCIONES_AUDITORIA.INVENTARIO_AJUSTE },
      }),
    ).toBe(2);
    expect(
      await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } }),
    ).toMatchObject({ stock: 5 });
    const fallo = jest
      .spyOn(app.get(AuditoriaEscrituraService), 'registrar')
      .mockRejectedValueOnce(new Error('Fallo en auditoría A10'));
    const claveFallida = randomUUID();
    try {
      await enviar(
        'bajas',
        vencido.id,
        { ...baja, cantidad: 1 },
        claveFallida,
      ).expect(500);
    } finally {
      fallo.mockRestore();
    }
    expect(
      await prisma.movimientoInventario.count({
        where: { tenantId, tipo: 'BAJA' },
      }),
    ).toBe(1);
    expect(
      await prisma.solicitudIdempotente.count({
        where: { tenantId, clave: claveFallida },
      }),
    ).toBe(0);
    expect(
      await prisma.loteInventario.findUniqueOrThrow({
        where: { id: vencido.id },
      }),
    ).toMatchObject({ cantidadFisica: 1 });
    expect(
      await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } }),
    ).toMatchObject({ stock: 5 });
    await enviar(
      'bajas',
      vencido.id,
      { ...baja, cantidad: 1 },
      claveFallida,
    ).expect(201);
    await enviar('bajas', ajeno.vencido.id, baja, randomUUID(), ajeno).expect(
      201,
    );
    const total = (desde: Date, hasta: Date) =>
      inventario.consultarTotalPerdidas(prisma, tenantId, desde, hasta);
    const hasta = new Date(Date.now() + 60000);
    const instanteSiguiente = new Date(movimiento.fecha.getTime() + 1);
    await expect(total(new Date(0), hasta)).resolves.toEqual({
      totalPerdidas: '3.7035',
    });
    await expect(total(movimiento.fecha, instanteSiguiente)).resolves.toEqual({
      totalPerdidas: '2.4690',
    });
    await expect(total(new Date(0), movimiento.fecha)).resolves.toEqual({
      totalPerdidas: '0.0000',
    });
    const supervisor = await crearPerfilComercial(
      tenantId,
      'OWNER',
      [],
      'OWNER',
    );
    const finanzas = await http()
      .get('/finanzas/resumen')
      .auth(supervisor.accessToken, bearer)
      .query({
        desde: fechaComercial(movimiento.fecha),
        hasta: fechaComercial(new Date(Date.now() + 86_400_000)),
      })
      .expect(200);
    expect(finanzas.body).toMatchObject({
      costoNetoVendido: '0',
      perdidasInventario: '3.7035',
      resultadoOperativoEstimado: '-3.7035',
    });
    const saldos = await prisma.loteInventario.aggregate({
      where: { tenantId, productoId: producto.id },
      _sum: { cantidadFisica: true },
    });
    expect(
      await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } }),
    ).toMatchObject({ stock: saldos._sum.cantidadFisica });
  }, 20000);

  it('pagina operaciones históricas, filtra sus eventos y protege el bloque de actividad', async () => {
    const { id: tenantId } = await crearNegocio({
      autorizacionVersion: 'PERMISOS',
    });
    const { id: tenantAjeno } = await crearNegocio({
      autorizacionVersion: 'PERMISOS',
    });
    const permisos = await prisma.$transaction((tx) =>
      app.get(PermisosService).registrarCatalogo(tx),
    );
    const permisoId = permisos.find(
      ({ codigo }) => codigo === 'store.audit.read',
    )!.id;
    async function operador(id: number) {
      const { usuario, credenciales } = await registrarPersonal();
      const membresia = await vincularPersonal(usuario.id, id);
      const rol = await asignarRol(id, membresia.id);
      return { usuario, membresia, rol, ...(await loginTienda(credenciales)) };
    }
    const propio = await operador(tenantId);
    const ajeno = await operador(tenantAjeno);
    const bearer = { type: 'bearer' } as const;
    const recibir = (ruta = '', token = propio.accessToken) =>
      http().get(`/auditoria${ruta}`).auth(token, bearer);
    const actividad = '/actividad-reciente';
    const servicio = app.get(AuditoriaService);
    await http().get(`/auditoria${actividad}`).expect(401);
    await recibir(actividad).expect(403);
    await expect(
      servicio.actividadReciente(propio.context),
    ).rejects.toMatchObject({ status: 403 });
    await prisma.rolPermiso.createMany({
      data: [
        { tenantId, rolId: propio.rol.id, permisoId },
        { tenantId: tenantAjeno, rolId: ajeno.rol.id, permisoId },
      ],
    });
    await recibir(actividad).expect(200, { data: [] });
    await recibir().expect(400);
    await recibir('/no-es-uuid').expect(400);

    const [productoA, productoB] = await Promise.all(
      ['A', 'B'].map((nombre) =>
        prisma.producto.create({
          data: { tenantId, nombre, precio: 1, stock: 0, estado: true },
        }),
      ),
    );
    const inicio = '2022-01-01T00:00:00-05:00';
    const fin = '2022-01-03T00:00:00-05:00';
    const ventana = { desde: inicio, hasta: fin };
    const venta = randomUUID();
    const limite = randomUUID();
    const abono = randomUUID();
    const actor = {
      tenantId,
      actor: 'USUARIO' as const,
      usuarioId: propio.usuario.id,
      membresiaId: propio.membresia.id,
      rolCodigo: propio.rol.codigo,
      rolNombre: 'Rol antes del cambio',
    };
    await prisma.auditoriaOperacion.createMany({
      data: [
        {
          ...actor,
          correlacionId: venta,
          accion: 'ventas.registrar',
          entidadTipo: 'Venta',
          entidadId: 77,
          productoId: productoA.id,
          createdAt: new Date(inicio),
          datos: {
            modalidad: 'CREDITO',
            financiado: '900.00',
            clave: 'privada',
          },
        },
        {
          ...actor,
          correlacionId: venta,
          accion: 'ventas.registrar',
          entidadTipo: 'Venta',
          entidadId: 77,
          productoId: productoB.id,
          createdAt: new Date(inicio),
          datos: {
            modalidad: 'CREDITO',
            financiado: '900.00',
            clave: 'privada',
          },
        },
        {
          ...actor,
          correlacionId: limite,
          accion: 'devoluciones.registrar',
          entidadTipo: 'DevolucionVenta',
          entidadId: 77,
          motivo: 'Producto dañado',
          createdAt: new Date(Date.parse(fin) - 1),
        },
        {
          ...actor,
          correlacionId: limite,
          accion: 'ventas.anular',
          entidadTipo: 'Venta',
          entidadId: 78,
          motivo: 'Anulación de ensayo',
          createdAt: new Date(fin),
        },
      ],
    });
    await prisma.auditoriaOperacion.create({
      data: {
        tenantId,
        actor: 'SISTEMA',
        correlacionId: abono,
        accion: 'cartera.abonar',
        entidadTipo: 'Cobro',
        entidadId: 42,
        createdAt: new Date(inicio),
      },
    });
    await prisma.rolNegocio.update({
      where: { id: propio.rol.id },
      data: { nombre: 'Rol actual' },
    });
    const encontrados = await recibir()
      .query({ ...ventana, pagina: 1, limite: 1 })
      .expect(200);
    expect(encontrados.body).toMatchObject({
      data: [
        {
          correlacionId: abono,
          actor: { tipo: 'SISTEMA', nombre: null },
          rol: null,
        },
      ],
      meta: { pagina: 1, limite: 1, total: 2, paginas: 2 },
    });
    expect(
      (
        await recibir()
          .query({ ...ventana, pagina: 2, limite: 1 })
          .expect(200)
      ).body,
    ).toMatchObject({ data: [{ correlacionId: venta }] });
    const listarProducto = (productoId: number) =>
      recibir()
        .query({
          ...ventana,
          productoId,
          actor: 'USUARIO',
          usuarioId: propio.usuario.id,
          rolCodigo: propio.rol.codigo,
          accion: 'ventas.registrar',
        })
        .expect(200);
    const listaA = await listarProducto(productoA.id);
    const listaB = await listarProducto(productoB.id);
    expect(listaA.body).toEqual(listaB.body);
    expect(listaA.body).toMatchObject({
      data: [
        {
          correlacionId: venta,
          fecha: new Date(inicio).toISOString(),
          actor: {
            usuarioId: propio.usuario.id,
            membresiaId: propio.membresia.id,
            nombre: 'Personal Ensayo',
          },
          rol: { codigo: propio.rol.codigo, nombre: 'Rol antes del cambio' },
        },
      ],
      meta: { total: 1, limite: 20 },
    });
    const detalle = await recibir(`/${venta}`).expect(200);
    expect(detalle.body).toMatchObject({
      productoIds: [productoA.id, productoB.id].sort((a, b) => a - b),
      eventos: [{ entidad: { tipo: 'Venta', id: 77 } }],
    });
    const { eventos } = detalle.body as { eventos: { datos: unknown }[] };
    expect(eventos[0].datos).toEqual({ modalidad: 'CREDITO' });
    expect(
      (
        await recibir()
          .query({
            desde: fin,
            hasta: '2022-01-04T00:00:00-05:00',
            accion: 'devoluciones.registrar',
          })
          .expect(200)
      ).body,
    ).toMatchObject({
      data: [{ correlacionId: limite, accion: 'ventas.anular' }],
      meta: { total: 1 },
    });
    expect((await recibir(actividad).expect(200)).body).toMatchObject({
      data: [
        { correlacionId: limite },
        { correlacionId: abono },
        { correlacionId: venta },
      ],
    });
    await recibir('', ajeno.accessToken)
      .query(ventana)
      .expect(200, {
        data: [],
        meta: { pagina: 1, limite: 20, total: 0, paginas: 0 },
      });
    await recibir(`/${venta}`, ajeno.accessToken).expect(404);
    await recibir()
      .query({ ...ventana, hasta: '2022-01-03T00:00:00.001-05:00' })
      .expect(400);
    await recibir()
      .query({ ...ventana, hasta: inicio })
      .expect(400);
    await recibir()
      .query({ ...ventana, desde: '2022-01-01T00:00:00' })
      .expect(400);
    await recibir()
      .query({ ...ventana, tenantId: tenantAjeno })
      .expect(400);

    await prisma.auditoriaOperacion.createMany({
      data: Array.from({ length: 12 }, (_, orden) => ({
        ...actor,
        correlacionId: randomUUID(),
        accion: 'inventario.baja',
        entidadTipo: 'MovimientoInventario',
        entidadId: orden + 1,
        createdAt: new Date(Date.UTC(2025, 0, orden + 1)),
      })),
    });
    const recientes = await servicio.actividadReciente(propio.context);
    expect(recientes.data.map(({ fecha }) => fecha.getUTCDate())).toEqual([
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3,
    ]);
    await recibir(actividad).expect(
      200,
      JSON.parse(JSON.stringify(recientes)) as object,
    );
  }, 20000);

  it('A13: aísla catálogo, lotes, cajas y clientes sin alterar los datos de otra tienda', async () => {
    const permisos = await prisma.$transaction((tx) =>
      app.get(PermisosService).registrarCatalogo(tx),
    );
    const requeridos = [
      'store.catalog.read',
      'store.catalog.write',
      'store.inventory.read',
      'store.inventory.loss',
      'store.cash.read',
      'store.cash.manage',
      'store.customers.read',
      'store.customers.write',
    ];
    const lotesService = app.get(InventarioLotesService);
    async function prepararTienda() {
      const { id: tenantId } = await crearNegocio({
        autorizacionVersion: 'PERMISOS',
      });
      const { usuario, credenciales } = await registrarPersonal();
      const membresia = await vincularPersonal(usuario.id, tenantId);
      const rol = await asignarRol(tenantId, membresia.id);
      await prisma.rolPermiso.createMany({
        data: permisos
          .filter(({ codigo }) => requeridos.includes(codigo))
          .map(({ id: permisoId }) => ({ tenantId, rolId: rol.id, permisoId })),
      });
      const datos = await prisma.$transaction(async (tx) => {
        const producto = await tx.producto.create({
          data: {
            tenantId,
            nombre: 'Producto A13',
            sku: 'A13',
            precio: '5.20',
            stock: 7,
            estado: true,
          },
        });
        const operacion = {
          tenantId,
          responsableId: membresia.id,
          clave: randomUUID(),
          correlacionId: randomUUID(),
        };
        const costoUnitario = new Prisma.Decimal('1.0000');
        const {
          lotes: [vigente, vencido, agotado],
        } = await lotesService.registrarEntrada(
          tx,
          operacion,
          producto.id,
          'APERTURA',
          'Conciliación A13',
          [
            { codigo: 'VIGENTE', cantidad: 4, costoUnitario },
            {
              codigo: 'VENCIDO',
              cantidad: 2,
              costoUnitario,
              vencimiento: new Date('2020-01-01T00:00:00Z'),
            },
            { codigo: 'AGOTADO', cantidad: 1, costoUnitario },
          ],
        );
        await lotesService.registrarBaja(
          tx,
          { ...operacion, clave: randomUUID() },
          producto.id,
          agotado.id,
          1,
          'Daño de ensayo',
        );
        const { pedido } = await reservarPedidoEnsayo(
          tx,
          app.get(ReservasInventarioService),
          { ...operacion, clave: randomUUID() },
          producto,
          2,
        );
        const caja = await tx.caja.create({
          data: { tenantId, codigo: 'A13', nombre: 'Caja A13' },
        });
        return {
          productoId: producto.id,
          vigente,
          vencido,
          agotado,
          cajaId: caja.id,
          clienteId: pedido.clienteComercialId,
        };
      });
      return { tenantId, ...(await loginTienda(credenciales)), ...datos };
    }
    const propia = await prepararTienda();
    const ajena = await prepararTienda();
    const bearer = { type: 'bearer' } as const;
    const leer = (ruta: string, token = propia.accessToken) =>
      http().get(ruta).auth(token, bearer);
    const inventario = '/inventario/productos';
    const productoAjeno = `/catalogo/productos/${ajena.productoId}`;
    const cajaAjena = `/caja/${ajena.cajaId}`;
    const clienteAjeno = `/clientes/${ajena.clienteId}`;
    const lotesAjena = `${inventario}/${ajena.productoId}/lotes`;
    const protegidos = [productoAjeno, cajaAjena, clienteAjeno, lotesAjena];
    const leerDatosAjenos = async () =>
      Promise.all(
        protegidos.map(
          async (ruta) =>
            (await leer(ruta, ajena.accessToken).expect(200)).body as unknown,
        ),
      );
    const antes = await leerDatosAjenos();
    for (const ruta of protegidos) await leer(ruta).expect(404);

    const lista = await leer(inventario).query({ q: 'A13' }).expect(200);
    expect(lista.body).toMatchObject({
      data: [
        {
          productoId: propia.productoId,
          stockFisico: 6,
          stockReservado: 2,
          stockDisponible: 2,
        },
      ],
      meta: { total: 1 },
    });
    const lotes = await leer(`${inventario}/${propia.productoId}/lotes`)
      .query({ soloVendibles: false })
      .expect(200);
    expect(lotes.body).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          loteId: propia.vigente.id,
          cantidadDisponible: 2,
        }),
        expect.objectContaining({
          loteId: propia.vencido.id,
          cantidadDisponible: 0,
        }),
        expect.objectContaining({
          loteId: propia.agotado.id,
          cantidadDisponible: 0,
        }),
      ]) as unknown,
      meta: { total: 3 },
    });

    for (const [ruta, datos] of [
      [productoAjeno, { precio: '99.00' }],
      [cajaAjena, { nombre: 'Otra caja' }],
      [clienteAjeno, { nombres: 'Otro comprador' }],
    ] as const) {
      await http()
        .patch(ruta)
        .auth(propia.accessToken, bearer)
        .send(datos)
        .expect(404);
    }
    for (const productoId of [propia.productoId, ajena.productoId]) {
      await http()
        .post(`${inventario}/${productoId}/lotes/${ajena.vigente.id}/bajas`)
        .auth(propia.accessToken, bearer)
        .set('Idempotency-Key', randomUUID())
        .send({ cantidad: 1, motivo: 'Ensayo de aislamiento A13' })
        .expect(404);
    }
    expect(await leerDatosAjenos()).toEqual(antes);
    expect(
      await prisma.movimientoInventario.count({
        where: { tenantId: ajena.tenantId, tipo: 'BAJA' },
      }),
    ).toBe(1);
  }, 20000);

  it('vende, devuelve mercancía y anula el remanente sin duplicar stock', async () => {
    const { id: tenantId } = await crearNegocio({
      autorizacionVersion: 'PERMISOS',
    });
    const { id: tenantAjeno } = await crearNegocio({
      autorizacionVersion: 'PERMISOS',
    });
    const permisos = await prisma.$transaction((tx) =>
      app.get(PermisosService).registrarCatalogo(tx),
    );
    const permisoCatalogo = permisos.filter(
      ({ codigo }) =>
        codigo === 'store.catalog.read' ||
        codigo === 'store.catalog.write' ||
        codigo === 'store.inventory.read',
    );
    async function operador(id: number) {
      const { usuario, credenciales } = await registrarPersonal();
      const membresia = await vincularPersonal(usuario.id, id);
      const rol = await asignarRol(id, membresia.id);
      await prisma.rolPermiso.createMany({
        data: permisoCatalogo.map(({ id: permisoId }) => ({
          tenantId: id,
          rolId: rol.id,
          permisoId,
        })),
      });
      return loginTienda(credenciales);
    }
    const { context, accessToken } = await operador(tenantId);
    const { accessToken: tokenAjeno } = await operador(tenantAjeno);
    const bearer = { type: 'bearer' } as const;
    const producto = {
      nombre: 'Bebida tropical',
      precio: '5.2',
      presentacion: 'Lata mediana',
      sku: 'BEB-1',
      codigoBarras: '001234',
    };
    const crear = (token: string, ficha: object) =>
      http().post(rutaProductos).auth(token, bearer).send(ficha);
    const escanear = (codigoBarras: string, token = accessToken) =>
      http().get(rutaBarras).auth(token, bearer).query({ codigoBarras });
    await http().get(rutaProductos).expect(401);
    await crear(accessToken, { ...producto, precio: 5.2 }).expect(400);
    await crear(accessToken, { ...producto, codigoBarras: 1234 }).expect(400);
    await crear(accessToken, {
      ...producto,
      modoInventario: 'LOTES',
      stock: 2,
    }).expect(400);
    const creado = await crear(accessToken, producto).expect(201);
    const { productoId } = creado.body as { productoId: number };
    expect(creado.body).toMatchObject({
      precio: '5.20',
      codigoBarras: '001234',
      estado: true,
      stockFisico: 0,
      stockReservado: 0,
      stockDisponible: 0,
      modoInventario: 'LEGACY',
      imagenes: [],
    });
    await crear(accessToken, { ...producto, sku: 'LIBRE' }).expect(409);
    await crear(accessToken, { ...producto, codigoBarras: '654' }).expect(409);
    await escanear('001234', tokenAjeno).expect(404);
    await crear(tokenAjeno, producto).expect(201);
    await http()
      .get(rutaProductos + '/' + productoId)
      .auth(tokenAjeno, bearer)
      .expect(404);
    await escanear('1234').expect(404);

    await crear(accessToken, {
      ...producto,
      nombre: 'Bebida apartada',
      sku: 'BEB-2',
      codigoBarras: '0099',
      estado: false,
    }).expect(201);
    const pagina = await http()
      .get(rutaProductos)
      .auth(accessToken, bearer)
      .query({ q: 'lata', pagina: 2, limite: 1 })
      .expect(200);
    expect(pagina.body).toMatchObject({
      data: [{ productoId }],
      meta: { pagina: 2, limite: 1, total: 2, paginas: 2 },
    });
    const inactivos = await http()
      .get(rutaProductos)
      .auth(accessToken, bearer)
      .query({ activo: false })
      .expect(200);
    expect(inactivos.body).toMatchObject({
      data: [{ codigoBarras: '0099', estado: false }],
      meta: { total: 1 },
    });
    await escanear('0099').expect(404);
    const sinInactivos = await http()
      .get(rutaMostrador)
      .auth(accessToken, bearer)
      .query({ q: 'apartada' })
      .expect(200);
    expect(sinInactivos.body).toMatchObject({ data: [], meta: { total: 0 } });

    const altaCategoria = await http()
      .post(rutaCategorias)
      .auth(accessToken, bearer)
      .send({ nombre: 'Bebidas' })
      .expect(201);
    const categoria = altaCategoria.body as { id: number; nombre: string };
    await http()
      .put(rutaCategoriaProducto(productoId))
      .auth(accessToken, bearer)
      .send({ categoriaId: categoria.id })
      .expect(200);
    const filtrados = await http()
      .get(rutaProductos)
      .auth(accessToken, bearer)
      .query({ categoriaId: categoria.id })
      .expect(200);
    expect(filtrados.body).toMatchObject({
      data: [{ productoId }],
      meta: { total: 1 },
    });

    const fichaUrl = rutaProductos + '/' + productoId;
    const imagenes = fichaUrl + '/imagenes';
    const agregarImagen = (dto: object, token = accessToken) =>
      http().post(imagenes).auth(token, bearer).send(dto);
    await agregarImagen({
      url: 'http://cdn.example.com/foto.png',
      orden: 0,
    }).expect(400);
    await agregarImagen(
      { url: 'https://cdn.example.com/foto.png', orden: 0 },
      tokenAjeno,
    ).expect(404);
    const secundaria = await agregarImagen({
      url: 'https://cdn.example.com/lateral.png',
      orden: 1,
    }).expect(201);
    const principal = await agregarImagen({
      url: 'https://cdn.example.com/frontal.png',
      orden: 0,
      textoAlternativo: 'Frente',
    }).expect(201);
    const primeraImagen = principal.body as {
      id: number;
      url: string;
      orden: number;
    };
    await agregarImagen({
      url: 'https://cdn.example.com/otra.png',
      orden: 0,
    }).expect(409);
    const imagenUrl = imagenes + '/' + primeraImagen.id;
    const reemplazo = {
      url: 'https://cdn.example.com/frontal-nueva.png',
      textoAlternativo: 'Nueva presentación',
    };
    await http()
      .patch(imagenUrl)
      .auth(tokenAjeno, bearer)
      .send(reemplazo)
      .expect(404);
    await http()
      .patch(imagenUrl)
      .auth(accessToken, bearer)
      .send(reemplazo)
      .expect(200);
    const detalle = await http()
      .get(fichaUrl)
      .auth(accessToken, bearer)
      .expect(200);
    expect(detalle.body).toMatchObject({
      imagenPrincipal: { id: primeraImagen.id, ...reemplazo },
      imagenes: [{ ...primeraImagen, ...reemplazo }, secundaria.body as object],
    });

    const operacion = {
      tenantId,
      responsableId: context.membresiaId,
      clave: randomUUID(),
      correlacionId: randomUUID(),
    };
    const lotes = app.get(InventarioLotesService);
    const reservas = app.get(ReservasInventarioService);
    const ahora = Date.now();
    await prisma.$transaction(async (tx) => {
      await lotes.registrarEntrada(
        tx,
        operacion,
        productoId,
        'APERTURA',
        'Conciliación',
        [],
      );
      await lotes.registrarEntrada(
        tx,
        { ...operacion, clave: randomUUID() },
        productoId,
        'ENTRADA',
        'Ensayo',
        [
          {
            codigo: 'VIGENTE',
            cantidad: 5,
            costoUnitario: new Prisma.Decimal(1),
          },
          {
            codigo: 'VENCIDO',
            cantidad: 3,
            costoUnitario: new Prisma.Decimal(1),
            vencimiento: new Date(ahora - 600_000),
          },
        ],
      );
      await reservarPedidoEnsayo(
        tx,
        reservas,
        { ...operacion, clave: randomUUID() },
        {
          id: productoId,
          nombre: producto.nombre,
          precio: new Prisma.Decimal(producto.precio),
        },
        2,
      );
    });
    await http()
      .patch(fichaUrl)
      .auth(accessToken, bearer)
      .send({ stock: 100 })
      .expect(400);
    const ficha = await escanear('001234').expect(200);
    expect(ficha.body).toMatchObject({
      productoId,
      codigoBarras: '001234',
      precio: '5.20',
      stockDisponible: 3,
      categoria: { id: categoria.id, nombre: categoria.nombre },
      imagenPrincipal: reemplazo,
    });
    const manual = await http()
      .get(rutaMostrador)
      .auth(accessToken, bearer)
      .query({ q: 'beb-1' })
      .expect(200);
    expect(manual.body).toMatchObject({
      data: [ficha.body as object],
      meta: { total: 1 },
    });
    expect((manual.body as { data: object[] }).data[0]).toEqual(ficha.body);
    await prisma.$transaction(async (tx) => {
      const bloqueado = await app
        .get(InventarioService)
        .bloquearProducto(tx, tenantId, productoId);
      await expect(
        lotes.validarDisponible(tx, bloqueado, 3, new Date()),
      ).resolves.toBeUndefined();
      await expect(
        lotes.validarDisponible(tx, bloqueado, 4, new Date()),
      ).rejects.toMatchObject({ status: 400 });
    });
    const saldos = await http()
      .get(fichaUrl)
      .auth(accessToken, bearer)
      .expect(200);
    expect(saldos.body).toMatchObject({
      stockFisico: 8,
      stockReservado: 2,
      stockDisponible: 3,
      modoInventario: 'LOTES',
    });

    const inventarioUrl = '/inventario/productos';
    const lotesUrl = inventarioUrl + '/' + productoId + '/lotes';
    const movimientosUrl = inventarioUrl + '/' + productoId + '/movimientos';
    const existencias = await http()
      .get(inventarioUrl)
      .auth(accessToken, bearer)
      .query({ q: 'BEB-1', activo: true, limite: 1 })
      .expect(200);
    expect(existencias.body).toMatchObject({
      data: [
        { productoId, stockFisico: 8, stockReservado: 2, stockDisponible: 3 },
      ],
      meta: { total: 1, limite: 1 },
    });
    const soloVendibles = await http()
      .get(lotesUrl)
      .auth(accessToken, bearer)
      .expect(200);
    const { data: lotesMostrador } = soloVendibles.body as {
      data: Record<string, unknown>[];
    };
    expect(lotesMostrador).toHaveLength(1);
    expect(lotesMostrador[0]).toEqual({
      loteId: lotesMostrador[0].loteId,
      codigo: 'VIGENTE',
      vencimiento: null,
      cantidadDisponible: 3,
    });
    const vencidos = await http()
      .get(lotesUrl)
      .auth(accessToken, bearer)
      .query({ soloVendibles: false, limite: 1 })
      .expect(200);
    expect(vencidos.body).toMatchObject({
      data: [{ codigo: 'VENCIDO', cantidadDisponible: 0 }],
      meta: { total: 2, paginas: 2 },
    });
    await http().get(lotesUrl).auth(tokenAjeno, bearer).expect(404);
    await http().get(movimientosUrl).auth(tokenAjeno, bearer).expect(404);
    await http()
      .get(lotesUrl)
      .auth(accessToken, bearer)
      .query({ incluirCostos: true })
      .expect(403);
    await http()
      .get(movimientosUrl)
      .auth(accessToken, bearer)
      .query({ incluirCostos: true })
      .expect(403);
    const historial = await http()
      .get(movimientosUrl)
      .auth(accessToken, bearer)
      .query({
        tipo: 'ENTRADA',
        limite: 1,
        desde: new Date(ahora - 10000).toISOString(),
      })
      .expect(200);
    const historialPublico = historial.body as { data: object[] };
    expect(historial.body).toMatchObject({ meta: { total: 2, paginas: 2 } });
    expect(historialPublico.data[0]).not.toHaveProperty('costoUnitario');
    expect(historialPublico.data[0]).not.toHaveProperty('costoTotal');
    expect(historialPublico.data[0]).not.toHaveProperty('claveIdempotencia');

    const asignacion = await prisma.asignacionRol.findUniqueOrThrow({
      where: {
        tenantId_membresiaId: { tenantId, membresiaId: context.membresiaId },
      },
    });
    const costo = permisos.find(
      ({ codigo }) => codigo === 'store.inventory.cost.read',
    )!;
    await prisma.rolPermiso.create({
      data: { tenantId, rolId: asignacion.rolId, permisoId: costo.id },
    });
    const lotesConCosto = await http()
      .get(lotesUrl)
      .auth(accessToken, bearer)
      .query({ incluirCostos: true })
      .expect(200);
    expect(lotesConCosto.body).toMatchObject({
      data: [{ costoUnitario: '1.0000' }],
    });
    const movimientosConCosto = await http()
      .get(movimientosUrl)
      .auth(accessToken, bearer)
      .query({ incluirCostos: true, tipo: 'ENTRADA', limite: 1 })
      .expect(200);
    expect(movimientosConCosto.body).toMatchObject({
      data: [{ costoUnitario: '1.0000', costoTotal: '3.0000', deltaFisico: 3 }],
    });

    const auditoria = jest
      .spyOn(app.get(AuditoriaEscrituraService), 'registrar')
      .mockImplementationOnce(() => {
        throw new Error('Fallo de auditoría de producto');
      })
      .mockImplementationOnce(() => {
        throw new Error('Fallo de auditoría de imagen');
      });
    try {
      await http()
        .patch(fichaUrl)
        .auth(accessToken, bearer)
        .send({ precio: '99.00' })
        .expect(500);
      await http().delete(imagenUrl).auth(accessToken, bearer).expect(500);
    } finally {
      auditoria.mockRestore();
    }
    expect((await escanear('001234').expect(200)).body).toMatchObject({
      precio: '5.20',
      imagenPrincipal: { id: primeraImagen.id, ...reemplazo },
    });
    await http().delete(imagenUrl).auth(accessToken, bearer).expect(204);
    expect((await escanear('001234').expect(200)).body).toMatchObject({
      imagenPrincipal: secundaria.body as object,
    });
    const eventosImagen = await prisma.auditoriaOperacion.findMany({
      where: {
        tenantId,
        entidadTipo: 'ProductoImagen',
        entidadId: primeraImagen.id,
      },
      orderBy: { id: 'asc' },
    });
    expect(eventosImagen.map(({ accion }) => accion)).toEqual([
      ACCIONES_AUDITORIA.IMAGENES_CREAR,
      ACCIONES_AUDITORIA.IMAGENES_EDITAR,
      ACCIONES_AUDITORIA.IMAGENES_ELIMINAR,
    ]);
    expect(JSON.stringify(eventosImagen)).not.toContain(reemplazo.url);

    const owner = await crearPerfilComercial(tenantId, 'OWNER', [], 'OWNER');
    const cajero = await crearPerfilComercial(
      tenantId,
      'CAJERO',
      [
        'store.cash.open',
        'store.sales.create',
        'store.returns.write',
        'store.sales.void',
      ],
      'CAJERO',
    );
    const abrirTurno = async (codigo: string, operador: AccesoTienda) => {
      const caja = await http()
        .post('/caja')
        .auth(owner.accessToken, bearer)
        .send({ codigo, nombre: 'Caja de ensayo' })
        .expect(201);
      const turno = await http()
        .post(`/caja/${(caja.body as { id: number }).id}/turnos`)
        .auth(operador.accessToken, bearer)
        .set('Idempotency-Key', randomUUID())
        .send({ fondoInicial: '5' })
        .expect(201);
      return (turno.body as { recursoId: number }).recursoId;
    };
    const turnoId = await abrirTurno('MOSTRADOR', owner);
    const otroTurnoId = await abrirTurno('MOSTRADOR2', cajero);
    const loteId = (lotesMostrador[0] as { loteId: number }).loteId;
    const datos = {
      turnoId,
      lineas: [{ productoId, cantidad: 3, lotes: [{ loteId, cantidad: 3 }] }],
      pago: { metodo: 'EFECTIVO', monto: '15.609' },
    };
    const vender = (
      clave: string,
      body: object = datos,
      token = owner.accessToken,
    ) =>
      http()
        .post('/ventas')
        .auth(token, bearer)
        .set('Idempotency-Key', clave)
        .send(body);
    await vender(randomUUID(), datos, accessToken).expect(403);
    await vender(randomUUID(), { ...datos, descuento: '1' }).expect(400);
    await vender(randomUUID(), {
      ...datos,
      pago: { ...datos.pago, monto: '15.59' },
    }).expect(400);

    const auditService = app.get<AuditoriaEscrituraService>(
      AuditoriaEscrituraService,
    );
    const registrarAuditoria = auditService.registrar.bind(
      auditService,
    ) as AuditoriaEscrituraService['registrar'];
    const fallaVenta = jest
      .spyOn(auditService, 'registrar')
      .mockImplementation((tx, actor, evento) => {
        if (evento.accion === ACCIONES_AUDITORIA.VENTAS_REGISTRAR) {
          throw new Error('Fallo al auditar la venta');
        }
        return registrarAuditoria(tx, actor, evento);
      });
    const clave = randomUUID();
    try {
      await vender(clave).expect(500);
    } finally {
      fallaVenta.mockRestore();
    }
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.cobro.count({ where: { tenantId } })).toBe(0);
    expect(
      await prisma.movimientoCaja.count({ where: { tenantId, turnoId } }),
    ).toBe(0);
    expect((await escanear('001234').expect(200)).body).toMatchObject({
      stockDisponible: 3,
    });

    const otraClave = randomUUID();
    const resultados = await Promise.all([
      vender(clave),
      vender(otraClave, { ...datos, turnoId: otroTurnoId }, cajero.accessToken),
    ]);
    expect(resultados.map(({ status }) => status).sort()).toEqual([201, 400]);
    const venta = resultados.find(({ status }) => status === 201)!;
    const { recursoId: ventaId } = venta.body as { recursoId: number };
    const fechaAuditoria = new Date();
    const historialVenta = await http()
      .get('/auditoria')
      .auth(owner.accessToken, bearer)
      .query({
        desde: new Date(fechaAuditoria.getTime() - 60_000).toISOString(),
        hasta: new Date(fechaAuditoria.getTime() + 60_000).toISOString(),
        accion: 'ventas.registrar',
        productoId,
      })
      .expect(200);
    const {
      data: [registroVenta],
    } = historialVenta.body as { data: { correlacionId: string }[] };
    const auditoriaVenta = await http()
      .get(`/auditoria/${registroVenta.correlacionId}`)
      .auth(owner.accessToken, bearer)
      .expect(200);
    expect(auditoriaVenta.body).toMatchObject({
      eventos: expect.arrayContaining([
        expect.objectContaining({
          accion: 'ventas.registrar',
          entidad: { tipo: 'Venta', id: ventaId },
          productoIds: [productoId],
        }),
      ]) as unknown,
    });
    const ganoPrimero = resultados[0].status === 201;
    const claveExitosa = ganoPrimero ? clave : otraClave;
    const turnoVendido = ganoPrimero ? turnoId : otroTurnoId;
    const vendedor = ganoPrimero ? owner : cajero;
    await vender(
      claveExitosa,
      {
        ...datos,
        turnoId: turnoVendido,
        pago: { ...datos.pago, monto: '15.60' },
      },
      vendedor.accessToken,
    ).expect(201, venta.body as object);
    const detalleVenta = await prisma.venta.findUniqueOrThrow({
      where: { tenantId_id: { tenantId, id: ventaId } },
      include: {
        detalleVenta_venta: {
          include: { asignacionLoteVenta_detalleVenta: true },
        },
      },
    });
    expect(detalleVenta).toMatchObject({
      total: new Prisma.Decimal('15.60'),
      descuento: new Prisma.Decimal(0),
      impuesto: new Prisma.Decimal(0),
      detalleVenta_venta: [
        {
          productoId,
          precioUnitario: new Prisma.Decimal('5.20'),
          cantidad: 3,
          asignacionLoteVenta_detalleVenta: [{ loteId, cantidad: 3 }],
        },
      ],
    });
    expect(await prisma.cobro.count({ where: { tenantId } })).toBe(1);
    expect(
      await prisma.cuentaPorCobrar.count({ where: { tenantId, ventaId } }),
    ).toBe(0);
    await expect(
      lotes.consultarTotalPerdidas(
        prisma,
        tenantId,
        new Date(fechaAuditoria.getTime() - 60_000),
        new Date(fechaAuditoria.getTime() + 60_000),
      ),
    ).resolves.toEqual({ totalPerdidas: '0.0000' });
    expect(
      await prisma.movimientoCaja.count({
        where: { tenantId, turnoId: turnoVendido },
      }),
    ).toBe(1);
    expect((await escanear('001234').expect(200)).body).toMatchObject({
      stockDisponible: 0,
    });
    const asignacionVentaId =
      detalleVenta.detalleVenta_venta[0].asignacionLoteVenta_detalleVenta[0].id;
    const [pagoOriginal] = await prisma.aplicacionCobro.findMany({
      where: { tenantId, ventaId },
      select: { id: true },
    });
    const retorno = {
      ventaId,
      motivo: 'Resultado de inspección',
      turnos: { reembolso: turnoVendido },
      lineas: [{ asignacionVentaId, cantidad: 1, destino: 'REINTEGRO_APTO' }],
    };
    const liberar = (aplicacionId: number, monto = '5.20') => [
      { aplicacionId, monto, reembolso: { metodo: 'EFECTIVO' } },
    ];
    const devolver = (
      body: object,
      clave = randomUUID(),
      token = vendedor.accessToken,
    ): request.Test =>
      http()
        .post('/devoluciones')
        .auth(token, bearer)
        .set('Idempotency-Key', clave)
        .send(body);
    const datosApta = { ...retorno, liberar: liberar(pagoOriginal.id) };
    await devolver(datosApta, randomUUID(), accessToken).expect(403);
    await devolver({
      ...datosApta,
      liberar: liberar(pagoOriginal.id, '5.21'),
    }).expect(409);
    const claveApta = randomUUID();
    const apta = await devolver(datosApta, claveApta).expect(201);
    await devolver(datosApta, claveApta).expect(201, apta.body as object);
    expect((await escanear('001234').expect(200)).body).toMatchObject({
      stockDisponible: 1,
    });

    const [aplicacionRestante] = await prisma.aplicacionCobro.findMany({
      where: {
        tenantId,
        ventaId,
        reversionAplicacionCobro_aplicacion: { none: {} },
      },
      select: { id: true },
    });
    const datosDaniada = {
      ...retorno,
      lineas: [{ asignacionVentaId, cantidad: 1, destino: 'BAJA_NO_APTO' }],
      liberar: liberar(aplicacionRestante.id),
    };
    const daniada = await devolver(datosDaniada).expect(201);
    const { recursoId: idDaniada } = daniada.body as { recursoId: number };
    const consulta = await http()
      .get(`/devoluciones/${idDaniada}`)
      .auth(owner.accessToken, bearer)
      .expect(200);
    expect(consulta.body).toMatchObject({
      total: '5.2',
      detalleDevolucionVenta_devolucion: [
        { cantidad: 1, destino: 'BAJA_NO_APTO' },
      ],
      reembolso_devolucion: [{ metodo: 'EFECTIVO', monto: '5.2' }],
    });
    expect((await escanear('001234').expect(200)).body).toMatchObject({
      stockDisponible: 1,
    });
    const [detalleDaniado] = (
      consulta.body as {
        detalleDevolucionVenta_devolucion: { id: number }[];
      }
    ).detalleDevolucionVenta_devolucion;
    const whereRetorno = { tenantId, detalleDevolucionId: detalleDaniado.id };
    expect(
      await prisma.movimientoInventario.count({
        where: { ...whereRetorno, tipo: 'DEVOLUCION', deltaFisico: 1 },
      }),
    ).toBe(1);
    expect(
      await prisma.movimientoInventario.count({
        where: { ...whereRetorno, tipo: 'BAJA', deltaFisico: -1 },
      }),
    ).toBe(1);
    await devolver({
      ...retorno,
      lineas: [{ asignacionVentaId, cantidad: 2, destino: 'REINTEGRO_APTO' }],
      liberar: liberar(aplicacionRestante.id),
    }).expect(409);
    const lista = await http()
      .get('/devoluciones')
      .query({ ventaId })
      .auth(owner.accessToken, bearer)
      .expect(200);
    expect(lista.body).toHaveLength(2);
    const vistaRetorno = await http()
      .get(`/devoluciones/ventas/${ventaId}`)
      .auth(owner.accessToken, bearer)
      .expect(200);
    expect(vistaRetorno.body).toMatchObject({
      asignaciones: [
        { asignacionVentaId, cantidadVendida: 3, cantidadRestante: 1 },
      ],
      aplicaciones: [{ monto: '5.2' }],
    });
    const filtrosAnalisis = {
      desde: fechaComercial(detalleVenta.fecha),
      hasta: fechaComercial(new Date(Date.now() + 86_400_000)),
      productoId,
      cajeroId: vendedor.context.membresiaId,
      granularidad: 'mes',
    };
    const consultarAnalisis = (): request.Test =>
      http()
        .get('/ventas/analisis')
        .auth(owner.accessToken, bearer)
        .query(filtrosAnalisis);
    const netoConDevoluciones = await consultarAnalisis().expect(200);
    expect(netoConDevoluciones.body).toMatchObject({
      neto: '5.2',
      ventas: 1,
      ticketPromedio: '5.2',
      productos: [{ productoId, neto: '5.2', unidades: 1 }],
      cajeros: [
        { responsableId: vendedor.context.membresiaId, neto: '5.2', ventas: 1 },
      ],
    });
    const consultarFinanzas = (): request.Test =>
      http()
        .get('/finanzas/resumen')
        .auth(owner.accessToken, bearer)
        .query({ desde: filtrosAnalisis.desde, hasta: filtrosAnalisis.hasta });
    const finanzasDevueltas = await consultarFinanzas().expect(200);
    expect(finanzasDevueltas.body).toEqual({
      ventasNetas: '5.2',
      costoNetoVendido: '1',
      utilidadBruta: '4.2',
      dineroRecibido: '15.6',
      dineroDevuelto: '10.4',
      flujoCobros: '5.2',
      gastosComerciales: '0',
      perdidasInventario: '1',
      resultadoOperativoEstimado: '3.2',
    });
    const descargar = (ruta: string, token = owner.accessToken): request.Test =>
      http()
        .get('/exportaciones/' + ruta)
        .auth(token, bearer)
        .buffer(true)
        .parse((respuesta, terminar) => {
          const partes: Buffer[] = [];
          respuesta.on('data', (parte: Buffer) => partes.push(parte));
          respuesta.on('end', () => terminar(null, Buffer.concat(partes)));
          respuesta.on('error', terminar);
        });
    const periodoExportar = {
      desde: filtrosAnalisis.desde,
      hasta: filtrosAnalisis.hasta,
    };
    const exportadorSolo = await crearPerfilComercial(
      tenantId,
      'EXPORTA_SOLO',
      ['store.reports.export'],
      'EMPLEADO',
    );
    const lectorAnalisis = await crearPerfilComercial(
      tenantId,
      'LEE_ANALISIS',
      ['store.sales.analytics.read'],
      'EMPLEADO',
    );
    await http()
      .get('/exportaciones/ventas/xlsx')
      .query(periodoExportar)
      .expect(401);
    await descargar('ventas/csv').query(periodoExportar).expect(400);
    await descargar('ventas/xlsx', exportadorSolo.accessToken)
      .query(periodoExportar)
      .expect(403);
    await descargar('ventas/pdf', lectorAnalisis.accessToken)
      .query(periodoExportar)
      .expect(403);
    await descargar(`caja/turnos/${turnoVendido}/pdf`).expect(409);
    const descargasPrevias = await Promise.all([
      descargar('ventas/xlsx')
        .query(filtrosAnalisis)
        .expect(200)
        .expect('Content-Type', /spreadsheetml/)
        .expect('Content-Disposition', 'attachment; filename="ventas.xlsx"'),
      descargar('ventas/pdf')
        .query(filtrosAnalisis)
        .expect(200)
        .expect('Content-Type', /application\/pdf/),
      descargar('finanzas/xlsx')
        .query(periodoExportar)
        .expect(200)
        .expect('Content-Type', /spreadsheetml/),
      descargar('finanzas/pdf')
        .query(periodoExportar)
        .expect(200)
        .expect('Content-Type', /application\/pdf/),
    ]);
    const [xlsxVentas, pdfVentas, xlsxFinanzas, pdfFinanzas] =
      descargasPrevias.map(({ body }) => body as Buffer);
    const verificarPdf = (bytes: Buffer, titulo: string, contenido: RegExp) => {
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes.subarray(-32).toString()).toContain('%%EOF');
      expect(bytes.includes(Buffer.from(titulo))).toBe(true);
      // PDF.js carga un worker ESM. Se abre en Node fuera de la VM de Jest.
      const lectura = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          [
            "import { readFileSync } from 'node:fs';",
            "import { PDFParse } from 'pdf-parse';",
            'const lector = new PDFParse({ data: readFileSync(0) });',
            'try { process.stdout.write((await lector.getText()).text); }',
            'finally { await lector.destroy(); }',
          ].join('\n'),
        ],
        { input: bytes, encoding: 'utf8', timeout: 5000, windowsHide: true },
      );
      if (lectura.error) throw lectura.error;
      if (lectura.status !== 0) throw new Error(lectura.stderr);
      expect(lectura.stdout).toContain(titulo);
      expect(lectura.stdout).toMatch(contenido);
    };
    verificarPdf(pdfVentas, 'Reporte de ventas', /Ventas netas[^\n]*5\.2/);
    verificarPdf(
      pdfFinanzas,
      'Reporte de finanzas',
      /Resultado operativo estimado[^\n]*3\.2/,
    );
    const hojasVentas = await readExcelFile(xlsxVentas);
    expect(
      hojasVentas.find(({ sheet }) => sheet === 'Filtros')?.data,
    ).toContainEqual(['Producto', productoId]);
    expect(
      hojasVentas.find(({ sheet }) => sheet === 'Resumen')?.data,
    ).toContainEqual(['Ventas netas', 5.2]);
    const hojasFinanzas = await readExcelFile(xlsxFinanzas);
    expect(
      hojasFinanzas.find(({ sheet }) => sheet === 'Finanzas')?.data,
    ).toContainEqual(['Resultado operativo estimado', 3.2]);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.reembolso.count({ where: { tenantId, ventaId } })).toBe(
      2,
    );
    const periodoPanel = {
      desde: filtrosAnalisis.desde,
      hasta: filtrosAnalisis.hasta,
    };
    const consultarPanel = (
      token: string,
      periodo = periodoPanel,
    ): request.Test => http().get('/panel').auth(token, bearer).query(periodo);
    await http().get('/panel').query(periodoPanel).expect(401);
    await consultarPanel(accessToken).expect(403);
    await consultarPanel(owner.accessToken, {
      ...periodoPanel,
      hasta: periodoPanel.desde,
    }).expect(400);
    const panel = await consultarPanel(owner.accessToken).expect(200);
    expect(panel.body).toMatchObject({
      ventas: { estado: 'DISPONIBLE', datos: { neto: '5.2', ventas: 1 } },
      finanzas: {
        estado: 'DISPONIBLE',
        datos: { resultadoOperativoEstimado: '3.2', perdidasInventario: '1' },
      },
      cartera: {
        estado: 'DISPONIBLE',
        datos: { saldoPendiente: '0', cuentas: [], deudores: [] },
      },
      inventario: {
        estado: 'DISPONIBLE',
        datos: { data: [{ productoId, stockDisponible: 1 }] },
      },
      personal: { estado: 'DISPONIBLE', datos: { sinRol: 0 } },
      actividad: { estado: 'DISPONIBLE' },
      caja: { estado: 'DISPONIBLE' },
    });
    const operadorPanel = await crearPerfilComercial(
      tenantId,
      'PANEL_LIMITADO',
      ['store.panel.read', 'store.cash.read'],
      'EMPLEADO',
    );
    const panelLimitado = await consultarPanel(
      operadorPanel.accessToken,
    ).expect(200);
    expect(panelLimitado.body).toEqual({
      caja: {
        estado: 'DISPONIBLE',
        datos: (
          await http().get('/caja').auth(owner.accessToken, bearer).expect(200)
        ).body as unknown,
      },
      ventas: { estado: 'SIN_ACCESO' },
      cartera: { estado: 'SIN_ACCESO' },
      finanzas: { estado: 'SIN_ACCESO' },
      inventario: { estado: 'SIN_ACCESO' },
      personal: { estado: 'SIN_ACCESO' },
      actividad: { estado: 'SIN_ACCESO' },
    });
    const falloInventario = jest
      .spyOn(app.get(InventarioTiendaService), 'listarProductos')
      .mockRejectedValueOnce(new Error('Error de inventario de ensayo'));
    try {
      const parcial = await consultarPanel(owner.accessToken).expect(200);
      expect(parcial.body).toMatchObject({
        inventario: { estado: 'ERROR' },
        ventas: { estado: 'DISPONIBLE' },
      });
      expect(
        (parcial.body as { inventario: object }).inventario,
      ).not.toHaveProperty('datos');
    } finally {
      falloInventario.mockRestore();
    }
    const [pagoRemanente] = (
      vistaRetorno.body as { aplicaciones: { id: number }[] }
    ).aplicaciones;
    const anular = (body: object, clave = randomUUID()): request.Test =>
      http()
        .post(`/ventas/${ventaId}/anulacion`)
        .auth(vendedor.accessToken, bearer)
        .set('Idempotency-Key', clave)
        .send(body);
    await anular({ motivo: '   ' }).expect(400);
    await anular({
      motivo: 'Venta errónea',
      liberar: [{ aplicacionId: pagoRemanente.id, monto: '5.20' }],
    }).expect(400);
    const sinRetorno = {
      motivo: 'Venta errónea sin más mercancía retornada',
      turnos: { reembolso: turnoVendido },
      liberar: liberar(pagoRemanente.id),
    };
    const claveAnulacion = randomUUID();
    const anulada = await anular(sinRetorno, claveAnulacion).expect(201);
    expect(anulada.body).toMatchObject({
      recursoTipo: 'Venta',
      recursoId: ventaId,
      efectos: {
        devolucionId: null,
        cuentaCanceladaId: null,
        comprobanteId: null,
        movimientos: [],
      },
    });
    await anular(sinRetorno, claveAnulacion).expect(
      201,
      anulada.body as object,
    );
    await anular(sinRetorno).expect(409);
    const finanzasAnuladas = await consultarFinanzas().expect(200);
    expect(finanzasAnuladas.body).toEqual({
      ventasNetas: '0',
      costoNetoVendido: '0',
      utilidadBruta: '0',
      dineroRecibido: '15.6',
      dineroDevuelto: '15.6',
      flujoCobros: '0',
      gastosComerciales: '0',
      perdidasInventario: '2',
      resultadoOperativoEstimado: '-2',
    });
    const netoTrasAnulacion = await consultarAnalisis().expect(200);
    expect(netoTrasAnulacion.body).toMatchObject({
      neto: '0',
      ventas: 0,
      ticketPromedio: '0',
      productos: [],
      cajeros: [],
    });
    const ventasAnuladas = await http()
      .get('/ventas')
      .auth(owner.accessToken, bearer)
      .query({
        desde: filtrosAnalisis.desde,
        hasta: filtrosAnalisis.hasta,
        productoId,
        estado: 'ANULADA',
      })
      .expect(200);
    expect(ventasAnuladas.body).toMatchObject([
      { id: ventaId, estado: 'ANULADA' },
    ]);
    expect(await prisma.reembolso.count({ where: { tenantId, ventaId } })).toBe(
      3,
    );
    expect((await escanear('001234').expect(200)).body).toMatchObject({
      stockDisponible: 1,
    });
    await http()
      .post(`/caja/turnos/${turnoVendido}/cierre`)
      .auth(owner.accessToken, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({ efectivoContado: '5.00', motivo: 'Cierre de ensayo' })
      .expect(200);
    expect(
      await prisma.turnoCaja.findUniqueOrThrow({ where: { id: turnoVendido } }),
    ).toMatchObject({
      estado: 'CERRADO',
      efectivoEsperado: new Prisma.Decimal('5.00'),
      diferencia: new Prisma.Decimal(0),
    });
    const exportadorCaja = await crearPerfilComercial(
      tenantId,
      'EXPORTA_CAJA',
      ['store.cash.read', 'store.reports.export'],
      'EMPLEADO',
    );
    const ajenoExporter = await crearPerfilComercial(
      tenantAjeno,
      'OWNER',
      [],
      'OWNER',
    );
    await descargar(
      `caja/turnos/${turnoVendido}/xlsx`,
      exportadorCaja.accessToken,
    ).expect(403);
    await descargar(
      `caja/turnos/${turnoVendido}/xlsx`,
      ajenoExporter.accessToken,
    ).expect(404);
    const cierreXlsx = await descargar(`caja/turnos/${turnoVendido}/xlsx`)
      .expect(200)
      .expect('Content-Type', /spreadsheetml/);
    const cierrePdf = await descargar(`caja/turnos/${turnoVendido}/pdf`)
      .expect(200)
      .expect('Content-Type', /application\/pdf/);
    verificarPdf(
      cierrePdf.body as Buffer,
      'Cierre de caja',
      /Efectivo contado[^\n]*5/,
    );
    const [hojaCierre] = await readExcelFile(cierreXlsx.body as Buffer);
    expect(hojaCierre.data).toContainEqual(['Efectivo contado', 5]);
    expect(hojaCierre.data).toContainEqual(['Diferencia', 0]);
  }, 25000);

  it('concilia crédito, abonos concurrentes, reversiones y reembolsos', async () => {
    const { id: tenantId } = await crearNegocio({
      autorizacionVersion: 'PERMISOS',
    });
    const ajeno = await crearNegocio({ autorizacionVersion: 'PERMISOS' });
    const owner = await crearPerfilComercial(tenantId, 'OWNER', [], 'OWNER');
    const cajero = await crearPerfilComercial(
      tenantId,
      'CAJERO',
      ['store.sales.create'],
      'CAJERO',
    );
    const cliente = await prisma.clienteComercial.create({
      data: { tenantId, nombres: 'Comprador a crédito' },
    });
    const clienteAjeno = await prisma.clienteComercial.create({
      data: { tenantId: ajeno.id, nombres: 'Otro comprador' },
    });
    const producto = await prisma.producto.create({
      data: {
        tenantId,
        nombre: 'Producto financiado',
        precio: 100,
        stock: 2,
        estado: true,
      },
    });
    const inventario = app.get<InventarioLotesService>(InventarioLotesService);
    const claveEntrada = randomUUID();
    const loteId = await prisma.$transaction(async (tx): Promise<number> => {
      const { lotes } = await inventario.registrarEntrada(
        tx,
        {
          tenantId,
          responsableId: owner.context.membresiaId,
          clave: claveEntrada,
          correlacionId: claveEntrada,
        },
        producto.id,
        'APERTURA',
        'Inventario de ensayo',
        [
          {
            codigo: 'CREDITO',
            cantidad: 2,
            costoUnitario: new Prisma.Decimal(40),
          },
        ],
      );
      return lotes[0].id;
    });
    const bearer = { type: 'bearer' } as const;
    const caja = await http()
      .post('/caja')
      .auth(owner.accessToken, bearer)
      .send({ codigo: 'CREDITO', nombre: 'Caja de crédito' })
      .expect(201);
    const turno = await http()
      .post(`/caja/${(caja.body as { id: number }).id}/turnos`)
      .auth(owner.accessToken, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({ fondoInicial: '0' })
      .expect(201);
    const turnoId = (turno.body as { recursoId: number }).recursoId;
    const datos = {
      turnoId,
      clienteComercialId: cliente.id,
      vencimiento: '2099-03-05',
      lineas: [
        {
          productoId: producto.id,
          cantidad: 1,
          lotes: [{ loteId, cantidad: 1 }],
        },
      ],
    };
    const vender = (
      body: object,
      clave = randomUUID(),
      token = owner.accessToken,
    ) =>
      http()
        .post('/ventas/credito')
        .auth(token, bearer)
        .set('Idempotency-Key', clave)
        .send(body);
    await vender(datos, randomUUID(), cajero.accessToken).expect(403);
    await vender({ ...datos, clienteComercialId: null }).expect(400);
    await vender({ ...datos, clienteComercialId: clienteAjeno.id }).expect(404);
    await vender({ ...datos, vencimiento: '2099-02-30' }).expect(400);
    await vender({ ...datos, vencimiento: '2000-01-01' }).expect(400);
    await vender({
      ...datos,
      pago: { metodo: 'EFECTIVO', monto: '100' },
    }).expect(400);

    const claveCreditoTotal = randomUUID();
    const fallo = jest
      .spyOn(app.get(AuditoriaEscrituraService), 'registrar')
      .mockImplementationOnce(() => {
        throw new Error('Fallo al auditar el crédito');
      });
    try {
      await vender(datos, claveCreditoTotal).expect(500);
    } finally {
      fallo.mockRestore();
    }
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.cuentaPorCobrar.count({ where: { tenantId } })).toBe(0);
    expect(
      await prisma.loteInventario.findUniqueOrThrow({ where: { id: loteId } }),
    ).toMatchObject({ cantidadFisica: 2 });

    const parcial = { ...datos, pago: { metodo: 'EFECTIVO', monto: '20.009' } };
    const claveParcial = randomUUID();
    const ventaParcial = await vender(parcial, claveParcial).expect(201);
    await vender(parcial, claveParcial).expect(
      201,
      ventaParcial.body as object,
    );
    const ventaTotal = await vender(datos, claveCreditoTotal).expect(201);
    const idParcial = (ventaParcial.body as { recursoId: number }).recursoId;
    const idTotal = (ventaTotal.body as { recursoId: number }).recursoId;
    const cuentas = await prisma.cuentaPorCobrar.findMany({
      where: { tenantId },
      orderBy: { ventaId: 'asc' },
    });
    expect(cuentas).toHaveLength(2);
    expect(cuentas).toMatchObject([
      {
        ventaId: idParcial,
        clienteComercialId: cliente.id,
        estado: 'ABIERTA',
        importeFinanciadoInicial: new Prisma.Decimal(80),
        importeExigible: new Prisma.Decimal(80),
        saldo: new Prisma.Decimal(80),
        vencimiento: new Date('2099-03-05T05:00:00.000Z'),
      },
      {
        ventaId: idTotal,
        clienteComercialId: cliente.id,
        estado: 'ABIERTA',
        importeFinanciadoInicial: new Prisma.Decimal(100),
        importeExigible: new Prisma.Decimal(100),
        saldo: new Prisma.Decimal(100),
      },
    ]);
    const aplicaciones = await prisma.aplicacionCobro.findMany({
      where: { tenantId },
    });
    expect(aplicaciones).toHaveLength(1);
    expect(aplicaciones[0]).toMatchObject({
      ventaId: idParcial,
      cuentaId: null,
      monto: new Prisma.Decimal(20),
    });
    expect(
      await prisma.movimientoCaja.count({ where: { tenantId, turnoId } }),
    ).toBe(1);
    expect(
      await prisma.loteInventario.findUniqueOrThrow({ where: { id: loteId } }),
    ).toMatchObject({ cantidadFisica: 0 });

    const cuenta = cuentas[0];
    await prisma.cuentaPorCobrar.update({
      where: { id: cuenta.id },
      data: { vencimiento: new Date('2000-01-01T20:00:00.000Z') },
    });
    const ownerAjeno = await crearPerfilComercial(
      ajeno.id,
      'OWNER',
      [],
      'OWNER',
    );
    const cartera = (ruta = '', operador = owner) =>
      http()
        .get('/cartera' + ruta)
        .auth(operador.accessToken, bearer);
    await cartera('', cajero).expect(403);
    await cartera('/' + cuenta.id, ownerAjeno).expect(404);
    await cartera().query({ vencida: 'no' }).expect(400);
    const vencidas = await cartera()
      .query({ vencida: true, hasta: '2000-01-01' })
      .expect(200);
    expect(vencidas.body).toEqual([
      expect.objectContaining({ id: cuenta.id, saldo: '80' }),
    ]);
    const resumen = await cartera('/resumen')
      .query({ clienteComercialId: cliente.id })
      .expect(200);
    expect(resumen.body).toEqual({
      saldoVigente: '100',
      saldoVencido: '80',
      saldoPendiente: '180',
    });
    const detalleVencido = await cartera('/' + cuenta.id).expect(200);
    expect(
      (detalleVencido.body as { diasMora: number }).diasMora,
    ).toBeGreaterThan(0);

    const abonar = (monto: string, clave: string) =>
      http()
        .post('/cobros')
        .auth(owner.accessToken, bearer)
        .set('Idempotency-Key', clave)
        .send({
          cuentaId: cuenta.id,
          ventaId: idParcial,
          metodo: 'TRANSFERENCIA',
          monto,
        });
    const claveAbono = randomUUID();
    const otraClaveAbono = randomUUID();
    const abonos = await Promise.all([
      abonar('60', claveAbono),
      abonar('60', otraClaveAbono),
    ]);
    expect(abonos.map(({ status }) => status).sort()).toEqual([201, 409]);
    await abonar(
      '60',
      abonos[0].status === 201 ? claveAbono : otraClaveAbono,
    ).expect(201);
    const detalleParcial = await cartera('/' + cuenta.id).expect(200);
    expect(detalleParcial.body).toMatchObject({
      estado: 'ABIERTA',
      saldo: '20',
    });
    await abonar('20', randomUUID()).expect(201);
    const pagada = await cartera('/' + cuenta.id).expect(200);
    expect(pagada.body).toMatchObject({
      estado: 'PAGADA',
      saldo: '0',
      diasMora: 0,
      aplicacionCobro_cuenta: [{ monto: '60' }, { monto: '20' }],
    });
    const resumenFinanciado = await http()
      .get('/finanzas/resumen')
      .auth(owner.accessToken, bearer)
      .query({
        desde: fechaComercial(new Date(Date.now() - 86_400_000)),
        hasta: fechaComercial(new Date(Date.now() + 86_400_000)),
      })
      .expect(200);
    expect(resumenFinanciado.body).toMatchObject({
      ventasNetas: '200',
      dineroRecibido: '100',
      dineroDevuelto: '0',
      costoNetoVendido: '80',
    });
    expect(
      (pagada.body as { aplicacionCobro_cuenta: object[] })
        .aplicacionCobro_cuenta[0],
    ).not.toHaveProperty('claveIdempotencia');
    await cartera('/deudores').expect(200, [
      { clienteComercialId: cliente.id, saldoPendiente: '100' },
    ]);
    await cartera('/resumen', ownerAjeno).expect(200, {
      saldoVigente: '0',
      saldoVencido: '0',
      saldoPendiente: '0',
    });
    const operacionCobro = (
      ruta: string,
      datos: object,
      clave = randomUUID(),
      operador = owner,
    ): request.Test =>
      http()
        .post('/cobros/' + ruta)
        .auth(operador.accessToken, bearer)
        .set('Idempotency-Key', clave)
        .send(datos);
    const abono60 = (
      abonos.find(({ status }) => status === 201)!.body as { recursoId: number }
    ).recursoId;
    const motivo = { motivo: 'Cobro registrado por error' };
    const reversarAbono = abono60 + '/reversion';
    await operacionCobro(reversarAbono, motivo, randomUUID(), cajero).expect(
      403,
    );
    const claveReversion = randomUUID();
    const reversado = await operacionCobro(
      reversarAbono,
      motivo,
      claveReversion,
    ).expect(201);
    await operacionCobro(reversarAbono, motivo, claveReversion).expect(
      201,
      reversado.body as object,
    );
    await operacionCobro(reversarAbono, motivo).expect(409);
    expect((await cartera('/' + cuenta.id).expect(200)).body).toMatchObject({
      estado: 'ABIERTA',
      saldo: '60',
      importeExigible: '80',
    });

    const inicial = aplicaciones[0];
    const corregirInicial = `aplicaciones/${inicial.id}/reversion`;
    const reembolso = {
      aplicacionId: inicial.id,
      motivo: 'Dinero devuelto',
      metodo: 'EFECTIVO',
      turnoId,
      monto: '5',
    };
    await operacionCobro('reembolsos', reembolso).expect(409);
    await operacionCobro(
      corregirInicial,
      motivo,
      randomUUID(),
      ownerAjeno,
    ).expect(404);
    await operacionCobro(corregirInicial, { motivo: '   ' }).expect(400);
    await operacionCobro(corregirInicial, motivo).expect(201);
    await operacionCobro(corregirInicial, motivo).expect(409);
    expect((await cartera('/' + cuenta.id).expect(200)).body).toMatchObject({
      estado: 'ABIERTA',
      saldo: '80',
      importeFinanciadoInicial: '80',
      importeExigible: '100',
      ajusteCuentaPorCobrar_cuenta: [
        { tipo: 'CORRECCION_PAGO_INICIAL', deltaImporte: '20' },
      ],
    });
    await operacionCobro('reembolsos', { ...reembolso, monto: '21' }).expect(
      409,
    );
    const claveReembolso = randomUUID();
    const devuelto = await operacionCobro(
      'reembolsos',
      reembolso,
      claveReembolso,
    ).expect(201);
    await operacionCobro('reembolsos', reembolso, claveReembolso).expect(
      201,
      devuelto.body as object,
    );
    await operacionCobro('reembolsos', { ...reembolso, monto: '16' }).expect(
      409,
    );
    const { recursoId: reembolsoId } = devuelto.body as { recursoId: number };
    expect(
      await prisma.movimientoCaja.count({
        where: { tenantId, turnoId, reembolsoId, tipo: 'SALIDA', monto: 5 },
      }),
    ).toBe(1);
    expect(
      await prisma.movimientoCaja.count({ where: { tenantId, turnoId } }),
    ).toBe(2);
    expect(
      (
        await http()
          .get(`/cobros/${inicial.cobroId}`)
          .auth(owner.accessToken, bearer)
          .expect(200)
      ).body,
    ).toMatchObject({ estado: 'CONFIRMADO', montoDisponible: '15' });
    const [asignacionCredito] = await prisma.asignacionLoteVenta.findMany({
      where: { tenantId, ventaId: idParcial },
      select: { id: true },
    });
    const [abonoVigente] = await prisma.aplicacionCobro.findMany({
      where: {
        tenantId,
        ventaId: idParcial,
        reversionAplicacionCobro_aplicacion: { none: {} },
      },
      select: { id: true },
    });
    await http()
      .post('/devoluciones')
      .auth(owner.accessToken, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({
        ventaId: idParcial,
        motivo: 'Devolución de venta financiada',
        lineas: [
          {
            asignacionVentaId: asignacionCredito.id,
            cantidad: 1,
            destino: 'REINTEGRO_APTO',
          },
        ],
        liberar: [
          {
            aplicacionId: abonoVigente.id,
            monto: '20',
            reembolso: { metodo: 'TRANSFERENCIA' },
          },
        ],
      })
      .expect(201);
    expect((await cartera('/' + cuenta.id).expect(200)).body).toMatchObject({
      estado: 'PAGADA',
      saldo: '0',
      importeExigible: '0',
      importeFinanciadoInicial: '80',
    });

    const cuentaTotal = cuentas[1];
    const abonoTotal = await http()
      .post('/cobros')
      .auth(owner.accessToken, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({
        ventaId: idTotal,
        cuentaId: cuentaTotal.id,
        metodo: 'TRANSFERENCIA',
        monto: '10',
      })
      .expect(201);
    const { recursoId: cobroTotal } = abonoTotal.body as { recursoId: number };
    const [aplicacionTotal] = await prisma.aplicacionCobro.findMany({
      where: { tenantId, cobroId: cobroTotal },
      select: { id: true },
    });
    const [asignacionTotal] = await prisma.asignacionLoteVenta.findMany({
      where: { tenantId, ventaId: idTotal },
      select: { id: true, detalleVentaId: true },
    });
    const emitir = (ventaId: number): request.Test =>
      http()
        .post('/comprobantes')
        .auth(owner.accessToken, bearer)
        .set('Idempotency-Key', randomUUID())
        .send({ ventaId });
    const [emitidoTotal, emitidoParcial] = await Promise.all([
      emitir(idTotal).expect(201),
      emitir(idParcial).expect(201),
    ]);
    const { recursoId: comprobanteId } = emitidoTotal.body as {
      recursoId: number;
    };
    const { recursoId: otroComprobanteId } = emitidoParcial.body as {
      recursoId: number;
    };
    const consultarComprobante = (id: number) =>
      http().get(`/comprobantes/${id}`).auth(owner.accessToken, bearer);
    const previo = (await consultarComprobante(comprobanteId).expect(200))
      .body as {
      numero: string;
      consecutivo: string;
    };
    const otro = (await consultarComprobante(otroComprobanteId).expect(200))
      .body as {
      consecutivo: string;
    };
    expect([previo.consecutivo, otro.consecutivo].sort()).toEqual(['1', '2']);
    const anularCredito = (
      body: object,
      clave = randomUUID(),
      token = owner.accessToken,
    ): request.Test =>
      http()
        .post(`/ventas/${idTotal}/anulacion`)
        .auth(token, bearer)
        .set('Idempotency-Key', clave)
        .send(body);
    const datosAnulacion = {
      motivo: 'Anulación autorizada del crédito',
      lineas: [
        {
          asignacionVentaId: asignacionTotal.id,
          cantidad: 1,
          destino: 'REINTEGRO_APTO',
        },
      ],
      liberar: [{ aplicacionId: aplicacionTotal.id, monto: '10' }],
    };
    await anularCredito(
      datosAnulacion,
      randomUUID(),
      cajero.accessToken,
    ).expect(403);
    await anularCredito({ ...datosAnulacion, liberar: [] }).expect(409);
    const claveAnulacion = randomUUID();
    const falloDocumento = jest
      .spyOn(app.get(AnulacionComprobanteService), 'anularDeVenta')
      .mockRejectedValueOnce(
        new Error('Fallo al anular el comprobante de ensayo'),
      );
    try {
      await anularCredito(datosAnulacion, claveAnulacion).expect(500);
    } finally {
      falloDocumento.mockRestore();
    }
    expect(
      await prisma.devolucionVenta.count({
        where: { tenantId, ventaId: idTotal },
      }),
    ).toBe(0);
    expect(
      (await cartera('/' + cuentaTotal.id).expect(200)).body,
    ).toMatchObject({ estado: 'ABIERTA', saldo: '90' });

    const anulacion = await anularCredito(
      datosAnulacion,
      claveAnulacion,
    ).expect(201);
    expect(anulacion.body).toMatchObject({
      recursoId: idTotal,
      efectos: {
        cuentaCanceladaId: cuentaTotal.id,
        saldoCancelado: '90.00',
        comprobanteId,
        saldoLiberadoSinReembolso: '10.00',
        reembolsos: [],
      },
    });
    expect(
      (await cartera('/' + cuentaTotal.id).expect(200)).body,
    ).toMatchObject({
      estado: 'CANCELADA',
      saldo: '0',
      importeExigible: '0',
    });
    await cartera('/deudores').expect(200, []);
    expect(
      (await consultarComprobante(comprobanteId).expect(200)).body,
    ).toMatchObject({
      numero: previo.numero,
      consecutivo: previo.consecutivo,
      estado: 'ANULADO',
    });
    await http()
      .get(`/comprobantes/${comprobanteId}/pdf`)
      .auth(owner.accessToken, bearer)
      .expect('Content-Type', /application\/pdf/)
      .expect(200);
    expect(
      await prisma.loteInventario.findUniqueOrThrow({ where: { id: loteId } }),
    ).toMatchObject({ cantidadFisica: 2 });
    expect(
      (
        await http()
          .get(`/cobros/${cobroTotal}`)
          .auth(owner.accessToken, bearer)
          .expect(200)
      ).body,
    ).toMatchObject({ estado: 'CONFIRMADO', montoDisponible: '10' });
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(2);
  });

  it('localiza una venta por ambos productos y revierte venta, existencias y auditoría juntas', async () => {
    const { usuario, credenciales } = await registrarPersonal();
    const { id: tenantId } = await crearNegocio({
      autorizacionVersion: 'PERMISOS',
    });
    const membresia = await vincularPersonal(usuario.id, tenantId);
    const rol = await asignarRol(tenantId, membresia.id);
    const permisos = await prisma.$transaction((tx) =>
      app.get(PermisosService).registrarCatalogo(tx),
    );
    const permisoCatalogo = permisos.find(
      ({ codigo }) => codigo === 'store.catalog.write',
    )!;
    await prisma.rolPermiso.create({
      data: { tenantId, rolId: rol.id, permisoId: permisoCatalogo.id },
    });
    const { context: contexto, accessToken } = await loginTienda(credenciales);
    const bearer = { type: 'bearer' } as const;
    const existe = await http()
      .post(rutaCategorias)
      .auth(accessToken, bearer)
      .send({ nombre: 'Categoría de venta' })
      .expect(201);
    const categoria = existe.body as { id: number; nombre: string };
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
    for (const productoId of productoIds) {
      await http()
        .put(rutaCategoriaProducto(productoId))
        .auth(accessToken, bearer)
        .send({ categoriaId: categoria.id })
        .expect(200);
    }
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
      await app
        .get(InventarioService)
        .bloquearProductos(tx, tenantId, productoIds);
      for (const { productoId, loteId } of items) {
        const snapshot = await app
          .get(CatalogoService)
          .obtenerSnapshotVenta(tx, tenantId, productoId);
        const detalle = await tx.detalleVenta.create({
          data: {
            tenantId,
            ventaId: venta.id,
            ...snapshot,
            cantidad: 1,
            subtotal: snapshot.precioUnitario,
            total: snapshot.precioUnitario,
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
        where: {
          tenantId,
          productoId,
          accion: ACCIONES_AUDITORIA.VENTAS_REGISTRAR,
        },
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
    const edicion = rutaCategorias + '/' + categoria.id;
    await http()
      .patch(edicion)
      .auth(accessToken, bearer)
      .send({ nombre: 'Categoría renombrada' })
      .expect(200);
    await http()
      .patch(edicion)
      .auth(accessToken, bearer)
      .send({ activo: false })
      .expect(200);
    const reemplazo = await http()
      .post(rutaCategorias)
      .auth(accessToken, bearer)
      .send({ nombre: 'Categoría nueva' })
      .expect(201);
    const nuevaCategoria = reemplazo.body as { id: number };
    await http()
      .put(rutaCategoriaProducto(productoIds[0]))
      .auth(accessToken, bearer)
      .send({ categoriaId: nuevaCategoria.id })
      .expect(200);
    await http()
      .put(rutaCategoriaProducto(productoIds[1]))
      .auth(accessToken, bearer)
      .send({ categoriaId: null })
      .expect(200);
    await http()
      .patch(rutaProductos + '/' + productoIds[0])
      .auth(accessToken, bearer)
      .send({ precio: '19.99' })
      .expect(200);
    const vigente = await prisma.$transaction((tx) =>
      app
        .get(CatalogoService)
        .obtenerSnapshotVenta(tx, tenantId, productoIds[0]),
    );
    expect(vigente.precioUnitario.toFixed(2)).toBe('19.99');
    expect(vigente.categoriaId).toBe(nuevaCategoria.id);
    const historico = await prisma.detalleVenta.findMany({
      where: { tenantId, ventaId: venta.id, categoriaId: categoria.id },
      select: {
        categoriaId: true,
        categoriaNombre: true,
        precioUnitario: true,
      },
    });
    expect(historico).toEqual(
      productoIds.map(() => ({
        categoriaId: categoria.id,
        categoriaNombre: categoria.nombre,
        precioUnitario: cero,
      })),
    );
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
  it('Portal: verifica cuentas, reserva, cancela y entrega una sola venta con avisos aislados', async () => {
    const { id: tenantId } = await crearNegocio({
      autorizacionVersion: 'PERMISOS',
    });
    const staff = await crearPerfilComercial(tenantId, 'OWNER', [], 'OWNER');
    const bearer = { type: 'bearer' } as const;
    const auth = staff.accessToken;
    async function comprador() {
      const { credenciales } = await registrarPersonal();
      const ficha = await prisma.clienteComercial.create({
        data: { tenantId, nombres: 'Portal ensayo' },
      });
      const datos = { ...credenciales, tenantId };
      await http().post('/portal/login').send(datos).expect(403);
      const prueba = (
        await http().post('/portal/verificar-cuenta').send(datos).expect(200)
      ).body as { prueba: string };
      await http()
        .post(`/portal/clientes/${ficha.id}/vinculacion`)
        .auth(auth, bearer)
        .send(prueba)
        .expect(201);
      const acceso = (
        await http().post('/portal/login').send(datos).expect(200)
      ).body as { accessToken: string };
      return { ficha, datos, prueba, token: acceso.accessToken };
    }
    const [cliente, otro] = await Promise.all([comprador(), comprador()]);
    const { id: otraTienda } = await crearNegocio({
      autorizacionVersion: 'PERMISOS',
    });
    const otroStaff = await crearPerfilComercial(
      otraTienda,
      'OWNER',
      [],
      'OWNER',
    );
    await http()
      .post('/portal/login')
      .send({ ...cliente.datos, tenantId: otraTienda })
      .expect(403);
    await http()
      .post(`/portal/clientes/${cliente.ficha.id}/vinculacion`)
      .auth(otroStaff.accessToken, bearer)
      .send(cliente.prueba)
      .expect(403);
    await http().get('/portal/historial').auth(auth, bearer).expect(401);
    await http().get('/ventas').auth(cliente.token, bearer).expect(401);
    const producto = await prisma.producto.create({
      data: {
        tenantId,
        nombre: 'Producto portal',
        precio: '5.20',
        stock: 0,
        estado: true,
      },
    });
    const productoId = producto.id;
    await http()
      .post(`/inventario/productos/${productoId}/apertura`)
      .auth(auth, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({
        motivo: 'Apertura de prueba',
        lotes: [],
      })
      .expect(201);
    await http()
      .post(`/inventario/productos/${productoId}/entradas`)
      .auth(auth, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({
        motivo: 'Entrada de prueba',
        lotes: [{ codigo: 'PORTAL', cantidad: 3, costoUnitario: '2.00' }],
      })
      .expect(201);
    const catalogo = await http()
      .get('/portal/catalogo')
      .auth(cliente.token, bearer)
      .expect(200);
    expect(catalogo.body).toMatchObject({
      data: [{ productoId, stockDisponible: 3 }],
    });

    const crearCarrito = async (cantidad: number) => {
      const res = await http()
        .post('/carrito')
        .auth(cliente.token, bearer)
        .send({ lineas: [{ productoId, cantidad }] })
        .expect(201);
      return (res.body as { id: number }).id;
    };
    const confirmar = (carritoId: number, clave = randomUUID()) =>
      http()
        .post('/pedidos')
        .auth(cliente.token, bearer)
        .set('Idempotency-Key', clave)
        .send({ carritoId });
    const saldo = async (stock: number, stockReservado: number) => {
      expect(
        await prisma.producto.findUnique({ where: { id: productoId } }),
      ).toMatchObject({ stock, stockReservado });
    };

    const primerCarrito = await crearCarrito(4);
    await http()
      .get(`/carrito/${primerCarrito}`)
      .auth(otro.token, bearer)
      .expect(404);
    await confirmar(primerCarrito).expect(400);
    await saldo(3, 0);
    await http()
      .patch(`/carrito/${primerCarrito}`)
      .auth(cliente.token, bearer)
      .send({ lineas: [{ productoId, cantidad: 1 }] })
      .expect(200);
    const primerPedido = (await confirmar(primerCarrito).expect(201)).body as {
      recursoId: number;
    };
    await saldo(3, 1);
    await http()
      .delete(`/pedidos/${primerPedido.recursoId}`)
      .auth(otro.token, bearer)
      .send({ motivo: 'Ajeno' })
      .expect(404);
    await http()
      .delete(`/pedidos/${primerPedido.recursoId}`)
      .auth(cliente.token, bearer)
      .send({ motivo: 'Ya no lo necesito' })
      .expect(200);
    await saldo(3, 0);

    const carritoId = await crearCarrito(2);
    const clave = randomUUID();
    const resultado = await Promise.all([
      confirmar(carritoId, clave).expect(201),
      confirmar(carritoId, clave).expect(201),
    ]);
    expect(resultado[0].body).toEqual(resultado[1].body);
    const pedidoId = (resultado[0].body as { recursoId: number }).recursoId;
    await saldo(3, 2);
    await http()
      .get(`/pedidos/operacion/${pedidoId}`)
      .auth(otroStaff.accessToken, bearer)
      .expect(404);
    await http()
      .get(`/pedidos/${pedidoId}`)
      .auth(otro.token, bearer)
      .expect(404);
    await http()
      .get('/pedidos/operacion')
      .auth(cliente.token, bearer)
      .expect(401);
    const pedido = (
      await http()
        .get(`/pedidos/${pedidoId}`)
        .auth(cliente.token, bearer)
        .expect(200)
    ).body as {
      confirmadoAt: string;
      reservaHasta: string;
      total: string;
    };
    expect(
      Date.parse(pedido.reservaHasta) - Date.parse(pedido.confirmadoAt),
    ).toBe(3_600_000);
    expect(pedido.total).toBe('10.4');
    await prisma.producto.update({
      where: { id: productoId },
      data: { precio: '9.00' },
    });
    await http()
      .patch(`/pedidos/${pedidoId}/preparacion`)
      .auth(auth, bearer)
      .expect(200);

    const caja = await http()
      .post('/caja')
      .auth(auth, bearer)
      .send({ codigo: 'PORTAL', nombre: 'Caja portal' })
      .expect(201);
    const cajaId = (caja.body as { id: number }).id;
    const turno = await http()
      .post(`/caja/${cajaId}/turnos`)
      .auth(auth, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({ fondoInicial: '5.00' })
      .expect(201);
    const turnoId = (turno.body as { recursoId: number }).recursoId;
    const lote = await prisma.loteInventario.findFirstOrThrow({
      where: { tenantId, productoId, cantidadFisica: 3 },
    });
    const seleccionar = (cantidad: number, loteId = lote.id) => [
      { productoId, cantidad, lotes: [{ loteId, cantidad }] },
    ];
    const entregar = (
      claveEntrega: string,
      monto = '10.40',
      loteId = lote.id,
    ) =>
      http()
        .post(`/pedidos/${pedidoId}/entrega`)
        .auth(auth, bearer)
        .set('Idempotency-Key', claveEntrega)
        .send({
          turnoId,
          lineas: seleccionar(2, loteId),
          pago: { monto, metodo: 'EFECTIVO' },
        });
    await entregar(randomUUID(), '18.00').expect(400);
    await entregar(randomUUID(), '10.40', 2147483647).expect(404);
    await saldo(3, 2);
    const claveEntrega = randomUUID();
    const entregas = await Promise.all([
      entregar(claveEntrega).expect(200),
      entregar(claveEntrega).expect(200),
    ]);
    expect(entregas[0].body).toEqual(entregas[1].body);
    const ventaId = (entregas[0].body as { recursoId: number }).recursoId;
    await entregar(randomUUID()).expect(409);
    expect(await prisma.venta.count({ where: { tenantId, pedidoId } })).toBe(1);
    expect(
      await prisma.venta.findUnique({ where: { id: ventaId } }),
    ).toMatchObject({
      origen: 'PORTAL',
      total: new Prisma.Decimal('10.40'),
      clienteComercialId: cliente.ficha.id,
    });
    await saldo(1, 0);
    const comprobante = await http()
      .post('/comprobantes')
      .auth(auth, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({ ventaId })
      .expect(201);
    const comprobanteId = (comprobante.body as { recursoId: number }).recursoId;
    await http()
      .get(`/portal/comprobantes/${comprobanteId}/pdf`)
      .auth(cliente.token, bearer)
      .expect(200)
      .expect('Content-Type', /application\/pdf/);
    await http()
      .get(`/portal/comprobantes/${comprobanteId}/pdf`)
      .auth(otro.token, bearer)
      .expect(404);
    await saldo(1, 0);
    const historial = await http()
      .get('/portal/historial')
      .auth(cliente.token, bearer)
      .expect(200);
    expect(historial.body).toMatchObject({
      tienda: { ventas: [{ id: ventaId }], comprobantes: [{ ventaId }] },
    });
    const historialAjeno = await http()
      .get('/portal/historial')
      .auth(otro.token, bearer)
      .expect(200);
    expect(historialAjeno.body).toMatchObject({
      tienda: { ventas: [], comprobantes: [], cuentas: [] },
    });

    const procesador = app.get(NotificacionesService);
    await Promise.all([
      procesador.procesarPendientes(),
      procesador.procesarPendientes(),
    ]);
    await procesador.procesarPendientes();
    const avisos = await http()
      .get('/notificaciones')
      .auth(cliente.token, bearer)
      .expect(200);
    const lista = avisos.body as {
      id: number;
      tipo: string;
      pedidoId: number | null;
    }[];
    expect(lista.filter((aviso) => aviso.pedidoId === pedidoId)).toHaveLength(
      3,
    );
    expect(
      lista.filter((aviso) => aviso.tipo === 'COMPROBANTE_DISPONIBLE'),
    ).toHaveLength(1);
    await http()
      .get(`/notificaciones/${lista[0].id}`)
      .auth(otro.token, bearer)
      .expect(404);
    await http()
      .patch(`/notificaciones/${lista[0].id}`)
      .auth(cliente.token, bearer)
      .expect(200);
    const avisoLeido = await prisma.notificacionCliente.findUniqueOrThrow({
      where: { id: lista[0].id },
    });
    expect(avisoLeido.leidaAt).toBeInstanceOf(Date);

    const pedidoBreve = await prisma.$transaction(async (tx) => {
      const confirmadoAt = new Date();
      const claveBreve = randomUUID();
      const breve = await tx.pedido.create({
        data: {
          tenantId,
          clienteComercialId: cliente.ficha.id,
          numero: claveBreve,
          confirmadoAt,
          reservaHasta: new Date(confirmadoAt.getTime() + 1_200),
          claveIdempotencia: claveBreve,
          subtotal: '9',
          total: '9',
        },
      });
      const linea = await tx.detallePedido.create({
        data: {
          tenantId,
          pedidoId: breve.id,
          productoId,
          nombreProducto: producto.nombre,
          precioUnitario: '9',
          cantidad: 1,
          subtotal: '9',
          total: '9',
        },
      });
      await app.get(ReservasInventarioService).reservar(
        tx,
        {
          tenantId,
          responsableId: null,
          clave: claveBreve,
          correlacionId: claveBreve,
        },
        breve.id,
        linea.id,
      );
      return breve;
    });
    await saldo(1, 1);
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, pedidoBreve.reservaHasta.getTime() - Date.now() + 20),
      ),
    );
    const expirado = await http()
      .get(`/pedidos/${pedidoBreve.id}`)
      .auth(cliente.token, bearer)
      .expect(200);
    expect(expirado.body).toMatchObject({ estado: 'EXPIRADO' });
    await http()
      .post(`/pedidos/${pedidoBreve.id}/entrega`)
      .auth(auth, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({
        turnoId,
        lineas: seleccionar(1),
        pago: { monto: '9', metodo: 'EFECTIVO' },
      })
      .expect(409);
    await saldo(1, 0);

    const carritoCredito = await crearCarrito(1);
    const pedidoCredito = (await confirmar(carritoCredito).expect(201))
      .body as { recursoId: number };
    const entregaCredito = (token: string) =>
      http()
        .post(`/pedidos/${pedidoCredito.recursoId}/entrega`)
        .auth(token, bearer)
        .set('Idempotency-Key', randomUUID())
        .send({
          turnoId,
          vencimiento: fechaComercial(new Date()),
          lineas: seleccionar(1),
        });
    await http()
      .patch(`/pedidos/${pedidoCredito.recursoId}/preparacion`)
      .auth(auth, bearer)
      .expect(200);
    const cajeroSinCredito = await crearPerfilComercial(
      tenantId,
      'CAJERO_PORTAL',
      ['store.sales.create'],
      'CAJERO',
    );
    await entregaCredito(cajeroSinCredito.accessToken).expect(403);
    const credito = await entregaCredito(auth).expect(200);
    const cuenta = await prisma.cuentaPorCobrar.findFirstOrThrow({
      where: {
        tenantId,
        ventaId: (credito.body as { recursoId: number }).recursoId,
      },
    });
    expect(cuenta.saldo.toFixed(2)).toBe('9.00');
    const rutaRecordatorio = `/notificaciones/cartera/${cuenta.id}/recordatorio`;
    await http()
      .post(rutaRecordatorio)
      .auth(cliente.token, bearer)
      .set('Idempotency-Key', randomUUID())
      .expect(401);
    const claveAviso = randomUUID();
    const recordar = () =>
      http()
        .post(rutaRecordatorio)
        .auth(auth, bearer)
        .set('Idempotency-Key', claveAviso);
    const primerAviso = await recordar().expect(201);
    await recordar().expect(201, primerAviso.body as object);
    await procesador.procesarPendientes();
    const avisosCartera = await http()
      .get('/notificaciones')
      .auth(cliente.token, bearer)
      .expect(200);
    const notificacionesCartera = avisosCartera.body as {
      cuentaId: number | null;
      tipo: string;
    }[];
    expect(
      notificacionesCartera.filter(
        ({ cuentaId, tipo }) =>
          cuentaId === cuenta.id && tipo === 'RECORDATORIO_DEUDA',
      ),
    ).toHaveLength(1);
    await http()
      .post(`/caja/turnos/${turnoId}/cierre`)
      .auth(auth, bearer)
      .set('Idempotency-Key', randomUUID())
      .send({ efectivoContado: '15.40' })
      .expect(200);
    const cierre = await prisma.turnoCaja.findUniqueOrThrow({
      where: { id: turnoId },
    });
    expect(cierre.diferencia?.isZero()).toBe(true);

    await http()
      .delete(`/portal/clientes/${cliente.ficha.id}/vinculacion`)
      .auth(auth, bearer)
      .expect(204);
    await http()
      .get('/portal/historial')
      .auth(cliente.token, bearer)
      .expect(401);
    await http()
      .post(`/portal/clientes/${cliente.ficha.id}/vinculacion`)
      .auth(auth, bearer)
      .send(cliente.prueba)
      .expect(409);
  }, 30_000);
});
