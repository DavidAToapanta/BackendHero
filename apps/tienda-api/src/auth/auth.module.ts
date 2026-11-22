import { Module } from '@nestjs/common';
import { IdentidadModule } from '@app/identidad';
import { NegociosModule } from '@app/negocios';
import { PermisosModule } from '@app/permisos';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PreparacionTiendaModule } from '../accesos/preparacion-tienda.module';
import { AuditoriaEscrituraModule } from '../auditoria/auditoria-escritura';
import { getTiendaJwtSecret, JWT_TIENDA_EMISOR } from './auth.config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RegistroPropietarioService } from './registro-propietario.service';
import { TiendaJwtGuard } from './tienda-jwt.guard';
import { TiendaJwtStrategy } from './tienda-jwt.strategy';

@Module({
  imports: [
    IdentidadModule,
    NegociosModule,
    PermisosModule,
    PreparacionTiendaModule,
    AuditoriaEscrituraModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getTiendaJwtSecret(),
        signOptions: { issuer: JWT_TIENDA_EMISOR, algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistroPropietarioService,
    TiendaJwtGuard,
    TiendaJwtStrategy,
  ],
  exports: [TiendaJwtGuard, JwtModule],
})
export class AuthModule {}
