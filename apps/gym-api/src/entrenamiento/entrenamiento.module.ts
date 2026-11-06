import { Module } from '@nestjs/common';
import { EntrenamientoService } from './entrenamiento.service';
import { EntrenamientoController } from './entrenamiento.controller';
import { PrismaModule } from '@app/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [EntrenamientoController],
  providers: [EntrenamientoService],
})
export class EntrenamientoModule {}
