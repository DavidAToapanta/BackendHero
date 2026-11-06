import { JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';

export const ACCESS_TOKEN_EXPIRES_IN = '1d';
export const CONTEXT_SELECTION_TOKEN_EXPIRES_IN = '10m';

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'supersecret';
}

export function createJwtModuleOptions(
  signOptions?: JwtSignOptions,
): JwtModuleOptions {
  return {
    secret: getJwtSecret(),
    ...(signOptions ? { signOptions } : {}),
  };
}
