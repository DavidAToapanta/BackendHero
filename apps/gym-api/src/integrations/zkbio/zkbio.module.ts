import { Module } from '@nestjs/common';
import { NegociosModule } from '@app/negocios';
import { AsistenciaModule } from '../../asistencia/asistencia.module';
import { PrismaModule } from '@app/prisma';
import { BridgeTenantAuthGuard } from '../bridge-auth/bridge-tenant-auth.guard';
import { BridgeTenantAuthService } from '../bridge-auth/bridge-tenant-auth.service';
import { ZkbioController } from './zkbio.controller';
import { ZkbioService } from './zkbio.service';

@Module({
  imports: [PrismaModule, AsistenciaModule, NegociosModule],
  controllers: [ZkbioController],
  providers: [ZkbioService, BridgeTenantAuthService, BridgeTenantAuthGuard],
})
export class ZkbioModule {}
