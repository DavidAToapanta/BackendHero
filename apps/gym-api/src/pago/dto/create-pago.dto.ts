import { IsDateString, IsInt, IsNotEmpty, IsPositive } from 'class-validator';

export class CreatePagoDto {
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  clientePlanId: number;

  @IsNotEmpty()
  @IsPositive()
  monto: number;

  @IsNotEmpty()
  @IsDateString()
  fecha: string;
}
