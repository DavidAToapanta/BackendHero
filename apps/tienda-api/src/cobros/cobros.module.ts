import { PermisosModule } from '@app/permisos';
import { PrismaModule } from '@app/prisma';
import { Module } from '@nestjs/common';
import { AccesosModule } from '../accesos/accesos.module';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { CajaModule } from '../caja/caja.module';
import { CuentasModule } from '../cartera/cuentas.module';
import { IdempotenciaModule } from '../comun/idempotencia/idempotencia.module';
import { CobrosOperacionService } from './cobros-operacion.service';
import { CobrosController } from './cobros.controller';

@Module({
  imports: [
    PrismaModule,
    PermisosModule,
    AccesosModule,
    AuditoriaEscrituraModule,
    CajaModule,
    CuentasModule,
    IdempotenciaModule,
  ],
  controllers: [CobrosController],
  providers: [CobrosOperacionService],
  exports: [CobrosOperacionService],
})
export class CobrosModule {}
