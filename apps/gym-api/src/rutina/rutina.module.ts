import { Module } from '@nestjs/common';
import { RutinaService } from './rutina.service';
import { RutinaController } from './rutina.controller';
import { PrismaModule } from '@app/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [RutinaController],
  providers: [RutinaService],
})
export class RutinaModule {}
