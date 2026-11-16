import { IdentidadService } from '@app/identidad';
import { MembresiasPersonalService } from '@app/negocios';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { JWT_TIENDA_EMISOR } from './auth.config';
import { AuthService } from './auth.service';

describe('AuthService de Tienda', () => {
  const verifyCredentials = jest.fn();
  const listarActivasPorModulo = jest.fn();
  const account = { id: 17 };
  const membresia = {
    id: 29,
    tenantId: 41,
    role: 'ADMIN',
    versionAutorizacion: 3,
    tenant: { nombre: 'Tienda Norte', autorizacionVersion: 'LEGACY' },
    asignacionRol_membresia: [],
  };
  let service: AuthService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: IdentidadService, useValue: { verifyCredentials } },
        {
          provide: MembresiasPersonalService,
          useValue: { listarActivasPorModulo },
        },
        {
          provide: JwtService,
          useValue: new JwtService({
            secret: 'tienda-unit-test',
            signOptions: { issuer: JWT_TIENDA_EMISOR },
          }),
        },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('recorta la cédula y conserva la contraseña al emitir el acceso directo', async () => {
    verifyCredentials.mockResolvedValue({ status: 'valid', account });
    listarActivasPorModulo.mockResolvedValue([membresia]);

    await expect(
      service.login({ cedula: ' 00123 ', password: ' secreta ' }),
    ).resolves.toMatchObject({
      requiresContextSelection: false,
      context: {
        usuarioId: 17,
        tenantId: 41,
        membresiaId: 29,
        versionAutorizacion: 3,
        modoAutorizacion: 'LEGACY',
        rolEfectivo: { codigo: 'ADMIN', nombre: 'ADMIN' },
      },
    });
    expect(verifyCredentials).toHaveBeenCalledWith('00123', ' secreta ');
    expect(listarActivasPorModulo).toHaveBeenCalledWith(17, 'STORE', undefined);
  });

  it.each(['invalid-password', 'account-not-found'])(
    'devuelve 401 con el mismo mensaje para %s',
    async (status) => {
      verifyCredentials.mockResolvedValue({ status });
      await expect(
        service.login({ cedula: '00123', password: 'clave' }),
      ).rejects.toMatchObject({
        status: 401,
        message: 'Credenciales inválidas',
      });
      expect(listarActivasPorModulo).not.toHaveBeenCalled();
    },
  );

  it('exige rol asignado en PERMISOS y devuelve 403 sin tiendas elegibles', async () => {
    verifyCredentials.mockResolvedValue({ status: 'valid', account });
    listarActivasPorModulo.mockResolvedValue([
      {
        ...membresia,
        tenant: { ...membresia.tenant, autorizacionVersion: 'PERMISOS' },
      },
    ]);
    await expect(
      service.login({ cedula: '00123', password: 'clave' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
