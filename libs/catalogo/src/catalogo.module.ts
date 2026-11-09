import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma';
import { CatalogoService } from './catalogo.service';
import { CategoriasProductoService } from './categorias-producto.service';
import { ImagenesProductoService } from './imagenes-producto.service';

@Module({
  imports: [PrismaModule],
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
