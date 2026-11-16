import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma';
import { AccesosModule } from '../accesos/accesos.module';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { CajaModule } from '../caja/caja.module';
import { IdempotenciaModule } from '../comun/idempotencia/idempotencia.module';
import { GastosComercialesController } from './gastos-comerciales.controller';
import { GastosComercialesService } from './gastos-comerciales.service';
import { FinanzasService } from './finanzas.service';
import { FinanzasController } from './finanzas.controller';

@Module({
  imports: [
    PrismaModule,
    AccesosModule,
    AuditoriaEscrituraModule,
    CajaModule,
    IdempotenciaModule,
  ],
  controllers: [GastosComercialesController, FinanzasController],
  providers: [FinanzasService, GastosComercialesService],
})
export class FinanzasModule {}
