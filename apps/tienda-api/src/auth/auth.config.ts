import { getJwtSecret } from '@app/seguridad';

export const JWT_TIENDA_EMISOR = 'tienda-api';
export const JWT_TIENDA_ACCESO = 'tienda-api:access';
export const JWT_TIENDA_SELECCION = 'tienda-api:selection';
export const JWT_TIENDA_ESTRATEGIA = 'jwt-tienda';

export function getTiendaJwtSecret(): string {
  const secret = process.env.TIENDA_JWT_SECRET;
  if (!secret?.trim()) {
    throw new Error('TIENDA_JWT_SECRET es obligatorio');
  }
  if (secret === getJwtSecret()) {
    throw new Error('TIENDA_JWT_SECRET debe ser distinto de JWT_SECRET de Gym');
  }
  return secret;
}
