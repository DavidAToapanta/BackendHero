import { PermisosModule } from '@app/permisos';
import { Module } from '@nestjs/common';
import { PreparacionTiendaService } from './preparacion-tienda.service';

@Module({
  imports: [PermisosModule],
  providers: [PreparacionTiendaService],
  exports: [PreparacionTiendaService],
})
export class PreparacionTiendaModule {}
