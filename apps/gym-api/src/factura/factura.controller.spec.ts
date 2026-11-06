import { Test, TestingModule } from '@nestjs/testing';
import { FacturaController } from './factura.controller';
import { FacturaService } from './factura.service';

describe('FacturaController', () => {
  let controller: FacturaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacturaController],
      providers: [
        {
          provide: FacturaService,
          useValue: {
            findAll: jest.fn(),
            getResumen: jest.fn(),
            findOne: jest.fn(),
            devolver: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FacturaController>(FacturaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
