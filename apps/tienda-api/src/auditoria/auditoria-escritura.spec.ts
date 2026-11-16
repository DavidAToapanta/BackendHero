import type { Prisma } from '@prisma/client';
import {
  ACCIONES_AUDITORIA,
  AuditoriaEscrituraService,
  type OperacionAuditada,
} from './auditoria-escritura';

describe('AuditoriaEscrituraService', () => {
  const contexto = {
    tenantId: 4,
    usuarioId: 5,
    membresiaId: 6,
    rolEfectivo: { codigo: 'ADMIN', nombre: 'Administración' },
  };
  const operacion: OperacionAuditada = {
    accion: ACCIONES_AUDITORIA.VENTAS_REGISTRAR,
    entidadTipo: 'Venta',
    entidadId: 9,
    correlacionId: '15ed59a5-9243-4b78-88c3-af8dbbe40eb3',
    motivo: 'Ensayo',
  };

  it('escribe una fila por producto distinto y conserva la correlación y el actor', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      auditoriaOperacion: { createMany },
    } as unknown as Prisma.TransactionClient;
    const servicio = new AuditoriaEscrituraService();
    await expect(
      servicio.registrar(tx, contexto, {
        ...operacion,
        productoIds: [12, 8, 12],
      }),
    ).resolves.toEqual({ count: 2 });

    expect(createMany).toHaveBeenCalledWith({
      data: [12, 8].map((productoId) => ({
        ...operacion,
        productoId,
        actor: 'USUARIO',
        tenantId: 4,
        usuarioId: 5,
        membresiaId: 6,
        rolCodigo: 'ADMIN',
        rolNombre: 'Administración',
      })),
    });
  });

  it('registra acciones sin productos en la transacción recibida', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      auditoriaOperacion: { createMany },
    } as unknown as Prisma.TransactionClient;
    await expect(
      new AuditoriaEscrituraService().registrar(tx, contexto, operacion),
    ).resolves.toEqual({ count: 1 });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          ...operacion,
          productoId: null,
          actor: 'USUARIO',
        }) as unknown,
      ],
    });
  });

  it('adapta la operación comercial y respeta una correlación explícita', async () => {
    const servicio = new AuditoriaEscrituraService();
    const registrar = jest.spyOn(servicio, 'registrar');
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      auditoriaOperacion: { createMany },
    } as unknown as Prisma.TransactionClient;
    const operacionComercial = servicio.paraOperacion(
      contexto,
      operacion.correlacionId,
    );
    const evento = {
      accion: ACCIONES_AUDITORIA.INVENTARIO_BAJA,
      recursoTipo: 'MovimientoInventario',
      recursoId: 29,
      productos: [12],
      motivo: 'Daño',
      datos: { cantidad: 1 },
    };
    const esperado = {
      accion: evento.accion,
      entidadTipo: evento.recursoTipo,
      entidadId: evento.recursoId,
      productoIds: evento.productos,
      motivo: evento.motivo,
      datos: evento.datos,
    };

    await operacionComercial.auditar(tx, evento);
    expect(registrar).toHaveBeenNthCalledWith(1, tx, contexto, {
      ...esperado,
      correlacionId: operacion.correlacionId,
    });
    const correlacionId = 'cd74c981-fd24-46aa-9d6e-36668587999c';
    await operacionComercial.auditar(tx, { ...evento, correlacionId });
    expect(registrar).toHaveBeenNthCalledWith(2, tx, contexto, {
      ...esperado,
      correlacionId,
    });
  });
});
