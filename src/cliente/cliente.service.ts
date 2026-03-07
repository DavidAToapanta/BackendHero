import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Injectable()
export class ClienteService {
  constructor(private prisma: PrismaService) {}

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

  async findAll(page = 1, limit = 10, search?: string) {
    const take = Math.max(1, Math.min(limit, 50));
    const currentPage = Math.max(1, page);
    const skip = (currentPage - 1) * take;

    const trimmedSearch = search?.trim();
    const where: Prisma.ClienteWhereInput = {
      activo: true,
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
            orderBy: { fechaFin: 'desc' },
            take: 1,
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
        },
      }),
    ]);

    // Debug: ver qué deudas se están devolviendo
    clientes.forEach((c) => {
      if (c.planes?.[0]?.deudas?.length > 0) {
        console.log(
          `[ClienteService] Cliente ${c.usuario?.nombres} tiene deudas:`,
          c.planes[0].deudas.map((d) => ({ id: d.id, monto: d.monto })),
        );
      }
    });

    return {
      data: clientes,
      meta: {
        totalItems,
        itemCount: clientes.length,
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
          orderBy: { fechaFin: 'desc' },
          take: 1,
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
      },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return cliente;
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
          orderBy: { fechaFin: 'desc' },
          take: 1,
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
      },
    });
    if (!cliente)
      throw new NotFoundException('Cliente no encontrado para este usuario');
    return cliente;
  }

  async update(id: number, dto: UpdateClienteDto) {
    console.log('Actualizar cliente', id, dto);
    await this.findOne(id);
    console.log('Cliente encontrado, procediendo a actualizar');
    return this.prisma.cliente.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    return this.prisma.cliente.update({
      where: { id },
      data: { activo: false },
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
          orderBy: { fechaFin: 'desc' },
          take: 1,
          include: { plan: { select: { nombre: true } } },
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
      return {
        usuario: c.usuario,
        planNombre,
        estadoPlan,
        fechaRegistro,
      };
    });
  }
}
