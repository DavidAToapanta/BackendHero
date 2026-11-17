import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma';
import { AccesosModule } from '../accesos/accesos.module';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { CobrosModule } from '../cobros/cobros.module';
import { IdempotenciaModule } from '../comun/idempotencia/idempotencia.module';
import { EmisionComprobanteService } from './emision-comprobante.service';
import { ComprobantesController } from './comprobantes.controller';
import { AnulacionComprobanteService } from './anulacion-comprobante.service';

@Module({
  imports: [
    PrismaModule,
    AccesosModule,
    AuditoriaEscrituraModule,
    CobrosModule,
    IdempotenciaModule,
  ],
  controllers: [ComprobantesController],
  providers: [EmisionComprobanteService, AnulacionComprobanteService],
  exports: [AnulacionComprobanteService, EmisionComprobanteService],
})
export class ComprobantesModule {}
