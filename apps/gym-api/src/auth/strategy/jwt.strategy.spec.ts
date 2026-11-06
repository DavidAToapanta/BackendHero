import { GymJwtPayload } from '../auth.types';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy del gimnasio', () => {
  it('conserva exactamente los campos del usuario autenticado', () => {
    const strategy = new JwtStrategy();
    const payload: GymJwtPayload & { iat: number; exp: number; extra: string } =
      {
        sub: 12,
        email: 'prueba@example.invalid',
        userName: 'prueba',
        cedula: 'identificacion-prueba',
        rol: 'CLIENTE',
        clienteId: 42,
        tenantId: 7,
        tenantNombre: 'Gym de prueba',
        tenantRole: null,
        accessMode: 'ASISTENCIA',
        iat: 1,
        exp: 2,
        extra: 'no se expone',
      };

    expect(strategy.validate(payload)).toStrictEqual({
      sub: 12,
      email: 'prueba@example.invalid',
      userName: 'prueba',
      cedula: 'identificacion-prueba',
      rol: 'CLIENTE',
      clienteId: 42,
      tenantId: 7,
      tenantNombre: 'Gym de prueba',
      tenantRole: null,
      accessMode: 'ASISTENCIA',
    });
  });

  it('conserva los campos opcionales ausentes sin exigir claims nuevos', () => {
    expect(new JwtStrategy().validate({ sub: 12, rol: 'ADMIN' })).toStrictEqual(
      {
        sub: 12,
        email: undefined,
        userName: undefined,
        cedula: undefined,
        rol: 'ADMIN',
        clienteId: undefined,
        tenantId: undefined,
        tenantNombre: undefined,
        tenantRole: undefined,
        accessMode: undefined,
      },
    );
  });
});
