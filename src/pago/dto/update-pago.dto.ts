import { PartialType } from '@nestjs/mapped-types';
import { CreatePagoDto } from './create-pago.dto';
import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';

export class UpdatePagoDto extends PartialType(CreatePagoDto) {
  @IsOptional()
  @IsInt()
  @IsPositive()
  clientePlanId?: number;

  @IsOptional()
  @IsPositive()
  monto?: number;

  @IsOptional()
  @IsDateString()
  fecha?: string;
}
