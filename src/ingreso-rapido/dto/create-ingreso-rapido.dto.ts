import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateIngresoRapidoDto {
  @IsNotEmpty()
  @IsString()
  concepto: string;

  @IsNumber()
  @Min(0.01)
  monto: number;
}
