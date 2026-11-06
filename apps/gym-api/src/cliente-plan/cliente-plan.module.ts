import { Module } from '@nestjs/common';
import { ClientePlanController } from './cliente-plan.controller';
import { ClientePlanService } from './cliente-plan.service';
import { FacturaModule } from 'src/factura/factura.module';

@Module({
  controllers: [ClientePlanController],
  providers: [ClientePlanService],
  imports: [FacturaModule],
})
export class ClientePlanModule {}
