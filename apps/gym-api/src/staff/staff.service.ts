import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TenantRole, UserTenantEstado } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

const requiresStaffProfileRole = (tenantRole: TenantRole) =>
  tenantRole === TenantRole.ENTRENADOR ||
  tenantRole === TenantRole.RECEPCIONISTA;

const staffProfileSelect = {
  id: true,
  tenantId: true,
  tenantRole: true,
  horario: true,
  sueldo: true,
} satisfies Prisma.StaffProfileSelect;

const usuarioStaffSelect = {
  id: true,
  email: true,
  userName: true,
  nombres: true,
  apellidos: true,
  cedula: true,
  fechaNacimiento: true,
  staffProfiles: {
    select: staffProfileSelect,
  },
} satisfies Prisma.UsuarioSelect;

const staffMembershipInclude = {
  usuario: {
    select: usuarioStaffSelect,
  },
} satisfies Prisma.UserTenantInclude;

const usuarioIdentidadSelect = {
  id: true,
  email: true,
  userName: true,
  nombres: true,
  apellidos: true,
  cedula: true,
  fechaNacimiento: true,
} satisfies Prisma.UsuarioSelect;

const usuarioIdSelect = {
  id: true,
} satisfies Prisma.UsuarioSelect;

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type StaffMembership = Prisma.UserTenantGetPayload<{
  include: typeof staffMembershipInclude;
}>;

type UsuarioIdentidad = Prisma.UsuarioGetPayload<{
  select: typeof usuarioIdentidadSelect;
}>;

type CoincidenciasUsuarioStaff = {
  usuarioPorCedula: UsuarioIdentidad | null;
  usuarioPorEmail: UsuarioIdentidad | null;
  usuarioPorUserName: UsuarioIdentidad | null;
};

