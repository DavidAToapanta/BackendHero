import { JwtService } from '@nestjs/jwt';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  CONTEXT_SELECTION_TOKEN_EXPIRES_IN,
  createJwtModuleOptions,
  getJwtSecret,
} from './jwt.config';

type DecodedToken = {
  sub: number;
  iat: number;
  exp?: number;
  tokenType?: string;
};

describe('configuracion JWT compartida', () => {
  const originalSecret = process.env.JWT_SECRET;
  const testSecret = 'clave-exclusiva-de-prueba';

  beforeEach(() => {
    process.env.JWT_SECRET = testSecret;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('resuelve el secreto al invocar la configuracion, sin almacenarlo en cache', () => {
    expect(getJwtSecret()).toBe(testSecret);
    process.env.JWT_SECRET = 'otra-clave-de-prueba';
    expect(getJwtSecret()).toBe('otra-clave-de-prueba');
  });

  it('conserva el fallback cuando no hay variable de entorno', () => {
    delete process.env.JWT_SECRET;
    expect(getJwtSecret()).toBe('supersecret');
  });

  it('conserva el fallback cuando la variable esta vacia', () => {
    process.env.JWT_SECRET = '';
    expect(getJwtSecret()).toBe('supersecret');
  });

  it('no introduce vencimiento de firma donde antes no estaba configurado', () => {
    const jwt = new JwtService(createJwtModuleOptions());
    const token = jwt.sign({ sub: 1 });
    expect(jwt.verify<DecodedToken>(token).exp).toBeUndefined();
  });

  it('mantiene acceso de un dia y compatibilidad en ambos sentidos con el emisor anterior', () => {
    const previous = new JwtService({
      secret: testSecret,
      signOptions: { expiresIn: '1d' },
    });
    const shared = new JwtService(
      createJwtModuleOptions({ expiresIn: ACCESS_TOKEN_EXPIRES_IN }),
    );
    const oldToken = previous.sign({ sub: 1 });
    const newToken = shared.sign({ sub: 2 });
    const oldPayload = shared.verify<DecodedToken>(oldToken);
    const newPayload = previous.verify<DecodedToken>(newToken);

    expect(oldPayload.sub).toBe(1);
    expect(newPayload.sub).toBe(2);
    expect(oldPayload.exp).toBe(oldPayload.iat + 86400);
    expect(newPayload.exp).toBe(newPayload.iat + 86400);
  });

  it('mantiene diez minutos para seleccionar contexto sobre el valor por defecto de acceso', () => {
    const jwt = new JwtService(
      createJwtModuleOptions({ expiresIn: ACCESS_TOKEN_EXPIRES_IN }),
    );
    const token = jwt.sign(
      { sub: 1, tokenType: 'CONTEXT_SELECTION' },
      { expiresIn: CONTEXT_SELECTION_TOKEN_EXPIRES_IN },
    );
    const payload = jwt.verify<DecodedToken>(token);

    expect(payload.tokenType).toBe('CONTEXT_SELECTION');
    expect(payload.exp).toBe(payload.iat + 600);
  });
});
