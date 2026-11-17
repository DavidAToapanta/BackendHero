import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../auth/auth.types';
import {
  PagoVentaDto,
  VentaMostradorDto,
} from '../ventas/dto/create-venta.dto';

export class ConfirmarPedidoDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  carritoId: number;
}

export class CancelarPedidoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  motivo: string;
}

export class EntregarPedidoDto extends VentaMostradorDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PagoVentaDto)
  pago?: PagoVentaDto;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  vencimiento?: string;
}
