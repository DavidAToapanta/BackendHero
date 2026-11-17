import { Test, TestingModule } from '@nestjs/testing';
import { PermisosTiendaGuard } from '../accesos/permisos-tienda';
import { TiendaJwtGuard } from '../auth';
import { ConsultaPanelService } from './consulta-panel.service';
import { PanelController } from './panel.controller';

describe('PanelController', () => {
  let controller: PanelController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PanelController],
      providers: [{ provide: ConsultaPanelService, useValue: {} }],
    })
      .overrideGuard(TiendaJwtGuard)
      .useValue({})
      .overrideGuard(PermisosTiendaGuard)
      .useValue({})
      .compile();

    controller = module.get<PanelController>(PanelController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
