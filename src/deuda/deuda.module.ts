import { Module } from '@nestjs/common';
import { DeudaController } from './deuda.controller';
import { DeudaService } from './deuda.service';

@Module({
  controllers: [DeudaController],
  providers: [DeudaService],
})
export class DeudaModule {}
