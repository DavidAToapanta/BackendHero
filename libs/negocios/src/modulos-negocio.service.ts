import { PrismaService } from '@app/prisma';
import { Injectable } from '@nestjs/common';
import { ModuleKey, Prisma } from '@prisma/client';

@Injectable()
export class ModulosNegocioService {
  constructor(private readonly prisma: PrismaService) {}

  async estaActivo(tenantId: number, module: ModuleKey) {
    const habilitado = await this.prisma.tenantModule.findUnique({
      where: { tenantId_module: { tenantId, module }, activo: true },
      select: { id: true },
    });
    return Boolean(habilitado);
  }

  registrarActivo(
    tenantId: number,
    module: ModuleKey,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.tenantModule.create({ data: { tenantId, module, activo: true } });
  }

  asegurarActivo(
    tenantId: number,
    module: ModuleKey,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.tenantModule.upsert({
      where: { tenantId_module: { tenantId, module } },
      update: { activo: true },
      create: { tenantId, module, activo: true },
    });
  }
}
