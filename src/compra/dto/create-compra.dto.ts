import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';

class CompraDetalleDto {
  @IsInt()
  @IsNotEmpty()
  productoId: number;

  @IsInt()
  @IsNotEmpty()
  @Min(1)
  cantidad: number;
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
