import { Test, TestingModule } from '@nestjs/testing';
import { ClientePlanController } from './cliente-plan.controller';
import { ClientePlanService } from './cliente-plan.service';

describe('ClientePlanController', () => {
  let controller: ClientePlanController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientePlanController],
      providers: [
        {
          provide: ClientePlanService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            contarClientesActivos: jest.fn(),
            cambiarPlan: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ClientePlanController>(ClientePlanController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
