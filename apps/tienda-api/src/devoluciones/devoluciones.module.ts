import { Module } from '@nestjs/common';
import { InventarioModule } from '@app/inventario';
import { PrismaModule } from '@app/prisma';
import { AccesosModule } from '../accesos/accesos.module';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { CajaModule } from '../caja/caja.module';
import { CuentasModule } from '../cartera/cuentas.module';
import { CobrosModule } from '../cobros/cobros.module';
import { ComprobantesModule } from '../comprobantes/comprobantes.module';
import { IdempotenciaModule } from '../comun/idempotencia/idempotencia.module';
import { DevolucionesOperacionService } from './devoluciones-operacion.service';
import { DevolucionesService } from './devoluciones.service';
import { DevolucionesController } from './devoluciones.controller';

@Module({
  imports: [
    AccesosModule,
    AuditoriaEscrituraModule,
    CajaModule,
    CuentasModule,
    CobrosModule,
    ComprobantesModule,
    IdempotenciaModule,
    InventarioModule,
    PrismaModule,
  ],
  controllers: [DevolucionesController],
  providers: [DevolucionesService, DevolucionesOperacionService],
  exports: [DevolucionesOperacionService],
})
export class DevolucionesModule {}
