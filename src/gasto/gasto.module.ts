import { Module } from '@nestjs/common';
import { GastoController } from './gasto.controller';
import { GastoService } from './gasto.service';

@Module({
  controllers: [GastoController],
  providers: [GastoService],
})
export class GastoModule {}
