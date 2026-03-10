import { Test, TestingModule } from '@nestjs/testing';
import { ClienteController } from './cliente.controller';
import { ClienteService } from './cliente.service';

describe('ClienteController', () => {
  let controller: ClienteController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClienteController],
      providers: [
        {
          provide: ClienteService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findRecientes: jest.fn(),
            findByUsuarioId: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            desactivar: jest.fn(),
            reactivar: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ClienteController>(ClienteController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
