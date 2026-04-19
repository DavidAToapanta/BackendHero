import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ModuleKey,
  Prisma,
  SaasPlan,
  TenantEstado,
  TenantRole,
  TipoNegocio,
  UserTenantEstado,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateSaasPlanDto } from './dto/update-saas-plan.dto';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

const tenantDetailInclude = {
  modules: {
    orderBy: { module: 'asc' },
  },
  users: {
    orderBy: { id: 'asc' },
    include: {
      usuario: {
        select: {
          id: true,
          email: true,
          userName: true,
          nombres: true,
          apellidos: true,
          cedula: true,
        },
      },
    },
  },
} satisfies Prisma.TenantInclude;

@Injectable()
export class TenantService {
  private readonly defaultTenantName = 'Gym Principal';
  private readonly defaultTenantSlug = 'gym-principal';

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    const nombre = dto.nombre.trim();
    if (!nombre) {
      throw new BadRequestException('El nombre del tenant es obligatorio');
    }

    const slug = await this.resolveSlug(nombre, dto.slug);
    const modules = this.resolveModules(dto);

    if (dto.ownerUserId) {
      await this.ensureUsuarioExists(dto.ownerUserId);
    }

    return this.prisma.tenant.create({
      data: {
        nombre,
        slug,
        tipoNegocio: dto.tipoNegocio,
        estado: dto.estado ?? TenantEstado.ACTIVO,
        email: this.normalizeOptionalString(dto.email)?.toLowerCase() ?? null,
        telefono: this.normalizeOptionalString(dto.telefono),
        direccion: this.normalizeOptionalString(dto.direccion),
        ciudad: this.normalizeOptionalString(dto.ciudad),
        pais: this.normalizeOptionalString(dto.pais),
        logoUrl: this.normalizeOptionalString(dto.logoUrl),
        descripcion: this.normalizeOptionalString(dto.descripcion),
        latitud: dto.latitud ?? null,
        longitud: dto.longitud ?? null,
        modules: {
          create: modules.map((module) => ({
            module,
            activo: true,
          })),
        },
        users: dto.ownerUserId
          ? {
              create: {
                usuarioId: dto.ownerUserId,
                role: TenantRole.OWNER,
                estado: UserTenantEstado.ACTIVO,
              },
            }
          : undefined,
      },
      include: tenantDetailInclude,
    });
  }

  async findAll() {
    return this.prisma.tenant.findMany({
      orderBy: { id: 'asc' },
      include: tenantDetailInclude,
    });
  }

  async findOne(id: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: tenantDetailInclude,
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    return tenant;
  }

  async updateSaasPlan(id: number, dto: UpdateSaasPlanDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: tenantDetailInclude,
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    if (tenant.saasPlan === dto.saasPlan) {
      return tenant;
    }

    return this.prisma.tenant.update({
      where: { id },
      data: {
        saasPlan: dto.saasPlan,
      },
      include: tenantDetailInclude,
    });
  }

  async rotateBridgeKey(id: number) {
    await this.findOne(id);

    const bridgeKey = `bh_${id}_${randomBytes(24).toString('hex')}`;
    const bridgeKeyHash = await bcrypt.hash(bridgeKey, 10);

    await this.prisma.tenant.update({
      where: { id },
      data: { bridgeKeyHash },
    });

    return {
      tenantId: id,
      bridgeKey,
      headerName: 'x-bridge-key',
    };
  }

  async findDefaultTenant() {
    await this.ensureLegacyDefaultTenant();

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: this.defaultTenantSlug },
      include: tenantDetailInclude,
    });

    if (!tenant) {
      throw new NotFoundException('Tenant legacy por defecto no encontrado');
    }

    return tenant;
  }

  async ensureLegacyDefaultTenant(prisma: PrismaExecutor = this.prisma) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: this.defaultTenantSlug },
      update: {},
      create: {
        nombre: this.defaultTenantName,
        slug: this.defaultTenantSlug,
        tipoNegocio: TipoNegocio.GYM,
        estado: TenantEstado.ACTIVO,
      },
    });

    await prisma.tenantModule.upsert({
      where: {
        tenantId_module: {
          tenantId: tenant.id,
          module: ModuleKey.GYM,
        },
      },
      update: {
        activo: true,
      },
      create: {
        tenantId: tenant.id,
        module: ModuleKey.GYM,
        activo: true,
      },
    });

    return tenant;
  }

  async ensureLegacyMembership(
    usuarioId: number,
    legacyRole: string,
    prisma: PrismaExecutor = this.prisma,
  ) {
    const tenantRole = await this.resolveLegacyTenantRole(legacyRole, prisma);

    if (!tenantRole) {
      return null;
    }

    const tenant = await this.ensureLegacyDefaultTenant(prisma);

    return prisma.userTenant.upsert({
      where: {
        usuarioId_tenantId: {
          usuarioId,
          tenantId: tenant.id,
        },
      },
      update: {
        role: tenantRole,
        estado: UserTenantEstado.ACTIVO,
      },
      create: {
        usuarioId,
        tenantId: tenant.id,
        role: tenantRole,
        estado: UserTenantEstado.ACTIVO,
      },
    });
  }

  private async resolveSlug(nombre: string, requestedSlug?: string) {
    const normalizedRequestedSlug = this.normalizeOptionalString(requestedSlug);
    if (normalizedRequestedSlug) {
      const slug = this.slugify(normalizedRequestedSlug);
      if (!slug) {
        throw new BadRequestException('Slug invalido');
      }
      const existing = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (existing) {
        throw new BadRequestException('Ya existe un tenant con ese slug');
      }

      return slug;
    }

    const slugBase = this.slugify(nombre) || 'tenant';
    let slug = slugBase;
    let suffix = 2;

    while (
      await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      })
    ) {
      slug = `${slugBase}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private resolveModules(dto: CreateTenantDto) {
    if (dto.modules?.length) {
      return [...new Set(dto.modules)];
    }

    switch (dto.tipoNegocio) {
      case TipoNegocio.STORE:
        return [ModuleKey.STORE];
      case TipoNegocio.MIXTO:
        return [ModuleKey.GYM, ModuleKey.STORE];
      case TipoNegocio.GYM:
      default:
        return [ModuleKey.GYM];
    }
  }

  private async resolveLegacyTenantRole(
    legacyRole: string,
    prisma: PrismaExecutor,
  ) {
    switch ((legacyRole || '').toLowerCase()) {
      case 'administrador': {
        const ownerMembership = await prisma.userTenant.findFirst({
          where: {
            tenant: { slug: this.defaultTenantSlug },
            role: TenantRole.OWNER,
          },
          select: { id: true },
        });

        return ownerMembership ? TenantRole.ADMIN : TenantRole.OWNER;
      }
      case 'entrenador':
        return TenantRole.ENTRENADOR;
      case 'recepcionista':
        return TenantRole.RECEPCIONISTA;
      default:
        return null;
    }
  }

  private async ensureUsuarioExists(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true },
    });

    if (!usuario) {
      throw new BadRequestException('Usuario owner no encontrado');
    }
  }

  private normalizeOptionalString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
