import { Module } from '@nestjs/common';
import { CatalogoModule as CatalogoCompartidoModule } from '@app/catalogo';
import { PrismaModule } from '@app/prisma';
import { AccesosModule } from '../accesos/accesos.module';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { CatalogoService } from './catalogo.service';
import { CatalogoController } from './catalogo.controller';

@Module({
  imports: [
    CatalogoCompartidoModule,
    PrismaModule,
    AccesosModule,
    AuditoriaEscrituraModule,
  ],
  controllers: [CatalogoController],
  providers: [CatalogoService],
})
export class CatalogoModule {}
