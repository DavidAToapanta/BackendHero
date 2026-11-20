import { Module } from '@nestjs/common';
import { IdentidadModule } from '@app/identidad';
import { NegociosModule } from '@app/negocios';
import { PermisosModule } from '@app/permisos';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { AuthModule } from '../auth';
import { AccesosService } from './accesos.service';
import { AccesosController } from './accesos.controller';
import { PermisosTiendaGuard } from './permisos-tienda';
import { PreparacionTiendaModule } from './preparacion-tienda.module';

export { RequierePermisoTienda } from './permisos-tienda';
export { AccesosService } from './accesos.service';

@Module({
  imports: [
    AuthModule,
    IdentidadModule,
    NegociosModule,
    PermisosModule,
    AuditoriaEscrituraModule,
    PreparacionTiendaModule,
  ],
  controllers: [AccesosController],
  providers: [AccesosService, PermisosTiendaGuard],
  exports: [AuthModule, PermisosModule, PermisosTiendaGuard, AccesosService],
})
export class AccesosModule {}
