import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class DevolverFacturaDto {
  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsString()
  motivo?: string;
}
