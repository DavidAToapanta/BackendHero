import { Module } from '@nestjs/common';
import { PagoController } from './pago.controller';
import { PagoService } from './pago.service';
import { FacturaModule } from 'src/factura/factura.module';

@Module({
  imports: [FacturaModule],
  controllers: [PagoController],
  providers: [PagoService],
})
export class PagoModule {}
