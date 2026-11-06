import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsDateString, IsInt, IsOptional } from 'class-validator';
import { CreateClientePlanDto } from './create-cliente-plan.dto';

export class UpdateClientePlanDto extends PartialType(CreateClientePlanDto) {
  @IsOptional()
  @IsInt()
  clienteId?: number;

  @IsOptional()
  @IsInt()
  planId?: number;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @IsOptional()
  @IsBoolean()
  activado?: boolean;
}
