import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SelectContextDto } from './dto/select-context.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    registerOwner: jest.Mock;
    selectContext: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      registerOwner: jest.fn(),
      selectContext: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates login with cedula and password', async () => {
    authService.login.mockResolvedValue({ access_token: 'token' });

    const dto: LoginDto = {
      cedula: '0102030405',
      password: '123456',
      accessMode: 'ASISTENCIA',
    };
    const result = await controller.login(dto);

    expect(authService.login).toHaveBeenCalledWith(
      '0102030405',
      '123456',
      'ASISTENCIA',
    );
    expect(result).toEqual({ access_token: 'token' });
  });

  it('delegates register-owner', async () => {
    authService.registerOwner.mockResolvedValue({
      access_token: 'owner-token',
    });

    const dto: RegisterDto = {
      cedula: '0102030405',
      password: '123456',
      nombres: 'Ana',
      apellidos: 'Perez',
      email: 'owner@gym.test',
      tenantNombre: 'Gym Central',
    };

    const result = await controller.registerOwner(dto);

    expect(authService.registerOwner).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ access_token: 'owner-token' });
  });

  it('delegates select-context', async () => {
    authService.selectContext.mockResolvedValue({ access_token: 'ctx-token' });

    const dto: SelectContextDto = {
      selectionToken: 'selection-token',
      type: 'CLIENTE',
      tenantId: 1,
      clienteId: 10,
      accessMode: 'ASISTENCIA',
    };

    const result = await controller.selectContext(dto);

    expect(authService.selectContext).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ access_token: 'ctx-token' });
  });
});
