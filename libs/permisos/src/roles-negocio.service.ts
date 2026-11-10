import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TenantRole } from '@prisma/client';
import type { CodigoPermiso } from './catalogo-permisos';
import { PermisosService, type ContextoPermisos } from './permisos.service';

type NuevoRol = {
  codigo: string;
  nombre: string;
  permisos: readonly CodigoPermiso[];
};

type CambiosRol = {
  nombre?: string;
  activo?: boolean;
  permisos?: readonly CodigoPermiso[];
};

@Injectable()
export class RolesNegocioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
  ) {}

  crear(contexto: ContextoPermisos, datos: NuevoRol) {
    return this.prisma.$transaction(
      async (tx) => {
        const acceso = await this.permisos.exigirGestor(contexto, tx);
        const { tenantId } = contexto;
        const codigo = datos.codigo.trim().toUpperCase();
        if (
          !/^[A-Z][A-Z0-9_-]{0,39}$/.test(codigo) ||
          Object.values<string>(TenantRole).includes(codigo)
        ) {
          throw new BadRequestException('Código de rol inválido o reservado');
        }
        const nombre = this.validarNombre(datos.nombre);
        const permisos = await this.permisos.buscarPermisos(datos.permisos, tx);
        this.permisos.validarDelegacion(acceso, permisos);
        return tx.rolNegocio.create({
          data: {
            tenantId,
            codigo,
            nombre,
            rolPermiso_rol: {
              create: permisos.map(({ id }) => ({
                permiso: { connect: { id } },
                tenant: { connect: { id: tenantId } },
              })),
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  editar(contexto: ContextoPermisos, rolId: number, cambios: CambiosRol) {
    return this.prisma.$transaction(
      async (tx) => {
        const acceso = await this.permisos.exigirGestor(contexto, tx);
        const { tenantId } = contexto;
        const where = { tenantId_id: { tenantId, id: rolId } };
        const rol = await tx.rolNegocio.findUnique({
          where,
          include: { rolPermiso_rol: { include: { permiso: true } } },
        });
        if (!rol) {
          throw new NotFoundException('Rol no encontrado en el negocio');
        }
        if (rol.protegido || acceso.rolId === rolId) {
          throw new ForbiddenException('No se puede modificar este rol');
        }

        const actuales = rol.rolPermiso_rol.map(({ permiso }) => permiso);
        if (!acceso.owner) {
          this.permisos.validarDelegacion(acceso, actuales);
        }
        const nuevos = cambios.permisos
          ? await this.permisos.buscarPermisos(cambios.permisos, tx)
          : actuales;
        if (cambios.permisos) {
          this.permisos.validarDelegacion(acceso, nuevos);
        }
        const cambioPermisos =
          nuevos.length !== actuales.length ||
          nuevos.some(({ id }) => !actuales.some((actual) => actual.id === id));
        const nombre =
          cambios.nombre === undefined
            ? rol.nombre
            : this.validarNombre(cambios.nombre);
        const activo = cambios.activo ?? rol.activo;

        if (cambioPermisos) {
          await tx.rolPermiso.deleteMany({ where: { tenantId, rolId } });
          await tx.rolPermiso.createMany({
            data: nuevos.map(({ id }) => ({ tenantId, rolId, permisoId: id })),
          });
        }
        if (cambioPermisos || activo !== rol.activo) {
          await tx.userTenant.updateMany({
            where: {
              tenantId,
              asignacionRol_membresia: { some: { tenantId, rolId } },
            },
            data: { versionAutorizacion: { increment: 1 } },
          });
        }
        if (nombre !== rol.nombre || activo !== rol.activo) {
          return tx.rolNegocio.update({ where, data: { nombre, activo } });
        }
        const { rolPermiso_rol: relaciones, ...datosRol } = rol;
        void relaciones;
        return datosRol;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private validarNombre(valor: string) {
    const nombre = valor.trim();
    if (!nombre) {
      throw new BadRequestException('El nombre del rol es obligatorio');
    }
    return nombre;
  }
}
