import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsObject,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../auth/auth.types';

class LineaCarritoDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  productoId: number;

  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  cantidad: number;
}

export class GuardarCarritoDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((linea: LineaCarritoDto | null) => linea?.productoId)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => LineaCarritoDto)
  lineas: LineaCarritoDto[];
}
