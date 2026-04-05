import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY, Role } from '../auth/decorators/roles.decorator';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';

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

describe('PlanController', () => {
  let controller: PlanController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlanController],
      providers: [
        {
          provide: PlanService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<PlanController>(PlanController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('expone planes solo para ADMIN y RECEPCIONISTA en listados y detalle', () => {
    const findAllHandler = getMethodHandler(
      PlanController.prototype,
      'findAll',
    );
    const findOneHandler = getMethodHandler(
      PlanController.prototype,
      'findOne',
    );

    expect(Reflect.getMetadata(ROLES_KEY, findAllHandler)).toEqual([
      Role.ADMIN,
      Role.RECEPCIONISTA,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, findOneHandler)).toEqual([
      Role.ADMIN,
      Role.RECEPCIONISTA,
    ]);
  });
});
