import {
  CATALOGO_PERMISOS_TIENDA,
  PermisosService,
  PreparacionPermisosService,
  type CodigoPermisoTienda,
} from '@app/permisos';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ContextoTienda } from '../auth';

const perfiles = {
  ADMIN: {
    equivalencia: 'ADMIN',
    permisos: CATALOGO_PERMISOS_TIENDA.map(({ codigo }) => codigo),
  },
  CAJERO: {
    equivalencia: 'CAJERO',
    permisos: [
      'store.catalog.read',
      'store.inventory.read',
      'store.cash.read',
      'store.cash.open',
      'store.cash.close',
      'store.customers.read',
      'store.sales.read',
      'store.sales.create',
      'store.payments.read',
      'store.payments.create',
      'store.receivables.read',
      'store.receivables.collect',
      'store.receipts.read',
      'store.receipts.issue',
    ],
  },
  BODEGUERO: {
    equivalencia: null,
    permisos: [
      'store.catalog.read',
      'store.inventory.read',
      'store.inventory.receive',
      'store.inventory.loss',
    ],
  },
} satisfies Record<
  string,
  {
    equivalencia: 'ADMIN' | 'CAJERO' | null;
    permisos: readonly CodigoPermisoTienda[];
  }
>;
const codigosPerfiles = Object.keys(perfiles) as (keyof typeof perfiles)[];
const propietario = {
  codigo: 'OWNER',
  equivalenciaLegacy: 'OWNER',
  protegido: true,
  activo: true,
} as const;

@Injectable()
export class PreparacionTiendaService {
  constructor(
    private readonly preparacion: PreparacionPermisosService,
    private readonly permisos: PermisosService,
  ) {}

  async preparar(contexto: ContextoTienda, tx: Prisma.TransactionClient) {
    const base = await this.preparacion.preparar(contexto, tx);
    const bodeguero = await tx.rolNegocio.createMany({
      data: {
        tenantId: contexto.tenantId,
        codigo: 'BODEGUERO',
        nombre: 'Bodeguero',
        protegido: true,
      },
      skipDuplicates: true,
    });
    const faltantes = await this.permisosFaltantes(contexto.tenantId, tx);
    if (faltantes.length) {
      await tx.rolPermiso.createMany({ data: faltantes });
      await tx.userTenant.updateMany({
        where: {
          tenantId: contexto.tenantId,
          asignacionRol_membresia: {
            some: {
              rolId: { in: [...new Set(faltantes.map(({ rolId }) => rolId))] },
            },
          },
        },
        data: { versionAutorizacion: { increment: 1 } },
      });
    }
    const membresia = await tx.userTenant.findUniqueOrThrow({
      where: {
        tenantId_id: { tenantId: contexto.tenantId, id: contexto.membresiaId },
      },
      select: { versionAutorizacion: true },
    });
    return {
      ...base,
      rolesCreados: base.rolesCreados + bodeguero.count,
      permisosAgregados: faltantes.length,
      requiereNuevoLogin:
        membresia.versionAutorizacion !== contexto.versionAutorizacion,
    };
  }

  async activar(contexto: ContextoTienda, tx: Prisma.TransactionClient) {
    const acceso = await this.permisos.exigirGestor(contexto, tx);
    if (!acceso.owner || acceso.modo !== 'LEGACY') {
      throw new ForbiddenException(
        'Solo OWNER puede activar una tienda en LEGACY',
      );
    }
    const { tenantId, membresiaId } = contexto;
    const asignacionOwner = await tx.asignacionRol.findFirst({
      where: { tenantId, membresiaId, rol: propietario },
      select: { id: true },
    });
    const sinRol = await tx.userTenant.count({
      where: {
        tenantId,
        estado: 'ACTIVO',
        OR: [
          { asignacionRol_membresia: { none: { rol: { activo: true } } } },
          {
            role: 'OWNER',
            asignacionRol_membresia: { none: { rol: propietario } },
          },
        ],
      },
    });
    if (
      !asignacionOwner ||
      sinRol > 0 ||
      (await this.permisosFaltantes(tenantId, tx)).length > 0
    ) {
      throw new ConflictException(
        'Prepara los roles y completa las asignaciones activas antes de activar',
      );
    }
    await tx.tenant.update({
      where: { id: tenantId },
      data: { autorizacionVersion: 'PERMISOS' },
    });
    await tx.userTenant.updateMany({
      where: { tenantId },
      data: { versionAutorizacion: { increment: 1 } },
    });
    return { tenantId, modo: 'PERMISOS' as const, requiereNuevoLogin: true };
  }

  private async permisosFaltantes(
    tenantId: number,
    tx: Prisma.TransactionClient,
  ) {
    const permisos = await tx.permiso.findMany({
      where: { modulo: 'STORE' },
      select: { id: true, codigo: true, delegable: true },
    });
    const porCodigo = new Map(
      permisos.map((permiso) => [permiso.codigo, permiso]),
    );
    if (
      CATALOGO_PERMISOS_TIENDA.some(
        ({ codigo, delegable }) =>
          porCodigo.get(codigo)?.delegable !== delegable,
      )
    ) {
      throw new ConflictException(
        'El catálogo STORE debe estar registrado y coincidir con la aplicación',
      );
    }

    const roles = await tx.rolNegocio.findMany({
      where: { tenantId, codigo: { in: codigosPerfiles } },
      include: {
        rolPermiso_rol: {
          select: { permiso: { select: { codigo: true, modulo: true } } },
        },
      },
    });
    return codigosPerfiles.flatMap((codigo) => {
      const esperado = perfiles[codigo];
      const rol = roles.find((item) => item.codigo === codigo);
      const esperados = new Set<string>(esperado.permisos);
      if (
        !rol?.activo ||
        !rol.protegido ||
        rol.equivalenciaLegacy !== esperado.equivalencia
      ) {
        throw new ConflictException(
          'Los roles iniciales no coinciden con la preparación de Tienda',
        );
      }
      const actuales = new Set(
        rol.rolPermiso_rol
          .map(({ permiso }) => permiso)
          .filter(({ modulo }) => modulo === 'STORE')
          .map(({ codigo }) => codigo),
      );
      if ([...actuales].some((codigo) => !esperados.has(codigo))) {
        throw new ConflictException(
          'Un rol inicial tiene permisos STORE ajenos a su perfil',
        );
      }
      return [...esperados]
        .filter((codigo) => !actuales.has(codigo))
        .map((codigo) => ({
          tenantId,
          rolId: rol.id,
          permisoId: porCodigo.get(codigo)!.id,
        }));
    });
  }
}
