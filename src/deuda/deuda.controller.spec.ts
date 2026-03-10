import { Test, TestingModule } from '@nestjs/testing';
import { DeudaController } from './deuda.controller';
import { DeudaService } from './deuda.service';

describe('DeudaController', () => {
  let controller: DeudaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeudaController],
      providers: [
        {
          provide: DeudaService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<DeudaController>(DeudaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
