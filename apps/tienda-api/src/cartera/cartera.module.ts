import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma';
import { AccesosModule } from '../accesos/accesos.module';
import { CarteraService } from './cartera.service';
import { CarteraController } from './cartera.controller';

@Module({
  imports: [PrismaModule, AccesosModule],
  controllers: [CarteraController],
  providers: [CarteraService],
  exports: [CarteraService],
})
export class CarteraModule {}
