import { Module } from '@nestjs/common';
import { AdministradorController } from './administrador.controller';
import { UsuariosModule } from '../usuarios/usuarios.module';

@Module({
  imports: [UsuariosModule],
  controllers: [AdministradorController],
})
export class AdministradorModule {}
