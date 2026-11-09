import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

class CompraLoteDto {
  @IsInt()
  @Min(1)
  loteId: number;

  @IsInt()
  @Min(1)
  cantidad: number;
}

class CompraDetalleDto {
  @IsInt()
  @IsNotEmpty()
  productoId: number;

  @IsInt()
  @IsNotEmpty()
  @Min(1)
  cantidad: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompraLoteDto)
  lotes?: CompraLoteDto[];
}

export class CreateCompraDto {
  @IsInt()
  @IsNotEmpty()
  clienteId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompraDetalleDto)
  detalles: CompraDetalleDto[];
}
