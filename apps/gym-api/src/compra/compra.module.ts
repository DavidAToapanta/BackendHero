import { Module } from '@nestjs/common';
import { CompraService } from './compra.service';
import { CompraController } from './compra.controller';
import { PrismaModule } from '@app/prisma';
import { InventarioModule } from '@app/inventario';

@Module({
  imports: [PrismaModule, InventarioModule],
  controllers: [CompraController],
  providers: [CompraService],
})
export class CompraModule {}
