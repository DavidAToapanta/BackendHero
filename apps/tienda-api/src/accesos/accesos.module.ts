import { Module } from '@nestjs/common';
import { NegociosModule } from '@app/negocios';
import { PermisosModule } from '@app/permisos';
import { AccesosService } from './accesos.service';
import { AccesosController } from './accesos.controller';

@Module({
  imports: [NegociosModule, PermisosModule],
  controllers: [AccesosController],
  providers: [AccesosService],
})
export class AccesosModule {}
