import { PartialType } from '@nestjs/mapped-types';
import { CreateDeudaDto } from './create-deuda.dto';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
} from 'class-validator';

export class UpdateDeudaDto extends PartialType(CreateDeudaDto) {
  @IsOptional()
  @IsInt()
  @IsPositive()
  clientePlanId?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  monto?: number;

  @IsOptional()
  @IsBoolean()
  solventada?: boolean;
}
