import { PrismaService } from '@app/prisma';
import { ForbiddenException } from '@nestjs/common';
import { ModuleKey, Prisma } from '@prisma/client';
import { CATALOGO_PERMISOS } from './catalogo-permisos';
import { PermisosService, type PermisoRegistrado } from './permisos.service';

describe('PermisosService', () => {
  const contexto = {
    tenantId: 10,
    membresiaId: 20,
    usuarioId: 30,
    versionAutorizacion: 2,
  };
  const findUnique = jest.fn();
  const tx = {
    userTenant: { findUnique },
  } as unknown as Prisma.TransactionClient;
  const prisma = {
    $transaction: (callback: (client: Prisma.TransactionClient) => unknown) =>
      callback(tx),
  } as unknown as PrismaService;
  const service = new PermisosService(prisma);
  const catalogo: PermisoRegistrado[] = CATALOGO_PERMISOS.map((permiso, i) => ({
    id: i + 1,
    ...permiso,
  }));

  function membresia() {
    return {
      usuarioId: contexto.usuarioId,
      estado: 'ACTIVO',
      role: 'OWNER',
      versionAutorizacion: contexto.versionAutorizacion,
      tenant: {
        estado: 'ACTIVO',
        autorizacionVersion: 'PERMISOS',
        modules: [{ module: ModuleKey.GYM }],
      },
      asignacionRol_membresia: [
        {
          rol: {
            id: 40,
            codigo: 'CUSTOM',
            activo: true,
            protegido: false,
            equivalenciaLegacy: null,
            rolPermiso_rol: catalogo
              .filter(({ codigo }) => codigo === 'gym.staff.read')
              .map((permiso) => ({ permiso })),
          },
        },
      ],
    };
  }

  beforeEach(() => {
    findUnique
      .mockReset()
      .mockImplementation(() => Promise.resolve(membresia()));
  });

  it('autoriza por asignación vigente y no usa el rol legacy como respaldo', async () => {
    await expect(
      service.autorizar(contexto, 'gym.staff.read'),
    ).resolves.toBeUndefined();
    const sinRol = { ...membresia(), asignacionRol_membresia: [] };
    findUnique.mockResolvedValueOnce(sinRol);
    await expect(service.autorizar(contexto, 'gym.staff.read')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.autorizar(contexto, 'gym.staff.write'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('exige todos los permisos y resuelve el acceso una vez por solicitud', async () => {
    const datos = membresia();
    datos.asignacionRol_membresia[0].rol.rolPermiso_rol = catalogo
      .filter(
        ({ codigo }) =>
          codigo === 'gym.staff.read' || codigo === 'gym.staff.write',
      )
      .map((permiso) => ({ permiso }));
    findUnique.mockResolvedValueOnce(datos);

    const codigos = ['gym.staff.read', 'gym.staff.write'] as const;
    await expect(service.autorizar(contexto, codigos)).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledTimes(1);
    await expect(service.autorizar(contexto, codigos)).rejects.toThrow(
      ForbiddenException,
    );
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('rechaza una lista vacía y conserva un código único por permiso del catálogo', async () => {
    await expect(service.autorizar(contexto, [])).rejects.toThrow(
      ForbiddenException,
    );
    expect(findUnique).not.toHaveBeenCalled();
    expect(new Set(catalogo.map(({ codigo }) => codigo)).size).toBe(
      catalogo.length,
    );
  });

  it('rechaza otra cuenta, otra versión y módulos que no están habilitados', async () => {
    await expect(
      service.autorizar({ ...contexto, usuarioId: 99 }, 'gym.staff.read'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.autorizar(
        { ...contexto, versionAutorizacion: 1 },
        'gym.staff.read',
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.autorizar(contexto, 'store.catalog.read'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('exige permiso de gestión aunque el rol legacy de la membresía diga OWNER', async () => {
    await expect(service.exigirGestor(contexto, tx)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rechaza identificadores inválidos antes de consultar PostgreSQL', async () => {
    await expect(
      service.autorizar({ ...contexto, membresiaId: 0 }, 'gym.staff.read'),
    ).rejects.toThrow(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('solo reconoce permisos cuya configuración coincide con el catálogo de la app', async () => {
    const datos = membresia();
    const permiso =
      datos.asignacionRol_membresia[0].rol.rolPermiso_rol[0].permiso;
    datos.asignacionRol_membresia[0].rol.rolPermiso_rol = [
      {
        permiso: { ...permiso, delegable: false },
      },
    ];
    findUnique.mockResolvedValueOnce(datos);
    await expect(service.autorizar(contexto, 'gym.staff.read')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
