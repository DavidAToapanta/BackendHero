import { Module } from '@nestjs/common';
import { IdentidadModule } from '@app/identidad';
import { NegociosModule } from '@app/negocios';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategy/jwt.strategy';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  createJwtModuleOptions,
} from '@app/seguridad';

@Module({
  imports: [
    IdentidadModule,
    NegociosModule,
    PassportModule,
    JwtModule.register(
      createJwtModuleOptions({ expiresIn: ACCESS_TOKEN_EXPIRES_IN }),
    ),
  ],

  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
