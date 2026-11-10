import { randomUUID } from 'node:crypto';
import { CategoriasProductoService } from '@app/catalogo';
import { PrismaService } from '@app/prisma';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../apps/gym-api/src/app.module';

const suite =
  process.env.NEGOCIOS_POSTGRES_E2E === '1' ? describe : describe.skip;

suite('Negocios y personal de Gym con PostgreSQL', () => {
  type Owner = { access_token: string; tenantId: number };
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: Owner;
  let otherOwner: Owner;
  let ownerId: number;
  const anyNumber: unknown = expect.any(Number);

  async function registerOwner() {
    const suffix = randomUUID();
    const response = await request(app.getHttpServer())
      .post('/auth/register-owner')
      .send({
        cedula: 'owner-' + suffix,
        password: 'clave-solo-de-ensayo',
        nombres: 'Propietario',
        apellidos: 'Ensayo',
        email: suffix + '@example.test',
        tenantNombre: 'Gym ' + suffix,
      })
      .expect(201);
    return response.body as Owner;
  }

  function staffRegistration() {
    const suffix = randomUUID();
    return {
      cedula: 'staff-' + suffix,
      email: suffix + '@example.test',
      nombres: 'Personal',
      apellidos: 'Ensayo',
      password: 'clave-solo-de-ensayo',
    };
  }

  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? '');
    if (
      database.hostname !== '127.0.0.1' ||
      database.pathname !== '/hero_negocios_test'
    ) {
      throw new Error(
        'Se requiere la base local desechable hero_negocios_test',
      );
    }
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);
    owner = await registerOwner();
    otherOwner = await registerOwner();
    const membership = await prisma.userTenant.findFirstOrThrow({
      where: { tenantId: owner.tenantId, role: 'OWNER' },
      select: { usuarioId: true },
    });
    ownerId = membership.usuarioId;
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  it('conserva alta, detalle, plan y reglas de módulos de los negocios', async () => {
    const http = request(app.getHttpServer());
    const token = owner.access_token;
    const slug = 'mixto-' + randomUUID();
    const created = await http
      .post('/tenants')
      .auth(token, { type: 'bearer' })
      .send({
        nombre: 'Negocio mixto',
        slug,
        tipoNegocio: 'MIXTO',
        ownerUserId: ownerId,
      })
      .expect(201);
    const { id } = created.body as { id: number };
    expect(created.body).toMatchObject({
      id: anyNumber,
      slug,
      tipoNegocio: 'MIXTO',
      saasPlan: 'FREE',
      modules: [
        { tenantId: id, module: 'GYM', activo: true },
        { tenantId: id, module: 'STORE', activo: true },
      ],
      users: [
        { usuarioId: ownerId, tenantId: id, role: 'OWNER', estado: 'ACTIVO' },
      ],
    });
    const detail = await http
      .get('/tenants/' + id)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(detail.body).toEqual(created.body);
    const listing = await http
      .get('/tenants')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(listing.body).toContainEqual(created.body);
    const updatePlan = () =>
      http
        .patch('/tenants/' + id + '/saas-plan')
        .auth(token, { type: 'bearer' })
        .send({ saasPlan: 'PLUS' })
        .expect(200);
    const updated = await updatePlan();
    expect(updated.body).toMatchObject({ id, saasPlan: 'PLUS' });
    expect((await updatePlan()).body).toEqual(updated.body);

    const legacy = await http
      .get('/tenants/legacy/default')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(legacy.body).toMatchObject({
      slug: 'gym-principal',
      modules: [{ module: 'GYM', activo: true }],
    });

    const catalogo = app.get(CategoriasProductoService);
    await expect(catalogo.findAll(id, 'STORE')).resolves.toEqual([]);
    await expect(
      catalogo.findAll(owner.tenantId, 'STORE'),
    ).rejects.toMatchObject({
      status: 403,
      message: 'El módulo no está habilitado para el negocio',
    });
    await prisma.tenantModule.update({
      where: { tenantId_module: { tenantId: id, module: 'STORE' } },
      data: { activo: false },
    });
    await expect(catalogo.findAll(id, 'STORE')).rejects.toMatchObject({
      status: 403,
    });
    await expect(catalogo.findAll(id, 'GYM')).resolves.toEqual([]);
  });

  it('reutiliza la cuenta y limita el rol y el estado al negocio autenticado', async () => {
    const http = request(app.getHttpServer());
    const token = owner.access_token;
    const staff = staffRegistration();
    const alta = await http
      .post('/staff')
      .auth(token, { type: 'bearer' })
      .send({
        ...staff,
        tenantRole: 'ENTRENADOR',
        horario: '08:00-12:00',
        sueldo: 400,
      })
      .expect(201);
    const { usuarioId } = alta.body as { usuarioId: number };
    expect(alta.body).toMatchObject({
      usuarioId: anyNumber,
      tenantId: owner.tenantId,
      tenantRole: 'ENTRENADOR',
      estado: 'ACTIVO',
      horario: '08:00-12:00',
      sueldo: 400,
      usuario: { id: usuarioId, cedula: staff.cedula },
    });
    expect(alta.body).not.toHaveProperty('usuario.password');
    const path = '/staff/' + usuarioId;
    const tokenB = otherOwner.access_token;
    await http.get(path).auth(tokenB, { type: 'bearer' }).expect(404);
    const reused = await http
      .post('/staff')
      .auth(tokenB, { type: 'bearer' })
      .send({ ...staff, tenantRole: 'CAJERO' })
      .expect(201);
    expect(reused.body).toMatchObject({
      usuarioId,
      tenantId: otherOwner.tenantId,
      tenantRole: 'CAJERO',
    });

    const changed = await http
      .patch(path)
      .auth(token, { type: 'bearer' })
      .send({ tenantRole: 'EMPLEADO' })
      .expect(200);
    expect(changed.body).toMatchObject({
      usuarioId,
      tenantId: owner.tenantId,
      tenantRole: 'EMPLEADO',
      horario: null,
      sueldo: null,
    });
    const inactive = await http
      .patch(path + '/inactivar')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(inactive.body).toMatchObject({ estado: 'INACTIVO' });
    const stillActive = await http
      .get(path)
      .auth(tokenB, { type: 'bearer' })
      .expect(200);
    expect(stillActive.body).toEqual(reused.body);
    const filtered = await http
      .get('/staff?role=EMPLEADO&estado=INACTIVO')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(filtered.body).toEqual([inactive.body]);
    const active = await http
      .patch(path + '/reactivar')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(active.body).toMatchObject({ estado: 'ACTIVO' });
  });

  it.each([false, true])(
    'revierte el alta si PostgreSQL rechaza el perfil (cuenta reutilizada %s)',
    async (reused) => {
      const http = request(app.getHttpServer());
      const staff = staffRegistration();
      const missingTenantId = -1;
      const tenantId = owner.tenantId;
      expect(
        await prisma.tenant.count({ where: { id: missingTenantId } }),
      ).toBe(0);
      if (reused) {
        await http
          .post('/staff')
          .auth(otherOwner.access_token, { type: 'bearer' })
          .send({ ...staff, tenantRole: 'CAJERO' })
          .expect(201);
      }
      const transact = prisma.$transaction.bind(
        prisma,
      ) as PrismaService['$transaction'];
      let usuarioId: number | undefined;
      let dbError: unknown;
      const runTransaction = (
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        transact(async (tx) => {
          const profile: {
            create(
              args: Prisma.StaffProfileCreateArgs,
            ): Promise<{ id: number }>;
          } = tx.staffProfile;
          const create = profile.create.bind(profile) as typeof profile.create;
          const fault = jest
            .spyOn(profile, 'create')
            .mockImplementationOnce(async ({ data }) => {
              const account = await tx.usuario.findUniqueOrThrow({
                where: { cedula: staff.cedula },
              });
              usuarioId = account.id;
              const membership = await tx.userTenant.findUniqueOrThrow({
                where: { usuarioId_tenantId: { usuarioId, tenantId } },
              });
              expect(membership.role).toBe('ENTRENADOR');
              try {
                return await create({
                  data: {
                    usuarioId,
                    tenantId: missingTenantId,
                    tenantRole: data.tenantRole,
                    horario: data.horario,
                    sueldo: data.sueldo,
                  },
                });
              } catch (error) {
                dbError = error;
                throw error;
              }
            });
          try {
            return await callback(tx);
          } finally {
            fault.mockRestore();
          }
        });
      const spy = jest
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce(runTransaction as typeof prisma.$transaction);
      try {
        await http
          .post('/staff')
          .auth(owner.access_token, { type: 'bearer' })
          .send({
            ...staff,
            tenantRole: 'ENTRENADOR',
            horario: '08:00-12:00',
            sueldo: 400,
          })
          .expect(500);
      } finally {
        spy.mockRestore();
      }

      expect(dbError).toMatchObject({
        code: 'P2003',
        meta: { constraint: 'StaffProfile_tenantId_fkey' },
      });
      if (usuarioId === undefined) {
        throw new Error('La prueba no llegó a la creación del perfil');
      }
      const account = await prisma.usuario.findUnique({
        where: { cedula: staff.cedula },
      });
      const memberships = await prisma.userTenant.findMany({
        where: { usuarioId },
        select: { tenantId: true, role: true, estado: true },
      });
      expect(
        await prisma.staffProfile.count({ where: { usuarioId, tenantId } }),
      ).toBe(0);
      if (reused) {
        expect(account?.id).toBe(usuarioId);
        expect(memberships).toEqual([
          { tenantId: otherOwner.tenantId, role: 'CAJERO', estado: 'ACTIVO' },
        ]);
      } else {
        expect(account).toBeNull();
        expect(memberships).toEqual([]);
      }
    },
    30000,
  );
});
