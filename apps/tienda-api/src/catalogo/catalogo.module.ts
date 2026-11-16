import { Module } from '@nestjs/common';
import { CatalogoModule as CatalogoCompartidoModule } from '@app/catalogo';
import { InventarioModule } from '@app/inventario';
import { PrismaModule } from '@app/prisma';
import { AccesosModule } from '../accesos/accesos.module';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { CatalogoService } from './catalogo.service';
import { CatalogoController } from './catalogo.controller';

@Module({
  imports: [
    CatalogoCompartidoModule,
    InventarioModule,
    PrismaModule,
    AccesosModule,
    AuditoriaEscrituraModule,
  ],
  controllers: [CatalogoController],
  providers: [CatalogoService],
  exports: [CatalogoService],
})
export class CatalogoModule {}
