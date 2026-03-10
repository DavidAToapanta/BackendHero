import { Test, TestingModule } from '@nestjs/testing';
import { AsistenciaController } from './asistencia.controller';
import { AsistenciaService } from './asistencia.service';

describe('AsistenciaController', () => {
  let controller: AsistenciaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AsistenciaController],
      providers: [
        {
          provide: AsistenciaService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<AsistenciaController>(AsistenciaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
