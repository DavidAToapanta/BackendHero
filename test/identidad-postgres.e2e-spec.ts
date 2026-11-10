import { randomUUID } from 'node:crypto';
import { PrismaService } from '@app/prisma';
import { getJwtSecret } from '@app/seguridad';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../apps/gym-api/src/app.module';

const suite =
  process.env.IDENTIDAD_POSTGRES_E2E === '1' ? describe : describe.skip;

suite('Identidad de Gym con PostgreSQL', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const anyString: unknown = expect.any(String);
  const anyNumber: unknown = expect.any(Number);

  function ownerRegistration() {
    const suffix = randomUUID();
    return {
      cedula: 'id-' + suffix,
      email: suffix + '@example.test',
      userName: 'owner-' + suffix,
      password: 'clave-solo-de-ensayo',
      nombres: 'Ana',
      apellidos: 'Ensayo',
      tenantNombre: 'Gym ' + suffix,
      tenantSlug: 'gym-' + suffix,
    };
  }

  function verifyJwt(token: string) {
    return new JwtService({ secret: getJwtSecret() }).verify<
      Record<string, unknown> & { iat: number; exp: number }
    >(token);
  }

  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? '');
    if (
      database.hostname !== '127.0.0.1' ||
      database.pathname !== '/hero_identidad_test'
    ) {
      throw new Error(
        'Se requiere la base local desechable hero_identidad_test',
      );
    }
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  it('conserva el alta, las credenciales, los duplicados y la selección de contexto', async () => {
    const owner = ownerRegistration();
    const http = request(app.getHttpServer());
    const registered = await http
      .post('/auth/register-owner')
      .send(owner)
      .expect(201);
    const { access_token: firstToken, tenantId: firstTenant } =
      registered.body as { access_token: string; tenantId: number };
    expect(registered.body).toEqual({
      access_token: anyString,
      tenantId: anyNumber,
      tenantNombre: owner.tenantNombre,
    });
    const account = await prisma.usuario.findUniqueOrThrow({
      where: { cedula: owner.cedula },
      select: { id: true },
    });
    expect(
      await prisma.tenantModule.count({
        where: { tenantId: firstTenant, module: 'GYM', activo: true },
      }),
    ).toBe(1);
    const firstPayload = verifyJwt(firstToken);
    expect(firstPayload).toEqual({
      sub: account.id,
      email: owner.email,
      userName: owner.userName,
      cedula: owner.cedula,
      rol: 'ADMIN',
      tenantId: firstTenant,
      tenantNombre: owner.tenantNombre,
      clienteId: null,
      tenantRole: 'OWNER',
      accessMode: 'PLATFORM',
      iat: anyNumber,
      exp: anyNumber,
    });
    expect(firstPayload.exp - firstPayload.iat).toBe(86400);

    for (const [field, message] of [
      ['cedula', 'Ya existe un usuario con esa cedula'],
      ['userName', 'Ya existe un usuario con ese userName'],
      ['email', 'Ya existe un usuario con ese email'],
    ] as const) {
      await http
        .post('/auth/register-owner')
        .send({ ...ownerRegistration(), [field]: owner[field] })
        .expect(400, {
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
    }

    const credentials = { cedula: owner.cedula, password: owner.password };
    await http
      .post('/auth/login')
      .send({ ...credentials, password: 'otra-clave' })
      .expect(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Contrasena incorrecta',
      });
    await http
      .post('/auth/login')
      .send({ ...credentials, cedula: 'inexistente' })
      .expect(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Cedula no encontrada',
      });
    const direct = await http.post('/auth/login').send(credentials).expect(201);
    expect(direct.body).toEqual({
      access_token: anyString,
      tenantId: firstTenant,
      tenantNombre: owner.tenantNombre,
    });

    const secondTenant = await prisma.tenant.create({
      data: {
        nombre: 'Segundo ' + owner.tenantNombre,
        slug: owner.tenantSlug + '-segundo',
        tipoNegocio: 'GYM',
      },
    });
    await prisma.userTenant.create({
      data: { usuarioId: account.id, tenantId: secondTenant.id, role: 'OWNER' },
    });

    const multiple = await http
      .post('/auth/login')
      .send(credentials)
      .expect(201);
    const { selectionToken } = multiple.body as { selectionToken: string };
    expect(multiple.body).toEqual({
      requiresContextSelection: true,
      requestedAccessMode: 'PLATFORM',
      selectionToken: anyString,
      contexts: [
        { id: firstTenant, nombre: owner.tenantNombre },
        secondTenant,
      ].map((tenant) => ({
        type: 'STAFF',
        tenantId: tenant.id,
        tenantNombre: tenant.nombre,
        clienteId: null,
        tenantRole: 'OWNER',
        allowedModes: ['PLATFORM'],
      })),
    });
    const selectionPayload = verifyJwt(selectionToken);
    expect(selectionPayload).toEqual({
      sub: account.id,
      tokenType: 'CONTEXT_SELECTION',
      iat: anyNumber,
      exp: anyNumber,
    });
    expect(selectionPayload.exp - selectionPayload.iat).toBe(600);
    const selection = {
      selectionToken,
      type: 'STAFF',
      tenantId: secondTenant.id,
      tenantRole: 'OWNER',
      accessMode: 'PLATFORM',
    };
    await http
      .post('/auth/select-context')
      .send({ ...selection, tenantId: -1 })
      .expect(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: 'El contexto seleccionado no pertenece al usuario',
      });
    await http
      .post('/auth/select-context')
      .send({ ...selection, selectionToken: firstToken })
      .expect(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Selection token invalido',
      });
    const selected = await http
      .post('/auth/select-context')
      .send(selection)
      .expect(201);
    const { access_token: selectedToken } = selected.body as {
      access_token: string;
    };
    expect(selected.body).toEqual({
      access_token: anyString,
      tenantId: secondTenant.id,
      tenantNombre: secondTenant.nombre,
    });
    const selectedPayload = verifyJwt(selectedToken);
    expect(selectedPayload).toEqual({
      ...firstPayload,
      tenantId: secondTenant.id,
      tenantNombre: secondTenant.nombre,
      iat: anyNumber,
      exp: anyNumber,
    });
    expect(selectedPayload.exp - selectedPayload.iat).toBe(86400);
  }, 30000);

  it('revierte la cuenta y el gimnasio si PostgreSQL rechaza la vinculación', async () => {
    const owner = ownerRegistration();
    const missingUserId = -1;
    expect(await prisma.usuario.count({ where: { id: missingUserId } })).toBe(
      0,
    );
    const transact = prisma.$transaction.bind(
      prisma,
    ) as PrismaService['$transaction'];
    let attemptedLink: { usuarioId: number; tenantId: number } | undefined;
    let constraintError: unknown;
    const runTransaction = (
      register: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      transact(async (tx) => {
        const membership: {
          create(args: Prisma.UserTenantCreateArgs): Promise<{ id: number }>;
        } = tx.userTenant;
        const create = membership.create.bind(
          membership,
        ) as typeof membership.create;
        const fault = jest
          .spyOn(membership, 'create')
          .mockImplementationOnce(async (args) => {
            const account = await tx.usuario.findUniqueOrThrow({
              where: { cedula: owner.cedula },
            });
            const tenant = await tx.tenant.findUniqueOrThrow({
              where: { slug: owner.tenantSlug },
            });
            attemptedLink = { usuarioId: account.id, tenantId: tenant.id };
            expect(args.data).toMatchObject(attemptedLink);
            try {
              return await create({
                data: {
                  usuarioId: missingUserId,
                  tenantId: tenant.id,
                  role: args.data.role,
                  estado: args.data.estado,
                },
              });
            } catch (error) {
              constraintError = error;
              throw error;
            }
          });
        try {
          return await register(tx);
        } finally {
          fault.mockRestore();
        }
      });
    const transactionSpy = jest
      .spyOn(prisma, '$transaction')
      .mockImplementationOnce(runTransaction as typeof prisma.$transaction);
    try {
      await request(app.getHttpServer())
        .post('/auth/register-owner')
        .send(owner)
        .expect(500);
    } finally {
      transactionSpy.mockRestore();
    }

    expect(constraintError).toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    expect(constraintError).toMatchObject({ code: 'P2003' });
    expect(attemptedLink).toBeDefined();
    expect(
      await prisma.usuario.findUnique({ where: { cedula: owner.cedula } }),
    ).toBeNull();
    expect(
      await prisma.tenant.findUnique({ where: { slug: owner.tenantSlug } }),
    ).toBeNull();
  }, 30000);
});
