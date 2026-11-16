import { Module } from '@nestjs/common';
import { InventarioModule as InventarioCompartidoModule } from '@app/inventario';
import { PrismaModule } from '@app/prisma';
import { AccesosModule } from '../accesos/accesos.module';
import { InventarioService } from './inventario.service';
import { InventarioController } from './inventario.controller';

@Module({
  imports: [InventarioCompartidoModule, PrismaModule, AccesosModule],
  controllers: [InventarioController],
  providers: [InventarioService],
})
export class InventarioModule {}
