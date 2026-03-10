import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Injectable()
export class ClienteService {
  constructor(private prisma: PrismaService) {}

  private async findClienteOrThrow(id: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
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

  create(dto: CreateClienteDto) {
    return this.prisma.cliente.create({
      data: {
        id: dto.usuarioId, // El ID del cliente será el mismo que el del usuario
        usuarioId: dto.usuarioId,
        horario: dto.horario,
        sexo: dto.sexo,
        observaciones: dto.observaciones,
        objetivos: dto.objetivos,
        tiempoEntrenar: dto.tiempoEntrenar,
      },
    });
  }

  async findAll(
    page = 1,
    limit = 10,
    search?: string,
    filters?: {
      activo?: boolean;
      incluirInactivos?: boolean;
    },
  ) {
    const take = Math.max(1, Math.min(limit, 50));
    const currentPage = Math.max(1, page);
    const skip = (currentPage - 1) * take;
    const incluirInactivos = filters?.incluirInactivos ?? false;
    const activo = filters?.activo;

    const trimmedSearch = search?.trim();
    const where: Prisma.ClienteWhereInput = {
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

    // Ejecutamos count y fetch en paralelo para mejor rendimiento
    const [totalItems, clientes] = await Promise.all([
      this.prisma.cliente.count({ where }),
      this.prisma.cliente.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        select: {
          id: true,
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
              activado: true,
              estado: 'ACTIVO',
            },
            take: 1,
            orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
            select: {
              id: true,
              fechaInicio: true,
              fechaFin: true,
              plan: {
                select: {
                  nombre: true,
                },
              },
              deudas: {
                where: { solventada: false },
                select: {
                  id: true,
                  monto: true,
                },
              },
            },
          },
          cambiosPlan: {
            where: {
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
      const { cambiosPlan, ...clienteSinCambiosPlan } = cliente;

      return {
        ...clienteSinCambiosPlan,
        devolucionPendiente,
      };
    });

    // Debug: ver qué deudas se están devolviendo
    data.forEach((c) => {
      if (c.planes?.[0]?.deudas?.length > 0) {
        console.log(
          `[ClienteService] Cliente ${c.usuario?.nombres} tiene deudas:`,
          c.planes[0].deudas.map((d) => ({ id: d.id, monto: d.monto })),
        );
      }
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

  async findOne(id: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
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
              where: { solventada: false },
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
            devolucionPendiente: { gt: 0 },
          },
          select: {
            devolucionPendiente: true,
          },
        },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    const devolucionPendiente = this.sumarDevolucionPendiente(
      cliente.cambiosPlan,
    );
    const { cambiosPlan, ...clienteSinCambiosPlan } = cliente;

    return {
      ...clienteSinCambiosPlan,
      devolucionPendiente,
    };
  }

  async findByUsuarioId(usuarioId: number) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { usuarioId },
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
              where: { solventada: false },
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
            devolucionPendiente: { gt: 0 },
          },
          select: {
            devolucionPendiente: true,
          },
        },
      },
    });
    if (!cliente)
      throw new NotFoundException('Cliente no encontrado para este usuario');
    const devolucionPendiente = this.sumarDevolucionPendiente(
      cliente.cambiosPlan,
    );
    const { cambiosPlan, ...clienteSinCambiosPlan } = cliente;

    return {
      ...clienteSinCambiosPlan,
      devolucionPendiente,
    };
  }

  async update(id: number, dto: UpdateClienteDto) {
    console.log('Actualizar cliente', id, dto);
    await this.findOne(id);
    console.log('Cliente encontrado, procediendo a actualizar');
    return this.prisma.cliente.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    return this.desactivar(id);
  }

  async desactivar(id: number) {
    await this.findClienteOrThrow(id);
    return this.prisma.cliente.update({
      where: { id },
      data: { activo: false },
    });
  }

  async reactivar(id: number) {
    await this.findClienteOrThrow(id);
    return this.prisma.cliente.update({
      where: { id },
      data: { activo: true },
    });
  }

  async findRecientes(limit = 10) {
    // Trae clientes más recientes por id (si no hay createdAt)
    const clientes = await this.prisma.cliente.findMany({
      where: { activo: true },
      orderBy: { id: 'desc' },
      take: limit,
      include: {
        usuario: {
          select: { nombres: true, apellidos: true, userName: true },
        },
        // Último plan del cliente
        planes: {
          where: {
            activado: true,
            estado: 'ACTIVO',
          },
          take: 1,
          orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
          include: { plan: { select: { nombre: true } } },
        },
        cambiosPlan: {
          where: {
            devolucionPendiente: { gt: 0 },
          },
          select: {
            devolucionPendiente: true,
          },
        },
      },
    });
    // Mapea a la forma que necesita el frontend
    return clientes.map((c: any) => {
      const cp = c.planes?.[0];
      const planNombre = cp?.plan?.nombre ?? '—';
      // Estado calculado por fechaFin: activo si hoy <= fechaFin
      let estadoPlan = '—';
      if (cp?.fechaFin) {
        const ahora = new Date();
        const fin = new Date(cp.fechaFin);
        estadoPlan = fin >= ahora ? 'Activo' : 'Vencido';
      }
      // Usar fechaFin en el mapeo
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
}
