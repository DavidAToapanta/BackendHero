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
import { PrismaService } from '@app/prisma';
import {
  MembresiasPersonalService,
  ModulosNegocioService,
  NegociosService,
} from '@app/negocios';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly negocios: NegociosService,
    private readonly modulos: ModulosNegocioService,
    private readonly membresias: MembresiasPersonalService,
  ) {}

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

    return this.negocios.crear(
      {
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
      },
      {
        include: tenantDetailInclude,
        inicial: { modulos: modules, propietarioId: dto.ownerUserId },
      },
    );
  }

  async findAll() {
    return this.negocios.listar(tenantDetailInclude);
  }

  async findOne(id: number) {
    const tenant = await this.negocios.buscarDetalle(
      { id },
      tenantDetailInclude,
    );

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    return tenant;
  }

  async updateSaasPlan(id: number, dto: UpdateSaasPlanDto) {
    const tenant = await this.findOne(id);

    if (tenant.saasPlan === dto.saasPlan) {
      return tenant;
    }

    return this.negocios.actualizarPlan(id, dto.saasPlan, tenantDetailInclude);
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

    const tenant = await this.negocios.buscarDetalle(
      { slug: this.defaultTenantSlug },
      tenantDetailInclude,
    );

    if (!tenant) {
      throw new NotFoundException('Tenant legacy por defecto no encontrado');
    }

    return tenant;
  }

  async ensureLegacyDefaultTenant(prisma: PrismaExecutor = this.prisma) {
    const tenant = await this.negocios.asegurarPorSlug(
      {
        nombre: this.defaultTenantName,
        slug: this.defaultTenantSlug,
        tipoNegocio: TipoNegocio.GYM,
        estado: TenantEstado.ACTIVO,
      },
      prisma,
    );
    await this.modulos.asegurarActivo(tenant.id, ModuleKey.GYM, prisma);

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

    return this.membresias.asegurar(
      {
        usuarioId,
        tenantId: tenant.id,
        role: tenantRole,
        estado: UserTenantEstado.ACTIVO,
      },
      prisma,
    );
  }

  private async resolveSlug(nombre: string, requestedSlug?: string) {
    const normalizedRequestedSlug = this.normalizeOptionalString(requestedSlug);
    if (normalizedRequestedSlug) {
      const slug = this.slugify(normalizedRequestedSlug);
      if (!slug) {
        throw new BadRequestException('Slug invalido');
      }
      const existing = await this.negocios.buscarIdPorSlug(slug);

      if (existing) {
        throw new BadRequestException('Ya existe un tenant con ese slug');
      }

      return slug;
    }

    const slugBase = this.slugify(nombre) || 'tenant';
    let slug = slugBase;
    let suffix = 2;

    while (await this.negocios.buscarIdPorSlug(slug)) {
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
        const ownerMembership = await this.membresias.buscarIdPorRolEnNegocio(
          this.defaultTenantSlug,
          TenantRole.OWNER,
          prisma,
        );

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
