import { IsBoolean, IsDateString, IsInt, IsNotEmpty } from 'class-validator';

export class CreateClientePlanDto {
  @IsNotEmpty()
  @IsInt()
  clienteId: number;

  @IsNotEmpty()
  @IsInt()
  planId: number;

  @IsNotEmpty()
  @IsDateString()
  fechaInicio: string;

  @IsNotEmpty()
  @IsDateString()
  fechaFin: string;

  @IsNotEmpty()
  @IsBoolean()
  activado: boolean;
}
