import { Module } from '@nestjs/common';
import { InventarioModule } from '@app/inventario';
import { AccesosModule } from '../accesos/accesos.module';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { CajaModule } from '../caja/caja.module';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { ClientesModule } from '../clientes/clientes.module';
import { CobrosModule } from '../cobros/cobros.module';
import { IdempotenciaModule } from '../comun/idempotencia/idempotencia.module';
import { VentaMostradorService } from './venta-mostrador.service';
import { VentasService } from './ventas.service';
import { VentasController } from './ventas.controller';

@Module({
  imports: [
    AccesosModule,
    AuditoriaEscrituraModule,
    CajaModule,
    CatalogoModule,
    ClientesModule,
    CobrosModule,
    IdempotenciaModule,
    InventarioModule,
  ],
  controllers: [VentasController],
  providers: [VentasService, VentaMostradorService],
})
export class VentasModule {}
