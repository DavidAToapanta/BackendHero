import { Transform } from 'class-transformer';
import { IsInt, Max, Min, ValidateIf } from 'class-validator';
import { MAX_PRISMA_INT } from '../auth/auth.types';

export const presente = (_dto: object, valor: unknown) => valor !== undefined;
export const enteroHttp = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
export const booleanoHttp = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class PaginaTiendaDto {
  @Transform(enteroHttp)
  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  pagina?: number;

  @Transform(enteroHttp)
  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(50)
  limite?: number;
}

export class ProductoParamDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  productoId: number;
}
