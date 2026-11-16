import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { ContextoTienda } from './auth.types';

describe('AuthController de Tienda', () => {
  it('delega el login y la selección y expone en sesión el contexto del guard', async () => {
    const login = jest.fn();
    const selectContext = jest.fn();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { login, selectContext } }],
    }).compile();
    const controller = module.get(AuthController);
    const credenciales = { cedula: '00234', password: 'clave' };
    const seleccion = { selectionToken: 'token', tenantId: 41 };
    const context: ContextoTienda = {
      usuarioId: 17,
      tenantId: 41,
      tenantNombre: 'Tienda Norte',
      membresiaId: 29,
      versionAutorizacion: 3,
      modoAutorizacion: 'LEGACY',
      rolEfectivo: { codigo: 'ADMIN', nombre: 'ADMIN' },
    };

    await controller.login(credenciales);
    await controller.selectContext(seleccion);
    expect(login).toHaveBeenCalledWith(credenciales);
    expect(selectContext).toHaveBeenCalledWith(seleccion);
    expect(controller.session(context)).toEqual({ context });
  });
});