type UsuarioStaffData = {
  nombres: string;
  apellidos: string;
  cedula: string;
  fechaNacimiento?: string | null;
  email?: string | null;
  userName?: string | null;
  password: string;
};

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStaffDto, tenantId?: number) {
    this.assertManagedFieldsNotProvided(dto);

    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const nombres = this.normalizeRequiredString(
      dto.nombres,
      'Los nombres son obligatorios',
    );
    const apellidos = this.normalizeRequiredString(
      dto.apellidos,
      'Los apellidos son obligatorios',
    );
    const cedula = this.normalizeRequiredString(
      dto.cedula,
      'La cedula es obligatoria',
    );
    const fechaNacimiento = this.normalizeOptionalString(dto.fechaNacimiento);
    const email =
      this.normalizeOptionalString(dto.email)?.toLowerCase() ?? null;
    const userName = this.normalizeOptionalString(dto.userName);

    const coincidencias = await this.findUsuarioExistenteParaStaff({
      cedula,
      email,
      userName,
    });
    const usuarioExistente =
      this.validarConsistenciaDeUsuarioExistente(coincidencias);

    try {
      const membership = await this.prisma.$transaction(async (tx) => {
        const usuario = await this.crearUsuarioSiHaceFalta(
          {
            nombres,
            apellidos,
            cedula,
            fechaNacimiento,
            email,
            userName,
            password: dto.password,
          },
          tx,
          usuarioExistente,
        );

        const membershipExistente = await this.findMembershipByUsuarioYTenant(
          usuario.id,
          scopedTenantId,
          tx,
        );

        if (membershipExistente) {
          throw new BadRequestException(
            'Este usuario ya pertenece al staff de este gimnasio',
          );
        }

        await tx.userTenant.create({
          data: {
            usuarioId: usuario.id,
            tenantId: scopedTenantId,
            role: dto.tenantRole,
            estado: UserTenantEstado.ACTIVO,
          },
        });

        await this.syncStaffProfileForRole(
          usuario.id,
          scopedTenantId,
          dto.tenantRole,
          dto.horario,
          dto.sueldo,
          tx,
        );

        return this.findStaffMembershipOrThrow(usuario.id, scopedTenantId, tx);
      });

      return this.mapStaffMembership(membership);
    } catch (error) {
      this.handleStaffConstraintError(error);
    }
  }

  async findAll(
    filters?: {
      role?: TenantRole;
      estado?: UserTenantEstado;
    },
    tenantId?: number,
  ) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const memberships = await this.prisma.userTenant.findMany({
      where: {
        tenantId: scopedTenantId,
        ...(filters?.role ? { role: filters.role } : {}),
        ...(filters?.estado ? { estado: filters.estado } : {}),
      },
      include: staffMembershipInclude,
      orderBy: [{ estado: 'asc' }, { usuarioId: 'asc' }],
    });

    return memberships.map((membership) => this.mapStaffMembership(membership));
  }

  async findOne(usuarioId: number, tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const membership = await this.findStaffMembershipOrThrow(
      usuarioId,
      scopedTenantId,
    );

    return this.mapStaffMembership(membership);
  }

  async update(usuarioId: number, dto: UpdateStaffDto, tenantId?: number) {
    this.assertManagedFieldsNotProvided(dto);

    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const membership = await this.findStaffMembershipOrThrow(
      usuarioId,
      scopedTenantId,
    );
    const tenantRole = dto.tenantRole ?? membership.role;

    try {
      await this.prisma.$transaction(async (tx) => {
        const usuarioData = await this.buildUsuarioUpdateData(usuarioId, dto);

        if (Object.keys(usuarioData).length > 0) {
          await tx.usuario.update({
            where: { id: usuarioId },
            data: usuarioData,
          });
        }

        if (dto.tenantRole) {
          await tx.userTenant.update({
            where: { id: membership.id },
            data: { role: dto.tenantRole },
          });
        }

        if (
          dto.horario !== undefined ||
          dto.sueldo !== undefined ||
          requiresStaffProfileRole(tenantRole)
        ) {
          await this.syncStaffProfileForRole(
            usuarioId,
            scopedTenantId,
            tenantRole,
            dto.horario,
            dto.sueldo,
            tx,
            membership,
          );
        }
      });
    } catch (error) {
      this.handleStaffConstraintError(error);
    }

    return this.findOne(usuarioId, scopedTenantId);
  }

  async inactivar(usuarioId: number, tenantId?: number) {
    return this.updateMembershipEstado(
      usuarioId,
      UserTenantEstado.INACTIVO,
      tenantId,
    );
  }

  async reactivar(usuarioId: number, tenantId?: number) {
    return this.updateMembershipEstado(
      usuarioId,
      UserTenantEstado.ACTIVO,
      tenantId,
    );
  }

  private async updateMembershipEstado(
    usuarioId: number,
    estado: UserTenantEstado,
    tenantId?: number,
  ) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const membership = await this.findStaffMembershipOrThrow(
      usuarioId,
      scopedTenantId,
    );

    await this.prisma.userTenant.update({
      where: { id: membership.id },
      data: { estado },
    });

    return this.findOne(usuarioId, scopedTenantId);
  }

  private async buildUsuarioUpdateData(usuarioId: number, dto: UpdateStaffDto) {
    const data: Prisma.UsuarioUpdateInput = {};

    if (dto.nombres !== undefined) {
      data.nombres = this.normalizeRequiredString(
        dto.nombres,
        'Los nombres son obligatorios',
      );
    }

    if (dto.apellidos !== undefined) {
      data.apellidos = this.normalizeRequiredString(
        dto.apellidos,
        'Los apellidos son obligatorios',
      );
    }

    if (dto.cedula !== undefined) {
      const cedula = this.normalizeRequiredString(
        dto.cedula,
        'La cedula es obligatoria',
      );
      await this.assertUsuarioFieldDisponible(usuarioId, 'cedula', cedula);
      data.cedula = cedula;
    }

    if (dto.email !== undefined) {
      const email =
        this.normalizeOptionalString(dto.email)?.toLowerCase() ?? null;
      if (email) {
        await this.assertUsuarioFieldDisponible(usuarioId, 'email', email);
      }
      data.email = email;
    }

    if (dto.userName !== undefined) {
      const userName = this.normalizeOptionalString(dto.userName);
      if (userName) {
        await this.assertUsuarioFieldDisponible(
          usuarioId,
          'userName',
          userName,
        );
      }
      data.userName = userName;
    }

    if (dto.fechaNacimiento !== undefined) {
      data.fechaNacimiento = this.normalizeOptionalString(dto.fechaNacimiento);
    }

    if (dto.password !== undefined) {
      const password = this.normalizeRequiredString(
        dto.password,
        'La contrasena es obligatoria',
      );
      data.password = await bcrypt.hash(password, 10);
    }

    return data;
  }

  private async assertUsuarioFieldDisponible(
    usuarioId: number,
    field: 'cedula' | 'email' | 'userName',
    value: string,
  ) {
    let existente: Prisma.UsuarioGetPayload<{
      select: typeof usuarioIdSelect;
    }> | null;

    switch (field) {
      case 'cedula':
        existente = await this.prisma.usuario.findUnique({
          where: { cedula: value },
          select: usuarioIdSelect,
        });
        break;
      case 'email':
        existente = await this.prisma.usuario.findUnique({
          where: { email: value },
          select: usuarioIdSelect,
        });
        break;
      case 'userName':
        existente = await this.prisma.usuario.findUnique({
          where: { userName: value },
          select: usuarioIdSelect,
        });
        break;
    }

    if (existente && existente.id !== usuarioId) {
      switch (field) {
        case 'cedula':
          throw new BadRequestException('Ya existe un usuario con esa cedula');
        case 'email':
          throw new BadRequestException(
            'El email ingresado ya pertenece a otro usuario',
          );
        case 'userName':
          throw new BadRequestException(
            'El userName ingresado ya pertenece a otro usuario',
          );
      }
    }
  }

  private async findUsuarioExistenteParaStaff({
    cedula,
    email,
    userName,
  }: {
    cedula: string;
    email?: string | null;
    userName?: string | null;
  }): Promise<CoincidenciasUsuarioStaff> {
    const [usuarioPorCedula, usuarioPorEmail, usuarioPorUserName] =
      await Promise.all([
        this.prisma.usuario.findUnique({
          where: { cedula },
          select: usuarioIdentidadSelect,
        }),
        email
          ? this.prisma.usuario.findUnique({
              where: { email },
              select: usuarioIdentidadSelect,
            })
          : Promise.resolve(null),
        userName
          ? this.prisma.usuario.findUnique({
              where: { userName },
              select: usuarioIdentidadSelect,
            })
          : Promise.resolve(null),
      ]);

    return {
      usuarioPorCedula,
      usuarioPorEmail,
      usuarioPorUserName,
    };
  }

  private validarConsistenciaDeUsuarioExistente({
    usuarioPorCedula,
    usuarioPorEmail,
    usuarioPorUserName,
  }: CoincidenciasUsuarioStaff) {
    if (usuarioPorCedula) {
      if (usuarioPorEmail && usuarioPorEmail.id !== usuarioPorCedula.id) {
        throw new BadRequestException(
          'El email ingresado ya pertenece a otro usuario',
        );
      }

      if (usuarioPorUserName && usuarioPorUserName.id !== usuarioPorCedula.id) {
        throw new BadRequestException(
          'El userName ingresado ya pertenece a otro usuario',
        );
      }

      return usuarioPorCedula;
    }

    if (usuarioPorEmail) {
      throw new BadRequestException(
        'El email ingresado ya pertenece a otro usuario',
      );
    }

    if (usuarioPorUserName) {
      throw new BadRequestException(
        'El userName ingresado ya pertenece a otro usuario',
      );
    }

    return null;
  }

  private async crearUsuarioSiHaceFalta(
    data: UsuarioStaffData,
    prismaClient: PrismaExecutor,
    usuarioExistente?: UsuarioIdentidad | null,
  ) {
    if (usuarioExistente) {
      return usuarioExistente;
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return prismaClient.usuario.create({
      data: {
        nombres: data.nombres,
        apellidos: data.apellidos,
        cedula: data.cedula,
        fechaNacimiento: data.fechaNacimiento ?? null,
        email: data.email ?? null,
        userName: data.userName ?? null,
        password: hashedPassword,
      },
      select: usuarioIdentidadSelect,
    });
  }

  private async findMembershipByUsuarioYTenant(
    usuarioId: number,
    tenantId: number,
    prismaClient: PrismaExecutor = this.prisma,
  ) {
    return prismaClient.userTenant.findFirst({
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

  private async findStaffMembershipOrThrow(
    usuarioId: number,
    tenantId: number,
    prismaClient: PrismaExecutor = this.prisma,
  ) {
    const membership = await prismaClient.userTenant.findFirst({
      where: { usuarioId, tenantId },
      include: staffMembershipInclude,
    });

    if (!membership) {
      throw new NotFoundException('Staff no encontrado en este tenant');
    }

    return membership;
  }

  private async syncStaffProfileForRole(
    usuarioId: number,
    tenantId: number,
    tenantRole: TenantRole,
    horario: string | undefined,
    sueldo: number | undefined,
    prismaClient: PrismaExecutor,
    membership?: StaffMembership,
  ) {
    if (!requiresStaffProfileRole(tenantRole)) {
      if (horario !== undefined || sueldo !== undefined) {
        throw new BadRequestException(
          'Horario y sueldo solo aplican para entrenador o recepcionista',
        );
      }

      return;
    }

    const perfilActual =
      membership?.usuario.staffProfiles.find(
        (profile) =>
          profile.tenantId === tenantId && profile.tenantRole === tenantRole,
      ) ?? null;
    const horarioFinal =
      this.normalizeOptionalString(horario) ?? perfilActual?.horario ?? null;
    const sueldoFinal = sueldo ?? perfilActual?.sueldo ?? null;

    if (!horarioFinal || sueldoFinal === null || sueldoFinal === undefined) {
      throw new BadRequestException(
        `Horario y sueldo requeridos para ${tenantRole.toLowerCase()}`,
      );
    }

    const perfilExistente = await prismaClient.staffProfile.findFirst({
      where: {
        usuarioId,
        tenantId,
        tenantRole,
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    if (perfilExistente) {
      await prismaClient.staffProfile.update({
        where: { id: perfilExistente.id },
        data: {
          horario: horarioFinal,
          sueldo: sueldoFinal,
        },
      });
      return;
    }

    await prismaClient.staffProfile.create({
      data: {
        usuarioId,
        tenantId,
        tenantRole,
        horario: horarioFinal,
        sueldo: sueldoFinal,
      },
    });
  }

  private mapStaffMembership(membership: StaffMembership) {
    const staffProfile =
      membership.usuario.staffProfiles.find(
        (profile) =>
          profile.tenantId === membership.tenantId &&
          profile.tenantRole === membership.role,
      ) ?? null;

    return {
      usuarioId: membership.usuarioId,
      tenantId: membership.tenantId,
      tenantRole: membership.role,
      estado: membership.estado,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
      usuario: {
        id: membership.usuario.id,
        email: membership.usuario.email,
        userName: membership.usuario.userName,
        nombres: membership.usuario.nombres,
        apellidos: membership.usuario.apellidos,
        cedula: membership.usuario.cedula,
        fechaNacimiento: membership.usuario.fechaNacimiento,
      },
      horario: staffProfile?.horario ?? null,
      sueldo: staffProfile?.sueldo ?? null,
    };
  }

  private handleStaffConstraintError(error: unknown): never {
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

      if (targets.includes('email')) {
        throw new BadRequestException(
          'El email ingresado ya pertenece a otro usuario',
        );
      }

      if (targets.includes('userName')) {
        throw new BadRequestException(
          'El userName ingresado ya pertenece a otro usuario',
        );
      }

      if (
        targets.includes('UserTenant_usuarioId_tenantId_key') ||
        (targets.includes('usuarioId') && targets.includes('tenantId'))
      ) {
        throw new BadRequestException(
          'Este usuario ya pertenece al staff de este gimnasio',
        );
      }
    }

    throw error;
  }

  private assertManagedFieldsNotProvided(dto: CreateStaffDto | UpdateStaffDto) {
    if ('tenantId' in dto) {
      throw new BadRequestException('tenantId no debe enviarse en el body');
    }

    if ('usuarioId' in dto) {
      throw new BadRequestException('usuarioId no debe enviarse en el body');
    }

    if ('estado' in dto) {
      throw new BadRequestException('estado no debe enviarse en el body');
    }
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
}
