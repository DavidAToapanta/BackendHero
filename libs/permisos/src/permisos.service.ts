import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ModuleKey, Prisma, VersionAutorizacion } from '@prisma/client';
import {
  CATALOGO_PERMISOS,
  coincideConCatalogo,
  GESTION_POR_MODULO,
  type CodigoPermiso,
} from './catalogo-permisos';

export type ContextoPermisos = {
  usuarioId: number;
  tenantId: number;
  membresiaId: number;
  versionAutorizacion: number;
};

export type PermisoRegistrado = {
  id: number;
  codigo: string;
  modulo: ModuleKey;
  delegable: boolean;
};

type Acceso = {
  modo: VersionAutorizacion;
  owner: boolean;
  rolId: number | null;
  modulos: Set<ModuleKey>;
  permisos: Set<string>;
};

@Injectable()
export class PermisosService {
  constructor(private readonly prisma: PrismaService) {}

  async registrarCatalogo(tx: Prisma.TransactionClient) {
    await tx.permiso.createMany({
      data: CATALOGO_PERMISOS.map((permiso) => ({ ...permiso })),
      skipDuplicates: true,
    });
    const permisos = await tx.permiso.findMany({
      where: { codigo: { in: CATALOGO_PERMISOS.map(({ codigo }) => codigo) } },
    });
    if (
      permisos.length !== CATALOGO_PERMISOS.length ||
      permisos.some((permiso) => !coincideConCatalogo(permiso))
    ) {
      throw new ConflictException(
        'El catálogo registrado no coincide con la aplicación',
      );
    }
    return permisos;
  }

  autorizar(contexto: ContextoPermisos, codigo: CodigoPermiso) {
    return this.prisma.$transaction(
      async (tx) => {
        const acceso = await this.resolver(contexto, tx);
        const permiso = CATALOGO_PERMISOS.find(
          (item) => item.codigo === codigo,
        );
        if (
          acceso.modo !== 'PERMISOS' ||
          !permiso ||
          !acceso.modulos.has(permiso.modulo) ||
          (!acceso.owner && !acceso.permisos.has(codigo))
        ) {
          throw new ForbiddenException('Permiso insuficiente');
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async exigirGestor(contexto: ContextoPermisos, tx: Prisma.TransactionClient) {
    const acceso = await this.resolver(contexto, tx);
    if (
      !acceso.owner &&
      ![...acceso.modulos].some((modulo) =>
        acceso.permisos.has(GESTION_POR_MODULO[modulo]),
      )
    ) {
      throw new ForbiddenException('Se requiere gestión de roles');
    }
    return acceso;
  }

  async buscarPermisos(
    codigos: readonly CodigoPermiso[],
    tx: Prisma.TransactionClient,
  ) {
    const unicos = [...new Set(codigos)];
    const permisos = await tx.permiso.findMany({
      where: { codigo: { in: unicos } },
      select: { id: true, codigo: true, modulo: true, delegable: true },
    });
    if (
      permisos.length !== unicos.length ||
      permisos.some((permiso) => !coincideConCatalogo(permiso))
    ) {
      throw new BadRequestException('Uno o más permisos no están registrados');
    }
    return permisos;
  }

  validarDelegacion(acceso: Acceso, permisos: PermisoRegistrado[]) {
    for (const permiso of permisos) {
      if (
        !coincideConCatalogo(permiso) ||
        !permiso.delegable ||
        !acceso.modulos.has(permiso.modulo) ||
        (!acceso.owner &&
          (!acceso.permisos.has(permiso.codigo) ||
            !acceso.permisos.has(GESTION_POR_MODULO[permiso.modulo])))
      ) {
        throw new ForbiddenException(
          'El permiso excede la autoridad de delegación',
        );
      }
    }
  }

  private async resolver(
    contexto: ContextoPermisos,
    tx: Prisma.TransactionClient,
  ): Promise<Acceso> {
    const { tenantId, membresiaId, usuarioId, versionAutorizacion } = contexto;
    if (
      [tenantId, membresiaId, usuarioId, versionAutorizacion].some(
        (valor) => !Number.isSafeInteger(valor) || valor < 1,
      )
    ) {
      throw new ForbiddenException(
        'Contexto de autorización inválido o vencido',
      );
    }
    const membresia = await tx.userTenant.findUnique({
      where: { tenantId_id: { tenantId, id: membresiaId } },
      select: {
        usuarioId: true,
        estado: true,
        role: true,
        versionAutorizacion: true,
        tenant: {
          select: {
            estado: true,
            autorizacionVersion: true,
            modules: { where: { activo: true }, select: { module: true } },
          },
        },
        asignacionRol_membresia: {
          where: { tenantId },
          select: {
            rol: {
              select: {
                id: true,
                codigo: true,
                activo: true,
                protegido: true,
                equivalenciaLegacy: true,
                rolPermiso_rol: {
                  select: {
                    permiso: {
                      select: { codigo: true, modulo: true, delegable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (
      !membresia ||
      membresia.usuarioId !== usuarioId ||
      membresia.estado !== 'ACTIVO' ||
      membresia.tenant.estado !== 'ACTIVO' ||
      membresia.versionAutorizacion !== versionAutorizacion
    ) {
      throw new ForbiddenException(
        'Contexto de autorización inválido o vencido',
      );
    }

    const modo = membresia.tenant.autorizacionVersion;
    const modulos = new Set(
      membresia.tenant.modules.map(({ module }) => module),
    );
    if (modo === 'LEGACY') {
      return {
        modo,
        modulos,
        owner: membresia.role === 'OWNER',
        rolId: null,
        permisos: new Set(),
      };
    }

    const rol = membresia.asignacionRol_membresia[0]?.rol;
    if (!rol?.activo) {
      throw new ForbiddenException('La membresía no tiene un rol activo');
    }
    const owner =
      rol.protegido &&
      rol.codigo === 'OWNER' &&
      rol.equivalenciaLegacy === 'OWNER';
    const permisos = new Set(
      rol.rolPermiso_rol
        .map(({ permiso }) => permiso)
        .filter(
          (permiso) =>
            modulos.has(permiso.modulo) && coincideConCatalogo(permiso),
        )
        .map(({ codigo }) => codigo),
    );
    return { modo, modulos, owner, rolId: rol.id, permisos };
  }
}
