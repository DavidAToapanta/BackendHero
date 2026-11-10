import { PrismaModule } from '@app/prisma';
import { Module } from '@nestjs/common';
import { AsignacionesRolService } from './asignaciones-rol.service';
import { PermisosService } from './permisos.service';
import { PreparacionPermisosService } from './preparacion-permisos.service';
import { RolesNegocioService } from './roles-negocio.service';

const services = [
  PermisosService,
  RolesNegocioService,
  AsignacionesRolService,
  PreparacionPermisosService,
];

@Module({ imports: [PrismaModule], providers: services, exports: services })
export class PermisosModule {}
