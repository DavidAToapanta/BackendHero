import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma';
import { IdempotenciaModule } from '../comun/idempotencia/idempotencia.module';
import { CajaService } from './caja.service';
import { CajaController } from './caja.controller';

@Module({
  imports: [PrismaModule, IdempotenciaModule],
  controllers: [CajaController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajaModule {}
