import { PrismaService } from '@app/prisma';
import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TenantEstado,
  TenantRole,
  UserTenantEstado,
} from '@prisma/client';

type Vinculacion = Pick<
  Prisma.UserTenantUncheckedCreateInput,
  'usuarioId' | 'tenantId' | 'role'
> & { estado: UserTenantEstado };

@Injectable()
export class MembresiasPersonalService {
  constructor(private readonly prisma: PrismaService) {}

  buscar(
    usuarioId: number,
    tenantId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.userTenant.findFirst({
      where: { usuarioId, tenantId },
      select: {
        id: true,
        usuarioId: true,
        tenantId: true,
        role: true,
        estado: true,
      },
    });
  }

  vincular(data: Vinculacion, tx: Prisma.TransactionClient = this.prisma) {
    return tx.userTenant.create({ data });
  }

  async cambiarRol(
    id: number,
    tenantId: number,
    role: TenantRole,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const where = { id, tenantId };
    const [actualizada] = await tx.userTenant.updateManyAndReturn({
      where: { ...where, role: { not: role } },
      data: { role, versionAutorizacion: { increment: 1 } },
    });
    return actualizada ?? tx.userTenant.findUniqueOrThrow({ where });
  }

  async cambiarEstado(
    id: number,
    tenantId: number,
    estado: UserTenantEstado,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const where = { id, tenantId };
    const [actualizada] = await tx.userTenant.updateManyAndReturn({
      where: { ...where, estado: { not: estado } },
      data: { estado, versionAutorizacion: { increment: 1 } },
    });
    return actualizada ?? tx.userTenant.findUniqueOrThrow({ where });
  }

  asegurar(data: Vinculacion, tx: Prisma.TransactionClient = this.prisma) {
    if (tx === this.prisma) {
      return this.prisma.$transaction((transaccion) =>
        this.asegurarEnTransaccion(data, transaccion),
      );
    }
    return this.asegurarEnTransaccion(data, tx);
  }

  private async asegurarEnTransaccion(
    data: Vinculacion,
    tx: Prisma.TransactionClient,
  ) {
    const { usuarioId, tenantId, role, estado } = data;
    await tx.userTenant.createMany({ data: [data], skipDuplicates: true });
    const [actualizada] = await tx.userTenant.updateManyAndReturn({
      where: {
        usuarioId,
        tenantId,
        OR: [{ role: { not: role } }, { estado: { not: estado } }],
      },
      data: { role, estado, versionAutorizacion: { increment: 1 } },
    });
    return (
      actualizada ??
      tx.userTenant.findUniqueOrThrow({
        where: { usuarioId_tenantId: { usuarioId, tenantId } },
      })
    );
  }

  buscarIdPorRolEnNegocio(
    slug: string,
    role: TenantRole,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.userTenant.findFirst({
      where: { tenant: { slug }, role },
      select: { id: true },
    });
  }

  listarActivasParaUsuario(usuarioId: number) {
    return this.prisma.userTenant.findMany({
      where: {
        usuarioId,
        estado: UserTenantEstado.ACTIVO,
        tenant: { estado: TenantEstado.ACTIVO },
      },
      select: {
        tenantId: true,
        role: true,
        tenant: { select: { nombre: true } },
      },
      orderBy: { tenantId: 'asc' },
    });
  }

  buscarActiva(
    usuarioId: number,
    tenantId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.userTenant.findUnique({
      where: {
        usuarioId_tenantId: { usuarioId, tenantId },
        estado: UserTenantEstado.ACTIVO,
      },
      select: { id: true },
    });
  }
}
