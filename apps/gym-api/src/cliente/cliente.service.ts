import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { RegisterClienteDto } from './dto/register-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

const usuarioRegistroSelect = {
  id: true,
  cedula: true,
  email: true,
  userName: true,
  nombres: true,
  apellidos: true,
  fechaNacimiento: true,
} satisfies Prisma.UsuarioSelect;

type UsuarioRegistro = Prisma.UsuarioGetPayload<{
  select: typeof usuarioRegistroSelect;
}>;

type CoincidenciasUsuarioRegistro = {
  usuarioPorCedula: UsuarioRegistro | null;
  usuarioPorEmail: UsuarioRegistro | null;
  usuarioPorUserName: UsuarioRegistro | null;
};

type ClienteRegistroData = {
  usuarioId: number;
  horario: string;
  sexo: string;
  observaciones: string;
  objetivos: string;
  tiempoEntrenar: number;
};

type UsuarioRegistroData = {
  nombres: string;
  apellidos: string;
  cedula: string;
  fechaNacimiento?: string | null;
  email?: string | null;
  userName?: string | null;
  password: string;
};

type PrismaRegistroClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ClienteService {
  constructor(private prisma: PrismaService) {}

  private async findClienteOrThrow(id: number, tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const cliente = await this.prisma.cliente.findFirst({
      where: { id, tenantId: scopedTenantId },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return cliente;
  }

  private sumarDevolucionPendiente(
    cambiosPlan: Array<{ devolucionPendiente: number }>,
  ): number {
    if (!cambiosPlan?.length) {
      return 0;
    }

    const total = cambiosPlan.reduce(
      (acumulado, cambio) => acumulado + (cambio.devolucionPendiente ?? 0),
      0,
    );

    return Number(total.toFixed(2));
  }

  async create(dto: CreateClienteDto, tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );

    return this.prisma.cliente.create({
      data: {
        usuarioId: dto.usuarioId,
        tenantId: scopedTenantId,
        horario: dto.horario,
        sexo: dto.sexo,
        observaciones: dto.observaciones,
        objetivos: dto.objetivos,
        tiempoEntrenar: dto.tiempoEntrenar,
      },
    });
  }

  async registrar(dto: RegisterClienteDto, tenantId: number) {
    this.assertManagedFieldsNotProvided(dto);

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
    const horario = this.normalizeRequiredString(
      dto.horario,
      'El horario es obligatorio',
    );
    const sexo = this.normalizeRequiredString(
      dto.sexo,
      'El sexo es obligatorio',
    );
    const observaciones = this.normalizeRequiredString(
      dto.observaciones,
      'Las observaciones son obligatorias',
    );
    const objetivos = this.normalizeRequiredString(
      dto.objetivos,
      'Los objetivos son obligatorios',
    );
    const email =
      this.normalizeOptionalString(dto.email)?.toLowerCase() ?? null;
    const userName = this.normalizeOptionalString(dto.userName);
    const fechaNacimiento = this.normalizeOptionalString(dto.fechaNacimiento);

    const coincidencias = await this.findUsuarioExistenteParaRegistro({
      cedula,
      email,
      userName,
    });
    const usuarioExistente =
      this.validarConsistenciaDeUsuarioExistente(coincidencias);

    try {
      const usuarioId = await this.prisma.$transaction(async (tx) => {
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

        const clienteExistente = await this.findClienteByUsuarioYTenant(
          usuario.id,
          tenantId,
          tx,
        );

        if (clienteExistente) {
          throw new BadRequestException(
            'Este usuario ya es cliente de este gimnasio',
          );
        }

        await this.crearClienteParaTenant(
          {
            usuarioId: usuario.id,
            horario,
            sexo,
            observaciones,
            objetivos,
            tiempoEntrenar: dto.tiempoEntrenar,
          },
          tenantId,
          tx,
        );

        return usuario.id;
      });

      return this.findByUsuarioId(usuarioId, tenantId);
    } catch (error) {
      this.handleRegisterConstraintError(error);
    }
  }

  async findAll(
    page = 1,
    limit = 10,
    search?: string,
    filters?: {
      activo?: boolean;
      incluirInactivos?: boolean;
    },
    tenantId?: number,
  ) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const take = Math.max(1, Math.min(limit, 50));
    const currentPage = Math.max(1, page);
    const skip = (currentPage - 1) * take;
    const incluirInactivos = filters?.incluirInactivos ?? false;
    const activo = filters?.activo;
    const trimmedSearch = search?.trim();

    const where: Prisma.ClienteWhereInput = {
      tenantId: scopedTenantId,
      ...(activo !== undefined
        ? { activo }
        : incluirInactivos
          ? {}
          : { activo: true }),
      ...(trimmedSearch
        ? {
            OR: [
              {
                usuario: {
                  nombres: { contains: trimmedSearch, mode: 'insensitive' },
                },
              },
              {
                usuario: {
                  apellidos: { contains: trimmedSearch, mode: 'insensitive' },
                },
              },
              {
                usuario: {
                  cedula: { contains: trimmedSearch, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [totalItems, clientes] = await Promise.all([
      this.prisma.cliente.count({ where }),
      this.prisma.cliente.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          tenantId: true,
          horario: true,
          sexo: true,
          objetivos: true,
          tiempoEntrenar: true,
          observaciones: true,
          activo: true,
          usuario: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
              cedula: true,
              fechaNacimiento: true,
            },
          },
          planes: {
            where: {
              tenantId: scopedTenantId,
              activado: true,
              estado: 'ACTIVO',
            },
            take: 1,
            orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
            select: {
              id: true,
              tenantId: true,
              fechaInicio: true,
              fechaFin: true,
              plan: {
                select: {
                  nombre: true,
                },
              },
              deudas: {
                where: { tenantId: scopedTenantId, solventada: false },
                select: {
                  id: true,
                  monto: true,
                },
              },
            },
          },
          cambiosPlan: {
            where: {
              tenantId: scopedTenantId,
              devolucionPendiente: { gt: 0 },
            },
            select: {
              devolucionPendiente: true,
            },
          },
        },
      }),
    ]);

    const data = clientes.map((cliente) => {
      const devolucionPendiente = this.sumarDevolucionPendiente(
        cliente.cambiosPlan,
      );
      const { cambiosPlan: cambiosPlanOmitido, ...clienteSinCambiosPlan } =
        cliente;
      void cambiosPlanOmitido;

      return {
        ...clienteSinCambiosPlan,
        devolucionPendiente,
      };
    });

    return {
      data,
      meta: {
        totalItems,
        itemCount: data.length,
        perPage: take,
        totalPages: Math.ceil(totalItems / take),
        currentPage,
      },
    };
  }

  async findOne(id: number, tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const cliente = await this.prisma.cliente.findFirst({
      where: { id, tenantId: scopedTenantId },
      include: {
        usuario: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            cedula: true,
          },
        },
        planes: {
          where: {
            tenantId: scopedTenantId,
            activado: true,
            estado: 'ACTIVO',
          },
          take: 1,
          orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
          include: {
            plan: {
              select: {
                nombre: true,
                precio: true,
              },
            },
            deudas: {
              where: {
                tenantId: scopedTenantId,
                solventada: false,
              },
              select: {
                id: true,
                monto: true,
                solventada: true,
              },
            },
          },
        },
        cambiosPlan: {
          where: {
            tenantId: scopedTenantId,
            devolucionPendiente: { gt: 0 },
          },
          select: {
            devolucionPendiente: true,
          },
        },
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const devolucionPendiente = this.sumarDevolucionPendiente(
      cliente.cambiosPlan,
    );
    const { cambiosPlan: cambiosPlanOmitido, ...clienteSinCambiosPlan } =
      cliente;
    void cambiosPlanOmitido;

    return {
      ...clienteSinCambiosPlan,
      devolucionPendiente,
    };
  }

  async findByUsuarioId(usuarioId: number, tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const cliente = await this.prisma.cliente.findFirst({
      where: { usuarioId, tenantId: scopedTenantId },
      include: {
        usuario: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            cedula: true,
          },
        },
        planes: {
          where: {
            tenantId: scopedTenantId,
            activado: true,
            estado: 'ACTIVO',
          },
          take: 1,
          orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
          include: {
            plan: {
              select: {
                nombre: true,
                precio: true,
              },
            },
            deudas: {
              where: {
                tenantId: scopedTenantId,
                solventada: false,
              },
              select: {
                id: true,
                monto: true,
                solventada: true,
              },
            },
          },
        },
        cambiosPlan: {
          where: {
            tenantId: scopedTenantId,
            devolucionPendiente: { gt: 0 },
          },
          select: {
            devolucionPendiente: true,
          },
        },
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado para este usuario');
    }

    const devolucionPendiente = this.sumarDevolucionPendiente(
      cliente.cambiosPlan,
    );
    const { cambiosPlan: cambiosPlanOmitido, ...clienteSinCambiosPlan } =
      cliente;
    void cambiosPlanOmitido;

    return {
      ...clienteSinCambiosPlan,
      devolucionPendiente,
    };
  }

  async update(id: number, dto: UpdateClienteDto, tenantId?: number) {
    await this.findOne(id, tenantId);
    return this.prisma.cliente.update({ where: { id }, data: dto });
  }

  async linkZkbioPerson(
    id: number,
    zkbioPersonId: string | null | undefined,
    tenantId?: number,
  ) {
    const cliente = await this.findClienteOrThrow(id, tenantId);
    const normalizedZkbioPersonId = this.normalizeOptionalString(zkbioPersonId);

    try {
      return await this.prisma.cliente.update({
        where: { id: cliente.id },
        data: {
          zkbioPersonId: normalizedZkbioPersonId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Ese zkbioPersonId ya esta vinculado a otro cliente en este tenant',
        );
      }

      throw error;
    }
  }

  async remove(id: number, tenantId?: number) {
    return this.desactivar(id, tenantId);
  }

  async desactivar(id: number, tenantId?: number) {
    await this.findClienteOrThrow(id, tenantId);
    return this.prisma.cliente.update({
      where: { id },
      data: { activo: false },
    });
  }

  async reactivar(id: number, tenantId?: number) {
    await this.findClienteOrThrow(id, tenantId);
    return this.prisma.cliente.update({
      where: { id },
      data: { activo: true },
    });
  }

  async findRecientes(limit = 10, tenantId?: number) {
    const scopedTenantId = await resolveTenantIdOrDefault(
      this.prisma,
      tenantId,
    );
    const clientes = await this.prisma.cliente.findMany({
      where: { activo: true, tenantId: scopedTenantId },
      orderBy: { id: 'desc' },
      take: limit,
      include: {
        usuario: {
          select: { nombres: true, apellidos: true, userName: true },
        },
        planes: {
          where: {
            tenantId: scopedTenantId,
            activado: true,
            estado: 'ACTIVO',
          },
          take: 1,
          orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
          include: { plan: { select: { nombre: true } } },
        },
        cambiosPlan: {
          where: {
            tenantId: scopedTenantId,
            devolucionPendiente: { gt: 0 },
          },
          select: {
            devolucionPendiente: true,
          },
        },
      },
    });

    return clientes.map((c) => {
      const cp = c.planes?.[0];
      const planNombre = cp?.plan?.nombre ?? '-';
      let estadoPlan = '-';
      if (cp?.fechaFin) {
        const ahora = new Date();
        const fin = new Date(cp.fechaFin);
        estadoPlan = fin >= ahora ? 'Activo' : 'Vencido';
      }
      const fechaRegistro = cp?.fechaFin ?? null;
      const devolucionPendiente = this.sumarDevolucionPendiente(
        c.cambiosPlan ?? [],
      );
      return {
        usuario: c.usuario,
        planNombre,
        estadoPlan,
        fechaRegistro,
        devolucionPendiente,
      };
    });
  }

  private async findUsuarioExistenteParaRegistro({
    cedula,
    email,
    userName,
  }: {
    cedula: string;
    email?: string | null;
    userName?: string | null;
  }): Promise<CoincidenciasUsuarioRegistro> {
    const [usuarioPorCedula, usuarioPorEmail, usuarioPorUserName] =
      await Promise.all([
        this.prisma.usuario.findUnique({
          where: { cedula },
          select: usuarioRegistroSelect,
        }),
        email
          ? this.prisma.usuario.findUnique({
              where: { email },
              select: usuarioRegistroSelect,
            })
          : Promise.resolve(null),
        userName
          ? this.prisma.usuario.findUnique({
              where: { userName },
              select: usuarioRegistroSelect,
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
  }: CoincidenciasUsuarioRegistro): UsuarioRegistro | null {
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

  private async findClienteByUsuarioYTenant(
    usuarioId: number,
    tenantId: number,
    prismaClient: PrismaRegistroClient = this.prisma,
  ) {
    return prismaClient.cliente.findFirst({
      where: { usuarioId, tenantId },
      select: { id: true, usuarioId: true, tenantId: true },
    });
  }

  private async crearClienteParaTenant(
    data: ClienteRegistroData,
    tenantId: number,
    prismaClient: PrismaRegistroClient = this.prisma,
  ) {
    return prismaClient.cliente.create({
      data: {
        usuarioId: data.usuarioId,
        tenantId,
        horario: data.horario,
        sexo: data.sexo,
        observaciones: data.observaciones,
        objetivos: data.objetivos,
        tiempoEntrenar: data.tiempoEntrenar,
      },
    });
  }

  private async crearUsuarioSiHaceFalta(
    data: UsuarioRegistroData,
    prismaClient: PrismaRegistroClient = this.prisma,
    usuarioExistente?: UsuarioRegistro | null,
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
      select: usuarioRegistroSelect,
    });
  }

  private handleRegisterConstraintError(error: unknown): never {
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
        targets.includes('Cliente_usuarioId_tenantId_key') ||
        (targets.includes('usuarioId') && targets.includes('tenantId'))
      ) {
        throw new BadRequestException(
          'Este usuario ya es cliente de este gimnasio',
        );
      }
    }

    throw error;
  }

  private assertManagedFieldsNotProvided(dto: RegisterClienteDto) {
    if ('tenantId' in dto) {
      throw new BadRequestException('tenantId no debe enviarse en el body');
    }

    if ('usuarioId' in dto) {
      throw new BadRequestException('usuarioId no debe enviarse en el body');
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
