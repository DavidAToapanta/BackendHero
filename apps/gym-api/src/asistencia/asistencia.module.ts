import { Module } from '@nestjs/common';
import { NegociosModule } from '@app/negocios';
import { AsistenciaController } from './asistencia.controller';
import { AsistenciaService } from './asistencia.service';
import { PrismaModule } from '@app/prisma';

@Module({
  imports: [PrismaModule, NegociosModule],
  controllers: [AsistenciaController],
  providers: [AsistenciaService],
  exports: [AsistenciaService],
})
export class AsistenciaModule {}
