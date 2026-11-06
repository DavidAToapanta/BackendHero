import { IsBoolean, IsInt, IsNumber, IsPositive } from 'class-validator';

export class CreateDeudaDto {
  @IsInt()
  @IsPositive()
  clientePlanId: number;

  @IsNumber()
  @IsPositive()
  monto: number;

  @IsBoolean()
  solventada: boolean;
}
