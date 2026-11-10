import { Module } from '@nestjs/common';
import { IdentidadModule } from '@app/identidad';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule, IdentidadModule],
  controllers: [UsuariosController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
