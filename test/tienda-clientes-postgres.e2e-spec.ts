import { randomUUID } from 'node:crypto';
import { PrismaService } from '@app/prisma';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientesModule } from '../apps/tienda-api/src/clientes/clientes.module';
import { ClientesService } from '../apps/tienda-api/src/clientes/clientes.service';
import {
  ACCIONES_AUDITORIA,
  AuditoriaEscrituraModule,
  AuditoriaEscrituraService,
  type ContextoAuditoria,
} from '../apps/tienda-api/src/auditoria/auditoria-escritura';

const suite =
  process.env.TIENDA_CLIENTES_POSTGRES_E2E === '1' ? describe : describe.skip;

suite('Clientes comerciales con PostgreSQL', () => {
  const prisma = new PrismaService();
  let modulo: TestingModule;
  let clientes: ClientesService;
  let contexto: ContextoAuditoria;
  let auditoria: AuditoriaEscrituraService;
  let otroTenant: number;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/hero_tienda_clientes_test'
    ) {
      throw new Error('Se requiere PostgreSQL local hero_tienda_clientes_test');
    }
    modulo = await Test.createTestingModule({
      imports: [ClientesModule, AuditoriaEscrituraModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    clientes = modulo.get(ClientesService);
    auditoria = modulo.get(AuditoriaEscrituraService);
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
      rolEfectivo: { codigo: 'OWNER', nombre: 'Propietario' },
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

  async function crearClienteGym(tenantId: number) {
    const { id: usuarioId } = await crearUsuario();
    return prisma.cliente.create({
      data: {
        tenantId,
        usuarioId,
        horario: '',
        sexo: '',
        observaciones: '',
        objetivos: '',
        tiempoEntrenar: 1,
      },
    });
  }

  function operacion(correlacionId = randomUUID()) {
    return auditoria.paraOperacion(contexto, correlacionId);
  }

  it('busca, edita y desactiva fichas aisladas por negocio', async () => {
    const ficha = {
      nombres: 'Ana de Ensayo',
      tipoIdentificacion: 'cedula',
      identificacion: randomUUID(),
    };
    const cliente = await clientes.registrar(operacion(), ficha);
    await expect(clientes.registrar(operacion(), ficha)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      clientes.obtener(otroTenant, cliente.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      clientes.listar(contexto.tenantId, { buscar: 'ANA de' }),
    ).resolves.toEqual([cliente]);
    await clientes.editar(operacion(), cliente.id, {
      tipoIdentificacion: null,
      identificacion: null,
    });
    await clientes.desactivar(operacion(), cliente.id);
    await expect(
      clientes.obtener(contexto.tenantId, cliente.id),
    ).resolves.toMatchObject({ activo: false, identificacion: null });
    await expect(
      prisma.$transaction((tx) =>
        clientes.obtenerActivo(tx, contexto.tenantId, cliente.id),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const eventos = await prisma.auditoriaOperacion.findMany({
      where: {
        tenantId: contexto.tenantId,
        entidadTipo: 'ClienteComercial',
        entidadId: cliente.id,
      },
      orderBy: { id: 'asc' },
    });
    expect(eventos.map(({ accion }) => accion)).toEqual([
      ACCIONES_AUDITORIA.CLIENTES_REGISTRAR,
      ACCIONES_AUDITORIA.CLIENTES_EDITAR,
      ACCIONES_AUDITORIA.CLIENTES_DESACTIVAR,
    ]);
    expect(
      new Set(eventos.map(({ correlacionId }) => correlacionId)).size,
    ).toBe(3);
    for (const evento of eventos) {
      expect(evento).toMatchObject({
        tenantId: contexto.tenantId,
        usuarioId: contexto.usuarioId,
        membresiaId: contexto.membresiaId,
        rolCodigo: 'OWNER',
        productoId: null,
      });
    }
  });

  it('vincula un cliente real de Gym del mismo negocio y conserva el vínculo al desactivar', async () => {
    const propio = await crearClienteGym(contexto.tenantId);
    const ajeno = await crearClienteGym(otroTenant);
    const ficha = { nombres: 'Cliente ligado a Gym', clienteGymId: propio.id };
    const comercial = await clientes.registrar(operacion(), ficha);
    await expect(clientes.registrar(operacion(), ficha)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      clientes.registrar(operacion(), { ...ficha, clienteGymId: ajeno.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      clientes.editar(operacion(), comercial.id, { clienteGymId: ajeno.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      clientes.desactivar(operacion(), comercial.id),
    ).resolves.toMatchObject({
      activo: false,
      clienteGymId: propio.id,
    });
  });

  it('revierte la escritura si falla la llamada de auditoría', async () => {
    const ficha = {
      nombres: 'Ficha con fallo de auditoría',
      tipoIdentificacion: 'cedula',
      identificacion: randomUUID(),
    };
    const correlacionId = randomUUID();
    const contextoOperacion = operacion(correlacionId);
    await expect(
      clientes.registrar(
        {
          ...contextoOperacion,
          auditar: async (tx, evento) => {
            await contextoOperacion.auditar(tx, evento);
            throw new Error('Fallo de ensayo');
          },
        },
        ficha,
      ),
    ).rejects.toThrow('Fallo de ensayo');
    await expect(
      clientes.listar(contexto.tenantId, { buscar: ficha.identificacion }),
    ).resolves.toEqual([]);
    expect(
      await prisma.auditoriaOperacion.count({
        where: { tenantId: contexto.tenantId, correlacionId },
      }),
    ).toBe(0);
    await expect(clientes.registrar(operacion(), ficha)).resolves.toMatchObject(
      {
        identificacion: ficha.identificacion,
      },
    );
  });
});
