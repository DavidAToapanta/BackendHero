import { Module } from '@nestjs/common';
import { EntrenadorController } from './entrenador.controller';
import { UsuariosModule } from '../usuarios/usuarios.module';

@Module({
  imports: [UsuariosModule],
  controllers: [EntrenadorController],
})
export class EntrenadorModule {}
