import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { PortalModule } from '../portal/portal.module';
import { CarritoController } from './carrito.controller';
import { CarritoService } from './carrito.service';

@Module({
  imports: [PrismaModule, CatalogoModule, PortalModule],
  controllers: [CarritoController],
  providers: [CarritoService],
  exports: [CarritoService],
})
export class CarritoModule {}
