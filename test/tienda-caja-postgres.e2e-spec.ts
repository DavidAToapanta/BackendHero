import { randomUUID } from 'node:crypto';
import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { CajaModule } from '../apps/tienda-api/src/caja/caja.module';
import { CajaService } from '../apps/tienda-api/src/caja/caja.service';
import type { ContextoOperacionTienda } from '../apps/tienda-api/src/comun/operacion-tienda';

const suite =
  process.env.TIENDA_CAJA_POSTGRES_E2E === '1' ? describe : describe.skip;

suite('Caja con PostgreSQL', () => {
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

  async function abrirCaja() {
    const creada = await crearCaja();
    const turno = await caja.abrirTurno(
      contexto,
      creada.id,
      '20',
      randomUUID(),
    );
    return turno.recursoId;
  }

  function registrarCobroDeEnsayo(
    turnoId: number,
    metodo: 'EFECTIVO' | 'TRANSFERENCIA',
  ) {
    const { tenantId, membresiaId } = contexto;
    const monto = new Prisma.Decimal('10');
    const claveRecurso = randomUUID();
    return prisma.$transaction(async (tx) => {
      await caja.bloquearTurnoAbierto(tx, contexto, turnoId);
      const cobro = await tx.cobro.create({
        data: {
          tenantId,
          turnoId,
          responsableId: membresiaId,
          metodo,
          monto,
          claveIdempotencia: claveRecurso,
        },
      });
      if (metodo === 'EFECTIVO') {
        await caja.registrarMovimiento(tx, contexto, {
          turnoId,
          monto,
          motivo: 'Cobro de ensayo',
          claveRecurso,
          origen: { tipo: 'cobro', id: cobro.id },
        });
      }
      return cobro;
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

  it('concilia el fondo y los movimientos de efectivo al cerrar', async () => {
    const turnoId = await abrirCaja();
    const { tenantId } = contexto;
    const entrada = {
      turnoId,
      monto: '5',
      motivo: 'Entrada manual',
      direccion: 'ENTRADA',
    } as const;
    const claveEntrada = randomUUID();
    const original = await caja.moverEfectivo(contexto, entrada, claveEntrada);
    await expect(
      caja.moverEfectivo(contexto, entrada, claveEntrada),
    ).resolves.toEqual(original);
    const salida = {
      turnoId,
      monto: '3',
      motivo: 'Salida manual',
      direccion: 'SALIDA',
    } as const;
    await caja.moverEfectivo(contexto, salida, randomUUID());
    await expect(
      caja.moverEfectivo(contexto, { ...salida, monto: '100' }, randomUUID()),
    ).rejects.toBeInstanceOf(ConflictException);
    await registrarCobroDeEnsayo(turnoId, 'TRANSFERENCIA');
    await registrarCobroDeEnsayo(turnoId, 'EFECTIVO');

    const datosCierre = { turnoId, efectivoContado: '31' };
    const claveCierre = randomUUID();
    const cierre = await caja.cerrarTurno(contexto, datosCierre, claveCierre);
    await expect(
      caja.cerrarTurno(contexto, datosCierre, claveCierre),
    ).resolves.toEqual(cierre);
    const turno = await caja.obtenerTurno(tenantId, turnoId);
    expect(turno.estado).toBe('CERRADO');
    expect(turno.efectivoEsperado?.toFixed(2)).toBe('32.00');
    expect(turno.diferencia?.toFixed(2)).toBe('-1.00');
    await expect(
      caja.listarMovimientos(tenantId, turnoId),
    ).resolves.toHaveLength(3);
    await expect(
      caja.moverEfectivo(contexto, entrada, randomUUID()),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      caja.cerrarTurno(contexto, datosCierre, randomUUID()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('serializa el cobro en efectivo y el cierre sin descuadrar la caja', async () => {
    const turnoId = await abrirCaja();
    const { tenantId } = contexto;
    const [cobro, cierre] = await Promise.allSettled([
      registrarCobroDeEnsayo(turnoId, 'EFECTIVO'),
      caja.cerrarTurno(
        contexto,
        { turnoId, efectivoContado: '20' },
        randomUUID(),
      ),
    ]);
    expect(cierre.status).toBe('fulfilled');
    if (cobro.status === 'rejected')
      expect(cobro.reason).toBeInstanceOf(ConflictException);
    const cobrado = cobro.status === 'fulfilled';
    await expect(
      caja.listarMovimientos(tenantId, turnoId),
    ).resolves.toHaveLength(cobrado ? 1 : 0);
    await expect(
      prisma.cobro.count({ where: { tenantId, turnoId } }),
    ).resolves.toBe(cobrado ? 1 : 0);
    const turno = await caja.obtenerTurno(tenantId, turnoId);
    expect(turno.efectivoEsperado?.toFixed(2)).toBe(
      cobrado ? '30.00' : '20.00',
    );
  });

  it('solo permite cerrar un turno ajeno cuando el llamador autoriza la supervisión', async () => {
    const turnoId = await abrirCaja();
    const { id: usuarioId } = await crearUsuario();
    const { id: membresiaId } = await prisma.userTenant.create({
      data: { tenantId: contexto.tenantId, usuarioId, role: 'ADMIN' },
    });
    const supervisor = { ...contexto, usuarioId, membresiaId };
    const datos = { turnoId, efectivoContado: '20' };
    const clave = randomUUID();
    await expect(
      caja.cerrarTurno(supervisor, datos, clave),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await caja.cerrarTurno(supervisor, datos, clave, true);
    await expect(
      caja.obtenerTurno(contexto.tenantId, turnoId),
    ).resolves.toMatchObject({
      estado: 'CERRADO',
      cerradoPorId: membresiaId,
    });
  });
});
