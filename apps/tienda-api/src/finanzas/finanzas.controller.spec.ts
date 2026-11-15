import { Test, TestingModule } from '@nestjs/testing';
import { FinanzasController } from './finanzas.controller';
import { FinanzasService } from './finanzas.service';

describe('FinanzasController', () => {
  let controller: FinanzasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinanzasController],
      providers: [FinanzasService],
    }).compile();

    controller = module.get<FinanzasController>(FinanzasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
