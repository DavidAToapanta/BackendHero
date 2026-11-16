import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma';
import { AccesosModule } from '../accesos/accesos.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CajaModule } from '../caja/caja.module';
import { CarteraModule } from '../cartera/cartera.module';
import { FinanzasModule } from '../finanzas/finanzas.module';
import { InventarioModule } from '../inventario/inventario.module';
import { VentasModule } from '../ventas/ventas.module';
import { ConsultaPanelService } from './consulta-panel.service';
import { PanelService } from './panel.service';
import { PanelController } from './panel.controller';

@Module({
  imports: [
    PrismaModule,
    AccesosModule,
    AuditoriaModule,
    CajaModule,
    CarteraModule,
    FinanzasModule,
    InventarioModule,
    VentasModule,
  ],
  controllers: [PanelController],
  providers: [PanelService, ConsultaPanelService],
  exports: [ConsultaPanelService],
})
export class PanelModule {}
