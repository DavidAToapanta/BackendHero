import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateRutinaDto } from './dto/create-rutina.dto';
import { UpdateRutinaDto } from './dto/update-rutina.dto';

@Injectable()
export class RutinaService {
  constructor(private prisma: PrismaService) {}

  private async getScopedTenantId(tenantId?: number) {
    return resolveTenantIdOrDefault(this.prisma, tenantId);
  }

  private normalizeRutinaBase64(rutina: string) {
    let base64Content = rutina;

    if (base64Content.includes(',')) {
      base64Content = base64Content.split(',')[1];
    }

    if (!base64Content) {
      throw new BadRequestException('Formato de imagen base64 incorrecto');
    }

    return Buffer.from(base64Content, 'base64');
  }

  private async findClienteOrThrow(clienteId: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, tenantId: scopedTenantId },
      select: { id: true, tenantId: true },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return { cliente, tenantId: scopedTenantId };
  }

  private async findRutinaOrThrow(id: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const rutina = await this.prisma.rutina.findFirst({
      where: { id, tenantId: scopedTenantId },
      include: {
        cliente: {
          include: {
            usuario: {
              select: {
                nombres: true,
                apellidos: true,
              },
            },
          },
        },
        entrenamiento: {
          include: {
            semanas: {
              orderBy: { numero: 'asc' },
              include: {
                musculosSemana: {
                  orderBy: { orden: 'asc' },
                  include: {
                    musculo: true,
                    ejerciciosMusculo: {
                      orderBy: { orden: 'asc' },
                      include: {
                        ejercicio: true,
                        seriesReps: {
                          orderBy: { orden: 'asc' },
                        },
                        seriesTiempos: {
                          orderBy: { orden: 'asc' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!rutina) {
      throw new NotFoundException('Rutina no encontrada');
    }

    return { rutina, tenantId: scopedTenantId };
  }

  async create(dto: CreateRutinaDto, tenantId?: number) {
    const { cliente, tenantId: scopedTenantId } = await this.findClienteOrThrow(
      dto.clienteId,
      tenantId,
    );
    const rutinaBuffer = this.normalizeRutinaBase64(dto.rutina);

    const response = await this.prisma.rutina.create({
      data: {
        tenantId: scopedTenantId,
        clienteId: cliente.id,
        rutina: rutinaBuffer,
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: new Date(dto.fechaFin),
        observacion: dto.observacion || '',
      },
      include: {
        cliente: {
          include: {
            usuario: {
              select: {
                nombres: true,
                apellidos: true,
              },
            },
          },
        },
      },
    });

    await this.prisma.entrenamiento.create({
      data: {
        tenantId: scopedTenantId,
        rutinaId: response.id,
        finalizado: false,
      },
    });

    return response;
  }

  async findAll(tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    return this.prisma.rutina.findMany({
      where: { tenantId: scopedTenantId },
      select: {
        id: true,
        tenantId: true,
        clienteId: true,
        fechaInicio: true,
        fechaFin: true,
        observacion: true,
      },
      orderBy: {
        fechaInicio: 'desc',
      },
    });
  }

  async findOne(id: number, tenantId?: number) {
    const { rutina } = await this.findRutinaOrThrow(id, tenantId);
    const base64Pure = Buffer.from(rutina.rutina).toString('base64');
    const dataURL = `data:image/jpeg;base64,${base64Pure}`;

    return {
      ...rutina,
      rutina: dataURL,
    };
  }

  async findByCliente(clienteId: number, tenantId?: number) {
    const { cliente, tenantId: scopedTenantId } = await this.findClienteOrThrow(
      clienteId,
      tenantId,
    );

    return this.prisma.rutina.findMany({
      where: { clienteId: cliente.id, tenantId: scopedTenantId },
      select: {
        id: true,
        tenantId: true,
        clienteId: true,
        fechaInicio: true,
        fechaFin: true,
        observacion: true,
        entrenamiento: true,
      },
      orderBy: {
        fechaInicio: 'desc',
      },
    });
  }

  async update(id: number, dto: UpdateRutinaDto, tenantId?: number) {
    await this.findRutinaOrThrow(id, tenantId);

    const updateData: {
      rutina?: Buffer;
      fechaInicio?: Date;
      fechaFin?: Date;
      observacion?: string;
    } = {};

    if (dto.rutina) {
      updateData.rutina = this.normalizeRutinaBase64(dto.rutina);
    }
    if (dto.fechaInicio) {
      updateData.fechaInicio = new Date(dto.fechaInicio);
    }
    if (dto.fechaFin) {
      updateData.fechaFin = new Date(dto.fechaFin);
    }
    if (dto.observacion !== undefined) {
      updateData.observacion = dto.observacion;
    }

    return this.prisma.rutina.update({
      where: { id },
      data: updateData,
      include: {
        cliente: {
          include: {
            usuario: {
              select: {
                nombres: true,
                apellidos: true,
              },
            },
          },
        },
      },
    });
  }

  async remove(id: number, tenantId?: number) {
    await this.findRutinaOrThrow(id, tenantId);

    return this.prisma.rutina.delete({
      where: { id },
    });
  }
}
