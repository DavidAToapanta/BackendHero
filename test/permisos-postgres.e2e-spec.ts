import { randomUUID } from 'node:crypto';
import { MembresiasPersonalService } from '@app/negocios';
import {
  AsignacionesRolService,
  CATALOGO_PERMISOS,
  PermisosModule,
  PermisosService,
  PreparacionPermisosService,
  RolesNegocioService,
  type ContextoPermisos,
} from '@app/permisos';
import { PrismaService } from '@app/prisma';
import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma, TenantRole } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';

@Controller('ensayo-permisos')
class EnsayoPermisosController {
  constructor(
    private readonly permisos: PermisosService,
    private readonly jwt: JwtService,
  ) {}

  @Get('personal')
  async consultarPersonal(@Headers('authorization') header?: string) {
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }
    const contexto = await this.jwt
      .verifyAsync<ContextoPermisos>(header.slice(7))
      .catch(() => {
        throw new UnauthorizedException();
      });
    await this.permisos.autorizar(contexto, 'gym.staff.read');
    return { autorizado: true };
  }
}

const suite =
  process.env.PERMISOS_POSTGRES_E2E === '1' ? describe : describe.skip;

suite('Roles y permisos con PostgreSQL', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let permisos: PermisosService;
  let preparacion: PreparacionPermisosService;
  let roles: RolesNegocioService;
  let asignaciones: AsignacionesRolService;

  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? '');
    if (
      database.hostname !== '127.0.0.1' ||
      database.pathname !== '/hero_permisos_test'
    ) {
      throw new Error(
        'Se requiere la base local desechable hero_permisos_test',
      );
    }
    const modulo = await Test.createTestingModule({
      imports: [PermisosModule, JwtModule.register({ secret: randomUUID() })],
      controllers: [EnsayoPermisosController],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    permisos = app.get(PermisosService);
    preparacion = app.get(PreparacionPermisosService);
    roles = app.get(RolesNegocioService);
    asignaciones = app.get(AsignacionesRolService);
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  async function fixture() {
    const slug = 'permisos-' + randomUUID();
    const tenant = await prisma.tenant.create({
      data: {
        nombre: slug,
        slug,
        tipoNegocio: 'MIXTO',
        modules: { create: [{ module: 'GYM' }, { module: 'STORE' }] },
      },
    });
    const agregar = (role: TenantRole) =>
      prisma.userTenant.create({
        data: {
          role,
          tenant: { connect: { id: tenant.id } },
          usuario: {
            create: {
              cedula: randomUUID(),
              nombres: 'Ensayo',
              apellidos: 'Permisos',
              password: 'dato-de-prueba',
            },
          },
        },
      });
    const owner = await agregar('OWNER');
    const admin = await agregar('ADMIN');
    const empleado = await agregar('EMPLEADO');
    return { tenant, owner, admin, empleado };
  }

  async function contexto(id: number): Promise<ContextoPermisos> {
    const fila = await prisma.userTenant.findUniqueOrThrow({ where: { id } });
    return {
      membresiaId: id,
      tenantId: fila.tenantId,
      usuarioId: fila.usuarioId,
      versionAutorizacion: fila.versionAutorizacion,
    };
  }

  const consultar = (token: string) =>
    request(app.getHttpServer())
      .get('/ensayo-permisos/personal')
      .auth(token, { type: 'bearer' });

  it('prepara en LEGACY sin sobrescribir asignaciones ni cambiar el modo', async () => {
    const { tenant, owner, admin, empleado } = await fixture();
    await expect(
      preparacion.preparar(await contexto(admin.id)),
    ).rejects.toThrow(ForbiddenException);
    const primera = await preparacion.preparar(await contexto(owner.id));
    expect(primera).toEqual({
      tenantId: tenant.id,
      modo: 'LEGACY',
      rolesCreados: Object.values(TenantRole).length,
      asignacionesCreadas: 3,
      discrepancias: [],
    });
    const actor = await contexto(owner.id);
    const rol = await roles.crear(actor, {
      codigo: 'lectura',
      nombre: 'Lectura',
      permisos: ['gym.staff.read'],
    });
    const asignacion = await asignaciones.asignar(actor, empleado.id, rol.id);
    const empleadoAsignado = await contexto(empleado.id);
    expect(await preparacion.preparar(actor)).toEqual({
      tenantId: tenant.id,
      modo: 'LEGACY',
      rolesCreados: 0,
      asignacionesCreadas: 0,
      discrepancias: [
        {
          membresiaId: empleado.id,
          rolLegacy: 'EMPLEADO',
          rolAsignado: 'LECTURA',
        },
      ],
    });
    expect(await contexto(empleado.id)).toEqual(empleadoAsignado);
    expect(
      await prisma.asignacionRol.findUnique({
        where: {
          tenantId_membresiaId: {
            tenantId: tenant.id,
            membresiaId: empleado.id,
          },
        },
      }),
    ).toMatchObject({
      id: asignacion?.id,
      rolId: rol.id,
      asignadorId: owner.id,
    });
    expect(
      await prisma.tenant.findUnique({ where: { id: tenant.id } }),
    ).toMatchObject({ autorizacionVersion: 'LEGACY' });
    expect(await prisma.permiso.count()).toBe(CATALOGO_PERMISOS.length);
    await consultar(jwt.sign(empleadoAsignado)).expect(403);
  });

  it('aplica el techo de delegación, protección de OWNER y aislamiento por negocio', async () => {
    const { tenant, owner, admin, empleado } = await fixture();
    const otro = await fixture();
    await preparacion.preparar(await contexto(owner.id));
    await preparacion.preparar(await contexto(otro.owner.id));
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { autorizacionVersion: 'PERMISOS' },
    });
    const actor = await contexto(owner.id);
    const gestor = await contexto(admin.id);
    const lectura = await roles.crear(gestor, {
      codigo: 'lector',
      nombre: 'Lector',
      permisos: ['gym.staff.read'],
    });
    const mayor = await roles.crear(actor, {
      codigo: 'editor',
      nombre: 'Editor',
      permisos: ['gym.staff.write'],
    });
    const ownerRol = await prisma.rolNegocio.findUniqueOrThrow({
      where: { tenantId_codigo: { tenantId: tenant.id, codigo: 'OWNER' } },
    });
    const otroRol = await prisma.rolNegocio.findUniqueOrThrow({
      where: { tenantId_codigo: { tenantId: otro.tenant.id, codigo: 'ADMIN' } },
    });
    await expect(
      roles.editar(gestor, mayor.id, { permisos: [] }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      roles.crear(gestor, {
        codigo: 'admin2',
        nombre: 'Admin 2',
        permisos: ['gym.roles.manage'],
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      roles.editar(actor, ownerRol.id, { activo: false }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      asignaciones.asignar(actor, empleado.id, ownerRol.id),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      asignaciones.asignar(gestor, gestor.membresiaId, lectura.id),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      asignaciones.asignar(actor, otro.empleado.id, lectura.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      asignaciones.asignar(actor, empleado.id, otroRol.id),
    ).rejects.toThrow(NotFoundException);

    // OWNER prepara la primera sustitución de un rol protegido.
    await asignaciones.asignar(actor, empleado.id, lectura.id);
    const antes = await contexto(empleado.id);
    await asignaciones.asignar(gestor, empleado.id, lectura.id);
    expect(await contexto(empleado.id)).toEqual(antes);
    await expect(
      asignaciones.asignar(gestor, empleado.id, mayor.id),
    ).rejects.toThrow(ForbiddenException);
    await consultar(jwt.sign(antes)).expect(200, { autorizado: true });
    await permisos.autorizar(actor, 'store.catalog.read');
    await prisma.tenantModule.update({
      where: { tenantId_module: { tenantId: tenant.id, module: 'STORE' } },
      data: { activo: false },
    });
    await expect(
      permisos.autorizar(actor, 'store.catalog.read'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      roles.crear(gestor, {
        codigo: 'tienda',
        nombre: 'Tienda',
        permisos: ['store.catalog.read'],
      }),
    ).rejects.toThrow(ForbiddenException);
    await asignaciones.retirar(gestor, empleado.id);
    await consultar(jwt.sign(await contexto(empleado.id))).expect(403);
  }, 30000);

  it('revalida estado, rol y versión mediante la ruta de ensayo', async () => {
    const { tenant, owner, empleado } = await fixture();
    await preparacion.preparar(await contexto(owner.id));
    const actor = await contexto(owner.id);
    const rol = await roles.crear(actor, {
      codigo: 'lector',
      nombre: 'Lector',
      permisos: ['gym.staff.read'],
    });
    await asignaciones.asignar(actor, empleado.id, rol.id);
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { autorizacionVersion: 'PERMISOS' },
    });
    const original = await contexto(empleado.id);
    const membresias = new MembresiasPersonalService(prisma);
    const id = empleado.id;
    await consultar(jwt.sign(original)).expect(200);
    await membresias.cambiarRol(id, tenant.id, 'EMPLEADO');
    await membresias.cambiarEstado(id, tenant.id, 'ACTIVO');
    expect(await contexto(id)).toEqual(original);
    await membresias.cambiarRol(id, tenant.id, 'CAJERO');
    await consultar(jwt.sign(original)).expect(403);
    const vigente = await contexto(id);
    await consultar(jwt.sign(vigente)).expect(200);

    await membresias.cambiarEstado(id, tenant.id, 'INACTIVO');
    await consultar(jwt.sign(await contexto(id))).expect(403);
    const reactivacion = {
      usuarioId: empleado.usuarioId,
      tenantId: tenant.id,
      role: 'CAJERO',
      estado: 'ACTIVO',
    } as const;
    await membresias.asegurar(reactivacion);
    await consultar(jwt.sign(vigente)).expect(403);
    const trasReactivacion = await contexto(id);
    await membresias.asegurar(reactivacion);
    expect(await contexto(id)).toEqual(trasReactivacion);
    await consultar(jwt.sign(trasReactivacion)).expect(200);
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { estado: 'SUSPENDIDO' },
    });
    await consultar(jwt.sign(trasReactivacion)).expect(403);
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { estado: 'ACTIVO' },
    });
    await roles.editar(actor, rol.id, { activo: false });
    await consultar(jwt.sign(trasReactivacion)).expect(403);
    await consultar(jwt.sign(await contexto(id))).expect(403);
  });

  it('revierte permisos y versiones juntos cuando PostgreSQL rechaza la escritura', async () => {
    const { tenant, owner, empleado } = await fixture();
    await preparacion.preparar(await contexto(owner.id));
    const actor = await contexto(owner.id);
    const rol = await roles.crear(actor, {
      codigo: 'lector',
      nombre: 'Lector',
      permisos: ['gym.staff.read'],
    });
    await asignaciones.asignar(actor, empleado.id, rol.id);
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { autorizacionVersion: 'PERMISOS' },
    });
    const anterior = await contexto(empleado.id);
    const transact = prisma.$transaction.bind(
      prisma,
    ) as PrismaService['$transaction'];
    const runTransaction = (
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      transact(
        async (tx) => {
          await callback(tx);
          const interno = await tx.userTenant.findUniqueOrThrow({
            where: { id: empleado.id },
          });
          expect(interno.versionAutorizacion).toBe(
            anterior.versionAutorizacion + 1,
          );
          const relaciones = await tx.rolPermiso.findMany({
            where: { tenantId: tenant.id, rolId: rol.id },
            include: { permiso: true },
          });
          expect(relaciones.map(({ permiso }) => permiso.codigo)).toEqual([
            'gym.staff.write',
          ]);
          return tx.rolPermiso.create({
            data: { tenantId: tenant.id, rolId: rol.id, permisoId: -1 },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    const spy = jest
      .spyOn(prisma, '$transaction')
      .mockImplementationOnce(runTransaction as typeof prisma.$transaction);
    try {
      await expect(
        roles.editar(actor, rol.id, { permisos: ['gym.staff.write'] }),
      ).rejects.toMatchObject({ code: 'P2003' });
    } finally {
      spy.mockRestore();
    }
    expect(await contexto(empleado.id)).toEqual(anterior);
    await consultar(jwt.sign(anterior)).expect(200);
    await roles.editar(actor, rol.id, { permisos: ['gym.staff.write'] });
    expect((await contexto(empleado.id)).versionAutorizacion).toBe(
      anterior.versionAutorizacion + 1,
    );
    await consultar(jwt.sign(anterior)).expect(403);
    await consultar(jwt.sign(await contexto(empleado.id))).expect(403);
  });
});
