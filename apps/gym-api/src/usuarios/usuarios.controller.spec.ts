import { GoneException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

describe('UsuariosController', () => {
  let controller: UsuariosController;
  let usuariosService: {
    crear: jest.Mock;
    findByRol: jest.Mock;
    obtenerPorId: jest.Mock;
    counts: jest.Mock;
    eliminar: jest.Mock;
  };

  beforeEach(async () => {
    usuariosService = {
      crear: jest.fn(),
      findByRol: jest.fn(),
      obtenerPorId: jest.fn(),
      counts: jest.fn(),
      eliminar: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [
        {
          provide: UsuariosService,
          useValue: usuariosService,
        },
      ],
    }).compile();

    controller = module.get<UsuariosController>(UsuariosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('expone las rutas legacy como retiradas', () => {
    expect(() => controller.crear()).toThrow(GoneException);
    expect(() => controller.listar()).toThrow(GoneException);
    expect(() => controller.obtenerPorId()).toThrow(GoneException);
    expect(() => controller.conteos()).toThrow(GoneException);
    expect(() => controller.eliminar()).toThrow(GoneException);

    expect(usuariosService.crear).not.toHaveBeenCalled();
    expect(usuariosService.findByRol).not.toHaveBeenCalled();
    expect(usuariosService.obtenerPorId).not.toHaveBeenCalled();
    expect(usuariosService.counts).not.toHaveBeenCalled();
    expect(usuariosService.eliminar).not.toHaveBeenCalled();
  });
});
