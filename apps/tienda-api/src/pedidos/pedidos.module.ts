import { Module } from '@nestjs/common';
import { InventarioModule } from '@app/inventario';
import { PrismaModule } from '@app/prisma';
import { AccesosModule } from '../accesos/accesos.module';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { CajaModule } from '../caja/caja.module';
import { CarritoModule } from '../carrito/carrito.module';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { CuentasModule } from '../cartera/cuentas.module';
import { ClientesModule } from '../clientes/clientes.module';
import { CobrosModule } from '../cobros/cobros.module';
import { IdempotenciaModule } from '../comun/idempotencia/idempotencia.module';
import { PortalModule } from '../portal/portal.module';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';
import { ExpiracionPedidosService } from './expiracion-pedidos.service';

@Module({
  imports: [
    PrismaModule,
    AccesosModule,
    AuditoriaEscrituraModule,
    CajaModule,
    CarritoModule,
    CatalogoModule,
    CuentasModule,
    ClientesModule,
    CobrosModule,
    InventarioModule,
    IdempotenciaModule,
    PortalModule,
  ],
  controllers: [PedidosController],
  providers: [PedidosService, ExpiracionPedidosService],
})
export class PedidosModule {}
