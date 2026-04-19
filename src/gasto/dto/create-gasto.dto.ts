import { IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateGastoDto {
  @IsNotEmpty()
  descripcion: string;

  @IsNumber()
  @Min(0.01)
  monto: number;
}
