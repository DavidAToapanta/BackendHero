import { Test, TestingModule } from '@nestjs/testing';
import { PermisosTiendaGuard } from '../accesos/permisos-tienda';
import { TiendaJwtGuard } from '../auth';
import { ConsultaFinanzasService } from './consulta-finanzas.service';
import { FinanzasController } from './finanzas.controller';
import { FinanzasService } from './finanzas.service';

describe('FinanzasController', () => {
  let controller: FinanzasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinanzasController],
      providers: [
        FinanzasService,
        { provide: ConsultaFinanzasService, useValue: {} },
      ],
    })
      .overrideGuard(TiendaJwtGuard)
      .useValue({})
      .overrideGuard(PermisosTiendaGuard)
      .useValue({})
      .compile();

    controller = module.get<FinanzasController>(FinanzasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
