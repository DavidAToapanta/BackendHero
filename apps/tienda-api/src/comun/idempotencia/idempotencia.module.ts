import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma';
import { IdempotenciaService } from './idempotencia.service';

@Module({
  imports: [PrismaModule],
  providers: [IdempotenciaService],
  exports: [IdempotenciaService],
})
export class IdempotenciaModule {}
