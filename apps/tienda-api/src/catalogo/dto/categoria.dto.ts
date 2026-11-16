import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';

const presente = (_dto: object, valor: unknown) => valor !== undefined;
const enteroHttp = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;

export class ListaCategoriasDto {
  @ValidateIf(presente)
  @IsString()
  @MaxLength(120)
  q?: string;

  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @ValidateIf(presente)
  @IsBoolean()
  activo?: boolean;

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

export class CrearCategoriaDto {
  @Matches(/\S/)
  @MaxLength(120)
  nombre: string;
}

export class EditarCategoriaDto {
  @ValidateIf(presente)
  @Matches(/\S/)
  @MaxLength(120)
  nombre?: string;

  @ValidateIf(presente)
  @IsBoolean()
  activo?: boolean;
}

export class CategoriaParamDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  categoriaId: number;
}

export class ProductoCategoriaParamDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  productoId: number;
}

export class AsignarCategoriaDto {
  @ValidateIf((_dto, valor: unknown) => valor !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  categoriaId: number | null;
}
