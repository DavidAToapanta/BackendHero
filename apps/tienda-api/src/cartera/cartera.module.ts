import { Module } from '@nestjs/common';
import { CarteraService } from './cartera.service';
import { CarteraController } from './cartera.controller';

@Module({
  controllers: [CarteraController],
  providers: [CarteraService],
})
export class CarteraModule {}
