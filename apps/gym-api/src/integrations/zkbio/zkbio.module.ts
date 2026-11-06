import { Module } from '@nestjs/common';
import { AsistenciaModule } from '../../asistencia/asistencia.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { BridgeTenantAuthGuard } from '../bridge-auth/bridge-tenant-auth.guard';
import { BridgeTenantAuthService } from '../bridge-auth/bridge-tenant-auth.service';
import { ZkbioController } from './zkbio.controller';
import { ZkbioService } from './zkbio.service';

@Module({
  imports: [PrismaModule, AsistenciaModule],
  controllers: [ZkbioController],
  providers: [ZkbioService, BridgeTenantAuthService, BridgeTenantAuthGuard],
})
export class ZkbioModule {}
