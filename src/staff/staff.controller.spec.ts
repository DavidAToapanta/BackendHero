import { Test, TestingModule } from '@nestjs/testing';
import { TenantRole, UserTenantEstado } from '@prisma/client';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

describe('StaffController', () => {
  let controller: StaffController;
  let staffService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    inactivar: jest.Mock;
    reactivar: jest.Mock;
  };

  beforeEach(async () => {
    staffService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      inactivar: jest.fn(),
      reactivar: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [
        {
          provide: StaffService,
          useValue: staffService,
        },
      ],
    }).compile();

    controller = module.get<StaffController>(StaffController);
  });

  it('create toma tenantId del JWT y no del body', async () => {
    const dto = {
      nombres: 'Maria',
      apellidos: 'Lopez',
      cedula: '0102030405',
      password: '123456',
      tenantRole: TenantRole.ADMIN,
    };
    const req = {
      user: {
        tenantId: 7,
      },
    };

    await controller.create(dto, req);

    expect(staffService.create).toHaveBeenCalledWith(dto, 7);
  });

  it('findAll delega filtros role y estado con el tenant actual', async () => {
    const query = {
      role: TenantRole.RECEPCIONISTA,
      estado: UserTenantEstado.ACTIVO,
    };
    const req = {
      user: {
        tenantId: 7,
      },
    };

    await controller.findAll(query, req);

    expect(staffService.findAll).toHaveBeenCalledWith(query, 7);
  });

  it('update, inactivar y reactivar usan usuarioId de la ruta y tenantId del token', async () => {
    const req = {
      user: {
        tenantId: 7,
      },
    };

    await controller.update(20, { tenantRole: TenantRole.ENTRENADOR }, req);
    await controller.inactivar(20, req);
    await controller.reactivar(20, req);

    expect(staffService.update).toHaveBeenCalledWith(
      20,
      { tenantRole: TenantRole.ENTRENADOR },
      7,
    );
    expect(staffService.inactivar).toHaveBeenCalledWith(20, 7);
    expect(staffService.reactivar).toHaveBeenCalledWith(20, 7);
  });
});
