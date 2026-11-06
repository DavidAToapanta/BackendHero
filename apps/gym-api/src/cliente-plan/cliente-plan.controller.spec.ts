import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY, Role } from '../auth/decorators/roles.decorator';
import { ClientePlanController } from './cliente-plan.controller';
import { ClientePlanService } from './cliente-plan.service';

const getMethodHandler = <T extends object>(
  prototype: T,
  methodName: keyof T & string,
): object => {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);

  if (typeof descriptor?.value !== 'function') {
    throw new Error(`Handler ${methodName} no encontrado`);
  }

  return descriptor.value as object;
};

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

  it('expone cliente-plan comercial solo para ADMIN y RECEPCIONISTA', () => {
    const findAllHandler = getMethodHandler(
      ClientePlanController.prototype,
      'findAll',
    );
    const activosHandler = getMethodHandler(
      ClientePlanController.prototype,
      'obtenerClientesActivos',
    );
    const findOneHandler = getMethodHandler(
      ClientePlanController.prototype,
      'findOne',
    );

    expect(Reflect.getMetadata(ROLES_KEY, findAllHandler)).toEqual([
      Role.ADMIN,
      Role.RECEPCIONISTA,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, activosHandler)).toEqual([
      Role.ADMIN,
      Role.RECEPCIONISTA,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, findOneHandler)).toEqual([
      Role.ADMIN,
      Role.RECEPCIONISTA,
    ]);
  });
});
