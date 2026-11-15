import { Module } from '@nestjs/common';
import { InventarioModule as InventarioCompartidoModule } from '@app/inventario';
import { InventarioService } from './inventario.service';
import { InventarioController } from './inventario.controller';

@Module({
  imports: [InventarioCompartidoModule],
  controllers: [InventarioController],
  providers: [InventarioService],
})
export class InventarioModule {}
