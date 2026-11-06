import { IsDateString, IsInt, IsNotEmpty } from 'class-validator';

export class CreateAsistenciaDto {
  @IsInt()
  @IsNotEmpty()
  clienteId: number;

  @IsDateString()
  @IsNotEmpty()
  fecha: string;
}
