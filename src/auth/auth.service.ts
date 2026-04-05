import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ModuleKey,
  Prisma,
  TenantEstado,
  TenantRole,
  TipoNegocio,
  UserTenantEstado,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { SelectContextDto } from './dto/select-context.dto';
import {
  AUTH_ACCESS_MODES,
  AvailableAuthContext,
  AuthAccessMode,
  ContextSelectionTokenPayload,
} from './auth.types';

type AuthenticatedUser = {
  id: number;
  email: string | null;
  userName: string | null;
  cedula: string;
  password: string;
};

type TokenUser = Omit<AuthenticatedUser, 'password'>;

type ContextSelectionResponse = {
  requiresContextSelection: true;
  selectionToken: string;
  requestedAccessMode: AuthAccessMode;
  contexts: AvailableAuthContext[];
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async registerOwner(dto: RegisterDto) {
    const cedula = this.normalizeRequiredString(
      dto.cedula,
      'La cedula es obligatoria',
    );
    const email = this.normalizeRequiredString(
      dto.email,
      'El email es obligatorio',
    ).toLowerCase();
    const nombres = this.normalizeRequiredString(
      dto.nombres,
      'Los nombres son obligatorios',
    );
    const apellidos = this.normalizeRequiredString(
      dto.apellidos,
      'Los apellidos son obligatorios',
    );
    const tenantNombre = this.normalizeRequiredString(
      dto.tenantNombre,
      'El nombre del tenant es obligatorio',
    );
    const userName = this.normalizeOptionalString(dto.userName);

    await this.validarCamposUnicos({ cedula, email, userName });
    const tenantSlug = await this.resolveRegisterOwnerSlug(
      tenantNombre,
      dto.tenantSlug,
    );

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    try {
      await this.prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.create({
          data: {
            cedula,
            email,
            userName,
            password: hashedPassword,
            nombres,
            apellidos,
          },
        });

        const tenant = await tx.tenant.create({
          data: {
            nombre: tenantNombre,
            slug: tenantSlug,
            tipoNegocio: TipoNegocio.GYM,
            estado: TenantEstado.ACTIVO,
            email:
              this.normalizeOptionalString(dto.tenantEmail)?.toLowerCase() ??
              null,
            telefono: this.normalizeOptionalString(dto.telefono),
            direccion: this.normalizeOptionalString(dto.direccion),
            ciudad: this.normalizeOptionalString(dto.ciudad),
            pais: this.normalizeOptionalString(dto.pais),
            logoUrl: this.normalizeOptionalString(dto.logoUrl),
            descripcion: this.normalizeOptionalString(dto.descripcion),
          },
        });

        await tx.userTenant.create({
          data: {
            usuarioId: usuario.id,
            tenantId: tenant.id,
            role: TenantRole.OWNER,
            estado: UserTenantEstado.ACTIVO,
          },
        });

        await tx.tenantModule.create({
          data: {
            tenantId: tenant.id,
            module: ModuleKey.GYM,
            activo: true,
          },
        });
      });
    } catch (error) {
      this.handleRegisterOwnerConstraintError(error);
    }

    return this.login(cedula, dto.password);
  }

  async login(
    cedula: string,
    password: string,
    accessMode: AuthAccessMode = 'PLATFORM',
  ): Promise<{ access_token: string } | ContextSelectionResponse> {
    const usuario = await this.loginBase(cedula, password);
    const contexts = await this.buildAvailableContexts(usuario.id);

    if (contexts.length === 0) {
      throw new UnauthorizedException(
        'El usuario no tiene contextos disponibles',
      );
    }

    if (contexts.length === 1) {
      return this.issueTokenForContext(usuario, contexts[0], accessMode);
    }

    return {
      requiresContextSelection: true,
      selectionToken: this.issueContextSelectionToken(usuario.id),
      requestedAccessMode: accessMode,
      contexts,
    };
  }

  async selectContext(dto: SelectContextDto) {
    const usuarioId = this.verifyContextSelectionToken(dto.selectionToken);
    const usuario = await this.findTokenUserOrThrow(usuarioId);
    const context = await this.validateSelectedContext(usuarioId, dto);

    return this.issueTokenForContext(usuario, context, dto.accessMode);
  }

  private async loginBase(
    cedula: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const normalizedCedula = this.normalizeRequiredString(
      cedula,
      'La cedula es obligatoria',
    );
    const normalizedPassword = this.normalizeRequiredString(
      password,
      'La contrasena es obligatoria',
    );

    const usuario = await this.prisma.usuario.findUnique({
      where: { cedula: normalizedCedula },
      select: {
        id: true,
        email: true,
        userName: true,
        cedula: true,
        password: true,
      },
    });

    if (!usuario) {
      throw new UnauthorizedException('Cedula no encontrada');
    }

    const valid = await bcrypt.compare(normalizedPassword, usuario.password);
    if (!valid) {
      throw new UnauthorizedException('Contrasena incorrecta');
    }

    return usuario;
  }

  private async findTokenUserOrThrow(usuarioId: number): Promise<TokenUser> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        email: true,
        userName: true,
        cedula: true,
      },
    });

    if (!usuario) {
      throw new UnauthorizedException(
        'No se pudo resolver el usuario autenticado',
      );
    }

    return usuario;
  }

  private async buildAvailableContexts(
    usuarioId: number,
  ): Promise<AvailableAuthContext[]> {
    const [clienteContexts, staffContexts] = await Promise.all([
      this.buildClienteContexts(usuarioId),
      this.buildStaffContexts(usuarioId),
    ]);

    return [...clienteContexts, ...staffContexts].sort((left, right) => {
      if (left.tenantId !== right.tenantId) {
        return left.tenantId - right.tenantId;
      }

      if (left.type !== right.type) {
        return left.type.localeCompare(right.type);
      }

      return left.tenantNombre.localeCompare(right.tenantNombre);
    });
  }

  private async buildClienteContexts(
    usuarioId: number,
  ): Promise<AvailableAuthContext[]> {
    const clientes = await this.prisma.cliente.findMany({
      where: {
        usuarioId,
        activo: true,
        tenant: {
          estado: TenantEstado.ACTIVO,
        },
      },
      select: {
        id: true,
        tenantId: true,
        tenant: {
          select: {
            nombre: true,
          },
        },
      },
      orderBy: [{ tenantId: 'asc' }, { id: 'asc' }],
    });

    return clientes.map((cliente) => ({
      type: 'CLIENTE',
      tenantId: cliente.tenantId,
      tenantNombre: cliente.tenant.nombre,
      clienteId: cliente.id,
      tenantRole: null,
      allowedModes: this.resolveAllowedModes('CLIENTE'),
    }));
  }

  private async buildStaffContexts(
    usuarioId: number,
  ): Promise<AvailableAuthContext[]> {
    const memberships = await this.prisma.userTenant.findMany({
      where: {
        usuarioId,
        estado: UserTenantEstado.ACTIVO,
        tenant: {
          estado: TenantEstado.ACTIVO,
        },
      },
      select: {
        tenantId: true,
        role: true,
        tenant: {
          select: {
            nombre: true,
          },
        },
      },
      orderBy: { tenantId: 'asc' },
    });

    return memberships.map((membership) => ({
      type: 'STAFF',
      tenantId: membership.tenantId,
      tenantNombre: membership.tenant.nombre,
      clienteId: null,
      tenantRole: membership.role,
      allowedModes: this.resolveAllowedModes('STAFF', membership.role),
    }));
  }

  private resolveAllowedModes(
    type: AvailableAuthContext['type'],
    tenantRole?: TenantRole | null,
  ): AuthAccessMode[] {
    if (type === 'CLIENTE') {
      return [...AUTH_ACCESS_MODES];
    }

    switch (tenantRole) {
      case TenantRole.ADMIN:
      case TenantRole.RECEPCIONISTA:
        return [...AUTH_ACCESS_MODES];
      case TenantRole.OWNER:
      case TenantRole.ENTRENADOR:
      case TenantRole.CAJERO:
      case TenantRole.EMPLEADO:
      default:
        return ['PLATFORM'];
    }
  }

  private issueContextSelectionToken(usuarioId: number) {
    return this.jwtService.sign(
      {
        sub: usuarioId,
        tokenType: 'CONTEXT_SELECTION',
      } satisfies ContextSelectionTokenPayload,
      { expiresIn: '10m' },
    );
  }

  private verifyContextSelectionToken(selectionToken: string) {
    try {
      const payload =
        this.jwtService.verify<ContextSelectionTokenPayload>(selectionToken);

      if (payload?.tokenType !== 'CONTEXT_SELECTION') {
        throw new UnauthorizedException('Selection token invalido');
      }

      return payload.sub;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Selection token invalido');
    }
  }

  private async validateSelectedContext(
    usuarioId: number,
    dto: SelectContextDto,
  ) {
    const contexts = await this.buildAvailableContexts(usuarioId);
    const selectedContext = contexts.find((context) => {
      if (context.type !== dto.type || context.tenantId !== dto.tenantId) {
        return false;
      }

      if (context.type === 'CLIENTE') {
        return context.clienteId === dto.clienteId;
      }

      return context.tenantRole === dto.tenantRole;
    });

    if (!selectedContext) {
      throw new BadRequestException(
        'El contexto seleccionado no pertenece al usuario',
      );
    }

    if (!selectedContext.allowedModes.includes(dto.accessMode)) {
      throw new BadRequestException(
        'El modo de acceso seleccionado no esta permitido para este contexto',
      );
    }

    return selectedContext;
  }

  private issueTokenForContext(
    usuario: TokenUser,
    context: AvailableAuthContext,
    accessMode: AuthAccessMode,
  ) {
    if (!context.allowedModes.includes(accessMode)) {
      throw new BadRequestException(
        'El modo de acceso seleccionado no esta permitido para este contexto',
      );
    }

    return {
      access_token: this.jwtService.sign({
        sub: usuario.id,
        email: usuario.email,
        userName: usuario.userName,
        cedula: usuario.cedula,
        rol:
          context.type === 'CLIENTE'
            ? 'CLIENTE'
            : this.mapTenantRoleToLegacyRole(context.tenantRole),
        tenantId: context.tenantId,
        clienteId: context.clienteId,
        tenantRole: context.tenantRole,
        accessMode,
      }),
    };
  }

  private mapTenantRoleToLegacyRole(tenantRole: TenantRole) {
    switch (tenantRole) {
      case TenantRole.OWNER:
      case TenantRole.ADMIN:
        return 'ADMIN';
      case TenantRole.RECEPCIONISTA:
        return 'RECEPCIONISTA';
      case TenantRole.ENTRENADOR:
        return 'ENTRENADOR';
      case TenantRole.CAJERO:
        return 'CAJERO';
      case TenantRole.EMPLEADO:
        return 'EMPLEADO';
      default:
        return 'SIN_ROL';
    }
  }

  private async validarCamposUnicos({
    cedula,
    email,
    userName,
  }: {
    cedula: string;
    email: string;
    userName?: string | null;
  }) {
    const [usuarioPorCedula, usuarioPorUserName, usuarioPorEmail] =
      await Promise.all([
        this.prisma.usuario.findUnique({
          where: { cedula },
          select: { id: true },
        }),
        userName
          ? this.prisma.usuario.findUnique({
              where: { userName },
              select: { id: true },
            })
          : Promise.resolve(null),
        this.prisma.usuario.findUnique({
          where: { email },
          select: { id: true },
        }),
      ]);

    if (usuarioPorCedula) {
      throw new BadRequestException('Ya existe un usuario con esa cedula');
    }

    if (usuarioPorUserName) {
      throw new BadRequestException('Ya existe un usuario con ese userName');
    }

    if (usuarioPorEmail) {
      throw new BadRequestException('Ya existe un usuario con ese email');
    }
  }

  private async resolveRegisterOwnerSlug(
    nombre: string,
    requestedSlug?: string,
  ) {
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

  private handleRegisterOwnerConstraintError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = error.meta?.target;
      const targets = Array.isArray(target)
        ? target.map((value) => String(value))
        : typeof target === 'string'
          ? [target]
          : [];

      if (targets.includes('cedula')) {
        throw new BadRequestException('Ya existe un usuario con esa cedula');
      }

      if (targets.includes('userName')) {
        throw new BadRequestException('Ya existe un usuario con ese userName');
      }

      if (targets.includes('email')) {
        throw new BadRequestException('Ya existe un usuario con ese email');
      }

      if (targets.includes('slug')) {
        throw new BadRequestException('Ya existe un tenant con ese slug');
      }
    }

    throw error;
  }

  private normalizeRequiredString(value: string | undefined, message: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
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
