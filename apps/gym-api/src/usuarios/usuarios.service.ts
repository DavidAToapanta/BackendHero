import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
  ) {}

  async crear(dto: CreateUsuarioDto) {
    if (!dto.cedula?.trim()) {
      throw new BadRequestException('La cedula es obligatoria');
    }

    await this.validarCamposUnicos(dto);

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const rol = (dto.rol || '').toLowerCase();

    const usuario = await this.prisma.$transaction(async (tx) => {
      const usuarioCreado = await tx.usuario.create({
        data: {
          email: dto.email?.trim().toLowerCase() || null,
          userName: dto.userName?.trim() || null,
          password: hashedPassword,
          nombres: dto.nombres,
          apellidos: dto.apellidos,
          cedula: dto.cedula.trim(),
          fechaNacimiento: dto.fechaNacimiento?.trim() || null,
        },
      });

      switch (rol) {
        case 'administrador':
          await tx.administrador.create({
            data: { usuarioId: usuarioCreado.id },
          });
          await this.tenantService.ensureLegacyMembership(
            usuarioCreado.id,
            rol,
            tx,
          );
          break;
        case 'entrenador':
          if (!dto.horario || dto.sueldo === undefined) {
            throw new BadRequestException(
              'Horario y sueldo requeridos para entrenador',
            );
          }
          await tx.entrenador.create({
            data: {
              usuarioId: usuarioCreado.id,
              horario: dto.horario,
              sueldo: dto.sueldo,
            },
          });
          await this.tenantService.ensureLegacyMembership(
            usuarioCreado.id,
            rol,
            tx,
          );
          break;
        case 'recepcionista':
          if (!dto.horario || dto.sueldo === undefined) {
            throw new BadRequestException(
              'Horario y sueldo requeridos para recepcionista',
            );
          }
          await tx.recepcionista.create({
            data: {
              usuarioId: usuarioCreado.id,
              horario: dto.horario,
              sueldo: dto.sueldo,
            },
          });
          await this.tenantService.ensureLegacyMembership(
            usuarioCreado.id,
            rol,
            tx,
          );
          break;
        case 'cliente': {
          if (
            !dto.horario ||
            !dto.sexo ||
            !dto.observaciones ||
            !dto.objetivos ||
            dto.tiempoEntrenar === undefined
          ) {
            return usuarioCreado;
          }
          const tenant = await this.tenantService.ensureLegacyDefaultTenant(tx);
          await tx.cliente.create({
            data: {
              usuarioId: usuarioCreado.id,
              tenantId: tenant.id,
              horario: dto.horario,
              sexo: dto.sexo,
              observaciones: dto.observaciones,
              objetivos: dto.objetivos,
              tiempoEntrenar: dto.tiempoEntrenar,
            },
          });
          break;
        }
        default:
          throw new BadRequestException('Rol no valido');
      }

      return usuarioCreado;
    });

    const { password: passwordOmitido, ...result } = usuario;
    void passwordOmitido;
    return result;
  }

  async obtenerPorId(id: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      include: {
        administrador: true,
        entrenador: true,
        recepcionista: true,
        cliente: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const { password: passwordOmitido, ...result } = usuario;
    void passwordOmitido;
    return result;
  }

  async findByRol(rol?: string) {
    switch ((rol || '').toLowerCase()) {
      case 'administrador': {
        const rows = await this.prisma.administrador.findMany({
          include: { usuario: true },
        });
        return rows.map((r) => ({
          id: r.usuario.id,
          email: r.usuario.email,
          userName: r.usuario.userName,
          nombres: r.usuario.nombres,
          apellidos: r.usuario.apellidos,
          cedula: r.usuario.cedula,
          rol: 'administrador',
        }));
      }
      case 'entrenador': {
        const rows = await this.prisma.entrenador.findMany({
          include: { usuario: true },
        });
        return rows.map((r) => ({
          id: r.usuario.id,
          email: r.usuario.email,
          userName: r.usuario.userName,
          nombres: r.usuario.nombres,
          apellidos: r.usuario.apellidos,
          cedula: r.usuario.cedula,
          rol: 'entrenador',
        }));
      }
      case 'recepcionista': {
        const rows = await this.prisma.recepcionista.findMany({
          include: { usuario: true },
        });
        return rows.map((r) => ({
          id: r.usuario.id,
          email: r.usuario.email,
          userName: r.usuario.userName,
          nombres: r.usuario.nombres,
          apellidos: r.usuario.apellidos,
          cedula: r.usuario.cedula,
          rol: 'recepcionista',
        }));
      }
      case 'cliente': {
        const rows = await this.prisma.cliente.findMany({
          include: { usuario: true },
        });
        return rows.map((r) => ({
          id: r.usuario.id,
          email: r.usuario.email,
          userName: r.usuario.userName,
          nombres: r.usuario.nombres,
          apellidos: r.usuario.apellidos,
          cedula: r.usuario.cedula,
          rol: 'cliente',
        }));
      }
      default:
        return [];
    }
  }

  async counts() {
    const [administradores, entrenadores, recepcionistas] = await Promise.all([
      this.prisma.administrador.count(),
      this.prisma.entrenador.count(),
      this.prisma.recepcionista.count(),
    ]);
    return { administradores, entrenadores, recepcionistas };
  }

  async eliminar(usuarioId: number) {
    const [clienteCount, staffMembershipCount] = await Promise.all([
      this.prisma.cliente.count({
        where: { usuarioId },
      }),
      this.prisma.userTenant.count({
        where: { usuarioId },
      }),
    ]);

    if (clienteCount > 0) {
      throw new BadRequestException(
        'La eliminacion legacy de usuarios cliente ya no esta soportada; use el flujo tenant-aware',
      );
    }

    if (staffMembershipCount > 0) {
      throw new BadRequestException(
        'La eliminacion legacy de usuarios staff ya no esta soportada; use el flujo /staff por tenant',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const admin = await tx.administrador.findFirst({ where: { usuarioId } });
      if (admin) {
        await tx.administrador.delete({ where: { id: admin.id } });
      }

      const ent = await tx.entrenador.findFirst({ where: { usuarioId } });
      if (ent) {
        await tx.entrenador.delete({ where: { id: ent.id } });
      }

      const rec = await tx.recepcionista.findFirst({ where: { usuarioId } });
      if (rec) {
        await tx.recepcionista.delete({ where: { id: rec.id } });
      }

      await tx.gasto.deleteMany({ where: { usuarioId } });
      await tx.staffProfile.deleteMany({ where: { usuarioId } });
      await tx.usuario.delete({ where: { id: usuarioId } });
    });

    return { ok: true };
  }

  private async validarCamposUnicos(dto: CreateUsuarioDto) {
    const [usuarioPorCedula, usuarioPorUserName, usuarioPorEmail] =
      await Promise.all([
        dto.cedula
          ? this.prisma.usuario.findUnique({
              where: { cedula: dto.cedula.trim() },
              select: { id: true },
            })
          : Promise.resolve(null),
        dto.userName
          ? this.prisma.usuario.findUnique({
              where: { userName: dto.userName.trim() },
              select: { id: true },
            })
          : Promise.resolve(null),
        dto.email
          ? this.prisma.usuario.findUnique({
              where: { email: dto.email.trim().toLowerCase() },
              select: { id: true },
            })
          : Promise.resolve(null),
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
}
