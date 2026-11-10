import { PrismaModule } from '@app/prisma';
import { Module } from '@nestjs/common';
import { IdentidadService } from './identidad.service';

@Module({
  imports: [PrismaModule],
  providers: [IdentidadService],
  exports: [IdentidadService],
})
export class IdentidadModule {}
