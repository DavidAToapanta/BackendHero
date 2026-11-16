import { randomUUID } from 'node:crypto';
import { PrismaService } from '@app/prisma';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientesModule } from '../apps/tienda-api/src/clientes/clientes.module';
import { ClientesService } from '../apps/tienda-api/src/clientes/clientes.service';
import type { ContextoOperacionTienda } from '../apps/tienda-api/src/comun/operacion-tienda';

const suite =
  process.env.TIENDA_CLIENTES_POSTGRES_E2E === '1' ? describe : describe.skip;

suite('Clientes comerciales con PostgreSQL', () => {
  const prisma = new PrismaService();
  let modulo: TestingModule;
  let clientes: ClientesService;
  let contexto: ContextoOperacionTienda;
  let otroTenant: number;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/hero_tienda_clientes_test'
    ) {
      throw new Error('Se requiere PostgreSQL local hero_tienda_clientes_test');
    }
    modulo = await Test.createTestingModule({ imports: [ClientesModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    clientes = modulo.get(ClientesService);
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

  it('busca, edita y desactiva fichas aisladas por negocio', async () => {
    const ficha = {
      nombres: 'Ana de Ensayo',
      tipoIdentificacion: 'cedula',
      identificacion: randomUUID(),
    };
    const cliente = await clientes.registrar(contexto, ficha);
    await expect(clientes.registrar(contexto, ficha)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      clientes.obtener(otroTenant, cliente.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      clientes.listar(contexto.tenantId, { buscar: 'ANA de' }),
    ).resolves.toEqual([cliente]);
    await clientes.editar(contexto, cliente.id, {
      tipoIdentificacion: null,
      identificacion: null,
    });
    await clientes.desactivar(contexto, cliente.id);
    await expect(
      clientes.obtener(contexto.tenantId, cliente.id),
    ).resolves.toMatchObject({ activo: false, identificacion: null });
    await expect(
      prisma.$transaction((tx) =>
        clientes.obtenerActivo(tx, contexto.tenantId, cliente.id),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('vincula un cliente real de Gym del mismo negocio y conserva el vínculo al desactivar', async () => {
    const propio = await crearClienteGym(contexto.tenantId);
    const ajeno = await crearClienteGym(otroTenant);
    const ficha = { nombres: 'Cliente ligado a Gym', clienteGymId: propio.id };
    const comercial = await clientes.registrar(contexto, ficha);
    await expect(clientes.registrar(contexto, ficha)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      clientes.registrar(contexto, { ...ficha, clienteGymId: ajeno.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      clientes.editar(contexto, comercial.id, { clienteGymId: ajeno.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      clientes.desactivar(contexto, comercial.id),
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
    await expect(
      clientes.registrar(
        {
          ...contexto,
          auditar: () => Promise.reject(new Error('Fallo de ensayo')),
        },
        ficha,
      ),
    ).rejects.toThrow('Fallo de ensayo');
    await expect(
      clientes.listar(contexto.tenantId, { buscar: ficha.identificacion }),
    ).resolves.toEqual([]);
    await expect(clientes.registrar(contexto, ficha)).resolves.toMatchObject({
      identificacion: ficha.identificacion,
    });
  });
});
