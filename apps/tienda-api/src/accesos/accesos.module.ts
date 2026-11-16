import { Module } from '@nestjs/common';
import { IdentidadModule } from '@app/identidad';
import { NegociosModule } from '@app/negocios';
import { PermisosModule } from '@app/permisos';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { AuthModule } from '../auth';
import { AccesosService } from './accesos.service';
import { AccesosController } from './accesos.controller';
import { PermisosTiendaGuard } from './permisos-tienda';
import { PreparacionTiendaService } from './preparacion-tienda.service';

export { RequierePermisoTienda } from './permisos-tienda';
export { AccesosService } from './accesos.service';

@Module({
  imports: [
    AuthModule,
    IdentidadModule,
    NegociosModule,
    PermisosModule,
    AuditoriaEscrituraModule,
  ],
  controllers: [AccesosController],
  providers: [AccesosService, PermisosTiendaGuard, PreparacionTiendaService],
  exports: [AuthModule, PermisosModule, PermisosTiendaGuard, AccesosService],
})
export class AccesosModule {}
