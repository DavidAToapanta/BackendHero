import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getJwtSecret } from './jwt.config';

type VerificationOptions = Pick<
  ConstructorParameters<typeof Strategy>[0],
  'issuer' | 'audience' | 'algorithms'
> & { secretOrKey?: string };

type JwtStrategyConstructor<TPayload, TUser> = abstract new (
  options?: VerificationOptions,
) => Strategy & { validate(payload: TPayload): TUser | Promise<TUser> };

export function createJwtStrategyBase<TPayload = unknown, TUser = unknown>(
  name: string,
): JwtStrategyConstructor<TPayload, TUser> {
  abstract class NamedJwtStrategy extends PassportStrategy(Strategy, name) {
    constructor({
      secretOrKey = getJwtSecret(),
      ...options
    }: VerificationOptions = {}) {
      super({
        ...options,
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: false,
        secretOrKey,
      });
    }

    abstract validate(payload: TPayload): TUser | Promise<TUser>;
  }

  return NamedJwtStrategy;
}

export abstract class JwtStrategyBase<
  TPayload = unknown,
  TUser = unknown,
> extends createJwtStrategyBase('jwt') {
  abstract validate(payload: TPayload): TUser | Promise<TUser>;
}
