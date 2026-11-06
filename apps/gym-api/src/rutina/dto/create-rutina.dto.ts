import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsDateString,
  IsOptional,
} from 'class-validator';

export class CreateRutinaDto {
  @IsNotEmpty()
  @IsInt()
  clienteId: number;

  @IsNotEmpty()
  @IsString()
  rutina: string; // Base64 string del archivo PDF/imagen

  @IsNotEmpty()
  @IsDateString()
  fechaInicio: string;

  @IsNotEmpty()
  @IsDateString()
  fechaFin: string;

  @IsOptional()
  @IsString()
  observacion?: string;
}
