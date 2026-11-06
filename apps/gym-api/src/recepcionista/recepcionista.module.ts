import { Module } from '@nestjs/common';
import { RecepcionistaController } from './recepcionista.controller';
import { UsuariosModule } from '../usuarios/usuarios.module';

@Module({
  imports: [UsuariosModule],
  controllers: [RecepcionistaController],
})
export class RecepcionistaModule {}
