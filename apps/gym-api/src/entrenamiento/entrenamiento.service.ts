import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTenantIdOrDefault } from '../tenant/tenant-context.util';
import { CreateEntrenamientoDto } from './dto/create-entrenamiento.dto';
import { UpdateEntrenamientoDto } from './dto/update-entrenamiento.dto';

@Injectable()
export class EntrenamientoService {
  constructor(private prisma: PrismaService) {}

  private async getScopedTenantId(tenantId?: number) {
    return resolveTenantIdOrDefault(this.prisma, tenantId);
  }

  private async findEntrenamientoOrThrow(id: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const entrenamiento = await this.prisma.entrenamiento.findFirst({
      where: { id, tenantId: scopedTenantId },
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
    });

    if (!entrenamiento) {
      throw new NotFoundException('Entrenamiento no encontrado');
    }

    return { entrenamiento, tenantId: scopedTenantId };
  }

  async create(dto: CreateEntrenamientoDto, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const entrenamiento = await this.prisma.entrenamiento.findFirst({
      where: { rutinaId: dto.rutinaId, tenantId: scopedTenantId },
    });

    if (!entrenamiento) {
      throw new NotFoundException(
        'No existe un entrenamiento para esta rutina en este tenant. Primero crea la rutina.',
      );
    }

    await Promise.all(
      dto.semanas.map(async (semanaDto) => {
        await this.prisma.semana.create({
          data: {
            tenantId: scopedTenantId,
            numero: semanaDto.numero,
            entrenamientoId: entrenamiento.id,
            musculosSemana: {
              create: await Promise.all(
                semanaDto.musculos.map(async (musculoDto) => {
                  const musculo = await this.prisma.musculo.upsert({
                    where: { nombre: musculoDto.musculo },
                    update: {},
                    create: { nombre: musculoDto.musculo },
                  });

                  return {
                    tenantId: scopedTenantId,
                    orden: musculoDto.orden,
                    musculoId: musculo.id,
                    ejerciciosMusculo: {
                      create: await Promise.all(
                        musculoDto.ejercicios.map(async (ejercicioDto) => {
                          const ejercicio = await this.prisma.ejercicio.upsert({
                            where: {
                              nombre: ejercicioDto.ejercicio.nombre,
                            },
                            update: {},
                            create: {
                              nombre: ejercicioDto.ejercicio.nombre,
                            },
                          });

                          return {
                            tenantId: scopedTenantId,
                            orden: ejercicioDto.orden,
                            ejercicioId: ejercicio.id,
                            seriesReps: ejercicioDto.seriesReps
                              ? {
                                  create: ejercicioDto.seriesReps.map(
                                    (serie) => ({
                                      orden: serie.orden,
                                      peso: serie.peso,
                                      repeticiones: serie.repeticiones,
                                      unidadMedida: serie.unidadMedida,
                                    }),
                                  ),
                                }
                              : undefined,
                            seriesTiempos: ejercicioDto.seriesTiempos
                              ? {
                                  create: ejercicioDto.seriesTiempos.map(
                                    (serie) => ({
                                      orden: serie.orden,
                                      peso: serie.peso,
                                      tiempo: serie.tiempo,
                                      unidadMedida: serie.unidadMedida,
                                    }),
                                  ),
                                }
                              : undefined,
                          };
                        }),
                      ),
                    },
                  };
                }),
              ),
            },
          },
        });
      }),
    );

    return this.findOne(entrenamiento.id, scopedTenantId);
  }

  async findAll(tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    return this.prisma.entrenamiento.findMany({
      where: { tenantId: scopedTenantId },
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
    });
  }

  async findOne(id: number, tenantId?: number) {
    const { entrenamiento } = await this.findEntrenamientoOrThrow(id, tenantId);
    return entrenamiento;
  }

  async findByRutina(rutinaId: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const entrenamiento = await this.prisma.entrenamiento.findFirst({
      where: { rutinaId, tenantId: scopedTenantId },
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
    });

    if (!entrenamiento) {
      throw new NotFoundException(
        'Entrenamiento no encontrado para esta rutina',
      );
    }

    return entrenamiento;
  }

  async update(id: number, dto: UpdateEntrenamientoDto, tenantId?: number) {
    await this.findEntrenamientoOrThrow(id, tenantId);

    return this.prisma.entrenamiento.update({
      where: { id },
      data: {
        finalizado: dto.finalizado,
      },
    });
  }

  async finalizarPorRutina(rutinaId: number, tenantId?: number) {
    const scopedTenantId = await this.getScopedTenantId(tenantId);
    const entrenamiento = await this.prisma.entrenamiento.findFirst({
      where: { rutinaId, tenantId: scopedTenantId },
    });

    if (!entrenamiento) {
      throw new NotFoundException(
        'No existe un entrenamiento para esta rutina',
      );
    }

    if (entrenamiento.finalizado) {
      throw new NotFoundException(
        'El entrenamiento de esta rutina ya esta finalizado',
      );
    }

    return this.prisma.entrenamiento.update({
      where: { id: entrenamiento.id },
      data: {
        finalizado: true,
      },
    });
  }

  async remove(id: number, tenantId?: number) {
    await this.findEntrenamientoOrThrow(id, tenantId);

    return this.prisma.entrenamiento.delete({
      where: { id },
    });
  }
}
