import { BadRequestException, Injectable } from '@nestjs/common';
import { AsistenciaService } from '../../asistencia/asistencia.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncZkbioDto, ZkbioEventDto } from './dto/sync-zkbio.dto';

@Injectable()
export class ZkbioService {
  constructor(
    private readonly asistenciaService: AsistenciaService,
    private readonly prisma: PrismaService,
  ) {}

  async getAccessState(tenantId: number) {
    const now = new Date();
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, saasPlan: true },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant no encontrado');
    }

    if (tenant.saasPlan !== 'PLUS') {
      throw new BadRequestException(
        'La sincronizacion biometrica requiere tenant PLUS',
      );
    }

    const clientes = await this.prisma.cliente.findMany({
      where: {
        tenantId,
        zkbioPersonId: {
          not: null,
        },
      },
      select: {
        id: true,
        activo: true,
        zkbioPersonId: true,
        usuario: {
          select: {
            nombres: true,
            apellidos: true,
          },
        },
        planes: {
          where: {
            tenantId,
            activado: true,
            estado: 'ACTIVO',
            fechaInicio: { lte: now },
            fechaFin: { gte: now },
          },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { id: 'asc' },
    });

    return {
      generatedAt: now.toISOString(),
      clients: clientes.map((cliente) => {
        const hasActivePlan = cliente.planes.length > 0;
        const shouldHaveAccess = cliente.activo && hasActivePlan;

        return {
          clienteId: cliente.id,
          zkbioPersonId: cliente.zkbioPersonId,
          displayName: [cliente.usuario.nombres, cliente.usuario.apellidos]
            .filter(Boolean)
            .join(' ')
            .trim(),
          shouldHaveAccess,
          reason: shouldHaveAccess
            ? 'ACTIVE_CLIENT_WITH_VALID_PLAN'
            : !cliente.activo
              ? 'CLIENT_INACTIVE'
              : 'NO_VALID_ACTIVE_PLAN',
        };
      }),
    };
  }

  async sync(dto: SyncZkbioDto, tenantId: number) {
    this.assertManagedFieldsNotProvided(
      dto as unknown as Record<string, unknown>,
    );

    const summary = {
      procesados: 0,
      duplicados: 0,
      noVinculados: 0,
      rechazadosPorPlan: 0,
      invalidos: 0,
    };

    for (const event of dto.events ?? []) {
      const normalizedEvent = this.normalizeEvent(event);

      if (!normalizedEvent) {
        summary.invalidos += 1;
        continue;
      }

      const result = await this.asistenciaService.registrarAsistenciaBiometrica(
        {
          tenantId,
          eventoBiometricoId: normalizedEvent.eventId,
          occurredAt: normalizedEvent.occurredAt,
          biometricoPersonId: normalizedEvent.personId,
          dispositivoSn: dto.device?.sn?.trim() || null,
        },
      );

      switch (result.status) {
        case 'processed':
          summary.procesados += 1;
          break;
        case 'duplicate':
          summary.duplicados += 1;
          break;
        case 'unlinked':
          summary.noVinculados += 1;
          break;
        case 'rejectedByPlan':
          summary.rechazadosPorPlan += 1;
          break;
        case 'invalid':
          summary.invalidos += 1;
          break;
      }
    }

    return summary;
  }

  private assertManagedFieldsNotProvided(body: Record<string, unknown>) {
    if ('tenantId' in body) {
      throw new BadRequestException(
        'tenantId no se acepta en el body; el tenant se resuelve por x-bridge-key',
      );
    }
  }

  private normalizeEvent(event: ZkbioEventDto) {
    const eventId = event.eventId?.trim();
    const personId = event.personId?.trim();
    const occurredAt = new Date(event.occurredAt);

    if (!eventId || !personId || Number.isNaN(occurredAt.getTime())) {
      return null;
    }

    if (occurredAt.getTime() > Date.now()) {
      return null;
    }

    return {
      eventId,
      personId,
      occurredAt,
    };
  }
}
