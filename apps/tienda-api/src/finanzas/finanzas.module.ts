import { Module } from '@nestjs/common';
import { FinanzasService } from './finanzas.service';
import { FinanzasController } from './finanzas.controller';

@Module({
  controllers: [FinanzasController],
  providers: [FinanzasService],
})
export class FinanzasModule {}
