import { Test, TestingModule } from '@nestjs/testing';
import { CarteraController } from './cartera.controller';
import { CarteraService } from './cartera.service';

describe('CarteraController', () => {
  let controller: CarteraController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CarteraController],
      providers: [CarteraService],
    }).compile();

    controller = module.get<CarteraController>(CarteraController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
