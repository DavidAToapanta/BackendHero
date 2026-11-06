import { Module } from '@nestjs/common';
import { IngresoRapidoController } from './ingreso-rapido.controller';
import { IngresoRapidoService } from './ingreso-rapido.service';

@Module({
  controllers: [IngresoRapidoController],
  providers: [IngresoRapidoService],
})
export class IngresoRapidoModule {}
