import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateIngresoRapidoDto {
  @IsOptional()
  @IsString()
  concepto?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  monto?: number;
}
