import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AsistenciaService } from '../asistencia/asistencia.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const makePrisma = () => ({
  usuario: {
    findUnique: jest.fn(),
  },
  administrador: {
    findFirst: jest.fn(),
  },
  recepcionista: {
    findFirst: jest.fn(),
  },
  entrenador: {
    findFirst: jest.fn(),
  },
  cliente: {
    findFirst: jest.fn(),
  },
});

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof makePrisma>;
  let jwtService: { sign: jest.Mock };
  let asistenciaService: { registrarAsistencia: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    jwtService = {
      sign: jest.fn().mockReturnValue('token-falso'),
    };
    asistenciaService = {
      registrarAsistencia: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: AsistenciaService,
          useValue: asistenciaService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('bloquea login de cliente inactivo', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 10,
      cedula: '0102030405',
      userName: 'cliente.inactivo',
      password: 'hash',
    });
    prisma.administrador.findFirst.mockResolvedValue(null);
    prisma.recepcionista.findFirst.mockResolvedValue(null);
    prisma.entrenador.findFirst.mockResolvedValue(null);
    prisma.cliente.findFirst.mockResolvedValue({ id: 10, activo: false });

    jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

    await expect(service.login('0102030405', '1234')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(asistenciaService.registrarAsistencia).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('permite login de cliente activo y registra asistencia', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 20,
      cedula: '0998877665',
      userName: 'cliente.activo',
      password: 'hash',
    });
    prisma.administrador.findFirst.mockResolvedValue(null);
    prisma.recepcionista.findFirst.mockResolvedValue(null);
    prisma.entrenador.findFirst.mockResolvedValue(null);
    prisma.cliente.findFirst.mockResolvedValue({ id: 20, activo: true });

    jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

    const result = await service.login('0998877665', 'abcd');

    expect(asistenciaService.registrarAsistencia).toHaveBeenCalledWith(20);
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 20,
        rol: 'CLIENTE',
        clienteId: 20,
      }),
    );
    expect(result).toEqual({ access_token: 'token-falso' });
  });
});
