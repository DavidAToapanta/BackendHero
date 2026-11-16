import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AccesosModule } from './accesos/accesos.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { InventarioModule } from './inventario/inventario.module';
import { CajaModule } from './caja/caja.module';
import { CobrosModule } from './cobros/cobros.module';
import { VentasModule } from './ventas/ventas.module';
import { ClientesModule } from './clientes/clientes.module';
import { CarritoModule } from './carrito/carrito.module';
import { PedidosModule } from './pedidos/pedidos.module';
import { DevolucionesModule } from './devoluciones/devoluciones.module';
import { ComprobantesModule } from './comprobantes/comprobantes.module';
import { PortalModule } from './portal/portal.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { CarteraModule } from './cartera/cartera.module';
import { PanelModule } from './panel/panel.module';
import { FinanzasModule } from './finanzas/finanzas.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { ExportacionesModule } from './exportaciones/exportaciones.module';

@Module({
  imports: [
    AuthModule,
    AccesosModule,
    CatalogoModule,
    InventarioModule,
    CajaModule,
    CobrosModule,
    VentasModule,
    ClientesModule,
    CarritoModule,
    PedidosModule,
    DevolucionesModule,
    ComprobantesModule,
    PortalModule,
    NotificacionesModule,
    CarteraModule,
    PanelModule,
    FinanzasModule,
    AuditoriaModule,
    ExportacionesModule,
  ],
})
export class AppModule {}
