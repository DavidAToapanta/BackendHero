import { Module } from '@nestjs/common';
import { IdentidadModule } from '@app/identidad';
import { NegociosModule } from '@app/negocios';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getTiendaJwtSecret, JWT_TIENDA_EMISOR } from './auth.config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TiendaJwtGuard } from './tienda-jwt.guard';
import { TiendaJwtStrategy } from './tienda-jwt.strategy';

@Module({
  imports: [
    IdentidadModule,
    NegociosModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getTiendaJwtSecret(),
        signOptions: { issuer: JWT_TIENDA_EMISOR, algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TiendaJwtGuard, TiendaJwtStrategy],
  exports: [TiendaJwtGuard],
})
export class AuthModule {}
