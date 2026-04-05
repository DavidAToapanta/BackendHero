import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../auth/decorators/roles.decorator';
import { AsistenciaController } from './asistencia.controller';
import { AsistenciaService } from './asistencia.service';

describe('AsistenciaController', () => {
  let controller: AsistenciaController;
  let asistenciaService: {
    getEstadisticasPorPlan: jest.Mock;
    historial: jest.Mock;
    marcarAsistencia: jest.Mock;
  };

  beforeEach(async () => {
    asistenciaService = {
      getEstadisticasPorPlan: jest.fn(),
      historial: jest.fn(),
      marcarAsistencia: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AsistenciaController],
      providers: [
        {
          provide: AsistenciaService,
          useValue: asistenciaService,
        },
      ],
    }).compile();

    controller = module.get<AsistenciaController>(AsistenciaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('miEstadisticas usa clienteId y tenantId del token', async () => {
    const req = {
      user: {
        sub: 10,
        rol: Role.CLIENTE,
        clienteId: 15,
        tenantId: 7,
      },
    };
    const estadisticas = { tienePlanActivo: true };
    asistenciaService.getEstadisticasPorPlan.mockResolvedValue(estadisticas);

    await expect(controller.miEstadisticas(req)).resolves.toBe(estadisticas);
    expect(asistenciaService.getEstadisticasPorPlan).toHaveBeenCalledWith(
      15,
      7,
    );
  });

  it('miHistorial usa clienteId y tenantId del token', async () => {
    const req = {
      user: {
        sub: 10,
        rol: Role.CLIENTE,
        clienteId: 15,
        tenantId: 7,
      },
    };
    const historial = [{ id: 1 }];
    asistenciaService.historial.mockResolvedValue(historial);

    await expect(controller.miHistorial(req)).resolves.toBe(historial);
    expect(asistenciaService.historial).toHaveBeenCalledWith(15, 7);
  });

  it('miEstadisticas lanza error claro si falta clienteId en el token', () => {
    const req = {
      user: {
        sub: 10,
        rol: Role.CLIENTE,
        tenantId: 7,
      },
    };

    expect(() => controller.miEstadisticas(req)).toThrow(
      new UnauthorizedException('No se pudo resolver el cliente de la sesion'),
    );
    expect(asistenciaService.getEstadisticasPorPlan).not.toHaveBeenCalled();
  });

  it('miHistorial lanza error claro si falta clienteId en el token', () => {
    const req = {
      user: {
        sub: 10,
        rol: Role.CLIENTE,
        tenantId: 7,
      },
    };

    expect(() => controller.miHistorial(req)).toThrow(
      new UnauthorizedException('No se pudo resolver el cliente de la sesion'),
    );
    expect(asistenciaService.historial).not.toHaveBeenCalled();
  });

  it('marcarAsistencia usa req.user.sub como usuarioId para portal cliente', async () => {
    const req = {
      user: {
        sub: 10,
        rol: Role.CLIENTE,
        clienteId: 15,
        tenantId: 7,
      },
    };
    const dto = { usuarioId: 999 };

    await controller.marcarAsistencia(dto, req);

    expect(asistenciaService.marcarAsistencia).toHaveBeenCalledWith(10, 7);
  });

  it('marcarAsistencia usa dto.usuarioId para staff y no el sub del token', async () => {
    const req = {
      user: {
        sub: 10,
        rol: Role.RECEPCIONISTA,
        tenantId: 7,
      },
    };
    const dto = { usuarioId: 44 };

    await controller.marcarAsistencia(dto, req);

    expect(asistenciaService.marcarAsistencia).toHaveBeenCalledWith(44, 7);
  });
});
