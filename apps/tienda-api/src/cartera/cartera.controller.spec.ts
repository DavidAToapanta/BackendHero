import { Test, TestingModule } from '@nestjs/testing';
import { PermisosTiendaGuard } from '../accesos/permisos-tienda';
import { TiendaJwtGuard } from '../auth';
import { CarteraController } from './cartera.controller';
import { CarteraService } from './cartera.service';

describe('CarteraController', () => {
  let controller: CarteraController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CarteraController],
      providers: [{ provide: CarteraService, useValue: {} }],
    })
      .overrideGuard(TiendaJwtGuard)
      .useValue({})
      .overrideGuard(PermisosTiendaGuard)
      .useValue({})
      .compile();

    controller = module.get<CarteraController>(CarteraController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
