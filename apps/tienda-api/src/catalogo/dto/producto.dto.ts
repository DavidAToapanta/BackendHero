import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { UnidadVenta } from '@prisma/client';
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

class StockInicialDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  cantidad: number;

  @Matches(/^\d{1,14}(?:\.\d{1,4})?$/)
  costoUnitario: string;
}

export class CrearProductoDto {
  @ValidateIf(presente)
  @IsEnum(UnidadVenta)
  unidadVenta?: UnidadVenta;

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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRISMA_INT)
  stockMinimo?: number | null;

  @ValidateIf(presente)
  @IsBoolean()
  ivaTarifaCero?: boolean;

  @ValidateIf(presente)
  @IsObject()
  @ValidateNested()
  @Type(() => StockInicialDto)
  stockInicial?: StockInicialDto;
}

export class EditarProductoDto extends PartialType(
  OmitType(CrearProductoDto, ['stockInicial', 'unidadVenta']),
  {
    skipNullProperties: false,
  },
) {}

export class ImagenParamDto extends ProductoCategoriaParamDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  imagenId: number;
}

export class DatosArchivoImagenDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(0)
  @Max(MAX_PRISMA_INT)
  orden: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  textoAlternativo?: string | null;
}

export class CrearImagenDto extends DatosArchivoImagenDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsUrl({ protocols: ['https'], require_protocol: true, disallow_auth: true })
  @MaxLength(2048)
  url: string;
}

export class EditarImagenDto extends PartialType(CrearImagenDto, {
  skipNullProperties: false,
}) {}
