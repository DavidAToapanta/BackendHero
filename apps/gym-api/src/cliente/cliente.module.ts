import { Module } from '@nestjs/common';
import { IdentidadModule } from '@app/identidad';
import { ClienteController } from './cliente.controller';
import { ClienteService } from './cliente.service';

@Module({
  imports: [IdentidadModule],
  controllers: [ClienteController],
  providers: [ClienteService],
  exports: [ClienteService], // Exportar para usar en otros módulos
})
export class ClienteModule {}
