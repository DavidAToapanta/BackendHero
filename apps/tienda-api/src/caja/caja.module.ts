import { PermisosModule } from '@app/permisos';
import { PrismaModule } from '@app/prisma';
import { Module } from '@nestjs/common';
import { AccesosModule } from '../accesos/accesos.module';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { IdempotenciaModule } from '../comun/idempotencia/idempotencia.module';
import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';

@Module({
  imports: [
    PrismaModule,
    PermisosModule,
    AccesosModule,
    AuditoriaEscrituraModule,
    IdempotenciaModule,
  ],
  controllers: [CajaController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajaModule {}
