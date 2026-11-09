import { Module } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { InventarioLotesService } from './inventario-lotes.service';
import { ReservasInventarioService } from './reservas-inventario.service';

@Module({
  providers: [
    InventarioService,
    InventarioLotesService,
    ReservasInventarioService,
  ],
  exports: [
    InventarioService,
    InventarioLotesService,
    ReservasInventarioService,
  ],
})
export class InventarioModule {}
