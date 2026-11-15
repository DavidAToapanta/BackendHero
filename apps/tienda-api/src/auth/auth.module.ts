import { Module } from '@nestjs/common';
import { IdentidadModule } from '@app/identidad';
import { NegociosModule } from '@app/negocios';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [IdentidadModule, NegociosModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
