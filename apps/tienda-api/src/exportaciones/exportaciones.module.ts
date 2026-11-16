import { Module } from '@nestjs/common';
import { AccesosModule } from '../accesos/accesos.module';
import { CajaModule } from '../caja/caja.module';
import { FinanzasModule } from '../finanzas/finanzas.module';
import { VentasModule } from '../ventas/ventas.module';
import { ExportacionesController } from './exportaciones.controller';
import { ExportacionesTiendaService } from './exportaciones-tienda.service';

@Module({
  imports: [AccesosModule, CajaModule, FinanzasModule, VentasModule],
  controllers: [ExportacionesController],
  providers: [ExportacionesTiendaService],
})
export class ExportacionesModule {}
