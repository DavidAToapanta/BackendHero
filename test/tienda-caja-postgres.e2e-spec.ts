import { randomUUID } from 'node:crypto';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CajaModule } from '../apps/tienda-api/src/caja/caja.module';
import { CajaService } from '../apps/tienda-api/src/caja/caja.service';
import type { ContextoOperacionTienda } from '../apps/tienda-api/src/comun/operacion-tienda';

const suite =
  process.env.TIENDA_CAJA_POSTGRES_E2E === '1' ? describe : describe.skip;

suite('Apertura de caja con PostgreSQL', () => {
  const prisma = new PrismaService();
  let modulo: TestingModule;
  let caja: CajaService;
  let contexto: ContextoOperacionTienda;
  let otroTenant: number;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/hero_tienda_caja_test'
    ) {
      throw new Error('Se requiere PostgreSQL local hero_tienda_caja_test');
    }
    modulo = await Test.createTestingModule({ imports: [CajaModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    caja = modulo.get(CajaService);
    const crearTenant = () =>
      prisma.tenant.create({
        data: {
          nombre: 'Negocio de ensayo',
          slug: randomUUID(),
          tipoNegocio: 'MIXTO',
        },
      });
    const { id: tenantId } = await crearTenant();
    otroTenant = (await crearTenant()).id;
    const { id: usuarioId } = await crearUsuario();
    const { id: membresiaId } = await prisma.userTenant.create({
      data: { tenantId, usuarioId, role: 'OWNER' },
    });
    contexto = {
      tenantId,
      usuarioId,
      membresiaId,
      auditar: () => Promise.resolve(),
    };
  });

  afterAll(async () => {
    await modulo?.close();
    await prisma.$disconnect();
  });

  function crearUsuario() {
    return prisma.usuario.create({
      data: {
        nombres: 'Usuario',
        apellidos: 'Ensayo',
        cedula: randomUUID(),
        password: 'solo-ensayo',
      },
    });
  }

  function crearCaja(activo = true) {
    return caja.configurar(contexto, {
      codigo: randomUUID(),
      nombre: 'Caja de ensayo',
      activo,
    });
  }

  it('permite una sola apertura concurrente con claves distintas', async () => {
    const creada = await crearCaja();
    const intentos = await Promise.allSettled([
      caja.abrirTurno(contexto, creada.id, '20.00', randomUUID()),
      caja.abrirTurno(contexto, creada.id, '20.00', randomUUID()),
    ]);
    expect(intentos.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const fallido = intentos.find(
      (resultado) => resultado.status === 'rejected',
    );
    expect(fallido?.reason).toBeInstanceOf(ConflictException);
    const turno = await caja.turnoActivo(contexto.tenantId, creada.id);
    expect(turno?.fondoInicial.toFixed(2)).toBe('20.00');
    await expect(
      prisma.turnoCaja.count({
        where: { tenantId: contexto.tenantId, cajaId: creada.id },
      }),
    ).resolves.toBe(1);
    const disponibles = await caja.listarCajas(contexto.tenantId, true);
    expect(disponibles.find(({ id }) => id === creada.id)).toBeUndefined();
    await expect(
      caja.configurar(
        contexto,
        { codigo: creada.codigo, nombre: creada.nombre, activo: false },
        creada.id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('devuelve el mismo turno y conserva una sola escritura ante un doble envío', async () => {
    const creada = await crearCaja();
    const clave = randomUUID();
    const [primero, segundo] = await Promise.all([
      caja.abrirTurno(contexto, creada.id, '10', clave),
      caja.abrirTurno(contexto, creada.id, '10.00', clave),
    ]);
    expect(primero).toEqual(segundo);
    await expect(
      prisma.turnoCaja.count({
        where: { tenantId: contexto.tenantId, cajaId: creada.id },
      }),
    ).resolves.toBe(1);
    await expect(
      caja.abrirTurno(contexto, creada.id, '11', clave),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza fondos inválidos, cajas inactivas y membresías ajenas', async () => {
    const activa = await crearCaja();
    const inactiva = await crearCaja(false);
    await expect(
      caja.abrirTurno(contexto, inactiva.id, '0', randomUUID()),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      caja.abrirTurno(contexto, activa.id, '-1', randomUUID()),
    ).rejects.toBeInstanceOf(BadRequestException);
    const usuario = await crearUsuario();
    const membresia = await prisma.userTenant.create({
      data: { tenantId: otroTenant, usuarioId: usuario.id, role: 'CAJERO' },
    });
    await expect(
      caja.abrirTurno(
        { ...contexto, usuarioId: usuario.id, membresiaId: membresia.id },
        activa.id,
        '0',
        randomUUID(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      caja.abrirTurno(
        { ...contexto, tenantId: otroTenant },
        activa.id,
        '0',
        randomUUID(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('permite reintentar la apertura si se revierte la transacción de auditoría', async () => {
    const creada = await crearCaja();
    const clave = randomUUID();
    await expect(
      caja.abrirTurno(
        {
          ...contexto,
          auditar: () => Promise.reject(new Error('Fallo de ensayo')),
        },
        creada.id,
        '0',
        clave,
      ),
    ).rejects.toThrow('Fallo de ensayo');
    await expect(
      caja.turnoActivo(contexto.tenantId, creada.id),
    ).resolves.toBeNull();
    const turno = await caja.abrirTurno(contexto, creada.id, '0', clave);
    await expect(
      caja.obtenerTurno(contexto.tenantId, turno.recursoId),
    ).resolves.toMatchObject({ estado: 'ABIERTO' });
    await expect(
      prisma.$transaction((tx) =>
        caja.bloquearTurnoAbierto(
          tx,
          { ...contexto, membresiaId: -1 },
          turno.recursoId,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
