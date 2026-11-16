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
import {
  booleanoHttp,
  enteroHttp,
  PaginaTiendaDto,
  presente,
} from '../../comun/consulta-tienda.dto';

export {
  enteroHttp,
  presente,
  ProductoParamDto as ProductoCategoriaParamDto,
} from '../../comun/consulta-tienda.dto';

export class PaginacionCatalogoDto extends PaginaTiendaDto {
  @ValidateIf(presente)
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class ListaCategoriasDto extends PaginacionCatalogoDto {
  @Transform(booleanoHttp)
  @ValidateIf(presente)
  @IsBoolean()
  activo?: boolean;
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

export class AsignarCategoriaDto {
  @ValidateIf((_dto, valor: unknown) => valor !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  categoriaId: number | null;
}
