import { PrismaModule } from '@app/prisma';
import { Module } from '@nestjs/common';
import { MembresiasPersonalService } from './membresias-personal.service';
import { ModulosNegocioService } from './modulos-negocio.service';
import { NegociosService } from './negocios.service';

const services = [
  NegociosService,
  ModulosNegocioService,
  MembresiasPersonalService,
];

@Module({
  imports: [PrismaModule],
  providers: services,
  exports: services,
})
export class NegociosModule {}
