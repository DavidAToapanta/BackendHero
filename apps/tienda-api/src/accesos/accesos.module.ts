import { Module } from '@nestjs/common';
import { NegociosModule } from '@app/negocios';
import { PermisosModule } from '@app/permisos';
import { AuthModule } from '../auth';
import { AccesosService } from './accesos.service';
import { AccesosController } from './accesos.controller';
import { PermisosTiendaGuard } from './permisos-tienda';

export { RequierePermisoTienda } from './permisos-tienda';

@Module({
  imports: [AuthModule, NegociosModule, PermisosModule],
  controllers: [AccesosController],
  providers: [AccesosService, PermisosTiendaGuard],
  exports: [AuthModule, PermisosModule, PermisosTiendaGuard],
})
export class AccesosModule {}
