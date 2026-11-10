import { Module } from '@nestjs/common';
import { NegociosModule } from '@app/negocios';
import { PrismaModule } from '@app/prisma';
import { CatalogoService } from './catalogo.service';
import { CategoriasProductoService } from './categorias-producto.service';
import { ImagenesProductoService } from './imagenes-producto.service';

@Module({
  imports: [PrismaModule, NegociosModule],
  providers: [
    CatalogoService,
    CategoriasProductoService,
    ImagenesProductoService,
  ],
  exports: [
    CatalogoService,
    CategoriasProductoService,
    ImagenesProductoService,
  ],
})
export class CatalogoModule {}
