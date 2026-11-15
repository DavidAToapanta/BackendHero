import { randomUUID } from 'node:crypto';
import { PrismaService } from '@app/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IdempotenciaModule } from '../apps/tienda-api/src/comun/idempotencia/idempotencia.module';
import {
  IdempotenciaService,
  SolicitudIdempotenteTienda,
} from '../apps/tienda-api/src/comun/idempotencia/idempotencia.service';

const suite =
  process.env.TIENDA_IDEMPOTENCIA_POSTGRES_E2E === '1'
    ? describe
    : describe.skip;

suite('Idempotencia de Tienda con PostgreSQL', () => {
  const prisma = new PrismaService();
  let idempotencia: IdempotenciaService;
  let tenantId: number;
  let otroTenantId: number;
  let usuarioId: number;
  let otroUsuarioId: number;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/hero_tienda_idempotencia_test'
    ) {
      throw new Error(
        'Se requiere la base local hero_tienda_idempotencia_test',
      );
    }

    const modulo = await Test.createTestingModule({
      imports: [IdempotenciaModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    idempotencia = modulo.get(IdempotenciaService);

    const crearTenant = () =>
      prisma.tenant.create({
        data: {
          nombre: 'Ensayo B01',
          slug: randomUUID(),
          tipoNegocio: 'STORE',
        },
      });
    const crearUsuario = () =>
      prisma.usuario.create({
        data: {
          nombres: 'Ensayo',
          apellidos: 'B01',
          cedula: randomUUID(),
          password: 'solo-ensayo',
        },
      });
    tenantId = (await crearTenant()).id;
    otroTenantId = (await crearTenant()).id;
    usuarioId = (await crearUsuario()).id;
    otroUsuarioId = (await crearUsuario()).id;
  });

  afterAll(() => prisma.$disconnect());

  function solicitud(): SolicitudIdempotenteTienda {
    return {
      tenantId,
      usuarioId,
      operacion: 'caja.crear',
      clave: randomUUID(),
      datos: { nombre: 'Caja de ensayo', opciones: { b: true, a: [1, 2] } },
    };
  }

  function escritura(negocioId: number) {
    const ejecutar: Parameters<IdempotenciaService['ejecutar']>[1] = async (
      tx,
      claveRecurso,
    ) => {
      const caja = await tx.caja.create({
        data: { tenantId: negocioId, nombre: 'Ensayo', codigo: claveRecurso },
      });
      return { recursoTipo: 'Caja', recursoId: caja.id };
    };
    return jest.fn(ejecutar);
  }

  it('devuelve la misma referencia aunque cambie el orden de los campos', async () => {
    const peticion = solicitud();
    const escribir = escritura(tenantId);
    const primero = await idempotencia.ejecutar(peticion, escribir);
    const reintento = await idempotencia.ejecutar(
      {
        ...peticion,
        datos: { opciones: { a: [1, 2], b: true }, nombre: 'Caja de ensayo' },
      },
      escribir,
    );
    expect(reintento).toEqual(primero);
    expect(escribir).toHaveBeenCalledTimes(1);
  });

  it('rechaza otros datos para la misma clave', async () => {
    const peticion = solicitud();
    const escribir = escritura(tenantId);
    await idempotencia.ejecutar(peticion, escribir);
    await expect(
      idempotencia.ejecutar(
        { ...peticion, datos: { nombre: 'Otra caja' } },
        escribir,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(escribir).toHaveBeenCalledTimes(1);
  });

  it('crea un solo recurso con solicitudes simultáneas', async () => {
    const peticion = solicitud();
    const escribir = escritura(tenantId);
    const [primero, segundo] = await Promise.all([
      idempotencia.ejecutar(peticion, escribir),
      idempotencia.ejecutar(peticion, escribir),
    ]);
    expect(primero).toEqual(segundo);
    expect(escribir).toHaveBeenCalledTimes(1);
    const [, codigo] = escribir.mock.calls[0];
    await expect(
      prisma.caja.count({ where: { tenantId, codigo } }),
    ).resolves.toBe(1);
  });

  it('revierte el recurso y el reclamo si la escritura falla y permite reintentar', async () => {
    const peticion = solicitud();
    const escribir = escritura(tenantId);
    await expect(
      idempotencia.ejecutar(peticion, async (tx, claveRecurso) => {
        await escribir(tx, claveRecurso);
        throw new Error('Fallo de ensayo');
      }),
    ).rejects.toThrow('Fallo de ensayo');

    const [, codigo] = escribir.mock.calls[0];
    await expect(
      prisma.caja.count({ where: { tenantId, codigo } }),
    ).resolves.toBe(0);
    await expect(
      prisma.solicitudIdempotente.count({
        where: { tenantId, clave: peticion.clave },
      }),
    ).resolves.toBe(0);

    const resultado = await idempotencia.ejecutar(peticion, escribir);
    expect(escribir.mock.calls[1][1]).toBe(codigo);
    await expect(
      prisma.caja.findUnique({ where: { id: resultado.recursoId } }),
    ).resolves.toMatchObject({ codigo, tenantId });
  });

  it('aísla las claves por usuario, operación y tenant, también en el recurso', async () => {
    const peticion = solicitud();
    const escribir = escritura(tenantId);
    const escribirEnOtroTenant = escritura(otroTenantId);
    const resultados = await Promise.all([
      idempotencia.ejecutar(peticion, escribir),
      idempotencia.ejecutar(
        { ...peticion, usuarioId: otroUsuarioId },
        escribir,
      ),
      idempotencia.ejecutar(
        { ...peticion, operacion: 'caja.importar' },
        escribir,
      ),
      idempotencia.ejecutar(
        { ...peticion, tenantId: otroTenantId },
        escribirEnOtroTenant,
      ),
    ]);
    expect(new Set(resultados.map(({ recursoId }) => recursoId)).size).toBe(4);
    expect(
      new Set(
        [...escribir.mock.calls, ...escribirEnOtroTenant.mock.calls].map(
          ([, clave]) => clave,
        ),
      ).size,
    ).toBe(4);
  });

  it.each([undefined, '', 'dos palabras', 'a'.repeat(129)])(
    'rechaza una clave ausente o inválida (%s)',
    async (clave) => {
      const escribir = escritura(tenantId);
      await expect(
        idempotencia.ejecutar({ ...solicitud(), clave }, escribir),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(escribir).not.toHaveBeenCalled();
    },
  );
});
