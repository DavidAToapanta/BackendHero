import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';
import {
  enteroHttp,
  ListaCategoriasDto,
  presente,
  ProductoCategoriaParamDto,
} from './categoria.dto';

export class ListaProductosDto extends ListaCategoriasDto {
  @Transform(enteroHttp)
  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  categoriaId?: number;
}

export class CodigoBarrasDto {
  @Matches(/\S/)
  @MaxLength(120)
  codigoBarras: string;
}

export class CrearProductoDto {
  @Matches(/\S/)
  @MaxLength(120)
  nombre: string;

  @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  precio: string;

  @ValidateIf(presente)
  @IsBoolean()
  estado?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  codigoBarras?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  presentacion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  marca?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string | null;
}

export class EditarProductoDto extends PartialType(CrearProductoDto, {
  skipNullProperties: false,
}) {}

export class ImagenParamDto extends ProductoCategoriaParamDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  imagenId: number;
}

export class CrearImagenDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsUrl({ protocols: ['https'], require_protocol: true, disallow_auth: true })
  @MaxLength(2048)
  url: string;

  @IsInt()
  @Min(0)
  @Max(MAX_PRISMA_INT)
  orden: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  textoAlternativo?: string | null;
}

export class EditarImagenDto extends PartialType(CrearImagenDto, {
  skipNullProperties: false,
}) {}
