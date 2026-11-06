import { Module } from '@nestjs/common';
import { FacturaService } from './factura.service';
import { FacturaController } from './factura.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FacturaService],
  controllers: [FacturaController],
  exports: [FacturaService],
})
export class FacturaModule {}
