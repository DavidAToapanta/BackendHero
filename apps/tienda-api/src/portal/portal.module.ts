import { Module } from '@nestjs/common';
import { IdentidadModule } from '@app/identidad';
import { PrismaModule } from '@app/prisma';
import { AccesosModule } from '../accesos/accesos.module';
import { AuthModule } from '../auth/auth.module';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { ComprobantesModule } from '../comprobantes/comprobantes.module';
import { PortalController } from './portal.controller';
import { PortalGuard } from './portal.guard';
import { PortalService } from './portal.service';

@Module({
  imports: [
    PrismaModule,
    IdentidadModule,
    AuthModule,
    AccesosModule,
    CatalogoModule,
    ComprobantesModule,
  ],
  controllers: [PortalController],
  providers: [PortalService, PortalGuard],
  exports: [PortalService, PortalGuard],
})
export class PortalModule {}
