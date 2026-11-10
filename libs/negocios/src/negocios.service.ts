import { PrismaService } from '@app/prisma';
import { Injectable } from '@nestjs/common';
import {
  ModuleKey,
  Prisma,
  SaasPlan,
  TenantRole,
  UserTenantEstado,
} from '@prisma/client';

type DatosNegocio = Omit<Prisma.TenantCreateInput, 'modules' | 'users'>;

@Injectable()
export class NegociosService {
  constructor(private readonly prisma: PrismaService) {}

  crear<Include extends Prisma.TenantInclude>(
    data: DatosNegocio,
    {
      include,
      inicial,
      tx = this.prisma,
    }: {
      include?: Include;
      inicial?: { modulos: ModuleKey[]; propietarioId?: number };
      tx?: Prisma.TransactionClient;
    } = {},
  ) {
    return tx.tenant.create({
      data: inicial
        ? {
            ...data,
            modules: {
              create: inicial.modulos.map((module) => ({
                module,
                activo: true,
              })),
            },
            users: inicial.propietarioId
              ? {
                  create: {
                    usuarioId: inicial.propietarioId,
                    role: TenantRole.OWNER,
                    estado: UserTenantEstado.ACTIVO,
                  },
                }
              : undefined,
          }
        : data,
      include,
    });
  }

  listar<Include extends Prisma.TenantInclude>(include: Include) {
    return this.prisma.tenant.findMany({ orderBy: { id: 'asc' }, include });
  }

  buscarDetalle<Include extends Prisma.TenantInclude>(
    where: Prisma.TenantWhereUniqueInput,
    include: Include,
  ) {
    return this.prisma.tenant.findUnique({ where, include });
  }

  buscarIdPorSlug(slug: string) {
    return this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
  }

  asegurarPorSlug(
    data: DatosNegocio,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.tenant.upsert({
      where: { slug: data.slug },
      update: {},
      create: data,
    });
  }

  actualizarPlan<Include extends Prisma.TenantInclude>(
    id: number,
    saasPlan: SaasPlan,
    include: Include,
  ) {
    return this.prisma.tenant.update({
      where: { id },
      data: { saasPlan },
      include,
    });
  }

  consultarPlan(id: number) {
    return this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, saasPlan: true },
    });
  }
}
