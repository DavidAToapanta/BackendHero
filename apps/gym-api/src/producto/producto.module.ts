import { Module } from '@nestjs/common';
import { CatalogoModule } from '@app/catalogo';
import { InventarioModule } from '@app/inventario';
import { ProductoController } from './producto.controller';
import { ProductoService } from './producto.service';

@Module({
  imports: [CatalogoModule, InventarioModule],
  controllers: [ProductoController],
  providers: [ProductoService],
})
export class ProductoModule {}
