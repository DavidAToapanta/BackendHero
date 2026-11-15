import { Module } from '@nestjs/common';
import { CobrosService } from './cobros.service';
import { CobrosController } from './cobros.controller';

@Module({
  controllers: [CobrosController],
  providers: [CobrosService],
})
export class CobrosModule {}
