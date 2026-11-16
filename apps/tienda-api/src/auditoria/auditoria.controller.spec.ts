import { Test, TestingModule } from '@nestjs/testing';
import { PermisosTiendaGuard } from '../accesos/permisos-tienda';
import { TiendaJwtGuard } from '../auth';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';

describe('AuditoriaController', () => {
  let controller: AuditoriaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditoriaController],
      providers: [{ provide: AuditoriaService, useValue: {} }],
    })
      .overrideGuard(TiendaJwtGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermisosTiendaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuditoriaController>(AuditoriaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
