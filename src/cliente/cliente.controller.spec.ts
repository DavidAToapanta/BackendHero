import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClienteController } from './cliente.controller';
import { ClienteService } from './cliente.service';
import { RegisterClienteDto } from './dto/register-cliente.dto';

describe('ClienteController', () => {
  let controller: ClienteController;
  let clienteService: {
    create: jest.Mock;
    registrar: jest.Mock;
    findAll: jest.Mock;
    findRecientes: jest.Mock;
    findByUsuarioId: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    desactivar: jest.Mock;
    reactivar: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    clienteService = {
      create: jest.fn(),
      registrar: jest.fn(),
      findAll: jest.fn(),
      findRecientes: jest.fn(),
      findByUsuarioId: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      desactivar: jest.fn(),
      reactivar: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClienteController],
      providers: [
        {
          provide: ClienteService,
          useValue: clienteService,
        },
      ],
    }).compile();

    controller = module.get<ClienteController>(ClienteController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('aplica JwtAuthGuard y RolesGuard en el controller', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ClienteController,
    ) as unknown[];

    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
  });

  it('registro usa el tenant del JWT', async () => {
    const dto: RegisterClienteDto = {
      nombres: 'Juan',
      apellidos: 'Perez',
      cedula: '0102030405',
      fechaNacimiento: '2000-01-01',
      userName: 'juan.perez',
      email: 'juan@test.com',
      password: '123456',
      horario: '08:00-10:00',
      sexo: 'M',
      observaciones: 'Sin novedades',
      objetivos: 'Ganar masa muscular',
      tiempoEntrenar: 60,
    };
    const req = {
      user: {
        tenantId: 17,
      },
    };

    await controller.registro(dto, req);

    expect(clienteService.registrar).toHaveBeenCalledWith(dto, 17);
  });

  it('miPerfil resuelve el cliente actual por usuarioId y tenantId del token', async () => {
    const req = {
      user: {
        sub: 42,
        clienteId: 999,
        tenantId: 17,
      },
    };

    await controller.getMiPerfil(req);

    expect(clienteService.findByUsuarioId).toHaveBeenCalledWith(42, 17);
  });
});
