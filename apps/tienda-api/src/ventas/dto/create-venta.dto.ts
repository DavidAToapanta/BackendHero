import { MetodoCobro } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';

class LoteVentaDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  loteId: number;

  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  cantidad: number;
}

class LineaVentaDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  productoId: number;

  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  cantidad: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => LoteVentaDto)
  lotes: LoteVentaDto[];
}

class PagoVentaDto {
  @IsEnum(MetodoCobro)
  metodo: MetodoCobro;

  @IsString()
  @Matches(/^\d{1,16}(?:\.\d{1,16})?$/)
  monto: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  referencia?: string;
}

class VentaMostradorDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  turnoId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => LineaVentaDto)
  lineas: LineaVentaDto[];
}

export class CreateVentaDto extends VentaMostradorDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  clienteComercialId?: number;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PagoVentaDto)
  pago: PagoVentaDto;
}

export class CreateVentaCreditoDto extends VentaMostradorDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  clienteComercialId: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  vencimiento: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PagoVentaDto)
  pago?: PagoVentaDto;
}
