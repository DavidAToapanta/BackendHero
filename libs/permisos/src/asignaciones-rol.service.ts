import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermisosService, type ContextoPermisos } from './permisos.service';

@Injectable()
export class AsignacionesRolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
  ) {}

  asignar(contexto: ContextoPermisos, membresiaId: number, rolId: number) {
    return this.cambiar(contexto, membresiaId, rolId);
  }

  retirar(contexto: ContextoPermisos, membresiaId: number) {
    return this.cambiar(contexto, membresiaId, null);
  }

  private cambiar(
    contexto: ContextoPermisos,
    membresiaId: number,
    rolId: number | null,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const acceso = await this.permisos.exigirGestor(contexto, tx);
        const { tenantId, membresiaId: asignadorId } = contexto;
        const whereMembresia = { tenantId_id: { tenantId, id: membresiaId } };
        const whereAsignacion = {
          tenantId_membresiaId: { tenantId, membresiaId },
        };
        const membresia = await tx.userTenant.findUnique({
          where: whereMembresia,
        });
        if (!membresia) {
          throw new NotFoundException('Membresía no encontrada en el negocio');
        }
        const actual = await tx.asignacionRol.findUnique({
          where: whereAsignacion,
          include: {
            rol: {
              include: { rolPermiso_rol: { include: { permiso: true } } },
            },
          },
        });
        if (
          asignadorId === membresiaId ||
          membresia.role === 'OWNER' ||
          actual?.rol.equivalenciaLegacy === 'OWNER'
        ) {
          throw new ForbiddenException('No se puede modificar esta asignación');
        }
        if (!acceso.owner && actual) {
          if (actual.rol.protegido) {
            throw new ForbiddenException(
              'No se puede modificar una asignación protegida',
            );
          }
          this.permisos.validarDelegacion(
            acceso,
            actual.rol.rolPermiso_rol.map(({ permiso }) => permiso),
          );
        }
        if (rolId === null) {
          if (actual) {
            await tx.asignacionRol.delete({ where: whereAsignacion });
            await tx.userTenant.update({
              where: whereMembresia,
              data: { versionAutorizacion: { increment: 1 } },
            });
          }
          return null;
        }

        const rol = await tx.rolNegocio.findUnique({
          where: { tenantId_id: { tenantId, id: rolId } },
          include: { rolPermiso_rol: { include: { permiso: true } } },
        });
        if (!rol) {
          throw new NotFoundException('Rol no encontrado en el negocio');
        }
        if (!rol.activo || membresia.estado !== 'ACTIVO') {
          throw new BadRequestException(
            'El rol y la membresía deben estar activos',
          );
        }
        if (
          rol.equivalenciaLegacy === 'OWNER' ||
          (rol.protegido && !acceso.owner)
        ) {
          throw new ForbiddenException(
            'No se puede asignar este rol protegido',
          );
        }
        if (!rol.protegido) {
          this.permisos.validarDelegacion(
            acceso,
            rol.rolPermiso_rol.map(({ permiso }) => permiso),
          );
        }
        if (actual?.rolId === rolId) {
          return { id: actual.id, membresiaId, rolId, tenantId };
        }
        const asignacion = await tx.asignacionRol.upsert({
          where: whereAsignacion,
          create: { tenantId, membresiaId, rolId, asignadorId },
          update: { rolId, asignadorId },
        });
        await tx.userTenant.update({
          where: whereMembresia,
          data: { versionAutorizacion: { increment: 1 } },
        });
        return { id: asignacion.id, membresiaId, rolId, tenantId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
