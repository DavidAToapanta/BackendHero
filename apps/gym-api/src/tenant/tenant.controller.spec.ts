import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY, Role } from '../auth/decorators/roles.decorator';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

describe('TenantController', () => {
  let controller: TenantController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        {
          provide: TenantService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<TenantController>(TenantController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('reserva configuracion sensible de tenant para OWNER', () => {
    expect(Reflect.getMetadata(ROLES_KEY, TenantController)).toEqual([
      Role.OWNER,
    ]);
  });
});
