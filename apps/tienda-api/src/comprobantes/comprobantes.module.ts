import { Module } from '@nestjs/common';
import { ComprobantesService } from './comprobantes.service';
import { ComprobantesController } from './comprobantes.controller';
import { AnulacionComprobanteService } from './anulacion-comprobante.service';

@Module({
  controllers: [ComprobantesController],
  providers: [ComprobantesService, AnulacionComprobanteService],
  exports: [AnulacionComprobanteService],
})
export class ComprobantesModule {}
