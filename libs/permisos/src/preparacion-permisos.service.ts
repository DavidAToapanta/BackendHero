import { PrismaService } from '@app/prisma';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, TenantRole } from '@prisma/client';
import { GESTION_POR_MODULO } from './catalogo-permisos';
import { PermisosService, type ContextoPermisos } from './permisos.service';

const LECTURA_ADMIN_POR_MODULO = {
  GYM: 'gym.staff.read',
  STORE: 'store.catalog.read',
} as const;

@Injectable()
export class PreparacionPermisosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
  ) {}

  preparar(contexto: ContextoPermisos) {
    return this.prisma.$transaction(
      async (tx) => {
        const acceso = await this.permisos.exigirGestor(contexto, tx);
        if (!acceso.owner || acceso.modo !== 'LEGACY') {
          throw new ForbiddenException(
            'Solo OWNER puede preparar un negocio en LEGACY',
          );
        }

        const { tenantId, membresiaId: asignadorId } = contexto;
        const permisos = await this.permisos.registrarCatalogo(tx);
        const codigosBase = Object.values(TenantRole);
        const creados = await tx.rolNegocio.createManyAndReturn({
          data: codigosBase.map((codigo) => ({
            tenantId,
            codigo,
            nombre: codigo,
            protegido: true,
            equivalenciaLegacy: codigo,
          })),
          skipDuplicates: true,
        });
        const rolesBase = await tx.rolNegocio.findMany({
          where: { tenantId, codigo: { in: codigosBase } },
        });
        const equivalencias = new Map<TenantRole, number>();
        for (const rol of rolesBase) {
          if (
            rol.protegido &&
            rol.activo &&
            rol.equivalenciaLegacy === rol.codigo
          ) {
            equivalencias.set(rol.equivalenciaLegacy, rol.id);
          }
        }
        if (equivalencias.size !== codigosBase.length) {
          throw new ConflictException(
            'Los roles base existentes no coinciden con la preparación',
          );
        }

        const adminNuevo = creados.find(({ codigo }) => codigo === 'ADMIN');
        if (adminNuevo) {
          const asignables = new Set<string>(
            [...acceso.modulos].flatMap((modulo) => [
              GESTION_POR_MODULO[modulo],
              LECTURA_ADMIN_POR_MODULO[modulo],
            ]),
          );
          await tx.rolPermiso.createMany({
            data: permisos
              .filter(({ codigo }) => asignables.has(codigo))
              .map(({ id }) => ({
                tenantId,
                rolId: adminNuevo.id,
                permisoId: id,
              })),
          });
        }

        const membresias = await tx.userTenant.findMany({
          where: { tenantId, estado: 'ACTIVO' },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            role: true,
            asignacionRol_membresia: {
              select: { rolId: true, rol: { select: { codigo: true } } },
            },
          },
        });
        const faltantes: Prisma.AsignacionRolCreateManyInput[] = [];
        const discrepancias: {
          membresiaId: number;
          rolLegacy: TenantRole;
          rolAsignado: string;
        }[] = [];
        for (const membresia of membresias) {
          const rolId = equivalencias.get(membresia.role);
          if (rolId === undefined) {
            throw new ConflictException(
              'La membresía no tiene un rol base equivalente',
            );
          }
          const asignacion = membresia.asignacionRol_membresia[0];
          if (!asignacion) {
            faltantes.push({
              tenantId,
              membresiaId: membresia.id,
              rolId,
              asignadorId,
            });
          } else if (asignacion.rolId !== rolId) {
            discrepancias.push({
              membresiaId: membresia.id,
              rolLegacy: membresia.role,
              rolAsignado: asignacion.rol.codigo,
            });
          }
        }
        if (faltantes.length) {
          await tx.asignacionRol.createMany({ data: faltantes });
          await tx.userTenant.updateMany({
            where: {
              tenantId,
              id: { in: faltantes.map(({ membresiaId }) => membresiaId) },
            },
            data: { versionAutorizacion: { increment: 1 } },
          });
        }
        return {
          tenantId,
          modo: acceso.modo,
          rolesCreados: creados.length,
          asignacionesCreadas: faltantes.length,
          discrepancias,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
