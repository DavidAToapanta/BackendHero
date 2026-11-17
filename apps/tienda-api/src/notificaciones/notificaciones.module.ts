import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma';
import { AccesosModule } from '../accesos/accesos.module';
import { IdempotenciaModule } from '../comun/idempotencia/idempotencia.module';
import { PortalModule } from '../portal/portal.module';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';

@Module({
  imports: [PrismaModule, PortalModule, AccesosModule, IdempotenciaModule],
  controllers: [NotificacionesController],
  providers: [NotificacionesService],
})
export class NotificacionesModule {}
