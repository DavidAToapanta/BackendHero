import { Test, TestingModule } from '@nestjs/testing';
import { IngresoRapidoController } from './ingreso-rapido.controller';
import { IngresoRapidoService } from './ingreso-rapido.service';

describe('IngresoRapidoController', () => {
  let controller: IngresoRapidoController;
  let ingresoRapidoService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    ingresoRapidoService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngresoRapidoController],
      providers: [
        {
          provide: IngresoRapidoService,
          useValue: ingresoRapidoService,
        },
      ],
    }).compile();

    controller = module.get<IngresoRapidoController>(IngresoRapidoController);
  });

  it('usa tenantId del JWT al crear ingreso rapido', async () => {
    const dto = { concepto: 'Pase diario', monto: 2.5 };
    const req = { user: { tenantId: 7 } };

    await controller.create(dto, req);

    expect(ingresoRapidoService.create).toHaveBeenCalledWith(dto, 7);
  });
});
