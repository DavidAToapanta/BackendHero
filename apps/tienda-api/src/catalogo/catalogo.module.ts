import { Module } from '@nestjs/common';
import { CatalogoModule as CatalogoCompartidoModule } from '@app/catalogo';
import { CatalogoService } from './catalogo.service';
import { CatalogoController } from './catalogo.controller';

@Module({
  imports: [CatalogoCompartidoModule],
  controllers: [CatalogoController],
  providers: [CatalogoService],
})
export class CatalogoModule {}
