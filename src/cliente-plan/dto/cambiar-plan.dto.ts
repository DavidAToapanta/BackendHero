import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CambiarPlanDto {
  @IsNotEmpty()
  @IsInt()
  nuevoPlanId: number;

  @IsNotEmpty()
  @IsDateString()
  fechaInicio: string;

  @IsNotEmpty()
  @IsDateString()
  fechaFin: string;

  @IsNotEmpty()
  @IsInt()
  diaPago: number;

  @IsOptional()
  @IsString()
  motivo?: string;
}
